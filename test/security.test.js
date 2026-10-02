const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tableserve-test-'));
const base = 'http://localhost:4197';
let child, passwords, admin, kitchen, guest, other, link, snapshot, order;
const fixture = {
  branches: [{ id: 'branch-main', name: 'Test Restaurant', tables: 3 }, { id: 'branch-other', name: 'Other branch', tables: 2 }],
  settings: { gstRate: 0.05 }, coupons: [], customers: [{ name: 'Private Person', phone: '1234567890' }], integrations: [], eventLog: [], staffRequests: [], orders: [],
  menu: [{ id: 'dish', name: 'Test dish', category: 'Mains', price: 100, stock: 5, available: true, availableFrom: '00:00', availableTo: '23:59', tags: [], modifiers: { spice: ['Mild'], addOns: [{ name: 'Cheese', price: 20 }], removable: ['Onion'] } }]
};
async function get(route, cookie) { return fetch(base + route, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} }); }
async function post(route, data, cookie, headers = {}) { return fetch(base + route, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify(data) }); }
async function login(role) { const response = await post('/api/login', { username: role, password: passwords[role], portal: role }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
before(async () => {
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(fixture));
  child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '4197', PUBLIC_ORIGIN: base, DATA_DIR: dir }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await get('/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  passwords = Object.fromEntries(fs.readFileSync(path.join(dir, 'bootstrap-credentials.txt'), 'utf8').trim().split('\n').map(line => line.split(': ')));
  admin = await login('admin'); kitchen = await login('kitchen');
  guest = (await get('/menu')).headers.get('set-cookie').split(';')[0];
  other = (await get('/menu')).headers.get('set-cookie').split(';')[0];
  const links = await (await get('/api/table-links', admin)).json();
  link = new URL(links[0].url).search;
});
after(async () => { if (child) { const exited = new Promise(r => child.once('exit', r)); child.kill(); await exited; } fs.rmSync(dir, { recursive: true, force: true }); });
test('private files and admin code are inaccessible to visitors', async () => {
  for (const route of ['/server.js', '/data/state.json', '/data/restaurant.sqlite', '/data/bootstrap-credentials.txt', '/package.json', '/index.html']) assert.equal((await get(route)).status, 404, route);
  assert.equal((await get('/app.js')).status, 403);
  assert.equal((await get('/admin')).status, 302);
  assert.equal((await get('/kitchen')).status, 302);
  assert.equal((await get('/admin', kitchen)).status, 403);
});
test('public and kitchen projections exclude customer and financial data', async () => {
  const publicData = await (await get('/api/state', guest)).json();
  assert.deepEqual(publicData.customers, []); assert.deepEqual(publicData.orders, []);
  assert.equal((await get('/api/state?portal=admin', kitchen)).status, 403);
  assert.equal((await get('/api/events?portal=admin', guest)).status, 403);
  const k = await (await get('/api/state?portal=kitchen', kitchen)).json();
  assert.equal(k.branches.length, 1); assert.equal(k.customers, undefined);
});
test('whole-state writes and kitchen menu writes are rejected', async () => {
  assert.equal((await post('/api/state', fixture, kitchen)).status, 405);
  assert.equal((await post('/api/menu', { menu: [] }, kitchen)).status, 403);
  assert.equal((await post('/api/menu', { menu: [] }, admin, { Origin: 'https://attacker.example' })).status, 403);
});
test('orders require a valid table signature and server accepts only valid quantities', async () => {
  assert.equal((await post('/api/order?branch=branch-main&table=1', { items: [] }, guest, { 'Idempotency-Key': 'bad-table-key' })).status, 403);
  assert.equal((await post('/api/order' + link, { items: [{ id: 'dish', qty: -2 }] }, guest, { 'Idempotency-Key': 'bad-quantity-key' })).status, 400);
});
test('prices and payment status are server-authoritative, retry is idempotent', async () => {
  const input = { id: 'forged', items: [{ id: 'dish', qty: 2, price: 1, spice: 'Mild', addOns: [{ name: 'Cheese', price: 0 }], priority: 'first' }], payment: { total: 1, status: 'paid', method: 'pay-later' } };
  const response = await post('/api/order' + link, input, guest, { 'Idempotency-Key': 'stable-order-key' });
  assert.equal(response.status, 201);
  snapshot = await response.json(); order = snapshot.orders[0];
  assert.equal(order.payment.total, 252); assert.equal(order.payment.status, 'pending'); assert.notEqual(order.id, 'forged');
  assert.equal(snapshot.menu[0].stock, 3);
  const retry = await post('/api/order' + link, input, guest, { 'Idempotency-Key': 'stable-order-key' });
  const data = await retry.json(); assert.equal(data.orders.length, 1); assert.equal(data.menu[0].stock, 3);
  assert.deepEqual((await (await get('/api/state', other)).json()).orders, []);
});
test('stock is checked across repeated order lines and online payment cannot be fabricated', async () => {
  assert.equal((await post('/api/order' + link, { items: [{ id: 'dish', qty: 2 }, { id: 'dish', qty: 2 }] }, guest, { 'Idempotency-Key': 'excess-order-key' })).status, 409);
  assert.equal((await post('/api/order' + link, { items: [{ id: 'dish', qty: 1 }], payment: { method: 'upi' } }, guest, { 'Idempotency-Key': 'fake-payment-key' })).status, 400);
});
test('SSE redacts other guests orders and kitchen customer information', async () => {
  const response = await get('/api/events', other), reader = response.body.getReader();
  const event = new TextDecoder().decode((await reader.read()).value); await reader.cancel();
  assert.deepEqual(JSON.parse(event.slice(6)).state.orders, []);
  const kitchenData = await (await get('/api/state?portal=kitchen', kitchen)).json();
  assert.equal(kitchenData.orders[0].payment, undefined); assert.equal(kitchenData.orders[0].customer, undefined);
});
test('item status transitions enforce workflow and serving never marks paid', async () => {
  const url = '/api/order-status?portal=kitchen';
  assert.equal((await post(url, { orderId: order.id, lineId: order.items[0].lineId, status: 'ready' }, kitchen)).status, 409);
  for (const status of ['preparing', 'ready']) assert.equal((await post(url, { orderId: order.id, lineId: order.items[0].lineId, status }, kitchen)).status, 200);
  assert.equal((await post(url, { orderId: order.id, status: 'served' }, kitchen)).status, 200);
  const data = await (await get('/api/state', guest)).json(); assert.equal(data.orders[0].payment.status, 'pending');
  assert.equal((await post('/api/collect-payment', { orderId: order.id, amount: 252 }, kitchen)).status, 403);
});
test('stale menu edits cannot overwrite stock or orders', async () => {
  assert.equal((await post('/api/menu', { menu: fixture.menu, revision: snapshot.revision }, admin)).status, 409);
});
test('live events deliver order changes only to the owning guest', async () => {
  const response = await get('/api/events', guest), reader = response.body.getReader();
  await reader.read();
  const submitted = await post('/api/order' + link, { items: [{ id: 'dish', qty: 1 }] }, guest, { 'Idempotency-Key': 'live-order-key' });
  assert.equal(submitted.status, 201);
  const event = JSON.parse(new TextDecoder().decode((await reader.read()).value).slice(6));
  await reader.cancel(); assert.equal(event.state.orders.length, 2);
  assert.deepEqual((await (await get('/api/state', other)).json()).orders, []);
});
test('kitchen cannot see or update another branch order', async () => {
  const links = await (await get('/api/table-links', admin)).json();
  const query = new URL(links.find(l => l.branch === 'branch-other').url).search;
  const response = await post('/api/order' + query, { items: [{ id: 'dish', qty: 1 }] }, other, { 'Idempotency-Key': 'other-branch-key' });
  assert.equal(response.status, 201);
  const foreign = (await response.json()).orders[0];
  assert.equal((await post('/api/order-status?portal=kitchen', { orderId: foreign.id, lineId: foreign.items[0].lineId, status: 'preparing' }, kitchen)).status, 404);
  assert.equal((await (await get('/api/state?portal=kitchen', kitchen)).json()).orders.some(o => o.id === foreign.id), false);
});
test('staff records cash explicitly and duplicate collection is rejected', async () => {
  const staff = await login('staff');
  assert.equal((await post('/api/collect-payment', { orderId: order.id, amount: 1 }, staff)).status, 400);
  assert.equal((await post('/api/collect-payment', { orderId: order.id, amount: 252 }, staff)).status, 200);
  assert.equal((await post('/api/collect-payment', { orderId: order.id, amount: 252 }, staff)).status, 409);
});
test('QR codes are generated locally and logout revokes cookies', async () => {
  const qr = await get('/api/qr' + link, admin); assert.equal(qr.status, 200); assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal((await post('/api/logout', {}, kitchen)).status, 200);
  assert.equal((await get('/api/state?portal=kitchen', kitchen)).status, 403);
});
