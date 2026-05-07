const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const si = require('systeminformation');

let mainWindow;
let agentServer;

// Configuration
const CONFIG_FILE = path.join(os.homedir(), 'Documents', 'RHV-DMS-Scanner', 'config.json');
const SCAN_FOLDER = path.join(os.homedir(), 'Documents', 'Scan');

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
  server.use(cors());
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
    const { token, userId, userEmail, userName, department } = req.body;

    if (!token || !userId || !userEmail) {
      return res.status(400).json({ error: 'Token, userId, and userEmail are required' });
    }

    config.token = token;
    config.userId = userId;
    config.userEmail = userEmail;
    config.userName = userName || '';
    config.department = department || 'unknown';

    saveConfig(config);

    // Register with backend after authentication
    registerAgent();

    res.json({
      success: true,
      message: 'Token set successfully',
      machineId: config.machineId
    });
  });

  // Watch scan folder for new files
  const watcher = chokidar.watch(SCAN_FOLDER, {
    ignored: /^\./,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });

  watcher.on('add', async (filePath) => {
    console.log('New file detected:', filePath);

    if (!config.token) {
      console.log('No token set, skipping upload');
      return;
    }

    try {
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();

      // Only process image/document files
      const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp'];
      if (!allowedExtensions.includes(fileExtension)) {
        console.log('Skipping unsupported file type:', fileExtension);
        return;
      }

      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      form.append('department', config.department || 'unknown');
      form.append('uploadedBy', config.userName || 'scanner-agent');
      form.append('machineId', config.machineId);

      const response = await axios.post(
        `${config.backendUrl}/api/v1/scanner/upload`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${config.token}`
          }
        }
      );

      console.log('File uploaded successfully:', fileName);

      // Optionally move or delete the file after successful upload
      // fs.unlinkSync(filePath);

    } catch (error) {
      console.error('Failed to upload file:', error.message);
    }
  });

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
}

app.whenReady().then(() => {
  ensureDirectories();
  startAgentServer();
  createWindow();

  // Register with backend on startup if we have credentials
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