@echo off
setlocal
cd /d "%~dp0"
title Valorant Tournament Overlay Server

echo ===================================================
echo   Starting Valorant Tournament Broadcast Overlay...
echo ===================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not installed or not in PATH!
  echo Please install Node.js from https://nodejs.org
  pause
  exit /b 1
)

if not exist "public\admin\index.html" (
  echo [WARNING] Missing "public" folder!
  echo Please make sure you extracted all files from the ZIP folder,
  echo and did not move start.bat away from the project files.
  echo.
  pause
)

if not exist "node_modules\" (
  echo Installing dependencies... Please wait a moment.
  call npm install --no-audit --no-fund
  echo.
)

echo Starting server...
timeout /t 2 /nobreak >nul
start http://localhost:3000/admin
node server.js

pause
