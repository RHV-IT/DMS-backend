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

// Global variables
let tray = null;
let mainWindow = null;
let setupWindow = null;
let server = null;
let watcher = null;
let statusCheckInterval = null;
let pendingUploads = new Map();
let cancelledUploads = new Set();
let machineId = null;
let API_BASE_URL = 'https://rhv-dms-backend.vercel.app';
let connectionStatus = 'disconnected'; // 'connected', 'disconnected', 'watching', 'uploading'

// Initialize directories and config
function initializeApp() {
  // Create directories
  if (!fs.existsSync(SCAN_DIR)) {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Generate or load machine ID and config
  machineId = loadOrGenerateMachineId();
  loadApiConfig();

  // Load cancelled scans
  cancelledUploads = loadCancelledScans();

  console.log('RHV DMS Scanner initialized');
  console.log('Scan directory:', SCAN_DIR);
  console.log('Config directory:', CONFIG_DIR);
  console.log('Machine ID:', machineId);
  console.log('API URL:', API_BASE_URL);
}

// Load API configuration from config file
function loadApiConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.apiUrl) {
        // Extract base URL from apiUrl (remove path part)
        const url = new URL(config.apiUrl);
        API_BASE_URL = `${url.protocol}//${url.host}`;
        return;
      }
    }
  } catch (err) {
    console.warn('Error loading API config:', err.message);
  }

  // Fallback to default
  API_BASE_URL = 'https://rhv-dms-backend.vercel.app';
}

// Check if the app is configured (has token)
async function checkIfConfigured() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return false;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return !!(config.token && config.userId);
  } catch (error) {
    console.warn('Error checking configuration:', error.message);
    return false;
  }
}

// Start the main application (tray, watcher, etc.)
function startMainApp() {
  createTray();
  initializeWatcher();

  // Register machine after a short delay
  setTimeout(registerMachine, 5000);

  console.log('Document Scanner started');
}

// Restart the application
function restartApp() {
  // Stop current services
  if (watcher) watcher.close();
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  if (server) stopLocalServer();

  // Reset state
  pendingUploads.clear();
  connectionStatus = 'disconnected';

  // Restart after a short delay
  setTimeout(() => {
    startMainApp();
  }, 1000);
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

  // CORS configuration for scanner localhost server
  const scannerCorsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (direct API calls, Postman, etc.)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://rhv-dms.vercel.app",
        "https://rhv-dms-frontend.vercel.app"
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

      console.error("❌ Scanner CORS blocked origin:", origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: false, // No credentials needed for scanner API
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 200
  };

  expressApp.use(cors(scannerCorsOptions));
  expressApp.options("*", cors(scannerCorsOptions));

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

  // Setup page endpoint
  expressApp.get('/setup', (req, res) => {
    const setupHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document Scanner Setup</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
            text-align: center;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .logo { font-size: 4em; margin-bottom: 20px; }
        .title { font-size: 2em; color: #667eea; margin-bottom: 20px; }
        .instructions {
            font-size: 1.1em;
            line-height: 1.6;
            margin-bottom: 30px;
            color: #666;
        }
        .btn {
            background: #667eea;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 6px;
            font-size: 1.1em;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 10px;
        }
        .btn:hover { background: #5a6fd8; }
        .status {
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
            display: none;
        }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">📄</div>
        <h1 class="title">Connect Your Document Scanner</h1>

        <div class="instructions">
            <p>Welcome to Document Scanner setup!</p>
            <p>To get started, please sign in to your account in the web interface.</p>
            <p>The scanner will automatically connect once you're logged in.</p>
        </div>

        <a href="${API_BASE_URL.replace('https://', 'http://localhost:3000/').replace('api', '')}" class="btn" target="_blank">
            Open Sign In Page
        </a>

        <div id="status" class="status"></div>

        <script>
            // Poll for configuration completion
            setInterval(async () => {
                try {
                    const response = await fetch('/config');
                    const data = await response.json();
                    if (data.success && data.config.hasToken) {
                        document.getElementById('status').className = 'status success';
                        document.getElementById('status').style.display = 'block';
                        document.getElementById('status').textContent = '✓ Scanner connected successfully! You can close this window.';
                        setTimeout(() => window.close(), 3000);
                    }
                } catch (e) {
                    console.log('Waiting for configuration...');
                }
            }, 2000);
        </script>
    </div>
</body>
</html>`;
    res.send(setupHtml);
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

// Send file metadata notification to backend
async function sendFileNotification(filePath) {
  try {
    connectionStatus = 'uploading';
    updateTrayMenu();

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    if (!config.token) {
      console.log('No token configured, skipping notification');
      connectionStatus = 'disconnected';
      updateTrayMenu();
      return null;
    }

    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

    console.log(`Notifying backend of new file: ${fileName}`);

    const response = await axios.post(`${API_BASE_URL}/api/v1/scanner/notify`, {
      fileName,
      checksum,
      machineName: os.hostname(),
      machineId
    }, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && response.data.success) {
      console.log(`✓ Notification sent: ${fileName}`);
      connectionStatus = 'connected';
      updateTrayMenu();

      const decision = response.data.keepFile ? 'keep' : 'delete';

      if (decision === 'delete') {
        console.log(`✓ Backend requested deletion: ${fileName}`);
        // Delete the local file
        fs.unlinkSync(filePath);
        console.log(`Deleted local file: ${fileName}`);
        return 'deleted';
      } else {
        console.log(`✓ Backend requested to keep: ${fileName}`);
        // Keep the file locally, add to tracking for potential manual upload
        const trackingId = `${machineId}_${checksum}`;
        pendingUploads.set(trackingId, {
          filePath,
          fileName,
          checksum,
          notifiedAt: new Date().toISOString(),
          machineId: machineId,
          decision: 'keep'
        });
        return 'kept';
      }
    } else {
      console.error(`✗ Notification failed: ${fileName}`);
      connectionStatus = 'disconnected';
      updateTrayMenu();
      return null;
    }
  } catch (error) {
    console.error(`✗ Error notifying backend: ${path.basename(filePath)} - ${error.message}`);
    connectionStatus = 'disconnected';
    updateTrayMenu();

    // For file notifications, don't retry automatically as the file might be processed elsewhere
    // Just log and continue
    return null;
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

// Start heartbeat sender
function startHeartbeat() {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  statusCheckInterval = setInterval(sendHeartbeat, 30000); // Send heartbeat every 30 seconds
  console.log('Started heartbeat sender (30s interval)');
}

// Send heartbeat to backend with retry
async function sendHeartbeat(retryCount = 0) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    if (!config.token) {
      connectionStatus = 'disconnected';
      updateTrayMenu();
      return;
    }

    await axios.post(`${API_BASE_URL}/api/v1/scanner/heartbeat`, {
      machineId,
      machineName: os.hostname(),
      agentVersion: app.getVersion()
    }, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    console.log('Heartbeat sent');
    connectionStatus = 'connected';
    updateTrayMenu();
  } catch (error) {
    console.warn('Heartbeat failed:', error.message);
    connectionStatus = 'disconnected';
    updateTrayMenu();

    // Retry up to 3 times with exponential backoff
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.log(`Retrying heartbeat in ${delay}ms...`);
      setTimeout(() => sendHeartbeat(retryCount + 1), delay);
    }
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

      // Notify backend after delay
      setTimeout(async () => {
        if (fs.existsSync(filePath)) {
          const result = await sendFileNotification(filePath);
          // File is either kept locally or deleted based on backend decision
        }
      }, 2000);

    } catch (err) {
      console.error(`Error processing file ${fileName}:`, err.message);
    }
  });

  watcher.on('ready', () => {
    console.log('File watcher is ready');
    connectionStatus = 'watching';
    updateTrayMenu();
    startHeartbeat();
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

  updateTrayMenu();

  tray.on('click', () => {
    // Show main window on tray click
    createMainWindow();
  });
}

// Update tray menu based on current status
function updateTrayMenu() {
  if (!tray) return;

  const statusText = getStatusText();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Document Scanner - ${statusText}`,
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
      label: 'Open Settings',
      click: () => {
        createMainWindow();
      }
    },
    {
      label: 'Restart Scanner',
      click: () => {
        restartApp();
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

  tray.setToolTip(`Document Scanner - ${statusText}`);
  tray.setContextMenu(contextMenu);
}

// Get status text for display
function getStatusText() {
  switch (connectionStatus) {
    case 'connected':
      return 'Ready';
    case 'disconnected':
      return 'Connecting...';
    case 'watching':
      return 'Monitoring Documents';
    case 'uploading':
      return 'Processing Document';
    default:
      return 'Starting...';
  }
}

// Create setup window (for first-time configuration)
function createSetupWindow() {
  if (setupWindow) {
    setupWindow.show();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 500,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false  // Disable dev tools for production
    },
    resizable: false,
    title: 'Document Scanner Setup',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  setupWindow.loadFile(path.join(__dirname, 'src', 'setup.html'));

  setupWindow.once('ready-to-show', () => {
    setupWindow.show();
  });

  setupWindow.on('closed', () => {
    setupWindow = null;
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
      contextIsolation: false,
      devTools: false  // Disable dev tools for production
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Document Scanner Settings'
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
    apiUrl: API_BASE_URL,
    connectionStatus: getStatusText()
  };
});

ipcMain.handle('open-scan-folder', () => {
  require('child_process').exec(`explorer "${SCAN_DIR}"`);
});

// Setup-related IPC handlers
ipcMain.handle('start-setup-server', async () => {
  try {
    if (!server) {
      startLocalServer();
    }
    const setupUrl = `http://localhost:4001/setup`;
    return { success: true, setupUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-setup-url', async (event, url) => {
  const { shell } = require('electron');
  shell.openExternal(url);
});

ipcMain.handle('check-setup-complete', async () => {
  try {
    const isConfigured = await checkIfConfigured();
    return { complete: isConfigured };
  } catch (error) {
    return { complete: false, error: error.message };
  }
});

ipcMain.handle('close-setup-window', () => {
  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }
  // Start the main app now that setup is complete
  startMainApp();
});

ipcMain.handle('change-scan-folder', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Document Folder',
    defaultPath: SCAN_DIR
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0];
    // Update configuration
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config.scanDirectory = newPath;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

      // Restart watcher with new path
      if (watcher) watcher.close();
      SCAN_DIR = newPath;
      initializeWatcher();

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
});

ipcMain.handle('test-connection', async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/v1/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).token}`
      },
      timeout: 5000
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App event handlers
app.whenReady().then(async () => {
  initializeApp();

  // Check if app is configured (has token)
  const isConfigured = await checkIfConfigured();

  if (!isConfigured) {
    // Show setup/login window for first-time users
    createSetupWindow();
  } else {
    // Start silently for configured users
    createTray();
    startLocalServer();
    initializeWatcher();

    // Register machine after a short delay
    setTimeout(registerMachine, 5000);

    console.log('RHV DMS Scanner desktop app started silently');
  }
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
  openAsHidden: true,
  name: 'Document Scanner'
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