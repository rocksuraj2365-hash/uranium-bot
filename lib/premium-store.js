// Premium orders and entitlements (stored in the bot database under the __global record).
// Flow: awaiting_payment -> pending (buyer sent the UTR) -> approved | rejected (owner decides).
const crypto = require('crypto');
const db = require('./db');
const { PLANS, isPlan } = require('./plans');

const DAY = 86400000;
const ORDER_TTL = DAY;              // an unpaid order is hidden after 24 hours
const LATE_SUBMIT = 7 * DAY;        // a buyer may still send the UTR for an expired order for a week
const MAX_OPEN = 3;                 // unpaid or unverified orders per buyer
const MAX_PER_DAY = 10;             // new orders per buyer per day
const MAX_BAD_TRIES = 5;            // wrong UTR formats per order
const KEEP_PER_USER = 30;

class PayError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'PayError'; this.status = status; }
}

const bucket = () => { const g = db.g('__global'); g.premium ||= { orders: {}, users: {} }; g.premium.orders ||= {}; g.premium.users ||= {}; return g.premium; };
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40);

function newRef(orders) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let ref = 'URX-';
    for (const byte of crypto.randomBytes(6)) ref += alphabet[byte % alphabet.length];
    if (!orders[ref]) return ref;
  }
}

function sweep(now = Date.now()) {
  for (const order of Object.values(bucket().orders)) {
    if (order.status === 'awaiting_payment' && now - order.createdAt > ORDER_TTL) order.status = 'expired';
  }
}

function createOrder(userId, username, planId, now = Date.now()) {
  if (!/^\d{17,20}$/.test(String(userId || ''))) throw new PayError('Invalid Discord user.', 401);
  if (!isPlan(planId)) throw new PayError('Unknown plan.', 400);
  const store = bucket(); sweep(now);
  const mine = Object.values(store.orders).filter((o) => o.userId === userId);
  const same = mine.find((o) => o.plan === planId && o.status === 'awaiting_payment');
  if (same) return same;
  if (mine.filter((o) => o.status === 'awaiting_payment' || o.status === 'pending').length >= MAX_OPEN) {
    throw new PayError('You already have unfinished orders. Finish or wait for those first.', 429);
  }
  if (mine.filter((o) => now - o.createdAt < DAY).length >= MAX_PER_DAY) throw new PayError('Too many orders today. Try again tomorrow.', 429);
  const ordered = mine.sort((a, b) => b.createdAt - a.createdAt);
  for (const old of ordered.slice(KEEP_PER_USER - 1)) if (old.status !== 'pending') delete store.orders[old.ref];
  const order = { ref: newRef(store.orders), userId, username: cleanName(username), plan: planId, amount: PLANS[planId].amount, status: 'awaiting_payment', createdAt: now, utr: null, tries: 0 };
  store.orders[order.ref] = order; db.save();
  return order;
}

function getOrder(ref) { return bucket().orders[ref] || null; }

function submitUtr(userId, ref, utrRaw, now = Date.now()) {
  const order = getOrder(ref);
  if (!order || order.userId !== userId) throw new PayError('Order not found.', 404);
  sweep(now);
  if (order.status === 'pending') throw new PayError('You already sent the transaction ID for this order. Please wait for verification.', 409);
  if (order.status !== 'awaiting_payment' && !(order.status === 'expired' && now - order.createdAt < LATE_SUBMIT)) {
    throw new PayError('This order is closed. Start a new order.', 409);
  }
  if (order.tries >= MAX_BAD_TRIES) throw new PayError('Too many wrong attempts for this order. Start a new order.', 429);
  const utr = String(utrRaw || '').replace(/\s+/g, '');
  if (!/^\d{12}$/.test(utr)) { order.tries += 1; db.save(); throw new PayError('The UPI transaction ID (UTR) is 12 digits. Copy it from your payment app.', 400); }
  const clash = Object.values(bucket().orders).find((o) => o.ref !== order.ref && o.utr === utr);
  if (clash) { order.tries += 1; db.save(); throw new PayError('This transaction ID was already used on another order.', 409); }
  order.utr = utr; order.status = 'pending'; order.submittedAt = now; db.save();
  return order;
}

function grant(userId, planId, now) {
  const store = bucket(); const plan = PLANS[planId];
  const user = (store.users[userId] ||= { premiumUntil: 0, premiumLifetime: false, noPrefixUntil: 0 });
  if (plan.grants === 'premium') {
    if (plan.days == null) user.premiumLifetime = true;
    else user.premiumUntil = Math.max(now, user.premiumUntil || 0) + plan.days * DAY;
  } else {
    user.noPrefixUntil = Math.max(now, user.noPrefixUntil || 0) + plan.days * DAY;
  }
  return user;
}

function approve(ref, byId, now = Date.now()) {
  const order = getOrder(ref);
  if (!order) throw new PayError('Order not found.', 404);
  if (order.status !== 'pending') throw new PayError(`This order is already ${order.status}.`, 409);
  grant(order.userId, order.plan, now);
  order.status = 'approved'; order.decidedAt = now; order.decidedBy = String(byId || ''); db.save();
  return order;
}

function reject(ref, byId, reason = 'Payment could not be verified', now = Date.now()) {
  const order = getOrder(ref);
  if (!order) throw new PayError('Order not found.', 404);
  if (order.status !== 'pending') throw new PayError(`This order is already ${order.status}.`, 409);
  order.status = 'rejected'; order.decidedAt = now; order.decidedBy = String(byId || ''); order.reason = String(reason).slice(0, 120); db.save();
  return order;
}

const entitlement = (userId) => bucket().users[userId] || null;
function hasPremium(userId, now = Date.now()) { const u = entitlement(userId); return !!u && (u.premiumLifetime === true || (u.premiumUntil || 0) > now); }
function hasNoPrefix(userId, now = Date.now()) { const u = entitlement(userId); return hasPremium(userId, now) || (!!u && (u.noPrefixUntil || 0) > now); }

function publicOrder(o) {
  const out = { ref: o.ref, plan: o.plan, planLabel: PLANS[o.plan]?.label || o.plan, amount: o.amount, status: o.status, createdAt: o.createdAt };
  if (o.submittedAt) out.submittedAt = o.submittedAt;
  if (o.decidedAt) out.decidedAt = o.decidedAt;
  if (o.status === 'rejected' && o.reason) out.reason = o.reason;
  return out;
}

function statusFor(userId, now = Date.now()) {
  sweep(now);
  const u = entitlement(userId) || {};
  const premium = hasPremium(userId, now), noPrefix = hasNoPrefix(userId, now);
  const orders = Object.values(bucket().orders).filter((o) => o.userId === userId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  return {
    premium: { active: premium, lifetime: u.premiumLifetime === true, until: u.premiumLifetime ? null : (u.premiumUntil > now ? u.premiumUntil : null) },
    noPrefix: { active: noPrefix, viaPremium: premium, until: u.noPrefixUntil > now ? u.noPrefixUntil : null },
    orders: orders.map(publicOrder),
  };
}

const pendingOrders = () => Object.values(bucket().orders).filter((o) => o.status === 'pending').sort((a, b) => a.submittedAt - b.submittedAt);

module.exports = { PayError, createOrder, submitUtr, approve, reject, getOrder, hasPremium, hasNoPrefix, statusFor, publicOrder, pendingOrders, sweep, grant };
