# Jay Ambe POS — Installation Guide

## System Requirements

- Windows 10 or 11 (the installer and printer bridge are Windows-first; the app itself also runs on macOS/Linux via `node server.js`, but printing then uses CUPS `lp` instead of `Out-Printer`)
- Google Chrome (recommended — used in kiosk mode for silent, dialog-free printing)
- A thermal receipt printer (58mm or 80mm) connected via USB/shared Windows printer, or a network/IP printer (raw port, commonly 9100)
- All devices (counter PC, waiter phones, customer phones) on the **same WiFi network**
- No internet connection required for day-to-day billing — the app runs fully offline over your local WiFi. Internet is only used once to load the QR-code library in Settings.

## Installation Steps

1. Copy the whole `jay-ambe-pos` folder to the counter PC (e.g. `C:\JayAmbe_POS\jay-ambe-pos`).
2. Double-click **`INSTALL.bat`**. Approve the "Admin permission chahiye" prompt (needed once, only to add a firewall rule so phones can connect).
3. The installer will, in order:
   - Check for Node.js and install it automatically (via `winget`) if missing
   - Create the `data\` folder (this is where all your bills/menu are saved)
   - Add a Windows Firewall rule opening port 3000 so phones/other PCs can reach the counter PC
   - Create a **"Jay Ambe POS"** shortcut on the Desktop
   - Ask if you want the POS to auto-start when the PC turns on
4. When it finishes, it prints the PC's WiFi IP address (e.g. `192.168.1.50`) — note this down.

## First-Time Setup

1. Double-click the **"Jay Ambe POS"** desktop icon. Chrome opens in kiosk mode pointed at `http://localhost:3000/`.
2. Pick **🖥️ Admin** on the welcome screen.
3. Go to **Settings** and do the following, in order:
   - **Bill Settings**: enter your restaurant name, address, phone, FSSAI/GST numbers, footer message, and upload a logo (PNG/JPG — transparent PNGs are handled correctly and will not show a black box).
   - **Security Center** (⚙️ or `Ctrl+Shift+L`): set an Admin PIN/master password on first use — the app will not lock you out if you skip this, but it's strongly recommended before real business use.
   - **📱 Device Access**: confirm the IP shown matches what the installer printed, and note the QR code — this is the **one universal QR** your staff will scan on their phones to take orders (see the User Guide's "QR Ordering" section — one code works for every table, no need to print one per table).
   - **🖨️ Printer Center**: click **Detect Printers**, confirm each printer's paper width (58mm/80mm), and assign KOT/Bill roles (see User Guide → Printer Setup).
   - **Tables**: adjust table numbers/sections to match your floor plan if the defaults don't fit.
4. Add your menu items under **Menu** (categories, prices, and optionally a cost price for real profit tracking on the Dashboard).
5. You're ready to bill. Keep the counter PC running and reachable on WiFi — that's what powers phones and other counters.

## Multi-Counter (2+ Billers) Setup

1. Run `INSTALL.bat` on **every** PC that will bill (same folder copied to each).
2. Only **one** PC needs to be the "main" server — start the POS there first.
3. On the other PC(s), open Chrome to `http://<MAIN-PC-IP>:3000/` instead of using their own local server.
4. Each PC picks its biller identity (e.g. "Counter" / "Outdoor") on first boot — configurable under Settings → Printer Center → Billers.

## Uninstalling

There's no separate uninstaller — delete the project folder, remove the Desktop shortcut, and (optionally) remove the Windows Firewall rule named "Jay Ambe POS" and the Startup-folder shortcut if you enabled auto-start.
