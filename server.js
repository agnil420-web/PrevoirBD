'use strict';
// Prevoir marketplace backend: Express + SQLite. Serves the storefront from /public and the JSON API under /api.
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { db } = require('./db');
const PAGES = require('./pages');

const scrypt = promisify(crypto.scrypt);
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(12).toString('hex');
const ADMIN_KEY_GENERATED = !process.env.ADMIN_KEY;
const BANK_DETAILS = process.env.BANK_DETAILS || 'Prevoir Demo Bank, account 000-000-000 (set BANK_DETAILS in your environment)';
const SESSION_MS = 30 * 24 * 3600 * 1000;
// All money is stored in poisha (1 taka = 100 poisha), so every amount below is taka x 100.
const FREE_SHIP_CENTS = 300000; // free delivery from ৳3,000
const SHIP_CENTS = 8000;        // otherwise ৳80 flat
const FLASH_ROUND_MS = 3 * 3600 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PAYMENTS = { cod: 'Cash on delivery', bank: 'Bank transfer', online: 'Online payment (bKash, Nagad, cards)' };

// ---- online payments through SSLCommerz (bKash, Nagad, Rocket, cards, net banking)
const SSL_STORE_ID = process.env.SSLCOMMERZ_STORE_ID || '';
const SSL_STORE_PASS = process.env.SSLCOMMERZ_STORE_PASSWORD || '';
const SSL_LIVE = process.env.SSLCOMMERZ_MODE === 'live';
const SSL_BASE = process.env.SSLCOMMERZ_API_BASE || (SSL_LIVE ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const ONLINE_ENABLED = !!(SSL_STORE_ID && SSL_STORE_PASS && PUBLIC_URL);
const PENDING_MINUTES = 30;
const bdtAmount = (cents) => (cents / 100).toFixed(2);
const STATUSES = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'];
const PENDING = 'pending_payment';

const CATEGORIES = [
  ['Gadgets', 'Phones & Gadgets', 'phone', 'a'], ['Audio', 'Audio', 'audio', 'c'], ['Fashion', 'Fashion', 'shirt', 'b'],
  ['Bags', 'Bags', 'bag', 'd'], ['Shoes', 'Shoes', 'shoe', 'e'], ['Watches', 'Watches', 'watch', 'f'],
  ['Home', 'Home & Living', 'lamp', 'b'], ['Kitchen', 'Kitchen', 'mug', 'a'], ['Garden', 'Garden', 'plant', 'a'],
  ['Cameras', 'Cameras', 'camera', 'c'], ['Gaming', 'Gaming', 'game', 'e'], ['Books', 'Books', 'book', 'f'],
  ['Sports', 'Sports', 'ball', 'd'], ['Gifts', 'Gifts & Toys', 'gift', 'b'], ['Beauty', 'Beauty', 'beauty', 'd'],
  ['Tools', 'Tools', 'tools', 'c']
].map(([key, label, icon, tile]) => ({ key, label, icon, tile }));
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const dollars = (c) => Math.round(c) / 100;
const fmt = (c) => '৳' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const now = () => new Date().toISOString();

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function limit(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip + '|' + req.path;
    const t = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < t) { h = { n: 0, reset: t + windowMs }; hits.set(key, h); }
    if (++h.n > max) return next(new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.'));
    next();
  };
}

// ---------- prepared statements ----------
const S = {
  session: db.prepare('SELECT * FROM sessions WHERE id=?'),
  insSession: db.prepare('INSERT INTO sessions (id,user_id,voucher,created_at,expires_at) VALUES (?,?,?,?,?)'),
  delSession: db.prepare('DELETE FROM sessions WHERE id=?'),
  setVoucher: db.prepare('UPDATE sessions SET voucher=? WHERE id=?'),
  userById: db.prepare('SELECT id,email,name FROM users WHERE id=?'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email=?'),
  insUser: db.prepare('INSERT INTO users (email,name,pass,created_at) VALUES (?,?,?,?)'),
  product: db.prepare('SELECT * FROM products WHERE id=?'),
  flash: db.prepare('SELECT * FROM products WHERE flash_order IS NOT NULL ORDER BY flash_order'),
  reviews: db.prepare('SELECT author,rating,body,created_at FROM reviews WHERE product_id=? ORDER BY created_at DESC LIMIT 20'),
  insReview: db.prepare('INSERT INTO reviews (product_id,user_id,author,rating,body,created_at) VALUES (?,?,?,?,?,?)'),
  updRating: db.prepare('UPDATE products SET rating=?, review_count=? WHERE id=?'),
  cart: db.prepare('SELECT p.*, c.qty FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.owner=? ORDER BY c.rowid'),
  cartItem: db.prepare('SELECT qty FROM cart_items WHERE owner=? AND product_id=?'),
  upCart: db.prepare('INSERT INTO cart_items (owner,product_id,qty) VALUES (?,?,?) ON CONFLICT(owner,product_id) DO UPDATE SET qty=excluded.qty'),
  delCartItem: db.prepare('DELETE FROM cart_items WHERE owner=? AND product_id=?'),
  clearCart: db.prepare('DELETE FROM cart_items WHERE owner=?'),
  wishIds: db.prepare('SELECT product_id FROM wishlist WHERE owner=? ORDER BY added_at DESC'),
  wishItems: db.prepare('SELECT p.* FROM wishlist w JOIN products p ON p.id=w.product_id WHERE w.owner=? ORDER BY w.added_at DESC'),
  addWish: db.prepare('INSERT OR IGNORE INTO wishlist (owner,product_id,added_at) VALUES (?,?,?)'),
  delWish: db.prepare('DELETE FROM wishlist WHERE owner=? AND product_id=?'),
  voucher: db.prepare('SELECT * FROM vouchers WHERE code=?'),
  priorOrders: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status!='cancelled' AND (user_id=? OR lower(email)=?)"),
  insOrder: db.prepare(`INSERT INTO orders (number,user_id,name,email,phone,address,city,postcode,payment,subtotal_cents,
    discount_cents,shipping_cents,total_cents,voucher,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  insOrderItem: db.prepare('INSERT INTO order_items (order_id,product_id,name,price_cents,qty) VALUES (?,?,?,?,?)'),
  orderByNumber: db.prepare('SELECT * FROM orders WHERE number=?'),
  ordersForUser: db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 50'),
  orderItems: db.prepare('SELECT product_id,name,price_cents,qty FROM order_items WHERE order_id=?'),
  setOrderStatus: db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?'),
  setGatewayRef: db.prepare('UPDATE orders SET gateway_ref=?, updated_at=? WHERE id=?'),
  orderByRef: db.prepare('SELECT * FROM orders WHERE gateway_ref=?'),
  markPaid: db.prepare('UPDATE orders SET paid_at=?, status=?, updated_at=? WHERE id=?'),
  stalePending: db.prepare('SELECT * FROM orders WHERE status=? AND created_at<?'),
  takeStock: db.prepare('UPDATE products SET stock=stock-?, sold=sold+?, flash_claimed=CASE WHEN flash_limit IS NULL THEN 0 ELSE MIN(flash_limit, flash_claimed+?) END WHERE id=?'),
  giveStock: db.prepare('UPDATE products SET stock=stock+?, sold=MAX(0,sold-?), flash_claimed=MAX(0,flash_claimed-?) WHERE id=?')
};

// ---------- sessions ----------
function setSessionCookie(req, res, id) {
  const parts = ['sid=' + encodeURIComponent(id), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + Math.floor(SESSION_MS / 1000)];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
function startSession(req, res, userId, voucher) {
  const id = crypto.randomBytes(24).toString('base64url');
  const t = Date.now();
  S.insSession.run(id, userId || null, voucher || null, t, t + SESSION_MS);
  setSessionCookie(req, res, id);
  return { id, user_id: userId || null, voucher: voucher || null };
}

const mergeOwners = db.transaction((from, to) => {
  for (const r of db.prepare('SELECT product_id,qty FROM cart_items WHERE owner=?').all(from)) {
    const p = S.product.get(r.product_id);
    const cur = S.cartItem.get(to, r.product_id);
    const qty = Math.min(99, p ? p.stock : 0, (cur ? cur.qty : 0) + r.qty);
    if (qty > 0) S.upCart.run(to, r.product_id, qty);
  }
  S.clearCart.run(from);
  db.prepare('INSERT OR IGNORE INTO wishlist (owner,product_id,added_at) SELECT ?,product_id,added_at FROM wishlist WHERE owner=?').run(to, from);
  db.prepare('DELETE FROM wishlist WHERE owner=?').run(from);
});

function loginAs(req, res, userId) {
  const old = req.sess;
  startSession(req, res, userId, old.voucher);
  mergeOwners('s:' + old.id, 'u:' + userId);
  S.delSession.run(old.id);
}

function sessionMiddleware(req, res, next) {
  const sid = parseCookies(req.headers.cookie).sid;
  let s = sid && S.session.get(sid);
  if (!s || s.expires_at < Date.now()) s = startSession(req, res, null, null);
  req.sess = s;
  req.user = s.user_id ? S.userById.get(s.user_id) : null;
  req.owner = req.user ? 'u:' + req.user.id : 's:' + s.id;
  next();
}
const requireUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Please sign in to continue.')));

// ---------- passwords ----------
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}
async function checkPassword(pw, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  const hash = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}
const DUMMY_HASH = '00'.repeat(16) + ':' + '00'.repeat(64);

// ---------- catalogue ----------
function pub(p) {
  return {
    id: p.id, name: p.name, cat: p.category, icon: p.icon, tile: p.tile,
    price: dollars(p.price_cents), old: dollars(p.old_cents), sold: p.sold,
    rating: Math.round(p.rating * 10) / 10, rev: p.review_count, free: !!p.free_ship, isNew: !!p.is_new,
    stock: p.stock, seller: p.seller, highlights: JSON.parse(p.highlights), colors: JSON.parse(p.colors),
    claimed: p.flash_limit ? Math.min(99, Math.round((p.flash_claimed / p.flash_limit) * 100)) : null
  };
}

function productQuery(q) {
  const where = [];
  const args = [];
  const cat = str(q.cat, 40);
  if (cat) { where.push('category=?'); args.push(cat); }
  const words = str(q.q, 80).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const w of words) {
    const forms = [w];
    if (w.length > 3 && w.endsWith('s')) forms.push(w.slice(0, -1));
    where.push('(' + forms.map(() => "(lower(name) LIKE ? ESCAPE '\\' OR lower(category) LIKE ? ESCAPE '\\')").join(' OR ') + ')');
    for (const f of forms) {
      const like = '%' + f.replace(/[\\%_]/g, '\\$&') + '%';
      args.push(like, like);
    }
  }
  const tab = str(q.tab, 10);
  if (tab === 'new') where.push('is_new=1');
  if (tab === 'cheap') where.push('price_cents<250000');
  const order = tab === 'top' ? 'sold DESC, id' : tab === 'cheap' ? 'price_cents, id' : 'id';
  return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', args, order };
}

// ---------- cart and pricing ----------
function evalVoucher(code, rows, subtotal, ctx) {
  if (!code) return { ok: false };
  const v = S.voucher.get(String(code).toUpperCase());
  if (!v || !v.active) return { ok: false, code, error: "That voucher code isn't valid." };
  if (subtotal < v.min_cents) return { ok: false, code: v.code, error: `Spend ${fmt(v.min_cents)} or more to use ${v.code}.` };
  if (v.first_order_only && ctx && (ctx.userId || ctx.email)) {
    const n = S.priorOrders.get(ctx.userId || -1, String(ctx.email || '').toLowerCase()).n;
    if (n > 0) return { ok: false, code: v.code, error: `${v.code} is for first orders only.` };
  }
  let discount = 0;
  let shippingFree = false;
  if (v.kind === 'percent') {
    const base = v.category ? rows.filter((r) => r.category === v.category).reduce((a, r) => a + r.price_cents * r.qty, 0) : subtotal;
    if (base === 0) return { ok: false, code: v.code, error: `${v.code} applies to ${CAT_LABEL[v.category] || v.category} items only. Add one to use it.` };
    discount = Math.round((base * v.value) / 100);
  } else if (v.kind === 'shipping') {
    shippingFree = true;
  }
  return { ok: true, code: v.code, label: v.label, discount, shippingFree };
}

function totals(rows, voucherCode, ctx) {
  const subtotal = rows.reduce((a, r) => a + r.price_cents * r.qty, 0);
  const ev = voucherCode ? evalVoucher(voucherCode, rows, subtotal, ctx) : { ok: false };
  const discount = ev.ok ? ev.discount : 0;
  const free = subtotal >= FREE_SHIP_CENTS || (ev.ok && ev.shippingFree);
  const shipping = rows.length && !free ? SHIP_CENTS : 0;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping, voucher: ev };
}

function cartPayload(req, notice) {
  const rows = S.cart.all(req.owner);
  const t = totals(rows, req.sess.voucher, { userId: req.user && req.user.id });
  return {
    items: rows.map((r) => ({ id: r.id, name: r.name, price: dollars(r.price_cents), qty: r.qty, stock: r.stock, icon: r.icon, tile: r.tile, cat: r.category })),
    count: rows.reduce((a, r) => a + r.qty, 0),
    subtotal: dollars(t.subtotal), discount: dollars(t.discount), shipping: dollars(t.shipping), total: dollars(t.total),
    freeShipGap: rows.length && t.subtotal < FREE_SHIP_CENTS && !(t.voucher.ok && t.voucher.shippingFree) ? dollars(FREE_SHIP_CENTS - t.subtotal) : 0,
    voucher: t.voucher.ok ? { code: t.voucher.code, label: t.voucher.label } : null,
    voucherError: !t.voucher.ok && t.voucher.error ? t.voucher.error : null,
    notice: notice || null
  };
}

function intParam(v, min, max, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name} must be a whole number between ${min} and ${max}.`);
  return n;
}
function productOr404(id) {
  const p = S.product.get(Number(id));
  if (!p) throw new HttpError(404, 'Product not found.');
  return p;
}

// ---------- orders ----------
function orderOut(o) {
  return {
    number: o.number, status: o.status, createdAt: o.created_at,
    items: S.orderItems.all(o.id).map((i) => ({ id: i.product_id, name: i.name, price: dollars(i.price_cents), qty: i.qty })),
    subtotal: dollars(o.subtotal_cents), discount: dollars(o.discount_cents), shipping: dollars(o.shipping_cents), total: dollars(o.total_cents),
    voucher: o.voucher, payment: o.payment, paymentLabel: PAYMENTS[o.payment] || o.payment,
    shipTo: { name: o.name, address: o.address, city: o.city, postcode: o.postcode },
    paid: !!o.paid_at, canPay: o.status === PENDING && o.payment === 'online' && ONLINE_ENABLED,
    canCancel: o.status === 'placed' || o.status === PENDING
  };
}

const cancelOrderTx = db.transaction((order) => {
  for (const i of S.orderItems.all(order.id)) S.giveStock.run(i.qty, i.qty, i.qty, i.product_id);
  S.setOrderStatus.run('cancelled', now(), order.id);
});

const placeOrderTx = db.transaction((req, form) => {
  const rows = S.cart.all(req.owner);
  if (!rows.length) throw new HttpError(400, 'Your cart is empty.');
  for (const r of rows) {
    const cur = S.product.get(r.id);
    if (cur.stock < r.qty) {
      throw new HttpError(409, cur.stock > 0 ? `Only ${cur.stock} of "${cur.name}" left. Update your cart and try again.` : `"${cur.name}" just sold out. Remove it from your cart to continue.`);
    }
  }
  const t = totals(rows, req.sess.voucher, { userId: req.user && req.user.id, email: form.email });
  if (req.sess.voucher && !t.voucher.ok) throw new HttpError(400, t.voucher.error || 'Your voucher is no longer valid. Remove it and try again.');
  let number;
  for (let tries = 0; tries < 5; tries++) {
    number = 'PV-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    if (!S.orderByNumber.get(number)) break;
  }
  const stamp = now();
  const info = S.insOrder.run(number, req.user ? req.user.id : null, form.name, form.email, form.phone, form.address, form.city,
    form.postcode, form.payment, t.subtotal, t.discount, t.shipping, t.total, t.voucher.ok ? t.voucher.code : null, form.payment === 'online' ? PENDING : 'placed', stamp, stamp);
  for (const r of rows) {
    S.insOrderItem.run(info.lastInsertRowid, r.id, r.name, r.price_cents, r.qty);
    S.takeStock.run(r.qty, r.qty, r.qty, r.id);
  }
  S.clearCart.run(req.owner);
  S.setVoucher.run(null, req.sess.id);
  return S.orderByNumber.get(number);
});

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  next();
});
app.use('/api', express.json({ limit: '50kb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Custom header makes cross-site form posts fail, which is the CSRF defence together with SameSite=Lax.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('x-prevoir') !== '1') return next(new HttpError(403, 'Request blocked.'));
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// admin routes use their own key and no session
function requireAdmin(req, res, next) {
  const given = Buffer.from(String(req.get('x-admin-key') || ''));
  const want = Buffer.from(ADMIN_KEY);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return next(new HttpError(401, 'Admin key required.'));
  next();
}
app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const n = (sql) => db.prepare(sql).get().n;
  res.json({
    users: n('SELECT COUNT(*) n FROM users'), orders: n('SELECT COUNT(*) n FROM orders'),
    revenue: dollars(db.prepare("SELECT COALESCE(SUM(total_cents),0) n FROM orders WHERE status NOT IN ('cancelled','pending_payment')").get().n),
    sellersPending: n("SELECT COUNT(*) n FROM sellers WHERE status='pending'"), tickets: n('SELECT COUNT(*) n FROM support_tickets'),
    waitlist: n('SELECT COUNT(*) n FROM app_waitlist')
  });
});
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json({ orders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all().map((o) => ({ ...orderOut(o), email: o.email, phone: o.phone })) });
});
app.patch('/api/admin/orders/:number', requireAdmin, (req, res) => {
  const o = S.orderByNumber.get(String(req.params.number).toUpperCase());
  if (!o) throw new HttpError(404, 'Order not found.');
  const status = str(req.body.status, 20);
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Status must be one of: ' + STATUSES.join(', '));
  if (o.status === 'cancelled' && status !== 'cancelled') throw new HttpError(409, 'A cancelled order cannot be reopened.');
  if (status === 'cancelled' && o.status !== 'cancelled') cancelOrderTx(o);
  else S.setOrderStatus.run(status, now(), o.id);
  res.json({ order: orderOut(S.orderByNumber.get(o.number)) });
});
app.get('/api/admin/sellers', requireAdmin, (req, res) => res.json({ sellers: db.prepare('SELECT * FROM sellers ORDER BY id DESC').all() }));
app.patch('/api/admin/sellers/:id', requireAdmin, (req, res) => {
  const status = str(req.body.status, 20);
  if (!['pending', 'approved', 'rejected'].includes(status)) throw new HttpError(400, 'Status must be pending, approved or rejected.');
  const r = db.prepare('UPDATE sellers SET status=? WHERE id=?').run(status, Number(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Seller not found.');
  res.json({ ok: true });
});
app.get('/api/admin/support', requireAdmin, (req, res) => res.json({ tickets: db.prepare('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 200').all() }));

// everything below uses the visitor session
app.use('/api', sessionMiddleware);

// --- accounts
app.post('/api/auth/register', limit(10, 600000), wrap(async (req, res) => {
  const name = str(req.body.name, 60);
  const email = str(req.body.email, 120).toLowerCase();
  const pw = String(req.body.password || '');
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (pw.length < 8 || pw.length > 200) throw new HttpError(400, 'Choose a password with at least 8 characters.');
  if (S.userByEmail.get(email)) throw new HttpError(409, 'An account with this email already exists. Try signing in.');
  const info = S.insUser.run(email, name, await hashPassword(pw), now());
  loginAs(req, res, info.lastInsertRowid);
  res.status(201).json({ user: S.userById.get(info.lastInsertRowid) });
}));
app.post('/api/auth/login', limit(15, 600000), wrap(async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const pw = String(req.body.password || '').slice(0, 200);
  const u = S.userByEmail.get(email);
  const ok = await checkPassword(pw, u ? u.pass : DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Incorrect email or password.');
  loginAs(req, res, u.id);
  res.json({ user: S.userById.get(u.id) });
}));
app.post('/api/auth/logout', (req, res) => {
  S.delSession.run(req.sess.id);
  startSession(req, res, null, null);
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  res.json({ user: req.user, wishlist: S.wishIds.all(req.owner).map((r) => r.product_id) });
});

// --- catalogue
app.get('/api/categories', (req, res) => res.json({ categories: CATEGORIES }));
app.get('/api/products', (req, res) => {
  const { sql, args, order } = productQuery(req.query);
  const lim = Math.max(1, Math.min(48, parseInt(req.query.limit, 10) || 12));
  const off = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const total = db.prepare('SELECT COUNT(*) AS n FROM products' + sql).get(...args).n;
  const items = db.prepare('SELECT * FROM products' + sql + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?').all(...args, lim, off).map(pub);
  res.json({ items, total });
});
app.get('/api/flash', (req, res) => {
  const t = Date.now();
  res.json({ now: t, endsAt: Math.ceil((t + 1) / FLASH_ROUND_MS) * FLASH_ROUND_MS, items: S.flash.all().map(pub) });
});
app.get('/api/products/:id', (req, res) => {
  const p = productOr404(req.params.id);
  res.json({
    ...pub(p),
    description: p.description,
    specs: [
      ['Category', CAT_LABEL[p.category] || p.category], ['Sold by', p.seller],
      ['Shipping', p.free_ship ? 'Free shipping' : '৳80 flat rate, free over ৳3,000'], ['Returns', '30 days'],
      ['Availability', p.stock > 0 ? `${p.stock} in stock` : 'Sold out']
    ],
    reviews: S.reviews.all(p.id).map((r) => ({ author: r.author, rating: r.rating, body: r.body, date: r.created_at }))
  });
});
app.post('/api/products/:id/reviews', requireUser, limit(20, 600000), (req, res) => {
  const p = productOr404(req.params.id);
  const rating = intParam(req.body.rating, 1, 5, 'Rating');
  const body = str(req.body.body, 600);
  if (body.length < 5) throw new HttpError(400, 'Please write at least a few words about the product.');
  try {
    S.insReview.run(p.id, req.user.id, req.user.name, rating, body, now());
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw new HttpError(409, 'You have already reviewed this product.');
    throw e;
  }
  const n = p.review_count + 1;
  S.updRating.run((p.rating * p.review_count + rating) / n, n, p.id);
  res.status(201).json({ ok: true });
});

// --- wishlist (works for guests too; merged into the account at sign in)
const wishPayload = (req) => ({ wishlist: S.wishIds.all(req.owner).map((r) => r.product_id) });
app.get('/api/wishlist', (req, res) => res.json({ items: S.wishItems.all(req.owner).map(pub), ...wishPayload(req) }));
app.put('/api/wishlist/:id', (req, res) => {
  const p = productOr404(req.params.id);
  S.addWish.run(req.owner, p.id, Date.now());
  res.json(wishPayload(req));
});
app.delete('/api/wishlist/:id', (req, res) => {
  S.delWish.run(req.owner, Number(req.params.id));
  res.json(wishPayload(req));
});

// --- cart
app.get('/api/cart', (req, res) => res.json(cartPayload(req)));
app.post('/api/cart/items', (req, res) => {
  const p = productOr404(req.body.productId);
  const add = intParam(req.body.qty == null ? 1 : req.body.qty, 1, 99, 'Quantity');
  if (p.stock < 1) throw new HttpError(409, 'Sorry, this item is sold out.');
  const cur = S.cartItem.get(req.owner, p.id);
  const have = cur ? cur.qty : 0;
  if (have >= p.stock) throw new HttpError(409, `You already have all ${p.stock} available in your cart.`);
  const qty = Math.min(have + add, p.stock, 99);
  S.upCart.run(req.owner, p.id, qty);
  res.json(cartPayload(req, have + add > p.stock ? `Only ${p.stock} available, so we added ${qty - have}.` : null));
});
app.patch('/api/cart/items/:id', (req, res) => {
  const p = productOr404(req.params.id);
  const want = intParam(req.body.qty, 0, 99, 'Quantity');
  if (want === 0) { S.delCartItem.run(req.owner, p.id); return res.json(cartPayload(req)); }
  if (!S.cartItem.get(req.owner, p.id)) throw new HttpError(404, 'That item is not in your cart.');
  const qty = Math.min(want, p.stock);
  if (qty < 1) { S.delCartItem.run(req.owner, p.id); return res.json(cartPayload(req, 'That item just sold out and was removed.')); }
  S.upCart.run(req.owner, p.id, qty);
  res.json(cartPayload(req, want > p.stock ? `Only ${p.stock} available.` : null));
});
app.delete('/api/cart/items/:id', (req, res) => {
  S.delCartItem.run(req.owner, Number(req.params.id));
  res.json(cartPayload(req));
});
app.delete('/api/cart', (req, res) => {
  S.clearCart.run(req.owner);
  res.json(cartPayload(req));
});
app.post('/api/cart/voucher', (req, res) => {
  const code = str(req.body.code, 30).toUpperCase();
  if (!code) throw new HttpError(400, 'Enter a voucher code.');
  const rows = S.cart.all(req.owner);
  if (!rows.length) throw new HttpError(400, 'Add something to your cart first.');
  const subtotal = rows.reduce((a, r) => a + r.price_cents * r.qty, 0);
  const ev = evalVoucher(code, rows, subtotal, { userId: req.user && req.user.id });
  if (!ev.ok) throw new HttpError(400, ev.error);
  S.setVoucher.run(ev.code, req.sess.id);
  req.sess.voucher = ev.code;
  res.json(cartPayload(req));
});
app.delete('/api/cart/voucher', (req, res) => {
  S.setVoucher.run(null, req.sess.id);
  req.sess.voucher = null;
  res.json(cartPayload(req));
});

// --- orders
app.post('/api/orders', limit(20, 600000), wrap(async (req, res) => {
  const b = req.body || {};
  const form = {
    name: str(b.name, 80), email: str(b.email, 120).toLowerCase(), phone: str(b.phone, 25),
    address: str(b.address, 200), city: str(b.city, 60), postcode: str(b.postcode, 12), payment: str(b.payment, 10)
  };
  if (form.name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!EMAIL.test(form.email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (!/^[0-9+()\-\s]{6,25}$/.test(form.phone)) throw new HttpError(400, 'Please enter a valid phone number.');
  if (form.address.length < 5) throw new HttpError(400, 'Please enter your delivery address.');
  if (form.city.length < 2) throw new HttpError(400, 'Please enter your city.');
  if (form.postcode.length < 2) throw new HttpError(400, 'Please enter your postcode.');
  if (!PAYMENTS[form.payment]) throw new HttpError(400, 'Please choose a payment method.');
  if (form.payment === 'online' && !ONLINE_ENABLED) throw new HttpError(400, 'Online payment is not available right now. Please choose another method.');
  const order = placeOrderTx(req, form);
  const out = orderOut(order);
  if (form.payment === 'bank') out.paymentNote = `Transfer ${fmt(order.total_cents)} to ${BANK_DETAILS}. Use ${order.number} as the payment reference.`;
  if (form.payment === 'online') {
    try { out.paymentUrl = await startPayment(order); }
    catch (e) {
      console.error('payment init failed:', e.message);
      cancelOrderTx(order);
      for (const i of S.orderItems.all(order.id)) S.upCart.run(req.owner, i.product_id, i.qty); // give the cart back
      throw new HttpError(502, 'We could not reach the payment service. Nothing was charged. Please try again or choose another method.'); }
  }
  res.status(201).json({ order: out });
}));
app.get('/api/orders', requireUser, (req, res) => {
  res.json({ orders: S.ordersForUser.all(req.user.id).map(orderOut) });
});
function findOrder(req, number, email) {
  const o = S.orderByNumber.get(str(number, 40).toUpperCase());
  const mine = o && req.user && o.user_id === req.user.id;
  const byEmail = o && email && o.email === str(email, 120).toLowerCase();
  if (!o || !(mine || byEmail)) throw new HttpError(404, 'We could not find an order with that number and email.');
  return o;
}
app.get('/api/orders/track', limit(30, 600000), (req, res) => {
  res.json({ order: orderOut(findOrder(req, req.query.number, req.query.email)) });
});
app.post('/api/orders/cancel', limit(30, 600000), (req, res) => {
  const o = findOrder(req, req.body.number, req.body.email);
  if (o.status !== 'placed' && o.status !== PENDING) throw new HttpError(409, 'This order has already been packed, so it can no longer be cancelled. You can return it after delivery.');
  cancelOrderTx(o);
  res.json({ order: orderOut(S.orderByNumber.get(o.number)) });
});


// --- online payment (SSLCommerz)
app.get('/api/config', (req, res) => res.json({ onlinePayments: ONLINE_ENABLED }));

async function startPayment(order) {
  const attempt = `${order.number}-${crypto.randomBytes(2).toString('hex')}`;
  S.setGatewayRef.run(attempt, now(), order.id);
  const items = S.orderItems.all(order.id);
  const params = new URLSearchParams({
    store_id: SSL_STORE_ID, store_passwd: SSL_STORE_PASS,
    total_amount: bdtAmount(order.total_cents), currency: 'BDT', tran_id: attempt,
    success_url: PUBLIC_URL + '/pay/success', fail_url: PUBLIC_URL + '/pay/fail', cancel_url: PUBLIC_URL + '/pay/cancel', ipn_url: PUBLIC_URL + '/pay/ipn',
    cus_name: order.name, cus_email: order.email, cus_add1: order.address, cus_city: order.city, cus_postcode: order.postcode, cus_country: 'Bangladesh', cus_phone: order.phone,
    shipping_method: 'Courier', num_of_item: String(items.reduce((n, i) => n + i.qty, 0)),
    product_name: items.map((i) => i.name).join(', ').slice(0, 250) || 'Prevoir order', product_category: 'General', product_profile: 'physical-goods'
  });
  const r = await fetch(SSL_BASE + '/gwprocess/v4/api.php', { method: 'POST', body: params, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (j.status !== 'SUCCESS' || !j.GatewayPageURL) throw new Error(j.failedreason || 'gateway refused the session');
  return j.GatewayPageURL;
}
app.post('/api/orders/pay', limit(20, 600000), wrap(async (req, res) => {
  const o = findOrder(req, req.body.number, req.body.email);
  if (o.status !== PENDING || o.payment !== 'online') throw new HttpError(409, 'This order does not need a payment.');
  if (!ONLINE_ENABLED) throw new HttpError(400, 'Online payment is not available right now.');
  try { res.json({ paymentUrl: await startPayment(o) }); }
  catch (e) { console.error('payment init failed:', e.message); throw new HttpError(502, 'We could not reach the payment service. Please try again in a moment.'); }
}));

// Gateway callbacks are cross-site form posts, so they live outside /api and never trust the posted body:
// money is only accepted after the gateway itself confirms it server to server.
async function confirmPayment(val_id) {
  if (!ONLINE_ENABLED || !val_id) return { ok: false };
  const q = new URLSearchParams({ val_id: String(val_id), store_id: SSL_STORE_ID, store_passwd: SSL_STORE_PASS, format: 'json' });
  const r = await fetch(SSL_BASE + '/validator/api/validationserverAPI.php?' + q, { signal: AbortSignal.timeout(15000) });
  const v = await r.json();
  if (v.status !== 'VALID' && v.status !== 'VALIDATED') return { ok: false };
  const o = S.orderByRef.get(String(v.tran_id || ''));
  if (!o) return { ok: false };
  if (v.currency !== 'BDT' || Number(v.amount).toFixed(2) !== bdtAmount(o.total_cents)) { console.error('payment amount mismatch for', o.number, v.amount, v.currency); return { ok: false, order: o }; }
  if (!o.paid_at) {
    if (o.status === PENDING) S.markPaid.run(now(), 'placed', now(), o.id);
    else S.markPaid.run(now(), o.status, now(), o.id); // already cancelled: money arrived late, shown to admin as "refund needed"
  }
  return { ok: true, order: S.orderByNumber.get(o.number) };
}
const payBody = express.urlencoded({ extended: false, limit: '20kb' });
app.post('/pay/success', payBody, wrap(async (req, res) => {
  let r = { ok: false };
  try { r = await confirmPayment(req.body.val_id); } catch (e) { console.error('payment check failed:', e.message); }
  const num = r.order ? r.order.number : '';
  res.redirect(303, '/?pay=' + (r.ok ? (r.order.status === 'cancelled' ? 'late' : 'ok') : 'failed') + (num ? '&order=' + encodeURIComponent(num) : ''));
}));
app.post('/pay/ipn', payBody, wrap(async (req, res) => {
  try { await confirmPayment(req.body.val_id); } catch (e) { console.error('ipn check failed:', e.message); }
  res.status(200).send('OK');
}));
const payBack = (state) => [payBody, (req, res) => {
  const o = S.orderByRef.get(String(req.body.tran_id || ''));
  res.redirect(303, '/?pay=' + state + (o ? '&order=' + encodeURIComponent(o.number) : ''));
}];
app.post('/pay/fail', ...payBack('failed'));
app.post('/pay/cancel', ...payBack('cancelled'));

// unpaid online orders give their stock back after a while
function sweepPending() {
  const cutoff = new Date(Date.now() - PENDING_MINUTES * 60000).toISOString();
  let n = 0;
  for (const o of S.stalePending.all(PENDING, cutoff)) { cancelOrderTx(o); n++; }
  return n;
}

// --- content, support, sellers, app waitlist
app.get('/api/pages/:slug', (req, res) => {
  const page = Object.prototype.hasOwnProperty.call(PAGES, req.params.slug) ? PAGES[req.params.slug] : null;
  if (!page) throw new HttpError(404, 'Page not found.');
  res.json(page);
});
app.post('/api/support', limit(10, 600000), (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), message = str(b.message, 2000);
  const topic = ['Order', 'Delivery', 'Returns', 'Account', 'Seller', 'Other'].includes(b.topic) ? b.topic : 'Other';
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (message.length < 10) throw new HttpError(400, 'Please describe the problem in a sentence or two.');
  const info = db.prepare('INSERT INTO support_tickets (name,email,topic,order_number,message,created_at) VALUES (?,?,?,?,?,?)')
    .run(name, email, topic, str(b.orderNumber, 40).toUpperCase() || null, message, now());
  res.status(201).json({ ticket: Number(info.lastInsertRowid) });
});
app.post('/api/sellers', limit(10, 600000), (req, res) => {
  const b = req.body || {};
  const shop = str(b.shopName, 80), owner = str(b.ownerName, 80), email = str(b.email, 120).toLowerCase();
  if (shop.length < 2) throw new HttpError(400, 'Please enter your shop name.');
  if (owner.length < 2) throw new HttpError(400, 'Please enter your name.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (db.prepare("SELECT 1 FROM sellers WHERE email=? AND status!='rejected'").get(email)) throw new HttpError(409, 'We already have an application for this email.');
  const cat = CAT_LABEL[b.category] ? b.category : null;
  db.prepare('INSERT INTO sellers (shop_name,owner_name,email,phone,category,about,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(shop, owner, email, str(b.phone, 25) || null, cat, str(b.about, 1000) || null, now());
  res.status(201).json({ ok: true });
});
app.post('/api/app-waitlist', limit(10, 600000), (req, res) => {
  const contact = str(req.body.contact, 120);
  const platform = ['ios', 'android', 'both'].includes(req.body.platform) ? req.body.platform : 'both';
  if (!EMAIL.test(contact) && !/^\+?[0-9\s\-()]{7,20}$/.test(contact)) throw new HttpError(400, 'Enter a valid email address or phone number.');
  db.prepare('INSERT INTO app_waitlist (contact,platform,created_at) VALUES (?,?,?)').run(contact, platform, now());
  res.status(201).json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// eslint-disable-next-line no-unused-vars
app.use((e, req, res, next) => {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (e.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  console.error(e);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

function start() {
  setInterval(() => { try { sweepPending(); } catch (e) { console.error(e); } }, 60000).unref();
  return app.listen(PORT, () => {
    console.log(`Prevoir is running at http://localhost:${PORT}`);
    console.log(ONLINE_ENABLED ? `Online payments: ON (${SSL_LIVE ? 'LIVE' : 'sandbox'})` : 'Online payments: off (set SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD and PUBLIC_URL to turn on)');
    if (ADMIN_KEY_GENERATED) console.log(`Admin key for this run (set ADMIN_KEY to keep it): ${ADMIN_KEY}`);
  });
}
if (require.main === module) start();

module.exports = { app, ADMIN_KEY, sweepPending, start };
