@echo off
REM Build script for RHV DMS Scanner Desktop Installer

echo Building RHV DMS Scanner Desktop...

REM Navigate to scanner-desktop directory
cd scanner-desktop

REM Install dependencies
echo Installing dependencies...
call npm install

REM Build the Electron app
echo Building installer...
call npm run build:win

echo Build complete! Installer available at: scanner-desktop\dist\
pause