const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './api/.env' });

async function uploadInstaller() {
  const mongoUri = process.env.MONGODB_URI;
  const installerPath = path.join(__dirname, 'scanner-desktop', 'dist', 'DMS-Scanner-Setup.bat');

  console.log('Uploading installer to MongoDB...');

  if (!fs.existsSync(installerPath)) {
    console.error('Installer file not found:', installerPath);
    return;
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('dms');
    const installers = db.collection('installers');

    // Read the installer file
    const fileBuffer = fs.readFileSync(installerPath);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    console.log(`File size: ${fileBuffer.length} bytes`);
    console.log(`Checksum: ${checksum}`);

    // Check if this installer already exists
    const existing = await installers.findOne({ checksum });
    if (existing) {
      console.log('✅ Installer already exists in database');
      return;
    }

    // Deactivate previous installers
    await installers.updateMany(
      { platform: 'windows', isActive: true },
      { $set: { isActive: false } }
    );

    // Insert the new installer
    const installerDoc = {
      name: 'DMS-Scanner-Setup.exe',
      version: '1.0.0',
      platform: 'windows',
      fileSize: fileBuffer.length,
      mimeType: 'application/octet-stream',
      data: fileBuffer,
      checksum: checksum,
      uploadedBy: null,
      isActive: true,
      downloadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await installers.insertOne(installerDoc);
    console.log('✅ Installer uploaded successfully!');
    console.log('Installer ID:', result.insertedId);
    console.log('File size:', fileBuffer.length, 'bytes');

    // Verify it was uploaded
    const count = await installers.countDocuments({ isActive: true, platform: 'windows' });
    console.log(`Active installers in database: ${count}`);

  } catch (error) {
    console.error('❌ Upload failed:', error.message);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

uploadInstaller();