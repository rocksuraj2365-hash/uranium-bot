// Owner verification card for Premium payments (Components V2) and buyer notifications.
const cv2 = require('./cv2');
const { E } = require('./emojis');
const store = require('./premium-store');
const { PLANS } = require('./plans');

const ic = (name, fallback) => { const v = E(name); return v && v !== '◆' ? v : fallback; };
const PK = (name, fallback) => ic('pk_' + name, fallback);
const esc = (s) => String(s || '').replace(/[`*_~|>\\]/g, '\\$&');
const ownerIds = () => (process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean);
const STATUS = {
  pending: ['⏳', 'Waiting for your check', 0xffb84d],
  approved: ['✅', 'Approved', 0x22c55e],
  rejected: ['❌', 'Rejected', 0xef4444],
};
const dateText = (ms) => new Date(ms).toISOString().slice(0, 10);

function card(order, note) {
  const plan = PLANS[order.plan] || { label: order.plan };
  const [emoji, title, color] = STATUS[order.status] || STATUS.pending;
  const lines = [
    `**Buyer:** <@${order.userId}> (${esc(order.username)})`,
    `**Plan:** ${plan.label} for ₹${order.amount}`,
    `**Reference:** \`${order.ref}\``,
    `**UTR:** \`${order.utr}\``,
    `**Status:** ${emoji} ${title}`,
  ];
  if (note) lines.push(note);
  const kids = [cv2.text(`# ${PK('role_admin', '💎')} Premium payment`), cv2.text(lines.join('\n'))];
  if (order.status === 'pending') {
    kids.push(
      cv2.text(`Open FamPay and check that **₹${order.amount}** really arrived with this UTR (the payment note should show \`${order.ref}\`). Nothing is activated until you approve.`),
      cv2.separator(),
      cv2.row([
        cv2.button(`pay:ap:${order.ref}`, 'Approve', 3, PK('role_verified', '✅')),
        cv2.button(`pay:rj:${order.ref}`, 'Reject', 4, '✖️'),
      ]),
    );
  }
  return { ...cv2.message(kids, color), allowedMentions: { parse: [] } };
}

// Send the card to every owner (DM) and to an optional channel. Returns how many places received it.
async function notifyOwners(client, order) {
  if (!client) return 0;
  order.notify ||= [];
  let delivered = 0;
  for (const ownerId of ownerIds()) {
    try {
      const user = await client.users.fetch(ownerId);
      const message = await user.send(card(order));
      order.notify.push({ ownerId, channelId: message.channelId, messageId: message.id }); delivered += 1;
    } catch (error) { console.warn('[pay] could not DM owner', ownerId, error.message); }
  }
  const channelId = process.env.PAYMENT_NOTIFY_CHANNEL_ID;
  if (channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      const message = await channel.send(card(order));
      order.notify.push({ channelId, messageId: message.id }); delivered += 1;
    } catch (error) { console.warn('[pay] could not post in the payment channel', error.message); }
  }
  require('./db').save();
  return delivered;
}

async function refreshCards(client, order, note) {
  for (const place of order.notify || []) {
    try {
      let channel;
      if (place.ownerId) channel = await (await client.users.fetch(place.ownerId)).createDM();
      else channel = await client.channels.fetch(place.channelId);
      const message = await channel.messages.fetch(place.messageId);
      await message.edit(card(order, note));
    } catch { /* the card was deleted or DMs closed */ }
  }
}

async function dmBuyer(client, content, userId) {
  try { const user = await client.users.fetch(userId); await user.send({ content, allowedMentions: { parse: [] } }); } catch { /* DMs closed */ }
}

// After a restart, owners must still get cards for payments that arrived while the bot was down.
async function notifyPending(client) {
  for (const order of store.pendingOrders()) if (!order.notify || !order.notify.length) await notifyOwners(client, order);
}

const eph = (text, color = 0x5b8cff) => cv2.ephemeralMessage([cv2.text(text)], color);

// Buttons: pay:ap (approve) -> confirm pay:ok, pay:rj (reject) -> confirm pay:ry, pay:no (cancel)
async function onButton(i, { isOwner = () => false, ownerSessionActive = () => false } = {}) {
  try {
    const [, action, ref] = i.customId.split(':');
    if (!isOwner(i.user.id)) return i.reply(eph('# 🔒 Owner only\nOnly the Uranium owner can verify payments.', 0x8b5cf6));
    if (!ownerSessionActive(i.user.id)) return i.reply(eph('# 🔒 Owner session locked\nSend `!owner unlock 123456` with your authenticator code, then press the button again.', 0xffb84d));
    const order = store.getOrder(ref);
    if (!order) return i.reply(eph('# ⚠️ Order not found\nIt may have been cleaned up.', 0xffb84d));
    if (action === 'no') return i.update(cv2.message([cv2.text('Cancelled. Nothing changed.')], 0x6b7280));
    if (order.status !== 'pending') return i.reply(eph(`# ℹ️ Already ${order.status}\nOrder \`${ref}\` was already decided.`, 0x5b8cff));
    if (action === 'ap' || action === 'rj') {
      const approving = action === 'ap';
      return i.reply({
        ...cv2.ephemeralMessage([
          cv2.text(`# ${approving ? 'Approve' : 'Reject'} this payment?`),
          cv2.text(approving
            ? `Only approve if **₹${order.amount}** with UTR \`${order.utr}\` is in your FamPay history. This gives <@${order.userId}> **${(PLANS[order.plan] || {}).label}**.`
            : `This tells <@${order.userId}> the payment could not be verified.`),
          cv2.row([cv2.button(`pay:${approving ? 'ok' : 'ry'}:${ref}`, approving ? 'Yes, approve' : 'Yes, reject', approving ? 3 : 4), cv2.button(`pay:no:${ref}`, 'Cancel', 2)]),
        ], approving ? 0x22c55e : 0xef4444),
        allowedMentions: { parse: [] },
      });
    }
    if (action === 'ok') {
      const done = store.approve(ref, i.user.id);
      const st = store.statusFor(done.userId);
      const stamp = st.premium.until || st.noPrefix.until;
      const until = st.premium.lifetime ? 'Lifetime' : stamp ? dateText(stamp) : 'active';
      await i.update(cv2.message([cv2.text(`# ✅ Approved\n\`${ref}\` is active for <@${done.userId}> (${until}).`)], 0x22c55e));
      await refreshCards(i.client, done, `Approved by <@${i.user.id}>`);
      await dmBuyer(i.client, `✅ Your Uranium ${(PLANS[done.plan] || {}).label} payment was verified. Check the status on the Premium page of the website.`, done.userId);
      return undefined;
    }
    if (action === 'ry') {
      const done = store.reject(ref, i.user.id);
      await i.update(cv2.message([cv2.text(`# ❌ Rejected\n\`${ref}\` was rejected.`)], 0xef4444));
      await refreshCards(i.client, done, `Rejected by <@${i.user.id}>`);
      await dmBuyer(i.client, `❌ Your Uranium payment ${ref} could not be verified. If you did pay, open a ticket in the support server with your transaction ID.`, done.userId);
      return undefined;
    }
    return undefined;
  } catch (error) {
    console.error('[pay button]', error);
    const text = error?.name === 'PayError' ? error.message : 'Something went wrong. Check the logs.';
    if (i.deferred || i.replied) await i.followUp(eph(text, 0xffb84d)).catch(() => {});
    else await i.reply(eph(text, 0xffb84d)).catch(() => {});
    return undefined;
  }
}

module.exports = { card, notifyOwners, notifyPending, refreshCards, onButton };
