const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tableserve-mobile-'));
  const host = Object.values(os.networkInterfaces()).flat().find(n => n.family === 'IPv4' && !n.internal)?.address || '127.0.0.1';
  const base = `http://${host}:4198`;
  let server, browser;
  try {
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
      branches: [{ id: 'branch-main', name: 'Mobile Test Restaurant', tables: 3 }], settings: { gstRate: 0.05 },
      coupons: [], customers: [], integrations: [], eventLog: [], staffRequests: [], orders: [],
      menu: [{ id: 'dish', name: 'Test dish', description: 'Prepared to order', image: '', category: 'Mains', station: 'food', price: 100, stock: 10, available: true, availableFrom: '00:00', availableTo: '23:59', tags: [], modifiers: { spice: ['Mild'], addOns: [], removable: [] } }]
    }));
    server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'test', PORT: '4198', PUBLIC_ORIGIN: '', DATA_DIR: dir }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Reproduce browsers without secure-context UUID support, including LAN HTTP.
    await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }));
    await page.goto(base + '/menu');
    await page.locator('.dish').waitFor();
    assert.equal(await page.locator('#cartFab').isVisible(), false);
    await page.getByRole('button', { name: 'Add to order', exact: true }).click();
    assert.equal(await page.locator('#cartFab').isVisible(), true);
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    assert.equal(await page.locator('#tableNotice').isVisible(), true);
    assert.match(await page.locator('#notice').textContent(), /scan your table/i);
    await page.getByRole('button', { name: 'Request staff', exact: true }).click();
    assert.match(await page.locator('#notice').textContent(), /scan your table/i);

    const passwords = Object.fromEntries(fs.readFileSync(path.join(dir, 'bootstrap-credentials.txt'), 'utf8').trim().split('\n').map(line => line.split(': ')));
    const adminContext = await browser.newContext();
    assert.equal((await adminContext.request.post(base + '/api/login', { headers: { Origin: base }, data: { username: 'admin', password: passwords.admin, portal: 'admin' } })).status(), 200);
    const links = await (await adminContext.request.get(base + '/api/table-links')).json();
    assert.equal(new URL(links[0].url).origin, base);
    await page.locator('#scanTable').click();
    await page.locator('.scanner-dialog').waitFor();
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../test-results/scanner-mobile.png') });
    const qrFile = async value => ({ name: 'table.png', mimeType: 'image/png', buffer: await QRCode.toBuffer(value, { width: 600 }) });
    await page.locator('#scanImage').setInputFiles(await qrFile('https://unrelated.example/menu?key=not-a-table'));
    await page.waitForFunction(() => document.getElementById('scanStatus').textContent.includes('not a table link'));
    assert.equal(new URL(page.url()).searchParams.has('key'), false);
    const invalid = new URL(links[0].url); invalid.searchParams.set('key', 'forged');
    await page.locator('#scanImage').setInputFiles(await qrFile(invalid.href));
    await page.waitForFunction(() => document.getElementById('scanStatus').textContent.includes('QR is invalid'));
    await page.locator('#scanImage').setInputFiles(await qrFile(links[0].url));
    await page.waitForFunction(() => !document.querySelector('.scanner-dialog'));
    assert.equal(await page.locator('#tableBadge').textContent(), 'Table 1');
    assert.equal(await page.locator('#cartFabCount').textContent(), '1 item');
    assert.equal(await page.locator('#tableNotice').isVisible(), false);
    assert.equal(await page.locator('#order').isEnabled(), true);
    await page.locator('#scanTable').click();
    await page.getByRole('button', { name: 'Close scanner', exact: true }).click();
    assert.equal(await page.locator('.scanner-dialog').count(), 0);
    const cameraPage = await context.newPage();
    await cameraPage.goto('http://localhost:4198/menu');
    await cameraPage.locator('#scanTable').click();
    await cameraPage.waitForFunction(() => document.querySelector('.scanner-dialog video')?.srcObject?.active);
    await cameraPage.evaluate(() => window.testTracks = document.querySelector('.scanner-dialog video').srcObject.getTracks());
    await cameraPage.getByRole('button', { name: 'Close scanner', exact: true }).click();
    await cameraPage.waitForFunction(() => window.testTracks.every(track => track.readyState === 'ended'));
    await cameraPage.close();
    const admin = await adminContext.newPage(); await admin.goto(base + '/admin');
    await admin.locator('#adminMenuList .admin-item').waitFor();
    await admin.getByRole('button', { name: 'Customer', exact: true }).click();
    await admin.waitForURL('**/menu?**'); assert.ok(new URL(admin.url()).searchParams.get('key'));

    await page.goto(links[0].url); await page.locator('.dish').waitFor();
    assert.equal(await page.locator('#tableNotice').isVisible(), false);
    await page.getByRole('button', { name: 'Add to order', exact: true }).click();
    assert.equal(await page.locator('#cartFabCount').textContent(), '1 item');
    assert.match(await page.locator('#cartFabTotal').textContent(), /105/);
    await page.locator('#cartFab').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'orderHeading');
    assert.ok(await page.locator('#yourOrder').evaluate(el => el.getBoundingClientRect().top < innerHeight));
    await page.getByRole('button', { name: 'Add one Test dish', exact: true }).click();
    assert.equal(await page.locator('#cartFabCount').textContent(), '2 items');
    assert.match(await page.locator('#cartFabTotal').textContent(), /210/);
    const bounds = await page.locator('#cartFab').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.setViewportSize({ width: 1440, height: 1000 }); assert.equal(await page.locator('#cartFab').isVisible(), false);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole('button', { name: 'Request staff', exact: true }).click();
    await page.getByRole('button', { name: 'Staff notified', exact: true }).waitFor();
    let snapshot = await (await adminContext.request.get(base + '/api/state?portal=admin')).json();
    assert.equal(snapshot.staffRequests.length, 1); assert.equal(snapshot.staffRequests[0].table, 1);

    await page.route('**/api/order?**', route => route.abort(), { times: 1 });
    await page.locator('#order').click();
    await page.waitForFunction(() => !document.getElementById('order').disabled);
    assert.equal(await page.locator('#cartFabCount').textContent(), '2 items');
    await page.locator('#order').click();
    await page.locator('.order-receipt').waitFor();
    assert.equal(await page.locator('#cartFab').isVisible(), false);
    snapshot = await (await adminContext.request.get(base + '/api/state?portal=admin')).json();
    assert.equal(snapshot.orders.length, 1); assert.equal(snapshot.orders[0].items[0].qty, 2);
    assert.equal(snapshot.orders[0].payment.total, 210);
    assert.deepEqual(errors, []);
    console.log('Mobile checks passed: QR image decoding, invalid/foreign QR rejection, preserved cart, camera start/cleanup, LAN HTTP, signed Admin link, FAB, staff request and order retry.');
  } finally {
    if (browser) await browser.close();
    if (server) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill(); await ended; }
    if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected temporary directory');
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
