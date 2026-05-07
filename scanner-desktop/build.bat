@echo off
echo ========================================
echo RHV DMS Scanner Desktop Build Script
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed
    echo Please reinstall Node.js which includes npm
    pause
    exit /b 1
)

echo.
echo Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Checking icon files...
if not exist "assets\icon.ico" (
    echo WARNING: icon.ico not found in assets directory
    echo Please create icon files (see assets\README.md)
    echo.
    echo Press any key to continue anyway...
    pause
)

echo.
echo Building Windows installer...
npm run build:win
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build completed successfully!
echo ========================================
echo.
echo Installer location: %~dp0dist\*.exe
echo.
echo To test the installer:
echo 1. Run the .exe file
echo 2. Check system tray for RHV DMS Scanner icon
echo 3. Place a file in Documents\Scan folder
echo 4. Check if it gets processed
echo.
echo Press any key to exit...
pause >nul