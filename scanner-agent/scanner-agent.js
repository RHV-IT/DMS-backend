const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const chokidar = require('chokidar');
require('dotenv').config();

const SCAN_DIR = path.join(os.homedir(), 'Documents', 'Scan');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const PROCESSED_FILES_PATH = path.join(__dirname, 'processed-files.json');
const CANCELLED_SCANS_PATH = path.join(__dirname, 'cancelled-scans.json');
const LOG_PATH = path.join(__dirname, 'scanner.log');

const LOCAL_PORT = 4001;
const UPLOAD_DELAY_MS = 2000;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// Load API_BASE_URL from environment variables or config
let API_BASE = process.env.API_BASE_URL || 'https://rhv-dms-backend.vercel.app';
if (fs.existsSync(CONFIG_PATH)) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (config.apiBaseUrl) {
      API_BASE = config.apiBaseUrl;
    } else if (config.apiUrl) {
      // Backward compatibility: extract base URL from full apiUrl if present
      try {
        const urlObj = new URL(config.apiUrl);
        API_BASE = urlObj.origin;
      } catch (e) {
        console.warn('Could not parse apiUrl from config, using default');
      }
    }
  } catch (err) {
    console.warn('Invalid config.json, using default API');
  }
}

let authToken = null;

let agentConfig = {
  token: null,
  userId: null,
  userEmail: null,
  machineId: null,
  apiUrl: `${API_BASE}/api/v1/scanner/pending`,
  pendingUploads: new Map(),
  cancelledUploads: new Set()
};

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level}] ${message}`;
  fs.appendFileSync(LOG_PATH, entry + '\n');
  const colors = { INFO: '\x1b[36m', SUCCESS: '\x1b[32m', ERROR: '\x1b[31m', WARNING: '\x1b[33m' };
  console.log(`${colors[level] || ''}${entry}\x1b[0m`);
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

      // Handle both old and new config formats
      // New format from simple installer
      if (data.backendUrl) {
        agentConfig.apiUrl = `${data.backendUrl}/api/v1/scanner/pending`;
        agentConfig.token = data.token;
        agentConfig.userId = data.userId;
        agentConfig.userEmail = data.userEmail;
        agentConfig.machineId = data.machineId;
        authToken = data.token; // Set authToken for immediate use
        LOCAL_PORT = data.port || 4001;
      } else {
        // Old format compatibility
        agentConfig = {
          ...agentConfig,
          ...data
        };
        authToken = data.token; // Set authToken for old format too
      }

      // Reconstruct Map and Set objects properly
      agentConfig.pendingUploads = new Map(data.pendingUploads || []);
      agentConfig.cancelledUploads = new Set(data.cancelledUploads || []);

      // Generate machineId if not set
      if (!agentConfig.machineId) {
        agentConfig.machineId = `machine-${crypto.randomUUID().replace(/-/g, '').toLowerCase()}`;
        saveConfig(agentConfig);
      }

      // Load cancelled scans from separate file (for persistence across restarts)
      const persistentCancelled = loadCancelledScans();
      // Merge with config cancelled uploads
      agentConfig.cancelledUploads = new Set([...agentConfig.cancelledUploads, ...persistentCancelled]);

      // Validation logging
      console.log('cancelledUploads type:', agentConfig.cancelledUploads.constructor.name);
      console.log('pendingUploads type:', agentConfig.pendingUploads.constructor.name);

      return agentConfig;
    }
  } catch (err) { log('Config load error: ' + err.message, 'ERROR'); }
  return null;
}

function saveConfig(data) {
  try {
    const toSave = { ...agentConfig, ...data, savedAt: new Date().toISOString() };
    // Convert Map and Set to serializable format
    const serializedPending = Array.from(toSave.pendingUploads.entries());
    const serializedCancelled = Array.from(toSave.cancelledUploads);

    const configToSave = {
      ...toSave,
      pendingUploads: serializedPending,
      cancelledUploads: serializedCancelled
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configToSave, null, 2));

    // Update agentConfig with new data but keep Map and Set objects
    agentConfig = {
      ...toSave,
      pendingUploads: new Map(serializedPending),
      cancelledUploads: new Set(serializedCancelled)
    };

    return true;
  } catch (err) { log('Config save error: ' + err.message, 'ERROR'); return false; }
}

function loadProcessedFiles() {
  try {
    if (fs.existsSync(PROCESSED_FILES_PATH)) {
      return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILES_PATH, 'utf8')).files || []);
    }
  } catch (err) {}
  return new Set();
}

function saveProcessedFiles(files) {
  fs.writeFileSync(PROCESSED_FILES_PATH, JSON.stringify({ files: Array.from(files) }, null, 2));
}

function loadCancelledScans() {
  try {
    if (fs.existsSync(CANCELLED_SCANS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CANCELLED_SCANS_PATH, 'utf8'));
      return new Set(data.files || []);
    }
  } catch (err) {
    log('Cancelled scans load error: ' + err.message, 'WARNING');
  }
  return new Set();
}

function saveCancelledScans(cancelledScans) {
  try {
    fs.writeFileSync(CANCELLED_SCANS_PATH, JSON.stringify({
      files: Array.from(cancelledScans),
      lastUpdated: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    log('Cancelled scans save error: ' + err.message, 'ERROR');
  }
}

function getFileHash(filePath, stats) {
  return path.basename(filePath) + ':' + stats.size + ':' + stats.mtime.getTime();
}

function getMimeType(filename) {
  const mimes = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.tiff': 'image/tiff', '.bmp': 'image/bmp',
    '.gif': 'image/gif', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return mimes[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

function formatBytes(bytes) {
  if (!bytes) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

function ensureScanDir() {
  if (!fs.existsSync(SCAN_DIR)) {
    try {
      fs.mkdirSync(SCAN_DIR, { recursive: true });
      log('Created: ' + SCAN_DIR);
    } catch (err) {
      log('Failed to create: ' + err.message, 'ERROR');
      return false;
    }
  }
  return true;
}

async function uploadFile(filePath) {
  const fileName = path.basename(filePath);
  if (!authToken) {
    console.warn("Upload skipped: no token");
    return null;
  }
  try {
    const stats = fs.statSync(filePath);
    const sizeInBytes = stats.size;

    const displaySize = formatBytes(sizeInBytes);

    console.log(`Uploading with token: ${fileName} (${displaySize})`);
    console.log(`Actual size in bytes: ${sizeInBytes}`);

    if (sizeInBytes > MAX_SIZE) {
      console.warn(`File too large, skipped: ${fileName} (${displaySize})`);
      return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const machineId = agentConfig.machineId || os.hostname();
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName, contentType: getMimeType(fileName) });
    formData.append('machineId', machineId);
    formData.append('machineName', os.hostname());
    formData.append('hostname', os.hostname());
    formData.append('os', os.platform());
    formData.append('osVersion', os.release());
    log('Uploading: ' + fileName + ' (' + formatBytes(stats.size) + ') machineId=' + machineId);
    const response = await axios.post(`${API_BASE}/api/v1/scanner/pending`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${SCANNER_TOKEN}`,
        'x-machine-id': config.machineId || 'unknown',
        'x-machine-name': os.hostname(),
        'x-hostname': os.hostname(),
        'x-platform': os.platform(),
        'x-source': 'scanner-agent'
      },
      timeout: 60000, maxContentLength: Infinity, maxBodyLength: Infinity
    });

    if (response.status === 200 || response.status === 201 || response.data?.success) {
      console.log(`Upload successful: ${fileName}`);
      log(`Pending upload: ${fileName}`);

      // DO NOT delete file immediately - wait for confirmation
      // Add to pending uploads tracking
      const pendingId = response.data?.data?.id;
      if (pendingId) {
        agentConfig.pendingUploads.set(pendingId, {
          filePath,
          fileName,
          uploadedAt: new Date().toISOString(),
          machineId: agentConfig.machineId
        });
        saveConfig(agentConfig);
      }

      return { success: true, data: response.data?.data, filePath: filePath };
    } else {
      console.warn(`Upload response not OK: ${fileName}`, response.status);
      return null;
    }
  } catch (err) {
    console.error(`Upload error: ${fileName}`, err.response?.data || err.message);
    return null;
  }
}

async function processFile(filePath) {
  try {
    const stats = fs.lstatSync(filePath);
    if (stats.isDirectory()) return;
    const fileName = path.basename(filePath);
    if (fileName.startsWith('~') || fileName.startsWith('.') || fileName.endsWith('.tmp')) return;
    if (stats.size > MAX_FILE_SIZE) {
      log('Skipped (too large): ' + fileName, 'WARNING');
      return;
    }

    // Check if file is already in cancelled uploads
    const hash = getFileHash(filePath, stats);

    // Ensure cancelledUploads is a Set
    if (!(agentConfig.cancelledUploads instanceof Set)) {
      log('ERROR: cancelledUploads is not a Set, reinitializing', 'ERROR');
      agentConfig.cancelledUploads = new Set();
    }

    if (agentConfig.cancelledUploads.has(hash)) {
      log(`Ignored cancelled file: ${fileName}`);
      return;
    }

    // Check if file is already pending upload
    const isPending = Array.from(agentConfig.pendingUploads.values()).some(
      pending => pending.filePath === filePath
    );
    if (isPending) {
      log(`Already pending: ${fileName}`);
      return;
    }

    const processed = loadProcessedFiles();
    if (processed.has(hash)) return;
    log('Detected: ' + fileName);

    const attemptUpload = async () => {
      if (!authToken) {
        const retryDelay = Math.floor(Math.random() * 3000) + 2000;
        log(`No token - retrying in ${(retryDelay / 1000).toFixed(1)}s: ${fileName}`, 'WARNING');
        setTimeout(attemptUpload, retryDelay);
        return;
      }
      if (!fs.existsSync(filePath)) {
        log('File gone: ' + fileName, 'WARNING');
        return;
      }
      const result = await uploadFile(filePath);
      if (result?.success) {
        processed.add(hash);
        saveProcessedFiles(processed);
      }
    };

    setTimeout(attemptUpload, UPLOAD_DELAY_MS);
  } catch (err) {
    log('Process error: ' + err.message, 'ERROR');
  }
}

let watcher = null;

function startWatcher() {
  if (!ensureScanDir()) return;
  if (watcher) watcher.close();
  log('========================================');
  log('Scanner Agent Started');
  log('========================================');
  log('Scan folder: ' + SCAN_DIR);
  log('API: ' + API_BASE);
  log('User: ' + (agentConfig.userEmail || agentConfig.userId || 'not authenticated'));
  log('========================================');
  watcher = chokidar.watch(SCAN_DIR, {
    ignored: [/[\/\\]\../, /.*~$/, /\.tmp$/i, /^\.DS_Store$/, /^Thumbs\.db$/i],
    persistent: true, depth: 1, ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 100 }
  });
  watcher.on('add', (filePath) => {
    log('File detected: ' + path.basename(filePath));
    processFile(filePath);
  });
  watcher.on('error', (err) => log('Watcher error: ' + err.message, 'ERROR'));
  watcher.on('ready', () => {
    log('Watching for scans...');
    // Start periodic status checker
    startStatusChecker();
  });
}

let statusCheckInterval = null;

function startStatusChecker() {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  statusCheckInterval = setInterval(checkPendingStatus, 30000); // Check every 30 seconds
  log('Started pending status checker (30s interval)');
}

async function checkPendingStatus() {
  if (!authToken || agentConfig.pendingUploads.size === 0) return;

  try {
    const pendingIds = Array.from(agentConfig.pendingUploads.keys());
    log(`Checking status of ${pendingIds.length} pending uploads`);

    for (const pendingId of pendingIds) {
      try {
        const response = await axios.get(`${API_BASE}/api/v1/scanner/pending/${pendingId}`, {
          headers: { Authorization: 'Bearer ' + authToken },
          timeout: 10000
        });

        if (response.data?.success && response.data?.data) {
          const pendingScan = response.data.data;
          const pendingData = agentConfig.pendingUploads.get(pendingId);

          if (pendingScan.status === 'confirmed') {
            log(`Confirmed: ${pendingData.fileName} - deleting local file`);
            // Delete the local file
            if (fs.existsSync(pendingData.filePath)) {
              fs.unlinkSync(pendingData.filePath);
              log(`Deleted local file: ${pendingData.fileName}`);
            }
            // Remove from pending
            agentConfig.pendingUploads.delete(pendingId);
            saveConfig(agentConfig);

          } else if (pendingScan.status === 'cancelled') {
            log(`Cancelled: ${pendingData.fileName} - keeping local file`);
            // Add to cancelled uploads to ignore permanently
            const fileHash = getFileHash(pendingData.filePath, fs.statSync(pendingData.filePath));
            agentConfig.cancelledUploads.add(fileHash);
            saveCancelledScans(agentConfig.cancelledUploads);
            // Remove from pending
            agentConfig.pendingUploads.delete(pendingId);
            saveConfig(agentConfig);
          }
          // If still pending, keep waiting
        }
      } catch (err) {
        // If 404, pending scan might be deleted - remove from tracking
        if (err.response?.status === 404) {
          log(`Pending scan ${pendingId} not found - removing from tracking`);
          agentConfig.pendingUploads.delete(pendingId);
          saveConfig(agentConfig);
        } else {
          log(`Status check error for ${pendingId}: ${err.message}`, 'WARNING');
        }
      }
    }
  } catch (err) {
    log(`Status check failed: ${err.message}`, 'ERROR');
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  });
  res.end(JSON.stringify(data));
}

function handleOptions(req, res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost:' + LOCAL_PORT);
  const pathname = url.pathname;

  try {
    if (req.method === 'OPTIONS') {
      return handleOptions(req, res);
    }
    if (pathname === '/set-token' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.token) return sendJson(res, 400, { success: false, message: 'Token required' });
      authToken = body.token;
      log('Token received', 'SUCCESS');
      saveConfig({
        token: body.token,
        userId: body.userId,
        userEmail: body.userEmail,
        apiBaseUrl: API_BASE
      });
      log('Authenticated as ' + (body.userEmail || agentConfig.userEmail || 'user'), 'SUCCESS');
      return sendJson(res, 200, { success: true, message: 'Token set', userId: agentConfig.userId });
    }
    if (pathname === '/delete-file' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.filePath) return sendJson(res, 400, { success: false, message: 'filePath required' });
      let fileToDelete = path.isAbsolute(body.filePath) ? body.filePath : path.join(SCAN_DIR, body.filePath);
      try {
        if (fs.existsSync(fileToDelete)) {
          fs.unlinkSync(fileToDelete);
          log('Deleted: ' + path.basename(fileToDelete), 'SUCCESS');
          return sendJson(res, 200, { success: true, message: 'File deleted', filePath: fileToDelete });
        }
        return sendJson(res, 404, { success: false, message: 'File not found' });
      } catch (err) {
        log('Delete error: ' + err.message, 'ERROR');
        return sendJson(res, 500, { success: false, message: err.message });
      }
    }
    if (pathname === '/status' && req.method === 'GET') {
      return sendJson(res, 200, {
        running: true,
        userId: agentConfig.userId,
        userEmail: agentConfig.userEmail,
        apiUrl: API_BASE,
        scanPath: SCAN_DIR,
        hasToken: !!agentConfig.token
      });
    }
    if (pathname === '/health' && req.method === 'GET') return sendJson(res, 200, { status: 'ok' });
    sendJson(res, 404, { success: false, message: 'Not found' });
  } catch (err) {
    log('Request error: ' + err.message, 'ERROR');
    sendJson(res, 500, { success: false, message: err.message });
  }
}

function startLocalServer() {
  const server = http.createServer(handleRequest);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') log('Port ' + LOCAL_PORT + ' in use', 'WARNING');
  });
  server.listen(LOCAL_PORT, '127.0.0.1', () => log('Local server on http://localhost:' + LOCAL_PORT));
}

function validateDependencies() {
  const required = ['axios', 'chokidar', 'form-data'];
  for (const dep of required) {
    try {
      require.resolve(dep);
    } catch (err) {
      console.error(`Missing dependency: ${dep}`);
      console.error('Run: npm install');
      process.exit(1);
    }
  }
  // Check for crypto.randomUUID support
  if (typeof crypto?.randomUUID !== 'function') {
    console.error('Node.js version too old. crypto.randomUUID() not supported.');
    console.error('Requires Node.js v14.17.0+ (preferably v24+)');
    process.exit(1);
  }
}

function main() {
  validateDependencies();
  loadConfig();
  console.log(`[INFO] Backend API: ${API_BASE}`);
  console.log(`[INFO] Pending API: ${API_BASE}/api/v1/scanner/pending`);
  startLocalServer();
  startWatcher();
  process.on('SIGINT', () => {
    log('Shutting down...');
    if (watcher) watcher.close();
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = { main, loadConfig };
