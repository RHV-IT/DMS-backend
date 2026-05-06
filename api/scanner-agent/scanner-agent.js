const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
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
const SCAN_DIR = path.join(os.homedir(), 'Documents', 'Scan');
const PENDING_API_URL = `${API_BASE_URL}/api/v1/scanner/pending`;
const CANCELLED_SCANS_PATH = path.join(__dirname, 'cancelled-scans.json');
const SCANNER_TOKEN = config.token;
const UPLOAD_DELAY_MS = 2000;

// Agent state
let pendingUploads = new Map();
let cancelledUploads = new Set();
let statusCheckInterval = null;

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
      console.log(`✓ Pending upload: ${fileName}`);

      // DO NOT delete file immediately - wait for confirmation
      // Add to pending uploads tracking
      const pendingId = response.data?.data?.id;
      if (pendingId) {
        pendingUploads.set(pendingId, {
          filePath,
          fileName,
          uploadedAt: new Date().toISOString(),
          machineId: 'unknown'
        });
      }

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

// Helper: Generate file hash
const getFileHash = (filePath, stats) => {
  return path.basename(filePath) + ':' + stats.size + ':' + stats.mtime.getTime();
};

// Helper: Load cancelled scans
const loadCancelledScans = () => {
  try {
    if (fs.existsSync(CANCELLED_SCANS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CANCELLED_SCANS_PATH, 'utf8'));
      return new Set(data.files || []);
    }
  } catch (err) {
    console.warn('Cancelled scans load error:', err.message);
  }
  return new Set();
};

// Helper: Save cancelled scans
const saveCancelledScans = (cancelledScans) => {
  try {
    fs.writeFileSync(CANCELLED_SCANS_PATH, JSON.stringify({
      files: Array.from(cancelledScans),
      lastUpdated: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    console.error('Cancelled scans save error:', err.message);
  }
};

// Helper: Start status checker
const startStatusChecker = () => {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  statusCheckInterval = setInterval(checkPendingStatus, 30000); // Check every 30 seconds
  console.log('Started pending status checker (30s interval)');
};

// Helper: Check pending status
const checkPendingStatus = async () => {
  if (!SCANNER_TOKEN || pendingUploads.size === 0) return;

  try {
    const pendingIds = Array.from(pendingUploads.keys());
    console.log(`Checking status of ${pendingIds.length} pending uploads`);

    for (const pendingId of pendingIds) {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/v1/scanner/pending/${pendingId}`, {
          headers: { Authorization: 'Bearer ' + SCANNER_TOKEN },
          timeout: 10000
        });

        if (response.data?.success && response.data?.data) {
          const pendingScan = response.data.data;
          const pendingData = pendingUploads.get(pendingId);

          if (pendingScan.status === 'confirmed') {
            console.log(`✓ Confirmed: ${pendingData.fileName} - deleting local file`);
            // Delete the local file
            if (fs.existsSync(pendingData.filePath)) {
              fs.unlinkSync(pendingData.filePath);
              console.log(`Deleted local file: ${pendingData.fileName}`);
            }
            // Remove from pending
            pendingUploads.delete(pendingId);

          } else if (pendingScan.status === 'cancelled') {
            console.log(`✗ Cancelled: ${pendingData.fileName} - keeping local file`);
            // Add to cancelled uploads to ignore permanently
            const fileHash = getFileHash(pendingData.filePath, fs.statSync(pendingData.filePath));
            cancelledUploads.add(fileHash);
            saveCancelledScans(cancelledUploads);
            // Remove from pending
            pendingUploads.delete(pendingId);
          }
          // If still pending, keep waiting
        }
      } catch (err) {
        // If 404, pending scan might be deleted - remove from tracking
        if (err.response?.status === 404) {
          console.log(`Pending scan ${pendingId} not found - removing from tracking`);
          pendingUploads.delete(pendingId);
        } else {
          console.warn(`Status check error for ${pendingId}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Status check failed:', err.message);
  }
};

// Load cancelled scans on startup
cancelledUploads = loadCancelledScans();

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

  try {
    const stats = fs.statSync(filePath);

    // Check if file is already in cancelled uploads
    const hash = getFileHash(filePath, stats);
    if (cancelledUploads.has(hash)) {
      console.log(`Ignored cancelled file: ${fileName}`);
      return;
    }

    // Check if file is already pending upload
    const isPending = Array.from(pendingUploads.values()).some(
      pending => pending.filePath === filePath
    );
    if (isPending) {
      console.log(`Already pending: ${fileName}`);
      return;
    }

    console.log(`File detected: ${fileName}`);

    setTimeout(async () => {
      if (fs.existsSync(filePath)) {
        const success = await sendToPending(filePath);
        if (success) {
          // File remains for confirmation
        }
      }
    }, UPLOAD_DELAY_MS);
  } catch (err) {
    console.error(`Error processing file ${fileName}:`, err.message);
  }
});

watcher.on('ready', () => {
  console.log('Scanner agent is ready');
  // Start periodic status checker
  startStatusChecker();
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  if (watcher) watcher.close();
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  process.exit(0);
});