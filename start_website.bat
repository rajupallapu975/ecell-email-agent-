@echo off
title E-Cell Bulk Mail Agent Website
echo ========================================================
echo   E-Cell Bulk Mail Agent - Starting Local Website...
echo ========================================================
cd /d "%~dp0"

echo [1/2] Checking dependencies...
if not exist "node_modules" (
    echo Installing node dependencies...
    call npm install
)

echo [2/2] Launching server on http://localhost:3000 ...
start "" http://localhost:3000
node server/index.js
pause
