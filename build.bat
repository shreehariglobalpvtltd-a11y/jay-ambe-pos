@echo off
title Jay Ambe POS — Production Build
echo Building Jay Ambe POS installer...
echo This will take 3-5 minutes on first build.
echo.
call cargo tauri build
echo.
echo Build complete! Check src-tauri\target\release\bundle\
pause
