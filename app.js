const STORE_KEY = "tableserve-demo-state-v2";
const SESSION_KEY = "tableserve-session-v1";
localStorage.removeItem(STORE_KEY);
localStorage.removeItem(SESSION_KEY);

const imageFor = (id) => {
  const images = {
    masala: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80",
    bowl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
    paneer: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=900&q=80",
    pasta: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80",
    pizza: "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=900&q=80",
    burger: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=900&q=80",
    brownie: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80",
    tea: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=80",
    cooler: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80"
  };
  return images[id] || images.bowl;
};

const createMenuItem = (id, name, category, price, station, description, tags, image, stock) => ({
  id,
  name,
  category,
  price,
  station,
  description,
  tags,
  available: true,
  image,
  stock,
  lowStockAt: 5,
  availableFrom: "09:00",
  availableTo: "23:00",
  modifiers: {
    spice: ["Mild", "Medium", "Hot"],
    addOns: [
      { name: "Extra cheese", price: 39 },
      { name: "Garlic bread", price: 79 },
      { name: "Cold drink combo", price: 99 }
    ],
    removable: ["Onion", "Garlic", "Chilli", "Coriander"]
  }
});

const defaultState = {
  selectedBranch: "branch-main",
  selectedTable: 1,
  selectedCategory: "All",
  kitchenFilter: "all",
  cart: [],
  branches: [
    { id: "branch-main", name: "Central Bistro", city: "Noida", tables: 12 },
    { id: "branch-river", name: "Riverfront Cafe", city: "Delhi", tables: 10 }
  ],
  settings: {
    gstRate: 0.05,
    paymentProvider: "DemoPay UPI/Card",
    printer: "Kitchen thermal printer",
    posProvider: "Generic POS webhook",
    whatsappEnabled: true,
    smsEnabled: true
  },
  coupons: [
    { code: "WELCOME10", type: "percent", value: 10, active: true },
    { code: "TABLE50", type: "flat", value: 50, active: true }
  ],
  customers: [],
  integrations: [
    { id: "pos", name: "POS sync", status: "demo", detail: "Webhook ready for POS order push." },
    { id: "printer", name: "Kitchen printer", status: "demo", detail: "Printable tickets generated from KDS." },
    { id: "kds", name: "External KDS", status: "demo", detail: "Live event stream can feed wall displays." },
    { id: "whatsapp", name: "WhatsApp/SMS", status: "demo", detail: "Receipt and status notification events are logged." }
  ],
  menu: [
    createMenuItem("masala-fries", "Masala Fries", "Starters", 149, "food", "Crisp fries tossed with house masala, lime, and coriander.", ["veg", "quick"], imageFor("masala"), 28),
    createMenuItem("paneer-tikka", "Paneer Tikka", "Starters", 269, "food", "Smoky cottage cheese skewers with peppers and mint chutney.", ["veg", "spicy"], imageFor("paneer"), 18),
    createMenuItem("grain-bowl", "Herb Grain Bowl", "Bowls", 289, "food", "Millet, roasted vegetables, greens, pickles, and tahini.", ["vegan", "healthy"], imageFor("bowl"), 15),
    createMenuItem("alfredo-pasta", "Mushroom Alfredo", "Mains", 349, "food", "Creamy pasta with mushrooms, parmesan, and cracked pepper.", ["veg"], imageFor("pasta"), 20),
    createMenuItem("margherita-pizza", "Margherita Pizza", "Mains", 379, "food", "Tomato, basil, mozzarella, and olive oil on a thin crust.", ["veg", "popular"], imageFor("pizza"), 16),
    createMenuItem("smash-burger", "Smash Burger", "Mains", 329, "food", "Double patty, cheddar, house sauce, lettuce, and pickles.", ["popular"], imageFor("burger"), 20),
    createMenuItem("brownie", "Skillet Brownie", "Desserts", 219, "food", "Warm chocolate brownie with vanilla ice cream.", ["eggless"], imageFor("brownie"), 12),
    createMenuItem("iced-tea", "Peach Iced Tea", "Drinks", 129, "drink", "Fresh brewed tea with peach, lemon, and crushed ice.", ["cold"], imageFor("tea"), 35),
    createMenuItem("mint-cooler", "Mint Cooler", "Drinks", 139, "drink", "Mint, lime, soda, and a touch of jaggery syrup.", ["cold", "refreshing"], imageFor("cooler"), 30)
  ],
  orders: [],
  staffRequests: [],
  eventLog: []
};

const roadmapItems = [
  ["Live backend", "Node server with JSON persistence, role login, public customer orders, and server-sent real-time updates."],
  ["Payments", "Demo UPI/card/cash/pay-later flow with split bills, tip handling, coupons, totals, and digital receipts."],
  ["Modifiers", "Spice preference, add-ons, removable ingredients, combo prompts, and item-level kitchen priority."],
  ["Inventory", "Stock count, low-stock alerts, automatic sold-out handling, and time-of-day item visibility."],
  ["Retention", "Customer phone/name capture, loyalty points, coupon redemption, and WhatsApp/SMS receipt events."],
  ["Integrations", "POS, printer, KDS, and notification integration status panels ready for real credentials."],
  ["Multi-branch", "Branch selection, branch-specific tables, and branch-level order/revenue analytics."]
];

const priorityOptions = [
  { value: "first", label: "Need first", rank: 0 },
  { value: "normal", label: "Normal", rank: 1 },
  { value: "later", label: "Can wait", rank: 2 }
];

let state = structuredClone(defaultState);
let session = null;
let tableLinks = [];
let backendOnline = false;
let source = null;
let portal = initialPortal();
const els = {};

function $(id) {
  return document.getElementById(id);
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.menu && saved?.orders) return normalizeState({ ...defaultState, ...saved });
  } catch (error) {
    console.warn("Could not load local state", error);
  }
  return structuredClone(defaultState);
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function persistLocal() {
  // Restaurant data stays on the server, never in browser storage.
}

function persistSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STORE_KEY);
}

function normalizeState(next) {
  next.branches ||= structuredClone(defaultState.branches);
  next.settings ||= structuredClone(defaultState.settings);
  next.coupons ||= structuredClone(defaultState.coupons);
  next.customers ||= [];
  next.integrations ||= structuredClone(defaultState.integrations);
  next.eventLog ||= [];
  next.selectedBranch ||= next.branches[0]?.id || "branch-main";
  next.menu = (next.menu || []).map((item) => ({
    ...createMenuItem(item.id, item.name, item.category, Number(item.price || 0), item.station || "food", item.description || "", item.tags || [], item.image || imageFor("bowl"), Number(item.stock ?? 20)),
    ...item,
    stock: Number(item.stock ?? 20),
    lowStockAt: Number(item.lowStockAt ?? 5),
    availableFrom: item.availableFrom || "09:00",
    availableTo: item.availableTo || "23:00",
    modifiers: item.modifiers || createMenuItem("", "", "", 0, "food", "", [], "", 0).modifiers
  }));
  next.orders = (next.orders || []).map(normalizeOrder);
  next.cart = (next.cart || []).map((item) => ({
    lineId: item.lineId || uid("cart"),
    id: item.id,
    qty: Number(item.qty || 1),
    priority: item.priority || "normal",
    spice: item.spice || "Medium",
    addOns: item.addOns || [],
    remove: item.remove || [],
    combo: Boolean(item.combo)
  }));
  return next;
}

function normalizeOrder(order) {
  order.items = (order.items || []).map((item) => ({
    ...item,
    lineId: item.lineId || item.id,
    priority: item.priority || "normal",
    itemStatus: item.itemStatus || (order.status === "ready" ? "ready" : order.status === "preparing" ? "preparing" : "new"),
    addOns: item.addOns || [],
    remove: item.remove || [],
    spice: item.spice || "Medium",
    combo: Boolean(item.combo)
  }));
  order.status = deriveOrderStatus(order);
  order.payment ||= {};
  order.customer ||= {};
  return order;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    if (["http:", "https:", "data:"].includes(url.protocol)) return escapeHtml(url.href);
  } catch {
    return escapeHtml(imageFor("bowl"));
  }
  return escapeHtml(imageFor("bowl"));
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function isWithinTimeWindow(item) {
  const now = nowTime();
  const from = item.availableFrom || "00:00";
  const to = item.availableTo || "23:59";
  if (from <= to) return now >= from && now <= to;
  return now >= from || now <= to;
}

function isItemOrderable(item) {
  return item.available && Number(item.stock || 0) > 0 && isWithinTimeWindow(item);
}

function currentBranch() {
  return state.branches.find((branch) => branch.id === state.selectedBranch) || state.branches[0];
}

function priorityLabel(priority) {
  return priorityOptions.find((option) => option.value === priority)?.label || "Normal";
}

function priorityRank(priority) {
  return priorityOptions.find((option) => option.value === priority)?.rank ?? 1;
}

function itemLineId(item) {
  return item.lineId || item.id;
}

function sortedOrderItems(items) {
  return [...items].sort((a, b) => {
    const rankDelta = priorityRank(a.priority) - priorityRank(b.priority);
    return rankDelta || a.name.localeCompare(b.name);
  });
}

function deriveOrderStatus(order) {
  if (order.status === "served") return "served";
  if (!order.items?.length) return "new";
  if (order.items.every((item) => item.itemStatus === "served")) return "served";
  if (order.items.every((item) => ["ready", "served"].includes(item.itemStatus))) return "ready";
  if (order.items.some((item) => ["preparing", "ready", "served"].includes(item.itemStatus))) return "preparing";
  return "new";
}

function lineModifierTotal(line) {
  return (line.addOns || []).reduce((sum, addOn) => sum + Number(addOn.price || 0), 0) + (line.combo ? 99 : 0);
}

function lineTotal(line) {
  const item = state.menu.find((entry) => entry.id === line.id);
  if (!item) return 0;
  return (Number(item.price) + lineModifierTotal(line)) * Number(line.qty || 1);
}

function orderLineTotal(line) {
  return (Number(line.price || 0) + lineModifierTotal(line)) * Number(line.qty || 1);
}

function couponDiscount(subtotal) {
  const code = els.couponCode?.value?.trim().toUpperCase();
  if (!code) return 0;
  const coupon = state.coupons.find((entry) => entry.active && entry.code === code);
  if (!coupon) return 0;
  if (coupon.type === "percent") return Math.round(subtotal * (coupon.value / 100));
  return Math.min(subtotal, Number(coupon.value || 0));
}

function totals() {
  const subtotal = state.cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const discount = couponDiscount(subtotal);
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * Number(state.settings.gstRate || 0.05));
  const tip = Math.max(0, Number(els.tipAmount?.value || 0));
  const total = taxable + tax + tip;
  const split = Math.max(1, Number(els.splitCount?.value || 1));
  return { subtotal, discount, tax, tip, total, split, perPerson: Math.ceil(total / split) };
}

function tableLink(tableNumber) {
  return tableLinks.find(link => link.branch === state.selectedBranch && link.table === tableNumber)?.url || `${location.origin}/menu`;
}

function qrUrl(tableNumber) {
  return `/api/qr${new URL(tableLink(tableNumber)).search}`;
}

function initialPortal() {
  if (location.pathname === '/admin') return 'admin';
  const params = new URLSearchParams(window.location.search);
  const app = params.get("app");
  if (["customer", "kitchen", "admin"].includes(app)) return app;
  const hashView = window.location.hash.replace("#", "");
  if (["admin", "growth", "flyer"].includes(hashView)) return "admin";
  if (hashView === "kitchen") return "kitchen";
  return "customer";
}

function allowedViews() {
  if (portal === "admin") return ["customer", "kitchen", "admin", "growth", "flyer"];
  if (portal === "kitchen") return ["kitchen"];
  return ["customer"];
}

function defaultView() {
  return portal === "admin" ? "admin" : portal;
}

function portalUrl(view) {
  const url = new URL(window.location.href);
  url.searchParams.set("app", portal);
  if (portal === "customer") {
    url.searchParams.set("table", state.selectedTable);
    url.searchParams.set("branch", state.selectedBranch);
  } else {
    url.searchParams.delete("table");
    url.searchParams.delete("branch");
  }
  url.hash = view;
  return url;
}

async function apiGet(path) {
  const response = await fetch(`${path}?portal=admin`, { cache: "no-store" });
  if (response.status === 403) location.assign('/login?portal=admin');
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function apiPost(path, body, needsAuth = false) {
  const headers = { "Content-Type": "application/json" };
  if (needsAuth && session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(`${path}?portal=admin`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function saveManagedState(message = "Saved.") {
  if (backendOnline) {
    if (!session?.token) {
      toast("Please log in as admin, kitchen, or staff first.");
      return false;
    }
    try {
      const selectedBranch = state.selectedBranch;
      state = normalizeState(await apiPost("/api/menu", { menu: state.menu, revision: state.revision }, true));
      state.selectedBranch = selectedBranch;
      persistLocal();
      renderAll();
      toast(message);
      return true;
    } catch (error) {
      state = normalizeState(await apiGet('/api/state'));
      renderAll();
      toast(error.message);
      return false;
    }
  }
  toast('Connection unavailable. Please reconnect before saving.');
  return false;
}

async function initBackend() {
  if (window.location.protocol === "file:") {
    backendOnline = false;
    return;
  }
  try {
    session = await apiGet('/api/session');
    if (!session || session.user.role !== 'admin') { location.assign('/login?portal=admin'); return; }
    tableLinks = await apiGet('/api/table-links');
    state = normalizeState(await apiGet("/api/state"));
    backendOnline = true;
    persistLocal();
    source = new EventSource("/api/events?portal=admin");
    source.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "state") {
        const selectedBranch = state.selectedBranch;
        state = normalizeState(payload.state);
        state.selectedBranch = selectedBranch;
        persistLocal();
        renderAll();
      }
    });
  } catch (error) {
    backendOnline = false;
    document.querySelector('.main').textContent = 'Unable to connect. Refresh to try again.';
    throw error;
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function cacheElements() {
  [
    "viewEyebrow", "viewTitle", "todayOrders", "todayRevenue", "branchSelect", "sessionLabel", "loginToggle",
    "loginPanel", "loginRole", "loginPin", "loginButton", "tableSelect", "cartTable", "menuSearch",
    "categoryStrip", "menuGrid", "cartItems", "customerName", "customerPhone", "cartNote", "paymentMethod",
    "splitCount", "tipAmount", "couponCode", "subtotal", "discount", "tax", "tip", "perPerson", "total",
    "guestStatus", "kdsBoard", "adminMenuList", "qrGrid", "toast", "itemId", "itemName", "itemCategory",
    "itemPrice", "itemStation", "itemStock", "itemLowStock", "itemAvailableFrom", "itemAvailableTo",
    "itemDescription", "itemTags", "itemImage", "itemAddOns", "itemRemovable", "itemAvailable", "activeItems",
    "openOrders", "avgTicket", "busyTable", "loyaltyMembers", "lowStockItems", "branchAnalytics",
    "integrationList", "roadmap", "flyerTableSelect", "flyerFormat", "flyerTheme", "flyerBrand",
    "flyerHeadline", "flyerSubline", "flyerFooter", "flyerPreview", "flyerPreviewBrand",
    "flyerPreviewHeadline", "flyerPreviewSubline", "flyerPreviewTable", "flyerPreviewFooter", "flyerQrImage"
  ].forEach((id) => {
    els[id] = $(id);
  });
}

function wireEvents() {
  $('closeTeam').onclick = () => $('teamDialog').close();
  $('teamAccess').onclick = async () => {
    try {
      const team = await apiGet('/api/team');
      $('teamMessage').textContent = '';
      $('teamAssignments').innerHTML = team.users.map(user => `<form class="team-assignment" data-user="${escapeHtml(user.id)}"><label class="field"><span>${escapeHtml(user.name)} (${escapeHtml(user.role)})</span><select name="branch">${team.branches.map(branch => `<option value="${escapeHtml(branch.id)}" ${branch.id === user.branch ? 'selected' : ''}>${escapeHtml(branch.name)}</option>`).join('')}</select></label><button class="primary-button" type="submit">Save branch</button></form>`).join('');
      $('teamDialog').showModal();
    } catch (error) { toast(error.message); }
  };
  $('teamAssignments').onsubmit = async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button'); button.disabled = true;
    try { await apiPost('/api/team-branch', { userId: form.dataset.user, branchId: new FormData(form).get('branch') }); $('teamMessage').textContent = 'Branch access updated. Open employee screens update automatically.'; }
    catch (error) { $('teamMessage').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('changePassword').onclick = () => $('passwordDialog').showModal();
  $('closePassword').onclick = () => $('passwordDialog').close();
  $('passwordForm').onsubmit = async event => {
    event.preventDefault();
    try { await apiPost('/api/password', Object.fromEntries(new FormData(event.target))); location.assign('/login?portal=admin'); }
    catch (error) { $('passwordError').textContent = error.message; }
  };
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  els.loginToggle.addEventListener("click", toggleLogin);
  els.loginButton.addEventListener("click", login);
  $("resetDemo").addEventListener("click", resetDemo);
  $("seedOrder").addEventListener("click", createSampleOrder);
  $("clearCart").addEventListener("click", clearCart);
  $("placeOrder").addEventListener("click", placeOrder);
  $("callStaff").addEventListener("click", requestStaff);
  $("printQrs").addEventListener("click", () => window.print());
  $("printFlyer").addEventListener("click", () => window.print());
  $("cancelEdit").addEventListener("click", resetForm);
  $("menuForm").addEventListener("submit", saveMenuItem);
  ["flyerTableSelect", "flyerFormat", "flyerTheme", "flyerBrand", "flyerHeadline", "flyerSubline", "flyerFooter"].forEach((id) => {
    els[id].addEventListener("input", renderFlyer);
    els[id].addEventListener("change", renderFlyer);
  });
  els.branchSelect.addEventListener("change", () => {
    state.selectedBranch = els.branchSelect.value;
    const branch = currentBranch();
    if (state.selectedTable > branch.tables) state.selectedTable = 1;
    persistLocal();
    renderAll();
  });
  els.tableSelect.addEventListener("change", () => {
    state.selectedTable = Number(els.tableSelect.value);
    persistLocal();
    renderCart();
  });
  els.menuSearch.addEventListener("input", renderMenu);
  [els.paymentMethod, els.splitCount, els.tipAmount, els.couponCode].forEach((input) => {
    input.addEventListener("input", renderCart);
    input.addEventListener("change", renderCart);
  });
  document.querySelectorAll("[data-kitchen-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.kitchenFilter = button.dataset.kitchenFilter;
      document.querySelectorAll("[data-kitchen-filter]").forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
      persistLocal();
      renderKitchen();
    });
  });
}

async function init() {
  cacheElements();
  wireEvents();
  hydrateFromUrl();
  await initBackend();
  hydrateFromUrl();
  renderAll();
}

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const app = params.get("app");
  if (["customer", "kitchen", "admin"].includes(app)) portal = app;
  const table = Number(params.get("table"));
  const branch = params.get("branch");
  if (branch && state.branches.some((entry) => entry.id === branch)) state.selectedBranch = branch;
  if (table >= 1 && table <= (currentBranch()?.tables || 12)) state.selectedTable = table;
  const hashView = window.location.hash.replace("#", "");
  setView(['admin', 'growth', 'flyer'].includes(hashView) ? hashView : defaultView(), false);
}

function setView(view, updateHash = true) {
  if (view === 'customer') { location.assign(tableLink(Number(els.flyerTableSelect?.value || state.selectedTable || 1))); return; }
  if (view === 'kitchen') { location.assign('/kitchen'); return; }
  if (!allowedViews().includes(view)) view = defaultView();
  if (portal !== "customer" && ["kitchen", "admin"].includes(view) && !session && backendOnline) {
    els.loginPanel.hidden = false;
    toast("Please log in for staff areas.");
  }
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  $(`${view}View`).classList.add("active");
  const titles = {
    customer: ["Customer app", "Scan, choose, order"],
    kitchen: ["Kitchen app", "Live order board"],
    admin: ["Admin app", "Manage the restaurant"],
    growth: ["Growth", "Sales and demand"],
    flyer: ["QR flyer", "Design printable table cards"]
  };
  els.viewEyebrow.textContent = titles[view][0];
  els.viewTitle.textContent = titles[view][1];
  renderPortalChrome();
  if (updateHash) window.history.replaceState(null, "", portalUrl(view).toString());
}

async function toggleLogin() {
  await apiPost('/api/logout', {});
  location.assign('/login?portal=admin');
}

async function login() {
  location.assign('/login?portal=admin');
}

function renderSession() {
  els.sessionLabel.textContent = session ? session.user.name : '';
  els.loginToggle.textContent = 'Sign out';
}

function renderPortalChrome() {
  const allowed = allowedViews();
  document.body.dataset.portal = portal;
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.hidden = !allowed.includes(button.dataset.view);
  });
  const tabs = document.querySelector(".role-tabs");
  if (tabs) tabs.hidden = allowed.length <= 1;
  const sidebarPanel = document.querySelector(".sidebar-panel");
  if (sidebarPanel) sidebarPanel.hidden = portal === "customer";
  const branchField = els.branchSelect?.closest(".branch-field");
  if (branchField) branchField.hidden = portal === "customer";
  const sessionCard = $("sessionCard");
  if (sessionCard) sessionCard.hidden = portal === "customer";
  $("resetDemo").hidden = true;
  $("seedOrder").hidden = true;
  els.loginPanel.hidden = true;
}

function renderAll() {
  state = normalizeState(state);
  renderPortalChrome();
  renderSession();
  renderBranches();
  renderTables();
  renderCategories();
  renderMenu();
  renderCart();
  renderAdmin();
  renderGrowth();
  renderFlyer();
  renderMetrics();
}

function renderBranches() {
  els.branchSelect.innerHTML = state.branches.map((branch) => `
    <option value="${branch.id}" ${branch.id === state.selectedBranch ? "selected" : ""}>${escapeHtml(branch.name)}</option>
  `).join("");
}

function renderTables() {
  const branch = currentBranch();
  const options = Array.from({ length: branch.tables }, (_, index) => {
    const table = index + 1;
    return `<option value="${table}" ${table === state.selectedTable ? "selected" : ""}>Table ${table}</option>`;
  }).join("");
  els.tableSelect.innerHTML = options;
  els.flyerTableSelect.innerHTML = options;
}

function getCategories() {
  return ["All", ...new Set(state.menu.map((item) => item.category))];
}

function renderCategories() {
  els.categoryStrip.innerHTML = getCategories().map((category) => `
    <button class="category-pill ${category === state.selectedCategory ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join("");
  els.categoryStrip.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category;
      persistLocal();
      renderCategories();
      renderMenu();
    });
  });
}

function renderMenu() {
  const search = els.menuSearch.value.trim().toLowerCase();
  const items = state.menu.filter((item) => {
    const categoryMatch = state.selectedCategory === "All" || item.category === state.selectedCategory;
    const searchText = [item.name, item.category, item.description, ...item.tags].join(" ").toLowerCase();
    return categoryMatch && (!search || searchText.includes(search));
  });
  els.menuGrid.innerHTML = items.length ? items.map((item) => {
    const orderable = isItemOrderable(item);
    const status = !item.available ? "Paused" : Number(item.stock) <= 0 ? "Sold out" : !isWithinTimeWindow(item) ? `${item.availableFrom}-${item.availableTo}` : `${item.stock} left`;
    return `
      <article class="menu-card ${orderable ? "" : "sold-out"}">
        <img class="dish-image" src="${safeUrl(item.image)}" alt="${escapeHtml(item.name)}">
        <div class="dish-body">
          <div class="dish-title"><strong>${escapeHtml(item.name)}</strong><span>${money(item.price)}</span></div>
          <p class="dish-description">${escapeHtml(item.description)}</p>
          <div class="tag-row">
            ${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
            <span class="tag">${escapeHtml(status)}</span>
          </div>
          <button class="primary-button" type="button" data-add="${item.id}" ${orderable ? "" : "disabled"}>${orderable ? "Add to cart" : "Unavailable"}</button>
        </div>
      </article>
    `;
  }).join("") : `<div class="empty-state">No menu items match this search.</div>`;
  els.menuGrid.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.add));
  });
}

function addToCart(id) {
  const item = state.menu.find((entry) => entry.id === id);
  if (!item || !isItemOrderable(item)) {
    toast("That item is not available right now.");
    return;
  }
  state.cart.push({
    lineId: uid("cart"),
    id,
    qty: 1,
    priority: "normal",
    spice: item.modifiers?.spice?.[1] || "Medium",
    addOns: [],
    remove: [],
    combo: false
  });
  persistLocal();
  renderCart();
  toast("Added to cart.");
}

function clearCart() {
  state.cart = [];
  els.cartNote.value = "";
  persistLocal();
  renderCart();
}

function updateCartLine(lineId, patch) {
  const line = state.cart.find((entry) => entry.lineId === lineId);
  if (!line) return;
  Object.assign(line, patch);
  if (line.qty <= 0) state.cart = state.cart.filter((entry) => entry.lineId !== lineId);
  persistLocal();
  renderCart();
}

function renderCart() {
  els.cartTable.textContent = state.selectedTable;
  els.tableSelect.value = state.selectedTable;
  const rows = state.cart.map((line) => {
    const item = state.menu.find((entry) => entry.id === line.id);
    if (!item) return "";
    return `
      <div class="cart-row">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="muted">${money(item.price)} base · ${money(lineTotal(line))} line</div>
          <div class="modifier-grid">
            <label class="priority-field"><span>Priority</span><select data-line="${line.lineId}" data-cart-field="priority">
              ${priorityOptions.map((option) => `<option value="${option.value}" ${option.value === line.priority ? "selected" : ""}>${option.label}</option>`).join("")}
            </select></label>
            <label class="priority-field"><span>Spice</span><select data-line="${line.lineId}" data-cart-field="spice">
              ${(item.modifiers?.spice || ["Mild", "Medium", "Hot"]).map((spice) => `<option value="${spice}" ${spice === line.spice ? "selected" : ""}>${escapeHtml(spice)}</option>`).join("")}
            </select></label>
          </div>
          <div class="modifier-options">
            ${(item.modifiers?.addOns || []).map((addOn, index) => `<label><input type="checkbox" data-line="${line.lineId}" data-addon="${index}" ${line.addOns.some((entry) => entry.name === addOn.name) ? "checked" : ""}> ${escapeHtml(addOn.name)} ${money(addOn.price)}</label>`).join("")}
            <label><input type="checkbox" data-line="${line.lineId}" data-combo ${line.combo ? "checked" : ""}> Make it a combo ${money(99)}</label>
          </div>
          <label class="priority-field remove-field"><span>Remove</span><input data-line="${line.lineId}" data-cart-field="remove" value="${escapeHtml(line.remove.join(", "))}" placeholder="Onion, chilli"></label>
        </div>
        <div class="qty-controls">
          <button type="button" data-line="${line.lineId}" data-delta="-1">−</button>
          <strong>${line.qty}</strong>
          <button type="button" data-line="${line.lineId}" data-delta="1">+</button>
        </div>
      </div>
    `;
  }).join("");
  els.cartItems.innerHTML = rows || `<div class="empty-state">Add dishes from the menu to start an order.</div>`;
  els.cartItems.querySelectorAll("[data-delta]").forEach((button) => {
    button.addEventListener("click", () => updateCartLine(button.dataset.line, {
      qty: Number(state.cart.find((entry) => entry.lineId === button.dataset.line)?.qty || 1) + Number(button.dataset.delta)
    }));
  });
  els.cartItems.querySelectorAll("[data-cart-field]").forEach((input) => {
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", () => {
      const field = input.dataset.cartField;
      updateCartLine(input.dataset.line, {
        [field]: field === "remove" ? input.value.split(",").map((entry) => entry.trim()).filter(Boolean) : input.value
      });
    });
  });
  els.cartItems.querySelectorAll("[data-addon]").forEach((input) => {
    input.addEventListener("change", () => {
      const line = state.cart.find((entry) => entry.lineId === input.dataset.line);
      const item = state.menu.find((entry) => entry.id === line?.id);
      const addOn = item?.modifiers?.addOns?.[Number(input.dataset.addon)];
      if (!line || !addOn) return;
      line.addOns = input.checked ? [...line.addOns, addOn] : line.addOns.filter((entry) => entry.name !== addOn.name);
      persistLocal();
      renderCart();
    });
  });
  els.cartItems.querySelectorAll("[data-combo]").forEach((input) => {
    input.addEventListener("change", () => updateCartLine(input.dataset.line, { combo: input.checked }));
  });
  renderTotals();
  renderGuestStatus();
}

function renderTotals() {
  const summary = totals();
  els.subtotal.textContent = money(summary.subtotal);
  els.discount.textContent = `-${money(summary.discount)}`;
  els.tax.textContent = money(summary.tax);
  els.tip.textContent = money(summary.tip);
  els.perPerson.textContent = money(summary.perPerson);
  els.total.textContent = money(summary.total);
}

async function placeOrder() {
  if (!state.cart.length) {
    toast("Add at least one item before placing an order.");
    return;
  }
  const summary = totals();
  const order = {
    id: uid("ORD"),
    branchId: state.selectedBranch,
    branchName: currentBranch().name,
    table: state.selectedTable,
    items: state.cart.map((line) => {
      const item = state.menu.find((entry) => entry.id === line.id);
      return {
        lineId: line.lineId,
        id: item.id,
        name: item.name,
        qty: line.qty,
        price: item.price,
        station: item.station,
        priority: line.priority,
        itemStatus: "new",
        spice: line.spice,
        addOns: line.addOns,
        remove: line.remove,
        combo: line.combo
      };
    }),
    note: els.cartNote.value.trim(),
    status: "new",
    customer: { name: els.customerName.value.trim(), phone: els.customerPhone.value.trim() },
    payment: {
      method: els.paymentMethod.value,
      split: summary.split,
      tip: summary.tip,
      discount: summary.discount,
      subtotal: summary.subtotal,
      tax: summary.tax,
      total: summary.total,
      perPerson: summary.perPerson,
      coupon: els.couponCode.value.trim().toUpperCase(),
      status: els.paymentMethod.value === "pay-later" ? "pending" : "authorized"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (backendOnline) {
    try {
      state = normalizeState(await apiPost("/api/order", order));
    } catch (error) {
      toast(error.message);
      return;
    }
  } else {
    state.orders.unshift(order);
    reduceStock(order);
    upsertCustomer(order);
  }
  state.cart = [];
  els.cartNote.value = "";
  persistLocal();
  renderAll();
  toast("Order sent to kitchen and receipt generated.");
}

function reduceStock(order) {
  for (const line of order.items) {
    const item = state.menu.find((entry) => entry.id === line.id);
    if (item) {
      item.stock = Math.max(0, Number(item.stock || 0) - Number(line.qty || 0));
      if (item.stock === 0) item.available = false;
    }
  }
}

function upsertCustomer(order) {
  if (!order.customer?.phone) return;
  const existing = state.customers.find((customer) => customer.phone === order.customer.phone);
  const points = Math.floor(Number(order.payment?.total || 0) / 100);
  if (existing) {
    existing.name = order.customer.name || existing.name;
    existing.points = Number(existing.points || 0) + points;
    existing.visits = Number(existing.visits || 0) + 1;
  } else {
    state.customers.push({ id: uid("CUS"), name: order.customer.name || "Guest", phone: order.customer.phone, points, visits: 1 });
  }
}

async function requestStaff() {
  const request = { branchId: state.selectedBranch, table: state.selectedTable, status: "open" };
  if (backendOnline) {
    try {
      state = normalizeState(await apiPost("/api/staff-request", request));
    } catch (error) {
      toast(error.message);
      return;
    }
  } else {
    state.staffRequests.unshift({ id: uid("HELP"), ...request, createdAt: new Date().toISOString() });
  }
  persistLocal();
  renderGuestStatus();
  toast(`Staff request sent for table ${state.selectedTable}.`);
}

function renderGuestStatus() {
  const tableOrders = state.orders.filter((order) => order.branchId === state.selectedBranch && order.table === state.selectedTable && order.status !== "served").slice(0, 3);
  const requests = state.staffRequests.filter((request) => request.branchId === state.selectedBranch && request.table === state.selectedTable && request.status === "open");
  const lastOrder = state.orders.find((order) => order.branchId === state.selectedBranch && order.table === state.selectedTable);
  const receipt = lastOrder ? `<div class="receipt-card"><strong>Latest receipt</strong><span>${lastOrder.payment?.method || "pay-later"} · ${money(lastOrder.payment?.total || 0)} · ${lastOrder.payment?.status || "pending"}</span></div>` : "";
  els.guestStatus.innerHTML = [
    ...tableOrders.map((order) => `<div class="status-chip"><span>${order.items.reduce((sum, item) => sum + item.qty, 0)} items · ${money(order.payment?.total || 0)}</span><strong>${labelStatus(order.status)}</strong></div>`),
    ...requests.slice(0, 1).map(() => `<div class="status-chip"><span>Staff help</span><strong>Requested</strong></div>`),
    receipt
  ].join("");
}

function labelStatus(status) {
  return { new: "New", preparing: "Preparing", ready: "Ready", served: "Served" }[status] || status;
}

function orderAge(order) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000));
  return minutes < 1 ? "just now" : `${minutes} min`;
}

function renderKitchen() {
  const columns = [
    { key: "new", title: "New" },
    { key: "preparing", title: "Preparing" },
    { key: "ready", title: "Ready" }
  ];
  const filteredOrders = state.orders.filter((order) => {
    normalizeOrder(order);
    if (order.branchId !== state.selectedBranch || order.status === "served") return false;
    if (state.kitchenFilter === "all") return true;
    return order.items.some((item) => item.station === state.kitchenFilter);
  });
  els.kdsBoard.innerHTML = columns.map((column) => {
    const orders = filteredOrders.filter((order) => order.status === column.key);
    return `<section class="kds-column"><header><strong>${column.title}</strong><span>${orders.length}</span></header>${orders.length ? orders.map(renderOrderCard).join("") : `<div class="empty-state">No ${column.title.toLowerCase()} orders.</div>`}</section>`;
  }).join("");
  els.kdsBoard.querySelectorAll("[data-item-status]").forEach((button) => {
    button.addEventListener("click", () => updateOrderItemStatus(button.dataset.order, button.dataset.line, button.dataset.itemStatus));
  });
  els.kdsBoard.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => updateOrderStatus(button.dataset.order, button.dataset.status));
  });
  els.kdsBoard.querySelectorAll("[data-print-ticket]").forEach((button) => {
    button.addEventListener("click", () => printTicket(button.dataset.printTicket));
  });
}

function renderOrderCard(order) {
  normalizeOrder(order);
  const total = order.items.reduce((sum, item) => sum + orderLineTotal(item), 0);
  return `
    <article class="order-card">
      <div class="order-meta"><strong>Table ${order.table}</strong><span>${escapeHtml(order.branchName || currentBranch().name)}</span><span>${orderAge(order)}</span><span>${money(order.payment?.total || total)}</span></div>
      <div class="order-items">${sortedOrderItems(order.items).map((item) => renderKitchenItem(order.id, item)).join("")}</div>
      ${order.note ? `<p class="muted">Note: ${escapeHtml(order.note)}</p>` : ""}
      <div class="order-actions">
        <button class="ghost-button" type="button" data-print-ticket="${order.id}">Print ticket</button>
        ${order.status === "ready" ? `<button class="primary-button" type="button" data-order="${order.id}" data-status="served">Served</button>` : ""}
      </div>
    </article>
  `;
}

function renderKitchenItem(orderId, item) {
  const nextStatus = item.itemStatus === "new" ? "preparing" : item.itemStatus === "preparing" ? "ready" : "";
  const buttonLabel = item.itemStatus === "new" ? "Start" : item.itemStatus === "preparing" ? "Ready" : "";
  const modifiers = [
    item.spice ? `Spice: ${item.spice}` : "",
    item.addOns?.length ? `Add: ${item.addOns.map((entry) => entry.name).join(", ")}` : "",
    item.remove?.length ? `Remove: ${item.remove.join(", ")}` : "",
    item.combo ? "Combo" : ""
  ].filter(Boolean).join(" · ");
  return `
    <div class="kitchen-item ${item.priority === "first" ? "priority-first" : ""}">
      <div><strong>${item.qty} × ${escapeHtml(item.name)}</strong><span>${priorityLabel(item.priority)} · ${labelStatus(item.itemStatus)}</span>${modifiers ? `<small>${escapeHtml(modifiers)}</small>` : ""}</div>
      ${buttonLabel ? `<button class="ghost-button" type="button" data-order="${orderId}" data-line="${escapeHtml(itemLineId(item))}" data-item-status="${nextStatus}">${buttonLabel}</button>` : `<span class="done-pill">Done</span>`}
    </div>
  `;
}

async function updateOrderStatus(orderId, status) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  order.status = status;
  if (status === "served") {
    order.items = order.items.map((item) => ({ ...item, itemStatus: "ready" }));
    order.payment.status = order.payment.status === "pending" ? "collected" : order.payment.status;
  }
  order.updatedAt = new Date().toISOString();
  await saveManagedState(`Order ${labelStatus(status).toLowerCase()}.`);
}

async function updateOrderItemStatus(orderId, lineId, status) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  normalizeOrder(order);
  const item = order.items.find((entry) => itemLineId(entry) === lineId);
  if (!item) return;
  item.itemStatus = status;
  order.status = deriveOrderStatus(order);
  order.updatedAt = new Date().toISOString();
  await saveManagedState(`${item.name} marked ${labelStatus(status).toLowerCase()}.`);
}

function printTicket(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  toast('Printer integration is not connected.');
}

function renderAdmin() {
  els.adminMenuList.innerHTML = state.menu.map((item) => `
    <article class="admin-item ${Number(item.stock) <= item.lowStockAt ? "low-stock" : ""}">
      <img class="thumb" src="${safeUrl(item.image)}" alt="">
      <div><strong>${escapeHtml(item.name)}</strong><div class="muted">${escapeHtml(item.category)} · ${money(item.price)} · stock ${item.stock} · ${item.availableFrom}-${item.availableTo} · ${item.available ? "Available" : "Paused"}</div></div>
      <div class="row-actions">
        <button class="ghost-button" type="button" data-edit="${item.id}">Edit</button>
        <button class="ghost-button" type="button" data-toggle="${item.id}">${item.available ? "Pause" : "Resume"}</button>
        <button class="ghost-button" type="button" data-delete="${item.id}">Delete</button>
      </div>
    </article>
  `).join("");
  els.adminMenuList.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editMenuItem(button.dataset.edit)));
  els.adminMenuList.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => toggleMenuItem(button.dataset.toggle)));
  els.adminMenuList.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteMenuItem(button.dataset.delete)));
  renderBranchAnalytics();
  renderIntegrations();
  renderQrCodes();
  renderMetrics();
}

function renderBranchAnalytics() {
  els.branchAnalytics.innerHTML = state.branches.map((branch) => {
    const orders = state.orders.filter((order) => order.branchId === branch.id);
    const revenue = orders.reduce((sum, order) => sum + Number(order.payment?.total || 0), 0);
    return `<div class="branch-card"><strong>${escapeHtml(branch.name)}</strong><span>${escapeHtml(branch.city)} · ${branch.tables} tables</span><b>${orders.length} orders · ${money(revenue)}</b></div>`;
  }).join("");
}

function renderIntegrations() {
  els.integrationList.innerHTML = state.integrations.map((entry) => `
    <div class="integration-row"><div><strong>${escapeHtml(entry.name)}</strong><span>${escapeHtml(entry.detail)}</span></div><b>${escapeHtml(entry.status)}</b></div>
  `).join("");
}

function renderQrCodes() {
  const branch = currentBranch();
  els.qrGrid.innerHTML = Array.from({ length: branch.tables }, (_, index) => {
    const table = index + 1;
    return `<article class="qr-card"><img src="${qrUrl(table)}" alt="QR code for table ${table}"><strong>${escapeHtml(branch.name)} · Table ${table}</strong><small>${escapeHtml(tableLink(table))}</small></article>`;
  }).join("");
}

function parseAddOns(value) {
  return value.split(",").map((part) => {
    const [name, price] = part.split(":").map((entry) => entry.trim());
    return name ? { name, price: Number(price || 0) } : null;
  }).filter(Boolean);
}

async function saveMenuItem(event) {
  event.preventDefault();
  const id = els.itemId.value || uid("item");
  const existing = state.menu.find((entry) => entry.id === id);
  const item = {
    id,
    name: els.itemName.value.trim(),
    category: els.itemCategory.value.trim(),
    price: Number(els.itemPrice.value),
    station: els.itemStation.value,
    stock: Number(els.itemStock.value || 0),
    lowStockAt: Number(els.itemLowStock.value || 0),
    availableFrom: els.itemAvailableFrom.value || "09:00",
    availableTo: els.itemAvailableTo.value || "23:00",
    description: els.itemDescription.value.trim(),
    tags: els.itemTags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    image: els.itemImage.value.trim() || imageFor("bowl"),
    available: els.itemAvailable.checked,
    modifiers: {
      spice: existing?.modifiers?.spice || ["Mild", "Medium", "Hot"],
      addOns: parseAddOns(els.itemAddOns.value),
      removable: els.itemRemovable.value.split(",").map((entry) => entry.trim()).filter(Boolean)
    }
  };
  const index = state.menu.findIndex((entry) => entry.id === id);
  if (index >= 0) state.menu[index] = item;
  else state.menu.push(item);
  resetForm();
  await saveManagedState("Menu item saved.");
}

function editMenuItem(id) {
  const item = state.menu.find((entry) => entry.id === id);
  if (!item) return;
  els.itemId.value = item.id;
  els.itemName.value = item.name;
  els.itemCategory.value = item.category;
  els.itemPrice.value = item.price;
  els.itemStation.value = item.station;
  els.itemStock.value = item.stock;
  els.itemLowStock.value = item.lowStockAt;
  els.itemAvailableFrom.value = item.availableFrom;
  els.itemAvailableTo.value = item.availableTo;
  els.itemDescription.value = item.description;
  els.itemTags.value = item.tags.join(", ");
  els.itemImage.value = item.image;
  els.itemAddOns.value = (item.modifiers?.addOns || []).map((entry) => `${entry.name}:${entry.price}`).join(", ");
  els.itemRemovable.value = (item.modifiers?.removable || []).join(", ");
  els.itemAvailable.checked = item.available;
  toast("Editing menu item.");
}

async function toggleMenuItem(id) {
  const item = state.menu.find((entry) => entry.id === id);
  if (!item) return;
  item.available = !item.available;
  await saveManagedState(item.available ? "Item resumed." : "Item paused.");
}

async function deleteMenuItem(id) {
  state.menu = state.menu.filter((item) => item.id !== id);
  state.cart = state.cart.filter((item) => item.id !== id);
  await saveManagedState("Menu item deleted.");
}

function resetForm() {
  $("menuForm").reset();
  els.itemId.value = "";
  els.itemAvailable.checked = true;
  els.itemAvailableFrom.value = "09:00";
  els.itemAvailableTo.value = "23:00";
}

async function createSampleOrder() {
  const available = state.menu.filter(isItemOrderable).slice(0, 3);
  if (!available.length) {
    toast("No available items for a sample order.");
    return;
  }
  const subtotal = available.reduce((sum, item, index) => sum + item.price * (index === 0 ? 2 : 1), 0);
  const order = {
    id: uid("ORD"),
    branchId: state.selectedBranch,
    branchName: currentBranch().name,
    table: Math.ceil(Math.random() * currentBranch().tables),
    items: available.map((item, index) => ({
      lineId: uid("line"),
      id: item.id,
      name: item.name,
      qty: index === 0 ? 2 : 1,
      price: item.price,
      station: item.station,
      priority: index === 0 ? "first" : "normal",
      itemStatus: "new",
      spice: "Medium",
      addOns: [],
      remove: [],
      combo: false
    })),
    note: "Demo order for kitchen flow.",
    status: "new",
    customer: { name: "Demo Guest", phone: "9999999999" },
    payment: { method: "upi", subtotal, discount: 0, tax: Math.round(subtotal * 0.05), tip: 0, total: Math.round(subtotal * 1.05), split: 1, perPerson: Math.round(subtotal * 1.05), status: "authorized" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (backendOnline) state = normalizeState(await apiPost("/api/order", order));
  else {
    state.orders.unshift(order);
    reduceStock(order);
    upsertCustomer(order);
  }
  persistLocal();
  renderAll();
  toast("Sample order created.");
}

async function resetDemo() {
  if (backendOnline) {
    if (!session?.token || session.user.role !== "admin") {
      toast("Please log in as admin to reset demo data.");
      return;
    }
    try {
      state = normalizeState(await apiPost("/api/reset", {}, true));
      persistLocal();
      renderAll();
      toast("Demo reset.");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  state = structuredClone(defaultState);
  persistLocal();
  renderAll();
  toast("Demo reset.");
}

function renderMetrics() {
  const branchOrders = state.orders.filter((order) => order.branchId === state.selectedBranch);
  const totalOrders = branchOrders.length;
  const revenue = branchOrders.reduce((sum, order) => sum + Number(order.payment?.total || 0), 0);
  const openOrders = branchOrders.filter((order) => order.status !== "served").length;
  const tableCounts = branchOrders.reduce((counts, order) => {
    counts[order.table] = (counts[order.table] || 0) + 1;
    return counts;
  }, {});
  const busiest = Object.entries(tableCounts).sort((a, b) => b[1] - a[1])[0];
  els.todayOrders.textContent = totalOrders;
  els.todayRevenue.textContent = money(revenue);
  els.activeItems.textContent = state.menu.filter(isItemOrderable).length;
  els.openOrders.textContent = openOrders;
  els.avgTicket.textContent = money(totalOrders ? revenue / totalOrders : 0);
  els.busyTable.textContent = busiest ? `T${busiest[0]}` : "-";
  els.loyaltyMembers.textContent = state.customers.length;
  els.lowStockItems.textContent = state.menu.filter((item) => Number(item.stock) <= Number(item.lowStockAt)).length;
}

function renderFlyer() {
  if (!els.flyerPreview) return;
  const branch = currentBranch();
  if (!els.flyerBrand.value) els.flyerBrand.value = branch.name;
  const table = Number(els.flyerTableSelect.value || state.selectedTable || 1);
  const theme = els.flyerTheme.value || "fresh";
  const format = els.flyerFormat.value || "card";
  els.flyerPreview.className = `flyer-preview ${theme} ${format}`;
  els.flyerPreviewBrand.textContent = els.flyerBrand.value || branch.name;
  els.flyerPreviewHeadline.textContent = els.flyerHeadline.value || "Scan to order from your table";
  els.flyerPreviewSubline.textContent = els.flyerSubline.value || "Browse the menu and send your order straight to the kitchen.";
  els.flyerPreviewTable.textContent = `${branch.name} · Table ${table}`;
  els.flyerPreviewFooter.textContent = els.flyerFooter.value || "Need help? Tap Request staff help after scanning.";
  els.flyerQrImage.src = qrUrl(table);
}

function renderGrowth() {
  els.roadmap.innerHTML = state.branches.map(branch => {
    const orders = state.orders.filter(o => o.branchId === branch.id);
    const total = orders.reduce((n,o) => n + Number(o.payment?.total || 0), 0);
    const collected = orders.filter(o => o.payment?.status === 'paid').reduce((n,o) => n + Number(o.payment.total), 0);
    return `<article class="roadmap-card"><b>${orders.length} orders</b><div><h3>${escapeHtml(branch.name)}</h3><p>Order value ${money(total)} · Collected ${money(collected)} · Average order ${money(orders.length ? total / orders.length : 0)}</p></div></article>`;
  }).join('');
  $('growthPackages').innerHTML = `<h3>Popular dishes</h3>${state.menu.map(item => ({ name: item.name, qty: state.orders.reduce((n,o) => n + o.items.filter(i => i.id === item.id).reduce((s,i) => s + i.qty, 0), 0) })).sort((a,b) => b.qty - a.qty).slice(0,5).map(item => `<div class="package-card"><strong>${escapeHtml(item.name)}</strong><span>${item.qty} ordered</span></div>`).join('')}`;
}

window.addEventListener("hashchange", hydrateFromUrl);
document.addEventListener("DOMContentLoaded", init);
