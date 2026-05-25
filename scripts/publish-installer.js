#!/usr/bin/env node
/**
 * RHV DMS - Production Installer Publisher
 * 
 * Uploads the pre-built Electron installer to Vercel Blob
 * and updates the auto-download redirect configuration.
 * 
 * Usage:
 *   node scripts/publish-installer.js
 * 
 * Requirements:
 *   - BLOB_READ_WRITE_TOKEN in api/.env or environment
 *   - Built installer in scanner-desktop/dist/
 */

const fs = require('fs');
const path = require('path');

// Load environment variables (prefer api/.env for consistency with backend)
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
require('dotenv').config(); // fallback

const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!BLOB_READ_WRITE_TOKEN) {
  console.error('❌ ERROR: BLOB_READ_WRITE_TOKEN is not set.');
  console.error('   Add it to api/.env or export it in your shell.');
  process.exit(1);
}

// Resolve @vercel/blob from the api dependencies (works when running from project root)
let put;
try {
  const blobPath = path.join(__dirname, '../api/node_modules/@vercel/blob');
  ({ put } = require(blobPath));
} catch (e) {
  console.error('❌ Failed to load @vercel/blob package.');
  console.error('   Make sure you have run "npm install" inside the api/ directory.');
  process.exit(1);
}

/**
 * Intelligently locate the latest Electron installer
 */
function findInstallerExecutable() {
  const searchLocations = [
    // Most common location (when running from project root)
    path.join(__dirname, '../scanner-desktop/dist/RHV Scanner Agent Setup 1.0.0.exe'),
    path.join(process.cwd(), 'scanner-desktop/dist/RHV Scanner Agent Setup 1.0.0.exe'),
    // If someone runs the script from inside api/
    path.join(__dirname, '../../scanner-desktop/dist/RHV Scanner Agent Setup 1.0.0.exe'),
  ];

  // Check explicit locations first
  for (const location of searchLocations) {
    if (fs.existsSync(location)) {
      return location;
    }
  }

  // Smart discovery: find the newest matching .exe in any dist folder
  const distCandidates = [
    path.join(__dirname, '../scanner-desktop/dist'),
    path.join(process.cwd(), 'scanner-desktop/dist'),
    path.join(__dirname, '../../scanner-desktop/dist'),
  ];

  for (const distDir of distCandidates) {
    if (!fs.existsSync(distDir)) continue;

    try {
      const files = fs.readdirSync(distDir)
        .filter(filename => 
          filename.endsWith('.exe') && 
          (filename.toLowerCase().includes('rhv') || 
           filename.toLowerCase().includes('scanner') ||
           filename.toLowerCase().includes('setup'))
        )
        .map(filename => {
          const fullPath = path.join(distDir, filename);
          return {
            path: fullPath,
            name: filename,
            mtime: fs.statSync(fullPath).mtimeMs
          };
        })
        .sort((a, b) => b.mtime - a.mtime); // newest first

      if (files.length > 0) {
        return files[0].path;
      }
    } catch (err) {
      // Ignore permission errors etc.
    }
  }

  return null;
}

async function publishInstaller() {
  console.log('\n🚀 RHV DMS Scanner Installer Publisher');
  console.log('=======================================\n');

  const installerPath = findInstallerExecutable();

  if (!installerPath) {
    console.error('❌ No installer executable found.');
    console.error('\nExpected location:');
    console.error('  scanner-desktop/dist/RHV Scanner Agent Setup 1.0.0.exe');
    console.error('\nPlease build the Electron desktop app first:');
    console.error('  cd scanner-desktop && npm run build:win');
    process.exit(1);
  }

  const stats = fs.statSync(installerPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log('📦 Installer found:');
  console.log(`   File: ${path.basename(installerPath)}`);
  console.log(`   Size: ${sizeMB} MB`);
  console.log(`   Path: ${installerPath}\n`);

  console.log('☁️  Uploading to Vercel Blob Storage...');

  try {
    const fileBuffer = fs.readFileSync(installerPath);

    // Use stable filename so old versions are automatically replaced
    const blobResult = await put('RHV-DMS-Scanner-Setup.exe', fileBuffer, {
      access: 'public',
      token: BLOB_READ_WRITE_TOKEN,
      contentType: 'application/octet-stream',
      // Vercel Blob will overwrite when the same pathname is used
    });

    console.log('✅ Upload completed successfully!\n');
    console.log(`   Public URL: ${blobResult.url}`);
    console.log(`   Download URL (permanent): ${blobResult.downloadUrl || blobResult.url}\n`);

    // Persist the URL for the redirect endpoint
    const configPath = path.join(__dirname, '../api/config/installer.json');
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const config = {
      installerUrl: blobResult.url,
      updatedAt: new Date().toISOString(),
      fileName: 'RHV-DMS-Scanner-Setup.exe',
      originalSource: path.basename(installerPath),
      size: stats.size,
      sizeMB: parseFloat(sizeMB)
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('📝 Configuration updated:');
    console.log(`   ${path.relative(process.cwd(), configPath)}\n`);

    console.log('🌍 The installer is now globally available at:');
    console.log('   https://rhv-dms-backend.vercel.app/api/v1/scanner/auto-install-download\n');
    console.log('✅ Publish complete. No rebuild required for future updates.\n');

  } catch (error) {
    console.error('\n❌ Upload failed:');
    console.error(error.message);
    if (error.message.includes('token')) {
      console.error('\nHint: Make sure BLOB_READ_WRITE_TOKEN is valid and has write permissions.');
    }
    process.exit(1);
  }
}

// Run
publishInstaller().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
