# Claude Code Prompt — PetPooja-style Category-wise Printer Routing for Jay Ambe POS v26 (Tauri)

Paste everything below this line into Claude Code, run from the project root:
`C:\JayAmbe_POS\jay-ambe-pos`

---

## Context

This is a Tauri-powered desktop POS app ("Jay Ambe POS v26") for a restaurant.

- `v26.html` — the entire POS UI/logic (~9,300 lines, single file). Menu items live in `state.menu` with fields `{id, name, cat, price, nonveg, commType, commVal}`. Categories are managed separately in a `v22Categories` array (`localStorage['ja_v22_cats']`), each `{id, name, emoji, color, sortOrder, visible, description}`, fully user-editable (add/delete/rename) via `addCategory()`/`deleteCategory()` (~line 6805-6826). Orders are built in `placeOrder()` (~line 2066) as `{id, items:[{id,name,price,qty,comm}], total, train, ...}` — **items do not currently carry their category**. KOT tickets are built in `placeOrderWithKOT()` (~line 5422) and printed via `printKOT(id)` (~line 5524, and an override ~line 8608) as **one single flat ticket** with no category grouping. `printBill(order)` (~line 2154) likewise renders one flat bill via the browser print dialog.
- `bridge.js` — loaded after v26.html via `<script src="bridge.js"></script>`. This is the Tauri desktop bridge: it detects `window.__TAURI__`, defines 5 fixed printer slots (`p1_kot_kitchen`, `p2_kot_bar`, `p3_bill_counter`, `p4_bill_copy`, `p5_report`) stored in `localStorage['ja_printer_config']`, builds raw ESC/POS byte content (`buildEscBill`, `buildEscKOT`), and sends it to a named Windows printer via the Rust command `raw_print`. It currently patches `window.printKOT` to send the **same flat KOT** to both `p1_kot_kitchen` and `p2_kot_bar` (not split by category) and patches `window.printBill` to send the same flat bill to `p3_bill_counter`/`p4_bill_copy`.
- `src-tauri/src/main.rs` — Rust backend. Key commands: `raw_print(printer, content)` (copies a raw byte temp file to `\\localhost\<printer name>`, falls back to `PRINT.EXE`, then PowerShell `Out-Printer`), `list_printers()` (runs `wmic printer get name` to list **all printers known to Windows — this already includes both USB-connected and network/LAN-shared printers**, since Windows treats both as named printer queues), plus SQLite order sync and JSON auto-backup commands.
- `src-tauri/tauri.conf.json` / `Cargo.toml` — Tauri v1, `rusqlite` bundled SQLite, fs/dialog/notification allowlisted, `shell-open-api`.

**Goal:** Make printer routing behave like PetPooja — each menu category is mapped to a print station (e.g. Starters/Main Course → Kitchen printer, Beverages → Bar printer, everything else → Bill/Counter printer), so placing one order automatically prints separate, correctly-grouped tickets to each relevant printer, on top of the existing 5-slot `bridge.js` infrastructure. Both USB and network printers must work, since `list_printers()` already surfaces both kinds — the new code must not assume printers are local-USB-only.

## What to build

### 1. Category → Printer-Station mapping (new, in v26.html)

- Extend each `v22Categories` entry with a `station` field (string, one of: `kitchen`, `bar`, `counter`, `report`, or a custom station key — make it extensible, not hardcoded to 2 stations). Default existing categories sensibly (e.g. Starters/Main Course/Chinese/Roti/Thali/Breakfast/Chef Special → `kitchen`; Beverages → `bar`; anything uncategorized → `counter`).
- Add a small UI block in the existing category management screen (wherever `addCategory`/`deleteCategory` UI lives) letting the user pick a station per category from a dropdown. Persist with the rest of `v22Categories` in `localStorage['ja_v22_cats']`.
- Add a migration step so existing saved categories that lack `station` get a sensible default the first time the app loads after this update (don't break existing data).

### 2. Carry category through the order → KOT pipeline

- When building cart items / order items in `placeOrder()` and `placeOrderWithKOT()`, attach the resolved `cat` (and ideally resolved `station`) onto each `order.items[i]` / `kotEntry.items[i]` at the time the item is added, by looking it up from `state.menu`. Do this even if `state.menu` later changes, so historical orders/KOTs keep the station they were rung up with.
- Update the KOT ticket builder so a single order can produce **multiple KOT tickets**, one per distinct station present in that order's items (e.g. an order with 2 starters + 1 cold drink produces a Kitchen KOT with the 2 starters and a Bar KOT with the 1 drink). Keep today's single-ticket behavior as the fallback when station data is missing.

### 3. Update `bridge.js` print routing

- Replace the current hardcoded "send same flat KOT to both p1 and p2" logic in the `window.printKOT` patch with: read the per-station KOT tickets produced in step 2, and route each one to the printer slot configured for that station (map `kitchen`→`p1_kot_kitchen`, `bar`→`p2_kot_bar`; if new custom stations are introduced beyond the original 5 slots, extend `DEFAULT_PRINTER_CFG` and the slot UI accordingly rather than dropping them).
- Keep `window.printBill` sending the flat bill to `p3_bill_counter`/`p4_bill_copy` as today (PetPooja also keeps the customer bill as one document) — only the KOT needs per-station splitting.
- Preserve all existing safety behavior: the double-click guard (`_billPrintBusy`), the `allSettled`-style `Promise.all` error handling and toasts, and the fallback to the on-screen print popup (`_origPrintKOT`/`_origPrintBill`) when no relevant printer slot is configured or sending fails.
- Make sure `buildEscKOT` accepts/produces a per-station subset of items (header should say which station, e.g. "** KOT — KITCHEN **" / "** KOT — BAR **") instead of always "** KOT **".

### 4. Printer Settings UI (`renderPrinterSettings` / `pg-printer` page in bridge.js)

- Show, for each printer slot, which categories/stations are currently routed to it, so staff can verify e.g. "Kitchen printer ← Starters, Main Course, Chinese, Roti".
- Keep the existing per-slot controls (device select, copies, auto-cut, enabled) and the "Refresh Printers" / "Test Print" buttons working unchanged — `list_printers()` already returns both USB and network printers from Windows, so the dropdown needs no changes there, just confirm the label makes clear it includes network/shared printers (e.g. helper text: "Includes USB and network/shared printers visible to Windows").

### 5. Multi-counter / multi-LAN-station awareness (optional but PetPooja-like)

- If feasible without a backend rewrite: support more than 5 logical printer slots so a restaurant with multiple physical print stations on the same LAN (e.g. two kitchen printers for two sections) can each get their own slot and station mapping, rather than being hard-limited to exactly 5. Keep backward compatibility with existing saved configs that only have the 5 original keys.

## Constraints

- Do not break the existing SQLite sync, auto-backup, or non-printing flows in `bridge.js` or `v26.html`.
- Keep `bridge.js` a no-op when not running inside Tauri (`isTauri` check at the top) — browser-mode fallback behavior must be unchanged.
- Keep everything backward-compatible with existing `localStorage` data (`ja_printer_config`, `ja_v22_cats`, `ja_system_printers`) — write migration code, don't assume clean state.
- No new Rust commands should be needed for this feature (category routing is a JS-side concern); only touch `main.rs` if you find a genuine gap (e.g. printing multiple tickets needs no Rust change since `raw_print` already takes arbitrary content per call).
- Test path: after changes, run `dev.bat` (`cargo tauri dev`) and verify: (a) an order with mixed-category items produces separate Kitchen/Bar KOT prints, (b) bill still prints as one document to the counter printer, (c) existing saved printer configs from before this change still load without errors.

## Deliverable

Implement the above directly in `v26.html`, `bridge.js`, and (only if truly necessary) `src-tauri/src/main.rs`. Summarize what changed and any manual testing steps I should run on the actual printers afterward.
