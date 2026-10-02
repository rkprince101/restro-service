const portal = location.pathname === '/kitchen' ? 'kitchen' : location.pathname === '/staff' ? 'staff' : 'customer';
try {
  localStorage.removeItem('tableserve-demo-state-v2');
  localStorage.removeItem('tableserve-session-v1');
} catch { /* Ordering does not depend on browser storage being enabled. */ }
const params = new URLSearchParams(location.search);
params.set('portal', portal);
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
let state, cart = [], category = 'All', search = '', submitting = false, requestingStaff = false, requestKey = newId();
const fields = { name: '', phone: '', note: '', tip: 0, split: 1, coupon: '' };
let table = Number(params.get('table'));
let stream;
function notice(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(notice.timer); notice.timer = setTimeout(() => $('notice').hidden = true, 6000); }
async function api(path, input, key) {
  const response = await fetch(`${path}?${params}`, input ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(input) } : { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) { if (response.status === 403 && portal !== 'customer') location.assign(`/login?portal=${portal}`); throw new Error(result.error); }
  return result;
}
function available(item) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const from = item.availableFrom || '00:00', to = item.availableTo || '23:59';
  return item.available && item.stock > 0 && (from <= to ? time >= from && time <= to : time >= from || time <= to);
}
function linePrice(line) { const item = state.menu.find(i => i.id === line.id); return item ? (item.price + line.addOns.reduce((n, a) => n + a.price, 0) + (line.combo ? 99 : 0)) * line.qty : 0; }
function customerShell() {
  $('workspace').innerHTML = `<div class="customer-layout"><section><div class="menu-toolbar"><div><p class="eyebrow">FRESH FROM OUR KITCHEN</p><h1>What sounds good?</h1></div><input id="search" type="search" placeholder="Search the menu" aria-label="Search the menu"></div><nav class="category-bar" id="categories" aria-label="Menu categories"></nav><div class="menu-grid" id="menu"></div></section><aside class="cart"><h2>Your order <small>${table ? `Table ${table}` : ''}</small></h2><div id="cartLines"></div><div class="cart-fields"><label>Name (optional)<input id="name" maxlength="80" autocomplete="given-name"></label><label>Phone (optional)<input id="phone" type="tel" maxlength="20" autocomplete="tel"></label><label>Kitchen note<textarea id="note" maxlength="500" rows="2"></textarea></label><div class="line-options"><label>Tip<input id="tip" type="number" min="0" max="10000" value="0"></label><label>Split estimate<input id="split" type="number" min="1" max="30" value="1"></label></div><label>Coupon<input id="coupon" maxlength="30"></label></div><div id="bill" class="bill"></div><button id="order" class="primary">Place order</button><p class="muted">Pay at the restaurant. Split amounts are estimates; payment is collected by staff.</p><button id="help">Request staff</button><div id="receipts"></div></aside></div>`;
  $('search').oninput = event => { search = event.target.value; renderMenu(); };
  const scanButton = document.createElement('button');
  scanButton.id = 'scanTable'; scanButton.type = 'button'; scanButton.textContent = 'Scan table QR';
  document.querySelector('.header-actions').prepend(scanButton);
  scanButton.onclick = async () => {
    scanButton.disabled = true;
    try { const { openScanner } = await import('/scanner.js'); openScanner(connectTable); }
    catch { notice('Unable to open the scanner. Please try again.'); }
    finally { scanButton.disabled = false; }
  };
  document.querySelector('.cart').id = 'yourOrder';
  const heading = document.querySelector('.cart h2');
  heading.id = 'orderHeading'; heading.tabIndex = -1;
  const tableNotice = document.createElement('p');
  tableNotice.id = 'tableNotice'; tableNotice.className = 'table-notice'; tableNotice.tabIndex = -1;
  $('bill').before(tableNotice);
  const fab = document.createElement('button');
  fab.id = 'cartFab'; fab.className = 'cart-fab'; fab.type = 'button'; fab.hidden = true;
  fab.setAttribute('aria-controls', 'yourOrder');
  fab.innerHTML = '<span id="cartFabCount"></span><strong>View order</strong><span id="cartFabTotal"></span>';
  document.body.append(fab);
  fab.onclick = () => {
    heading.focus({ preventScroll: true });
    $('yourOrder').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  };
  for (const key of Object.keys(fields)) $(key).oninput = event => { fields[key] = event.target.value; renderBill(); };
  $('order').onclick = placeOrder;
  $('help').onclick = requestStaff;
  $('menu').onclick = event => {
    const id = event.target.closest('[data-add]')?.dataset.add; if (!id) return;
    const item = state.menu.find(i => i.id === id);
    cart.push({ lineId: newId(), id, qty: 1, priority: 'normal', spice: item.modifiers.spice[0] || '', addOns: [], remove: [], combo: false });
    requestKey = newId(); renderCart();
  };
  $('categories').onclick = event => { const button = event.target.closest('[data-category]'); if (button) { category = button.dataset.category; renderMenu(); } };
  $('cartLines').onclick = event => {
    const button = event.target.closest('[data-qty]'); if (!button) return;
    const line = cart.find(l => l.lineId === button.dataset.line); line.qty += Number(button.dataset.qty);
    cart = cart.filter(l => l.qty > 0); requestKey = newId(); renderCart();
  };
  $('cartLines').onchange = event => {
    const control = event.target, line = cart.find(l => l.lineId === control.dataset.line); if (!line) return;
    const item = state.menu.find(i => i.id === line.id);
    if (control.dataset.field === 'addOns') { const add = item.modifiers.addOns[Number(control.value)]; line.addOns = control.checked ? [...line.addOns, add] : line.addOns.filter(a => a.name !== add.name); }
    else if (control.dataset.field === 'remove') line.remove = control.checked ? [...line.remove, control.value] : line.remove.filter(v => v !== control.value);
    else line[control.dataset.field] = control.type === 'checkbox' ? control.checked : control.value;
    requestKey = newId(); renderBill();
  };
}
async function connectTable(value, stillOpen) {
  let target;
  try { target = new URL(value); } catch { throw new Error('This is not a table QR. Please scan the QR on your table.'); }
  if (target.origin !== location.origin || target.pathname !== '/menu' || !target.searchParams.get('key')) throw new Error('This QR is not a table link for this restaurant.');
  const query = new URLSearchParams({ portal: 'customer' });
  for (const key of ['branch', 'table', 'key']) query.set(key, target.searchParams.get(key) || '');
  const response = await fetch(`/api/state?${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to check the table. Please try again.');
  const next = await response.json();
  if (!next.tableContext) throw new Error('This table QR is invalid. Please ask staff for the current QR.');
  if (!stillOpen()) return;
  stream?.close();
  for (const key of ['branch', 'table', 'key']) params.set(key, query.get(key));
  table = next.tableContext.table;
  state = next; requestKey = newId();
  const address = new URL(location.href); address.search = query.toString(); address.searchParams.delete('portal');
  history.replaceState(null, '', address);
  $('tableBadge').textContent = `Table ${table}`;
  document.querySelector('.cart h2 small').textContent = `Table ${table}`;
  $('help').textContent = 'Request staff';
  renderCart(); refresh(); connectStream();
  notice(`Connected to Table ${table}. Your cart is ready.`);
}
function connectStream() {
  stream = new EventSource(`/api/events?${params}`);
  stream.onmessage = event => { state = JSON.parse(event.data).state; $('connection').textContent = 'Live'; refresh(); };
  stream.onerror = () => { $('connection').textContent = 'Reconnecting...'; };
}
function renderMenu() {
  $('categories').innerHTML = ['All', ...new Set(state.menu.map(i => i.category))].map(c => `<button class="${category === c ? 'selected' : ''}" data-category="${escape(c)}">${escape(c)}</button>`).join('');
  const items = state.menu.filter(i => (category === 'All' || i.category === category) && `${i.name} ${i.description} ${i.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  $('menu').innerHTML = items.map(i => `<article class="dish"><img src="${escape(/^https:\/\/images\.unsplash\.com\//.test(i.image) ? i.image : '')}" alt="${escape(i.name)}" loading="lazy"><div class="dish-content"><div class="dish-title"><h3>${escape(i.name)}</h3><strong>${money(i.price)}</strong></div><p>${escape(i.description)}</p><span class="tags">${i.tags.map(escape).join(' / ')}</span><button data-add="${escape(i.id)}" ${available(i) ? '' : 'disabled'}>${available(i) ? 'Add to order' : 'Unavailable'}</button></div></article>`).join('') || '<div class="empty">No dishes found.</div>';
}
function renderCart() {
  $('cartLines').innerHTML = cart.map(line => {
    const item = state.menu.find(i => i.id === line.id); if (!item) return '<p>An item has been removed from the menu. Please remove it from your order.</p>';
    const options = (values, selected) => values.map(v => `<option ${v === selected ? 'selected' : ''}>${escape(v)}</option>`).join('');
    const attr = field => `data-line="${line.lineId}" data-field="${field}"`;
    return `<div class="cart-line"><div class="line-top"><strong>${escape(item.name)}</strong><span>${money(linePrice(line))}</span></div><div class="quantity"><button data-qty="-1" data-line="${line.lineId}" aria-label="Remove one ${escape(item.name)}">−</button><span>${line.qty}</span><button data-qty="1" data-line="${line.lineId}" ${line.qty >= 20 ? 'disabled' : ''} aria-label="Add one ${escape(item.name)}">+</button></div><div class="line-options"><label>Serve<select ${attr('priority')}><option value="first" ${line.priority === 'first' ? 'selected' : ''}>Need first</option><option value="normal" ${line.priority === 'normal' ? 'selected' : ''}>Normal</option><option value="later" ${line.priority === 'later' ? 'selected' : ''}>Can wait</option></select></label><label>Spice<select ${attr('spice')}>${options(item.modifiers.spice, line.spice)}</select></label></div><details><summary>Extras and ingredients</summary>${item.modifiers.addOns.map((a, index) => `<label class="check"><input type="checkbox" ${attr('addOns')} value="${index}" ${line.addOns.some(v => v.name === a.name) ? 'checked' : ''}>${escape(a.name)} +${money(a.price)}</label>`).join('')}${item.modifiers.removable.map(r => `<label class="check"><input type="checkbox" ${attr('remove')} value="${escape(r)}" ${line.remove.includes(r) ? 'checked' : ''}>No ${escape(r)}</label>`).join('')}<label class="check"><input type="checkbox" ${attr('combo')} ${line.combo ? 'checked' : ''}>Drink combo +${money(99)}</label></details></div>`;
  }).join('') || '<p class="empty">Your next favourite dish belongs here.</p>';
  renderBill();
}
function renderBill() {
  const subtotal = cart.reduce((n, l) => n + linePrice(l), 0), tax = Math.round(subtotal * state.settings.gstRate), total = subtotal + tax + Math.max(0, Number(fields.tip) || 0);
  $('bill').innerHTML = `<div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>Tax</span><span>${money(tax)}</span></div><div><span>Tip</span><span>${money(fields.tip)}</span></div><div class="total"><span>Estimated total</span><span>${money(total)}</span></div>${Number(fields.split) > 1 ? `<div><span>Per person</span><span>${money(Math.ceil(total / Number(fields.split)))}</span></div>` : ''}${fields.coupon ? '<small>Valid coupons are applied when the order is placed.</small>' : ''}`;
  $('order').disabled = submitting || !cart.length;
  $('order').textContent = submitting ? 'Sending order...' : 'Place order';
  $('help').disabled = requestingStaff;
  $('tableNotice').hidden = !!state.tableContext;
  $('tableNotice').textContent = params.get('key') ? 'This table link is invalid. Use Scan table QR to connect again, or ask a staff member for help.' : 'Use Scan table QR to connect to your table and place an order or request staff. Your cart will be kept.';
  const count = cart.reduce((sum, line) => sum + line.qty, 0);
  $('cartFab').hidden = count === 0;
  document.body.classList.toggle('has-cart', count > 0);
  $('cartFabCount').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  $('cartFabTotal').textContent = money(total);
  $('cartFab').setAttribute('aria-label', `View your order, ${count} ${count === 1 ? 'item' : 'items'}, estimated ${money(total)}`);
}
function requireTable() {
  if (state.tableContext) return true;
  $('tableNotice').hidden = false;
  $('tableNotice').focus();
  notice('Please scan your table QR code first.');
  return false;
}
async function requestStaff() {
  if (requestingStaff || !requireTable()) return;
  requestingStaff = true; $('help').textContent = 'Notifying staff...'; renderBill();
  try { await api('/api/staff-request', {}); notice(`Staff notified for Table ${table}.`); $('help').textContent = 'Staff notified'; }
  catch (e) { notice(e.message); $('help').textContent = 'Request staff'; }
  finally { requestingStaff = false; renderBill(); }
}
async function placeOrder() {
  if (submitting || !cart.length || !requireTable()) return; submitting = true; renderBill();
  try {
    state = await api('/api/order', { items: cart, note: fields.note, customer: { name: fields.name, phone: fields.phone }, payment: { method: 'pay-later', tip: Number(fields.tip), split: Number(fields.split), coupon: fields.coupon } }, requestKey);
    cart = []; requestKey = newId(); fields.note = ''; $('note').value = ''; renderCart(); renderReceipts(); notice('Order received. The kitchen will start preparing it shortly.');
  } catch (e) { notice(e.message); }
  finally { submitting = false; renderBill(); }
}
function renderReceipts() {
  $('receipts').innerHTML = state.orders.map(o => `<article class="order-receipt"><strong>Table ${o.table} · ${escape(o.status)}</strong><p>${o.items.map(i => `${i.qty} × ${escape(i.name)} (${escape(i.itemStatus)})`).join('<br>')}</p><p>${money(o.payment.total)} · Payment ${escape(o.payment.status)}</p><small>Order ${escape(o.id.slice(0, 8))}</small></article>`).join('');
}
function renderBoard() {
  const orders = state.orders.filter(o => o.status !== 'served');
  // Keep each table ticket in every lane containing one of its items.
  const laneOrders = Object.fromEntries(['new', 'preparing', 'ready'].map(status => [status,
    orders.map(order => ({ ...order, items: order.items.filter(item => item.itemStatus === status) }))
      .filter(order => order.items.length > 0)
  ]));
  $('workspace').innerHTML = `<section class="board-wrap"><div class="board-title"><h1>${portal === 'staff' ? 'Floor service' : 'Kitchen orders'}</h1><span>${orders.length} open orders</span></div>${portal === 'staff' ? `<div class="requests">${state.staffRequests.filter(r => r.status === 'open').map(r => `<article class="ticket">Table ${r.table} needs assistance <button data-resolve="${escape(r.id)}">Resolved</button></article>`).join('')}</div>` : ''}<div class="board">${['new', 'preparing', 'ready'].map(status => `<section class="lane" data-lane="${status}"><h2>${{ new: 'New orders', preparing: 'Preparing', ready: 'Ready to serve' }[status]}<span>${laneOrders[status].length}</span></h2>${laneOrders[status].map(o => `<article class="ticket"><header><strong>Table ${o.table}</strong><small>${Math.max(0, Math.floor((Date.now() - Date.parse(o.createdAt)) / 60000))} min</small></header>${[...o.items].sort((a,b) => ({ first: 0, normal: 1, later: 2 })[a.priority] - ({ first: 0, normal: 1, later: 2 })[b.priority]).map(i => `<div class="ticket-line"><div><strong>${i.qty} × ${escape(i.name)}</strong><small class="${i.priority === 'first' ? 'priority' : ''}">${{ first: 'Need first', normal: 'Normal', later: 'Can wait' }[i.priority]}</small><small>${escape([i.spice, ...i.addOns.map(a => a.name), ...i.remove.map(r => `No ${r}`), i.combo ? 'Drink combo' : ''].filter(Boolean).join(' / '))}</small></div>${i.itemStatus === 'ready' ? `<button class="primary" data-order="${o.id}" data-line="${i.lineId}" data-status="served">Served</button>` : portal !== 'staff' ? `<button data-order="${o.id}" data-line="${i.lineId}" data-status="${i.itemStatus === 'new' ? 'preparing' : 'ready'}">${i.itemStatus === 'new' ? 'Start' : 'Ready'}</button>` : `<small>${escape(i.itemStatus)}</small>`}</div>`).join('')}${o.note ? `<p>${escape(o.note)}</p>` : ''}${o.status === 'ready' ? `<button class="primary" data-order="${o.id}" data-status="served">Serve remaining items</button>` : ''}</article>`).join('') || '<p class="empty">All clear.</p>'}</section>`).join('')}</div></section>`;
  if (portal === 'staff') {
    const bills = document.createElement('section');
    bills.innerHTML = `<h2>Pending payments</h2>${state.orders.filter(o => o.payment?.status === 'pending').map(o => `<article class="ticket"><strong>Table ${o.table} · ${money(o.payment.total)}</strong><p>${escape(o.id.slice(0,8))} · ${escape(o.status)}</p><button data-collect="${o.id}">Record cash received</button></article>`).join('') || '<p>No outstanding payments.</p>'}`;
    $('workspace').firstElementChild.append(bills);
  }
  $('workspace').onclick = async event => {
    const button = event.target.closest('button'); if (!button) return; button.disabled = true;
    try {
      if (button.dataset.collect) {
        const order = state.orders.find(o => o.id === button.dataset.collect);
        if (!confirm(`Confirm you received ${money(order.payment.total)} in cash for Table ${order.table}?`)) { button.disabled = false; return; }
        await api('/api/collect-payment', { orderId: order.id, amount: order.payment.total });
      }
      else if (button.dataset.resolve) await api('/api/resolve-request', { id: button.dataset.resolve });
      else await api('/api/order-status', { orderId: button.dataset.order, lineId: button.dataset.line, status: button.dataset.status });
    } catch (e) { notice(e.message); button.disabled = false; }
  };
}
function refresh() {
  $('restaurant').textContent = state.branches.map(b => b.name).join(' / ');
  if (portal === 'customer') { renderMenu(); renderBill(); renderReceipts(); } else renderBoard();
}
async function init() {
  try {
    state = await api('/api/state');
    $('tableBadge').textContent = portal === 'customer' ? (table ? `Table ${table}` : 'Menu') : portal === 'staff' ? 'Floor staff' : 'Kitchen';
    if (portal === 'customer') { customerShell(); renderCart(); if (!params.get('key')) notice('Browse the menu here. Scan your table QR code to place an order.'); }
    else { $('logout').hidden = false; $('account').hidden = false; }
    refresh(); $('connection').textContent = 'Connected';
    connectStream();
  } catch (e) { $('workspace').textContent = 'Unable to connect. Please refresh to try again.'; notice(e.message); }
}
$('logout').onclick = async () => { await api('/api/logout', {}); location.assign(`/login?portal=${portal}`); };
$('account').onclick = () => $('passwordDialog').showModal();
$('closePassword').onclick = () => $('passwordDialog').close();
$('passwordForm').onsubmit = async event => { event.preventDefault(); try { await api('/api/password', Object.fromEntries(new FormData(event.target))); location.assign(`/login?portal=${portal}`); } catch(e) { $('passwordError').textContent = e.message; } };
init();
