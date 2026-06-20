@echo off
title Jay Ambe POS — Tauri Setup Installer
color 0A
echo.
echo ============================================================
echo   JAY AMBE POS — COMPLETE TAURI INSTALLER
echo   Jay Ambe Fast Food ^& Restaurant, Mehsana
echo ============================================================
echo.

echo [1/6] Installing Node.js LTS...
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Node.js install might have failed or is already installed.
)
echo.

echo [2/6] Installing Rust (rustup)...
winget install Rustlang.Rustup --accept-source-agreements --accept-package-agreements
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Rustup install might have failed or is already installed.
)
echo.

echo [3/6] Setting Rust to stable...
call rustup default stable
echo.

echo [4/6] Adding Windows MSVC target...
call rustup target add x86_64-pc-windows-msvc
echo.

echo [5/6] Installing Tauri CLI...
call cargo install tauri-cli
echo.

echo [6/6] Installing npm dependencies...
call npm install
echo.

echo ============================================================
echo   INSTALLATION COMPLETE!
echo.
echo   Next steps:
echo   1. Copy v26.html into this folder
echo   2. Run dev.bat to start development
echo   3. Run build.bat to create .exe installer
echo.
echo   Jay Shree Ram! Jai Mata Di!
echo ============================================================
echo.
pause
