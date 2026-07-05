@echo off
setlocal EnableDelayedExpansion
title Jay Ambe POS - Installer (ek baar chalao)
cd /d "%~dp0"

echo.
echo   ================================================
echo     JAY AMBE POS  -  INSTALLER
echo     (naye computer par bas ISI ko ek baar chalao)
echo   ================================================
echo.

rem ---------- 0. Admin elevation (firewall rule ke liye) ----------
net session >nul 2>nul
if errorlevel 1 (
  echo   [i] Admin permission chahiye - dialog me YES dabao...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

rem ---------- 1. Node.js ----------
echo   [1/5] Node.js check...
where node >nul 2>nul
if errorlevel 1 (
  echo         Node.js nahi mila - winget se install kar raha hu...
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent
  where node >nul 2>nul
  if errorlevel 1 (
    echo   [X] Auto-install nahi hua. https://nodejs.org se LTS install karke
    echo       INSTALL.bat dobara chalao.
    pause & exit /b 1
  )
)
for /f "tokens=*" %%v in ('node -v') do echo         Node %%v OK

rem ---------- 2. Data folder ----------
echo   [2/5] Data folder...
if not exist "data" mkdir data
echo         data\ OK (bills yahi save honge - backup isi folder ka lena)

rem ---------- 3. Firewall (phone/dusra PC connect ho sake) ----------
echo   [3/5] Firewall rule (port 3000)...
netsh advfirewall firewall show rule name="Jay Ambe POS" >nul 2>nul
if errorlevel 1 (
  netsh advfirewall firewall add rule name="Jay Ambe POS" dir=in action=allow protocol=TCP localport=3000 >nul
  echo         Rule add hua - ab phone/dusre PC connect kar payenge
) else (
  echo         Rule pehle se hai OK
)

rem ---------- 4. Desktop shortcut ----------
echo   [4/5] Desktop shortcut...
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Jay Ambe POS.lnk');" ^
  "if (Test-Path '%~dp0Jay Ambe POS.vbs') { $lnk.TargetPath = 'wscript.exe'; $lnk.Arguments = '\"%~dp0Jay Ambe POS.vbs\"' } else { $lnk.TargetPath = '%~dp0START_POS.bat' };" ^
  "$lnk.WorkingDirectory = '%~dp0';" ^
  "if (Test-Path '%~dp0jayambe.ico') { $lnk.IconLocation = '%~dp0jayambe.ico' };" ^
  "$lnk.Description = 'Jay Ambe POS - Restaurant Billing';" ^
  "$lnk.Save()"
echo         Desktop par "Jay Ambe POS" ban gaya

rem ---------- 5. Auto-start on PC login (optional) ----------
echo   [5/5] PC on hote hi POS apne aap chalu ho?
choice /c YN /m "        Auto-start chahiye (Y=haan / N=nahi)"
if !errorlevel!==1 (
  powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell;" ^
    "$lnk = $ws.CreateShortcut([Environment]::GetFolderPath('Startup') + '\Jay Ambe POS.lnk');" ^
    "if (Test-Path '%~dp0Jay Ambe POS.vbs') { $lnk.TargetPath = 'wscript.exe'; $lnk.Arguments = '\"%~dp0Jay Ambe POS.vbs\"' } else { $lnk.TargetPath = '%~dp0START_POS.bat' };" ^
    "$lnk.WorkingDirectory = '%~dp0';" ^
    "$lnk.Save()"
  echo         Auto-start ON
) else (
  echo         Auto-start skip (desktop icon se chalana)
)

rem ---------- Done ----------
echo.
echo   ================================================
echo     INSTALL COMPLETE!
echo.
echo     Chalane ke liye : Desktop ka "Jay Ambe POS" icon
echo     Phone pe menu   : http://IS-PC-KA-IP:3000/
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo       IP mila       :%%a
echo.
echo     2-BILLER SETUP (do computer):
echo       1. Dono PC par ye folder copy karke INSTALL.bat chalao
echo       2. MAIN PC par POS kholo - wahi server hai
echo       3. Dusre PC ke Chrome me kholo: http://MAIN-PC-IP:3000/
echo       4. Har PC boot par apna biller chunega (Counter/Outdoor)
echo   ================================================
echo.
pause
exit /b 0
