const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'http://192.168.4.213:5000';
const TOKEN = process.argv[3];

if (!TOKEN) {
  console.log('\nUsage: node get-agent.js <server-url> <token>\n');
  console.log('Example:');
  console.log('  node get-agent.js http://192.168.4.213:5000 eyJhbGci...\n');
  return;
}

async function downloadAgent() {
  const files = [
    '/api/v1/scanner/agent-download',
    '/api/v1/scanner/setup-download', 
    '/api/v1/scanner/package-download'
  ];

  console.log('\nDownloading agent files...\n');

  for (const file of files) {
    const name = path.basename(file.replace('-download', '.js'));
    console.log(`Downloading ${name}...`);
    try {
      const res = await axios.get(BASE_URL + file, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      fs.writeFileSync(path.join(__dirname, name), res.data);
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}`);
    }
  }

  console.log('\nDone! Run:');
  console.log('  npm install');
  console.log('  node setup.js');
  console.log('  npm start\n');
}

downloadAgent();