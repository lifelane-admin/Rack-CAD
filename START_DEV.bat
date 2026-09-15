@echo off
echo ========================================================
echo  Rack Slicer - Development Server
echo ========================================================
echo Checking node_modules...
if not exist "node_modules\" (
    echo node_modules not found. Installing dependencies...
    call npm install
)
echo Starting Vite Dev Server...
call npm run dev
pause
