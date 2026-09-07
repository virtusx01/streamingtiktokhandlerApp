@echo off
TITLE TikTok Live Scrcpy Trigger
echo =========================================
echo  TikTok to ADB Scrcpy Scripter 
echo =========================================
echo.
echo Installing/Verifying dependencies...
pip install -r requirements.txt
echo.
echo Starting the Listener...
python main.py
pause
