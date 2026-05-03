@echo off
REM =========================================
REM  Scanner Agent - Simple Installer
REM =========================================

echo.
echo ========================================
echo  Scanner Agent Installation
echo ========================================
echo.

REM Get server URL
set /p SERVER_URL="Server URL (e.g. http://192.168.4.213:5000): "
if "%SERVER_URL%"=="" set SERVER_URL=http://localhost:5000

REM Build base API URL
set API_BASE=%SERVER_URL%/api/v1/scanner

REM Create config.json
echo Creating config.json...
echo { > config.json
echo   "apiUrl": "%API_BASE%/pending", >> config.json
echo   "token": null, >> config.json
echo   "userId": null, >> config.json
echo   "userEmail": null, >> config.json
echo   "configuredAt": "%DATE% %TIME%" >> config.json
echo } >> config.json

echo.
echo Downloading agent files...
echo.

REM Download scanner-agent.js
echo Downloading scanner-agent.js...
powershell -Command "Invoke-WebRequest -Uri '%API_BASE%/agent-download' -OutFile 'scanner-agent.js' -UseBasicParsing" 2>nul
if exist scanner-agent.js (
    echo   [OK] scanner-agent.js downloaded
) else (
    echo   [FAIL] Could not download scanner-agent.js
)

REM Download package.json
echo Downloading package.json...
powershell -Command "Invoke-WebRequest -Uri '%API_BASE%/package-download' -OutFile 'package.json' -UseBasicParsing" 2>nul
if exist package.json (
    echo   [OK] package.json downloaded
) else (
    echo   [FAIL] Could not download package.json
)

REM Download setup.js
echo Downloading setup.js...
powershell -Command "Invoke-WebRequest -Uri '%API_BASE%/setup-download' -OutFile 'setup.js' -UseBasicParsing" 2>nul
if exist setup.js (
    echo   [OK] setup.js downloaded
) else (
    echo   [FAIL] Could not download setup.js
)

echo.
echo ========================================
echo  Installation Complete!
echo ========================================
echo.
echo Config saved. Next step: Authenticate the agent.
echo.
echo AUTHENTICATION (choose one):
echo ----------------------------------------
echo 1. FRONTEND (Recommended):
echo    - Open your DMS web interface
echo    - Log in normally
echo    - The agent will authenticate automatically
echo.
echo 2. MANUAL (via API):
echo    - Call: POST http://localhost:4001/set-token
echo    - Body: { "token": "...", "userId": "...", "userEmail": "..." }
echo.
echo To start the agent, run: agent.bat
echo.

REM Create the agent batch file
echo @echo off > agent.bat
echo cd /d "%%~dp0" >> agent.bat
echo :loop >> agent.bat
echo node scanner-agent.js >> agent.bat
echo timeout /t 5 /nobreak >> agent.bat
echo goto loop >> agent.bat

REM Offer to install to startup
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
pause
