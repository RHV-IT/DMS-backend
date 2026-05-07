@echo off
REM Build script for RHV DMS Scanner Agent Installer

echo Building RHV DMS Scanner Agent...

REM Navigate to scanner-agent directory
cd scanner-agent

REM Install dependencies
echo Installing dependencies...
call npm install

REM Build the Electron app
echo Building installer...
call npm run dist

echo Build complete! Installer available at: scanner-agent\dist\
pause