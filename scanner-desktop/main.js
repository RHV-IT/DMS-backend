const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const chokidar = require('chokidar');
const { v4: uuidv4 } = require('uuid');
const AutoLaunch = require('auto-launch');
const mime = require('mime-types');

// Global error handlers - prevent silent crashes (write to file for debugging)
const errorLogPath = 'C:\\scanner-error.log';
process.on('uncaughtException', (err) => {
  const msg = `[${new Date().toISOString()}] Uncaught Exception: ${err.stack}\n`;
  try { fs.appendFileSync(errorLogPath, msg); } catch (_) {}
  console.error(msg);
});
process.on('unhandledRejection', (reason) => {
  const msg = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`;
  try { fs.appendFileSync(errorLogPath, msg); } catch (_) {}
  console.error(msg);
});

// Global variables
let tray = null;
let mainWindow = null;
let server = null;
let watcher = null;
let machineId = null;
let API_BASE_URL = 'https://rhv-dms-backend.vercel.app';
let autoLauncher = null;
let server = null;

// Constants
const SCAN_DIR = path.join(os.homedir(), 'Documents', 'scan');
const CONFIG_DIR = path.join(app.getPath('userData'), 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CANCELLED_SCANS_PATH = path.join(os.homedir(), 'Documents', 'RHV-DMS-Scanner', 'cancelled-scans.json');

let pendingUploads = new Map();
let statusCheckerInterval = null;

// Initialize the application
function initializeApp() {
  // Create necessary directories
  if (!fs.existsSync(SCAN_DIR)) {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Generate machine ID if not exists
  machineId = loadOrGenerateMachineId();

  console.log('RHV Scanner Agent initialized');
  console.log('Scan directory:', SCAN_DIR);
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

  const newMachineId = `machine-${uuidv4()}`;
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

// Create system tray
function createTray() {
  // Safe tray icon creation (prevents crash)
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  if (fs.existsSync(trayIconPath)) {
    tray = new Tray(trayIconPath);
  } else {
    console.log('Tray icon missing');
    tray = new Tray(path.join(__dirname, 'assets', 'icon.png')); // fallback if exists
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'RHV Scanner Agent - Running',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        createMainWindow();
      }
    },
    {
      label: 'Open Scan Folder',
      click: () => {
        require('child_process').exec(`explorer "${SCAN_DIR}"`);
      }
    },
    { type: 'separator' },
    {
      label: 'Restart Agent',
      click: () => {
        app.relaunch();
        app.exit();
      }
    },
    {
      label: 'Quit Agent',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('RHV Scanner Agent');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    createMainWindow();
  });
}

// Create main window
function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    return;
  }

  // Check if icon exists
  let iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) {
    iconPath = undefined;
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Load config from disk (always fresh)
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (_) {}
  return { token: null, machineId: machineId };
}

// Save config synchronously
function saveConfig(data) {
  try {
    const current = loadConfig();
    const updated = { ...current, ...data };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
    return updated;
  } catch (err) {
    console.error('Error saving config:', err.message);
  }
  return null;
}

function startLocalServer() {
  const express = require('express');
  const cors = require('cors');
  const localApp = express();
  localApp.use(cors());
  localApp.use(express.json());

  localApp.get('/status', (req, res) => {
    res.json({
      status: 'running',
      machineId,
      version: '1.0.0'
    });
  });

  const port = 4002;
  server = localApp.listen(port, () => {
    console.log(`Local server running on http://localhost:${port}`);
  });
}

// Cancelled scans + pending status helpers (same architecture as scanner-agent)
function loadCancelledScans() {
  try {
    if (fs.existsSync(CANCELLED_SCANS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CANCELLED_SCANS_PATH, 'utf8'));
      return new Set(data.files || []);
    }
  } catch (_) {}
  return new Set();
}

function saveCancelledScans(cancelled) {
  try {
    fs.writeFileSync(CANCELLED_SCANS_PATH, JSON.stringify({
      files: Array.from(cancelled),
      lastUpdated: new Date().toISOString()
    }, null, 2));
  } catch (_) {}
}

let cancelledScans = loadCancelledScans();

async function sendToPending(filePath, config) {
  try {
    const fileName = path.basename(filePath);
    const stats = await fs.promises.stat(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    const FormData = require('form-data');
    const formData = new FormData();

    formData.append('file', fs.createReadStream(filePath));
    formData.append('machineId', config.machineId || machineId);
    formData.append('fileName', fileName);
    formData.append('fileSize', stats.size);
    formData.append('mimeType', mimeType);
    formData.append('originalPath', filePath);

    console.log('Uploading to pending (desktop):', fileName);

    const response = await axios.post(
      `${API_BASE_URL}/api/v1/scanner/pending`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${config.token}`
        },
        timeout: 120000
      }
    );

    const pendingId = response.data?.data?.id;
    if (pendingId) {
      pendingUploads.set(pendingId, { filePath, fileName });
      console.log(`✓ Pending created: ${pendingId}`);
      if (!statusCheckerInterval) startStatusChecker(config);
    }
    return pendingId;
  } catch (error) {
    console.error('Desktop pending upload error:', error.response?.data || error.message);
    throw error;
  }
}

function startStatusChecker(config) {
  if (statusCheckerInterval) return;
  statusCheckerInterval = setInterval(async () => {
    if (pendingUploads.size === 0) return;

    for (const [pendingId, entry] of pendingUploads) {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/v1/scanner/pending/${pendingId}`, {
          headers: { Authorization: `Bearer ${config.token || loadConfig().token}` }
        });
        const scan = res.data?.data;
        if (!scan) continue;

        if (scan.status === 'confirmed') {
          console.log(`✓ Confirmed: ${entry.fileName} - deleting local`);
          try { fs.existsSync(entry.filePath) && fs.unlinkSync(entry.filePath); } catch {}
          pendingUploads.delete(pendingId);
        } else if (scan.status === 'cancelled' || scan.status === 'rejected') {
          console.log(`✗ ${scan.status}: ${entry.fileName} - keeping`);
          cancelledScans.add(entry.filePath);
          saveCancelledScans(cancelledScans);
          pendingUploads.delete(pendingId);
        }
      } catch (e) {
        if (e.response?.status === 404) pendingUploads.delete(pendingId);
      }
    }
  }, 10000);
}

// Setup auto-launch
function setupAutoLaunch() {
  autoLauncher = new AutoLaunch({
    name: 'RHV Scanner Agent',
    path: process.execPath,
    isHidden: true
  });

  autoLauncher.enable();
}

// IPC handlers
ipcMain.handle('get-status', () => {
  return {
    running: true,
    machineId: machineId,
    scanDirectory: SCAN_DIR,
    version: app.getVersion(),
    apiUrl: API_BASE_URL
  };
});

ipcMain.handle('open-scan-folder', () => {
  require('child_process').exec(`explorer "${SCAN_DIR}"`);
});

// App event handlers
app.whenReady().then(() => {
  startLocalServer();
  initializeApp();
  setupAutoLaunch();
  createTray();

  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      name: 'RHV Scanner Agent'
    });
  }

  // Wait for token before starting watcher (retry every 5s)
  global.tokenRetryInterval = setInterval(() => {
    const latestConfig = loadConfig();
    if (latestConfig.token && latestConfig.machineId) {
      console.log("TOKEN VERIFIED");
      clearInterval(global.tokenRetryInterval);
      global.tokenRetryInterval = null;
      initializeWatcher();
    } else {
      console.log("Waiting for token...");
      console.log("Current config:", latestConfig);
    }
  }, 5000);

  console.log('RHV Scanner Agent started successfully');
  if (tray) tray.setToolTip('RHV Scanner Agent - Running');
});

app.on('window-all-closed', (e) => {
  // Prevent app from quitting when all windows are closed
  e.preventDefault();
});

app.on('before-quit', () => {
  if (watcher) watcher.close();
  if (server) server.close();
  console.log('RHV Scanner Agent shutting down');
});

// Auto-start handled in whenReady to ensure proper timing

// Single instance lock - MUST be before app.whenReady()
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});