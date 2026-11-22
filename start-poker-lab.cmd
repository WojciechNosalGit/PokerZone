@echo off
cd /d "%~dp0"
python --version >nul 2>&1
if errorlevel 1 (
    py -3 server.py --open
) else (
    python server.py --open
)
if errorlevel 1 pause
