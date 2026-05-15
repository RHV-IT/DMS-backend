const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function uploadInstallerDirectly() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dms';
  const installerPath = path.join(__dirname, 'dist', 'DMS-Scanner-Setup.bat');

  if (!fs.existsSync(installerPath)) {
    console.error('Installer file not found:', installerPath);
    return;
  }

  console.log('Connecting to MongoDB...');

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('dms');
    const installers = db.collection('installers');

    // Read the installer file
    const fileBuffer = fs.readFileSync(installerPath);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check if this installer already exists
    const existing = await installers.findOne({ checksum });
    if (existing) {
      console.log('Installer already exists in database');
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
      uploadedBy: null, // No user for direct upload
      isActive: true,
      downloadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await installers.insertOne(installerDoc);
    console.log('✅ Installer uploaded successfully!');
    console.log('Installer ID:', result.insertedId);
    console.log('File size:', fileBuffer.length, 'bytes');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

uploadInstallerDirectly();