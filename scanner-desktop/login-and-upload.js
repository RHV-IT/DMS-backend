const axios = require('axios');

async function uploadInstaller() {
  try {
    console.log('Uploading installer (auth disabled for testing)...');

    const fs = require('fs');
    const path = require('path');
    const FormData = require('form-data');

    const installerPath = path.join(__dirname, 'dist', 'DMS-Scanner-Setup.bat');

    if (!fs.existsSync(installerPath)) {
      console.error('Installer file not found:', installerPath);
      return;
    }

    console.log('Found installer file, uploading...');

    const form = new FormData();
    form.append('installer', fs.createReadStream(installerPath), {
      filename: 'DMS-Scanner-Setup.exe',
      contentType: 'application/octet-stream'
    });
    form.append('version', '1.0.0');
    form.append('platform', 'windows');

    const uploadResponse = await axios.post('http://localhost:5000/api/v1/test-upload', form, {
      headers: {
        ...form.getHeaders()
        // Auth temporarily disabled
      }
    });

    console.log('Upload response:', uploadResponse.data);

    if (uploadResponse.data.success) {
      console.log('✅ Installer uploaded successfully!');
      console.log('Now test the download endpoint:');
      console.log('GET https://rhv-dms-backend.vercel.app/api/v1/scanner/auto-install-download');
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

uploadInstaller();