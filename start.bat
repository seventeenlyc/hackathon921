@echo off
setlocal
cd /d "%~dp0"

rem --- Prefer: project-local Node 16 + npm; fall back to system npm on PATH ---
set "NPM=npm"
if exist ".nodeenv\node-v16.20.2-win-x64\npm.cmd" set "NPM=.nodeenv\node-v16.20.2-win-x64\npm.cmd"

rem --- 探测一个空闲端口：1234 常被本机其它服务占用，从 4100 起扫描 ---
rem --- 若无空闲则退回 1234（Parcel 会自动让出被占端口，但浏览器地址可能打不开） ---
set "DEV_PORT="
for  /L %%P in (4100, 1, 5999) do (
    netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul 2>&1
    if errorlevel 1 ( set "DEV_PORT=%%P" & goto portfound )
)
:portfound
if not defined DEV_PORT set "DEV_PORT=1234"
set "URL=http://localhost:%DEV_PORT%/index.html"

echo ================================================================
echo   Inert - Dev Server Launcher
echo   npm : %NPM%
echo   URL : %URL%
echo ================================================================
echo.

rem --- 首次运行自动装依赖 ---
if not exist "node_modules\parcel-bundler" (
    echo [start] Installing dependencies, please wait...
    call "%NPM%" install --foreground-scripts --no-audit --no-fund
    if errorlevel 1 goto err
)

rem --- 启动后约 8 秒自动打开浏览器 ---
start "" /min cmd /c call "%~dp0.nodeenv\open-dev.cmd" "%URL%"

echo [start] 启动开发服务器，端口 %DEV_PORT%
echo [start] 浏览器将自动打开: %URL%
echo [start] 关闭本窗口或 Ctrl+C 即可停止服务器。
echo.
"%NPM%" run dev -- -p %DEV_PORT%
goto end

:err
echo [start] 启动失败，请查看上方输出。
pause
:end
pause
exit /b 0
