# Jay Ambe POS (web version)

A simple billing app that runs in any browser. No installation, no server.

## How to open it

- **On your computer:** double-click `index.html`. It opens in Chrome or Edge.
- **Online (GitHub Pages):** in the GitHub repository go to *Settings → Pages*, choose
  *Deploy from a branch*, branch `main`, folder `/ (root)`. The app will then be at
  `https://<your-account>.github.io/jay-ambe-pos/web/`.

## Daily use

1. **Tables** tab: green = free, orange = has an order. Tap a table (or a Parcel slot).
2. Pick a category on the left, tap items to add them. Use − / + to change quantity.
3. **Print Bill** prints the bill for the customer before they pay (optional).
4. **Settle & Pay**: type how much came by Cash, Online/UPI and Card. You can split.
   If less is paid than the total, the rest becomes **baki** and you must enter the customer's name.
5. **Save & Print** saves the bill, prints it and frees the table.
6. **Bills** tab: today's bills with cash/online/card/baki totals, and Reprint.
7. **Baki** tab: who owes money. Tap **Collect** when they pay.

## Where is the data?

Everything is saved inside the browser on this one device (`localStorage`).
That means:

- Clearing browser data deletes it. Use **Settings → Download backup** every day.
- Another phone or computer will not see these bills yet. Syncing between devices is a later step.

## Printing

The bill uses the browser's print window. Choose your thermal printer there and set
margins to *None*. Pick 80 mm or 58 mm paper in Settings.
Tip: starting Chrome with `--kiosk-printing` prints straight away without the print window.

## Files

| File | What it does |
|---|---|
| `index.html` | The screens (tables, order, bills, baki, menu, settings) |
| `style.css` | How it looks, including the printed bill layout |
| `app.js` | All the logic: orders, payments, baki, printing, saving |
| `default-menu.js` | The starting menu, used only the first time |
