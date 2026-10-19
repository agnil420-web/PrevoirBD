(() => {
  const $ = (s) => document.querySelector(s);
  const H = { 'X-Prevoir': '1', 'Content-Type': 'application/json' };
  let key = '', tab = 'orders';
  try { key = sessionStorage.getItem('pbAdminKey') || ''; } catch (e) { /* storage blocked */ }

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else n[k] = v; }
    for (const c of kids.flat()) n.append(c instanceof Node ? c : String(c));
    return n;
  };
  const taka = (n) => '৳' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const say = (t, bad) => { const m = $('#msg'); m.textContent = t || ''; m.className = 'msg' + (bad ? ' bad' : ''); };
  async function api(path, method = 'GET', body) {
    const r = await fetch('/api/admin' + path, { method, headers: { ...H, 'x-admin-key': key }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }
  function lock() { key = ''; try { sessionStorage.removeItem('pbAdminKey'); } catch (e) { /* ignore */ } $('#app').hidden = true; $('#login').hidden = false; $('#out').hidden = true; }

  async function stats() {
    const s = await api('/summary');
    const box = $('#stats'); box.replaceChildren();
    for (const [label, v] of [['Orders', s.orders], ['Revenue', taka(s.revenue)], ['Customers', s.users], ['Sellers pending', s.sellersPending], ['Tickets', s.tickets], ['App waitlist', s.waitlist]])
      box.append(el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, label)));
  }
  const NEXT = { placed: 'packed', packed: 'shipped', shipped: 'delivered' };
  async function setStatus(num, status) {
    if (status === 'cancelled' && !confirm('Cancel ' + num + '? Stock goes back on the shelf.')) return;
    try { await api('/orders/' + encodeURIComponent(num), 'PATCH', { status }); await show(); await stats(); say(num + ' is now ' + status + '.'); }
    catch (e) { say(e.message, true); }
  }
  async function show() {
    const v = $('#view'); v.replaceChildren(); say('');
    if (tab === 'orders') {
      const { orders } = await api('/orders');
      if (!orders.length) v.append(el('p', {}, 'No orders yet.'));
      for (const o of orders) {
        const acts = el('div', { class: 'acts' });
        if (NEXT[o.status]) acts.append(el('button', { onclick: () => setStatus(o.number, NEXT[o.status]) }, 'Mark ' + NEXT[o.status]));
        if (o.status !== 'cancelled' && o.status !== 'delivered') acts.append(el('button', { class: 'ghost', onclick: () => setStatus(o.number, 'cancelled') }, 'Cancel'));
        v.append(el('div', { class: 'row' },
          el('div', { class: 'h' }, el('b', {}, o.number), el('span', { class: 'pill' }, o.status === 'pending_payment' ? 'awaiting payment' : o.status), el('b', {}, taka(o.total))),
          el('div', { class: 'small' }, new Date(o.createdAt).toLocaleString(), ' · ', o.paymentLabel || o.payment, o.paid ? ' · PAID' : ''),
          o.paid && o.status === 'cancelled' ? el('div', { class: 'err' }, 'Customer paid but the order expired. Refund them from your SSLCommerz dashboard.') : '',
          el('div', {}, o.shipTo.name, ' · ', o.phone || 'no phone', ' · ', o.email),
          el('div', { class: 'small' }, o.shipTo.address, ', ', o.shipTo.city, ' ', o.shipTo.postcode),
          el('div', { class: 'small' }, o.items.map((i) => i.qty + ' × ' + i.name).join(', ')),
          acts));
      }
    } else if (tab === 'sellers') {
      const { sellers } = await api('/sellers');
      if (!sellers.length) v.append(el('p', {}, 'No seller applications yet.'));
      for (const s of sellers) {
        const sel = el('select', {}, ...['pending', 'approved', 'rejected'].map((x) => el('option', { value: x, selected: x === s.status }, x)));
        sel.onchange = async () => { try { await api('/sellers/' + s.id, 'PATCH', { status: sel.value }); say(s.shop_name + ' is ' + sel.value + '.'); await stats(); } catch (e) { say(e.message, true); } };
        v.append(el('div', { class: 'row' }, el('div', { class: 'h' }, el('b', {}, s.shop_name), sel),
          el('div', {}, s.owner_name, ' · ', s.email, ' · ', s.phone || 'no phone'), el('div', { class: 'small' }, (s.category || 'any category') + ' — ' + (s.about || ''))));
      }
    } else {
      const { tickets } = await api('/support');
      if (!tickets.length) v.append(el('p', {}, 'No support messages yet.'));
      for (const t of tickets)
        v.append(el('div', { class: 'row' }, el('div', { class: 'h' }, el('b', {}, t.topic), el('span', { class: 'small' }, new Date(t.created_at).toLocaleString())),
          el('div', {}, t.name, ' · ', t.email, t.order_number ? ' · ' + t.order_number : ''), el('div', {}, t.message)));
    }
  }
  async function open() {
    await stats(); await show();
    $('#login').hidden = true; $('#app').hidden = false; $('#out').hidden = false;
  }
  $('#login').onsubmit = async (e) => {
    e.preventDefault(); key = $('#key').value.trim(); $('#lerr').textContent = '';
    try { await open(); try { sessionStorage.setItem('pbAdminKey', key); } catch (x) { /* ignore */ } }
    catch (x) { key = ''; $('#lerr').textContent = x.message; }
  };
  $('#out').onclick = lock;
  document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = async () => { tab = b.dataset.t; document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b)); try { await show(); } catch (e) { say(e.message, true); } }; });
  if (key) open().catch(lock);
})();
