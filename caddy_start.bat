@echo off
TITLE Caddy Unified Proxy
echo ===================================================
echo  Caddy Unified Proxy (Multiple Projects)
echo ===================================================
echo.
echo  [Project 1] http://localhost.aa -> localhost:3005
echo  [Project 2] http://localhost.bb    -> localhost:3000
echo.
echo ===================================================
echo  IMPORTANT: Ensure your HOSTS file includes:
echo  127.0.0.1 localhost.aa
echo  127.0.0.1 localhost.bb
echo ===================================================
echo.
echo Starting Caddy...
caddy run --config Caddyfile
pause
