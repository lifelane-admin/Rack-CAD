@echo off
echo ========================================================
echo  Rack Slicer - Production Preview Server
echo ========================================================
if not exist "dist\" (
    echo Building production dist bundle...
    call npm run build
)
echo Starting Production Preview...
call npm run preview
pause
