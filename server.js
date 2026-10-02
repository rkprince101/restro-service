const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const QRCode = require('qrcode');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const production = process.env.NODE_ENV === 'production';
const origin = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;
if (production && !origin.startsWith('https://')) throw new Error('PUBLIC_ORIGIN must use HTTPS in production');
const localOrigins = new Set([origin]);
if (!production && !process.env.PUBLIC_ORIGIN) {
  for (const host of ['localhost', '127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter(n => n.family === 'IPv4').map(n => n.address)]) localOrigins.add(`http://${host}:${PORT}`);
}
function requestOrigin(req) {
  const candidate = `http://${req.headers.host}`;
  return !production && !process.env.PUBLIC_ORIGIN && localOrigins.has(candidate) ? candidate : origin;
}
const dir = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'restaurant.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS store (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, role TEXT, branch TEXT, salt TEXT, hash TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires INTEGER);
  CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT, action TEXT, created TEXT);`);
let stored = db.prepare('SELECT payload FROM store WHERE id=1').get();
let state = stored ? JSON.parse(stored.payload) : fs.existsSync(path.join(dir, 'state.json'))
  ? JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))
  : { branches: [{ id: 'branch-main', name: 'My Restaurant', city: '', tables: 12 }], menu: [], orders: [], staffRequests: [], customers: [], coupons: [], settings: { gstRate: 0.05 }, eventLog: [], integrations: [] };
state.revision ||= 1;
state.integrations = (state.integrations || []).map(i => ({ ...i, status: 'not connected', detail: 'Provider connection required.' }));
const secret = db.prepare("SELECT value FROM metadata WHERE key='qr-secret'").get()?.value || crypto.randomBytes(32).toString('hex');
db.prepare("INSERT OR IGNORE INTO metadata VALUES ('qr-secret', ?)").run(secret);
function hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function addUser(name, role, branch, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), name, role, branch, salt, hash(password, salt));
}
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
  const credentials = [];
  for (const role of ['admin', 'kitchen', 'staff']) {
    const password = crypto.randomBytes(18).toString('base64url');
    addUser(role, role, state.branches[0].id, password);
    credentials.push(`${role}: ${password}`);
  }
  fs.writeFileSync(path.join(dir, 'bootstrap-credentials.txt'), credentials.join('\n') + '\n', { mode: 0o600 });
  console.log('Initial account passwords saved to data/bootstrap-credentials.txt. Store securely and rotate before launch.');
}
const clients = new Set();
const limits = new Map();
function error(status, message) { const e = new Error(message); e.status = status; throw e; }
function audit(actor, action) { db.prepare('INSERT INTO audit(actor,action,created) VALUES(?,?,?)').run(actor, action, new Date().toISOString()); }
function save(actor = 'system', action = 'update') {
  state.revision++;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR REPLACE INTO store VALUES(1,?)').run(JSON.stringify(state));
    audit(actor, action);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); state = JSON.parse(db.prepare('SELECT payload FROM store WHERE id=1').get().payload); throw e; }
  for (const client of clients) {
    if (client.session && !session(client.req)) { client.res.end(); continue; }
    client.res.write(`data: ${JSON.stringify({ type: 'state', state: project(client.req, client.url) })}\n\n`);
  }
}
save();
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('='))); }
function session(req) {
  const token = cookies(req).ts_session;
  return token ? db.prepare('SELECT users.*, sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(digest(token), Date.now()) : null;
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function requireRole(req, roles) { const user = session(req); if (!user || !roles.includes(user.role)) error(403, 'Access denied'); return user; }
function setCookie(res, name, value, age) { res.setHeader('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`); }
function guest(req, res) {
  let id = cookies(req).ts_guest;
  if (!/^[a-f0-9]{64}$/.test(id || '')) { id = crypto.randomBytes(32).toString('hex'); setCookie(res, 'ts_guest', id, 86400); }
  return digest(id);
}
function signature(branch, table) { return crypto.createHmac('sha256', secret).update(`${branch}:${table}`).digest('hex'); }
function tableContext(url) {
  const branchId = url.searchParams.get('branch');
  const table = Number(url.searchParams.get('table'));
  const branch = state.branches.find(b => b.id === branchId);
  if (!branch || !Number.isInteger(table) || table < 1 || table > branch.tables || url.searchParams.get('key') !== signature(branchId, table)) error(403, 'Please scan the table QR code to order.');
  return { branch, table };
}
function mode(url) { return url.searchParams.get('portal') || 'customer'; }
function project(req, url) {
  const portal = mode(url);
  if (portal === 'admin') { requireRole(req, ['admin']); return state; }
  if (portal === 'kitchen' || portal === 'staff') {
    const user = requireRole(req, ['admin', portal]);
    const branches = user.role === 'admin' ? state.branches : state.branches.filter(b => b.id === user.branch);
    return { revision: state.revision, branches, menu: [], orders: state.orders.filter(o => branches.some(b => b.id === o.branchId)).map(o => ({ id: o.id, branchId: o.branchId, table: o.table, items: o.items, status: o.status, note: o.note, createdAt: o.createdAt, ...(portal === 'staff' ? { payment: o.payment } : {}) })), staffRequests: state.staffRequests.filter(r => branches.some(b => b.id === r.branchId)) };
  }
  const owner = cookies(req).ts_guest ? digest(cookies(req).ts_guest) : '';
  const branch = state.branches.find(b => b.id === url.searchParams.get('branch')) || state.branches[0];
  let verifiedTable = null;
  try { const context = tableContext(url); verifiedTable = { branchId: context.branch.id, table: context.table }; } catch {}
  return { revision: state.revision, tableContext: verifiedTable, branches: [{ id: branch.id, name: branch.name, tables: branch.tables }], menu: state.menu, settings: { gstRate: state.settings.gstRate }, coupons: [], customers: [], integrations: [], eventLog: [], staffRequests: [], orders: state.orders.filter(o => o.owner === owner).map(({ owner, requestKey, ...o }) => o) };
}
function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) error(415, 'JSON required');
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 250000) error(413, 'Request too large'); }
  try { const value = JSON.parse(text); if (!value || Array.isArray(value) || typeof value !== 'object') error(400, 'Invalid request'); return value; } catch { error(400, 'Invalid JSON request'); }
}
function rate(req, group, max) {
  const key = `${group}:${req.socket.remoteAddress}`;
  let entry = limits.get(key);
  if (!entry || entry.until < Date.now()) { entry = { count: 0, until: Date.now() + 60000 }; limits.set(key, entry); }
  if (++entry.count > max) error(429, 'Too many requests. Please try again in a minute.');
}
const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
function integer(value, min, max) { if (!Number.isInteger(value) || value < min || value > max) error(400, 'Invalid quantity or amount'); return value; }
function makeOrder(input, context, owner, requestKey) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) error(400, 'Choose between 1 and 50 items');
  const quantities = new Map();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const items = input.items.map(line => {
    const item = state.menu.find(i => i.id === line.id);
    if (!item?.available) error(409, 'An item is no longer available');
    const from = item.availableFrom || '00:00', to = item.availableTo || '23:59';
    if (!(from <= to ? time >= from && time <= to : time >= from || time <= to)) error(409, `${item.name} is not available at this time`);
    const qty = integer(line.qty, 1, 20);
    quantities.set(item.id, (quantities.get(item.id) || 0) + qty);
    if (quantities.get(item.id) > item.stock) error(409, `${item.name} has insufficient stock`);
    const modifiers = item.modifiers || { spice: [], addOns: [], removable: [] };
    if (!Array.isArray(line.addOns || []) || !Array.isArray(line.remove || [])) error(400, 'Invalid modifiers');
    const addOns = [...new Set((line.addOns || []).map(a => typeof a === 'string' ? a : a.name))].map(name => {
      const add = modifiers.addOns.find(a => a.name === name); if (!add) error(400, 'Invalid add-on'); return { ...add };
    });
    const remove = [...new Set(line.remove || [])];
    if (remove.some(r => !modifiers.removable.includes(r))) error(400, 'Invalid ingredient removal');
    const spice = line.spice || modifiers.spice[0] || '';
    if (spice && !modifiers.spice.includes(spice)) error(400, 'Invalid spice preference');
    return { lineId: crypto.randomUUID(), id: item.id, name: item.name, price: item.price, qty, station: item.station, priority: ['first', 'normal', 'later'].includes(line.priority) ? line.priority : 'normal', itemStatus: 'new', spice, addOns, remove, combo: line.combo === true };
  });
  const subtotal = items.reduce((n, i) => n + (i.price + i.addOns.reduce((s, a) => s + a.price, 0) + (i.combo ? 99 : 0)) * i.qty, 0);
  const coupon = state.coupons.find(c => c.active && c.code === text(input.payment?.coupon).toUpperCase());
  const discount = Math.min(subtotal, coupon ? coupon.type === 'percent' ? Math.round(subtotal * coupon.value / 100) : coupon.value : 0);
  const tax = Math.round((subtotal - discount) * state.settings.gstRate);
  const tip = integer(input.payment?.tip || 0, 0, 10000), split = integer(input.payment?.split || 1, 1, 30);
  const total = subtotal - discount + tax + tip;
  if (!['pay-later', 'cash'].includes(input.payment?.method || 'pay-later')) error(400, 'Online payments are not connected. Please pay at the restaurant.');
  return { id: crypto.randomUUID(), owner, requestKey, branchId: context.branch.id, branchName: context.branch.name, table: context.table, items, note: text(input.note, 500), customer: { name: text(input.customer?.name, 80), phone: text(input.customer?.phone, 20) }, status: 'new', createdAt: new Date().toISOString(), payment: { method: input.payment?.method || 'pay-later', status: 'pending', subtotal, discount, tax, tip, total, split, perPerson: Math.ceil(total / split) } };
}
async function api(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') { db.prepare('SELECT 1').get(); return send(res, 200, { status: 'ok' }); }
  if (req.method === 'POST') {
    if (req.headers.origin !== requestOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') error(403, 'Invalid request origin');
    rate(req, 'write', 120);
  }
  if (url.pathname === '/api/session' && req.method === 'GET') {
    const user = session(req); return send(res, 200, user ? { user: { name: user.name, role: user.role }, token: 'cookie' } : null);
  }
  if (url.pathname === '/api/team' && req.method === 'GET') {
    requireRole(req, ['admin']);
    return send(res, 200, { users: db.prepare("SELECT id, name, role, branch FROM users WHERE role IN ('kitchen', 'staff')").all(), branches: state.branches });
  }
  if (url.pathname === '/api/team-branch' && req.method === 'POST') {
    const admin = requireRole(req, ['admin']), input = await body(req);
    const employee = db.prepare("SELECT id FROM users WHERE id=? AND role IN ('kitchen', 'staff')").get(text(input.userId));
    if (!employee || !state.branches.some(branch => branch.id === input.branchId)) error(400, 'Select a valid employee and branch');
    db.prepare('UPDATE users SET branch=? WHERE id=?').run(input.branchId, employee.id);
    save(admin.id, `branch assigned ${employee.id} ${input.branchId}`);
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    rate(req, 'login', 8);
    const input = await body(req);
    const user = db.prepare('SELECT * FROM users WHERE name=?').get(text(input.username, 80));
    const calculated = hash(text(input.password, 200), user?.salt || secret);
    if (!user || !crypto.timingSafeEqual(Buffer.from(user.hash, 'hex'), Buffer.from(calculated, 'hex'))) error(401, 'Incorrect username or password');
    if (!['admin', 'kitchen', 'staff'].includes(input.portal) || (user.role !== 'admin' && user.role !== input.portal)) error(403, 'This account cannot access this portal');
    const token = crypto.randomBytes(32).toString('hex');
    const old = cookies(req).ts_session; if (old) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(old));
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), user.id, Date.now() + 8 * 3600000);
    setCookie(res, 'ts_session', token, 8 * 3600); audit(user.id, 'sign-in');
    return send(res, 200, { redirect: `/${input.portal}` });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const token = cookies(req).ts_session; if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
    setCookie(res, 'ts_session', '', 0);
    for (const client of clients) if (cookies(client.req).ts_session === token) client.res.end();
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/password' && req.method === 'POST') {
    const user = requireRole(req, ['admin', 'kitchen', 'staff']), input = await body(req);
    if (hash(text(input.current, 200), user.salt) !== user.hash) error(401, 'Current password is incorrect');
    if (typeof input.password !== 'string' || input.password.length < 14 || input.password.length > 128) error(400, 'Use a password between 14 and 128 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash(input.password, salt), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); audit(user.id, 'password changed');
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/collect-payment' && req.method === 'POST') {
    const user = requireRole(req, ['admin', 'staff']), input = await body(req);
    const order = state.orders.find(o => o.id === input.orderId && (user.role === 'admin' || o.branchId === user.branch));
    if (!order) error(404, 'Order not found');
    if (order.payment.status !== 'pending') error(409, 'Payment already recorded');
    if (input.amount !== order.payment.total) error(400, 'Amount does not match the bill');
    order.payment.status = 'paid'; order.payment.method = 'cash'; order.payment.collectedAt = new Date().toISOString();
    save(user.id, `cash payment recorded ${order.id}`); return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/state' && req.method === 'GET') { guest(req, res); return send(res, 200, project(req, url)); }
  if (url.pathname === '/api/events' && req.method === 'GET') {
    const snapshot = project(req, url);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ type: 'state', state: snapshot })}\n\n`);
    const client = { req, res, url, session: session(req) }; clients.add(client);
    const timer = setInterval(() => { if (client.session && !session(req)) return res.end(); res.write(': heartbeat\n\n'); }, 15000);
    req.on('close', () => { clearInterval(timer); clients.delete(client); }); return;
  }
  if (url.pathname === '/api/state' && req.method === 'POST') error(405, 'Whole-state updates are disabled');
  if (url.pathname === '/api/menu' && req.method === 'POST') {
    const user = requireRole(req, ['admin']), input = await body(req);
    if (input.revision !== state.revision) error(409, 'Restaurant data changed. Refresh and try again.');
    if (!Array.isArray(input.menu) || input.menu.length > 500) error(400, 'Invalid menu');
    const ids = new Set();
    for (const item of input.menu) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || !Number.isFinite(item.price) || item.price < 0 || item.price > 100000) error(400, 'Invalid menu item');
      ids.add(item.id); integer(item.stock, 0, 100000);
      if (!Array.isArray(item.tags) || !item.tags.every(t => typeof t === 'string') || !Array.isArray(item.modifiers?.spice) || !Array.isArray(item.modifiers?.removable) || !Array.isArray(item.modifiers?.addOns)) error(400, 'Invalid modifiers');
      if (item.modifiers.addOns.some(a => typeof a.name !== 'string' || !Number.isFinite(a.price) || a.price < 0 || a.price > 10000)) error(400, 'Invalid add-on');
    }
    state.menu = input.menu; save(user.id, 'menu updated'); return send(res, 200, project(req, new URL('/?portal=admin', origin)));
  }
  if (url.pathname === '/api/order' && req.method === 'POST') {
    rate(req, 'order', 20);
    const input = await body(req), context = tableContext(url), owner = guest(req, res);
    const key = req.headers['idempotency-key']; if (!/^[\w-]{8,100}$/.test(key || '')) error(400, 'Order request key required');
    if (state.orders.some(o => o.owner === owner && o.requestKey === key)) return send(res, 200, project(req, url));
    const order = makeOrder(input, context, owner, key);
    state.orders.unshift(order);
    for (const line of order.items) { const item = state.menu.find(i => i.id === line.id); item.stock -= line.qty; }
    save('guest', `order created ${order.id}`); return send(res, 201, project(req, url));
  }
  if (url.pathname === '/api/order-status' && req.method === 'POST') {
    const user = requireRole(req, ['admin', 'kitchen', 'staff']), input = await body(req);
    const order = state.orders.find(o => o.id === input.orderId);
    if (!order || (user.role !== 'admin' && order.branchId !== user.branch)) error(404, 'Order not found');
    if (input.lineId) {
      if (user.role === 'staff' && input.status !== 'served') error(403, 'Kitchen access required');
      const line = order.items.find(i => i.lineId === input.lineId);
      if (order.status === 'served' || !line || ({ new: 'preparing', preparing: 'ready', ready: 'served' })[line.itemStatus] !== input.status) error(409, 'Item status has already changed');
      line.itemStatus = input.status;
      order.status = order.items.every(i => i.itemStatus === 'served') ? 'served'
        : order.items.every(i => ['ready', 'served'].includes(i.itemStatus)) ? 'ready' : 'preparing';
    } else {
      if (order.status !== 'ready' || input.status !== 'served') error(409, 'Only ready orders can be served');
      order.status = 'served';
      order.items.forEach(item => { item.itemStatus = 'served'; });
    }
    save(user.id, `order status ${order.id}`); return send(res, 200, project(req, url));
  }
  if (url.pathname === '/api/staff-request' && req.method === 'POST') {
    rate(req, 'help', 5); const context = tableContext(url);
    if (!state.staffRequests.some(r => r.branchId === context.branch.id && r.table === context.table && r.status === 'open')) {
      state.staffRequests.unshift({ id: crypto.randomUUID(), branchId: context.branch.id, table: context.table, status: 'open', createdAt: new Date().toISOString() }); save('guest', 'staff requested');
    }
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/resolve-request' && req.method === 'POST') {
    const user = requireRole(req, ['admin', 'staff']), input = await body(req);
    const request = state.staffRequests.find(r => r.id === input.id && (user.role === 'admin' || r.branchId === user.branch));
    if (!request) error(404, 'Request not found'); request.status = 'resolved'; save(user.id, 'staff request resolved'); return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/table-links' && req.method === 'GET') {
    requireRole(req, ['admin']);
    return send(res, 200, state.branches.flatMap(b => Array.from({ length: b.tables }, (_, i) => ({ branch: b.id, table: i + 1, url: `${requestOrigin(req)}/menu?branch=${encodeURIComponent(b.id)}&table=${i + 1}&key=${signature(b.id, i + 1)}` }))));
  }
  if (url.pathname === '/api/qr' && req.method === 'GET') {
    requireRole(req, ['admin']); const context = tableContext(url);
    const target = `${requestOrigin(req)}/menu?branch=${encodeURIComponent(context.branch.id)}&table=${context.table}&key=${signature(context.branch.id, context.table)}`;
    const png = await QRCode.toBuffer(target, { width: 600, margin: 4, errorCorrectionLevel: 'M' });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }); return res.end(png);
  }
  error(404, 'Not found');
}
function redirect(res, target) { res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' }); res.end(); }
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' https://images.unsplash.com data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) error(405, 'Method not allowed');
    if (url.pathname === '/') {
      const portal = url.searchParams.get('app');
      return redirect(res, ['admin', 'kitchen', 'staff'].includes(portal) ? `/${portal}` : `/menu${url.search}`);
    }
    let filename;
    if (['/admin', '/kitchen', '/staff'].includes(url.pathname)) {
      const portal = url.pathname.slice(1), user = session(req);
      if (!user) return redirect(res, `/login?portal=${portal}`);
      if (user.role !== 'admin' && user.role !== portal) error(403, 'This account cannot access this portal');
      filename = portal === 'admin' ? 'index.html' : 'portal.html';
    } else if (url.pathname === '/menu') { guest(req, res); filename = 'portal.html'; }
    else if (url.pathname === '/login') filename = 'login.html';
    else if (url.pathname === '/app.js') { requireRole(req, ['admin']); filename = 'app.js'; }
    else if (['/styles.css', '/portal.css', '/portal.js', '/login.js', '/scanner.js'].includes(url.pathname)) filename = url.pathname.slice(1);
    else if (['/vendor/qr-scanner.min.js', '/vendor/qr-scanner-worker.min.js'].includes(url.pathname)) filename = path.join('node_modules', 'qr-scanner', path.basename(url.pathname));
    else error(404, 'Not found');
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' })[path.extname(filename)], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(ROOT, filename)));
  } catch (e) {
    if (res.headersSent) return res.end();
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong. Please retry.' });
  }
});
setInterval(() => { for (const [key, entry] of limits) if (entry.until < Date.now()) limits.delete(key); db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); }, 60000).unref();
server.listen(PORT, () => console.log(`TableServe: ${origin}`));
process.on('SIGTERM', () => { for (const c of clients) c.res.end(); server.close(() => { db.close(); process.exit(0); }); });
