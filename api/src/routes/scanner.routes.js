console.log('🔧 Loading scanner routes...');

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const scannerController = require('../controllers/scannerController');
const auth = require('../middlewares/authMiddleware');
const { handleScannedUpload } = require('../middlewares/uploadMiddleware');
const Installer = require('../models/Installer');

console.log('✅ Scanner routes dependencies loaded');

// Multer configuration for installer uploads (store in memory)
const installerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB limit for installers
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/octet-stream' || file.originalname.endsWith('.exe')) {
      cb(null, true);
    } else {
      cb(new Error('Only executable files are allowed'), false);
    }
  }
});

// Public download endpoints (no auth required) - MOVED TO TOP
router.get('/test-endpoint', (req, res) => {
  console.log('🔧 Test endpoint called at', new Date().toISOString());
  res.json({ success: true, message: 'Test endpoint works', timestamp: new Date().toISOString() });
});

router.get('/auto-install-download', async (req, res) => {
  try {
    const installerPath = path.join(__dirname, '../../../../scanner-desktop/dist/RHV Scanner Agent Setup 1.0.0.exe');

    console.log('📥 Auto-install-download requested');
    console.log('Looking for installer at:', installerPath);

    if (!fs.existsSync(installerPath)) {
      console.log('❌ Installer file not found on disk');
      return res.status(404).json({
        success: false,
        message: 'Installer not found. Please build the desktop agent first.'
      });
    }

    const stats = fs.statSync(installerPath);
    const fileName = path.basename(installerPath);

    console.log('✅ Serving installer:', fileName, 'Size:', stats.size);

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('X-Installer-Version', '1.0.0');

    const fileStream = fs.createReadStream(installerPath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      console.log('✅ Auto-installer download completed');
    });

    fileStream.on('error', (err) => {
      console.error('❌ Stream error during download:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      }
    });
  } catch (error) {
    console.error('❌ Error in auto-install-download:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to serve installer',
        error: error.message
      });
    }
  }
});

router.get('/test-scanner', (req, res) => {
  res.json({ success: true, message: 'Scanner routes working' });
});

router.get('/installer-info', async (req, res) => {
  try {
    const installer = await Installer.findOne({
      isActive: true,
      platform: 'windows'
    }).sort({ version: -1 }).select('name version fileSize downloadCount createdAt');

    if (installer) {
      return res.json({
        success: true,
        installer: {
          name: installer.name,
          version: installer.version,
          size: installer.fileSize,
          downloads: installer.downloadCount,
          uploadedAt: installer.createdAt
        }
      });
    }

    res.status(404).json({
      success: false,
      message: 'No active installer found'
    });
  } catch (error) {
    console.error('Error getting installer info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get installer info'
    });
  }
});



router.get('/test-endpoint', (req, res) => {
  console.log('🔧 Test endpoint called');
  res.json({ success: true, message: 'Test endpoint works' });
});

// Direct binary download endpoint
router.get('/auto-install-download/direct', async (req, res) => {
  try {
    console.log('📥 Direct download request received');

    // Find the active installer
    const installer = await Installer.findOne({
      isActive: true,
      platform: 'windows'
    }).sort({ version: -1 });

    console.log('Direct download - Found installer:', installer ? 'YES' : 'NO');

    if (installer) {
      console.log('Direct download - Sending file:', installer.name, 'Size:', installer.fileSize);

      // Increment download count
      await Installer.findByIdAndUpdate(installer._id, {
        $inc: { downloadCount: 1 }
      });

      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${installer.name}"`);
      res.setHeader('Content-Type', installer.mimeType);
      res.setHeader('Content-Length', installer.fileSize);
      res.setHeader('X-Installer-Version', installer.version);

      // Send the binary data
      res.send(installer.data);
      console.log('✅ Direct download completed');
      return;
    }

    console.log('❌ Direct download - No installer found');
    // Installer not available
    res.status(404).json({
      success: false,
      message: 'Installer not available'
    });
  } catch (error) {
    console.error('❌ Error in direct download:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to serve installer',
      error: error.message
    });
  }
});

// TEMPORARY TEST ENDPOINT - NO AUTH AT ALL
router.post('/upload-installer-test', installerUpload.single('installer'), async (req, res) => {
  try {
    console.log('UPLOADING INSTALLER - AUTH TEMPORARILY DISABLED');
    console.log('req.files:', req.files);
    console.log('req.body:', req.body);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No installer file provided'
      });
    }

    const installerFile = req.file;
    const version = req.body.version || '1.0.0';
    const platform = req.body.platform || 'windows';

    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(installerFile.data).digest('hex');

    // Check if this exact installer already exists
    const existing = await Installer.findOne({ checksum });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This installer version already exists'
      });
    }

    // Deactivate previous installers for this platform
    await Installer.updateMany(
      { platform, isActive: true },
      { isActive: false }
    );

    // Create new installer record
    const newInstaller = new Installer({
      name: installerFile.name,
      version,
      platform,
      fileSize: installerFile.size,
      mimeType: installerFile.mimetype || 'application/octet-stream',
      data: installerFile.data,
      checksum,
      uploadedBy: null // No user for test upload
    });

    await newInstaller.save();

    res.json({
      success: true,
      message: 'Installer uploaded successfully',
      installer: {
        name: newInstaller.name,
        version: newInstaller.version,
        size: newInstaller.fileSize,
        checksum: newInstaller.checksum
      }
    });
  } catch (error) {
    console.error('Error uploading installer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload installer'
    });
  }
});


router.get('/agent-download', (req, res) => {
  const agentPath = path.join(__dirname, '../../../agent/scanner-agent.js');

  if (fs.existsSync(agentPath)) {
    const agentCode = fs.readFileSync(agentPath, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="scanner-agent.js"');
    res.setHeader('Content-Type', 'application/javascript');
    res.send(agentCode);
  } else {
    res.status(404).json({ success: false, message: 'Agent file not found' });
  }
});

router.get('/setup-download', (req, res) => {
  const setupPath = path.join(__dirname, '../../../agent/setup.js');

  if (fs.existsSync(setupPath)) {
    const setupCode = fs.readFileSync(setupPath, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="setup.js"');
    res.setHeader('Content-Type', 'application/javascript');
    res.send(setupCode);
  } else {
    res.status(404).json({ success: false, message: 'Setup file not found' });
  }
});

router.get('/package-download', (req, res) => {
  const pkgPath = path.join(__dirname, '../../../agent/package.json');

  if (fs.existsSync(pkgPath)) {
    const pkg = fs.readFileSync(pkgPath, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="package.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(pkg);
  } else {
    res.status(404).json({ success: false, message: 'Package file not found' });
  }
});

router.get('/start-agent-download', (req, res) => {
  const startAgentPath = path.join(__dirname, '../../../agent/start-agent.bat');

  if (fs.existsSync(startAgentPath)) {
    const code = fs.readFileSync(startAgentPath, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="start-agent.bat"');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(code);
  } else {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

// Protected endpoints (require authentication)
router.use(auth);

// Agent health and heartbeat endpoints
router.get('/health', scannerController.getAgentHealth);
router.post('/heartbeat', scannerController.heartbeat);
router.post('/notify', scannerController.notifyNewFile);

router.post('/upload', handleScannedUpload, scannerController.uploadScannerFile);
router.post('/upload-simple', handleScannedUpload, scannerController.uploadScannerFileSimple);
router.get('/config', scannerController.generateAgentConfig);
router.get('/config-download', (req, res) => {
  const user = req.user;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const config = {
    apiUrl: `${baseUrl}/api/v1/scanner/upload`,
    token: req.token,
    userId: user._id.toString(),
    userEmail: user.email,
    userName: user.name,
    configuredAt: new Date().toISOString()
  };

  res.setHeader('Content-Disposition', 'attachment; filename="config.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(config);
});
router.get('/full-agent-download', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const script = `@echo off
REM ================================================
REM  Scanner Agent - One Click Installer
REM  This installs the agent files. Authentication
REM  is done via the frontend after installation.
REM ================================================
echo.
echo Scanner Agent Installation
echo =========================
echo.

REM Set server URL to Vercel (no user input for security)
set SERVER_URL=https://rhv-dms-backend.vercel.app

REM Build API URL
set API_URL=%SERVER_URL%/api/v1/scanner/upload

REM Create config.json with null token
echo Creating config.json...
echo { > config.json
echo   "apiUrl": "%API_URL%", >> config.json
echo   "token": null, >> config.json
echo   "userId": null, >> config.json
echo   "userEmail": null, >> config.json
echo   "configuredAt": "%DATE% %TIME%" >> config.json
echo } >> config.json

echo.
echo ================================================
echo Installation Complete!
echo ================================================
echo.
echo NEXT STEP: Authenticate
echo -------------------------
echo Option 1 (Recommended): Log in to the DMS web interface.
echo   The frontend will automatically send your token to the agent.
echo.
echo Option 2 (Manual): Use set-token.js
echo   npm run set-token -- --token <TOKEN> --userId <ID> --userEmail <EMAIL>
echo.
echo To start the agent, run: agent.bat
echo.

REM Create agent.bat
echo @echo off > agent.bat
echo cd /d "%%~dp0" >> agent.bat
echo :loop >> agent.bat
echo node scanner-agent.js >> agent.bat
echo timeout /t 5 /nobreak >> agent.bat
echo goto loop >> agent.bat

REM Offer startup install
echo.
set /p INSTALL_STARTUP="Add to Windows startup? (Y/N): "
if /i "%INSTALL_STARTUP%"=="Y" (
    copy agent.bat "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\" >nul
    echo Agent will start automatically on login!
)

echo.
echo Done! Run agent.bat to start.
pause
`;

  res.setHeader('Content-Disposition', 'attachment; filename="scanner-agent-setup.bat"');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(script);
});

router.get('/get-agent-download', (req, res) => {
  const getAgentPath = path.join(__dirname, '../../../agent/get-agent.js');

  if (fs.existsSync(getAgentPath)) {
    const code = fs.readFileSync(getAgentPath, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="get-agent.js"');
    res.setHeader('Content-Type', 'application/javascript');
    res.send(code);
  } else {
    res.status(404).json({ success: false, message: 'Get agent file not found' });
  }
});

router.get('/agent-package-download', (req, res) => {
  const agentDir = path.join(__dirname, '../../../agent');
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const zipScript = `# Agent Download Script
# Run: node download-agent.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function download() {
  const token = process.argv[2];
  if (!token) {
    console.log('Usage: node download-agent.js <token>');
    return;
  }

  const baseUrl = '${baseUrl}';

  try {
    console.log('Downloading agent files...');

    const files = [
      { url: '/api/v1/scanner/agent-download', name: 'scanner-agent.js' },
      { url: '/api/v1/scanner/setup-download', name: 'setup.js' },
      { url: '/api/v1/scanner/package-download', name: 'package.json' }
    ];

    for (const f of files) {
      console.log('Downloading ' + f.name + '...');
      const res = await axios.get(baseUrl + f.url, {
        headers: { Authorization: 'Bearer ' + token }
      });
      fs.writeFileSync(path.join(__dirname, f.name), res.data);
    }

    console.log('\\nDone! Run:');
    console.log('  npm install');
    console.log('  node setup.js');
    console.log('  npm start\\n');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

download();
`;

  res.setHeader('Content-Disposition', 'attachment; filename="download-agent.js"');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(zipScript);
});

module.exports = router;