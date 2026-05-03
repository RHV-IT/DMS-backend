@echo off
REM =========================================
REM  Scanner Agent
REM =========================================
cd /d "%~dp0"
:loop
node scanner-agent.js
timeout /t 5 /nobreak
goto loop