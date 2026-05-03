@echo off
echo ========================================
echo DMS Scanner Setup Script
echo ========================================
echo.
echo This will create a scanner service account
echo and configure the watcher automatically.
echo.
pause

cd ..\api
echo.
echo Running scanner account creation...
echo.
node src\utils\create-scanner-user.js

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Setup failed. Make sure:
    echo 1. MongoDB is running on localhost:27017
    echo 2. Backend .env contains JWT_SECRET
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo Next steps:
echo   1. Start the watcher: cd watcher && npm start
echo   2. Drop scanned files into: C:\Users\user\Documents\Scan
echo.
pause
