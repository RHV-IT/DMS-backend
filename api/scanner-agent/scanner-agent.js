const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const chokidar = require('chokidar');

// Load config
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (err) {
  console.error('Error loading config.json:', err.message);
  process.exit(1);
}

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'https://rhv-dms-backend.vercel.app';
const SCAN_DIR = 'C:/Users/[YourUsername]/Documents/Scan'; // Update this path
const PENDING_API_URL = `${API_BASE_URL}/api/v1/scanner/pending`;
const SCANNER_TOKEN = config.token;
const UPLOAD_DELAY_MS = 2000;

console.log('Backend API:', API_BASE_URL);
console.log('Pending API:', PENDING_API_URL);

// Validate config
if (!SCANNER_TOKEN) {
  console.error('No token found in config.json. Please authenticate first.');
  process.exit(1);
}

// Ensure scan directory exists
if (!fs.existsSync(SCAN_DIR)) {
  console.error(`Scan directory does not exist: ${SCAN_DIR}`);
  console.error('Please create the directory or update SCAN_DIR in scanner-agent.js');
  process.exit(1);
}

// Helper: Send file to pending
const sendToPending = async (filePath) => {
  try {
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: getMimeType(fileName)
    });

    console.log(`Uploading: ${fileName}`);

    const response = await axios.post(PENDING_API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${SCANNER_TOKEN}`
      },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    if (response.data && response.data.success) {
      console.log(`✓ Uploaded: ${fileName}`);
      return true;
    } else {
      console.error(`✗ Failed: ${fileName}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ Error: ${path.basename(filePath)} - ${error.message}`);
    return false;
  }
};

// Helper: Get MIME type
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

// Initialize watcher
const watcher = chokidar.watch(SCAN_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
});

console.log(`Watching: ${SCAN_DIR}`);
console.log(`API: ${PENDING_API_URL}`);

watcher.on('add', (filePath) => {
  const fileName = path.basename(filePath);
  console.log(`File detected: ${fileName}`);

  setTimeout(async () => {
    if (fs.existsSync(filePath)) {
      const success = await sendToPending(filePath);
      if (success) {
        // File remains for confirmation
      }
    }
  }, UPLOAD_DELAY_MS);
});

watcher.on('ready', () => {
  console.log('Scanner agent is ready');
});