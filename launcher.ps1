# Jay Ambe POS — hidden one-click launcher (v29 Part A)
# Started invisibly by "Jay Ambe POS.vbs". Safe to run repeatedly:
#  - server already up  → does NOT start a second copy
#  - tray already up    → does NOT start a second tray
param([switch]$NoBrowser, [switch]$NoTray)
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Test-PosPort {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 3000); $c.Close(); return $true } catch { return $false }
}

# ── 1. Server (hidden window, single instance) ──
if (-not (Test-PosPort)) {
  $proc = Start-Process node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
  if ($proc) {
    if (-not (Test-Path (Join-Path $root 'data'))) { New-Item -ItemType Directory -Force (Join-Path $root 'data') | Out-Null }
    $proc.Id | Out-File (Join-Path $root 'data\server.pid') -Encoding ascii
  }
  for ($i = 0; $i -lt 40; $i++) { if (Test-PosPort) { break }; Start-Sleep -Milliseconds 350 }
}

# ── 2. Desktop shortcut (first run only) ──
$desk = [Environment]::GetFolderPath('Desktop')
$lnk  = Join-Path $desk 'Jay Ambe POS.lnk'
if (-not (Test-Path $lnk)) {
  $ws = New-Object -ComObject WScript.Shell
  $s  = $ws.CreateShortcut($lnk)
  $s.TargetPath = 'wscript.exe'
  $s.Arguments  = '"' + (Join-Path $root 'Jay Ambe POS.vbs') + '"'
  $s.WorkingDirectory = $root
  $ico = Join-Path $root 'jayambe.ico'
  if (Test-Path $ico) { $s.IconLocation = $ico }
  $s.Description = 'Jay Ambe POS — one-click start'
  $s.Save()
}

# ── 3. Tray icon (single instance) ──
if (-not $NoTray) {
  $trayLock = Join-Path $env:TEMP 'jayambe-tray.lock'
  $trayUp = $false
  if (Test-Path $trayLock) {
    $tpid = Get-Content $trayLock
    $tp = Get-Process -Id $tpid -ErrorAction SilentlyContinue
    if ($tp -and $tp.ProcessName -like 'powershell*') { $trayUp = $true }
  }
  if (-not $trayUp) {
    Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',(Join-Path $root 'tray.ps1') -WindowStyle Hidden
  }
}

# ── 4. Open the POS window (Chrome app mode → looks like a real app) ──
if (-not $NoBrowser) {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($chrome) {
    Start-Process $chrome -ArgumentList '--app=http://localhost:3000/','--kiosk-printing','--start-maximized','--new-window','--disable-features=Translate','--disable-background-timer-throttling','--disable-renderer-backgrounding'
  } else {
    Start-Process 'http://localhost:3000/'
  }
}
