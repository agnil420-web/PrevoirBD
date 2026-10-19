// Simulated-browser test: loads the real page in jsdom against the real server and clicks through the main flows. Run with: npm run test:ui
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import pkg from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = pkg;

process.env.DB_PATH = ':memory:';
process.env.ADMIN_KEY = 'k';
const require = createRequire(import.meta.url);
const { app } = require('../server.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
let HOVER = false;
const jsErrors = [];

const interceptors = [requestInterceptor((request) => {
  if (!request.url.startsWith(base)) return new Response('', { headers: { 'Content-Type': 'text/css' } }); // block fonts etc.
})];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) jsErrors.push(e.message); });
vc.on('error', (m) => jsErrors.push(String(m)));

const dom = await JSDOM.fromURL(base + '/', {
  runScripts: 'dangerously', resources: { interceptors }, pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.fetch = async (u, o = {}) => {
      const res = await fetch(new URL(u, base), { ...o, headers: { ...(o.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } });
      const set = res.headers.getSetCookie();
      if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
      return res;
    };
    w.matchMedia = (q) => ({ get matches() { return HOVER && /hover/.test(q); }, media: q, addEventListener() {}, removeEventListener() {} });
    w.Element.prototype.scrollIntoView = function () {};
  }
});
const { window } = dom;
const { document } = window;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 4000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch (e) { /* retry */ } await sleep(25); }
  throw new Error('timed out waiting for: ' + what);
}
const click = (el) => { assert.ok(el, 'click target missing'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
function setVal(form, name, value) { const el = $(`[name="${name}"]`, form); assert.ok(el, 'no field ' + name); el.value = value; }
const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const modalTitle = () => ($('.modal > header h2') || {}).textContent;
const closeModal = () => { const x = $('.modal [data-close]'); if (x) click(x); };
let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };

try {
  // ---- initial load
  await waitFor(() => $$('#grid .card').length === 12, '12 feed cards');
  ok('feed shows 12 products from the API');
  assert.equal($$('#deals .card').length, 10); ok('10 flash deals rendered');
  await waitFor(() => $$('#cats .cat').length === 16, '16 categories'); ok('16 category tiles');
  assert.match($('#th').textContent + $('#tm').textContent + $('#ts').textContent, /^\d{6}$/); ok('flash countdown shows time');
  assert.equal($$('.slide').length, 3); assert.ok($('.slide .w')); ok('hero slides with animated words');
  click($$('#dots button')[1]); assert.ok($$('.slide')[1].classList.contains('on')); ok('slider dot switches slide');
  click($('#next')); assert.ok($$('.slide')[2].classList.contains('on')); ok('slider arrow works');

  // ---- show more
  click($('#more')); await waitFor(() => $$('#grid .card').length === 24, '24 cards'); ok('Show more loads next page');
  click($('#more')); await waitFor(() => $$('#grid .card').length === 25 && $('#more').hidden, '25 cards'); ok('last page hides Show more');

  // ---- tabs
  click($('#tabs [data-tab="cheap"]')); await waitFor(() => $$('#grid .card').every((c) => parseFloat($('.price b', c).textContent.replace(/[^0-9.]/g, '')) < 2500) && $$('#grid .card').length > 3, 'cheap tab');
  ok('Under ৳2,500 tab');
  click($('#tabs [data-tab="new"]')); await waitFor(() => $$('#grid .card').length === 6, 'new tab (6)'); ok('New arrivals tab');
  click($('#tabs [data-tab="top"]')); await waitFor(() => $$('#grid .card').length === 12, 'top tab'); ok('Top sellers tab');
  click($('#tabs [data-tab="you"]'));

  // ---- category + search + hints
  click($('#cats [data-cat="Beauty"]')); await waitFor(() => $$('#grid .card').length === 1 && !$('#status').hidden, 'beauty filter'); ok('category tile filters the feed');
  click($('#clear')); await waitFor(() => $$('#grid .card').length === 12 && $('#status').hidden, 'cleared'); ok('Clear all resets filters');
  $('#q').value = 'lamp'; submit($('#searchForm'));
  await waitFor(() => $$('#grid .card').length === 1, 'lamp search'); ok('search form queries the API');
  click($('.hint [data-hint="Yoga mat"]')); await waitFor(() => $$('#grid .card').length === 1 && $('#q').value === 'Yoga mat', 'hint search'); ok('search hints work');
  click($('.promo[data-cat="Kitchen"]')); await waitFor(() => $$('#grid .card').length === 3, 'promo tile kitchen (3)'); ok('promo tile filters by category');
  click($('#allCats')); await waitFor(() => $$('#grid .card').length === 12, 'all products'); ok('View all products');
  $('#q').value = 'zzzz'; submit($('#searchForm')); await waitFor(() => $('#grid .empty'), 'empty state'); ok('empty search shows a message');
  click($('#clear')); await waitFor(() => $$('#grid .card').length === 12, 'reset');

  // ---- cart
  click($('#grid [data-add="3"]')); await waitFor(() => !$('#badge').hidden && $('#badge').textContent === '1', 'cart badge 1'); ok('Add to cart updates badge');
  click($('#deals [data-add="15"]')); await waitFor(() => $('#badge').textContent === '2', 'badge 2');
  click($('#openCart')); assert.ok(!$('#drawer').hidden);
  await waitFor(() => $$('#lines .line').length === 2, '2 cart lines'); ok('cart drawer lists items');
  click($('[data-q="1"][data-id="15"]')); await waitFor(() => $('#badge').textContent === '3', 'qty +1'); ok('quantity + works');
  click($('[data-q="-1"][data-id="15"]')); await waitFor(() => $('#badge').textContent === '2', 'qty -1'); ok('quantity - works');
  $('#vcode').value = 'bogus'; submit($('#vform')); await waitFor(() => $('#vmsg .bad'), 'bad voucher msg'); ok('invalid voucher shows an error');
  $('#vcode').value = 'glow15'; submit($('#vform')); await waitFor(() => !$('#discRow').hidden, 'discount row'); ok('GLOW15 applies a discount');
  assert.equal($('#disc').textContent, '−৳141'); assert.equal($('#ship').textContent, '৳80');
  assert.match($('#note').textContent, /more for free shipping/); ok('shipping ৳80 + free-shipping nudge under ৳3,000');
  click($('[data-vrm]')); await waitFor(() => $('#discRow').hidden, 'voucher removed'); ok('Remove voucher works');
  click($('[data-rm="3"]')); await waitFor(() => $$('#lines .line').length === 1, 'removed'); ok('Remove item works');
  click($('#closeCart')); assert.ok($('#drawer').hidden); ok('cart closes');

  // ---- hearts + saved
  click($('#grid [data-heart="4"]')); await waitFor(() => $('#wbadge') && !$('#wbadge').hidden, 'wish badge'); ok('heart saves a product');
  click($('[data-open="saved"]')); await waitFor(() => $('#savedBox .svrow'), 'saved row'); assert.equal(modalTitle(), 'Saved items'); ok('Saved items modal lists it');
  click($('#savedBox [data-add]')); await waitFor(() => $('#badge').textContent === '2', 'add from saved'); ok('Add to cart from Saved items');
  click($('#savedBox [data-heart]')); await waitFor(() => $('#savedBox .empty'), 'unsaved'); ok('Remove from Saved items');
  closeModal();

  // ---- product detail + reviews
  click($('#grid .t')); await waitFor(() => $('.modal .pd'), 'product modal'); assert.equal(modalTitle(), 'Product details');
  assert.ok($$('.modal .rev').length >= 3); ok('product title opens detail with reviews');
  click($('[data-pq="1"]')); assert.equal($('#pq').textContent, '2'); ok('quantity stepper in detail');
  click($('[data-padd]')); await waitFor(() => $('#badge').textContent === '4', 'detail add x2'); ok('detail Add to cart adds chosen quantity');
  assert.ok($('[data-review-signin]')); ok('review form asks guests to sign in');
  closeModal();

  // ---- hover preview (desktop) and sheet (touch)
  HOVER = true; window.dispatchEvent(new window.Event('resize'));
  const card = $('#grid .card');
  card.querySelector('.t').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  await waitFor(() => $('#peek.show'), 'hover preview', 1500);
  assert.ok($('#peek .pk-list li') && $('#peek [data-add]') && card.classList.contains('peeking')); ok('hovering a product opens the preview');
  click($('#peek [data-add]')); await waitFor(() => $('#badge').textContent === '5', 'add from preview'); ok('Add to cart from the preview');
  document.body.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  await waitFor(() => !$('#peek.show'), 'preview hides', 1500); ok('preview closes when the pointer leaves');
  HOVER = false;
  click($('#grid [data-peek]')); await waitFor(() => $('#peek.sheet.show'), 'sheet'); ok('touch: Quick view opens a bottom sheet');
  click($('#peek .pk-x')); await waitFor(() => !$('#peek.show'), 'sheet closed'); ok('sheet closes');

  // ---- auth
  click($('#acctBtn')); await waitFor(() => $('#authForm'), 'auth modal'); ok('Sign in button opens the auth modal');
  click($('[data-authmode="up"]')); await waitFor(() => $('#authForm[data-mode="up"]'), 'register tab'); ok('can switch to Create account');
  let f = $('#authForm');
  setVal(f, 'name', 'Ui Tester'); setVal(f, 'email', 'ui@example.com'); setVal(f, 'password', 'short');
  submit(f); await waitFor(() => $('#authForm .err').textContent.length > 0, 'password error'); ok('weak password shows the server error');
  setVal($('#authForm'), 'password', 'a-good-password'); submit($('#authForm'));
  await waitFor(() => $('#acctLbl').textContent === 'Ui', 'signed in label'); ok('create account signs you in (header shows your name)');
  assert.equal($('#badge').textContent, '5'); ok('cart survives sign-in');
  click($('#acctBtn')); assert.ok(!$('#acctMenu').hidden && /ui@example.com/.test($('#acctMenu').textContent)); ok('account menu opens');

  // ---- checkout
  click($('#acctMenu [data-open="orders"]')); await waitFor(() => $('#ordBox .empty'), 'no orders'); assert.equal(modalTitle(), 'Your orders'); ok('My orders (empty state)');
  closeModal();
  click($('#openCart')); await waitFor(() => $$('#lines .line').length >= 1, 'lines'); click($('#checkout'));
  await waitFor(() => $('#checkoutForm'), 'checkout modal'); assert.equal($('#checkoutForm [name="email"]').value, 'ui@example.com'); ok('Checkout opens with your details prefilled');
  f = $('#checkoutForm');
  setVal(f, 'phone', '+1 555 0100'); setVal(f, 'address', '12 Garden Road'); setVal(f, 'city', 'Dhaka'); setVal(f, 'postcode', '1212');
  $('[name="payment"][value="bank"]', f).checked = true;
  submit(f);
  await waitFor(() => modalTitle() === 'Order placed', 'order placed');
  const num = $('.done b').textContent; assert.match(num, /^PV-\d{8}-[0-9A-F]{6}$/);
  assert.match($('.note2').textContent, /Transfer .* as the payment reference/); ok('Place order works (bank transfer shows payment instructions)');
  await waitFor(() => $('#badge').hidden, 'cart emptied'); ok('cart is emptied after the order');
  closeModal();
  click($('[data-open="orders"]', $('#acctMenu')) || $('#acctBtn'));
  if (!$('#ordBox')) { click($('#acctBtn')); click($('#acctMenu [data-open="orders"]')); }
  await waitFor(() => $$('#ordBox .ord').length === 1, 'order listed'); ok('order appears under My orders');
  click($('#ordBox [data-cancel]')); assert.ok($('#ordBox [data-cancel]').dataset.armed); ok('cancel asks for a second tap');
  click($('#ordBox [data-cancel]')); await waitFor(() => /Cancelled/.test($('#ordBox').textContent), 'cancelled'); ok('Cancel order works');
  closeModal();

  // ---- reviews as a signed-in user
  click($('#grid .t')); await waitFor(() => $('#reviewForm'), 'review form'); ok('review form shows when signed in');
  f = $('#reviewForm'); setVal(f, 'rating', '4'); setVal(f, 'body', 'Works well, arrived on time.'); submit(f);
  await waitFor(() => $$('.modal .rev')[0] && /Ui Tester/.test($$('.modal .rev')[0].textContent), 'review posted'); ok('Post review works');
  closeModal();

  // ---- sign out
  click($('#acctBtn')); click($('[data-logout]')); await waitFor(() => $('#acctLbl').textContent === 'Sign in', 'signed out'); ok('Sign out works');

  // ---- track order (guest)
  click($('footer [data-open="track"]')); await waitFor(() => $('#trackForm'), 'track modal'); ok('Track an order opens');
  f = $('#trackForm'); setVal(f, 'number', num); setVal(f, 'email', 'wrong@example.com'); submit(f);
  await waitFor(() => $('#trackForm .err').textContent.length > 0, 'track error'); ok('wrong email gives an error');
  setVal(f, 'email', 'ui@example.com'); submit(f); await waitFor(() => $('#trackOut .ord'), 'tracked'); ok('guest can track with number + email');
  closeModal();

  // ---- footer / strip / info pages
  const pages = {
    'page:help': 'Help centre', 'page:how-to-buy': 'How to buy', 'page:returns': 'Returns & refunds', 'page:payments': 'Payment methods',
    'page:our-story': 'Our story', 'page:careers': 'Careers', 'page:press': 'Press', 'page:seller-blog': 'Seller blog',
    'page:privacy': 'Privacy policy', 'page:terms': 'Terms of use', 'page:cookies': 'Cookie policy'
  };
  for (const [key, title] of Object.entries(pages)) {
    const a = $(`[data-open="${key}"]`); assert.ok(a, 'no link for ' + key);
    click(a); await waitFor(() => modalTitle() === title, 'page ' + key); closeModal();
  }
  ok('all 11 info pages open from the strip and footer links');
  click($('.strip [data-open="page:help"]')); await waitFor(() => $('#supportForm'), 'support form');
  f = $('#supportForm'); setVal(f, 'name', 'Sam'); setVal(f, 'email', 'sam@example.com'); setVal(f, 'message', 'My parcel has not arrived yet.'); submit(f);
  await waitFor(() => /Message received/.test($('.modal').textContent), 'ticket'); ok('Help centre: contact form creates a ticket');
  closeModal();
  click($('.strip [data-open="seller"]')); await waitFor(() => $('#sellerForm'), 'seller form'); ok('Sell on Prevoir opens the seller form');
  f = $('#sellerForm'); setVal(f, 'shopName', 'Lotus Shop'); setVal(f, 'ownerName', 'Lia'); setVal(f, 'email', 'lia@example.com'); submit(f);
  await waitFor(() => /Application received/.test($('.modal').textContent), 'seller done'); ok('seller application submits');
  closeModal();
  click($('.sell [data-open="seller"]')); await waitFor(() => $('#sellerForm'), 'seller form 2'); closeModal(); ok('Start selling button opens it too');
  click($('footer [data-open="app"]')); await waitFor(() => $('#appForm'), 'app form');
  setVal($('#appForm'), 'contact', 'me@example.com'); submit($('#appForm')); await waitFor(() => /on the list/.test($('.modal').textContent), 'waitlist'); ok('Get the app joins the waitlist');
  closeModal();

  // ---- keyboard
  click($('[data-open="page:help"]')); await waitFor(() => $('.modal'), 'modal'); document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!$('.modal')); ok('Escape closes modals');

  assert.deepEqual(jsErrors, [], 'script errors: ' + jsErrors.join(' | '));
  ok('no script errors in the page');
  console.log(`\n${n} UI checks passed`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  if (jsErrors.length) console.error('page errors:', jsErrors.slice(0, 5));
  console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  process.exitCode = 1;
} finally {
  window.close(); server.close(); setTimeout(() => process.exit(process.exitCode || 0), 50);
}
