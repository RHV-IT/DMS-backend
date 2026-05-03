@echo off
REM ================================================
REM  Scanner Agent - Auto Start
REM  Just runs the agent - frontend syncs token
REM ================================================
cd /d "%~dp0"

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    npm install
)

REM Start agent with auto-restart
:run
node scanner-agent.js
echo.
echo Agent stopped. Restarting in 5 seconds...
echo.
timeout /t 5 /nobreak
goto run