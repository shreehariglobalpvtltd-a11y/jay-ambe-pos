@echo off
REM Jay Ambe POS — Silent Print Mode
REM --kiosk-printing = sends print directly to default printer (no dialog)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --new-window 
"C:\JayAmbe_POS\jay-ambe-pos"
