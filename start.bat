@echo off
setlocal
cd /d "%~dp0"

set "URL=http://localhost:1234/index.html"

rem --- Prefer project-local Node 16; fall back to system npm ---
set "NPM=npm"
if exist ".nodeenv\node-v16.20.2-win-x64\npm.cmd" set "NPM=.nodeenv\node-v16.20.2-win-x64\npm.cmd"

echo ============================================================
echo   Inert - Dev Server Launcher
echo   npm : %NPM%
echo   URL : %URL%
echo ============================================================
echo.

rem --- Auto-install deps on first run ---
if not exist "node_modules\parcel-bundler" (
    echo [start] Installing dependencies, please wait...
    call "%NPM%" install --foreground-scripts --no-audit --no-fund
    if errorlevel 1 goto err
)

rem --- Background timer: open browser ~8s after server is up ---
start "" /min cmd /c call "%~dp0.nodeenv\open-dev.cmd" "%URL%"

echo [start] Starting dev server in foreground.
echo [start] The page will open automatically: %URL%
echo [start] Close this window or press Ctrl+C to stop the server.
echo.
"%NPM%" run dev
goto end

:err
echo [start] Failed to install/start. Check the output above.
pause

:end
pause
exit /b 0
