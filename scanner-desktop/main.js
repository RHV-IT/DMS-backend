const { app: appElectron, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const chokidar = require('chokidar');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const FormData = require('form-data');

let tray = null;
let mainWindow = null;
let server = null;
let watcher = null;
let watcherStarted = false;
let isQuiting = false;

let config = { token: null, machineId: null, userId: null, tokenSavedAt: null };
let pendingUploads = new Map();
let statusCheckerInterval = null;
let cancelledScans = new Set();

const SCAN_FOLDER = path.join(os.homedir(), 'Documents', 'Scan');
const CONFIG_DIR = path.join(appElectron.getPath('userData'), 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CANCELLED_SCANS_PATH = path.join(os.homedir(), 'Documents', 'RHV-DMS-Scanner', 'cancelled-scans.json');
const API_BASE_URL = 'https://rhv-dms-backend.vercel.app';

const gotTheLock = appElectron.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance already running');
  appElectron.quit();
  process.exit(0);
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config = { ...config, ...data };
    }
  } catch (_) {}
  return config;
}

function saveConfig(data) {
  try {
    config = { ...config, ...data };
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Save config error:', err.message);
  }
  return config;
}

function loadCancelledScans() {
  try {
    if (fs.existsSync(CANCELLED_SCANS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CANCELLED_SCANS_PATH, 'utf8'));
      cancelledScans = new Set(data.files || []);
    }
  } catch (_) {}
}

function saveCancelledScans() {
  try {
    if (!fs.existsSync(path.dirname(CANCELLED_SCANS_PATH))) {
      fs.mkdirSync(path.dirname(CANCELLED_SCANS_PATH), { recursive: true });
    }
    fs.writeFileSync(CANCELLED_SCANS_PATH, JSON.stringify({ files: Array.from(cancelledScans), lastUpdated: new Date().toISOString() }, null, 2));
  } catch (_) {}
}

function initializeApp() {
  if (!fs.existsSync(SCAN_FOLDER)) {
    fs.mkdirSync(SCAN_FOLDER, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  loadConfig();
  loadCancelledScans();
  if (!config.machineId) {
    config.machineId = `machine-${uuidv4()}`;
    saveConfig(config);
  }
}

function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    return;
  }
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
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  if (fs.existsSync(trayIconPath)) {
    tray = new Tray(trayIconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'RHV Scanner Agent - Running', enabled: false },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => createWindow() },
      { label: 'Open Scan Folder', click: () => { require('child_process').exec(`explorer "${SCAN_FOLDER}"`); } },
      { type: 'separator' },
      { label: 'Quit Agent', click: () => { isQuiting = true; appElectron.quit(); } }
    ]);
    tray.setToolTip('RHV Scanner Agent');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => createWindow());
  } else {
    console.log('Tray icon missing — skipping tray');
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Scanner Agent Running',
    hasToken: !!config.token,
    machineId: config.machineId || null,
    watcherRunning: watcherStarted
  });
});

app.post('/set-token', async (req, res) => {
  try {
    console.log('SET TOKEN REQUEST RECEIVED');
    const { token, machineId, userId } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }
    config.token = token;
    if (machineId) config.machineId = machineId;
    if (userId) config.userId = userId;
    config.tokenSavedAt = new Date().toISOString();
    saveConfig(config);
    console.log('TOKEN SAVED');
    if (!watcherStarted) {
      startWatcher();
    }
    return res.json({ success: true, message: 'Token saved successfully' });
  } catch (error) {
    console.error('SET TOKEN ERROR:', error);
    return res.status(500).json({ success: false, message: 'Failed to save token', error: error.message });
  }
});

app.get('/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({ path: middleware.route.path, methods: middleware.route.methods });
    }
  });
  res.json(routes);
});

function startWatcher() {
  if (watcherStarted) {
    console.log('Watcher already running');
    return;
  }
  if (!config.token) {
    console.log('No token yet');
    return;
  }
  watcherStarted = true;
  watcher = chokidar.watch(SCAN_FOLDER, {
    ignored: [/(^|[\/\\])\../, /\.tmp$/i, /^Thumbs\.db$/i],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
  });
  console.log('WATCHER STARTED:', SCAN_FOLDER);
  watcher.on('add', async (filePath) => {
    await processNewFile(filePath);
  });
  watcher.on('error', (err) => {
    console.error('WATCHER ERROR:', err);
  });
}

async function processNewFile(filePath) {
  if (!config.token) {
    console.log('No token, skipping upload');
    return;
  }
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'];
  if (!allowed.includes(ext) || fileName.startsWith('.') || fileName.startsWith('~')) {
    return;
  }
  try {
    await new Promise(r => setTimeout(r, 2000));
    if (cancelledScans.has(filePath)) {
      console.log('Skipping cancelled:', fileName);
      return;
    }
    const stats = await fs.promises.stat(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('machineId', config.machineId || '');
    formData.append('fileName', fileName);
    formData.append('mimeType', mimeType);
    formData.append('fileSize', stats.size);
    formData.append('originalPath', filePath);
    console.log('Uploading pending:', fileName);
    const response = await axios.post(`${API_BASE_URL}/api/v1/scanner/pending`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${config.token}`
      },
      timeout: 120000
    });
    const pendingId = response.data?.data?.id;
    if (pendingId) {
      pendingUploads.set(pendingId, { filePath, fileName });
      console.log('Pending created:', pendingId);
      if (!statusCheckerInterval) startStatusChecker();
    }
  } catch (error) {
    console.error('Process file error:', error.message);
  }
}

function startStatusChecker() {
  if (statusCheckerInterval) return;
  statusCheckerInterval = setInterval(async () => {
    if (pendingUploads.size === 0) return;
    for (const [pendingId, entry] of pendingUploads) {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/v1/scanner/pending/${pendingId}`, {
          headers: { Authorization: `Bearer ${config.token}` }
        });
        const scan = res.data?.data;
        if (!scan) continue;
        if (scan.status === 'confirmed') {
          console.log('Confirmed, deleting local:', entry.fileName);
          try { if (fs.existsSync(entry.filePath)) fs.unlinkSync(entry.filePath); } catch {}
          pendingUploads.delete(pendingId);
        } else if (scan.status === 'cancelled' || scan.status === 'rejected') {
          console.log('Cancelled, keeping:', entry.fileName);
          cancelledScans.add(entry.filePath);
          saveCancelledScans();
          pendingUploads.delete(pendingId);
        }
      } catch (e) {
        if (e.response && e.response.status === 404) pendingUploads.delete(pendingId);
      }
    }
  }, 10000);
}

function setupAutoStart() {
  try {
    appElectron.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath
    });
  } catch (err) {
    console.warn('Auto start setup warning:', err.message);
  }
}

appElectron.whenReady().then(() => {
  initializeApp();
  createWindow();
  createTray();
  server = app.listen(4001, '127.0.0.1', () => {
    console.log('LOCAL API RUNNING ON 4001');
  });
  server.on('error', (err) => {
    console.error('SERVER ERROR:', err);
  });
  setupAutoStart();
  if (config.token) {
    startWatcher();
  } else {
    const tokenCheck = setInterval(() => {
      loadConfig();
      if (config.token && !watcherStarted) {
        clearInterval(tokenCheck);
        startWatcher();
      }
    }, 5000);
  }
  console.log('RHV Scanner Agent started');
});

appElectron.on('window-all-closed', () => {});

appElectron.on('before-quit', () => {
  isQuiting = true;
  if (watcher) watcher.close();
  if (server) server.close();
  if (statusCheckerInterval) clearInterval(statusCheckerInterval);
  console.log('RHV Scanner Agent shutting down');
});

appElectron.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

ipcMain.handle('get-status', () => ({
  running: true,
  machineId: config.machineId,
  scanDirectory: SCAN_FOLDER,
  hasToken: !!config.token,
  watcherRunning: watcherStarted
}));

ipcMain.handle('open-scan-folder', () => {
  require('child_process').exec(`explorer "${SCAN_FOLDER}"`);
});
