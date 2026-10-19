/* Prevoir storefront. Talks to the JSON API under /api. No build step, no dependencies. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var ICONS = {
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    audio: '<path d="M4 14v-2a8 8 0 0116 0v2M4 14h3v5H4zM17 14h3v5h-3z"/>',
    shirt: '<path d="M8 4L3 7l2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 01-8 0z"/>',
    bag: '<path d="M6 8h12l1 12H5zM9 8V6a3 3 0 016 0v2"/>',
    shoe: '<path d="M3 15c0-3 2-4 4-4l3 2 4 1c3 0 6 1 6 4v1H3z"/>',
    watch: '<circle cx="12" cy="12" r="5"/><path d="M9 7l1-4h4l1 4M9 17l1 4h4l1-4M12 10v2l1.5 1"/>',
    lamp: '<path d="M8 4h8l3 9H5zM12 13v6M8 20h8"/>',
    mug: '<path d="M5 7h11v8a4 4 0 01-4 4H9a4 4 0 01-4-4zM16 9h2a2 2 0 010 5h-2"/>',
    plant: '<path d="M12 21v-8M12 13c-4 0-6-3-6-6 4 0 6 2 6 6zM12 15c3 0 5-2 5-5-3 0-5 1.5-5 5zM8 21h8"/>',
    camera: '<path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13" r="3"/>',
    game: '<path d="M6 9h12a3 3 0 013 3v3a2 2 0 01-3.5 1.3L16 15H8l-1.5 1.3A2 2 0 013 15v-3a3 3 0 013-3zM8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="12" r=".6"/><circle cx="17.5" cy="12" r=".6"/>',
    book: '<path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2zM5 18a2 2 0 012-2h12"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/>',
    beauty: '<path d="M9 21v-8h6v8zM10 13V8l4-4v9"/>',
    tools: '<path d="M14 6a4 4 0 00-5 5L3 17l4 4 6-6a4 4 0 005-5l-3 2-2-2z"/>'
  };
  var TILE = { a: '--tile-a', b: '--tile-b', c: '--tile-c', d: '--tile-d', e: '--tile-e', f: '--tile-f' };
  var INK = { a: '--ink-a', b: '--ink-b', c: '--ink-c', d: '--ink-d', e: '--ink-e', f: '--ink-f' };
  function ts(t) { return 'background:var(' + TILE[t] + ');color:var(' + INK[t] + ')'; }
  var HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.600-7 10-7 10z"/></svg>';
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function svg(name, cls) {
    return '<svg ' + (cls ? 'class="' + cls + '" ' : '') + 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.gift) + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function money(n) { n = Number(n); return '৳' + n.toLocaleString('en-US', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
  function pct(p) { return Math.round((1 - p.price / p.old) * 100); }
  function kfmt(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(n); }
  function stars(n) { var r = Math.round(n); return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); }
  function fdate(iso) { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  function noop() {}

  var toastTimer;
  function toast(m) {
    var t = $('#toast');
    t.textContent = m;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  // ---------- API ----------
  function api(method, url, body) {
    var opt = { method: method, credentials: 'same-origin', headers: { 'X-Prevoir': '1' } };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
        return d;
      });
    }, function () { throw new Error('Cannot reach the server. Check your connection and try again.'); });
  }
  function fail(e) { toast(e && e.message ? e.message : 'Something went wrong. Please try again.'); }

  // ---------- state ----------
  var me = { user: null };
  var wish = {};
  var cart = { items: [], count: 0, subtotal: 0, discount: 0, shipping: 0, total: 0, freeShipGap: 0, voucher: null, voucherError: null };
  var PC = {};
  var cats = [];
  var flash = { items: [], endsAt: 0, now: 0 };
  var tOff = 0;
  var state = { tab: 'you', cat: null, q: '', total: 0, items: [], error: null, loading: true };

  function keep(list) { list.forEach(function (p) { PC[p.id] = p; }); }
  function setWish(ids) { wish = {}; ids.forEach(function (id) { wish[id] = true; }); syncHearts(); }

  // ---------- loaders ----------
  function loadMe() {
    return api('GET', '/api/me').then(function (d) { me.user = d.user; setWish(d.wishlist); renderAcct(); });
  }
  function loadCart() { return api('GET', '/api/cart').then(setCart); }
  function setCart(c) { cart = c; renderCart(); }
  function loadCats() {
    return api('GET', '/api/categories').then(function (d) {
      cats = d.categories;
      $('#cats').innerHTML = cats.map(function (c) {
        return '<button class="cat" data-cat="' + esc(c.key) + '"><span class="ic" style="' + ts(c.tile) + '">' + svg(c.icon) + '</span><span>' + esc(c.label) + '</span></button>';
      }).join('');
      markCats();
    });
  }
  function loadFlash() {
    return api('GET', '/api/flash').then(function (d) {
      flash = d; tOff = d.now - Date.now(); keep(d.items); renderFlash(); tick();
    });
  }
  var feedSeq = 0;
  function loadFeed(append) {
    var seq = ++feedSeq;
    var off = append ? state.items.length : 0;
    var qs = 'tab=' + encodeURIComponent(state.tab) + '&limit=12&offset=' + off +
      (state.cat ? '&cat=' + encodeURIComponent(state.cat) : '') + (state.q ? '&q=' + encodeURIComponent(state.q) : '');
    if (!append) { state.loading = true; renderFeed(); }
    return api('GET', '/api/products?' + qs).then(function (d) {
      if (seq !== feedSeq) return;
      keep(d.items);
      state.items = append ? state.items.concat(d.items) : d.items;
      state.total = d.total; state.error = null; state.loading = false;
      renderFeed();
    }, function (e) {
      if (seq !== feedSeq) return;
      state.error = e.message; state.loading = false; renderFeed();
    });
  }

  // ---------- product cards ----------
  function cardHTML(p, flashMode) {
    var out = p.stock < 1;
    return '<article class="card' + (out ? ' soldout' : '') + '" data-id="' + p.id + '">' +
      '<div class="thumb" style="' + ts(p.tile) + '">' + svg(p.icon, 'g') +
      '<span class="off">-' + pct(p) + '%</span>' +
      '<button class="qv" data-peek="' + p.id + '">Quick view</button>' +
      '<button class="heart' + (wish[p.id] ? ' on' : '') + '" data-heart="' + p.id + '" aria-label="Save to wishlist">' + HEART + '</button>' +
      (out ? '<span class="so">Sold out</span>' : '') + '</div>' +
      '<div class="info"><a class="t" href="#" data-detail="' + p.id + '">' + esc(p.name) + '</a>' +
      '<div class="price"><b class="num">' + money(p.price) + '</b><s class="num">' + money(p.old) + '</s></div>' +
      (flashMode
        ? '<div class="bar" title="Claimed so far"><i style="width:' + (p.claimed == null ? 50 : p.claimed) + '%"></i><span>' + (p.claimed == null ? 50 : p.claimed) + '% claimed</span></div>'
        : '<div class="meta"><span><span class="star">★ ' + p.rating.toFixed(1) + '</span> (' + kfmt(p.rev) + ')</span><span class="num">' + kfmt(p.sold) + ' sold</span></div>' +
          '<div class="tags">' + (p.free ? '<span class="tag ship">Free shipping</span>' : '') + (p.isNew ? '<span class="tag">New</span>' : '') + '</div>') +
      (out ? '<button class="add" disabled>Sold out</button>' : '<button class="add" data-add="' + p.id + '">Add to cart</button>') +
      '</div></article>';
  }

  function renderFlash() {
    $('#deals').innerHTML = flash.items.length
      ? flash.items.map(function (p) { return cardHTML(p, true); }).join('')
      : '<div class="empty">No flash deals are running right now. Check back soon.</div>';
  }

  function markCats() {
    $$('.cat').forEach(function (b) { b.classList.toggle('on', b.dataset.cat === state.cat); });
    $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === state.tab); });
  }
  function renderFeed() {
    var grid = $('#grid');
    if (state.loading && !state.items.length) {
      grid.innerHTML = '<div class="empty">Loading products…</div>';
      $('#more').hidden = true;
    } else if (state.error) {
      grid.innerHTML = '<div class="empty"><b>We could not load products.</b><br>' + esc(state.error) +
        (location.protocol === 'file:' ? '<br>This page needs the Prevoir server. Run <code>npm start</code> and open http://localhost:3000.' : '') +
        '<br><button class="btn" data-retry style="margin-top:12px">Try again</button></div>';
      $('#more').hidden = true;
    } else {
      grid.innerHTML = state.items.length
        ? state.items.map(function (p) { return cardHTML(p, false); }).join('')
        : '<div class="empty"><b>No products match</b><br>Try a shorter search or clear the filters.</div>';
      $('#more').hidden = state.items.length >= state.total;
    }
    var chips = [];
    if (state.q) chips.push('Search: “' + esc(state.q) + '”');
    if (state.cat) {
      var c = cats.filter(function (x) { return x.key === state.cat; })[0];
      chips.push('Category: ' + esc(c ? c.label : state.cat));
    }
    var st = $('#status');
    if (chips.length && !state.error) {
      st.hidden = false;
      st.innerHTML = '<span class="num">' + state.total + ' result' + (state.total === 1 ? '' : 's') + '</span>' +
        chips.map(function (x) { return '<span class="chip">' + x + '</span>'; }).join('') +
        '<button class="chip" id="clear" style="padding:5px 13px">Clear all</button>';
    } else st.hidden = true;
    markCats();
  }
  function goFeed() {
    $('#feed').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  // ---------- wishlist ----------
  function syncHearts() {
    $$('[data-heart]').forEach(function (h) { h.classList.toggle('on', !!wish[+h.dataset.heart]); });
    var n = Object.keys(wish).length;
    var b = $('#wbadge');
    if (b) { b.hidden = !n; b.textContent = n; }
  }
  function toggleWish(id) {
    var on = !wish[id];
    api(on ? 'PUT' : 'DELETE', '/api/wishlist/' + id).then(function (d) {
      setWish(d.wishlist);
      toast(on ? 'Saved to your wishlist' : 'Removed from wishlist');
      if (modalKind === 'saved') renderSaved();
    }).catch(fail);
  }

  // ---------- cart ----------
  function addToCart(id, qty) {
    return api('POST', '/api/cart/items', { productId: id, qty: qty || 1 }).then(function (c) {
      setCart(c); toast(c.notice || 'Added to cart'); return c;
    }).catch(fail);
  }
  function renderCart() {
    var items = cart.items;
    $('#lines').innerHTML = items.length ? items.map(function (it) {
      return '<div class="line"><div class="mini" style="' + ts(it.tile) + '">' + svg(it.icon) + '</div>' +
        '<div><a class="n" href="#" data-detail="' + it.id + '">' + esc(it.name) + '</a><div class="qty">' +
        '<button data-q="-1" data-id="' + it.id + '" aria-label="Decrease quantity">−</button><span class="num">' + it.qty + '</span>' +
        '<button data-q="1" data-id="' + it.id + '" aria-label="Increase quantity"' + (it.qty >= it.stock ? ' disabled' : '') + '>+</button></div></div>' +
        '<div style="text-align:right"><div class="p num">' + money(it.price * it.qty) + '</div><button class="rm" data-rm="' + it.id + '">Remove</button></div></div>';
    }).join('') : '<div class="empty" style="margin-top:20px;border:0">Your cart is empty.<br>Add something from the deals to see it here.</div>';
    var b = $('#badge');
    b.hidden = !cart.count; b.textContent = cart.count;
    $('#sub').textContent = money(cart.subtotal);
    $('#discRow').hidden = !cart.discount;
    $('#discLbl').textContent = cart.voucher ? 'Voucher ' + cart.voucher.code : 'Discount';
    $('#disc').textContent = '−' + money(cart.discount);
    $('#ship').textContent = !items.length ? '—' : (cart.shipping ? money(cart.shipping) : 'Free');
    $('#tot').textContent = money(cart.total);
    $('#note').textContent = cart.freeShipGap ? 'Add ' + money(cart.freeShipGap) + ' more for free shipping' : '';
    var vm = $('#vmsg');
    if (cart.voucher) vm.innerHTML = '<span class="ok">' + esc(cart.voucher.code) + ': ' + esc(cart.voucher.label) + '</span> <button class="rm" data-vrm>Remove</button>';
    else if (cart.voucherError) vm.innerHTML = '<span class="bad">' + esc(cart.voucherError) + '</span> <button class="rm" data-vrm>Remove</button>';
    else vm.textContent = '';
    $('#vform').hidden = !items.length;
    $('#checkout').disabled = !items.length;
    $('#checkout').style.opacity = items.length ? 1 : 0.5;
  }
  function openCart() { $('#scrim').hidden = false; $('#drawer').hidden = false; $('#closeCart').focus(); loadCart().catch(noop); }
  function closeCart() { $('#scrim').hidden = true; $('#drawer').hidden = true; $('#openCart').focus(); }
  function cartIsOpen() { return !$('#drawer').hidden; }

  // ---------- modals ----------
  var modalEl = null, modalKind = '', lastFocus = null;
  function openModal(title, html, opts) {
    closeModal(true);
    opts = opts || {};
    lastFocus = document.activeElement;
    var scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header><h2>' + esc(title) + '</h2><button class="x" data-close aria-label="Close">×</button></header><div class="m-body">' + html + '</div></div>';
    document.body.appendChild(scrim);
    modalEl = scrim; modalKind = opts.kind || '';
    document.documentElement.style.overflow = 'hidden';
    scrim.addEventListener('mousedown', function (e) { if (e.target === scrim) closeModal(); });
    var first = $('input:not([type=hidden]),select,textarea', scrim) || $('.btn', scrim) || $('[data-close]', scrim);
    if (first) first.focus();
    return $('.m-body', scrim);
  }
  function closeModal(silent) {
    if (!modalEl) return;
    modalEl.remove(); modalEl = null; modalKind = '';
    document.documentElement.style.overflow = '';
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function mbody() { return modalEl ? $('.m-body', modalEl) : null; }
  function formObj(form) {
    var o = {};
    $$('input,select,textarea', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.type === 'password' ? el.value : el.value.trim();
    });
    return o;
  }
  function formErr(form, msg) { var e = $('.err', form); if (e) e.textContent = msg || ''; }
  function formBusy(form, on, label) {
    var b = $('button[type=submit]', form);
    if (!b) return;
    if (on) { b.dataset.l = b.textContent; b.textContent = label || 'Please wait…'; b.disabled = true; }
    else { b.textContent = b.dataset.l || b.textContent; b.disabled = false; }
  }
  function field(label, name, type, extra) {
    return '<label>' + label + '<input name="' + name + '" type="' + (type || 'text') + '" ' + (extra || '') + '></label>';
  }

  // ---------- accounts ----------
  var authAfter = null;
  function renderAcct() {
    var u = me.user;
    $('#acctLbl').textContent = u ? u.name.split(' ')[0] : 'Sign in';
    $('#acctMenu').innerHTML = u
      ? '<div class="mh">Signed in as<br><b>' + esc(u.email) + '</b></div><button role="menuitem" data-open="orders">My orders</button><button role="menuitem" data-open="saved">Saved items</button><button role="menuitem" data-logout>Sign out</button>'
      : '';
  }
  function closeAcctMenu() { $('#acctMenu').hidden = true; $('#acctBtn').setAttribute('aria-expanded', 'false'); }
  function openAuth(mode, after) {
    mode = mode || 'in';
    if (after !== undefined) authAfter = after;
    var up = mode === 'up';
    openModal(up ? 'Create your account' : 'Welcome back',
      '<div class="seg"><button data-authmode="in" class="' + (up ? '' : 'on') + '">Sign in</button><button data-authmode="up" class="' + (up ? 'on' : '') + '">Create account</button></div>' +
      '<form class="f" id="authForm" data-mode="' + mode + '" style="margin-top:16px">' +
      (up ? field('Full name', 'name', 'text', 'autocomplete="name" required maxlength="60"') : '') +
      field('Email', 'email', 'email', 'autocomplete="email" required maxlength="120"') +
      field('Password', 'password', 'password', 'autocomplete="' + (up ? 'new-password' : 'current-password') + '" required minlength="' + (up ? 8 : 1) + '" maxlength="200"') +
      (up ? '<small class="muted">At least 8 characters.</small>' : '') +
      '<div class="err" role="alert"></div><button class="btn" type="submit">' + (up ? 'Create account' : 'Sign in') + '</button></form>', { kind: 'auth' });
  }
  function submitAuth(form) {
    var up = form.dataset.mode === 'up';
    var data = formObj(form);
    formErr(form, ''); formBusy(form, true);
    api('POST', up ? '/api/auth/register' : '/api/auth/login', data).then(function (d) {
      me.user = d.user;
      return Promise.all([loadMe(), loadCart()]).then(function () {
        var after = authAfter; authAfter = null;
        closeModal(true);
        toast((up ? 'Welcome to Prevoir, ' : 'Welcome back, ') + d.user.name.split(' ')[0]);
        if (after) after();
      });
    }).catch(function (e) { formBusy(form, false); formErr(form, e.message); });
  }
  function logout() {
    api('POST', '/api/auth/logout', {}).then(function () {
      me.user = null; closeAcctMenu();
      return Promise.all([loadMe(), loadCart()]);
    }).then(function () { toast('Signed out'); }).catch(fail);
  }
  function needUser(fn) { if (me.user) fn(); else openAuth('in', fn); }

  // ---------- checkout and orders ----------
  var STEPS = ['placed', 'packed', 'shipped', 'delivered'];
  function orderHTML(o, email) {
    var idx = STEPS.indexOf(o.status);
    var steps = o.status === 'cancelled'
      ? '<div class="pill bad">Cancelled</div>' + (o.paid ? '<p class="note2">We received your payment for this order. Our team will refund it. Contact Help centre with this order number if you have not heard from us in 3 days.</p>' : '')
      : o.status === 'pending_payment'
      ? '<div class="pill">Awaiting payment</div>'
      : '<div class="steps">' + STEPS.map(function (s, i) { return '<span class="' + (i <= idx ? 'is-done' : '') + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</span>'; }).join('') + '</div>';
    return '<div class="ord"><div class="oh"><b>#' + esc(o.number) + '</b><small>' + fdate(o.createdAt) + '</small></div>' + steps +
      '<ul class="ol">' + o.items.map(function (i) { return '<li><span>' + i.qty + ' × ' + esc(i.name) + '</span><span class="num">' + money(i.price * i.qty) + '</span></li>'; }).join('') + '</ul>' +
      '<div class="orow"><span>Subtotal</span><span class="num">' + money(o.subtotal) + '</span></div>' +
      (o.discount ? '<div class="orow"><span>Voucher ' + esc(o.voucher || '') + '</span><span class="num">−' + money(o.discount) + '</span></div>' : '') +
      '<div class="orow"><span>Shipping</span><span class="num">' + (o.shipping ? money(o.shipping) : 'Free') + '</span></div>' +
      '<div class="orow t"><span>Total</span><span class="num">' + money(o.total) + '</span></div>' +
      (o.paid ? '<div class="pill ok">Paid online</div>' : '') + '<small class="muted">Deliver to ' + esc(o.shipTo.name) + ', ' + esc(o.shipTo.address) + ', ' + esc(o.shipTo.city) + ' ' + esc(o.shipTo.postcode) + '. Payment: ' + esc(o.paymentLabel) + '.</small>' +
      (o.canPay ? '<button class="btn" data-pay="' + esc(o.number) + '" data-email="' + esc(email || '') + '">Pay now</button> ' : '') +
      (o.canCancel ? '<button class="btn ghost" data-cancel="' + esc(o.number) + '" data-email="' + esc(email || '') + '">Cancel order</button>' : '') + '</div>';
  }
  function openCheckout() {
    if (!cart.items.length) { toast('Your cart is empty'); return; }
    closeCart();
    var u = me.user || {};
    var lines = cart.items.map(function (i) { return '<li><span>' + i.qty + ' × ' + esc(i.name) + '</span><span class="num">' + money(i.price * i.qty) + '</span></li>'; }).join('');
    openModal('Checkout',
      '<ul class="ol">' + lines + '</ul>' +
      '<div class="orow"><span>Subtotal</span><span class="num">' + money(cart.subtotal) + '</span></div>' +
      (cart.discount ? '<div class="orow"><span>Voucher ' + esc(cart.voucher ? cart.voucher.code : '') + '</span><span class="num">−' + money(cart.discount) + '</span></div>' : '') +
      '<div class="orow"><span>Shipping</span><span class="num">' + (cart.shipping ? money(cart.shipping) : 'Free') + '</span></div>' +
      '<div class="orow t"><span>Total</span><span class="num">' + money(cart.total) + '</span></div>' +
      '<form class="f" id="checkoutForm" style="margin-top:18px"><h3>Delivery details</h3>' +
      '<div class="two">' + field('Full name', 'name', 'text', 'required maxlength="80" autocomplete="name" value="' + esc(u.name || '') + '"') + field('Email', 'email', 'email', 'required maxlength="120" autocomplete="email" value="' + esc(u.email || '') + '"') + '</div>' +
      field('Phone', 'phone', 'tel', 'required maxlength="25" autocomplete="tel"') +
      field('Address', 'address', 'text', 'required maxlength="200" autocomplete="street-address"') +
      '<div class="two">' + field('City', 'city', 'text', 'required maxlength="60" autocomplete="address-level2"') + field('Postcode', 'postcode', 'text', 'required maxlength="12" autocomplete="postal-code"') + '</div>' +
      '<h3>Payment</h3><div class="pay">' +
      '<label class="opt"><input type="radio" name="payment" value="cod" checked><span><b>Cash on delivery</b><small>Pay the courier when your order arrives.</small></span></label>' +
      '<label class="opt"><input type="radio" name="payment" value="bank"><span><b>Bank transfer</b><small>We show the account details after you place the order.</small></span></label>' +
      (config.onlinePayments
        ? '<label class="opt"><input type="radio" name="payment" value="online"><span><b>Pay online: bKash, Nagad, Rocket, cards</b><small>You pay ' + money(cart.total) + ' on the secure SSLCommerz page. We never see your card or wallet PIN.</small></span></label>'
        : '<label class="opt dis"><input type="radio" disabled><span><b>Card or wallet</b><small>Coming soon.</small></span></label>') + '</div>' +
      '<div class="err" role="alert"></div><button class="btn" type="submit">Place order · ' + money(cart.total) + '</button></form>', { kind: 'checkout', wide: true });
  }
  function submitCheckout(form) {
    formErr(form, ''); formBusy(form, true, 'Placing order…');
    api('POST', '/api/orders', formObj(form)).then(function (d) {
      var o = d.order;
      if (o.paymentUrl) { goPay(o.paymentUrl, o.number, formObj(form).email); return; }
      openModal('Order placed',
        '<div class="done"><div class="tick">✓</div><h3>Thank you, your order is in.</h3>' +
        '<p>Your order number is <b>' + esc(o.number) + '</b>. Keep it: you can look the order up any time with Track an order.</p>' +
        (o.paymentNote ? '<p class="note2">' + esc(o.paymentNote) + '</p>' : '<p>Please have <b>' + money(o.total) + '</b> ready for the courier.</p>') + '</div>' +
        orderHTML(o, o.shipTo ? formObj(form).email : '') +
        '<div class="ctas"><button class="btn" data-close>Continue shopping</button></div>', { kind: 'done' });
      loadCart().catch(noop); loadFeed().catch(noop); loadFlash().catch(noop);
    }).catch(function (e) {
      formBusy(form, false); formErr(form, e.message);
      if (e.status === 409 || e.status === 400) loadCart().catch(noop);
    });
  }
  function openOrders() {
    openModal('Your orders', '<div id="ordBox" class="muted">Loading…</div>', { kind: 'orders', wide: true });
    renderOrders();
  }
  function renderOrders() {
    api('GET', '/api/orders').then(function (d) {
      var box = $('#ordBox'); if (!box) return;
      box.className = '';
      box.innerHTML = d.orders.length ? d.orders.map(function (o) { return orderHTML(o, me.user && me.user.email); }).join('') : '<div class="empty">You have not placed any orders yet.</div>';
    }).catch(fail);
  }
  function openTrack() {
    openModal('Track an order',
      '<form class="f" id="trackForm"><p class="muted">Enter the order number from your confirmation and the email you used at checkout.</p>' +
      field('Order number', 'number', 'text', 'required maxlength="40" placeholder="PV-20261013-A1B2C3" autocapitalize="characters"') +
      field('Email', 'email', 'email', 'required maxlength="120" value="' + esc(me.user ? me.user.email : '') + '"') +
      '<div class="err" role="alert"></div><button class="btn" type="submit">Find my order</button></form><div id="trackOut" style="margin-top:18px"></div>', { kind: 'track' });
  }
  function submitTrack(form) {
    var d = formObj(form);
    formErr(form, ''); formBusy(form, true, 'Looking…');
    api('GET', '/api/orders/track?number=' + encodeURIComponent(d.number) + '&email=' + encodeURIComponent(d.email)).then(function (r) {
      formBusy(form, false); $('#trackOut').innerHTML = orderHTML(r.order, d.email);
    }).catch(function (e) { formBusy(form, false); $('#trackOut').innerHTML = ''; formErr(form, e.message); });
  }
  var config = { onlinePayments: false };
  function loadConfig() { return api('GET', '/api/config').then(function (c) { config = c; }); }
  function stash(number, email) { try { sessionStorage.setItem('pbPay', JSON.stringify({ number: number, email: email || '' })); } catch (e) { /* storage blocked */ } }
  function goPay(url, number, email) {
    stash(number, email);
    openModal('Taking you to payment', '<div class="done"><p>Opening the secure payment page… Please do not close this window.</p></div>', { kind: 'paying' });
    window.location.assign(url);
  }
  function payOrder(btn) {
    btn.disabled = true;
    api('POST', '/api/orders/pay', { number: btn.dataset.pay, email: btn.dataset.email }).then(function (r) {
      goPay(r.paymentUrl, btn.dataset.pay, btn.dataset.email);
    }).catch(function (e) { btn.disabled = false; fail(e); });
  }
  // the payment page sends people back to /?pay=ok&order=PV-...
  function handlePayReturn() {
    var q = new URLSearchParams(location.search), state = q.get('pay'), num = q.get('order') || '';
    if (!state) return;
    history.replaceState(null, '', location.pathname);
    var saved = {}; try { saved = JSON.parse(sessionStorage.getItem('pbPay') || '{}'); } catch (e) { /* ignore */ }
    var email = saved.number === num ? saved.email : '';
    var msg = {
      ok: ['Payment received', 'Thank you. Your payment went through and your order is confirmed.'],
      late: ['Payment received late', 'Your payment arrived after the order had expired. Contact the Help centre with your order number and we will refund you.'],
      failed: ['Payment did not go through', 'Nothing was charged, or the bank has not confirmed it yet. Your order is held for 30 minutes so you can try again.'],
      cancelled: ['Payment cancelled', 'You left the payment page. Your order is held for 30 minutes so you can try again.']
    }[state] || ['Payment', 'We could not read the payment result.'];
    var render = function (o) {
      openModal(msg[0], '<div class="done"><div class="tick">' + (state === 'ok' ? '✓' : '!') + '</div><p>' + esc(msg[1]) + '</p>' + (num ? '<p>Order number <b>' + esc(num) + '</b></p>' : '') + '</div>' + (o ? orderHTML(o, email) : '') + '<div class="ctas"><button class="btn" data-close>Continue shopping</button></div>', { kind: 'done' });
    };
    if (!num) { render(null); return; }
    api('GET', '/api/orders/track?number=' + encodeURIComponent(num) + '&email=' + encodeURIComponent(email)).then(function (r) { render(r.order); }).catch(function () { render(null); });
    loadCart().catch(noop); loadFeed().catch(noop); loadFlash().catch(noop);
  }
  function cancelOrder(btn) {
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1'; btn.textContent = 'Tap again to confirm';
      setTimeout(function () { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Cancel order'; } }, 4000);
      return;
    }
    btn.disabled = true;
    api('POST', '/api/orders/cancel', { number: btn.dataset.cancel, email: btn.dataset.email }).then(function (r) {
      toast('Order cancelled');
      if (modalKind === 'orders') renderOrders();
      else if ($('#trackOut')) $('#trackOut').innerHTML = orderHTML(r.order, btn.dataset.email);
      else { var o = btn.closest('.ord'); if (o) o.outerHTML = orderHTML(r.order, btn.dataset.email); }
      loadFeed().catch(noop); loadFlash().catch(noop);
    }).catch(function (e) { btn.disabled = false; fail(e); });
  }

  // ---------- saved items ----------
  function openSaved() {
    openModal('Saved items', '<div id="savedBox" class="muted">Loading…</div>', { kind: 'saved', wide: true });
    renderSaved();
  }
  function renderSaved() {
    api('GET', '/api/wishlist').then(function (d) {
      keep(d.items);
      var box = $('#savedBox'); if (!box) return;
      box.className = '';
      box.innerHTML = d.items.length ? '<div class="sv">' + d.items.map(function (p) {
        return '<div class="svrow"><div class="mini" style="' + ts(p.tile) + '">' + svg(p.icon) + '</div>' +
          '<div><a class="n" href="#" data-detail="' + p.id + '">' + esc(p.name) + '</a><div class="price"><b class="num">' + money(p.price) + '</b><s class="num">' + money(p.old) + '</s></div></div>' +
          '<div class="svbtn">' + (p.stock < 1 ? '<button class="add" disabled>Sold out</button>' : '<button class="add" data-add="' + p.id + '">Add to cart</button>') +
          '<button class="rm" data-heart="' + p.id + '">Remove</button></div></div>';
      }).join('') + '</div>' : '<div class="empty">Nothing saved yet. Tap the heart on any product to keep it here.</div>';
    }).catch(fail);
  }

  // ---------- product details ----------
  var pd = { id: 0, qty: 1, max: 1 };
  function openProduct(id) {
    closePeek();
    api('GET', '/api/products/' + id).then(function (p) {
      keep([p]);
      var out = p.stock < 1;
      pd = { id: p.id, qty: 1, max: Math.max(1, Math.min(p.stock, 20)) };
      var html = '<div class="pd"><div class="pd-img" style="' + ts(p.tile) + '">' + svg(p.icon) + '<span class="off">-' + pct(p) + '%</span></div>' +
        '<div class="pd-info"><div class="pk-cat">' + esc(p.cat) + ' · sold by ' + esc(p.seller) + '</div><h3>' + esc(p.name) + '</h3>' +
        '<div class="price"><b class="num">' + money(p.price) + '</b><s class="num">' + money(p.old) + '</s><span class="save num">Save ' + money(p.old - p.price) + '</span></div>' +
        '<div class="meta"><span><span class="star">' + stars(p.rating) + '</span> ' + p.rating.toFixed(1) + ' (' + kfmt(p.rev) + ' reviews)</span><span class="num">' + kfmt(p.sold) + ' sold</span></div>' +
        '<p class="desc">' + esc(p.description) + '</p>' +
        '<ul class="pk-list">' + p.highlights.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>' +
        '<div class="pk-sw"><span>Colours</span>' + p.colors.map(function (c) { return '<i style="background:' + esc(c) + '"></i>'; }).join('') + '</div>' +
        '<div class="stockline ' + (out ? 'bad' : p.stock <= 10 ? 'warn' : 'ok') + '">' + (out ? 'Sold out' : p.stock <= 10 ? 'Only ' + p.stock + ' left' : 'In stock') + '</div>' +
        (out ? '<button class="add" disabled>Sold out</button>' :
          '<div class="buyrow"><div class="qty big"><button data-pq="-1" aria-label="Decrease quantity">−</button><span class="num" id="pq">1</span><button data-pq="1" aria-label="Increase quantity">+</button></div>' +
          '<button class="add" data-padd>Add to cart</button><button class="pk-heart' + (wish[p.id] ? ' on' : '') + '" data-heart="' + p.id + '" aria-label="Save to wishlist">' + HEART + '</button></div>' +
          '<button class="btn ghost" data-buynow style="width:100%">Buy now</button>') +
        '<table class="specs">' + p.specs.map(function (s) { return '<tr><th>' + esc(s[0]) + '</th><td>' + esc(s[1]) + '</td></tr>'; }).join('') + '</table></div></div>' +
        '<h3 style="margin-top:26px">Customer reviews</h3><div id="revList">' + reviewsHTML(p.reviews) + '</div>' + reviewFormHTML();
      openModal('Product details', html, { wide: true, kind: 'product' });
    }).catch(fail);
  }
  function reviewsHTML(list) {
    return list.length ? list.map(function (r) {
      return '<div class="rev"><div class="rh"><b>' + esc(r.author) + '</b><span class="star">' + stars(r.rating) + '</span><small class="muted">' + fdate(r.date) + '</small></div><p>' + esc(r.body) + '</p></div>';
    }).join('') : '<p class="muted">No reviews yet. Be the first.</p>';
  }
  function reviewFormHTML() {
    if (!me.user) return '<div class="ctas"><button class="btn ghost" data-review-signin>Sign in to write a review</button></div>';
    return '<form class="f" id="reviewForm" style="margin-top:14px"><h3>Write a review</h3>' +
      '<label>Rating<select name="rating"><option value="5">5 stars: excellent</option><option value="4">4 stars: good</option><option value="3">3 stars: okay</option><option value="2">2 stars: poor</option><option value="1">1 star: bad</option></select></label>' +
      '<label>Your review<textarea name="body" required minlength="5" maxlength="600" placeholder="What did you like or dislike?"></textarea></label>' +
      '<div class="err" role="alert"></div><button class="btn" type="submit">Post review</button></form>';
  }
  function submitReview(form) {
    var d = formObj(form);
    formErr(form, ''); formBusy(form, true, 'Posting…');
    api('POST', '/api/products/' + pd.id + '/reviews', { rating: +d.rating, body: d.body }).then(function () {
      toast('Thanks for your review'); openProduct(pd.id);
    }).catch(function (e) { formBusy(form, false); formErr(form, e.message); });
  }

  // ---------- info pages, support, seller, app ----------
  function openPage(slug) {
    api('GET', '/api/pages/' + encodeURIComponent(slug)).then(function (pg) {
      var h = (pg.intro ? '<p class="lead">' + esc(pg.intro) + '</p>' : '');
      h += (pg.sections || []).map(function (s) {
        return '<h3>' + esc(s.h) + '</h3>' + (s.p ? '<p>' + esc(s.p) + '</p>' : '') + (s.ul ? '<ul>' + s.ul.map(function (li) { return '<li>' + esc(li) + '</li>'; }).join('') + '</ul>' : '');
      }).join('');
      if (pg.faq) h += '<div class="faq">' + pg.faq.map(function (f) { return '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>'; }).join('') + '</div>';
      if (pg.cta) h += '<div class="ctas">' + pg.cta.map(function (c) { return '<a href="#" class="btn ghost" data-open="' + esc(c.open) + '">' + esc(c.label) + '</a>'; }).join('') + '</div>';
      if (pg.support) {
        var u = me.user || {};
        h += '<form class="f" id="supportForm" style="margin-top:22px"><h3>Contact support</h3>' +
          '<div class="two">' + field('Your name', 'name', 'text', 'required maxlength="80" value="' + esc(u.name || '') + '"') + field('Email', 'email', 'email', 'required maxlength="120" value="' + esc(u.email || '') + '"') + '</div>' +
          '<div class="two"><label>Topic<select name="topic"><option>Order</option><option>Delivery</option><option>Returns</option><option>Account</option><option>Seller</option><option>Other</option></select></label>' +
          field('Order number (optional)', 'orderNumber', 'text', 'maxlength="40"') + '</div>' +
          '<label>Message<textarea name="message" required minlength="10" maxlength="2000"></textarea></label>' +
          '<div class="err" role="alert"></div><button class="btn" type="submit">Send message</button></form>';
      }
      openModal(pg.title, '<div class="prose">' + h + '</div>', { kind: 'page', wide: !!pg.support });
    }).catch(fail);
  }
  function submitSupport(form) {
    formErr(form, ''); formBusy(form, true, 'Sending…');
    api('POST', '/api/support', formObj(form)).then(function (d) {
      form.outerHTML = '<div class="done"><div class="tick">✓</div><h3>Message received</h3><p>Your ticket number is <b>#' + d.ticket + '</b>.</p></div>';
    }).catch(function (e) { formBusy(form, false); formErr(form, e.message); });
  }
  function openSeller() {
    openModal('Open your shop on Prevoir',
      '<form class="f" id="sellerForm"><p class="muted">Tell us about your shop. We review every application before it goes live.</p>' +
      '<div class="two">' + field('Shop name', 'shopName', 'text', 'required maxlength="80"') + field('Your name', 'ownerName', 'text', 'required maxlength="80" value="' + esc(me.user ? me.user.name : '') + '"') + '</div>' +
      '<div class="two">' + field('Email', 'email', 'email', 'required maxlength="120" value="' + esc(me.user ? me.user.email : '') + '"') + field('Phone (optional)', 'phone', 'tel', 'maxlength="25"') + '</div>' +
      '<label>Main category<select name="category">' + cats.map(function (c) { return '<option value="' + esc(c.key) + '">' + esc(c.label) + '</option>'; }).join('') + '</select></label>' +
      '<label>What do you sell?<textarea name="about" maxlength="1000"></textarea></label>' +
      '<div class="err" role="alert"></div><button class="btn" type="submit">Submit application</button></form>', { kind: 'seller' });
  }
  function submitSeller(form) {
    formErr(form, ''); formBusy(form, true, 'Submitting…');
    api('POST', '/api/sellers', formObj(form)).then(function () {
      form.outerHTML = '<div class="done"><div class="tick">✓</div><h3>Application received</h3><p>Thank you. We will review your shop and contact you by email.</p></div>';
    }).catch(function (e) { formBusy(form, false); formErr(form, e.message); });
  }
  function openApp() {
    openModal('Get the Prevoir app',
      '<form class="f" id="appForm"><p class="muted">The Prevoir app is not released yet. Leave your email or phone number and we will tell you the day it is.</p>' +
      '<label>Platform<select name="platform"><option value="both">iPhone and Android</option><option value="ios">iPhone</option><option value="android">Android</option></select></label>' +
      field('Email or phone', 'contact', 'text', 'required maxlength="120" value="' + esc(me.user ? me.user.email : '') + '"') +
      '<div class="err" role="alert"></div><button class="btn" type="submit">Notify me</button></form>', { kind: 'app' });
  }
  function submitApp(form) {
    formErr(form, ''); formBusy(form, true, 'Saving…');
    api('POST', '/api/app-waitlist', formObj(form)).then(function () {
      form.outerHTML = '<div class="done"><div class="tick">✓</div><h3>You are on the list</h3><p>We will message you when the app launches.</p></div>';
    }).catch(function (e) { formBusy(form, false); formErr(form, e.message); });
  }
  function openByKey(k) {
    closeAcctMenu();
    if (k === 'seller') openSeller();
    else if (k === 'app') openApp();
    else if (k === 'track') openTrack();
    else if (k === 'orders') needUser(openOrders);
    else if (k === 'saved') openSaved();
    else if (k === 'auth') openAuth('in');
    else if (k.indexOf('page:') === 0) openPage(k.slice(5));
  }

  // ---------- hover preview ----------
  var peek = $('#peek'), pkScrim = $('#pkScrim');
  var canHover = matchMedia('(hover:hover) and (pointer:fine)');
  var pkOpen = null, pkT = null, pkH = null, pkCard = null;
  function pkHTML(p) {
    var out = p.stock < 1;
    var sw = p.colors.map(function (c) { return '<i style="background:' + esc(c) + '"></i>'; }).join('');
    var lp = Math.max(12, Math.min(92, 100 - p.stock * 2.4));
    return '<button class="pk-x" aria-label="Close preview">×</button>' +
      '<div class="pk-img" style="' + ts(p.tile) + '">' + svg(p.icon) + '<span class="off">-' + pct(p) + '%</span></div>' +
      '<div class="pk-body"><div class="pk-cat">' + esc(p.cat) + '</div><h3>' + esc(p.name) + '</h3>' +
      '<div class="price"><b class="num">' + money(p.price) + '</b><s class="num">' + money(p.old) + '</s><span class="save num">Save ' + money(p.old - p.price) + '</span></div>' +
      '<div class="meta"><span><span class="star">★ ' + p.rating.toFixed(1) + '</span> (' + kfmt(p.rev) + ' reviews)</span><span class="num">' + kfmt(p.sold) + ' sold</span></div>' +
      '<ul class="pk-list">' + p.highlights.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + (p.free ? '<li>Free shipping</li>' : '') + '</ul>' +
      '<div class="pk-sw"><span>Colours</span>' + sw + '</div>' +
      '<div class="bar"><i style="width:' + (out ? 0 : lp) + '%"></i><span>' + (out ? 'Sold out' : p.stock <= 30 ? 'Only ' + p.stock + ' left' : 'In stock') + '</span></div>' +
      '<div class="pk-actions">' + (out ? '<button class="add" disabled>Sold out</button>' : '<button class="add" data-add="' + p.id + '">Add to cart</button>') +
      '<button class="pk-heart' + (wish[p.id] ? ' on' : '') + '" data-heart="' + p.id + '" aria-label="Save to wishlist">' + HEART + '</button></div>' +
      '<button class="btn ghost" data-detail="' + p.id + '" style="width:100%">View full details</button></div>';
  }
  function fillPeek(card) {
    var id = +card.dataset.id;
    if (!PC[id]) return false;
    if (pkCard && pkCard !== card) pkCard.classList.remove('peeking');
    pkCard = card; pkOpen = id; card.classList.add('peeking');
    peek.innerHTML = pkHTML(PC[id]);
    return true;
  }
  function openPeek(card) {
    if (!fillPeek(card)) return;
    peek.classList.remove('sheet'); pkScrim.hidden = true;
    var r = card.getBoundingClientRect(), w = peek.offsetWidth, h = peek.offsetHeight, gap = 10;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var left = r.right + gap;
    if (left + w > vw - 8) left = r.left - gap - w;
    if (left < 8) left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    peek.style.left = left + 'px';
    peek.style.top = Math.max(8, Math.min(r.top, vh - h - 8)) + 'px';
    peek.classList.add('show');
  }
  function openSheet(card) {
    if (!fillPeek(card)) return;
    peek.classList.add('sheet'); pkScrim.hidden = false;
    requestAnimationFrame(function () { peek.classList.add('show'); });
  }
  function closePeek() {
    peek.classList.remove('show', 'sheet'); pkScrim.hidden = true;
    if (pkCard) pkCard.classList.remove('peeking');
    pkCard = null; pkOpen = null;
  }

  document.addEventListener('mouseover', function (e) {
    if (!canHover.matches || modalEl) return;
    var t = e.target;
    if (t.closest('#peek')) { clearTimeout(pkH); clearTimeout(pkT); return; }
    var c = t.closest('.card[data-id]');
    if (c) {
      clearTimeout(pkH); clearTimeout(pkT);
      if (pkOpen === +c.dataset.id) return;
      pkT = setTimeout(function () { openPeek(c); }, peek.classList.contains('show') ? 80 : 240);
      return;
    }
    clearTimeout(pkT); clearTimeout(pkH);
    pkH = setTimeout(closePeek, 160);
  });
  document.documentElement.addEventListener('mouseleave', closePeek);
  document.addEventListener('focusin', function (e) {
    if (!canHover.matches || modalEl) return;
    var c = e.target.closest && e.target.closest('.card[data-id]');
    if (c) openPeek(c);
    else if (!e.target.closest('#peek') && !peek.classList.contains('sheet')) closePeek();
  });
  window.addEventListener('scroll', function () { if (!peek.classList.contains('sheet')) closePeek(); }, { passive: true });

  // ---------- clicks ----------
  document.addEventListener('click', function (e) {
    var t = e.target;
    var el;
    if (!t.closest('.acct')) closeAcctMenu();

    if (t.closest('[data-close]')) { closeModal(); return; }
    if ((el = t.closest('[data-open]'))) { e.preventDefault(); openByKey(el.dataset.open); return; }
    if ((el = t.closest('[data-logout]'))) { logout(); return; }
    if ((el = t.closest('[data-authmode]'))) { openAuth(el.dataset.authmode); return; }
    if ((el = t.closest('[data-pay]'))) { payOrder(el); return; }
    if ((el = t.closest('[data-cancel]'))) { cancelOrder(el); return; }
    if ((el = t.closest('[data-add]'))) { addToCart(+el.dataset.add, 1); return; }
    if ((el = t.closest('[data-heart]'))) { toggleWish(+el.dataset.heart); return; }
    if ((el = t.closest('[data-detail]'))) { e.preventDefault(); openProduct(+el.dataset.detail); return; }
    if ((el = t.closest('[data-peek]'))) {
      var pc = el.closest('.card');
      if (canHover.matches) openPeek(pc); else openSheet(pc);
      return;
    }
    if (t.closest('.pk-x') || t === pkScrim) { closePeek(); return; }
    if (!canHover.matches && (el = t.closest('.thumb')) && !t.closest('[data-heart]')) { openSheet(el.closest('.card')); return; }
    if (canHover.matches && (el = t.closest('.thumb')) && el.closest('.card')) { openProduct(+el.closest('.card').dataset.id); return; }

    if ((el = t.closest('[data-cat]'))) {
      e.preventDefault();
      var same = state.cat === el.dataset.cat && el.classList.contains('cat');
      state.cat = same ? null : el.dataset.cat; state.q = ''; $('#q').value = ''; loadFeed(); goFeed(); return;
    }
    if ((el = t.closest('[data-tab]'))) {
      state.tab = el.dataset.tab; loadFeed();
      if (el.tagName === 'A') { e.preventDefault(); goFeed(); }
      return;
    }
    if ((el = t.closest('[data-hint]'))) { e.preventDefault(); state.q = el.dataset.hint; $('#q').value = state.q; state.cat = null; state.tab = 'you'; loadFeed(); goFeed(); return; }
    if (t.closest('#clear') || t.closest('#allCats')) { e.preventDefault(); state.q = ''; state.cat = null; state.tab = 'you'; $('#q').value = ''; loadFeed(); goFeed(); return; }
    if (t.closest('#more')) { loadFeed(true); return; }
    if (t.closest('[data-retry]')) { loadFeed(); return; }

    if ((el = t.closest('[data-q]'))) {
      var it = cart.items.filter(function (x) { return x.id === +el.dataset.id; })[0];
      if (it) api('PATCH', '/api/cart/items/' + it.id, { qty: it.qty + +el.dataset.q }).then(function (c) { setCart(c); if (c.notice) toast(c.notice); }).catch(fail);
      return;
    }
    if ((el = t.closest('[data-rm]'))) { api('DELETE', '/api/cart/items/' + el.dataset.rm).then(setCart).catch(fail); return; }
    if (t.closest('[data-vrm]')) { api('DELETE', '/api/cart/voucher').then(setCart).catch(fail); return; }

    if ((el = t.closest('[data-pq]'))) {
      pd.qty = Math.max(1, Math.min(pd.max, pd.qty + +el.dataset.pq));
      var pq = $('#pq'); if (pq) pq.textContent = pd.qty;
      return;
    }
    if (t.closest('[data-padd]')) { addToCart(pd.id, pd.qty); return; }
    if (t.closest('[data-buynow]')) { addToCart(pd.id, pd.qty).then(function (c) { if (c) openCheckout(); }); return; }
    if (t.closest('[data-review-signin]')) { openAuth('in', function () { openProduct(pd.id); }); return; }

    if (t.closest('#acctBtn')) {
      if (!me.user) { openAuth('in'); return; }
      var m = $('#acctMenu'); m.hidden = !m.hidden; $('#acctBtn').setAttribute('aria-expanded', String(!m.hidden));
      return;
    }
    if (t.closest('#openCart')) { openCart(); return; }
    if (t.closest('#closeCart') || t.id === 'scrim') { closeCart(); return; }
    if (t.closest('#checkout')) { openCheckout(); return; }
  });

  // ---------- forms ----------
  document.addEventListener('submit', function (e) {
    var f = e.target;
    e.preventDefault();
    switch (f.id) {
      case 'searchForm': state.q = $('#q').value.trim(); state.cat = null; state.tab = 'you'; loadFeed(); goFeed(); break;
      case 'vform': {
        var code = $('#vcode').value.trim();
        if (!code) { $('#vmsg').innerHTML = '<span class="bad">Enter a voucher code.</span>'; break; }
        api('POST', '/api/cart/voucher', { code: code }).then(function (c) { $('#vcode').value = ''; setCart(c); toast('Voucher applied'); })
          .catch(function (err) { $('#vmsg').innerHTML = '<span class="bad">' + esc(err.message) + '</span>'; });
        break;
      }
      case 'authForm': submitAuth(f); break;
      case 'checkoutForm': submitCheckout(f); break;
      case 'trackForm': submitTrack(f); break;
      case 'reviewForm': submitReview(f); break;
      case 'supportForm': submitSupport(f); break;
      case 'sellerForm': submitSeller(f); break;
      case 'appForm': submitApp(f); break;
    }
  });

  // ---------- keyboard ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (modalEl) closeModal();
      else if (pkOpen !== null) closePeek();
      else if (cartIsOpen()) closeCart();
      else closeAcctMenu();
      return;
    }
    if (e.key === 'Tab' && modalEl) {
      var f = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary', modalEl).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- hero slider ----------
  var slides = $$('.slide'), cur = 0;
  var slider = $('#slider'), reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  slides.forEach(function (sl) {
    var h = sl.querySelector('h1'), i = 0;
    h.setAttribute('aria-label', h.textContent.trim());
    h.innerHTML = h.textContent.trim().split(/\s+/).map(function (w) { return '<span class="w" aria-hidden="true" style="--i:' + (i++) + '">' + w + '</span>'; }).join(' ');
  });
  $('#dots').innerHTML = slides.map(function (_, i) { return '<button data-i="' + i + '" aria-label="Go to slide ' + (i + 1) + '"></button>'; }).join('');
  function show(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach(function (sl, k) { sl.classList.toggle('on', k === cur); });
    $$('#dots button').forEach(function (d, k) { d.classList.toggle('on', k === cur); });
  }
  $('#prev').onclick = function () { show(cur - 1); };
  $('#next').onclick = function () { show(cur + 1); };
  $('#dots').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(+b.dataset.i); });
  // the progress fill on the active dot drives autoplay and pauses while the pointer or focus is on the slider
  $('#dots').addEventListener('animationend', function (e) { if (e.animationName === 'prog' && !reduce) show(cur + 1); });
  slider.addEventListener('pointermove', function (e) {
    var r = slider.getBoundingClientRect();
    slider.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    slider.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });
  slider.addEventListener('pointerleave', function () { slider.style.setProperty('--mx', 0); slider.style.setProperty('--my', 0); });
  show(0);

  // ---------- flash timer (round length and end time come from the server) ----------
  var reloadingFlash = false;
  function tick() {
    var r = flash.endsAt ? Math.max(0, Math.floor((flash.endsAt - (Date.now() + tOff)) / 1000)) : 0;
    $('#th').textContent = String(Math.floor(r / 3600)).padStart(2, '0');
    $('#tm').textContent = String(Math.floor(r % 3600 / 60)).padStart(2, '0');
    $('#ts').textContent = String(r % 60).padStart(2, '0');
    if (r === 0 && flash.endsAt && !reloadingFlash) {
      reloadingFlash = true;
      loadFlash().catch(noop).then(function () { setTimeout(function () { reloadingFlash = false; }, 5000); });
    }
  }
  setInterval(tick, 1000);

  // ---------- go ----------
  $('#hints').innerHTML = ['Wireless earbuds', 'Yoga mat', 'Desk lamp', 'Leather bag', 'Cast iron skillet', 'Running shoes', 'Notebook']
    .map(function (h) { return '<a href="#feed" data-hint="' + h + '">' + h + '</a>'; }).join('');
  renderCart();
  loadCats().catch(noop);
  loadConfig().catch(noop);
  loadMe().catch(noop);
  loadCart().catch(noop);
  loadFlash().catch(function () { renderFlash(); });
  loadFeed();
  handlePayReturn();
})();
