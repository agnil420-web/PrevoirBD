// Online payment test against a fake SSLCommerz. Run with: npm run test:pay
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const sessions = new Map(); // val_id -> {tran_id, amount, currency, status}
let gatewayUp = true;
const gw = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (!gatewayUp) { res.statusCode = 500; return res.end('{}'); }
  if (req.method === 'POST' && u.pathname === '/gwprocess/v4/api.php') {
    let body = ''; for await (const c of req) body += c;
    const p = new URLSearchParams(body);
    gw.last = Object.fromEntries(p);
    if (p.get('store_id') !== 'teststore' || p.get('store_passwd') !== 'testpass') return res.end(JSON.stringify({ status: 'FAILED', failedreason: 'bad credentials' }));
    return res.end(JSON.stringify({ status: 'SUCCESS', GatewayPageURL: 'https://pay.example/session/' + p.get('tran_id') }));
  }
  if (u.pathname === '/validator/api/validationserverAPI.php') {
    const v = sessions.get(u.searchParams.get('val_id'));
    return res.end(JSON.stringify(v || { status: 'INVALID_TRANSACTION' }));
  }
  res.statusCode = 404; res.end('{}');
});
await new Promise((r) => gw.listen(0, r));

process.env.DB_PATH = ':memory:';
process.env.ADMIN_KEY = 'k';
process.env.SSLCOMMERZ_STORE_ID = 'teststore';
process.env.SSLCOMMERZ_STORE_PASSWORD = 'testpass';
process.env.SSLCOMMERZ_API_BASE = `http://127.0.0.1:${gw.address().port}`;
process.env.PUBLIC_URL = 'https://shop.example';
const require = createRequire(import.meta.url);
const { app, sweepPending } = require('../server.js');
const { db } = require('../db.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'X-Prevoir': '1', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie(); if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}
const postForm = (path, fields) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
const form = { name: 'Rina Akter', email: 'rina@example.com', phone: '01700000000', address: '12 Road 5', city: 'Dhaka', postcode: '1205', payment: 'online' };
const stock = (id) => db.prepare('SELECT stock FROM products WHERE id=?').get(id).stock;
let passed = 0; const ok = (n) => { passed++; console.log('  ok  ' + n); };

async function newOrder(c, qty = 1, extra = {}) {
  await c('POST', '/api/cart/items', { productId: 1, qty });
  return c('POST', '/api/orders', { ...form, ...extra });
}

const c = client();
await c('GET', '/api/me');
assert.deepEqual((await c('GET', '/api/config')).data, { onlinePayments: true }); ok('config says online payments are on');

const before = stock(1);
let r = await newOrder(c);
assert.equal(r.status, 201); const o1 = r.data.order;
assert.equal(o1.status, 'pending_payment'); assert.ok(o1.paymentUrl.startsWith('https://pay.example/session/' + o1.number + '-')); assert.equal(o1.canPay, true);
assert.equal(stock(1), before - 1); assert.equal((await c('GET', '/api/cart')).data.items.length, 0);
ok('online order is held as pending_payment, stock reserved, cart emptied, payment URL returned');
const sent = gw.last;
const expectBdt = (db.prepare('SELECT total_cents FROM orders WHERE number=?').get(o1.number).total_cents).valueOf();
assert.equal(sent.total_amount, (expectBdt / 100).toFixed(2)); assert.equal(sent.total_amount, '4790.00'); assert.equal(sent.currency, 'BDT'); assert.equal(sent.success_url, 'https://shop.example/pay/success'); assert.equal(sent.ipn_url, 'https://shop.example/pay/ipn'); assert.equal(sent.cus_phone, form.phone);
ok('gateway received BDT amount, callback URLs and customer details');
const ref1 = sent.tran_id;

assert.equal((await c('GET', `/api/orders/track?number=${o1.number}&email=${form.email}`)).data.order.status, 'pending_payment'); ok('tracking shows the order as pending payment');

// forged callbacks must not mark the order paid
let cb = await postForm('/pay/success', { val_id: 'made-up', tran_id: ref1, status: 'VALID' });
assert.equal(cb.status, 303); assert.match(cb.headers.get('location'), /^\/\?pay=failed/);
assert.equal(db.prepare('SELECT status FROM orders WHERE number=?').get(o1.number).status, 'pending_payment'); ok('forged success callback is rejected');
sessions.set('v-low', { status: 'VALID', tran_id: ref1, amount: '1.00', currency: 'BDT' });
cb = await postForm('/pay/success', { val_id: 'v-low' }); assert.match(cb.headers.get('location'), /pay=failed/);
assert.equal(db.prepare('SELECT status FROM orders WHERE number=?').get(o1.number).status, 'pending_payment'); ok('wrong amount is rejected');
sessions.set('v-cur', { status: 'VALID', tran_id: ref1, amount: sent.total_amount, currency: 'USD' });
cb = await postForm('/pay/success', { val_id: 'v-cur' }); assert.match(cb.headers.get('location'), /pay=failed/); ok('wrong currency is rejected');

// failed and cancelled returns keep the order for a retry
cb = await postForm('/pay/fail', { tran_id: ref1 }); assert.equal(cb.headers.get('location'), `/?pay=failed&order=${o1.number}`);
cb = await postForm('/pay/cancel', { tran_id: ref1 }); assert.equal(cb.headers.get('location'), `/?pay=cancelled&order=${o1.number}`);
assert.equal(db.prepare('SELECT status FROM orders WHERE number=?').get(o1.number).status, 'pending_payment'); ok('fail and cancel pages keep the order open for a retry');

r = await c('POST', '/api/orders/pay', { number: o1.number, email: form.email });
assert.equal(r.status, 200); const ref2 = gw.last.tran_id; assert.notEqual(ref2, ref1); ok('Pay now creates a fresh payment session');

sessions.set('v-ok', { status: 'VALID', tran_id: ref2, amount: gw.last.total_amount, currency: 'BDT' });
cb = await postForm('/pay/success', { val_id: 'v-ok' }); assert.equal(cb.headers.get('location'), `/?pay=ok&order=${o1.number}`);
let row = db.prepare('SELECT status,paid_at FROM orders WHERE number=?').get(o1.number);
assert.equal(row.status, 'placed'); assert.ok(row.paid_at); ok('verified payment moves the order to placed and records the time');
cb = await postForm('/pay/ipn', { val_id: 'v-ok' }); assert.equal(cb.status, 200);
assert.equal(db.prepare('SELECT status FROM orders WHERE number=?').get(o1.number).status, 'placed'); ok('IPN repeat is harmless');
r = await c('GET', `/api/orders/track?number=${o1.number}&email=${form.email}`); assert.equal(r.data.order.paid, true); assert.equal(r.data.order.canPay, false);
r = await c('POST', '/api/orders/pay', { number: o1.number, email: form.email }); assert.equal(r.status, 409); ok('paid orders cannot be paid again');

// abandoned order is released by the sweeper
const s0 = stock(1);
r = await newOrder(c, 2); const o2 = r.data.order; assert.equal(stock(1), s0 - 2);
assert.equal(sweepPending(), 0);
db.prepare('UPDATE orders SET created_at=? WHERE number=?').run(new Date(Date.now() - 31 * 60000).toISOString(), o2.number);
assert.equal(sweepPending(), 1); assert.equal(stock(1), s0); assert.equal(db.prepare('SELECT status FROM orders WHERE number=?').get(o2.number).status, 'cancelled'); ok('unpaid order expires after 30 minutes and stock returns');

// payment that arrives after expiry is flagged, not lost
const ref3 = db.prepare('SELECT gateway_ref FROM orders WHERE number=?').get(o2.number).gateway_ref; const amt3 = gw.last.total_amount;
sessions.set('v-late', { status: 'VALID', tran_id: ref3, amount: amt3, currency: 'BDT' });
cb = await postForm('/pay/success', { val_id: 'v-late' }); assert.match(cb.headers.get('location'), /pay=late/);
row = db.prepare('SELECT status,paid_at FROM orders WHERE number=?').get(o2.number); assert.equal(row.status, 'cancelled'); assert.ok(row.paid_at);
const adm = await fetch(base + '/api/admin/orders', { headers: { 'x-admin-key': 'k' } }).then((x) => x.json());
assert.equal(adm.orders.find((o) => o.number === o2.number).paid, true); ok('late payment is recorded so admin can refund it');

// customer cancels a pending order
r = await newOrder(c); const o3 = r.data.order; const s3 = stock(1);
r = await c('POST', '/api/orders/cancel', { number: o3.number, email: form.email }); assert.equal(r.status, 200); assert.equal(stock(1), s3 + 1); ok('customer can cancel an unpaid order');

// gateway down: nothing charged, stock and cart restored
gatewayUp = false; const s4 = stock(1);
r = await newOrder(c, 1); assert.equal(r.status, 502); assert.match(r.data.error, /Nothing was charged/);
assert.equal(stock(1), s4); assert.equal((await c('GET', '/api/cart')).data.items.length, 1); ok('gateway outage cancels the order and gives the cart back');
gatewayUp = true;

// admin revenue ignores unpaid orders
const sum = await fetch(base + '/api/admin/summary', { headers: { 'x-admin-key': 'k' } }).then((x) => x.json());
const paidRows = db.prepare("SELECT COALESCE(SUM(total_cents),0) n FROM orders WHERE status NOT IN ('cancelled','pending_payment')").get().n / 100;
assert.equal(sum.revenue, paidRows); ok('admin revenue excludes unpaid and cancelled orders');

console.log(`\n${passed} payment checks passed`);
server.close(); gw.close(); process.exit(0);
