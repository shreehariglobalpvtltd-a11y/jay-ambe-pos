# Jay Ambe POS — User Guide

## Login

On launch you'll see a role picker:

- **🖥️ Admin** — full access to everything (billing, menu, reports, settings, security).
- **🧑‍🍳 Staff** — same full billing/tables/orders/KOT access as Admin; only Admin-only pages (Settings, Security, Reports config) are hidden once a Staff PIN is set.
- **📱 Mobile** — a small-screen phone view for waiters to take table orders. Requires a Mobile PIN to be set once by Admin (Settings → 📱 Mobile Device PIN).

PINs are 4-digit and set from **Settings**. If nobody has set any PIN yet, Admin access is open by default — set one before going live.

## Dashboard

Shows today's revenue vs yesterday, cash/online split, outstanding Due (Khata) total, and — once you enter `costPrice` on menu items — real profit (never a guessed number). The **Nigrani** card surfaces the last few high-risk security events (deletions, discounts, cancellations) with a link into the Security Center for full detail.

## Tables

- Tap a table to open billing for it. Color coding: blank (empty), running (occupied), printed (KOT sent), paid.
- **🔀 Partitions**: right-click (or long-press) a table → **Partitions** to split it into sections (e.g. Table 1 → Section A / B / C) — useful for large tables or banquet-style seating. Once a table has partitions, selecting it asks which section the order is for (or "Poora Table" for the whole table). Each section can optionally get its own KOT printer from Printer Center → 🔗 Assign.
- **🔗 Merge**: combine multiple occupied tables into one bill.
- **✂️ Split**: split a table's bill into multiple sub-bills (even split or by item).
- **📒 Khata**: bill a regular customer on credit without a full name/number lookup each time; track and collect dues from the Khata Book page.

## Orders & Billing

1. Select a table (or Parcel/Pick-Up).
2. Add items — search or tap categories.
3. Adjust quantity/notes per item, apply a discount if needed, choose payment method and status (Pending/Paid/Due).
4. **Save & Print** sends the bill to the configured Bill printer and, if items were added, a KOT to the kitchen/bar printer(s) automatically split by category/station.

## KOT (Kitchen Order Tickets)

Every KOT automatically includes: restaurant name, KOT number, date & time, table number, waiter, biller, each item with quantity and notes, and clear `===`/`---` separators. Paper width (58mm/80mm) is picked up automatically from what you configured for that printer in Printer Center — you don't need to choose it per print.

## Printer Setup (Printer Center)

Open **🖨️ Printers** from the nav bar:

- **Detect Printers** pulls in every printer installed on this Windows PC.
- **Add Printer (naam se)** lets you add a network-shared printer by its exact Windows name.
- **🌐 Add Network/IP Printer** lets you add a printer by IP address (e.g. `192.168.1.50:9100`) for printers not installed in Windows at all — the app talks to it directly over the network.
- Per printer: set a friendly name, paper width, copies, **Enable/Disable** (a disabled printer is skipped everywhere, safely, until re-enabled), **Duplicate** (clone its settings under a new name), and **Remove**.
- **🔗 Assign** opens one screen per printer where you tick which Categories (KOT), Tables (+ their partitions), Station (kitchen/bar/counter fallback), and whether it's the Bill printer — all from one place, no jumping between cards.
- **🖨️ Test** sends a sample print to confirm the printer is really working before you rely on it for service.

## QR Ordering

Settings → **📶 Device Access** shows **one QR code** for the whole restaurant (not one per table). Print it once and place a copy at each table, at the counter, or hand it to waiters:

1. Waiter/staff scans the QR (or opens the link) on their phone.
2. They log in with the Mobile PIN.
3. They pick **any available table** from the in-app list — no need to scan a different code per table.
4. Orders they send land straight in the Admin/Staff order inbox for that table.
5. Staff can switch to a different table any time from the same screen (🪑 Select Table button) — no re-scan needed.

## Backup & Restore

Settings → **💾 Backup & Data**:

- **⚡ One-Click Backup Now** — instantly saves a snapshot and downloads a dated JSON file.
- **Backup History** — lists every automatic backup (taken every few minutes while the app is open, up to 50 kept) with date, menu count, and bill count. Click **♻️ Restore** on any entry, or **⬇️** to download that specific snapshot.
- Restoring always shows what you're about to load (menu/bill counts) and warns if the backup looks suspiciously empty compared to your current data, before asking you to confirm. A short progress indicator shows while the restore applies.
- **📂 Restore** (file picker) works the same way for a JSON file downloaded earlier or from another PC.

## Settings — quick map

- **Bill Settings** — name, address, GST/FSSAI, footer, logo.
- **📱 Device Access** — the universal ordering QR + LAN IP.
- **🖨️ Printer Center** — see above.
- **💾 Backup & Data** — see above.
- **Security Center** (`Ctrl+Shift+L`) — roles/permissions, audit log, trash/recovery, users, emergency lockdown, factory reset.
- **Menu**, **Inventory**, **Happy Hour**, **Khata** — each has its own nav page for day-to-day management.
