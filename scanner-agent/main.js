const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const si = require('systeminformation');
const mime = require('mime-types');
const axios = require('axios');

let mainWindow;
let agentServer;
let tray;

// Single instance lock - MUST run before app.whenReady()
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Configuration
const CONFIG_FILE = path.join(os.homedir(), 'Documents', 'RHV-DMS-Scanner', 'config.json');
const SCAN_FOLDER = path.join(os.homedir(), 'Documents', 'Scan');
const CANCELLED_SCANS_PATH = path.join(os.homedir(), 'Documents', 'RHV-DMS-Scanner', 'cancelled-scans.json');

let pendingUploads = new Map();
let statusCheckerInterval = null;

// Ensure directories exist
function ensureDirectories() {
  const configDir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  if (!fs.existsSync(SCAN_FOLDER)) {
    fs.mkdirSync(SCAN_FOLDER, { recursive: true });
  }
}

// Cancelled scans helpers
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

function saveCancelledScans(cancelled) {
  try {
    fs.writeFileSync(CANCELLED_SCANS_PATH, JSON.stringify({
      files: Array.from(cancelled),
      lastUpdated: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    console.error('Cancelled scans save error:', err.message);
  }
}

let cancelledScans = loadCancelledScans();

// Load or create configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

// Send file as pending upload (keeps local until confirmed)
async function sendToPending(filePath, config) {
  try {
    const fileName = path.basename(filePath);
    const stats = await fs.promises.stat(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    const FormData = require('form-data');
    const formData = new FormData();

    formData.append('file', fs.createReadStream(filePath));
    formData.append('machineId', config.machineId);
    formData.append('fileName', fileName);
    formData.append('fileSize', stats.size);
    formData.append('mimeType', mimeType);
    formData.append('originalPath', filePath);

    console.log('Uploading to pending:', fileName);

    const response = await axios.post(
      `${config.backendUrl}/api/v1/scanner/pending`,
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
      pendingUploads.set(pendingId, { filePath, fileName, machineId: config.machineId });
      console.log(`✓ Pending created: ${pendingId} - tracking for approval`);
      if (!statusCheckerInterval) startStatusChecker(config);
    }

    return pendingId;
  } catch (error) {
    console.error('Pending upload error:', error.response?.data || error.message);
    throw error;
  }
}

// Poll backend for pending status and delete/keep accordingly
function startStatusChecker(config) {
  if (statusCheckerInterval) return;
  statusCheckerInterval = setInterval(async () => {
    if (pendingUploads.size === 0) return;

    const pendingIds = Array.from(pendingUploads.keys());
    for (const pendingId of pendingIds) {
      try {
        const res = await axios.get(`${config.backendUrl}/api/v1/scanner/pending/${pendingId}`, {
          headers: { Authorization: `Bearer ${config.token}` }
        });
        const scan = res.data?.data;
        const entry = pendingUploads.get(pendingId);
        if (!scan || !entry) continue;

        if (scan.status === 'confirmed') {
          console.log(`✓ Confirmed: ${entry.fileName} - deleting local file`);
          try { if (fs.existsSync(entry.filePath)) fs.unlinkSync(entry.filePath); } catch {}
          pendingUploads.delete(pendingId);
        } else if (scan.status === 'cancelled' || scan.status === 'rejected') {
          console.log(`✗ ${scan.status}: ${entry.fileName} - keeping local file`);
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

  // Default config
  const defaultConfig = {
    machineId: `machine-${uuidv4().replace(/-/g, '').toLowerCase()}`,
    backendUrl: 'https://rhv-dms-backend.vercel.app',
    port: 4001,
    token: null,
    userId: null,
    userEmail: null,
    userName: null,
    department: null,
    agentVersion: '1.0.0'
  };

  saveConfig(defaultConfig);
  return defaultConfig;
}

// Save configuration
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Register with backend
async function registerAgent() {
  const config = loadConfig();

  try {
    const systemInfo = await si.get({
      system: 'manufacturer, model',
      osInfo: 'platform, distro, release, hostname'
    });

    const agentData = {
      machineId: config.machineId,
      machineName: os.hostname(),
      hostname: os.hostname(),
      os: systemInfo.os.platform,
      osVersion: systemInfo.os.release,
      agentVersion: config.agentVersion,
      userId: config.userId,
      department: config.department || 'unknown'
    };

    const axios = require('axios');
    const response = await axios.post(`${config.backendUrl}/api/v1/agent/register`, agentData);

    console.log('Agent registered successfully:', response.data);
  } catch (error) {
    console.error('Failed to register agent:', error.message);
  }
}

// Start the Express server for localhost API
function startAgentServer() {
  const express = require('express');
  const cors = require('cors');
  const chokidar = require('chokidar');
  const multer = require('multer');
  const axios = require('axios');

  const server = express();

  // CORS configuration for agent localhost server
  const agentCorsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (direct API calls, Postman, etc.)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://rhv-dms.vercel.app"
      ];

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any localhost port in development
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Allow local network addresses
      if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Allow Vercel domains
      if (/^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      console.error("❌ Agent CORS blocked origin:", origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 200
  };

  server.use(cors(agentCorsOptions));
  server.options("*", cors(agentCorsOptions));
  server.use(express.json());

  const config = loadConfig();
  const upload = multer({ dest: path.join(os.tmpdir(), 'scanner-uploads') });

  // Health check
  server.get('/health', (req, res) => {
    res.json({
      status: 'running',
      machineId: config.machineId,
      version: config.agentVersion,
      timestamp: new Date().toISOString()
    });
  });

  // Status
  server.get('/status', (req, res) => {
    res.json({
      machineId: config.machineId,
      backendUrl: config.backendUrl,
      authenticated: !!config.token,
      userId: config.userId,
      department: config.department,
      scanFolder: SCAN_FOLDER,
      lastActive: new Date().toISOString()
    });
  });

  // Set token
  server.post('/set-token', (req, res) => {
    const { token, machineId, userId, userEmail, userName, department } = req.body;

    if (!token || !userId || !userEmail) {
      return res.status(400).json({ error: 'Token, userId, and userEmail are required' });
    }

    config.token = token;
    if (machineId) config.machineId = machineId;
    config.userId = userId;
    config.userEmail = userEmail;
    config.userName = userName || '';
    config.department = department || 'unknown';

    saveConfig(config);

    // Reload fresh from disk
    const latest = loadConfig();
    console.log("TOKEN SAVED:", !!latest.token);
    console.log("MACHINE ID SAVED:", latest.machineId);
    console.log("Current config:", latest);

    // Register with backend after authentication
    registerAgent();

    // Stop retry loop and start watcher immediately
    if (global.tokenRetryInterval) {
      clearInterval(global.tokenRetryInterval);
      global.tokenRetryInterval = null;
    }

    console.log("TOKEN VERIFIED");
    startFileWatcher(); // Start watcher now that token exists

    res.json({
      success: true,
      message: 'Token set successfully',
      machineId: latest.machineId
    });
  });

  // Real file watcher with full debug logs
  console.log('Backend URL:', config.backendUrl);

  function startFileWatcher() {
    if (global.watcherStarted) return;
    global.watcherStarted = true;

    console.log("WATCHER STARTED");

    const watcher = chokidar.watch(SCAN_FOLDER, {
      ignored: [/[\/\\]\../, /.*~$/, /\.tmp$/i, /^\.DS_Store$/, /^Thumbs\.db$/i],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    console.log('Watching:', SCAN_FOLDER);

    watcher.on('add', async (filePath) => {
      console.log('NEW FILE DETECTED:', filePath);

      const latestConfig = loadConfig();
      if (!latestConfig.token || !latestConfig.machineId) {
        console.log("Waiting for token...");
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

        if (cancelledScans.has(filePath)) {
          console.log('Skipping cancelled file:', fileName);
          return;
        }

        await sendToPending(filePath, latestConfig);
        console.log('PENDING SCAN SENT');
      } catch (error) {
        console.log('Backend URL:', latestConfig.backendUrl);
        console.log('Axios error:', error.response?.data || error.message);
      }
    });

    watcher.on('change', (filePath) => console.log('CHANGE:', filePath));
    watcher.on('unlink', (filePath) => console.log('UNLINK:', filePath));
    watcher.on('error', (err) => console.log('Watcher error:', err));
  }

  function waitForFileComplete(filePath, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let lastSize = -1;
      let stableCount = 0;
      const check = setInterval(() => {
        try {
          if (!fs.existsSync(filePath)) {
            clearInterval(check);
            return reject(new Error('File disappeared'));
          }
          const stats = fs.statSync(filePath);
          if (stats.size === lastSize) {
            stableCount++;
            if (stableCount >= 2) {
              clearInterval(check);
              return resolve(stats);
            }
          } else {
            stableCount = 0;
            lastSize = stats.size;
          }
        } catch (e) {}
        if (Date.now() - start > timeoutMs) {
          clearInterval(check);
          reject(new Error('File stability timeout'));
        }
      }, 1000);
    });
  }

  // Watcher is now started only via startFileWatcher() after token is saved

  agentServer = server.listen(config.port, 'localhost', () => {
    console.log(`Scanner agent running on http://localhost:${config.port}`);
  });
}

function createWindow() {
  // Create a hidden window for the system tray app
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  // Load a minimal HTML page or keep it hidden
  mainWindow.loadURL(`data:text/html,
    <html>
      <head><title>RHV DMS Scanner Agent</title></head>
      <body>
        <h1>Scanner Agent Running</h1>
        <p>Monitoring scan folder: ${SCAN_FOLDER}</p>
        <p>API: http://localhost:4001</p>
      </body>
    </html>
  `);

  // Hide the window completely
  mainWindow.hide();

  // Create tray icon (safe - won't crash if missing)
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  if (fs.existsSync(trayIconPath)) {
    tray = new Tray(trayIconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Status', click: () => { /* future */ } },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('RHV DMS Scanner Agent');
    tray.setContextMenu(contextMenu);
  } else {
    console.log('Tray icon missing');
  }
}

app.whenReady().then(() => {
  ensureDirectories();
  startAgentServer();
  createWindow();

  // Wait for token before starting watcher (retry every 5s)
  global.tokenRetryInterval = setInterval(() => {
    const latestConfig = loadConfig();
    if (latestConfig.token && latestConfig.machineId) {
      console.log("TOKEN VERIFIED");
      clearInterval(global.tokenRetryInterval);
      global.tokenRetryInterval = null;
      startFileWatcher();
    } else {
      console.log("Waiting for token...");
      console.log("Current config:", latestConfig);
    }
  }, 5000);

  const config = loadConfig();
  if (config.token && config.userId) {
    registerAgent();
  }
});

app.on('window-all-closed', () => {
  // Keep the app running in background
  if (process.platform !== 'darwin') {
    // Don't quit on macOS
  }
});

app.on('before-quit', () => {
  if (agentServer) {
    agentServer.close();
  }
});

// IPC handlers for future UI interactions
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('update-config', (event, newConfig) => {
  const currentConfig = loadConfig();
  const updatedConfig = { ...currentConfig, ...newConfig };
  saveConfig(updatedConfig);
  return updatedConfig;
});