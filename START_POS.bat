@echo off
title Jay Ambe POS - One-Click Launcher
cd /d "%~dp0"

echo.
echo   ========================================
echo     JAY AMBE POS  -  Starting up...
echo   ========================================
echo.

rem --- Node.js check ---
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js nahi mila.
  echo       Ek baar install karo:  https://nodejs.org
  echo.
  pause
  exit /b
)

rem --- Start the LAN server (minimized, stays running in its own window) ---
echo   [1/3] Server start ho raha hai...
start "Jay Ambe POS Server" /min cmd /c "node server.js"

rem --- Wait until port 3000 is accepting connections ---
echo   [2/3] Server ke ready hone ka intezaar...
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',3000);$c.Close();exit 0}catch{Start-Sleep -Milliseconds 350}};exit 1"

rem --- Find Chrome ---
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

rem --- Open the POS (Chrome app + silent printing if available) ---
echo   [3/3] POS khul raha hai...
if defined CHROME (
  start "" /high "%CHROME%" --app=http://localhost:3000/ --kiosk-printing --start-maximized --new-window --disable-features=Translate,CalculateNativeWinOcclusion --enable-gpu-rasterization --enable-zero-copy --enable-oop-rasterization --ignore-gpu-blocklist --disable-frame-rate-limit --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
) else (
  echo   Chrome nahi mila - default browser me khol raha hu...
  start "" "http://localhost:3000/"
)

echo.
echo   ========================================
echo     READY!  POS Chrome me khul gaya.
echo.
echo     Phone / Menu device pe kholo:
echo       http://(is PC ka IP):3000/
echo.
echo     Band karne ke liye "Jay Ambe POS Server"
echo     wali window close karo.
echo   ========================================
echo.
echo   (Ye window 6 second me apne aap band ho jayegi)
timeout /t 6 >nul
exit /b
