@echo off
title Nova Pyra Attendance
cd /d "%~dp0"

:: Ensure Node/npm is on the PATH
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo.
echo  Nova Pyra Attendance - Starting server...
echo.

:: Start the dev server in a minimized window
start "Nova Pyra Server" /MIN cmd /k "cd /d "%~dp0" && npm run dev"

:: Wait for the server to be ready
timeout /t 6 /nobreak > nul

:: Open the kiosk page in the default browser
start http://localhost:3000/kiosk
