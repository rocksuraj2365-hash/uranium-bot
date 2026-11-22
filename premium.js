(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const h = (tag, props = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
    }
    for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return node;
  };
  const money = (n) => '₹' + n;
  const date = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const LABEL = { awaiting_payment: 'Waiting for payment', pending: 'Waiting for owner check', approved: 'Approved', rejected: 'Rejected', expired: 'Expired' };

  let cfg = { open: false, plans: [] }, user = null, status = null, timer = null;
  const seen = {};

  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'Something went wrong. Please retry.'); error.status = response.status; throw error; }
    return data;
  }
  function say(text, kind = 'info') {
    const box = $('#pay-notice');
    box.hidden = !text; box.className = 'premium-status ' + kind; box.textContent = text || '';
  }
  const copyButton = (text, label = 'Copy') => h('button', { type: 'button', class: 'mini-btn', onclick: async (event) => {
    try { await navigator.clipboard.writeText(text); event.target.textContent = 'Copied'; setTimeout(() => { event.target.textContent = label; }, 1500); } catch { event.target.textContent = 'Select and copy'; }
  } }, label);

  function renderPlanButtons() {
    for (const button of document.querySelectorAll('.choose-plan[data-plan]')) {
      const plan = cfg.plans.find((p) => p.id === button.dataset.plan);
      button.onclick = null;
      if (!cfg.open || !plan) { button.disabled = true; button.textContent = 'Payments opening soon'; continue; }
      button.disabled = false;
      if (!user) { button.textContent = 'Login to buy'; button.onclick = () => { location.href = '/login?next=premium'; }; continue; }
      button.textContent = 'Buy for ' + money(plan.amount);
      button.onclick = () => startOrder(plan.id, button);
    }
  }

  function renderStatus() {
    const box = $('#my-premium');
    if (!user || !status) { box.hidden = true; return; }
    const premium = status.premium, noPrefix = status.noPrefix;
    const premiumText = premium.active ? (premium.lifetime ? 'Active · Lifetime' : 'Active until ' + date(premium.until)) : 'Not active';
    const noPrefixText = noPrefix.active ? (noPrefix.viaPremium ? 'Active · included with Premium' : 'Active until ' + date(noPrefix.until)) : 'Not active';
    box.replaceChildren(
      h('h2', { text: 'Your access' }),
      h('div', { class: 'status-grid' },
        h('div', { class: 'status-item' }, h('span', { class: 'chip ' + (premium.active ? 'ok' : 'off'), text: premium.active ? 'ACTIVE' : 'OFF' }), h('b', { text: 'Premium' }), h('small', { text: premiumText })),
        h('div', { class: 'status-item' }, h('span', { class: 'chip ' + (noPrefix.active ? 'ok' : 'off'), text: noPrefix.active ? 'ACTIVE' : 'OFF' }), h('b', { text: 'No Prefix' }), h('small', { text: noPrefixText }))),
      status.orders.length ? h('div', { class: 'order-list' }, h('h3', { text: 'Recent orders' }), status.orders.map(orderRow)) : null);
    box.hidden = false;
  }
  function orderRow(order) {
    return h('div', { class: 'order-row' },
      h('div', {}, h('b', { text: order.planLabel + ' · ' + money(order.amount) }), h('small', { text: order.ref + ' · ' + date(order.createdAt) + (order.reason ? ' · ' + order.reason : '') })),
      h('span', { class: 'chip ' + order.status, text: LABEL[order.status] || order.status }),
      order.status === 'awaiting_payment' ? h('button', { type: 'button', class: 'mini-btn', onclick: () => showOrder(order) }, 'Continue') : null);
  }

  function showOrder(order, note) {
    const panel = $('#order-panel');
    if (order.status === 'pending') {
      panel.replaceChildren(h('h2', { text: 'Payment sent for checking' }),
        h('p', { text: 'Thanks. The owner is checking the payment now and approves it with one tap. This page updates by itself, you do not need to refresh.' }),
        h('p', { class: 'ref-line' }, 'Reference ', h('code', { text: order.ref }), ' · ', money(order.amount)),
        note ? h('p', { class: 'warn', text: note }) : null);
      panel.hidden = false; return;
    }
    if (order.status !== 'awaiting_payment' || !order.pay) { panel.hidden = true; return; }
    const input = h('input', { id: 'utr', inputmode: 'numeric', autocomplete: 'off', maxlength: '14', placeholder: '12-digit transaction ID (UTR)', 'aria-label': 'UPI transaction ID' });
    const send = h('button', { type: 'button', class: 'choose-plan', onclick: async () => {
      send.disabled = true; send.textContent = 'Sending…';
      try {
        const data = await api('/api/premium/orders/' + encodeURIComponent(order.ref) + '/utr', { method: 'POST', body: JSON.stringify({ utr: input.value }) });
        showOrder(data.order, data.ownerNotified ? '' : 'The owner could not be notified automatically. Open a ticket in the support server and send this reference.');
        await refresh();
      } catch (error) { say(error.message, 'err'); send.disabled = false; send.textContent = 'I have paid · send for checking'; }
    } }, 'I have paid · send for checking');
    const qr = h('img', { class: 'qr', alt: 'UPI QR code for ' + money(order.amount), width: '220', height: '220', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(order.pay.qrSvg) });
    panel.replaceChildren(
      h('h2', { text: 'Pay ' + money(order.amount) + ' for ' + order.planLabel }),
      h('div', { class: 'pay-grid' },
        h('div', { class: 'qr-box' }, qr, h('a', { class: 'choose-plan upi-open', href: order.pay.link }, 'Pay in UPI app')),
        h('ol', { class: 'pay-steps' },
          h('li', {}, 'Pay exactly ', h('b', { text: money(order.amount) }), ' by scanning the QR or tapping the button on your phone.'),
          h('li', {}, 'Keep this reference in the payment note: ', h('code', { text: order.ref }), ' ', copyButton(order.ref)),
          h('li', {}, 'Paying by hand? UPI ID ', h('code', { text: order.pay.upiId }), ' ', copyButton(order.pay.upiId), ' (', order.pay.payee, ').'),
          h('li', {}, 'Then paste the 12-digit transaction ID (UTR) from your UPI app and press the button.'))),
      input, send,
      h('p', { class: 'warn', text: 'Pay only to the UPI ID shown here. Access starts after the owner sees your payment.' }));
    panel.hidden = false;
  }

  async function startOrder(planId, button) {
    const old = button.textContent; button.disabled = true; button.textContent = 'Please wait…';
    try { const data = await api('/api/premium/orders', { method: 'POST', body: JSON.stringify({ plan: planId }) }); say('', 'info'); showOrder(data.order); $('#order-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); await refresh(); }
    catch (error) { say(error.message, 'err'); }
    finally { button.disabled = false; button.textContent = old; }
  }

  async function refresh() {
    if (!user) return;
    try {
      status = await api('/api/premium/status');
      for (const order of status.orders) {
        const before = seen[order.ref]; seen[order.ref] = order.status;
        if (before === 'pending' && order.status === 'approved') { say('Payment verified. Your access is active now.', 'ok'); $('#order-panel').hidden = true; }
        if (before === 'pending' && order.status === 'rejected') { say('Payment ' + order.ref + ' could not be verified' + (order.reason ? ': ' + order.reason : '') + '.', 'err'); $('#order-panel').hidden = true; }
      }
      renderStatus(); schedule();
    } catch (error) { if (error.status !== 401) say(error.message, 'err'); }
  }
  function schedule() {
    const waiting = status && status.orders.some((o) => o.status === 'pending');
    if (waiting && !timer) timer = setInterval(refresh, 15000);
    if (!waiting && timer) { clearInterval(timer); timer = null; }
  }

  async function init() {
    try { cfg = await api('/api/premium/config'); } catch { cfg = { open: false, plans: [] }; }
    try { user = await api('/api/me'); } catch { user = null; }
    if (!cfg.open) say('Payments are not open yet. Do not send money until this notice is gone.', 'warn');
    else if (!user) say('Log in with Discord to buy a plan and see your Premium status.', 'info');
    else say('', 'info');
    renderPlanButtons();
    if (user) {
      await refresh();
      const waiting = status && status.orders.find((o) => o.status === 'awaiting_payment' && o.pay);
      if (waiting) showOrder(waiting);
      const pending = status && status.orders.find((o) => o.status === 'pending');
      if (!waiting && pending) showOrder(pending);
    }
  }
  init();
})();
