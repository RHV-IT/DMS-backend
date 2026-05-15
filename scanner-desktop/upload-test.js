const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function uploadTestInstaller() {
  try {
    // Use the real installer batch file
    const installerPath = path.join(__dirname, 'dist', 'DMS-Scanner-Setup.bat');

    if (!fs.existsSync(installerPath)) {
      console.log('Installer file not found at:', installerPath);
      return;
    }

    console.log('Found installer file:', installerPath);

    // Now upload it to the API
    const form = new FormData();
    form.append('installer', fs.createReadStream(installerPath), {
      filename: 'DMS-Scanner-Setup.exe',
      contentType: 'application/octet-stream'
    });
    form.append('version', '1.0.0');
    form.append('platform', 'windows');

    const response = await axios.post('https://rhv-dms-backend.vercel.app/api/v1/scanner/upload-installer', form, {
      headers: {
        ...form.getHeaders()
        // Temporarily disabled auth for testing
      }
    });

    console.log('Upload response:', response.data);

  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message);
  }
}

// Run if called directly
if (require.main === module) {
  uploadTestInstaller();
}

module.exports = { uploadTestInstaller };