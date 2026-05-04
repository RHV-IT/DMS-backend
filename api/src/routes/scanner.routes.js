const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const router = express.Router();
const scannerController = require('../controllers/scannerController');
const auth = require('../middlewares/authMiddleware');
const { handleScannedUpload } = require('../middlewares/uploadMiddleware');

// Public download endpoints (no auth required)
router.get('/auto-install-download', (req, res) => {
  const scannerAgentDir = path.join(__dirname, '../../../scanner-agent');

  const requiredFiles = ['scanner-agent.js', 'package.json', 'agent.bat', 'config.json'];
  const missingFiles = requiredFiles.filter(f => !fs.existsSync(path.join(scannerAgentDir, f)));

  if (missingFiles.length > 0) {
    return res.status(404).json({ success: false, message: `Missing files: ${missingFiles.join(', ')}` });
  }

  res.setHeader('Content-Disposition', 'attachment; filename="scanner-agent-package.zip"');
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to create archive' });
    }
  });

  archive.pipe(res);

  requiredFiles.forEach(file => {
    const filePath = path.join(scannerAgentDir, file);
    archive.file(filePath, { name: file });
  });

  archive.finalize();
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

router.post('/upload', handleScannedUpload, scannerController.uploadScannerFile);
router.post('/upload-simple', handleScannedUpload, scannerController.uploadScannerFileSimple);
router.get('/config', scannerController.generateAgentConfig);
router.get('/config-download', (req, res) => {
  const user = req.user;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const config = {
    apiUrl: `${baseUrl}/api/v1/scanner/pending`,
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

REM Get server URL
set /p SERVER_URL="Server URL (e.g. https://rhv-dms-backend.vercel.app): "
if "%SERVER_URL%"=="" set SERVER_URL=https://rhv-dms-backend.vercel.app

REM Build API URL
set API_URL=%SERVER_URL%/api/v1/scanner/pending

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