@echo off
REM =========================================
REM  Scanner Agent - Complete Installer
REM  Downloads and extracts the full agent
REM  package (scanner-agent.js, package.json,
REM  agent.bat, config.json)
REM =========================================

echo.
echo ========================================
echo  Scanner Agent - Complete Setup
echo ========================================
echo.

REM Get server URL
set /p SERVER_URL="Server URL (e.g. http://192.168.4.213:5000): "
if "%SERVER_URL%"=="" set SERVER_URL=http://192.168.4.213:5000

echo.
echo Downloading agent package...
echo.

REM Download the complete agent package ZIP
powershell -Command "Invoke-WebRequest -Uri '%SERVER_URL%/api/v1/scanner/auto-install-download' -OutFile 'scanner-agent-package.zip' -UseBasicParsing" 2>nul

if exist scanner-agent-package.zip (
    echo   [OK] Agent package downloaded
) else (
    echo   [FAIL] Could not download agent package
    echo   Make sure the server is running at %SERVER_URL%
    pause
    exit /b 1
)

echo.
echo Extracting agent package...
echo.

REM Extract the ZIP file
powershell -Command "Expand-Archive -Path 'scanner-agent-package.zip' -DestinationPath '.' -Force" 2>nul

if exist scanner-agent.js (
    echo   [OK] Agent files extracted
) else (
    echo   [FAIL] Could not extract agent package
    pause
    exit /b 1
)

REM Clean up ZIP file
del scanner-agent-package.zip

echo.
echo ========================================
echo  Installation Complete!
echo ========================================
echo.
echo Files installed:
echo   - scanner-agent.js
echo   - package.json
echo   - agent.bat
echo   - config.json
echo.
echo NEXT STEP: Install dependencies
echo ----------------------------------------
echo Run: npm install
echo.
echo Then authenticate the agent:
echo ----------------------------------------
echo Option 1 (Recommended): Log in to the DMS web interface.
echo   The frontend will automatically send your token to the agent.
echo.
echo Option 2 (Manual): Use /set-token endpoint
echo   Call: POST http://localhost:4001/set-token
echo   Body: { "token": "...", "userId": "...", "userEmail": "..." }
echo.
echo To start the agent, run: agent.bat
echo.

REM Offer to install npm dependencies
set /p INSTALL_DEPS="Install npm dependencies now? (Y/N): "
if /i "%INSTALL_DEPS%"=="Y" (
    echo.
    echo Installing dependencies...
    call npm install
    echo.
    if exist node_modules (
        echo   [OK] Dependencies installed
    ) else (
        echo   [FAIL] Failed to install dependencies
        echo   Please run 'npm install' manually
    )
)

REM Offer to add to startup
echo.
set /p INSTALL_STARTUP="Add to Windows startup? (Y/N): "
if /i "%INSTALL_STARTUP%"=="Y" (
    copy agent.bat "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\" >nul
    echo Agent will start automatically on login!
)

echo.
echo ========================================
echo  Ready to Use!
echo ========================================
echo.
echo Start the agent: agent.bat
echo.
pause
