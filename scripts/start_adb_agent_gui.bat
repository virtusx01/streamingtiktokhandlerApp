@echo off
cd /d "%~dp0\.."
where pythonw >nul 2>nul
if %errorlevel%==0 (
  start "" pythonw scripts\adb_agent_gui.py
  exit /b 0
)
where pyw >nul 2>nul
if %errorlevel%==0 (
  start "" pyw scripts\adb_agent_gui.py
  exit /b 0
)
echo Python with Tkinter was not found. Install Python for Windows and try again.
pause
