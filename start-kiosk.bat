@echo off
title Nova Pyra Attendance
cd /d "%~dp0"

:: Ensure Node/npm is on the PATH
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo.
echo  Nova Pyra Attendance - Starting server...
echo.

:: Start the production server (run "npm run build" once after any code update)
start "Nova Pyra Server" /MIN cmd /k "cd /d "%~dp0" && npm run start"

:: Wait for the server to be ready
timeout /t 5 /nobreak > nul

:: Open the kiosk page in the default browser
start http://localhost:3000/kiosk
