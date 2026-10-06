@echo off
setlocal
cd /d "%~dp0"
title RackSlicer Offline Server

echo ========================================================
echo    Launching RackSlicer Offline Server...
echo ========================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [Found Node.js] Launching with Node.js high-performance server...
    node start-server.js
    goto :end
)

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [Found Python] Launching with Python 3 server...
    python start-server.py
    goto :end
)

where py >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [Found Python Launcher] Launching with Python server...
    py start-server.py
    goto :end
)

echo [No Node.js or Python detected]
echo Launching with native Windows PowerShell server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"

:end
if %ERRORLEVEL% neq 0 (
    echo.
    echo Server stopped or encountered an error.
    pause
)
