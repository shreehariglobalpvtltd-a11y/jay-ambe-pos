# Jay Ambe POS — system tray icon (v29 Part A)
# Shows "POS server: running", right-click menu: Open POS · LAN address · Stop Server · Hide icon.
param([switch]$SelfTest)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# single-instance lock
$lock = Join-Path $env:TEMP 'jayambe-tray.lock'
$PID | Out-File $lock -Encoding ascii

$icoPath = Join-Path $root 'jayambe.ico'
$icon = $null
if (Test-Path $icoPath) { try { $icon = New-Object System.Drawing.Icon($icoPath) } catch {} }
if (-not $icon) { $icon = [System.Drawing.SystemIcons]::Application }

$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = $icon
$ni.Text = 'Jay Ambe POS — server running'
$ni.Visible = $true

function Open-Pos {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($chrome) { Start-Process $chrome -ArgumentList '--app=http://localhost:3000/','--kiosk-printing','--start-maximized','--new-window' }
  else { Start-Process 'http://localhost:3000/' }
}
function Show-Address {
  $msg = 'Server address nahi mila — kya server chalu hai?'
  try {
    $j = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/ping' -TimeoutSec 3
    if ($j -and $j.ips) {
      $lines = @($j.ips) | ForEach-Object { "http://$($_):3000/" }
      $msg = "Doosre devices (same WiFi) par kholo:`n`n" + ($lines -join "`n") + "`n`nStaff phone:  ?role=mobile`nCustomer menu:  ?role=menu`n`n(QR codes: POS → Settings → Device Access)"
    }
  } catch {}
  [System.Windows.Forms.MessageBox]::Show($msg, 'Jay Ambe POS — LAN Address') | Out-Null
}
function Stop-Server {
  $ok = [System.Windows.Forms.MessageBox]::Show(
    "POS server band karna hai?`n`nSAB devices ki billing ruk jayegi jab tak dobara start nahi karte.",
    'Jay Ambe POS', [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Warning)
  if ($ok -ne [System.Windows.Forms.DialogResult]::Yes) { return }
  $pidFile = Join-Path $root 'data\server.pid'
  $stopped = $false
  if (Test-Path $pidFile) {
    $spid = Get-Content $pidFile
    $p = Get-Process -Id $spid -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $spid -Force -Confirm:$false; $stopped = $true }
  }
  if (-not $stopped) {
    # fallback: any node.exe serving port 3000 (find via netstat owning PID)
    $line = netstat -ano | Select-String ':3000\s' | Select-Object -First 1
    if ($line) {
      $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
      $spid2 = $parts[-1]
      $p2 = Get-Process -Id $spid2 -ErrorAction SilentlyContinue
      if ($p2 -and $p2.ProcessName -eq 'node') { Stop-Process -Id $spid2 -Force -Confirm:$false; $stopped = $true }
    }
  }
  $ni.Text = 'Jay Ambe POS — server STOPPED'
  [System.Windows.Forms.MessageBox]::Show(($(if ($stopped) { 'Server band ho gaya.' } else { 'Server process nahi mila — shayad pehle se band hai.' })), 'Jay Ambe POS') | Out-Null
  $ni.Visible = $false
  [System.Windows.Forms.Application]::Exit()
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add('🍔 Open POS', $null, { Open-Pos })
[void]$menu.Items.Add('📶 LAN Address (phones ke liye)', $null, { Show-Address })
[void]$menu.Items.Add('-')
[void]$menu.Items.Add('⛔ Stop Server', $null, { Stop-Server })
[void]$menu.Items.Add('✕ Hide icon (server chalta rahega)', $null, {
  $ni.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$ni.ContextMenuStrip = $menu
$ni.add_DoubleClick({ Open-Pos })

if ($SelfTest) {
  Start-Sleep -Seconds 2
  $ni.Visible = $false
  $ni.Dispose()
  Write-Output 'TRAY_SELFTEST_OK'
  exit 0
}
[System.Windows.Forms.Application]::Run((New-Object System.Windows.Forms.ApplicationContext))
