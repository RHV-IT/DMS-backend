@echo off
REM RHV DMS Scanner Agent - Simple Installer
REM This is a temporary installer until the full Electron build is ready

echo ================================================
echo  RHV DMS Scanner Agent Installation
echo ================================================
echo.

REM Set up environment
set BACKEND_URL=https://rhv-dms-backend.vercel.app
set SCAN_FOLDER=%USERPROFILE%\Documents\Scan
set CONFIG_FOLDER=%USERPROFILE%\Documents\RHV-DMS-Scanner

echo Setting up directories...
if not exist "%SCAN_FOLDER%" mkdir "%SCAN_FOLDER%"
if not exist "%CONFIG_FOLDER%" mkdir "%CONFIG_FOLDER%"

REM Check if already installed
if exist "%CONFIG_FOLDER%\config.json" (
    echo.
    echo Scanner Agent is already installed!
    echo Configuration found at: %CONFIG_FOLDER%\config.json
    echo.
    echo To reinstall, delete the config folder and run again.
    echo.
    pause
    exit /b 0
)

REM Generate machine ID
for /f %%i in ('powershell -command "[guid]::NewGuid().ToString().Replace('-','').ToLower()"') do set MACHINE_ID=%%i

REM Create config file
echo Creating configuration...
echo { > "%CONFIG_FOLDER%\config.json"
echo   "machineId": "machine-%MACHINE_ID%", >> "%CONFIG_FOLDER%\config.json"
echo   "backendUrl": "%BACKEND_URL%", >> "%CONFIG_FOLDER%\config.json"
echo   "port": 4001, >> "%CONFIG_FOLDER%\config.json"
echo   "token": null, >> "%CONFIG_FOLDER%\config.json"
echo   "userId": null, >> "%CONFIG_FOLDER%\config.json"
echo   "userEmail": null, >> "%CONFIG_FOLDER%\config.json"
echo   "userName": null, >> "%CONFIG_FOLDER%\config.json"
echo   "department": null, >> "%CONFIG_FOLDER%\config.json"
echo   "agentVersion": "1.0.0" >> "%CONFIG_FOLDER%\config.json"
echo } >> "%CONFIG_FOLDER%\config.json"

REM Download scanner agent files
echo Downloading scanner agent...
powershell -Command "& {Invoke-WebRequest -Uri '%BACKEND_URL%/api/v1/scanner/agent-download' -OutFile '%CONFIG_FOLDER%\scanner-agent.js'}"
powershell -Command "& {Invoke-WebRequest -Uri '%BACKEND_URL%/api/v1/scanner/package-download' -OutFile '%CONFIG_FOLDER%\package.json'}"

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo WARNING: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Then run: cd "%CONFIG_FOLDER%" && npm install && node scanner-agent.js
    echo.
) else (
    echo Installing dependencies...
    cd /d "%CONFIG_FOLDER%"
    npm install >nul 2>&1

    echo Setting up startup...
    REM Create startup script
    echo @echo off > "%CONFIG_FOLDER%\start-agent.bat"
    echo cd /d "%CONFIG_FOLDER%" >> "%CONFIG_FOLDER%\start-agent.bat"
    echo node scanner-agent.js >> "%CONFIG_FOLDER%\start-agent.bat"

    REM Add to startup (optional)
    set /p ADD_STARTUP="Add to Windows startup? (Y/N): "
    if /i "%ADD_STARTUP%"=="Y" (
        copy "%CONFIG_FOLDER%\start-agent.bat" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\" >nul
        echo Agent will start automatically on login!
    )

    echo Starting agent...
    start /b cmd /c "cd /d %CONFIG_FOLDER% && node scanner-agent.js"
)

echo.
echo ================================================
echo Installation Complete!
echo ================================================
echo.
echo Configuration: %CONFIG_FOLDER%\config.json
echo Scan Folder: %SCAN_FOLDER%
echo API: http://localhost:4001
echo.
echo Next steps:
echo 1. Open the DMS web interface
echo 2. The frontend will automatically configure the agent
echo 3. Start scanning documents to %SCAN_FOLDER%
echo.
echo To check status: curl http://localhost:4001/health
echo.
pause