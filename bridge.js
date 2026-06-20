/*  bridge.js — Jay Ambe POS v26 Tauri Desktop Bridge
    SQLite sync · 5-Printer routing · Auto Backup · Printer Settings UI
    Load via <script src="bridge.js"></script> AFTER v26.html's own <script> block  */

(function(){
'use strict';

// ── Tauri Detection ──
var isTauri = !!(window.__TAURI__ && window.__TAURI__.invoke);
if(!isTauri) return; // browser mode — nothing to patch

var invoke = window.__TAURI__.invoke;

console.log('[Bridge] Jay Ambe POS — Tauri Desktop Bridge loaded');

// ═══════════════════════════════════════════════════════════════
// 1. PRINTER SETTINGS — localStorage-backed, 5 logical printers
// ═══════════════════════════════════════════════════════════════

var PRINTER_LS_KEY = 'ja_printer_config';
var PRINTERS_LIST_KEY = 'ja_system_printers';

var DEFAULT_PRINTER_CFG = {
  p1_kot_kitchen:  { label:'KOT — Kitchen',    device:'', enabled:false, copies:1, cutAfter:true },
  p2_kot_bar:      { label:'KOT — Bar',        device:'', enabled:false, copies:1, cutAfter:true },
  p3_bill_counter: { label:'Bill — Counter',    device:'', enabled:true,  copies:1, cutAfter:true },
  p4_bill_copy:    { label:'Bill — Copy',       device:'', enabled:false, copies:1, cutAfter:false },
  p5_report:       { label:'Report / Summary',  device:'', enabled:false, copies:1, cutAfter:false }
};

function loadPrinterCfg(){
  try{ return JSON.parse(localStorage.getItem(PRINTER_LS_KEY)) || JSON.parse(JSON.stringify(DEFAULT_PRINTER_CFG)); }
  catch(e){ return JSON.parse(JSON.stringify(DEFAULT_PRINTER_CFG)); }
}
function savePrinterCfg(cfg){ localStorage.setItem(PRINTER_LS_KEY, JSON.stringify(cfg)); }

var printerCfg = loadPrinterCfg();

// Fetch system printers from Rust backend
var systemPrinters = [];
function refreshSystemPrinters(){
  invoke('list_printers').then(function(json){
    try{ systemPrinters = JSON.parse(json); }catch(e){ systemPrinters = []; }
    localStorage.setItem(PRINTERS_LIST_KEY, JSON.stringify(systemPrinters));
    if(typeof renderPrinterSettings === 'function') renderPrinterSettings();
  }).catch(function(err){ console.warn('[Bridge] list_printers error:', err); });
}
refreshSystemPrinters();

// ═══════════════════════════════════════════════════════════════
// 2. ESC/POS HELPERS — raw byte commands for thermal printers
// ═══════════════════════════════════════════════════════════════

var ESC = '\x1B';
var GS  = '\x1D';

var ESCPOS = {
  INIT:       ESC + '@',
  BOLD_ON:    ESC + 'E\x01',
  BOLD_OFF:   ESC + 'E\x00',
  CENTER:     ESC + 'a\x01',
  LEFT:       ESC + 'a\x00',
  RIGHT:      ESC + 'a\x02',
  DOUBLE_W:   GS + '!\x10',
  DOUBLE_H:   GS + '!\x01',
  DOUBLE_WH:  GS + '!\x11',
  NORMAL:     GS + '!\x00',
  LINE:       '--------------------------------\n',
  DLINE:      '================================\n',
  CUT:        GS + 'V\x00',
  PARTIAL_CUT:GS + 'V\x01',
  FEED3:      ESC + 'd\x03',
  FEED5:      ESC + 'd\x05'
};

function escLine(left, right){
  var w = 32;
  right = String(right || '');
  left = String(left || '');
  var pad = w - left.length - right.length;
  if(pad < 1) pad = 1;
  return left + Array(pad + 1).join(' ') + right + '\n';
}

function escCenter(text, width){
  width = width || 32;
  text = String(text);
  var pad = Math.max(0, Math.floor((width - text.length) / 2));
  return Array(pad + 1).join(' ') + text + '\n';
}

// ═══════════════════════════════════════════════════════════════
// 3. RAW PRINT — send text to a named printer via Rust backend
// ═══════════════════════════════════════════════════════════════

function rawSend(printerDevice, content){
  if(!printerDevice) return Promise.reject('No printer device set');
  return invoke('raw_print', { printer: printerDevice, content: content });
}

function sendToPrinterSlot(slotKey, content){
  var slot = printerCfg[slotKey];
  if(!slot || !slot.enabled || !slot.device) return Promise.resolve('skip');
  var copies = slot.copies || 1;
  var full = '';
  for(var c = 0; c < copies; c++){
    full += content;
    if(slot.cutAfter) full += ESCPOS.FEED5 + ESCPOS.CUT;
  }
  return rawSend(slot.device, full);
}

// ═══════════════════════════════════════════════════════════════
// 4. BUILD ESC/POS CONTENT FOR BILL & KOT
// ═══════════════════════════════════════════════════════════════

function buildEscBill(order){
  var bs = (typeof getBillSettings === 'function') ? getBillSettings() : {};
  var bName = bs.name || 'JAY AMBE FAST FOOD & RESTAURANT';
  var bAddr = bs.addr || '';
  var bPh1  = bs.ph1 || '';
  var bPh2  = bs.ph2 || '';
  var bFssai= bs.fssai || '';
  var bGst  = bs.gst || '';
  var bThanks = bs.thanks || 'Thank you! Jay Ambe Parivar';
  var bFooter = bs.footer || '';

  var dparts = (order.date || '').split('-');
  var dcompact = dparts.length === 3 ? (dparts[2]+'/'+dparts[1]+'/'+dparts[0]) : order.date;

  var out = ESCPOS.INIT;
  out += ESCPOS.CENTER + ESCPOS.BOLD_ON + ESCPOS.DOUBLE_WH;
  out += escCenter(bName, 16);
  out += ESCPOS.NORMAL + ESCPOS.CENTER;
  if(bAddr) out += escCenter(bAddr);
  if(bPh1) out += escCenter('Ph: ' + bPh1 + (bPh2 ? ' / ' + bPh2 : ''));
  if(bFssai) out += escCenter('FSSAI: ' + bFssai);
  if(bGst) out += escCenter('GST: ' + bGst);
  out += ESCPOS.LEFT + ESCPOS.DLINE;

  out += ESCPOS.BOLD_ON;
  out += escLine('Bill No:', order.id);
  out += ESCPOS.BOLD_OFF;
  out += escLine('Date:', dcompact + ' ' + (order.time || ''));
  out += escLine('Table:', (order.train || '') + (order.trainName ? ' ('+order.trainName+')' : ''));
  out += escLine('Guests:', order.pnr || '-');
  out += escLine('Waiter:', order.coach || '-');
  if(order.name) out += escLine('Name:', order.name);
  if(order.mobile) out += escLine('Mobile:', order.mobile);
  if(order.note) out += escLine('Note:', order.note);
  out += ESCPOS.LINE;

  out += ESCPOS.BOLD_ON + escLine('ITEM', 'QTY   AMT') + ESCPOS.BOLD_OFF;
  out += ESCPOS.LINE;

  var items = order.items || [];
  for(var i = 0; i < items.length; i++){
    var it = items[i];
    var amt = (it.price * it.qty).toFixed(2);
    out += escLine(it.name, 'x' + it.qty + '  ' + amt);
  }
  out += ESCPOS.DLINE;

  out += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_H;
  out += escLine('TOTAL:', (order.total || 0).toFixed(2));
  out += ESCPOS.NORMAL;
  if(order.commTotal) out += escLine('Commission:', (order.commTotal || 0).toFixed(2));
  if(order.netTotal != null && order.commTotal) out += escLine('Net Total:', (order.netTotal || 0).toFixed(2));
  out += escLine('Payment:', (order.pay || 'Cash').toUpperCase());
  out += escLine('Status:', (order.status || 'Pending').toUpperCase());
  out += ESCPOS.LINE;

  out += ESCPOS.CENTER;
  if(bFooter) out += escCenter(bFooter);
  out += escCenter(bThanks);
  out += ESCPOS.LEFT + ESCPOS.FEED3;

  return out;
}

function buildEscKOT(kot, stationLabel){
  var label = stationLabel ? ('KOT — ' + stationLabel.toUpperCase()) : 'KOT';
  var out = ESCPOS.INIT;
  out += ESCPOS.CENTER + ESCPOS.BOLD_ON + ESCPOS.DOUBLE_WH;
  out += escCenter('** ' + label + ' **', 16);
  out += ESCPOS.NORMAL + ESCPOS.LEFT;
  out += ESCPOS.DLINE;

  out += ESCPOS.BOLD_ON + escLine('KOT ID:', kot.id) + ESCPOS.BOLD_OFF;
  out += escLine('Table:', kot.trainNo || 'N/A');
  out += escLine('Waiter:', kot.coach || '-');
  out += escLine('Time:', new Date(kot.ts).toLocaleTimeString('en-IN'));
  out += ESCPOS.DLINE;

  var items = kot.items || [];
  for(var i = 0; i < items.length; i++){
    var it = items[i];
    out += '  x' + it.qty + '  ' + it.name;
    if(it.note) out += ' (' + it.note + ')';
    out += '\n';
  }
  out += ESCPOS.DLINE;
  out += ESCPOS.CENTER + escCenter('JAY AMBE FAST FOOD') + ESCPOS.LEFT;
  out += ESCPOS.FEED3;
  return out;
}

// ═══════════════════════════════════════════════════════════════
// 5. PATCH printBill — route to thermal printers then fallback
// ═══════════════════════════════════════════════════════════════

var _origPrintBill = window.printBill;
var _billPrintBusy = false;

window.printBill = function(order){
  // Guard against rapid double-clicks firing two raw print jobs at once.
  if(_billPrintBusy){
    if(typeof toast === 'function') toast('⏳ Print already in progress...');
    return;
  }
  _billPrintBusy = true;
  var done = function(){ _billPrintBusy = false; };

  var escContent = buildEscBill(order);
  var p3 = sendToPrinterSlot('p3_bill_counter', escContent);
  var p4 = sendToPrinterSlot('p4_bill_copy', escContent);

  // allSettled-style handling (no native allSettled dependency): each
  // promise is wrapped so a rejection doesn't short-circuit Promise.all.
  var wrap = function(p){ return p.then(function(r){ return {ok:true, val:r}; }, function(e){ return {ok:false, err:e}; }); };

  Promise.all([wrap(p3), wrap(p4)]).then(function(results){
    var configured = results.filter(function(r){ return r.ok && r.val !== 'skip'; });
    var failed = results.filter(function(r){ return !r.ok; });

    if(configured.length > 0){
      if(typeof toast === 'function') toast('🖨️ Bill sent to ' + configured.length + ' printer(s)');
    }
    if(failed.length > 0){
      // A configured printer actually failed — tell the user clearly
      // instead of staying silent (this was the cause of "double click
      // needed": first click failed quietly, second click happened to
      // hit the fallback timing).
      var msg = failed.map(function(f){ return f.err; }).join(' | ');
      if(typeof toast === 'function') toast('❌ Printer error: ' + msg, 'error');
    }
    // No configured printer slot at all -> use the on-screen print popup.
    if(configured.length === 0 && failed.length === 0){
      if(_origPrintBill) _origPrintBill(order);
    }
    // A configured slot failed and nothing else succeeded -> fall back too,
    // so the bill still prints via the popup instead of doing nothing.
    if(configured.length === 0 && failed.length > 0){
      if(_origPrintBill) _origPrintBill(order);
    }
    done();
  }).catch(function(){
    if(_origPrintBill) _origPrintBill(order);
    done();
  });
};

// ═══════════════════════════════════════════════════════════════
// 6. PATCH printKOT — route to kitchen & bar printers
// ═══════════════════════════════════════════════════════════════

var _origPrintKOT = window.printKOT;

window.printKOT = function(id){
  var kot = null;
  if(typeof v22State !== 'undefined' && v22State.kotOrders){
    kot = v22State.kotOrders.find(function(x){ return x.id === id; });
  }
  if(!kot){
    if(_origPrintKOT) _origPrintKOT(id);
    return;
  }

  var escContent = buildEscKOT(kot);
  var p1 = sendToPrinterSlot('p1_kot_kitchen', escContent);
  var p2 = sendToPrinterSlot('p2_kot_bar', escContent);
  var wrapKot = function(p){ return p.then(function(r){ return {ok:true, val:r}; }, function(e){ return {ok:false, err:e}; }); };

  Promise.all([wrapKot(p1), wrapKot(p2)]).then(function(results){
    var configured = results.filter(function(r){ return r.ok && r.val !== 'skip'; });
    var failed = results.filter(function(r){ return !r.ok; });

    if(configured.length > 0){
      if(typeof v22Toast === 'function') v22Toast('🖨️ KOT sent to ' + configured.length + ' printer(s)', 'success', 1800);
    }
    if(failed.length > 0){
      var msg = failed.map(function(f){ return f.err; }).join(' | ');
      if(typeof v22Toast === 'function') v22Toast('❌ KOT printer error: ' + msg, 'error', 3000);
    }
    if(configured.length === 0){
      if(_origPrintKOT) _origPrintKOT(id);
    }
  }).catch(function(){
    if(_origPrintKOT) _origPrintKOT(id);
  });
};

// ═══════════════════════════════════════════════════════════════
// 7. SQLITE SYNC — patch save() to mirror orders to SQLite
// ═══════════════════════════════════════════════════════════════

var _origSave = window.save;

window.save = function(){
  if(_origSave) _origSave();
  bridgeSyncLatest();
};

function bridgeSyncLatest(){
  if(!window.state || !state.orders) return;
  var recent = state.orders.slice(0, 5);
  for(var i = 0; i < recent.length; i++){
    (function(o){
      invoke('upsert_order', { orderJson: JSON.stringify(o) }).catch(function(err){
        console.warn('[Bridge] upsert_order error:', err);
      });
    })(recent[i]);
  }
}

// Full sync on page load — push all orders + menu to SQLite
function bridgeFullSync(){
  if(!window.state) return;
  var ordersJson = JSON.stringify(state.orders || []);
  var menuJson = JSON.stringify(state.menu || []);
  invoke('sync_all', { ordersJson: ordersJson, menuJson: menuJson }).then(function(msg){
    console.log('[Bridge] Full sync done:', msg);
  }).catch(function(err){
    console.warn('[Bridge] sync_all error:', err);
  });
}

// Run full sync once after app loads
setTimeout(bridgeFullSync, 3000);

// ═══════════════════════════════════════════════════════════════
// 8. AUTO BACKUP — every 5 minutes to Documents/JayAmbeBackup/
// ═══════════════════════════════════════════════════════════════

var BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
var BACKUP_LS_KEY = 'ja_bridge_last_backup';

function today_str(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function runAutoBackup(){
  if(!window.state) return;
  var snapshot = {
    app: 'JayAmbe-POS', version: 26, module: 'table',
    exported: new Date().toISOString(),
    menu: state.menu || [],
    orders: state.orders || [],
    counter: state.counter || 0,
    tables: (typeof allTables !== 'undefined') ? allTables : {}
  };

  var ts = Date.now();
  var filename = 'backup_' + today_str() + '_' + ts + '.json';
  var data = JSON.stringify(snapshot);
  var orderCount = (state.orders || []).length;

  invoke('save_backup', { data: data, filename: filename }).then(function(path){
    console.log('[Bridge] Backup saved:', path);
    localStorage.setItem(BACKUP_LS_KEY, String(ts));
    return invoke('log_backup', { ts: ts, filename: filename, count: orderCount, status: 'ok' });
  }).then(function(){
    console.log('[Bridge] Backup logged');
    if(typeof renderBackupHistory === 'function') renderBackupHistory();
  }).catch(function(err){
    console.warn('[Bridge] Backup error:', err);
    invoke('log_backup', { ts: ts, filename: filename, count: orderCount, status: 'error: ' + err }).catch(function(){});
  });
}

// Start auto backup timer
setInterval(runAutoBackup, BACKUP_INTERVAL);
// Run first backup 30 seconds after load
setTimeout(runAutoBackup, 30000);

// ═══════════════════════════════════════════════════════════════
// 9. PRINTER SETTINGS UI — injected as pg-printer page
// ═══════════════════════════════════════════════════════════════

function injectPrinterPage(){
  // Add nav button
  var navEl = document.querySelector('.nav');
  if(navEl && !document.querySelector('[data-pg="printer"]')){
    var btn = document.createElement('button');
    btn.setAttribute('data-pg', 'printer');
    btn.setAttribute('onclick', 'nav(this)');
    btn.id = 'nav-printer-btn';
    btn.innerHTML = '🖨️ <span>Printer</span>';
    var darkBtn = document.getElementById('dark-toggle-btn');
    if(darkBtn) navEl.insertBefore(btn, darkBtn);
    else navEl.appendChild(btn);
  }

  // Add page div
  if(document.getElementById('pg-printer')) return;
  var page = document.createElement('div');
  page.id = 'pg-printer';
  page.className = 'page';
  page.innerHTML = '<div class="wrap">' +
    '<h2 style="text-align:center;margin:10px 0">🖨️ Printer & Backup Settings</h2>' +
    '<p style="text-align:center;opacity:.7;font-size:13px">Tauri Desktop — 5-Printer Routing & Auto Backup</p>' +
    '<div id="printer-slots-area"></div>' +
    '<div style="text-align:center;margin:16px 0">' +
      '<button class="btn btn-blue" onclick="bridgeRefreshPrinters()">🔄 Refresh Printers</button> ' +
      '<button class="btn btn-green" onclick="bridgeSavePrinterCfg()">💾 Save Config</button>' +
    '</div>' +
    '<hr style="margin:20px 0">' +
    '<h3 style="text-align:center">📋 Backup History</h3>' +
    '<div id="backup-history-area" style="max-height:300px;overflow-y:auto"></div>' +
    '<div style="text-align:center;margin:16px 0">' +
      '<button class="btn btn-brand" onclick="bridgeRunBackupNow()">💾 Backup Now</button> ' +
      '<button class="btn btn-ghost" onclick="bridgeRefreshBackupLog()">🔄 Refresh Log</button>' +
    '</div>' +
    '<hr style="margin:20px 0">' +
    '<h3 style="text-align:center">🧪 Test Print</h3>' +
    '<div style="text-align:center;margin:10px 0">' +
      '<select id="test-printer-select" style="padding:8px 14px;border-radius:8px;border:2px solid #ddd;font-size:14px;font-weight:700;min-width:250px"></select>' +
    '</div>' +
    '<div style="text-align:center;margin:10px 0">' +
      '<button class="btn btn-brand" onclick="bridgeTestPrint()">🖨️ Test Print</button>' +
    '</div>' +
  '</div>';

  var main = document.querySelector('main') || document.body;
  main.appendChild(page);
}

window.renderPrinterSettings = function(){
  var area = document.getElementById('printer-slots-area');
  if(!area) return;

  var keys = Object.keys(printerCfg);
  var html = '';
  for(var k = 0; k < keys.length; k++){
    var slot = printerCfg[keys[k]];
    var slotKey = keys[k];
    html += '<div style="background:var(--glass-bg,rgba(255,255,255,.95));border:2px solid ' +
      (slot.enabled ? 'var(--accent,#ff6f00)' : '#ddd') +
      ';border-radius:12px;padding:14px 18px;margin:10px 0">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    html += '<b style="font-size:14px">' + slot.label + '</b>';
    html += '<label style="cursor:pointer"><input type="checkbox" ' + (slot.enabled ? 'checked' : '') +
      ' onchange="bridgeToggleSlot(\'' + slotKey + '\',this.checked)"> Enabled</label>';
    html += '</div>';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">';
    html += '<select id="sel-' + slotKey + '" style="flex:1;min-width:200px;padding:7px 10px;border-radius:8px;border:2px solid #ddd;font-size:13px;font-weight:700" onchange="bridgeSetDevice(\'' + slotKey + '\',this.value)">';
    html += '<option value="">— Select Printer —</option>';
    for(var p = 0; p < systemPrinters.length; p++){
      var selected = (slot.device === systemPrinters[p]) ? ' selected' : '';
      html += '<option value="' + escHtmlAttr(systemPrinters[p]) + '"' + selected + '>' + escHtmlBridge(systemPrinters[p]) + '</option>';
    }
    html += '</select>';
    html += '<label style="font-size:12px;white-space:nowrap">Copies: <input type="number" min="1" max="5" value="' +
      (slot.copies || 1) + '" style="width:50px;padding:5px;border-radius:6px;border:2px solid #ddd;font-weight:700" ' +
      'onchange="bridgeSetCopies(\'' + slotKey + '\',this.value)"></label>';
    html += '<label style="font-size:12px;cursor:pointer"><input type="checkbox" ' +
      (slot.cutAfter ? 'checked' : '') + ' onchange="bridgeSetCut(\'' + slotKey + '\',this.checked)"> Auto-cut</label>';
    html += '</div></div>';
  }
  area.innerHTML = html;

  // Update test printer dropdown
  var testSel = document.getElementById('test-printer-select');
  if(testSel){
    var th = '<option value="">— Select Printer —</option>';
    for(var tp = 0; tp < systemPrinters.length; tp++){
      th += '<option value="' + escHtmlAttr(systemPrinters[tp]) + '">' + escHtmlBridge(systemPrinters[tp]) + '</option>';
    }
    testSel.innerHTML = th;
  }
};

function escHtmlBridge(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escHtmlAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Slot control handlers
window.bridgeToggleSlot = function(key, on){
  printerCfg[key].enabled = on;
  savePrinterCfg(printerCfg);
  renderPrinterSettings();
};
window.bridgeSetDevice = function(key, dev){
  printerCfg[key].device = dev;
  savePrinterCfg(printerCfg);
};
window.bridgeSetCopies = function(key, val){
  printerCfg[key].copies = Math.max(1, Math.min(5, parseInt(val) || 1));
  savePrinterCfg(printerCfg);
};
window.bridgeSetCut = function(key, on){
  printerCfg[key].cutAfter = on;
  savePrinterCfg(printerCfg);
};
window.bridgeRefreshPrinters = function(){
  refreshSystemPrinters();
  if(typeof toast === 'function') toast('🔄 Refreshing printers...');
};
window.bridgeSavePrinterCfg = function(){
  savePrinterCfg(printerCfg);
  if(typeof toast === 'function') toast('💾 Printer config saved!');
};
window.bridgeRunBackupNow = function(){
  runAutoBackup();
  if(typeof toast === 'function') toast('💾 Backup started...');
};
window.bridgeRefreshBackupLog = function(){
  renderBackupHistory();
};

// Test print
window.bridgeTestPrint = function(){
  var sel = document.getElementById('test-printer-select');
  if(!sel || !sel.value){ if(typeof toast === 'function') toast('⚠️ Printer select karo'); return; }
  var content = ESCPOS.INIT + ESCPOS.CENTER + ESCPOS.BOLD_ON + ESCPOS.DOUBLE_WH +
    escCenter('TEST PRINT', 16) + ESCPOS.NORMAL + ESCPOS.CENTER +
    escCenter('Jay Ambe POS v26') +
    escCenter('Desktop Tauri Edition') +
    ESCPOS.LINE +
    ESCPOS.LEFT +
    escLine('Date:', new Date().toLocaleString('en-IN')) +
    escLine('Printer:', sel.value) +
    ESCPOS.LINE +
    ESCPOS.CENTER + escCenter('If you see this,') +
    escCenter('printing works! ✅') +
    ESCPOS.FEED5 + ESCPOS.CUT;

  rawSend(sel.value, content).then(function(){
    if(typeof toast === 'function') toast('✅ Test print sent!');
  }).catch(function(err){
    if(typeof toast === 'function') toast('❌ Print error: ' + err);
  });
};

// ═══════════════════════════════════════════════════════════════
// 10. BACKUP HISTORY DISPLAY
// ═══════════════════════════════════════════════════════════════

window.renderBackupHistory = function(){
  var area = document.getElementById('backup-history-area');
  if(!area) return;
  area.innerHTML = '<div style="text-align:center;padding:10px;opacity:.6">Loading...</div>';

  invoke('get_backup_log').then(function(json){
    var logs = [];
    try{ logs = JSON.parse(json); }catch(e){}
    if(!logs.length){
      area.innerHTML = '<div style="text-align:center;padding:16px;opacity:.6">No backups yet — first backup runs 30s after app start</div>';
      return;
    }
    var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<tr style="background:var(--accent,#ff6f00);color:#fff"><th style="padding:6px 8px;text-align:left">Time</th>' +
      '<th style="padding:6px 8px;text-align:left">File</th>' +
      '<th style="padding:6px 8px;text-align:center">Orders</th>' +
      '<th style="padding:6px 8px;text-align:center">Status</th></tr>';
    for(var i = 0; i < logs.length; i++){
      var l = logs[i];
      var dt = new Date(l.ts).toLocaleString('en-IN');
      var statusClr = l.status === 'ok' ? '#4caf50' : '#f44336';
      html += '<tr style="border-bottom:1px solid #eee">' +
        '<td style="padding:5px 8px">' + escHtmlBridge(dt) + '</td>' +
        '<td style="padding:5px 8px;word-break:break-all;max-width:200px">' + escHtmlBridge(l.filename) + '</td>' +
        '<td style="padding:5px 8px;text-align:center">' + l.count + '</td>' +
        '<td style="padding:5px 8px;text-align:center;color:' + statusClr + ';font-weight:700">' + escHtmlBridge(l.status) + '</td></tr>';
    }
    html += '</table>';
    area.innerHTML = html;
  }).catch(function(err){
    area.innerHTML = '<div style="text-align:center;padding:10px;color:#f44336">Error: ' + escHtmlBridge(err) + '</div>';
  });
};

// =================================================================
// 11. INIT - run printer page injection once the app UI is ready.
// (Restored: file was previously truncated here, which meant this whole
// script silently failed to load at all - the #1 reason raw/thermal
// printing was unreliable and the bill seemed to need a second click.)
// =================================================================
function bridgeInit(){
  if(typeof injectPrinterPage === 'function') injectPrinterPage();
  console.log('[Bridge] Printer page injected, desktop badge added');
}

if(document.readyState === 'complete' || document.readyState === 'interactive'){
  setTimeout(bridgeInit, 0);
} else {
  document.addEventListener('DOMContentLoaded', bridgeInit);
}

// Re-render printer settings whenever the printer settings page is opened.
var _origOnShowBridge = window.onShow;
window.onShow = function(pg){
  if(_origOnShowBridge) _origOnShowBridge(pg);
  if(pg === 'printer' && typeof renderPrinterSettings === 'function') renderPrinterSettings();
};

})();
