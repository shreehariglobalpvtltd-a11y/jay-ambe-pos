/* ═══════════════════════════════════════════════════════════════════
   JAY AMBE POS — LAN Server (v28)
   Zero dependencies. Pure Node.js built-ins only.
   No `npm install` needed — just:  node server.js
   ───────────────────────────────────────────────────────────────────
   - Serves the POS app + customer digital menu over your WiFi/LAN
   - Real-time PUSH (SSE) — admin/staff/mobile/menu sync in <½ second
   - Lists the PC's installed printers + prints to any chosen one
     (so Chrome can route each table/station to its own printer)
   - Works 100% OFFLINE (no internet / no Firebase needed)
   - Saves all data to ./data/lan-state.json (survives restarts)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
var http = require('http');
var fs   = require('fs');
var path = require('path');
var os   = require('os');
var cp   = require('child_process');
var net  = require('net');

var PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);
var ROOT = __dirname;
var APP_FILE = 'jay-ambe-pos-v28.html';
var OLD_FILES = ['jay-ambe-pos-v27.html', 'jay-ambe-pos-v26.html', 'v26.html'];  // old QR/links → redirect to v28
var IS_WIN = process.platform === 'win32';
var DATA_DIR = path.join(ROOT, 'data');
var STATE_FILE = path.join(DATA_DIR, 'lan-state.json');

/* ── persistent shared state ── */
/* v31: `orders` = the shared POS order book (bills from every biller PC).
   Both biller counters push/pull here so hisab ek hi jagah judta hai. */
var state = { mobileOrders: [], menu: [], tables: {}, config: {}, orders: [] };
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
/* Phase 2: try main file; if missing or corrupt, fall back to .bak. */
function _tryLoadStateFile(file) {
  if (!fs.existsSync(file)) return null;
  try {
    var loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (loaded && typeof loaded === 'object') ? loaded : null;
  } catch (e) {
    console.warn('⚠️ Corrupt state file ' + path.basename(file) + ':', e.message);
    return null;
  }
}
var loaded = _tryLoadStateFile(STATE_FILE) || _tryLoadStateFile(STATE_FILE + '.bak');
if (loaded) {
  state.mobileOrders = Array.isArray(loaded.mobileOrders) ? loaded.mobileOrders : [];
  state.menu   = Array.isArray(loaded.menu) ? loaded.menu : [];
  state.tables = (loaded.tables && typeof loaded.tables === 'object') ? loaded.tables : {};
  state.config = (loaded.config && typeof loaded.config === 'object') ? loaded.config : {};
  state.orders = Array.isArray(loaded.orders) ? loaded.orders : [];
  console.log('✅ Loaded saved state (' + state.mobileOrders.length + ' mobile orders, ' + state.orders.length + ' bills, ' + state.menu.length + ' menu items)');
}

var saveTimer = null;
/* Phase 2: atomic write — tmp file + rename, plus rotating .bak.
   A mid-write crash can no longer truncate lan-state.json: the rename
   is atomic on NTFS, and the previous good copy survives as .bak. */
function _atomicWriteState() {
  var data = JSON.stringify(state);
  var tmp  = STATE_FILE + '.tmp';
  var bak  = STATE_FILE + '.bak';
  fs.writeFileSync(tmp, data);
  try { if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, bak); } catch (e) {}
  fs.renameSync(tmp, STATE_FILE);
}
function saveState() {
  if (saveTimer) return;            // debounce bursts of writes
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try { _atomicWriteState(); }
    catch (e) { console.warn('⚠️ Save failed:', e.message); }
  }, 300);
}

/* ── Real-time push (Server-Sent Events) ── */
var sseClients = [];      // open SSE response objects
function broadcast(type, data) {
  var frame = 'event: ' + type + '\ndata: ' + JSON.stringify(data == null ? {} : data) + '\n\n';
  for (var i = sseClients.length - 1; i >= 0; i--) {
    try { sseClients[i].write(frame); }
    catch (e) { sseClients.splice(i, 1); }
  }
}
setInterval(function () {       // heartbeat keeps proxies/phones from dropping the stream
  for (var i = sseClients.length - 1; i >= 0; i--) {
    try { sseClients[i].write(': ping\n\n'); } catch (e) { sseClients.splice(i, 1); }
  }
}, 20000);

/* ── Phase 3 helpers: validate POST bodies + optional shared-secret auth ── */
/* Body size cap per record type (in bytes) to stop a runaway client/attacker
   from filling the LAN server's RAM/disk via /api/menu or /api/config. */
var MAX_BODY = {
  menu:    2 * 1024 * 1024,   // 2 MB — generous for menus with images-by-url
  tables:  512 * 1024,        // 512 KB
  config:  256 * 1024,        // 256 KB
  order:   128 * 1024,        // 128 KB per order
  ordersBatch: 4 * 1024 * 1024, // 4 MB — first-time seed push of the local order book
};
function _byteLen(obj) { try { return Buffer.byteLength(JSON.stringify(obj), 'utf8'); } catch (e) { return Infinity; } }
function _isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
/* Validate a menu-items array. Each must have at least id (string) + name (string) + price (number). */
function _validateMenu(arr) {
  if (!Array.isArray(arr)) return 'menu must be an array';
  if (arr.length > 5000)   return 'menu too large (>5000 items)';
  for (var i = 0; i < arr.length; i++) {
    var m = arr[i];
    if (!_isPlainObject(m)) return 'menu[' + i + '] is not an object';
    if (typeof m.id !== 'string' || !m.id) return 'menu[' + i + '].id missing/invalid';
    if (typeof m.name !== 'string') return 'menu[' + i + '].name missing/invalid';
    if (m.price != null && typeof m.price !== 'number') return 'menu[' + i + '].price not number';
  }
  return null;
}
/* Validate tables payload — either {tables: {...}} (full overwrite) or {id, patch:{...}} (single update). */
function _validateTablesBody(body) {
  if (!_isPlainObject(body)) return 'body must be an object';
  if (body.tables) {
    if (!_isPlainObject(body.tables)) return 'tables must be an object';
    if (Object.keys(body.tables).length > 2000) return 'too many tables (>2000)';
    return null;
  }
  if (body.id) {
    if (typeof body.id !== 'string' || body.id.length > 64) return 'id must be a short string';
    if (body.patch != null && !_isPlainObject(body.patch)) return 'patch must be an object';
    return null;
  }
  return 'expected {tables} or {id, patch}';
}
function _validateConfig(cfg) {
  if (!_isPlainObject(cfg)) return 'config must be an object';
  if (Object.keys(cfg).length > 200) return 'config has too many keys';
  return null;
}
function _validateMobileOrder(o) {
  if (!_isPlainObject(o)) return 'order must be an object';
  if (typeof o.id !== 'string' || !o.id || o.id.length > 64) return 'id must be a non-empty string ≤64 chars';
  if (o.items != null && !Array.isArray(o.items)) return 'items must be an array';
  if (o.items && o.items.length > 500) return 'too many items (>500)';
  if (o.tableNo != null && String(o.tableNo).length > 32) return 'tableNo too long';
  return null;
}
/* v31: a POS bill (order book record). Same shape the app keeps in state.orders. */
function _validatePosOrder(o) {
  if (!_isPlainObject(o)) return 'order must be an object';
  if (typeof o.id !== 'string' || !o.id || o.id.length > 64) return 'id must be a non-empty string ≤64 chars';
  if (o.items != null && !Array.isArray(o.items)) return 'items must be an array';
  if (o.items && o.items.length > 500) return 'too many items (>500)';
  return null;
}
/* v31: upsert one bill into the shared book. Last-write-wins by `mts`
   (modified timestamp) so an older echo can never overwrite a newer edit. */
function _upsertPosOrder(o) {
  var i = state.orders.findIndex(function (x) { return x.id === o.id; });
  if (i >= 0) {
    var cur = state.orders[i];
    if ((cur.mts || 0) > (o.mts || 0)) return false;   // stale write → ignore
    state.orders[i] = o;
  } else {
    state.orders.push(o);
    if (state.orders.length > 5000) state.orders = state.orders.slice(-5000);
  }
  return true;
}
function _sendErr(res, code, msg) { return sendJSON(res, code, { ok: false, error: msg }); }

/* Optional shared-secret token check.
   - Disabled by default: state.config.requireToken !== true.
   - When enabled: ALL write endpoints (POST/PUT/DELETE) require either header
     X-JA-Token: <secret>  OR  query param ?token=<secret>.
   - GET stays open so the customer-menu page (which has no token) keeps working.
   - /api/ping stays open so the boot-screen LAN-detect keeps working.
   - /api/config POST is special-cased: a request that has NO token is allowed
     to TOGGLE OFF requireToken IF it comes from localhost — so the operator
     can never lock themselves out at the admin PC. */
function _requireToken(req, res) {
  if (req.method === 'GET' || req.method === 'OPTIONS') return false;
  var cfg = state.config || {};
  if (!cfg.requireToken) return false;          // auth off → always allow
  var secret = cfg.tokenSecret || '';
  if (!secret) return false;                    // misconfigured (no secret) → allow
  var hdr = req.headers['x-ja-token'] || '';
  /* v28p4 Phase 7: also accept Authorization: Bearer <secret> for Android-app compat. */
  var auth = req.headers['authorization'] || '';
  var bearer = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : '';
  var u   = require('url').parse(req.url, true);
  var qry = (u.query && u.query.token) || '';
  if (hdr === secret || bearer === secret || qry === secret) return false;
  // local-only escape hatch: allow /api/config POST from 127.0.0.1 (operator can disable auth)
  if (u.pathname === '/api/config') {
    var ip = (req.socket && req.socket.remoteAddress) || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return false;
  }
  _sendErr(res, 401, 'auth required (set X-JA-Token header or ?token=)');
  return true;
}

/* ── helpers ── */
var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json', '.webmanifest': 'application/manifest+json'
};
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJSON(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  var data = '';
  req.on('data', function (c) { data += c; if (data.length > 5e6) req.destroy(); });
  req.on('end', function () { try { cb(data ? JSON.parse(data) : {}); } catch (e) { cb(null); } });
}
function localIPs() {
  var out = [], ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    (ifaces[name] || []).forEach(function (i) { if (i.family === 'IPv4' && !i.internal) out.push(i.address); });
  });
  return out;
}

/* ── Printer enumeration (Windows: Get-Printer; cached) ── */
var printerCache = { list: [], at: 0 };
function listPrinters(cb) {
  if (Date.now() - printerCache.at < 10000 && printerCache.list.length) return cb(printerCache.list);
  function done(arr) {
    arr = (arr || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    if (arr.length) { printerCache = { list: arr, at: Date.now() }; }
    cb(arr);
  }
  if (IS_WIN) {
    cp.exec('powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
      { timeout: 8000, windowsHide: true }, function (err, out) {
        if (!err && out && out.trim()) return done(out.split(/\r?\n/));
        // fallback: wmic
        cp.exec('wmic printer get name', { timeout: 8000, windowsHide: true }, function (e2, o2) {
          if (!e2 && o2) { var lines = o2.split(/\r?\n/).slice(1); return done(lines); }
          done([]);
        });
      });
  } else {
    cp.exec('lpstat -a 2>/dev/null', { timeout: 8000 }, function (err, out) {
      if (!err && out) return done(out.split(/\r?\n/).map(function (l) { return l.split(' ')[0]; }));
      done([]);
    });
  }
}

/* ── Raw TCP printing (network/IP thermal printers, e.g. 192.168.1.50:9100) ── */
function printRaw(host, port, content, copies, cb) {
  var buf = Buffer.from(String(content || ''), 'utf8');
  var sent = 0, failed = false;
  function one() {
    var sock = net.connect({ host: host, port: port });
    var done = false;
    sock.setTimeout(6000);
    function finish(ok, err) {
      if (done) return; done = true;
      try { sock.destroy(); } catch (e) {}
      if (!ok) { if (!failed) { failed = true; cb(false, err || 'raw print failed'); } return; }
      sent++; if (sent === copies && !failed) cb(true);
    }
    sock.on('connect', function () { sock.write(buf, function () { finish(true); }); });
    sock.on('timeout', function () { finish(false, 'connection timeout: ' + host + ':' + port); });
    sock.on('error', function (e) { finish(false, e.message); });
  }
  for (var i = 0; i < copies; i++) one();
}

/* ── Print to a named printer (text receipt) ── */
function printToPrinter(printer, content, copies, cb) {
  copies = Math.max(1, Math.min(5, parseInt(copies || 1, 10)));
  if (!printer) return cb(false, 'no printer');
  var ipMatch = String(printer).trim().match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (ipMatch) return printRaw(ipMatch[1], parseInt(ipMatch[2], 10), content, copies, cb);
  if (!IS_WIN) {  // CUPS
    var tmpN = path.join(os.tmpdir(), 'ja_print_' + Date.now() + '.txt');
    try { fs.writeFileSync(tmpN, content || ''); } catch (e) { return cb(false, 'tmp write'); }
    cp.exec('lp -d "' + printer.replace(/"/g, '') + '" -n ' + copies + ' "' + tmpN + '"',
      { timeout: 8000 }, function (err) { try { fs.unlinkSync(tmpN); } catch (e) {} cb(!err, err && err.message); });
    return;
  }
  // Windows: pass content as base64 to PowerShell Out-Printer (handles any quotes/newlines safely)
  var b64 = Buffer.from(String(content || ''), 'utf8').toString('base64');
  var pn = String(printer).replace(/'/g, "''");   // escape single quotes for PS string
  var ps = "$ErrorActionPreference='Stop';" +
           "$t=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64 + "'));" +
           "for($i=0;$i -lt " + copies + ";$i++){ $t | Out-Printer -Name '" + pn + "' }";
  cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
    { timeout: 12000, windowsHide: true }, function (err, so, se) {
      cb(!err, err && (se || err.message));
    });
}

/* ── HTTP server ── */
var server = http.createServer(function (req, res) {
  var u = require('url').parse(req.url, true);
  var p = decodeURIComponent(u.pathname);

  /* v28p4 Phase 7: /api/v1/* alias maps to /api/* — forward-compat URL space
     for an Android app or future client that wants explicit versioning.
     Strips the /v1 segment so the rest of the handler can stay path-stable. */
  if (p.indexOf('/api/v1/') === 0) { p = '/api' + p.slice('/api/v1'.length); }

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  /* ---------- API ---------- */
  if (p === '/api/ping') {
    return sendJSON(res, 200, { ok: true, name: 'jay-ambe-lan', ver: 31, ts: Date.now(), ips: localIPs(), platform: process.platform, authOn: !!(state.config && state.config.requireToken) });
  }

  // v28p3 Phase 5: optional shared-secret token check on writes.
  // Off by default. Returns 401 immediately if enabled and the request lacks a valid token.
  // Skips GET, OPTIONS, /api/ping, /api/events (so customer-menu, boot LAN-detect, and SSE keep working).
  if (p.indexOf('/api/') === 0 && p !== '/api/ping' && p !== '/api/events') {
    if (_requireToken(req, res)) return;
  }

  // Real-time event stream
  if (p === '/api/events') {
    cors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    res.write('event: hello\ndata: ' + JSON.stringify({ ts: Date.now(), orders: state.mobileOrders.length }) + '\n\n');
    sseClients.push(res);
    req.on('close', function () { var i = sseClients.indexOf(res); if (i >= 0) sseClients.splice(i, 1); });
    return;
  }

  if (p === '/api/mobile-orders' && req.method === 'GET') {
    return sendJSON(res, 200, { orders: state.mobileOrders, ts: Date.now() });
  }
  if (p === '/api/mobile-orders' && req.method === 'POST') {
    return readBody(req, function (body) {
      var err = _validateMobileOrder(body);                              // v28p3 Phase 5: validate
      if (err) return _sendErr(res, 400, err);
      if (_byteLen(body) > MAX_BODY.order) return _sendErr(res, 413, 'order too large');
      var i = state.mobileOrders.findIndex(function (o) { return o.id === body.id; });
      if (i >= 0) state.mobileOrders[i] = body; else state.mobileOrders.push(body);
      if (state.mobileOrders.length > 300) state.mobileOrders = state.mobileOrders.slice(-300);
      saveState();
      broadcast('order', body);
      console.log('📱 order ' + body.id + ' (table ' + (body.tableNo||'?') + ', ' + ((body.items||[]).length) + ' items)');
      sendJSON(res, 200, { ok: true, id: body.id });
    });
  }
  if (p === '/api/mobile-orders/status' && req.method === 'POST') {
    return readBody(req, function (body) {
      if (!body || !body.id) return sendJSON(res, 400, { ok: false });
      var o = state.mobileOrders.find(function (x) { return x.id === body.id; });
      if (o) { o.status = body.status || o.status; saveState(); }
      broadcast('order-status', { id: body.id, status: body.status });
      sendJSON(res, 200, { ok: true });
    });
  }
  /* v31: atomic claim — first biller to claim a pending mobile order wins.
     Node is single-threaded, so this check-and-set can never race: with two
     biller PCs on auto-accept, exactly ONE gets claimed:true and prints. */
  if (p === '/api/mobile-orders/claim' && req.method === 'POST') {
    return readBody(req, function (body) {
      if (!body || !body.id) return _sendErr(res, 400, 'missing id');
      var o = state.mobileOrders.find(function (x) { return x.id === body.id; });
      if (!o) return sendJSON(res, 200, { ok: true, claimed: false, reason: 'not found' });
      var who = String(body.biller || 'unknown').slice(0, 64);
      if (o.claimedBy && o.claimedBy !== who) {
        return sendJSON(res, 200, { ok: true, claimed: false, by: o.claimedBy });
      }
      if (o.status && o.status !== 'pending' && !o.claimedBy) {
        return sendJSON(res, 200, { ok: true, claimed: false, reason: 'already ' + o.status });
      }
      o.claimedBy = who; o.claimedAt = Date.now();
      saveState();
      broadcast('order-claimed', { id: o.id, by: who });
      sendJSON(res, 200, { ok: true, claimed: true, by: who });
    });
  }

  /* ── v31: shared POS order book (2-biller system) ──
     Every bill made on any biller PC is upserted here and pushed to all
     other devices via SSE, so dono billers ka hisab ek hi jagah judta hai. */
  if (p === '/api/orders' && req.method === 'GET') {
    // optional ?since=<ts> → only bills modified after that time (light polling)
    var since = parseInt(u.query.since || '0', 10) || 0;
    var list = since ? state.orders.filter(function (o) { return (o.mts || 0) > since; }) : state.orders;
    return sendJSON(res, 200, { orders: list, total: state.orders.length, ts: Date.now() });
  }
  if (p === '/api/orders' && req.method === 'POST') {
    return readBody(req, function (body) {
      if (!body) return _sendErr(res, 400, 'bad body');
      // batch seed: {orders:[...]} — first sync push of an existing local book
      if (Array.isArray(body.orders)) {
        if (_byteLen(body) > MAX_BODY.ordersBatch) return _sendErr(res, 413, 'orders batch too large');
        if (body.orders.length > 3000) return _sendErr(res, 400, 'too many orders in one batch');
        var accepted = 0;
        for (var bi = 0; bi < body.orders.length; bi++) {
          var bo = body.orders[bi];
          if (_validatePosOrder(bo)) continue;
          if (_upsertPosOrder(bo)) accepted++;
        }
        saveState();
        broadcast('pos-orders-seed', { count: accepted, from: body.from || '' });
        return sendJSON(res, 200, { ok: true, accepted: accepted, total: state.orders.length });
      }
      // single upsert: {order:{...}}
      var o = body.order;
      var err = _validatePosOrder(o);
      if (err) return _sendErr(res, 400, err);
      if (_byteLen(o) > MAX_BODY.order) return _sendErr(res, 413, 'order too large');
      var applied = _upsertPosOrder(o);
      saveState();
      if (applied) broadcast('pos-order', o);
      sendJSON(res, 200, { ok: true, applied: applied, total: state.orders.length });
    });
  }
  if (p === '/api/menu' && req.method === 'GET') {
    return sendJSON(res, 200, { menu: state.menu, ts: Date.now() });
  }
  if (p === '/api/menu' && req.method === 'POST') {
    return readBody(req, function (body) {
      if (!body) return _sendErr(res, 400, 'bad body');
      if (body.menu == null) return _sendErr(res, 400, 'missing menu');
      var err = _validateMenu(body.menu);                                // v28p3 Phase 5: validate
      if (err) return _sendErr(res, 400, err);
      if (_byteLen(body) > MAX_BODY.menu) return _sendErr(res, 413, 'menu too large');
      state.menu = body.menu; saveState(); broadcast('menu', { count: state.menu.length });
      sendJSON(res, 200, { ok: true, count: state.menu.length });
    });
  }

  // Live table status (admin/staff/mobile share one table map)
  if (p === '/api/tables' && req.method === 'GET') {
    return sendJSON(res, 200, { tables: state.tables, ts: Date.now() });
  }
  if (p === '/api/tables' && req.method === 'POST') {
    return readBody(req, function (body) {
      var err = _validateTablesBody(body);                               // v28p3 Phase 5: validate
      if (err) return _sendErr(res, 400, err);
      if (_byteLen(body) > MAX_BODY.tables) return _sendErr(res, 413, 'tables payload too large');
      if (body.tables) { state.tables = body.tables; }
      else if (body.id) { state.tables[body.id] = Object.assign(state.tables[body.id] || {}, body.patch || {}); }
      saveState(); broadcast('tables', state.tables);
      sendJSON(res, 200, { ok: true });
    });
  }

  // Shared config (printer maps, etc.) so any device can print
  if (p === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, { config: state.config, ts: Date.now() });
  }
  if (p === '/api/config' && req.method === 'POST') {
    return readBody(req, function (body) {
      if (!body || !body.config) return _sendErr(res, 400, 'missing config');
      var err = _validateConfig(body.config);                            // v28p3 Phase 5: validate
      if (err) return _sendErr(res, 400, err);
      if (_byteLen(body) > MAX_BODY.config) return _sendErr(res, 413, 'config too large');
      state.config = Object.assign(state.config, body.config); saveState(); broadcast('config', state.config);
      sendJSON(res, 200, { ok: true, config: state.config });
    });
  }

  // v32: clear the SHARED LAN state together with a device's own Factory
  // Reset, so every connected phone/PC starts fresh instead of a wiped
  // browser silently re-syncing stale menu/orders back from the server.
  if (p === '/api/factory-reset' && req.method === 'POST') {
    state.menu = []; state.orders = []; state.tables = {}; state.config = {}; state.mobileOrders = [];
    saveState();
    broadcast('factory-reset', {});
    return sendJSON(res, 200, { ok: true });
  }

  /* v28p4 Phase 7: GET /api/backup — full state snapshot as downloadable JSON.
     Includes the same data the server persists to lan-state.json. Useful for
     scheduled off-device backups (e.g. from the admin PC to a USB drive). */
  if (p === '/api/backup' && req.method === 'GET') {
    cors(res);
    var fname = 'jay-ambe-backup-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.json';
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + fname + '"'
    });
    res.end(JSON.stringify({
      app: 'jay-ambe-lan', ver: 31, ts: Date.now(),
      mobileOrders: state.mobileOrders, menu: state.menu,
      tables: state.tables, config: state.config, orders: state.orders
    }));
    return;
  }
  /* v28p4 Phase 7: GET /api/devices — connected-device summary.
     Returns the number of SSE clients (= devices listening for realtime updates)
     plus their peer addresses so the admin can see who's online on the LAN. */
  if (p === '/api/devices' && req.method === 'GET') {
    var peers = sseClients.map(function (r) {
      try { return (r.socket && r.socket.remoteAddress) || '?'; } catch (e) { return '?'; }
    });
    return sendJSON(res, 200, { ok: true, count: sseClients.length, peers: peers, ts: Date.now() });
  }

  // Installed printers on THIS PC (Chrome can't do this; the server can)
  if (p === '/api/printers' && req.method === 'GET') {
    return listPrinters(function (list) { sendJSON(res, 200, { ok: true, printers: list, platform: process.platform }); });
  }
  // Print a receipt to a named printer
  if (p === '/api/print' && req.method === 'POST') {
    return readBody(req, function (body) {
      if (!body || !body.printer) return sendJSON(res, 400, { ok: false, error: 'no printer' });
      printToPrinter(body.printer, body.content || '', body.copies, function (ok, errMsg) {
        if (ok) console.log('🖨️  printed → ' + body.printer);
        else console.warn('🖨️  print FAIL → ' + body.printer + ' : ' + errMsg);
        sendJSON(res, ok ? 200 : 500, { ok: ok, error: ok ? undefined : String(errMsg || 'print failed') });
      });
    });
  }

  /* ---------- redirects ---------- */
  if (p === '/') { res.writeHead(302, { Location: '/' + APP_FILE }); return res.end(); }
  if (p === '/menu') {                       // customer menu shortcut
    var q = u.search ? (u.search + '&role=menu') : '?role=menu';
    res.writeHead(302, { Location: '/' + APP_FILE + q }); return res.end();
  }
  // old version links/QRs → newest app (keep query so ?role=mobile&table= still works)
  if (OLD_FILES.indexOf(p.replace(/^\/+/, '')) >= 0) {
    res.writeHead(302, { Location: '/' + APP_FILE + (u.search || '') }); return res.end();
  }

  /* ---------- static files ---------- */
  var rel = p.replace(/^\/+/, '');
  /* v28p3 Phase 5: robust path-traversal guard.
     The old `file.indexOf(ROOT) !== 0` check was fragile on Windows where the
     path separator may differ in case (C:\JayAmbe vs c:\jayambe) and where
     `path.join` does NOT normalize `..` before the prefix check on some inputs.
     Now we use path.resolve() and compare via path.relative(): if the relative
     path escapes (starts with '..') we 403. Also block backslash + null byte. */
  if (rel.indexOf('\0') >= 0) { res.writeHead(400); return res.end('Bad request'); }
  var file = path.resolve(ROOT, rel);
  var relCheck = path.relative(ROOT, file);
  if (!relCheck || relCheck.indexOf('..') === 0 || path.isAbsolute(relCheck)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    cors(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', function () {
  var ips = localIPs();
  console.log('\n══════════════════════════════════════════════');
  console.log('  🍔  JAY AMBE POS — LAN Server RUNNING (offline)');
  console.log('══════════════════════════════════════════════');
  console.log('  This PC (admin):  http://localhost:' + PORT + '/');
  ips.forEach(function (ip) {
    console.log('  Phones/devices :  http://' + ip + ':' + PORT + '/');
    console.log('  Customer menu  :  http://' + ip + ':' + PORT + '/menu?table=T1');
  });
  console.log('──────────────────────────────────────────────');
  console.log('  Real-time push: ON  ·  Printer routing: ' + (IS_WIN ? 'ON (Windows)' : 'CUPS'));
  console.log('  Sab devices ko ISI WiFi router se connect karo.');
  console.log('  Band karne ke liye is window ko close karo.');
  console.log('══════════════════════════════════════════════\n');
});
process.on('SIGINT', function () { console.log('\n💤 Server band ho raha hai...'); try { _atomicWriteState(); } catch (e) {} process.exit(0); });
