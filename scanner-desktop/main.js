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

// Global variables
let tray = null;
let mainWindow = null;
let server = null;
let watcher = null;
let machineId = null;
let API_BASE_URL = 'https://rhv-dms-backend.vercel.app';

// Constants
const SCAN_DIR = path.join(os.homedir(), 'Documents', 'RHV Scanner');
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
  // Try to use custom icon, fall back to default
  let iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  if (!fs.existsSync(iconPath)) {
    // Use a default icon - Electron will handle this
    iconPath = undefined;
  }

  tray = new Tray(iconPath);

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

// Start local server
function startLocalServer() {
  const expressApp = express();
  expressApp.use(cors());

  // Health endpoint
  expressApp.get('/health', (req, res) => {
    res.json({
      status: 'running',
      machineId: machineId,
      scanDirectory: SCAN_DIR,
      timestamp: new Date().toISOString(),
      version: app.getVersion()
    });
  });

  // Status endpoint
  expressApp.get('/status', (req, res) => {
    res.json({
      running: true,
      machineId: machineId,
      scanDirectory: SCAN_DIR,
      version: app.getVersion(),
      apiUrl: API_BASE_URL
    });
  });

  server = expressApp.listen(4001, '127.0.0.1', () => {
    console.log('Local server running on http://localhost:4001');
  });
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
    console.log(`File detected: ${fileName}`);

    // Simple file detection - in production you'd upload to backend
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        console.log(`Processing file: ${fileName}`);
        // Add your upload logic here
      }
    }, 2000);
  });

  watcher.on('ready', () => {
    console.log('File watcher ready');
  });
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
  initializeApp();
  createTray();
  startLocalServer();
  initializeWatcher();
  setupAutoLaunch();

  console.log('RHV Scanner Agent started successfully');
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

// Auto-start functionality
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true,
  name: 'RHV Scanner Agent'
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}