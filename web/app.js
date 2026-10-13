// Jay Ambe POS (web version)
// Everything runs in the browser. All data is kept in localStorage under one key,
// so there is no server and the app can be hosted on GitHub Pages as plain files.

const STORAGE_KEY = 'jayambe_pos_v1';

// ---------- Saving and loading ----------

function freshState() {
  return {
    settings: {
      shopName: 'Jay Ambe Fast Food',
      address: '',
      phone: '',
      gstin: '',
      taxPercent: 0,
      tableCount: 10,
      parcelCount: 3,
      paperWidth: '80',
      footer: 'Thank you! Visit again.',
    },
    menu: DEFAULT_MENU.map(m => ({ ...m })),
    openOrders: {},   // { "T1": { items: [{id,name,price,qty}], startedAt } }
    bills: [],        // settled bills, newest last
    customers: {},    // baki ledger, keyed by phone (or by name when no phone)
    nextBillNo: 1,
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.menu) {
      // Fill in any setting added in a newer version of the app
      saved.settings = { ...freshState().settings, ...saved.settings };
      return saved;
    }
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  return freshState();
}

let state = loadState();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Small helpers ----------

const $ = sel => document.querySelector(sel);

// Money is kept in rupees with at most 2 decimals. round2 stops 0.1 + 0.2 style errors.
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const money = n => '₹' + round2(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Always escape text before putting it into HTML, so a name like <b> cannot break the page.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const timeStr = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const dateTimeStr = iso => new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

function tableLabel(key) {
  return key.startsWith('P') ? 'Parcel ' + key.slice(1) : 'Table ' + key.slice(1);
}

// ---------- Bill maths ----------

// Works out subtotal, discount, GST, round-off and final total for a list of items.
function computeTotals(items, discount = 0) {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const disc = Math.min(round2(discount), subtotal);
  const taxable = round2(subtotal - disc);
  const taxPercent = Number(state.settings.taxPercent) || 0;
  const tax = round2(taxable * taxPercent / 100);
  const exact = round2(taxable + tax);
  const total = Math.round(exact);          // bills are rounded to the nearest rupee
  const roundOff = round2(total - exact);
  return { subtotal, discount: disc, taxPercent, tax, roundOff, total };
}

// ---------- Switching screens ----------

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'tables') renderTables();
  if (name === 'bills') renderBills();
  if (name === 'baki') renderBaki();
  if (name === 'menu') renderMenu();
  if (name === 'settings') renderSettings();
}

document.querySelectorAll('.tabs button').forEach(b =>
  b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- 1. Tables ----------

function tableBox(key) {
  const order = state.openOrders[key];
  const busy = order && order.items.length > 0;
  const total = busy ? computeTotals(order.items).total : 0;
  return `<button class="table-box ${busy ? 'busy' : ''}" data-table="${key}">
    <span class="t-name">${esc(tableLabel(key))}</span>
    <span class="t-info">${busy ? money(total) + ' · ' + timeStr(order.startedAt) : 'Free'}</span>
  </button>`;
}

function renderTables() {
  const s = state.settings;
  let tables = '';
  for (let i = 1; i <= s.tableCount; i++) tables += tableBox('T' + i);
  let parcels = '';
  for (let i = 1; i <= s.parcelCount; i++) parcels += tableBox('P' + i);
  $('#table-grid').innerHTML = tables;
  $('#parcel-grid').innerHTML = parcels || '<p class="hint">No parcel slots. Add some in Settings.</p>';
}

document.addEventListener('click', e => {
  const box = e.target.closest('[data-table]');
  if (box) openOrder(box.dataset.table);
});

// ---------- 2. Order screen ----------

let currentTable = null;
let currentCat = null;

function openOrder(key) {
  currentTable = key;
  currentCat = null;
  $('#order-title').textContent = tableLabel(key);
  $('#item-search').value = '';
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-order'));
  renderOrder();
}

function categories() {
  return [...new Set(state.menu.map(m => m.cat))];
}

function currentItems() {
  return state.openOrders[currentTable]?.items || [];
}

function renderOrder() {
  const cats = categories();
  if (!currentCat || !cats.includes(currentCat)) currentCat = cats[0] || null;

  $('#cat-list').innerHTML = cats.map(c =>
    `<button class="${c === currentCat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');

  // While searching, show matches from every category; otherwise just the chosen one
  const q = $('#item-search').value.trim().toLowerCase();
  const shown = q
    ? state.menu.filter(m => m.name.toLowerCase().includes(q))
    : state.menu.filter(m => m.cat === currentCat);
  $('#item-grid').innerHTML = shown.map(m =>
    `<button class="item" data-add="${esc(m.id)}"><span>${esc(m.name)}</span><b>${money(m.price)}</b></button>`
  ).join('') || '<p class="hint">No items.</p>';

  const items = currentItems();
  $('#cart-items').innerHTML = items.length ? items.map((i, idx) => `
    <div class="cart-row">
      <span class="c-name">${esc(i.name)}</span>
      <span class="qty">
        <button data-qty="${idx}" data-delta="-1">−</button>
        <b>${i.qty}</b>
        <button data-qty="${idx}" data-delta="1">+</button>
      </span>
      <span class="c-amt">${money(i.price * i.qty)}</span>
    </div>`).join('') : '<p class="hint">Tap items to add them.</p>';
  $('#cart-total').textContent = money(computeTotals(items).total);
}

$('#cat-list').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  currentCat = b.dataset.cat;
  $('#item-search').value = '';
  renderOrder();
});

$('#item-search').addEventListener('input', renderOrder);

$('#item-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-add]');
  if (!b) return;
  const m = state.menu.find(x => x.id === b.dataset.add);
  if (!state.openOrders[currentTable]) {
    state.openOrders[currentTable] = { items: [], startedAt: new Date().toISOString() };
  }
  const items = state.openOrders[currentTable].items;
  const line = items.find(i => i.id === m.id);
  if (line) line.qty++;
  else items.push({ id: m.id, name: m.name, price: m.price, qty: 1 });
  save();
  renderOrder();
});

$('#cart-items').addEventListener('click', e => {
  const b = e.target.closest('[data-qty]');
  if (!b) return;
  const items = currentItems();
  const line = items[Number(b.dataset.qty)];
  line.qty += Number(b.dataset.delta);
  if (line.qty <= 0) items.splice(Number(b.dataset.qty), 1);
  if (!items.length) delete state.openOrders[currentTable];
  save();
  renderOrder();
});

$('#back-to-tables').addEventListener('click', () => showView('tables'));

$('#btn-clear').addEventListener('click', () => {
  if (!currentItems().length) return;
  if (!confirm('Remove all items from ' + tableLabel(currentTable) + '?')) return;
  delete state.openOrders[currentTable];
  save();
  renderOrder();
});

// "Print Bill" before payment: the customer sees the amount, nothing is saved as paid yet.
$('#btn-print-draft').addEventListener('click', () => {
  const items = currentItems();
  if (!items.length) return alert('Add items first.');
  printBill({
    no: null,
    date: new Date().toISOString(),
    table: currentTable,
    items,
    ...computeTotals(items),
  });
});

// ---------- 3. Payment ----------

const payForm = $('#pay-form');

function payNumbers() {
  const f = payForm.elements;
  const totals = computeTotals(currentItems(), f.discount.value);
  const cash = round2(f.cash.value), online = round2(f.online.value), card = round2(f.card.value);
  const paid = round2(cash + online + card);
  const baki = round2(totals.total - paid);
  return { totals, cash, online, card, paid, baki };
}

function renderPay() {
  const { totals, paid, baki } = payNumbers();
  $('#pay-totals').innerHTML = `
    <div>Subtotal <b>${money(totals.subtotal)}</b></div>
    ${totals.discount ? `<div>Discount <b>−${money(totals.discount)}</b></div>` : ''}
    ${totals.tax ? `<div>GST ${totals.taxPercent}% <b>${money(totals.tax)}</b></div>` : ''}
    <div class="big">To pay <b>${money(totals.total)}</b></div>`;
  let msg;
  if (baki > 0) msg = `Received ${money(paid)}. <b>${money(baki)} will be added as baki.</b> Enter the customer below.`;
  else if (baki < 0) msg = `Received ${money(paid)}. Return change <b>${money(-baki)}</b>.`;
  else msg = `Fully paid.`;
  $('#pay-baki').innerHTML = msg;
  $('#pay-baki').className = 'pay-baki' + (baki > 0 ? ' warn' : '');
  $('#pay-error').textContent = '';
}

$('#btn-settle').addEventListener('click', () => {
  if (!currentItems().length) return alert('Add items first.');
  payForm.reset();
  const total = computeTotals(currentItems()).total;
  payForm.elements.cash.value = total; // most bills are cash, so start with that
  $('#pay-table').textContent = '· ' + tableLabel(currentTable);
  $('#cust-options').innerHTML = Object.values(state.customers)
    .map(c => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join('');
  renderPay();
  $('#pay-dialog').showModal();
});

payForm.addEventListener('input', renderPay);

// "All Cash / Online / Card / Baki" buttons put the full amount in one box
payForm.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => {
  const f = payForm.elements;
  const total = computeTotals(currentItems(), f.discount.value).total;
  ['cash', 'online', 'card'].forEach(k => { f[k].value = 0; });
  if (b.dataset.all !== 'baki') f[b.dataset.all].value = total;
  renderPay();
}));

// Picking a known customer name fills in their phone
payForm.elements.custName.addEventListener('change', () => {
  const c = Object.values(state.customers).find(x => x.name === payForm.elements.custName.value);
  if (c) payForm.elements.custPhone.value = c.phone;
});

payForm.addEventListener('submit', e => {
  if (e.submitter?.value !== 'ok') return; // Cancel just closes the pop-up
  const { totals, cash, online, card, baki } = payNumbers();
  const name = payForm.elements.custName.value.trim();
  const phone = payForm.elements.custPhone.value.trim();

  if (baki > 0 && !name) {
    e.preventDefault();
    $('#pay-error').textContent = 'Enter the customer name so we know who owes the baki.';
    return;
  }

  // If more was received than the bill (change was returned), only count the bill amount.
  // Take the extra off cash first, since change is given in cash.
  let extra = Math.max(0, -baki);
  const take = amount => {
    const t = Math.min(amount, extra);
    extra = round2(extra - t);
    return round2(amount - t);
  };
  const c2 = take(cash), o2 = take(online), k2 = take(card);

  const bill = {
    no: state.nextBillNo++,
    date: new Date().toISOString(),
    table: currentTable,
    items: currentItems().map(i => ({ ...i })),
    ...totals,
    payments: { cash: c2, online: o2, card: k2 },
    baki: Math.max(0, baki),
    customer: name ? { name, phone } : null,
  };
  state.bills.push(bill);

  if (bill.baki > 0) addBaki(name, phone, bill.baki, bill.no);

  delete state.openOrders[currentTable];
  save();
  printBill(bill);
  showView('tables');
});

// ---------- 4. Baki ledger ----------

function customerKey(name, phone) {
  return phone ? 'ph:' + phone : 'nm:' + name.toLowerCase();
}

function addBaki(name, phone, amount, billNo) {
  const key = customerKey(name, phone);
  const c = state.customers[key] || (state.customers[key] = { name, phone, due: 0, history: [] });
  c.due = round2(c.due + amount);
  c.history.push({ date: new Date().toISOString(), type: 'bill', billNo, amount });
}

function renderBaki() {
  const list = Object.entries(state.customers).filter(([, c]) => c.due > 0)
    .sort((a, b) => b[1].due - a[1].due);
  const total = list.reduce((s, [, c]) => s + c.due, 0);
  $('#baki-body').innerHTML = list.length ? list.map(([key, c]) => `
    <tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td><b>${money(c.due)}</b></td>
    <td><button class="btn" data-collect="${esc(key)}">Collect</button></td></tr>`).join('')
    + `<tr class="sum"><td colspan="2">Total baki</td><td>${money(total)}</td><td></td></tr>`
    : '<tr><td colspan="4" class="hint">Nobody owes anything.</td></tr>';
}

let collectKey = null;

$('#baki-body').addEventListener('click', e => {
  const b = e.target.closest('[data-collect]');
  if (!b) return;
  collectKey = b.dataset.collect;
  const c = state.customers[collectKey];
  $('#collect-form').reset();
  $('#collect-name').textContent = c.name;
  $('#collect-due').textContent = money(c.due);
  $('#collect-form').elements.amount.value = c.due;
  $('#collect-form').elements.amount.max = c.due;
  $('#collect-history').innerHTML = '<h3>History</h3>' + c.history.slice().reverse().map(h =>
    `<div class="hint">${dateTimeStr(h.date)} · ${h.type === 'bill'
      ? `Bill #${h.billNo}: +${money(h.amount)}`
      : `Paid ${money(h.amount)} by ${h.mode}`}</div>`).join('');
  $('#collect-dialog').showModal();
});

$('#collect-form').addEventListener('submit', e => {
  if (e.submitter?.value !== 'ok') return;
  const c = state.customers[collectKey];
  const amount = Math.min(round2(e.target.elements.amount.value), c.due);
  if (amount <= 0) return;
  c.due = round2(c.due - amount);
  c.history.push({ date: new Date().toISOString(), type: 'payment', amount, mode: e.target.elements.mode.value });
  save();
  renderBaki();
});

// ---------- 5. Bills history ----------

function renderBills() {
  const day = $('#bills-date').value || todayStr();
  $('#bills-date').value = day;
  const bills = state.bills.filter(b => new Date(b.date).toLocaleDateString('en-CA') === day).reverse();
  const sum = k => bills.reduce((s, b) => s + (k === 'total' ? b.total : k === 'baki' ? b.baki : b.payments[k]), 0);
  $('#bills-summary').innerHTML = `
    <div>Bills <b>${bills.length}</b></div>
    <div>Sales <b>${money(sum('total'))}</b></div>
    <div>Cash <b>${money(sum('cash'))}</b></div>
    <div>Online <b>${money(sum('online'))}</b></div>
    <div>Card <b>${money(sum('card'))}</b></div>
    <div>Baki <b>${money(sum('baki'))}</b></div>`;
  $('#bills-body').innerHTML = bills.map(b => `
    <tr><td>#${b.no}</td><td>${timeStr(b.date)}</td><td>${esc(tableLabel(b.table))}</td>
    <td><b>${money(b.total)}</b></td><td>${money(b.payments.cash)}</td><td>${money(b.payments.online)}</td>
    <td>${money(b.payments.card)}</td><td>${b.baki ? money(b.baki) + ' ' + esc(b.customer?.name) : ''}</td>
    <td><button class="btn" data-reprint="${b.no}">Reprint</button></td></tr>`).join('')
    || '<tr><td colspan="9" class="hint">No bills on this day.</td></tr>';
}

$('#bills-date').addEventListener('change', renderBills);
$('#bills-body').addEventListener('click', e => {
  const b = e.target.closest('[data-reprint]');
  if (b) printBill(state.bills.find(x => x.no === Number(b.dataset.reprint)));
});

// ---------- 6. Menu editor ----------

function renderMenu() {
  $('#cat-options').innerHTML = categories().map(c => `<option value="${esc(c)}">`).join('');
  const sorted = [...state.menu].sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  $('#menu-body').innerHTML = sorted.map(m => `
    <tr><td>${esc(m.name)}</td><td>${esc(m.cat)}</td>
    <td><input type="number" min="0" step="0.01" value="${m.price}" data-price="${esc(m.id)}" class="price-input"></td>
    <td><button class="btn danger" data-del="${esc(m.id)}">Delete</button></td></tr>`).join('');
}

$('#menu-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  state.menu.push({
    id: 'm' + Date.now(),
    name: f.name.value.trim(),
    cat: f.cat.value.trim(),
    price: round2(f.price.value),
  });
  save();
  e.target.reset();
  f.name.focus();
  renderMenu();
});

$('#menu-body').addEventListener('change', e => {
  const input = e.target.closest('[data-price]');
  if (!input) return;
  state.menu.find(m => m.id === input.dataset.price).price = round2(input.value);
  save();
});

$('#menu-body').addEventListener('click', e => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  const m = state.menu.find(x => x.id === b.dataset.del);
  if (!confirm('Delete ' + m.name + ' from the menu?')) return;
  state.menu = state.menu.filter(x => x !== m);
  save();
  renderMenu();
});

// ---------- 7. Settings and backup ----------

function renderSettings() {
  const f = $('#settings-form').elements;
  Object.entries(state.settings).forEach(([k, v]) => { if (f[k]) f[k].value = v; });
}

$('#settings-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  Object.keys(state.settings).forEach(k => {
    if (!f[k]) return;
    state.settings[k] = f[k].type === 'number' ? Number(f[k].value) || 0 : f[k].value.trim();
  });
  save();
  applyBrand();
  alert('Settings saved.');
});

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jayambe-pos-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.menu || !data.settings) throw new Error('Not a Jay Ambe POS backup');
    if (!confirm('This replaces ALL current data with the backup. Continue?')) return;
    state = data;
    save();
    applyBrand();
    alert('Backup restored.');
    showView('tables');
  } catch (err) {
    alert('Could not restore: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// ---------- 8. Printing ----------

// Builds the bill in the hidden #print-area and opens the browser's print window.
// CSS (@media print) hides everything else, so only the bill comes out of the printer.
function printBill(bill) {
  const s = state.settings;
  const p = bill.payments;
  const payLines = p ? [
    p.cash && ['Cash', p.cash],
    p.online && ['Online', p.online],
    p.card && ['Card', p.card],
    bill.baki && ['Baki', bill.baki],
  ].filter(Boolean) : [];

  $('#print-area').className = 'paper-' + s.paperWidth;
  $('#print-area').innerHTML = `
    <div class="b-center">
      <div class="b-shop">${esc(s.shopName)}</div>
      ${s.address ? `<div>${esc(s.address)}</div>` : ''}
      ${s.phone ? `<div>Ph: ${esc(s.phone)}</div>` : ''}
      ${s.gstin ? `<div>GSTIN: ${esc(s.gstin)}</div>` : ''}
    </div>
    <hr>
    <div class="b-row"><span>${bill.no ? 'Bill #' + bill.no : 'BILL (unpaid)'}</span><span>${esc(tableLabel(bill.table))}</span></div>
    <div>${dateTimeStr(bill.date)}</div>
    ${bill.customer ? `<div>Customer: ${esc(bill.customer.name)} ${esc(bill.customer.phone)}</div>` : ''}
    <hr>
    <table class="b-items">
      <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr>
      ${bill.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${round2(i.price)}</td><td>${round2(i.price * i.qty)}</td></tr>`).join('')}
    </table>
    <hr>
    <div class="b-row"><span>Subtotal</span><span>${money(bill.subtotal)}</span></div>
    ${bill.discount ? `<div class="b-row"><span>Discount</span><span>−${money(bill.discount)}</span></div>` : ''}
    ${bill.tax ? `<div class="b-row"><span>CGST ${bill.taxPercent / 2}%</span><span>${money(bill.tax / 2)}</span></div>
                  <div class="b-row"><span>SGST ${bill.taxPercent / 2}%</span><span>${money(bill.tax / 2)}</span></div>` : ''}
    ${bill.roundOff ? `<div class="b-row"><span>Round off</span><span>${bill.roundOff > 0 ? '+' : ''}${bill.roundOff.toFixed(2)}</span></div>` : ''}
    <div class="b-row b-total"><span>TOTAL</span><span>${money(bill.total)}</span></div>
    ${payLines.length ? '<hr>' + payLines.map(([k, v]) => `<div class="b-row"><span>${k}</span><span>${money(v)}</span></div>`).join('') : ''}
    <hr>
    <div class="b-center">${esc(s.footer)}</div>`;
  window.print();
}

// ---------- Start ----------

function applyBrand() {
  $('#brand-name').textContent = state.settings.shopName || 'Jay Ambe POS';
  document.title = (state.settings.shopName || 'Jay Ambe') + ' POS';
}

applyBrand();
save();
showView('tables');
