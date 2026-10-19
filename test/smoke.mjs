// End-to-end API smoke test. Run with: npm test
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.DB_PATH = ':memory:';
process.env.ADMIN_KEY = 'test-admin-key';
const require = createRequire(import.meta.url);
const { app } = require('../server.js');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'X-Prevoir': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
}

let passed = 0;
const ok = (name) => { passed++; console.log('  ok  ' + name); };

try {
  const a = client();

  // catalogue
  let r = await a('GET', '/api/products?limit=50');
  assert.equal(r.status, 200); assert.equal(r.data.total, 25); ok('lists 25 products');
  r = await a('GET', '/api/products?q=headphone');
  assert.ok(r.data.items.length >= 1 && r.data.items.every((p) => /headphone/i.test(p.name))); ok('search works');
  r = await a('GET', '/api/products?q=earbuds');
  assert.ok(r.data.items.some((p) => p.id === 17)); ok('search finds plural/singular');
  r = await a('GET', '/api/products?cat=Beauty');
  assert.deepEqual(r.data.items.map((p) => p.cat), ['Beauty']); ok('category filter works');
  r = await a('GET', '/api/products?tab=cheap&limit=50');
  assert.ok(r.data.items.every((p) => p.price < 2500)); ok('under ৳2,500 tab works');
  r = await a('GET', '/api/products?tab=top&limit=3');
  assert.ok(r.data.items[0].sold >= r.data.items[1].sold); ok('top sellers sorted');
  r = await a('GET', '/api/flash');
  assert.equal(r.data.items.length, 10); assert.ok(r.data.endsAt > r.data.now); ok('flash deals + timer');
  r = await a('GET', '/api/products/1');
  assert.ok(r.data.description && r.data.reviews.length >= 3); ok('product detail with reviews');
  r = await a('GET', '/api/products/9999');
  assert.equal(r.status, 404); ok('unknown product is 404');

  // CSRF header
  const raw = await fetch(base + '/api/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"productId":1}' });
  assert.equal(raw.status, 403); ok('requests without X-Prevoir header are blocked');

  // guest cart + voucher
  r = await a('POST', '/api/cart/items', { productId: 15, qty: 2 });
  assert.equal(r.data.count, 2); assert.equal(r.data.subtotal, 1880); ok('guest can add to cart');
  r = await a('POST', '/api/cart/items', { productId: 3, qty: 1 });
  assert.equal(r.data.count, 3); ok('cart accumulates');
  r = await a('POST', '/api/cart/voucher', { code: 'nope' });
  assert.equal(r.status, 400); ok('bad voucher rejected');
  r = await a('POST', '/api/cart/voucher', { code: 'glow15' });
  assert.equal(r.data.voucher.code, 'GLOW15'); assert.equal(r.data.discount, 282); ok('GLOW15 discounts Beauty items only (15% of ৳1,880)');
  r = await a('PATCH', '/api/cart/items/15', { qty: 0 });
  assert.equal(r.data.voucher, null); assert.ok(r.data.voucherError); ok('voucher becomes invalid when Beauty item removed');
  r = await a('POST', '/api/cart/items', { productId: 15, qty: 1 });
  assert.equal(r.data.voucher.code, 'GLOW15'); ok('voucher re-applies when item returns');
  r = await a('POST', '/api/cart/items', { productId: 1, qty: 500 });
  assert.equal(r.status, 400); ok('absurd quantity rejected');

  // wishlist as guest
  r = await a('PUT', '/api/wishlist/4');
  assert.deepEqual(r.data.wishlist, [4]); ok('guest wishlist add');

  // accounts
  r = await a('POST', '/api/auth/register', { name: 'A', email: 'bad', password: 'short' });
  assert.equal(r.status, 400); ok('registration validates input');
  r = await a('POST', '/api/auth/register', { name: 'Test Buyer', email: 'buyer@example.com', password: 'correct horse' });
  assert.equal(r.status, 201); assert.equal(r.data.user.email, 'buyer@example.com'); ok('register');
  r = await a('GET', '/api/me');
  assert.equal(r.data.user.name, 'Test Buyer'); assert.deepEqual(r.data.wishlist, [4]); ok('guest wishlist merged into account');
  r = await a('GET', '/api/cart');
  assert.equal(r.data.count, 2); assert.equal(r.data.voucher.code, 'GLOW15'); ok('guest cart + voucher carried into account');
  r = await client()('POST', '/api/auth/register', { name: 'Dup', email: 'BUYER@example.com', password: 'correct horse' });
  assert.equal(r.status, 409); ok('duplicate email rejected');
  r = await a('POST', '/api/auth/logout', {});
  assert.equal(r.status, 200);
  r = await a('GET', '/api/me');
  assert.equal(r.data.user, null); ok('logout');
  r = await a('POST', '/api/auth/login', { email: 'buyer@example.com', password: 'wrong password' });
  assert.equal(r.status, 401); ok('wrong password rejected');
  r = await a('POST', '/api/auth/login', { email: 'buyer@example.com', password: 'correct horse' });
  assert.equal(r.status, 200); ok('login');
  r = await a('GET', '/api/cart');
  assert.equal(r.data.count, 2); ok('cart persists across logout and login');

  // checkout
  const before = (await a('GET', '/api/products/1')).data.stock;
  await a('POST', '/api/cart/items', { productId: 1, qty: 2 });
  r = await a('POST', '/api/cart/voucher', { code: 'GLOW15' }); // vouchers live in the session, so re-apply after sign in
  assert.equal(r.data.voucher.code, 'GLOW15');
  r = await a('POST', '/api/orders', { name: 'Test Buyer', email: 'buyer@example.com', phone: '12', address: '1 Main St', city: 'Town', postcode: '1000', payment: 'cod' });
  assert.equal(r.status, 400); ok('checkout validates phone');
  r = await a('POST', '/api/orders', { name: 'Test Buyer', email: 'buyer@example.com', phone: '+1 555 0100', address: '1 Main St', city: 'Town', postcode: '1000', payment: 'card' });
  assert.equal(r.status, 400); ok('unsupported payment rejected');
  r = await a('POST', '/api/orders', { name: 'Test Buyer', email: 'buyer@example.com', phone: '+1 555 0100', address: '1 Main St', city: 'Town', postcode: '1000', payment: 'bank' });
  assert.equal(r.status, 201);
  const order = r.data.order;
  assert.match(order.number, /^PV-\d{8}-[0-9A-F]{6}$/);
  assert.equal(order.status, 'placed'); assert.ok(order.paymentNote.includes(order.number)); ok('order placed (bank transfer note includes order number)');
  assert.equal(order.subtotal, 12070); // 2 x 4790 + 1550 + 940
  assert.equal(order.discount, 141); assert.equal(order.shipping, 0); // 15% of the 940 Beauty item
  assert.equal(order.total, 11929); ok('totals: GLOW15 on the Beauty item only, free shipping over ৳3,000');
  r = await a('GET', '/api/cart');
  assert.equal(r.data.count, 0); assert.equal(r.data.voucher, null); ok('cart and voucher cleared after order');
  r = await a('GET', '/api/products/1');
  assert.equal(r.data.stock, before - 2); ok('stock decremented');

  // orders list, tracking, cancel
  r = await a('GET', '/api/orders');
  assert.equal(r.data.orders.length, 1); ok('my orders lists the order');
  r = await client()('GET', `/api/orders/track?number=${order.number}&email=other@example.com`);
  assert.equal(r.status, 404); ok('tracking needs the matching email');
  r = await client()('GET', `/api/orders/track?number=${order.number.toLowerCase()}&email=Buyer@Example.com`);
  assert.equal(r.status, 200); assert.equal(r.data.order.number, order.number); ok('guest tracking by number + email');
  const guest = client();
  r = await guest('POST', '/api/orders/cancel', { number: order.number, email: 'buyer@example.com' });
  assert.equal(r.data.order.status, 'cancelled'); ok('cancel order');
  r = await a('GET', '/api/products/1');
  assert.equal(r.data.stock, before); ok('stock restored on cancel');
  r = await guest('POST', '/api/orders/cancel', { number: order.number, email: 'buyer@example.com' });
  assert.equal(r.status, 409); ok('cannot cancel twice');

  // first-order-only voucher
  await a('POST', '/api/cart/items', { productId: 4 });
  r = await a('POST', '/api/cart/voucher', { code: 'WELCOME10' });
  assert.equal(r.status, 200); ok('WELCOME10 works before a first order is kept');
  await a('DELETE', '/api/cart/voucher');
  r = await a('POST', '/api/cart/voucher', { code: 'FREESHIP' });
  assert.equal(r.data.voucher.code, 'FREESHIP'); ok('FREESHIP accepted');
  await a('DELETE', '/api/cart');
  r = await a('POST', '/api/cart/items', { productId: 15 });
  assert.equal(r.data.shipping, 0); assert.equal(r.data.subtotal, 940); ok('FREESHIP makes shipping free');

  // stock limits
  const low = client();
  r = await low('GET', '/api/products/24');
  const stock = r.data.stock;
  r = await low('POST', '/api/cart/items', { productId: 24, qty: 99 });
  assert.equal(r.data.items[0].qty, stock); assert.ok(r.data.notice); ok('cart caps at available stock');
  r = await low('POST', '/api/cart/items', { productId: 24, qty: 1 });
  assert.equal(r.status, 409); ok('cannot exceed stock');

  // reviews
  const rv = client();
  r = await rv('POST', '/api/products/2/reviews', { rating: 5, body: 'Lovely watch, great strap.' });
  assert.equal(r.status, 401); ok('reviews require sign in');
  await rv('POST', '/api/auth/register', { name: 'Reviewer', email: 'rev@example.com', password: 'review-pass-1' });
  r = await rv('POST', '/api/products/2/reviews', { rating: 5, body: 'Lovely watch, great strap.' });
  assert.equal(r.status, 201);
  r = await rv('POST', '/api/products/2/reviews', { rating: 4, body: 'Second review attempt.' });
  assert.equal(r.status, 409); ok('one review per product per user');
  r = await rv('GET', '/api/products/2');
  assert.equal(r.data.reviews[0].author, 'Reviewer'); assert.equal(r.data.rev, 885); ok('review saved and rating updated');

  // content, support, sellers, waitlist
  r = await a('GET', '/api/pages/help');
  assert.ok(r.data.faq.length > 3); ok('help page content');
  for (const slug of ['how-to-buy', 'returns', 'payments', 'our-story', 'careers', 'press', 'seller-blog', 'privacy', 'terms', 'cookies']) {
    r = await a('GET', '/api/pages/' + slug);
    assert.equal(r.status, 200, slug);
  }
  ok('all footer pages exist');
  r = await a('GET', '/api/pages/__proto__');
  assert.equal(r.status, 404); ok('page lookup is safe');
  r = await a('POST', '/api/support', { name: 'Sam', email: 'sam@example.com', topic: 'Order', message: 'Where is my parcel please?' });
  assert.equal(r.status, 201); ok('support ticket saved');
  r = await a('POST', '/api/sellers', { shopName: 'Lotus Shop', ownerName: 'Lia', email: 'lia@example.com', category: 'Home', about: 'Handmade lamps' });
  assert.equal(r.status, 201);
  r = await a('POST', '/api/sellers', { shopName: 'Lotus Shop', ownerName: 'Lia', email: 'lia@example.com' });
  assert.equal(r.status, 409); ok('seller application saved, duplicates blocked');
  r = await a('POST', '/api/app-waitlist', { contact: 'me@example.com', platform: 'ios' });
  assert.equal(r.status, 201);
  r = await a('POST', '/api/app-waitlist', { contact: 'nonsense', platform: 'ios' });
  assert.equal(r.status, 400); ok('app waitlist validates contact');

  // admin
  r = await a('GET', '/api/admin/summary');
  assert.equal(r.status, 401); ok('admin routes need the key');
  r = await a('GET', '/api/admin/summary', undefined, { 'x-admin-key': 'test-admin-key' });
  assert.equal(r.data.orders, 1); assert.equal(r.data.sellersPending, 1); assert.equal(r.data.tickets, 1); ok('admin summary');
  await a('POST', '/api/cart/items', { productId: 3, qty: 9 });
  r = await a('POST', '/api/orders', { name: 'Test Buyer', email: 'buyer@example.com', phone: '+1 555 0100', address: '1 Main St', city: 'Town', postcode: '1000', payment: 'cod' });
  assert.equal(r.status, 201);
  const n2 = r.data.order.number;
  r = await a('PATCH', `/api/admin/orders/${n2}`, { status: 'shipped' }, { 'x-admin-key': 'test-admin-key' });
  assert.equal(r.data.order.status, 'shipped'); ok('admin updates order status');
  r = await a('POST', '/api/orders/cancel', { number: n2 });
  assert.equal(r.status, 409); ok('shipped orders cannot be cancelled by the customer');

  // static + 404
  const home = await fetch(base + '/');
  assert.equal(home.status, 200); assert.match(home.headers.get('content-security-policy'), /script-src 'self'/); ok('storefront served with CSP');
  r = await a('GET', '/api/nope');
  assert.equal(r.status, 404); ok('unknown API route is a JSON 404');

  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  process.exitCode = 1;
} finally {
  server.close();
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}
