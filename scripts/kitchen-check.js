const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tableserve-kitchen-'));
  const base = 'http://localhost:4199';
  let server, browser;
  try {
    const menu = ['Soup', 'Pizza', 'Dessert'].map((name, i) => ({ id: `dish-${i}`, name, category: 'Food', price: 100, stock: 10, available: true, availableFrom: '00:00', availableTo: '23:59', station: 'food', tags: [], modifiers: { spice: [], addOns: [], removable: [] } }));
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ branches: [{ id: 'branch-main', name: 'Central Test', tables: 3 }, { id: 'branch-river', name: 'Riverfront Test', tables: 3 }], settings: { gstRate: 0.05 }, menu, coupons: [], customers: [], integrations: [], eventLog: [], staffRequests: [], orders: [] }));
    server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'test', PORT: '4199', PUBLIC_ORIGIN: base, DATA_DIR: dir }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const passwords = Object.fromEntries(fs.readFileSync(path.join(dir, 'bootstrap-credentials.txt'), 'utf8').trim().split('\n').map(line => line.split(': ')));
    assert.equal((await context.request.post(base + '/api/login', { headers: { Origin: base }, data: { username: 'admin', password: passwords.admin, portal: 'admin' } })).status(), 200);
    const links = await (await context.request.get(base + '/api/table-links')).json();
    await context.request.get(base + '/menu');
    const placed = await context.request.post(base + '/api/order' + new URL(links.find(link => link.branch === 'branch-river').url).search, { headers: { Origin: base, 'Idempotency-Key': 'kitchen-three-item-order' }, data: { items: menu.map(item => ({ id: item.id, qty: 1 })) } });
    assert.equal(placed.status(), 201);
    const order = (await placed.json()).orders[0];
    const kitchenContext = await browser.newContext(), staffContext = await browser.newContext();
    for (const [role, employeeContext] of [['kitchen', kitchenContext], ['staff', staffContext]]) {
      assert.equal((await employeeContext.request.post(base + '/api/login', { headers: { Origin: base }, data: { username: role, password: passwords[role], portal: role } })).status(), 200);
    }
    const page = await kitchenContext.newPage(), staff = await staffContext.newPage();
    const errors = [];
    for (const p of [page, staff]) p.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/kitchen'); await staff.goto(base + '/staff');
    const lanes = async (p, counts) => {
      await p.waitForFunction(expected => ['new', 'preparing', 'ready'].every((status, i) => document.querySelectorAll(`[data-lane="${status}"] .ticket-line`).length === expected[i]), counts);
      assert.equal(await p.locator('.ticket-line').count(), counts.reduce((a,b) => a+b, 0));
    };
    await lanes(page, [0, 0, 0]);
    const team = await (await context.request.get(base + '/api/team')).json();
    assert.equal((await kitchenContext.request.get(base + '/api/team')).status(), 403);
    assert.equal((await kitchenContext.request.post(base + '/api/team-branch', { headers: { Origin: base }, data: { userId: team.users.find(user => user.role === 'kitchen').id, branchId: 'branch-river' } })).status(), 403);
    const adminPage = await context.newPage();
    await adminPage.goto(base + '/admin');
    await adminPage.locator('#teamAccess').click();
    const kitchenForm = adminPage.locator('.team-assignment').filter({ hasText: 'kitchen (kitchen)' });
    await kitchenForm.locator('select').selectOption('branch-river');
    await kitchenForm.getByRole('button', { name: 'Save branch' }).click();
    await lanes(page, [3, 0, 0]);
    assert.equal(await page.locator('#restaurant').textContent(), 'Riverfront Test');
    const staffForm = adminPage.locator('.team-assignment').filter({ hasText: 'staff (staff)' });
    await staffForm.locator('select').selectOption('branch-river');
    await staffForm.getByRole('button', { name: 'Save branch' }).click();
    await lanes(staff, [3, 0, 0]);
    const soup = page.locator('.ticket-line').filter({ hasText: 'Soup' });
    await soup.getByRole('button', { name: 'Start', exact: true }).click();
    await lanes(page, [2, 1, 0]); await lanes(staff, [2, 1, 0]);
    assert.match(await page.locator('[data-lane="new"]').textContent(), /Pizza/);
    assert.match(await page.locator('[data-lane="new"]').textContent(), /Dessert/);
    assert.doesNotMatch(await page.locator('[data-lane="new"]').textContent(), /Soup/);
    await soup.getByRole('button', { name: 'Ready', exact: true }).click();
    await lanes(page, [2, 0, 1]); await lanes(staff, [2, 0, 1]);
    assert.equal(await page.getByRole('button', { name: 'Served', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Serve remaining items', exact: true }).count(), 0);
    assert.equal((await context.request.post(base + '/api/order-status?portal=kitchen', { headers: { Origin: base }, data: { orderId: order.id, status: 'served' } })).status(), 409);
    await page.reload(); await lanes(page, [2, 0, 1]);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../test-results/kitchen-item-lanes.png'), fullPage: true });
    const second = await context.request.post(base + '/api/order' + new URL(links.find(link => link.branch === 'branch-river').url).search, { headers: { Origin: base, 'Idempotency-Key': 'second-order-same-table' }, data: { items: [{ id: menu[0].id, qty: 1 }] } });
    assert.equal(second.status(), 201);
    await lanes(page, [3, 0, 1]);
    await staff.locator('[data-lane="ready"] .ticket-line').filter({ hasText: 'Soup' }).getByRole('button', { name: 'Served', exact: true }).click();
    await lanes(page, [3, 0, 0]); await lanes(staff, [3, 0, 0]);
    let snapshot = await (await context.request.get(base + '/api/state?portal=admin')).json();
    assert.equal(snapshot.orders.find(o => o.id === order.id).items.find(i => i.name === 'Soup').itemStatus, 'served');
    assert.equal(snapshot.orders.find(o => o.id !== order.id).status, 'new');
    assert.equal(snapshot.orders.find(o => o.id === order.id).payment.status, 'pending');
    const premature = { orderId: order.id, lineId: order.items.find(i => i.name === 'Pizza').lineId, status: 'served' };
    assert.equal((await staffContext.request.post(base + '/api/order-status?portal=staff', { headers: { Origin: base }, data: premature })).status(), 409);
    await page.reload(); await lanes(page, [3, 0, 0]);
    for (const name of ['Pizza', 'Dessert']) {
      const item = page.locator('.ticket-line').filter({ hasText: name });
      await item.getByRole('button', { name: 'Start', exact: true }).click();
      await item.getByRole('button', { name: 'Ready', exact: true }).click();
    }
    await lanes(page, [1, 0, 2]); await lanes(staff, [1, 0, 2]);
    assert.equal(await page.getByRole('button', { name: 'Serve remaining items', exact: true }).count(), 1);
    await page.locator('.ticket-line').filter({ hasText: 'Pizza' }).getByRole('button', { name: 'Served', exact: true }).click();
    await lanes(page, [1, 0, 1]);
    await page.locator('.ticket-line').filter({ hasText: 'Dessert' }).getByRole('button', { name: 'Served', exact: true }).click();
    await lanes(page, [1, 0, 0]); await lanes(staff, [1, 0, 0]);
    snapshot = await (await context.request.get(base + '/api/state?portal=admin')).json();
    assert.equal(snapshot.orders.find(o => o.id === order.id).status, 'served');
    assert.equal(snapshot.orders.find(o => o.id !== order.id).status, 'new');
    assert.deepEqual(errors, []);
    console.log('Kitchen regression passed: individual serving by kitchen/staff, other items and same-table orders unchanged, final-item order completion, pending payment preserved, reload and live sync.');
  } finally {
    if (browser) await browser.close();
    if (server) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill(); await ended; }
    if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected temporary directory');
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
