@echo off
TITLE TikTok Live Scrcpy System
echo =========================================
echo  TikTok to ADB Scrcpy Scripter 
echo =========================================
echo.
echo Launching Dashboard and Listener...
echo.

:: Start Persistent TTS Server
start /b python scripts/tts_server.py

:: Start Next.js Development Server
npm run dev
