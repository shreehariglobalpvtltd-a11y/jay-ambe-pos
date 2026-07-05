# Jay Ambe POS — Troubleshooting

### "🔴 Server nahi mila" / phones can't connect
- Make sure the counter PC's POS is actually running (desktop icon, or check the system tray icon).
- Phone and PC must be on the **same WiFi network** (not phone's mobile data).
- Re-check the IP shown in Settings → 📶 Device Access — WiFi routers sometimes hand out a new IP after a restart. See the "Static IP" guide inside that same Settings card to make it permanent.
- If you just ran `INSTALL.bat`, confirm the firewall rule was added (it prints "Rule add hua" — if it says "Rule pehle se hai OK" that's also fine).

### Printer not detected / "Koi printer nahi mila"
- The printer must be installed in **Windows** first (Control Panel → Printers) — the app lists whatever Windows already sees, it doesn't discover hardware itself, except for network/IP printers (see next point).
- For a network/thermal printer with no Windows driver, use Printer Center → **🌐 Add Network/IP Printer** and enter its IP and port (commonly `9100`) directly — no Windows install needed.
- Click **🔍 Detect Printers** again after installing/connecting a printer — the list only refreshes on demand.

### Bill/KOT printed but looks wrong (too narrow / off-center)
- Open Printer Center and check that printer's **Paper** setting matches your actual paper (58mm = 32 columns, 80mm = 42, 80mm wide = 48). An unconfirmed width shows a "⚠️ Paper width confirm karo" chip on that row — click into it and set the right size once.

### Nothing prints and a "disabled" message shows
- That printer has been turned off in Printer Center (⛔ Disable). Go to Printer Center and click **✅ Enable** on it, or reassign that station/table/category to a different printer.

### Logo shows with a black background / looks wrong on the receipt
- This was a known issue with older uploaded logos that had a transparent background — fixed: logos are now flattened onto white the moment you upload them, so re-upload the logo once from Settings → Bill Settings and it will print correctly from then on.
- Note: the day-to-day KOT/Bill print (via the LAN server, the default and recommended mode) is plain text for speed and thermal-paper compatibility — it does not print an image logo on the receipt itself, only in the on-screen preview and the offline/no-server fallback print.

### Forgot the Admin PIN / locked out
- Go to Security Center's recovery flow if you set up a master password + recovery code (recommended during first-time setup — see Installation Guide).
- If nothing was ever configured, the app never fully locks you out — guarded actions fall back to a plain confirmation instead of a PIN.
- As a last resort with physical access to the PC, the PIN is stored (hashed) in the browser's localStorage under `ja_pin_cfg` — clearing that key resets PIN setup (you'll be asked to set new PINs on next launch). This does **not** touch your menu/orders.

### QR code doesn't generate in Settings
- QR generation needs internet the **first time only** (it loads a small QR-drawing library from a CDN). After that first load, your browser caches it and it works offline too.

### "Port already in use" / server won't start
- Another copy of the server may already be running (the launcher checks for this and won't start a second one on purpose). Check the system tray for the Jay Ambe POS icon — if there's one, it's already running; just open the Desktop icon again.
- If you're sure nothing is running, `data\server.pid` may be stale — the launcher already checks the actual port, not just this file, so this is rarely the real cause.

### I want to start completely fresh (new install, remove old sample data)
- Security Center → Danger Zone → **Factory Reset** downloads a safety backup automatically, then clears all data and reloads to a clean first-run state (default settings only, no old menu/orders).
- This is different from a bill-by-bill delete — use it only when you genuinely want to wipe everything, e.g. before officially opening for business, or before handing the device to a different owner.

### A bill/order looks wrong or was deleted by mistake
- Check Security Center → **Trash** — deleted orders/menu items/categories are recoverable there, not gone immediately.

### Still stuck
- Check Security Center → **Error Log** for anything the app itself has caught and logged.
- Check Security Center → **Audit Logs** to see exactly what action was taken, by whom, and when — every guarded/high-risk action is logged.
