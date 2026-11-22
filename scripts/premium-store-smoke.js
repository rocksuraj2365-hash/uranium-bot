const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'uranium-pay-'));
const OWNER = '100000000000000001';
const U1 = '200000000000000001';
const U2 = '200000000000000002';
const U3 = '200000000000000003';
process.env.OWNER_IDS = OWNER;
process.env.DASHBOARD_API_SECRET = 'test-secret';
process.env.PAYMENT_UPI_ID = 'shop@fam';
process.env.PAYMENT_PAYEE_NAME = 'Uranium';

const store = require('../lib/premium-store');
const payLink = require('../lib/pay-link');
const payApi = require('../lib/pay-api');
const payUi = require('../lib/pay-ui');
const np = require('../lib/np');
const premiumCommands = require('../commands/premium');
const DAY = 86400000;
const throwsPay = (fn, status, pattern) => assert.throws(fn, (error) => error.name === 'PayError' && error.status === status && (!pattern || pattern.test(error.message)));

async function main() {
  // ---- orders
  const t0 = Date.now();
  const o1 = store.createOrder(U1, 'Alice', 'premium_monthly', t0);
  assert.match(o1.ref, /^URX-[A-Z2-9]{6}$/);
  assert.equal(o1.amount, 39);
  assert.equal(store.createOrder(U1, 'Alice', 'premium_monthly', t0).ref, o1.ref, 'same unpaid plan reuses the order');
  throwsPay(() => store.createOrder(U1, 'Alice', 'gold', t0), 400);
  throwsPay(() => store.createOrder('abc', 'x', 'noprefix', t0), 401);
  store.createOrder(U1, 'Alice', 'noprefix', t0);
  store.createOrder(U1, 'Alice', 'premium_yearly', t0);
  throwsPay(() => store.createOrder(U1, 'Alice', 'premium_lifetime', t0), 429, /unfinished/);

  // ---- UTR rules
  throwsPay(() => store.submitUtr(U2, o1.ref, '123456789012', t0), 404);
  for (let n = 0; n < 5; n += 1) throwsPay(() => store.submitUtr(U1, o1.ref, 'abc', t0), 400, /12 digits/);
  throwsPay(() => store.submitUtr(U1, o1.ref, '123456789012', t0), 429, /Too many wrong/);
  const o2 = store.createOrder(U2, 'Bob', 'premium_monthly', t0);
  const pending = store.submitUtr(U2, o2.ref, '1234 5678 9012', t0);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.utr, '123456789012');
  throwsPay(() => store.submitUtr(U2, o2.ref, '123456789012', t0), 409, /already sent/);
  const o3 = store.createOrder(U3, 'Cara', 'noprefix', t0);
  throwsPay(() => store.submitUtr(U3, o3.ref, '123456789012', t0), 409, /already used/);

  // ---- nothing is active before approval, approval grants with expiry and stacking
  assert.equal(store.hasPremium(U2, t0), false);
  assert.equal(store.hasNoPrefix(U2, t0), false);
  assert.equal(premiumCommands.hasAccess('300000000000000001', U2), false);
  const approved = store.approve(o2.ref, OWNER, t0);
  assert.equal(approved.status, 'approved');
  assert.equal(store.hasPremium(U2, t0 + 29 * DAY), true);
  assert.equal(store.hasPremium(U2, t0 + 31 * DAY), false, 'monthly Premium expires');
  assert.equal(store.hasNoPrefix(U2, t0 + 29 * DAY), true, 'Premium includes No Prefix');
  assert.equal(store.hasNoPrefix(U2, t0 + 31 * DAY), false);
  throwsPay(() => store.approve(o2.ref, OWNER, t0), 409, /already approved/);
  assert.equal(premiumCommands.hasAccess('300000000000000001', U2), true, 'purchased Premium works in every server');
  assert.equal(np.has(U2), true, 'purchased Premium turns on No Prefix');

  const o4 = store.createOrder(U2, 'Bob', 'premium_monthly', t0 + 1);
  store.submitUtr(U2, o4.ref, '999999999999', t0 + 1);
  store.approve(o4.ref, OWNER, t0 + 1);
  assert.equal(store.hasPremium(U2, t0 + 59 * DAY), true, 'a second month stacks on the first');
  assert.equal(store.hasPremium(U2, t0 + 61 * DAY), false);

  // standalone No Prefix stays separate and lifetime never expires
  const o5 = store.createOrder(U3, 'Cara', 'noprefix', t0);
  throwsPay(() => store.submitUtr(U3, o5.ref, 'x', t0), 400);
  store.submitUtr(U3, o5.ref, '555555555555', t0);
  store.approve(o5.ref, OWNER, t0);
  assert.equal(store.hasNoPrefix(U3, t0 + DAY), true);
  assert.equal(store.hasPremium(U3, t0 + DAY), false, 'No Prefix alone is not Premium');
  assert.equal(store.hasNoPrefix(U3, t0 + 40 * DAY), false);

  // reject keeps access off
  const o6 = store.createOrder('200000000000000004', 'Dan', 'premium_yearly', t0);
  store.submitUtr('200000000000000004', o6.ref, '444444444444', t0);
  store.reject(o6.ref, OWNER, 'Not found in bank history', t0);
  assert.equal(store.hasPremium('200000000000000004', t0), false);
  throwsPay(() => store.reject(o6.ref, OWNER), 409);

  // expiry of unpaid orders and late UTR
  const o7 = store.createOrder('200000000000000005', 'Eve', 'noprefix', t0);
  assert.equal(store.statusFor('200000000000000005', t0 + 2 * DAY).orders[0].status, 'expired');
  store.submitUtr('200000000000000005', o7.ref, '777777777777', t0 + 2 * DAY);
  const o8 = store.createOrder('200000000000000006', 'Fay', 'noprefix', t0);
  throwsPay(() => store.submitUtr('200000000000000006', o8.ref, '888888888888', t0 + 8 * DAY), 409, /closed/);

  // public data never leaks the UTR or the Discord ID
  const status = store.statusFor(U2, t0);
  assert.equal(status.premium.active, true);
  assert.ok(!JSON.stringify(status).includes('123456789012'));
  assert.ok(!JSON.stringify(status).includes(U2));

  // ---- UPI link
  const link = payLink.upiLink({ upiId: 'shop@fam', payee: 'Uranium Bot', amount: 39, ref: o1.ref });
  assert.equal(link, 'upi://pay?pa=shop%40fam&pn=Uranium%20Bot&am=39.00&cu=INR&tn=' + o1.ref);
  assert.equal(payLink.validUpiId('shop@fam'), true);
  assert.equal(payLink.validUpiId('not an id'), false);
  assert.ok((await payLink.qrSvg(link)).startsWith('<svg'));

  // ---- owner card and buttons
  const sent = []; const edits = [];
  const user = (id) => ({ id, send: async (payload) => { sent.push([id, payload]); return { channelId: 'dm' + id, id: 'msg' + sent.length }; }, createDM: async () => ({ messages: { fetch: async () => ({ edit: async (payload) => { edits.push(payload); } }) } }) });
  const client = { users: { fetch: async (id) => user(id) }, channels: { fetch: async () => { throw new Error('none'); } } };
  const o9 = store.createOrder('200000000000000007', 'Gus', 'premium_monthly', Date.now());
  store.submitUtr('200000000000000007', o9.ref, '121212121212', Date.now());
  assert.equal(await payUi.notifyOwners(client, o9), 1);
  assert.equal(sent[0][0], OWNER);
  const cardJson = JSON.stringify(sent[0][1]);
  assert.ok(cardJson.includes('pay:ap:' + o9.ref) && cardJson.includes('pay:rj:' + o9.ref));
  const replies = []; const updates = [];
  let unlocked = false;
  const press = (id, who) => payUi.onButton({ customId: id, user: { id: who }, client, deferred: false, replied: false, reply: async (p) => replies.push(p), update: async (p) => updates.push(p) }, { isOwner: (x) => x === OWNER, ownerSessionActive: () => unlocked });
  await press('pay:ap:' + o9.ref, U1); assert.ok(JSON.stringify(replies.pop()).includes('Owner only'));
  await press('pay:ap:' + o9.ref, OWNER); assert.ok(JSON.stringify(replies.pop()).includes('session locked'));
  assert.equal(store.getOrder(o9.ref).status, 'pending');
  unlocked = true;
  await press('pay:ap:' + o9.ref, OWNER); assert.ok(JSON.stringify(replies.pop()).includes('pay:ok:' + o9.ref));
  assert.equal(store.getOrder(o9.ref).status, 'pending', 'approve needs the confirm step');
  await press('pay:no:' + o9.ref, OWNER); assert.ok(JSON.stringify(updates.pop()).includes('Cancelled'));
  await press('pay:ok:' + o9.ref, OWNER);
  assert.equal(store.getOrder(o9.ref).status, 'approved');
  assert.equal(store.hasPremium('200000000000000007'), true);
  assert.ok(edits.length >= 1, 'owner card is updated');
  assert.ok(sent.some(([id, p]) => id === '200000000000000007' && /verified/.test(p.content)), 'buyer is told');
  await press('pay:ok:' + o9.ref, OWNER); assert.ok(JSON.stringify(replies.pop()).includes('Already approved'));

  // ---- bot HTTP API + website routes end to end
  const sendJson = (res, statusCode, body) => { res.writeHead(statusCode, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const safeEqual = (a, b) => String(a) === String(b);
  const botServer = http.createServer((req, res) => payApi.handle(req, res, new URL(req.url, 'http://x'), { sendJson, safeEqual, allowApiRequest: () => true, client }));
  await new Promise((resolve) => botServer.listen(0, '127.0.0.1', resolve));
  process.env.BOT_CONTROL_URL = 'http://127.0.0.1:' + botServer.address().port;
  const direct = (p, opts = {}) => fetch(process.env.BOT_CONTROL_URL + p, { ...opts, headers: { 'x-discord-user-id': '200000000000000008', ...(opts.headers || {}) } });
  assert.equal((await direct('/pay/status')).status, 401, 'secret required');
  assert.equal((await direct('/pay/status', { headers: { 'x-dashboard-secret': 'test-secret', 'x-discord-user-id': 'bad' } })).status, 401);
  assert.equal((await direct('/pay/status', { headers: { 'x-dashboard-secret': 'test-secret' } })).status, 200);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: '200000000000000008', username: 'Hana' } }; next(); });
  require('../lib/premium-web')(app, { requireAuth: (req, res, next) => next(), rateLimit: () => (req, res, next) => next() });
  const web = http.createServer(app);
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + web.address().port;
  const post = (p, body, origin = base) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
  try {
    const config = await (await fetch(base + '/api/premium/config')).json();
    assert.equal(config.open, true);
    assert.equal(config.plans.length, 4);
    assert.equal((await post('/api/premium/orders', { plan: 'premium_monthly' }, 'https://evil.example')).status, 403, 'origin check');
    assert.equal((await post('/api/premium/orders', { plan: 'gold' })).status, 400);
    const created = await post('/api/premium/orders', { plan: 'premium_monthly' });
    assert.equal(created.status, 200);
    const { order } = await created.json();
    assert.equal(order.amount, 39);
    assert.ok(order.pay.link.startsWith('upi://pay?pa=shop%40fam') && order.pay.link.includes('am=39.00') && order.pay.link.endsWith('tn=' + order.ref));
    assert.ok(order.pay.qrSvg.startsWith('<svg'));
    assert.ok(!('utr' in order) && !('userId' in order));
    let mine = await (await fetch(base + '/api/premium/status')).json();
    assert.equal(mine.orders[0].status, 'awaiting_payment');
    assert.ok(mine.orders[0].pay, 'unpaid orders can be resumed');
    assert.equal((await post('/api/premium/orders/BAD/utr', { utr: '1' })).status, 400);
    assert.equal((await post('/api/premium/orders/' + order.ref + '/utr', { utr: '12' })).status, 400);
    const submitted = await post('/api/premium/orders/' + order.ref + '/utr', { utr: '343434343434' });
    assert.equal(submitted.status, 200);
    const body = await submitted.json();
    assert.equal(body.order.status, 'pending');
    assert.equal(body.ownerNotified, true);
    mine = await (await fetch(base + '/api/premium/status')).json();
    assert.equal(mine.orders[0].status, 'pending');
    assert.equal(mine.premium.active, false, 'pending is not access');
    store.approve(order.ref, OWNER);
    mine = await (await fetch(base + '/api/premium/status')).json();
    assert.equal(mine.premium.active, true);
    assert.equal(mine.noPrefix.viaPremium, true);
    assert.equal(mine.orders[0].status, 'approved');
  } finally {
    await new Promise((resolve) => web.close(resolve));
    await new Promise((resolve) => botServer.close(resolve));
  }
  console.log('Premium orders, owner approval, expiry and website payment route checks passed.');
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
