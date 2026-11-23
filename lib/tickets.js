// lib/tickets.js
// Free ticket system: one panel with a category menu, per-category staff roles and welcome message.
const crypto = require('crypto');
const { PermissionFlagsBits: P, ChannelType: CT } = require('discord.js');
const cv2 = require('./cv2');
const { E } = require('./emojis');
const db = require('./db');

const ic = (name, fallback) => { const v = E(name); return v && v !== '◆' ? v : fallback; };
const PK = (name, fallback) => ic('pk_' + name, fallback);
const MAX_CATEGORIES = 20;
const LIMITS = { label: 40, description: 100, message: 1500, title: 100, panelText: 1800, placeholder: 100 };
const DEFAULT_MESSAGE = 'Hello {user}, thanks for opening a **{category}** ticket.\nPlease explain what you need in as much detail as you can. {staff} will be with you soon.';
const DEFAULT_PANEL = {
  title: 'Tickets',
  description: 'Select a category below to open a private ticket with our staff.\n\n**Keep in mind:** opening tickets just for fun can get you muted or banned.',
  placeholder: 'Select a category to open a ticket...',
  color: 0x5865f2,
};
const EXAMPLE_CATEGORIES = [
  { label: 'Support', emoji: '🛠️', description: 'Need help? Open a support ticket.' },
  { label: 'Rewards', emoji: '🎁', description: 'Won a giveaway or a reward? Claim it here.' },
  { label: 'Staff apply', emoji: '📝', description: 'Want to join the staff team? Apply here.' },
  { label: 'Paid promo', emoji: '💸', description: 'Want to promote your server? Talk to us.' },
];
const EPH = cv2.EPHEMERAL;

class TicketError extends Error { constructor(message) { super(message); this.name = 'TicketError'; } }

const pad = (n) => String(n).padStart(4, '0');
const clean = (value, max) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const newId = () => crypto.randomBytes(3).toString('hex');

function cfgOf(guildId) {
  const g = db.g(guildId);
  const t = (g.tickets ||= {});
  t.panel ||= {};
  for (const [key, value] of Object.entries(DEFAULT_PANEL)) if (t.panel[key] == null) t.panel[key] = value;
  t.categories ||= []; t.open ||= {};
  t.counter ||= 0; t.maxPerUser ||= 1;
  if (t.logChannelId === undefined) t.logChannelId = null;
  if (t.parentId === undefined) t.parentId = null;
  if (t.userClose === undefined) t.userClose = true;
  if (t.dmTranscript === undefined) t.dmTranscript = true;
  return t;
}

// Accepts a normal emoji or a server emoji like <:name:123456789012345678>. Returns an object for Discord or undefined.
function parseEmoji(input) {
  const text = String(input || '').trim();
  if (!text) return undefined;
  const custom = /^<(a?):(\w{2,32}):(\d{17,20})>$/.exec(text);
  if (custom) return { id: custom[3], name: custom[2], animated: custom[1] === 'a' };
  const first = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)][0]?.segment;
  if (first && /\p{Extended_Pictographic}/u.test(first) && first === text) return { name: first };
  return undefined;
}

function checkEmoji(raw) {
  const text = clean(raw, 60);
  if (text && !parseEmoji(text)) throw new TicketError('That emoji is not valid. Use a normal emoji, or a server emoji like <:name:123456789012345678>.');
  return text;
}

function addCategory(guildId, data) {
  const t = cfgOf(guildId);
  if (t.categories.length >= MAX_CATEGORIES) throw new TicketError(`You can have at most ${MAX_CATEGORIES} categories.`);
  const label = clean(data.label, LIMITS.label);
  if (!label) throw new TicketError('The category needs a name.');
  if (t.categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) throw new TicketError('A category with this name already exists.');
  const category = { id: newId(), label, emoji: checkEmoji(data.emoji), description: clean(data.description, LIMITS.description), roleIds: [], parentId: null, message: clean(data.message, LIMITS.message), pingStaff: true };
  t.categories.push(category); db.save();
  return category;
}

function updateCategory(guildId, id, patch) {
  const t = cfgOf(guildId);
  const category = t.categories.find((c) => c.id === id);
  if (!category) throw new TicketError('That category no longer exists.');
  if ('label' in patch) {
    const label = clean(patch.label, LIMITS.label);
    if (!label) throw new TicketError('The category needs a name.');
    if (t.categories.some((c) => c.id !== id && c.label.toLowerCase() === label.toLowerCase())) throw new TicketError('A category with this name already exists.');
    category.label = label;
  }
  if ('emoji' in patch) category.emoji = checkEmoji(patch.emoji);
  if ('description' in patch) category.description = clean(patch.description, LIMITS.description);
  if ('message' in patch) category.message = clean(patch.message, LIMITS.message);
  if ('roleIds' in patch) category.roleIds = [...new Set(patch.roleIds.map(String))].slice(0, 5);
  if ('parentId' in patch) category.parentId = patch.parentId ? String(patch.parentId) : null;
  if ('pingStaff' in patch) category.pingStaff = !!patch.pingStaff;
  db.save();
  return category;
}

function removeCategory(guildId, id) {
  const t = cfgOf(guildId);
  const before = t.categories.length;
  t.categories = t.categories.filter((c) => c.id !== id);
  db.save();
  return before !== t.categories.length;
}

function fill(template, ctx) {
  return String(template || DEFAULT_MESSAGE).replace(/\{(user|username|category|ticket|server|staff)\}/g, (_, key) => ctx[key] ?? '');
}
const staffText = (category) => (category.roleIds.length ? category.roleIds.map((id) => `<@&${id}>`).join(' ') : 'Our staff');

// ----- panel -----
function selectEmoji(raw) { return parseEmoji(raw); }

function panelMessage(guild) {
  const t = cfgOf(guild.id);
  const list = t.categories.map((c, n) => `**${n + 1}.** ${c.emoji ? c.emoji + ' ' : ''}**${c.label}**${c.description ? ' — ' + c.description : ''}`).join('\n');
  const options = t.categories.map((c) => {
    const option = { label: c.label, value: c.id };
    if (c.description) option.description = c.description;
    const emoji = selectEmoji(c.emoji);
    if (emoji) option.emoji = emoji;
    return option;
  });
  const kids = [cv2.text(`# ${t.panel.title}`), cv2.text(t.panel.description)];
  if (list) kids.push(cv2.text(list.slice(0, 3500)));
  kids.push(cv2.separator());
  kids.push(cv2.row([cv2.select('tkt:menu', t.panel.placeholder, options.length ? options : [{ label: 'No categories yet', value: 'none' }], !options.length)]));
  return cv2.message(kids, t.panel.color);
}

async function postPanel(guild, channel) {
  const t = cfgOf(guild.id);
  if (!t.categories.length) throw new TicketError('Add at least one category first.');
  const old = t.panel.channelId && t.panel.messageId
    ? await guild.channels.fetch(t.panel.channelId).then((c) => c?.messages.fetch(t.panel.messageId)).catch(() => null) : null;
  const message = await channel.send(panelMessage(guild));
  if (old) await old.delete().catch(() => {});
  t.panel.channelId = channel.id; t.panel.messageId = message.id; db.save();
  return message;
}

async function refreshPanel(guild) {
  const t = cfgOf(guild.id);
  if (!t.panel.channelId || !t.panel.messageId) return false;
  try {
    const channel = await guild.channels.fetch(t.panel.channelId);
    const message = await channel.messages.fetch(t.panel.messageId);
    await message.edit(panelMessage(guild));
    return true;
  } catch { return false; }
}

// ----- permissions and helpers -----
function isStaff(member, category) {
  if (!member) return false;
  if (member.permissions?.has(P.ManageChannels)) return true;
  return !!category && category.roleIds.some((id) => member.roles?.cache?.has(id));
}

function cleanOpen(guild, t) {
  for (const id of Object.keys(t.open)) if (!guild.channels.cache.has(id)) delete t.open[id];
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'ticket';
const eph = (text, color = 0x5b8cff) => cv2.ephemeralMessage([cv2.text(text)], color);
const creating = new Set();
const cooldown = new Map();

async function createTicket(i) {
  const guild = i.guild;
  const t = cfgOf(guild.id);
  const category = t.categories.find((c) => c.id === i.values?.[0]);
  const resetMenu = () => i.message?.edit?.(panelMessage(guild)).catch(() => {});
  if (!category) { await i.reply(eph('# ⚠️ Category missing\nThis category was removed. Ask the staff to refresh the panel.', 0xffb84d)); return resetMenu(); }
  const key = guild.id + ':' + i.user.id;
  if (creating.has(key) || Date.now() - (cooldown.get(key) || 0) < 4000) return i.reply(eph('# ⏳ One moment\nYour ticket is already being created.', 0xffb84d));
  creating.add(key);
  try {
    cleanOpen(guild, t);
    const mine = Object.entries(t.open).filter(([, x]) => x.userId === i.user.id);
    if (mine.length >= t.maxPerUser) {
      await i.reply(eph(`# 🎫 You already have a ticket\n${mine.map(([id]) => `<#${id}>`).join(' ')}\nClose it before opening a new one.`, 0xffb84d));
      return resetMenu();
    }
    const me = guild.members.me;
    if (!me?.permissions.has(P.ManageChannels)) return i.reply(eph('# ⚠️ I cannot create tickets\nI need the **Manage Channels** permission. Ask an admin to give it to my role.', 0xffb84d));
    await i.deferReply({ flags: EPH });
    t.counter += 1; const number = t.counter;
    const parentId = category.parentId || t.parentId;
    const parent = parentId && guild.channels.cache.get(parentId)?.type === CT.GuildCategory ? parentId : undefined;
    const roles = category.roleIds.filter((id) => guild.roles.cache.has(id));
    const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
    const channel = await guild.channels.create({
      name: `${slug(category.label)}-${pad(number)}`, type: CT.GuildText, parent,
      topic: `ticket:${i.user.id}:${category.id}:${number}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
        { id: i.user.id, allow },
        ...roles.map((id) => ({ id, allow })),
        { id: i.client.user.id, allow: [...allow, P.ManageChannels, P.ManageMessages] },
      ],
      reason: `Ticket opened by ${i.user.tag || i.user.username}`,
    });
    t.open[channel.id] = { userId: i.user.id, catId: category.id, number, openedAt: Date.now(), claimedBy: null }; db.save();
    const ctx = { user: `<@${i.user.id}>`, username: i.user.username, category: category.label, ticket: pad(number), server: guild.name, staff: staffText({ roleIds: roles }) };
    const ping = [`<@${i.user.id}>`, ...(category.pingStaff ? roles.map((id) => `<@&${id}>`) : [])].join(' ');
    await channel.send({
      ...cv2.message([
        cv2.text(ping),
        cv2.text(`# ${category.emoji || PK('support_team', '🎫')} ${category.label} · #${pad(number)}`),
        cv2.text(fill(category.message, ctx).slice(0, 3500)),
        cv2.separator(),
        cv2.row([cv2.button('tkt:close', 'Close ticket', 4, '🔒'), cv2.button('tkt:claim', 'Claim', 3, '🙋')]),
      ], t.panel.color),
      allowedMentions: { users: [i.user.id], roles: category.pingStaff ? roles : [] },
    });
    if (t.logChannelId) {
      const log = await guild.channels.fetch(t.logChannelId).catch(() => null);
      if (log?.isTextBased?.()) await log.send({ content: `🎫 **${category.label} #${pad(number)}** opened by <@${i.user.id}> → <#${channel.id}>`, allowedMentions: { parse: [] } }).catch(() => {});
    }
    cooldown.set(key, Date.now());
    await i.editReply(cv2.message([cv2.text(`# ✅ Ticket created\n<#${channel.id}>`)], 0x22c55e));
    return resetMenu();
  } catch (error) {
    console.error('[tickets] create failed', error);
    const text = '# ⚠️ Could not create the ticket\nI may be missing permissions or the channel limit is reached. Tell a server admin.';
    if (i.deferred || i.replied) return i.editReply(cv2.message([cv2.text(text)], 0xffb84d)).catch(() => {});
    return i.reply(eph(text, 0xffb84d)).catch(() => {});
  } finally { creating.delete(key); }
}

async function buildTranscript(channel) {
  const all = []; let before;
  for (let round = 0; round < 5; round += 1) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values()); before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse().map((m) => {
    const stamp = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const files = m.attachments?.size ? ' ' + [...m.attachments.values()].map((a) => `[${a.url}]`).join(' ') : '';
    return `[${stamp}] ${m.author?.tag || m.author?.username || 'unknown'}: ${m.content || ''}${files}`;
  }).join('\n');
}

async function closeTicket(channel, closer, reason = '') {
  const guild = channel.guild; const t = cfgOf(guild.id);
  const record = t.open[channel.id];
  if (!record) throw new TicketError('This is not an open ticket.');
  const category = t.categories.find((c) => c.id === record.catId);
  delete t.open[channel.id]; db.save();
  let transcript = null;
  try { transcript = await buildTranscript(channel); } catch (error) { console.warn('[tickets] transcript failed', error.message); }
  const name = `${category?.label || 'Ticket'} #${pad(record.number)}`;
  const summary = `🎫 **${name}** closed by <@${closer.id}>\nOpened by <@${record.userId}> <t:${Math.floor(record.openedAt / 1000)}:R>` +
    `${record.claimedBy ? `\nClaimed by <@${record.claimedBy}>` : ''}${reason ? `\nReason: ${clean(reason, 200)}` : ''}`;
  const withFile = (content) => ({ content, files: transcript ? [{ attachment: Buffer.from(transcript, 'utf8'), name: `ticket-${pad(record.number)}.txt` }] : [], allowedMentions: { parse: [] } });
  if (t.logChannelId) {
    const log = await guild.channels.fetch(t.logChannelId).catch(() => null);
    if (log?.isTextBased?.()) await log.send(withFile(summary)).catch(() => {});
  }
  if (t.dmTranscript !== false) {
    const owner = await channel.client.users.fetch(record.userId).catch(() => null);
    if (owner) await owner.send(withFile(`Your ticket **${name}** in **${guild.name}** was closed.${reason ? `\nReason: ${clean(reason, 200)}` : ''}`)).catch(() => {});
  }
  await channel.send({ ...cv2.message([cv2.text('# 🔒 Closing ticket\nThis channel will be deleted in 5 seconds.')], 0xef4444), allowedMentions: { parse: [] } }).catch(() => {});
  setTimeout(() => channel.delete(`Ticket closed by ${closer.tag || closer.username || closer.id}`).catch(() => {}), 5000);
  return record;
}

async function onComponent(i, { blacklisted = () => false } = {}) {
  try {
    if (!i.inGuild()) return i.reply(eph('Tickets only work inside a server.'));
    if (blacklisted(i.user.id)) return i.reply({ content: 'You are not allowed to use this bot.', flags: EPH });
    const [, action] = i.customId.split(':');
    if (action === 'menu') return createTicket(i);
    const t = cfgOf(i.guild.id);
    const record = t.open[i.channelId];
    if (!record) return i.reply(eph('# ℹ️ Not an open ticket\nThis channel is not tracked as an open ticket.'));
    const category = t.categories.find((c) => c.id === record.catId);
    const staff = isStaff(i.member, category);
    if (action === 'claim') {
      if (!staff) return i.reply(eph('# 🔒 Staff only\nOnly ticket staff can claim a ticket.', 0x8b5cf6));
      if (record.claimedBy) return i.reply(eph(`# ℹ️ Already claimed\n<@${record.claimedBy}> is handling this ticket.`));
      record.claimedBy = i.user.id; db.save();
      return i.reply({ ...cv2.message([cv2.text(`# 🙋 Ticket claimed\n<@${i.user.id}> will help you.`)], 0x22c55e), allowedMentions: { parse: [] } });
    }
    const canClose = staff || (t.userClose && record.userId === i.user.id);
    if (action === 'close') {
      if (!canClose) return i.reply(eph('# 🔒 Not allowed\nOnly the ticket owner or the staff can close this ticket.', 0x8b5cf6));
      return i.reply({ ...cv2.ephemeralMessage([cv2.text('# Close this ticket?\nA transcript is saved and the channel is deleted.'), cv2.row([cv2.button('tkt:yes', 'Yes, close', 4), cv2.button('tkt:no', 'Cancel', 2)])], 0xef4444) });
    }
    if (action === 'no') return i.update(cv2.message([cv2.text('Cancelled. The ticket stays open.')], 0x6b7280));
    if (action === 'yes') {
      if (!canClose) return i.reply(eph('# 🔒 Not allowed\nOnly the ticket owner or the staff can close this ticket.', 0x8b5cf6));
      await i.update(cv2.message([cv2.text('# 🔒 Closing…')], 0xef4444));
      await closeTicket(i.channel, i.user);
    }
    return undefined;
  } catch (error) {
    console.error('[tickets] component failed', error);
    const text = error?.name === 'TicketError' ? error.message : 'Something went wrong with that ticket button.';
    if (i.deferred || i.replied) await i.followUp(eph(text, 0xffb84d)).catch(() => {});
    else await i.reply(eph(text, 0xffb84d)).catch(() => {});
    return undefined;
  }
}

module.exports = {
  TicketError, MAX_CATEGORIES, LIMITS, DEFAULT_MESSAGE, EXAMPLE_CATEGORIES, cfgOf, parseEmoji, addCategory, updateCategory, removeCategory,
  fill, staffText, panelMessage, postPanel, refreshPanel, isStaff, createTicket, closeTicket, buildTranscript, onComponent, pad, PK, ic,
};
