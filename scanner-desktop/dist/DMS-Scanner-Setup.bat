@echo off
REM DMS Scanner Desktop Installer
REM This script installs the Document Scanner desktop application

echo ========================================
echo DMS Scanner Desktop Installer
echo ========================================
echo.

set "INSTALL_DIR=%USERPROFILE%\Documents\DMS-Scanner"
set "DESKTOP_DIR=%PUBLIC%\Desktop"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Installing DMS Scanner to: %INSTALL_DIR%
echo.

REM Create installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Create scanner-agent.js (the main scanner script)
echo Creating scanner-agent.js...
(
echo const fs = require^('fs'^);
echo const path = require^('path'^);
echo const chokidar = require^('chokidar'^);
echo const axios = require^('axios'^);
echo const crypto = require^('crypto'^);
echo const { v4: uuidv4 } = require^('uuid'^);
echo.
echo // Configuration
echo const SCAN_DIR = path.join^(__dirname, 'scanned-documents'^);
echo const CONFIG_PATH = path.join^(__dirname, 'config.json'^);
echo const API_BASE_URL = 'https://rhv-dms-backend.vercel.app';
echo.
echo // Global variables
echo let watcher = null;
echo let machineId = null;
echo.
echo // Initialize app
echo function initializeApp^(^) {
echo   // Create scan directory
echo   if ^(!fs.existsSync^(SCAN_DIR^)^) {
echo     fs.mkdirSync^(SCAN_DIR, { recursive: true }^);
echo   }
echo.
echo   // Generate/load machine ID
echo   machineId = loadOrGenerateMachineId^(^);
echo.
echo   console.log^('DMS Scanner initialized'^);
echo   console.log^('Scan directory:', SCAN_DIR^);
echo   console.log^('Machine ID:', machineId^);
echo }
echo.
echo // Generate or load machine ID
echo function loadOrGenerateMachineId^(^) {
echo   try {
echo     if ^(fs.existsSync^(CONFIG_PATH^)^) {
echo       const config = JSON.parse^(fs.readFileSync^(CONFIG_PATH, 'utf8'^)^);
echo       if ^(config.machineId^) return config.machineId;
echo     }
echo   } catch ^(err^) {
echo     console.warn^('Error loading config:', err.message^);
echo   }
echo.
echo   // Generate new machine ID
echo   const newMachineId = `machine-${uuidv4^(^)}`;
echo.
echo   // Save to config
echo   const config = {
echo     machineId: newMachineId,
echo     apiUrl: API_BASE_URL,
echo     installedAt: new Date^(^).toISOString^(^),
echo     version: '1.0.0'
echo   };
echo.
echo   try {
echo     fs.writeFileSync^(CONFIG_PATH, JSON.stringify^(config, null, 2^)^);
echo   } catch ^(err^) {
echo     console.error^('Error saving config:', err.message^);
echo   }
echo.
echo   return newMachineId;
echo }
echo.
echo // Start file watcher
echo function startWatcher^(^) {
echo   console.log^('Starting file watcher...'^);
echo.
echo   watcher = chokidar.watch^(SCAN_DIR, {
echo     ignored: /^\./,
echo     persistent: true,
echo     ignoreInitial: true,
echo     awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
echo   }^);
echo.
echo   watcher.on^('add', ^(filePath^) =^> {
echo     const fileName = path.basename^(filePath^);
echo     console.log^(`File detected: ${fileName}`^);
echo.
echo     // Process file after delay
echo     setTimeout^(^(^) =^> processFile^(filePath^), 2000^);
echo   }^);
echo.
echo   watcher.on^('ready', ^(^) =^> {
echo     console.log^('File watcher ready. Monitoring for new documents...'^);
echo   }^);
echo }
echo.
echo // Process scanned file
echo async function processFile^(filePath^) {
echo   try {
echo     const fileName = path.basename^(filePath^);
echo     const stats = fs.statSync^(filePath^);
echo     const checksum = crypto.createHash^('sha256'^).update^(fs.readFileSync^(filePath^)^).digest^('hex'^);
echo.
echo     console.log^(`Processing: ${fileName}`^);
echo.
echo     // Check if file exists on server
echo     const response = await axios.post^(`${API_BASE_URL}/api/v1/scanner/notify`, {
echo       fileName,
echo       checksum,
echo       machineName: require^('os'^).hostname^(^),
echo       machineId
echo     }, {
echo       headers: { 'Content-Type': 'application/json' },
echo       timeout: 10000
echo     }^);
echo.
echo     if ^(response.data.success^) {
echo       console.log^(`✓ Server notified for: ${fileName}`^);
echo     } else {
echo       console.log^(`✗ Server notification failed for: ${fileName}`^);
echo     }
echo   } catch ^(error^) {
echo     console.error^(`Error processing ${path.basename^(filePath^)}:`, error.message^);
echo   }
echo }
echo.
echo // Main execution
echo initializeApp^(^);
echo startWatcher^(^);
echo.
echo console.log^('DMS Scanner is now running. Place documents in the scanned-documents folder.'^);
) > "%INSTALL_DIR%\scanner-agent.js"

REM Create package.json
echo Creating package.json...
(
echo {
echo   "name": "dms-scanner-agent",
echo   "version": "1.0.0",
echo   "description": "DMS Document Scanner Agent",
echo   "main": "scanner-agent.js",
echo   "scripts": {
echo     "start": "node scanner-agent.js"
echo   },
echo   "dependencies": {
echo     "axios": "^1.7.7",
echo     "chokidar": "^3.6.0",
echo     "uuid": "^9.0.0"
echo   }
echo }
) > "%INSTALL_DIR%\package.json"

REM Create desktop shortcut
echo Creating desktop shortcut...
(
echo [InternetShortcut]
echo URL="%INSTALL_DIR%\scanner-agent.js"
echo IconIndex=0
echo IconFile=%SystemRoot%\System32\SHELL32.dll
) > "%DESKTOP_DIR%\DMS Scanner.lnk"

REM Create startup shortcut (optional)
echo Creating startup entry...
copy "%DESKTOP_DIR%\DMS Scanner.lnk" "%STARTUP_DIR%\"

REM Install dependencies
echo Installing Node.js dependencies...
cd /d "%INSTALL_DIR%"
if exist "package-lock.json" del package-lock.json
call npm install --production

echo.
echo ========================================
echo Installation completed successfully!
echo ========================================
echo.
echo The DMS Scanner has been installed to:
echo %INSTALL_DIR%
echo.
echo To start scanning:
echo 1. Place documents in: %INSTALL_DIR%\scanned-documents
echo 2. The scanner will automatically detect and upload them
echo.
echo Desktop shortcut created: DMS Scanner
echo.
echo Press any key to exit...
pause >nul