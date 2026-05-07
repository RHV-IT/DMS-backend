@echo off
echo ========================================
echo RHV DMS Scanner - Installation Test
echo ========================================
echo.

echo Testing local API server...
curl -s http://localhost:4001/health | findstr "running" >nul
if %errorlevel% neq 0 (
    echo ERROR: Local API server not responding
    echo Make sure RHV DMS Scanner is running
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo ✓ Local API server is running
echo.

echo Testing scan directory...
if not exist "%USERPROFILE%\Documents\Scan" (
    echo ERROR: Scan directory not created
    echo Expected: %USERPROFILE%\Documents\Scan
) else (
    echo ✓ Scan directory exists: %USERPROFILE%\Documents\Scan
)

echo.

echo Testing config directory...
if not exist "%USERPROFILE%\Documents\RHV-DMS-Scanner" (
    echo ERROR: Config directory not created
    echo Expected: %USERPROFILE%\Documents\RHV-DMS-Scanner
) else (
    echo ✓ Config directory exists: %USERPROFILE%\Documents\RHV-DMS-Scanner
)

echo.

echo Checking system tray (manual check required)...
echo Look for RHV DMS Scanner icon in system tray
echo Right-click the icon to access settings
echo.

echo ========================================
echo Test completed!
echo ========================================
echo.
echo If all checks passed, the installation is working correctly.
echo.
echo Next steps:
echo 1. Configure authentication token via frontend
echo 2. Place files in Documents\Scan folder
echo 3. Monitor uploads in pending scans
echo.
echo Press any key to exit...
pause >nul