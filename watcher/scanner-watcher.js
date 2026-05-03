const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const chokidar = require('chokidar');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Configuration
const SCAN_DIR = process.env.SCAN_DIR || 'C:/Users/user/Documents/Scan';
const PENDING_API_URL = process.env.PENDING_API_URL || 'https://rhv-dms-backend.vercel.app/api/v1/scanner/pending';
const SCANNER_TOKEN = process.env.SCANNER_TOKEN;
const UPLOAD_DELAY_MS = parseInt(process.env.UPLOAD_DELAY_MS) || 2000; // Fixed 2-second delay

// Validate required config
if (!SCANNER_TOKEN) {
  console.error('ERROR: SCANNER_TOKEN environment variable is required');
  console.error('Set it in a .env file or environment: SCANNER_TOKEN=your-jwt-token');
  console.error('\nTo generate a token, run: node setup-scanner-account.js');
  process.exit(1);
}

// Ensure scan directory exists
if (!fs.existsSync(SCAN_DIR)) {
  console.error(`ERROR: Scan directory does not exist: ${SCAN_DIR}`);
  process.exit(1);
}

console.log(`PENDING MODE: Files will be sent to pending for confirmation`);
console.log(`Files will remain in: ${SCAN_DIR}`);

let isUploading = false;

// Helper: Fixed delay (2 seconds)
const getDelay = () => UPLOAD_DELAY_MS;

// Helper: Send file to pending endpoint
const sendToPending = async (filePath) => {
  try {
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);

    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: getMimeType(fileName)
    });

    console.log(`Sending to pending: ${fileName} (${formatBytes(fileStats.size)})`);

    const response = await axios.post(PENDING_API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${SCANNER_TOKEN}`
      },
      timeout: 30000
    });

    if (response.data && response.data.success) {
      console.log(`\x1b[32m✓ Sent to pending:\x1b[0m ${fileName} (ID: ${response.data.data?.id || 'pending'})`);
      return true;
    } else {
      console.error(`\x1b[31m✗ Failed:\x1b[0m ${fileName} - ${response.data?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    console.error(`\x1b[31m✗ Error:\x1b[0m ${path.basename(filePath)} - ${errMsg}`);
    return false;
  }
};

// Helper: Determine MIME type from extension
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

// Helper: Format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper: Debug token payload (helps verify token structure)
const debugToken = () => {
  try {
    const decoded = jwt.decode(SCANNER_TOKEN);
    console.log('\x1b[90m├─ Token decoded:\x1b[0m');
    console.log(`\x1b[90m│  Subject: ${decoded?.sub || decoded?.id}\x1b[0m`);
    console.log(`\x1b[90m│  Email: ${decoded?.email}\x1b[0m`);
    console.log(`\x1b[90m│  Role: ${decoded?.role}\x1b[0m`);
    console.log(`\x1b[90m│  Expires: ${decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : 'N/A'}\x1b[0m`);
  } catch (e) {
    console.error('⚠ Could not decode token - it may be invalid');
  }
};

// Initialize watcher
const initWatcher = () => {
  console.log('\x1b[36m╔═══════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║   Scanner File Watcher (Pending)   ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════╝\x1b[0m');
  console.log(`Scan directory:     ${SCAN_DIR}`);
  console.log(`API endpoint:       ${PENDING_API_URL}`);
  console.log(`Delay before send:  ${UPLOAD_DELAY_MS}ms`);
  console.log(`File handling:      📁 KEEP in scan folder (pending confirmation)`);
  console.log('\x1b[90m─────────────────────────────────────\x1b[0m');
  debugToken();
  console.log('\x1b[33m Waiting for scanned files...\x1b[0m\n');

  const watcher = chokidar.watch(SCAN_DIR, {
    ignored: [
      /(^|[\/\\])\../,      // dotfiles and dot directories
      /.*~$/,               // Files ending with ~
      /\.tmp$/i,            // .tmp files
      /^\.DS_Store$/,       // macOS metadata
      /^Thumbs\.db$/i       // Windows thumbnails
    ],
    persistent: true,
    depth: 1,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,  // Wait 2s after file change (matches our delay)
      pollInterval: 100
    }
  });

  watcher
    .on('add', async (filePath) => {
      try {
        // Skip if it's a directory
        const stats = fs.lstatSync(filePath);
        if (stats.isDirectory()) return;
        
        const fileName = path.basename(filePath);
        
        // Skip obvious temp files
        if (fileName.startsWith('~') || fileName.startsWith('.') || fileName.endsWith('.tmp')) {
          console.log(`\x1b[90mSkipped temp file:\x1b[0m ${fileName}`);
          return;
        }

        console.log(`\x1b[33mFile detected:\x1b[0m ${fileName} (${formatBytes(stats.size)})`);

        // Fixed 2-second delay to ensure file is fully written
        console.log(`Waiting ${UPLOAD_DELAY_MS}ms before sending to pending...`);

        setTimeout(async () => {
          // Double-check file still exists
          if (!fs.existsSync(filePath)) {
            console.log(`File no longer exists: ${fileName} - skipping`);
            return;
          }

          const success = await sendToPending(filePath);
          
          if (!success) {
            console.error(`\x1b[31mFailed to send to pending, file remains in place:\x1b[0m ${fileName}`);
          }
          // Note: File is NOT deleted or moved — stays in scan folder for manual confirmation
        }, UPLOAD_DELAY_MS);
      } catch (err) {
        console.error(`Error processing file: ${err.message}`);
      }
    })
    .on('error', (error) => {
      console.error(`Watcher error: ${error.message}`);
    })
    .on('ready', () => {
      console.log('\x1b[32mWatcher is ready and actively monitoring\x1b[0m');
      console.log(`Watching: ${SCAN_DIR}`);
      console.log('Files will remain in scan folder until manually confirmed in web app');
      console.log('----------------------------------------\n');
    });
};

// Start the watcher
initWatcher();
