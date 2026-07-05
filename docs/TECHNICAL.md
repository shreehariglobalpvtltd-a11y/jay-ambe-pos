# Jay Ambe POS — Technical Guide

## Architecture, in one paragraph

Jay Ambe POS is a **single-file HTML/JS/CSS application** (`jay-ambe-pos-v28.html`) that runs entirely client-side and is **local-first**: all business data (menu, orders, tables, settings) lives in the browser's `localStorage`. A small **zero-dependency Node.js server** (`server.js`) serves that file over your WiFi/LAN, mirrors shared state (orders, menu, tables, printer config) to `data/lan-state.json` so multiple devices stay in sync in real time (via Server-Sent Events), and forwards print jobs to the PC's real printers. There is no database server, no build step, and no `npm install` — everything needed is either a browser built-in or a Node built-in module.

## Folder Structure

```
jay-ambe-pos/
├── jay-ambe-pos-v28.html   # the entire application (UI + logic), loaded by the browser
├── server.js               # LAN server: serves the app, syncs state, prints, zero npm deps
├── launcher.ps1            # hidden one-click launcher: starts server.js + tray icon + Chrome
├── tray.ps1                # system tray icon (Open POS / LAN address / Stop Server)
├── "Jay Ambe POS.vbs"      # what the Desktop shortcut actually runs (invokes launcher.ps1 hidden)
├── START_POS.bat           # simpler alternative launcher (visible console window)
├── INSTALL.bat             # one-time setup: Node.js, firewall rule, desktop shortcut, autostart
├── make-icon.js            # generates jayambe.ico from source art (no npm deps)
├── jayambe.ico             # app/shortcut icon
├── data/                   # runtime data — NOT committed to git (see .gitignore)
│   ├── lan-state.json      # shared live state: orders, menu, tables, printer config
│   ├── lan-state.json.bak  # automatic fallback copy if the main file is corrupt
│   └── server.pid          # PID of the running server, used to avoid double-starting
└── docs/                   # this documentation
```

## Required Files to Run

At minimum: `jay-ambe-pos-v28.html` + `server.js` + a writable `data/` folder (auto-created). Everything else (launcher scripts, installer, icon) is convenience tooling around that core.

## Dependencies

**None to install.** `server.js` only uses Node.js built-in modules: `http`, `fs`, `path`, `os`, `child_process`, `net`. The HTML file uses browser built-ins (`localStorage`, `fetch`, `EventSource`, `Canvas`) plus one CDN library loaded lazily and only when needed: `qrcodejs` (for rendering QR codes in Settings — requires internet the first time it's used, then it's cached by the browser).

Printing uses the OS itself, not a library:
- **Windows**: PowerShell's `Out-Printer` for named Windows printers.
- **macOS/Linux**: CUPS `lp` command.
- **Network/IP printers** (e.g. `192.168.1.50:9100`): a raw TCP socket (Node's `net` module) — no driver needed, works with any ESC/POS thermal printer listening on a raw port.

## Configuration

There are no `.env` files or external config files — all configuration lives in the browser's `localStorage` (per device) and is mirrored server-side into `data/lan-state.json` for cross-device sync. Key `localStorage` keys, if you ever need to inspect or script against them:

| Key | Holds |
|---|---|
| `ja3_menu`, `ja3_orders`, `ja3_tables`, `ja3_counter` | core menu/orders/tables/bill-numbering |
| `ja3_bset` | bill settings (name, address, GST, logo, footer) |
| `ja_v28_printmap` | station/table/bill printer routing (legacy-compatible layer) |
| `ja29_printcfg` | Printer Routing Pro rules (category/table/order-type → printer) |
| `ja_v31_printers` | per-printer metadata: width, copies, enabled/disabled, manual/IP entries |
| `ja_v32_partmap` | table-partition → printer overrides |
| `v25_backups_index` + `v25_backup_<timestamp>` | rolling automatic backup history (up to 50) |
| `ja_sec_*` | Security Center: roles, users, audit log, trash |

Environment variables: `server.js` reads `PORT` (falls back to a CLI argument, then `3000`) — that's the only one. There's nothing else to set.

## How printing routing decides which printer to use

Priority order, each layer falling back to the previous era's logic if nothing matches (so nothing is ever silently dropped):

1. **v32 partition override** — if the order has a table section (partition) with its own printer assigned, use it.
2. **v31/v29 Printer Routing Pro rules** (if "Pro Routing" is switched on) — Table Range > Category > Order Type > Default.
3. **v28 station map** — per-table printer, else per-station (kitchen/bar/counter) printer, else the Bill printer.
4. **Legacy popup print** — if no LAN server is reachable at all (e.g. running the HTML file directly without `server.js`), falls back to the browser's own print dialog.

A disabled printer (Printer Center → Enable/Disable) is blocked at the network-request level regardless of which layer resolved it, so disabling a printer is always effective.

## Extending the code

The HTML file grew through **additive, isolated patch blocks** (`<script id="v29-...">`, `<script id="v31-...">`, `<script id="v32-...">`, etc.), each wrapping earlier global functions rather than editing them in place. If you need to add a feature, follow the same pattern: write a new self-contained `(function(){ ... })()` block near the end of the file, wrap only the specific functions you need to extend, and guard it with a `window.__yourFlag` re-entry check. This is what has let the app grow for many versions without regressions.
