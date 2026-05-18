@echo off
title Nova Pyra Attendance
cd /d "%~dp0"

:: Ensure Node/npm is on the PATH
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo.
echo  Nova Pyra Attendance - Launching...
echo  (Run "npm run build" once after any code update)
echo.

:: Launch the Electron desktop app (starts the server internally)
npm run electron
