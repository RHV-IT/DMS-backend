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

// Constants
const SCAN_DIR = path.join(os.homedir(), 'Documents', 'scan');
const CONFIG_DIR = path.join(app.getPath('userData'), 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

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

// Start local server
function startLocalServer() {
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json());

  // Health endpoint
  expressApp.get('/health', (req, res) => {
    res.json({
      success: true,
      message: "Scanner Agent Running"
    });
  });

  // Status endpoint
  expressApp.get('/status', (req, res) => {
    const cfg = loadConfig();
    res.json({
      running: true,
      machineId: machineId,
      scanDirectory: SCAN_DIR,
      version: app.getVersion(),
      apiUrl: API_BASE_URL,
      hasToken: !!cfg.token
    });
  });

  // Set token - persist immediately
  expressApp.post('/set-token', (req, res) => {
    const { token, machineId, userId } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token missing"
      });
    }

    const config = loadConfig();
    config.token = token;
    config.machineId = machineId || config.machineId;
    config.userId = userId || null;
    config.tokenSavedAt = new Date().toISOString();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    const verify = loadConfig();
    console.log("TOKEN AFTER SAVE:", verify.token);
    console.log("CONFIG AFTER SAVE:", verify);

    if (!verify.token) {
      return res.status(500).json({
        success: false,
        message: "Token save failed"
      });
    }

    // Force stop any retry loop
    if (global.tokenRetryInterval) {
      clearInterval(global.tokenRetryInterval);
      global.tokenRetryInterval = null;
    }

    console.log("TOKEN VERIFIED");
    console.log("Starting watcher now...");

    // Start watcher immediately
    if (!global.watcherStarted) {
      initializeWatcher();
    }

    return res.json({
      success: true,
      message: "Token saved successfully"
    });
  });

  server = expressApp.listen(4001, '127.0.0.1', () => {
    console.log("Scanner Agent API running on port 4001");
  });
}

// Wait for file to be fully written
function waitForFileComplete(filePath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let lastSize = -1;
    let stableCount = 0;
    const interval = setInterval(() => {
      try {
        if (!fs.existsSync(filePath)) {
          clearInterval(interval);
          return reject(new Error('File disappeared'));
        }
        const stats = fs.statSync(filePath);
        if (stats.size === lastSize) {
          stableCount++;
          if (stableCount >= 2) {
            clearInterval(interval);
            return resolve(stats);
          }
        } else {
          stableCount = 0;
          lastSize = stats.size;
        }
      } catch (_) {}
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Stability timeout'));
      }
    }, 1000);
  });
}

// Initialize file watcher with full debug + pending scan flow
function initializeWatcher() {
  if (global.watcherStarted) return;
  global.watcherStarted = true;

  console.log('Backend URL:', API_BASE_URL);
  console.log("WATCHER STARTED");

  watcher = chokidar.watch(SCAN_DIR, {
    ignored: [/[\/\\]\../, /.*~$/, /\.tmp$/i, /^\.DS_Store$/, /^Thumbs\.db$/i],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
  });

  console.log('Watching:', SCAN_DIR);

  watcher.on('add', async (filePath) => {
    console.log('NEW FILE DETECTED:', filePath);

    const config = loadConfig();
    if (!config.token) {
      console.log('No token set, skipping');
      return;
    }
    console.log('Current token:', 'EXISTS');

    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'];
    if (!allowed.includes(ext) || fileName.startsWith('.') || fileName.startsWith('~')) {
      console.log('Ignoring non-allowed file:', fileName);
      return;
    }

    try {
      const stats = await waitForFileComplete(filePath);
      console.log('File fully written:', fileName, stats.size, 'bytes');

      const mimeType = mime.lookup(filePath) || 'application/octet-stream';
      console.log('DETECTED MIME TYPE:', mimeType);
      const payload = {
        machineId: config.machineId,
        fileName,
        originalPath: filePath,
        fileSize: stats.size,
        mimeType
      };
      console.log('Request body:', payload);

      const response = await axios.post(
        `${API_BASE_URL}/api/v1/scanner/pending`,
        payload,
        { headers: { Authorization: `Bearer ${config.token}` } }
      );

      console.log('PENDING SCAN SENT');
      console.log('BACKEND RESPONSE OK:', response.data);
    } catch (error) {
      console.log('Backend URL:', API_BASE_URL);
      console.log('Axios error:', error.response?.data || error.message);
    }
  });

  watcher.on('change', (p) => console.log('CHANGE:', p));
  watcher.on('unlink', (p) => console.log('UNLINK:', p));
  watcher.on('error', (err) => console.log('Watcher error:', err));
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