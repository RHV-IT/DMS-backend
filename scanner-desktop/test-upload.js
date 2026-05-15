const fs = require('fs');
const path = require('path');

// Simple test to upload installer
async function testUpload() {
  const installerPath = path.join(__dirname, 'dist', 'DMS-Scanner-Setup-1.0.0.exe');

  if (!fs.existsSync(installerPath)) {
    console.log('Installer file not found');
    return;
  }

  const fileBuffer = fs.readFileSync(installerPath);
  const fileName = 'DMS-Scanner-Setup-1.0.0.exe';

  console.log('File size:', fileBuffer.length);
  console.log('File name:', fileName);

  // For testing, we'll manually upload this via API call
  // You would need to call the API endpoint with proper auth
}

testUpload();