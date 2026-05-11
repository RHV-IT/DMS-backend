const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const chokidar = require('chokidar');
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_BASE_URL = 'https://rhv-dms-backend.vercel.app';
const SCAN_DIR = path.join(os.homedir(), 'Documents', 'Scan');
const CONFIG_DIR = path.join(os.homedir(), 'Documents', 'RHV-DMS-Scanner');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CANCELLED_SCANS_PATH = path.join(CONFIG_DIR, 'cancelled-scans.json');
const LOCAL_PORT = 4001;

// Global variables
let tray = null;
let mainWindow = null;
let server = null;
let watcher = null;
let statusCheckInterval = null;
let pendingUploads = new Map();
let cancelledUploads = new Set();
let machineId = null;

// Initialize directories and config
function initializeApp() {
  // Create directories
  if (!fs.existsSync(SCAN_DIR)) {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Generate or load machine ID
  machineId = loadOrGenerateMachineId();

  // Load cancelled scans
  cancelledUploads = loadCancelledScans();

  console.log('RHV DMS Scanner initialized');
  console.log('Scan directory:', SCAN_DIR);
  console.log('Config directory:', CONFIG_DIR);
  console.log('Machine ID:', machineId);
}

// Generate or load machine ID
function loadOrGenerateMachineId() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.machineId) {
        return config.machineId;
      }
    }
  } catch (err) {
    console.warn('Error loading config:', err.message);
  }

  // Generate new machine ID
  const newMachineId = `machine-${uuidv4()}`;

  // Save to config
  const config = {
    machineId: newMachineId,
    apiUrl: API_BASE_URL,
    installedAt: new Date().toISOString(),
    version: app.getVersion()
  };

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config:', err.message);
  }

  return newMachineId;
}

// Load cancelled scans
function loadCancelledScans() {
  try {
    if (fs.existsSync(CANCELLED_SCANS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CANCELLED_SCANS_PATH, 'utf8'));
      return new Set(data.files || []);
    }
  } catch (err) {
    console.warn('Cancelled scans load error:', err.message);
  }
  return new Set();
}

// Save cancelled scans
function saveCancelledScans(cancelledScans) {
  try {
    fs.writeFileSync(CANCELLED_SCANS_PATH, JSON.stringify({
      files: Array.from(cancelledScans),
      lastUpdated: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    console.error('Cancelled scans save error:', err.message);
  }
}

// Start local API server
function startLocalServer() {
  const expressApp = express();
  expressApp.use(express.json());

  expressApp.use(cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://rhv-dms-frontend.vercel.app",
      /^https:\/\/.*\.vercel\.app$/,
      /^http:\/\/192\.168\.\d+\.\d+:3000$/
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  }));

  expressApp.options("*", cors());

  // Health endpoint
  expressApp.get('/health', (req, res) => {
    res.json({
      installed: true,
      running: true,
      version: app.getVersion(),
      machineId: machineId,
      scanDirectory: SCAN_DIR,
      pendingUploads: pendingUploads.size,
      timestamp: new Date().toISOString()
    });
  });

  // Set token endpoint (for configuration)
  expressApp.post('/set-token', (req, res) => {
    try {
      const { token, userId, userEmail, userName } = req.body;

      if (!token || !userId || !userEmail) {
        return res.status(400).json({ success: false, message: 'Token, userId, and userEmail are required' });
      }

      // Save token to config
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config.token = token;
      config.userId = userId;
      config.userEmail = userEmail;
      config.userName = userName;
      config.configuredAt = new Date().toISOString();

      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

      res.json({
        success: true,
        message: 'Token set successfully',
        machineId: machineId
      });
    } catch (error) {
      console.error('Set token error:', error);
      res.status(500).json({ success: false, message: 'Failed to set token' });
    }
  });

  // Get config endpoint
  expressApp.get('/config', (req, res) => {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      res.json({
        success: true,
        config: {
          machineId: config.machineId,
          apiUrl: config.apiUrl,
          configuredAt: config.configuredAt,
          hasToken: !!config.token,
          version: config.version
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load config' });
    }
  });

  // Get status endpoint
  expressApp.get('/status', (req, res) => {
    res.json({
      running: true,
      machineId,
      scanDirectory: SCAN_DIR,
      pendingUploads: pendingUploads.size,
      version: app.getVersion(),
      apiUrl: API_BASE_URL
    });
  });

  server = expressApp.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log(`Local API server running on http://localhost:${LOCAL_PORT}`);
  });
}

// Stop local server
function stopLocalServer() {
  if (server) {
    server.close();
    server = null;
    console.log('Local API server stopped');
  }
}

// Register machine with backend
async function registerMachine() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    if (!config.token) {
      console.log('No token configured, skipping machine registration');
      return;
    }

    const response = await axios.post(`${API_BASE_URL}/api/v1/scanner/register-machine`, {
      machineId: machineId,
      machineName: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      userName: config.userName || 'Unknown',
      userEmail: config.userEmail || 'unknown@rhv.local'
    }, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data.success) {
      console.log('Machine registered successfully');
    }
  } catch (error) {
    console.warn('Machine registration failed:', error.message);
  }
}

// Send file to pending
async function sendToPending(filePath) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    if (!config.token) {
      console.log('No token configured, skipping upload');
      return false;
    }

    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: getMimeType(fileName)
    });

    console.log(`Uploading: ${fileName}`);

    const response = await axios.post(`${API_BASE_URL}/api/v1/scanner/pending`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${config.token}`,
        'x-machine-id': machineId,
        'x-machine-name': os.hostname(),
        'x-hostname': os.hostname(),
        'x-platform': os.platform(),
        'x-source': 'desktop-scanner'
      },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    if (response.data && response.data.success) {
      console.log(`✓ Pending upload: ${fileName}`);

      // Add to pending uploads tracking
      const pendingId = response.data?.data?.id;
      if (pendingId) {
        pendingUploads.set(pendingId, {
          filePath,
          fileName,
          uploadedAt: new Date().toISOString(),
          machineId: machineId
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
}

// Get MIME type
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Get file hash
function getFileHash(filePath, stats) {
  return path.basename(filePath) + ':' + stats.size + ':' + stats.mtime.getTime();
}

// Start status checker
function startStatusChecker() {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  statusCheckInterval = setInterval(checkPendingStatus, 30000); // Check every 30 seconds
  console.log('Started pending status checker (30s interval)');
}

// Check pending status
async function checkPendingStatus() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    if (!config.token || pendingUploads.size === 0) return;

    const pendingIds = Array.from(pendingUploads.keys());
    console.log(`Checking status of ${pendingIds.length} pending uploads`);

    for (const pendingId of pendingIds) {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/v1/scanner/pending/${pendingId}`, {
          headers: { Authorization: 'Bearer ' + config.token },
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
}

// Initialize file watcher
function initializeWatcher() {
  watcher = chokidar.watch(SCAN_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
  });

  console.log(`Watching scan directory: ${SCAN_DIR}`);

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

      // Upload after delay
      setTimeout(async () => {
        if (fs.existsSync(filePath)) {
          const success = await sendToPending(filePath);
          if (success) {
            // File uploaded successfully, keep for confirmation
          }
        }
      }, 2000);

    } catch (err) {
      console.error(`Error processing file ${fileName}:`, err.message);
    }
  });

  watcher.on('ready', () => {
    console.log('File watcher is ready');
    startStatusChecker();
  });
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png'); // We'll create this
  let icon = null;

  // Try different icon formats
  const iconFormats = ['icon.png', 'icon.ico', 'tray-icon.png'];
  for (const format of iconFormats) {
    const testPath = path.join(__dirname, 'assets', format);
    if (fs.existsSync(testPath)) {
      icon = testPath;
      break;
    }
  }

  tray = new Tray(icon || path.join(__dirname, 'assets', 'default-icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'RHV DMS Scanner',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Scan Folder',
      click: () => {
        require('child_process').exec(`explorer "${SCAN_DIR}"`);
      }
    },
    {
      label: 'View Logs',
      click: () => {
        // Show main window with logs
        createMainWindow();
      }
    },
    {
      label: 'Settings',
      click: () => {
        createMainWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('RHV DMS Scanner - Running');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    // Show main window on tray click
    createMainWindow();
  });
}

// Create main window (for settings/logs)
function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'RHV DMS Scanner'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle('get-config', () => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-status', () => {
  return {
    running: true,
    machineId,
    scanDirectory: SCAN_DIR,
    pendingUploads: pendingUploads.size,
    version: app.getVersion(),
    apiUrl: API_BASE_URL
  };
});

ipcMain.handle('open-scan-folder', () => {
  require('child_process').exec(`explorer "${SCAN_DIR}"`);
});

// App event handlers
app.whenReady().then(() => {
  initializeApp();
  createTray();
  startLocalServer();
  initializeWatcher();

  // Register machine after a short delay
  setTimeout(registerMachine, 5000);

  console.log('RHV DMS Scanner desktop app started');
});

app.on('window-all-closed', (e) => {
  // Prevent app from quitting when all windows are closed
  e.preventDefault();
});

app.on('before-quit', () => {
  // Clean up
  if (watcher) watcher.close();
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  stopLocalServer();

  console.log('RHV DMS Scanner shutting down');
});

// Auto-start functionality (run at login)
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}