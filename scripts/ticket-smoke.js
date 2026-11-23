const assert = require('node:assert/strict');
const { Collection, ChannelType: CT } = require('discord.js');
const tickets = require('../lib/tickets');
const ui = require('../lib/ticket-ui');
const ticketCommands = require('../commands/ticket');

let seq = 0;
const OWNER_USER = '300000000000000001';
const STAFF_USER = '300000000000000002';
const OTHER_USER = '300000000000000003';

function mkEnv() {
  const dms = []; const logSent = []; const created = [];
  const client = { user: { id: '400000000000000001' }, users: { fetch: async (id) => ({ id, send: async (p) => { dms.push([id, p]); } }) } };
  const id = '90000000000' + String(++seq).padStart(7, '0');
  const channels = new Collection();
  channels.set('500000000000000001', { id: '500000000000000001', type: CT.GuildCategory });
  channels.set('600000000000000001', { id: '600000000000000001', type: CT.GuildText, isTextBased: () => true, send: async (p) => { logSent.push(p); } });
  const roles = new Collection([['700000000000000001', { id: '700000000000000001' }], ['700000000000000002', { id: '700000000000000002' }]]);
  const guild = {
    id, name: 'Test Server', ownerId: '100000000000000001', roles: { everyone: { id }, cache: roles },
    members: { me: { permissions: { has: () => true } } },
    channels: {
      cache: channels,
      fetch: async (cid) => channels.get(cid) || null,
      create: async (options) => {
        const sent = [];
        const channel = { id: '8000000000000000' + String(created.length + 10), ...options, sent, deleted: false, guild, client, isTextBased: () => true,
          send: async (p) => { sent.push(p); }, delete: async () => { channel.deleted = true; },
          messages: { fetch: async () => new Collection([['1', { id: '1', createdTimestamp: Date.now(), author: { tag: 'User#0001' }, content: 'hello there', attachments: new Collection() }]]) } };
        created.push(channel); channels.set(channel.id, channel); return channel;
      },
    },
  };
  return { guild, client, dms, logSent, created, channels };
}
const member = (roleIds = [], manage = false) => ({ permissions: { has: () => manage }, roles: { cache: new Collection(roleIds.map((r) => [r, {}])) } });
function mkInteraction(env, userId, extra = {}) {
  const replies = [];
  const i = { guild: env.guild, client: env.client, inGuild: () => true, user: { id: userId, username: 'user' + userId.slice(-2), tag: 'user#' + userId.slice(-4) }, member: member(), customId: 'tkt:menu', values: [],
    replied: false, deferred: false, message: { edit: async () => { i.menuReset = (i.menuReset || 0) + 1; } },
    reply: async (p) => { i.replied = true; replies.push(p); }, deferReply: async () => { i.deferred = true; }, editReply: async (p) => { replies.push(p); },
    followUp: async (p) => { replies.push(p); }, update: async (p) => { replies.push(p); }, replies, ...extra };
  return i;
}
const text = (value) => JSON.stringify(value);
function collect(node, out = { ids: [], rows: [], total: 0 }) {
  if (!node || typeof node !== 'object') return out;
  if (node.type) out.total += 1;
  if (node.type === 1) out.rows.push(node);
  if (node.custom_id) out.ids.push(node.custom_id);
  Object.values(node).forEach((v) => collect(v, out));
  return out;
}
function checkView(view, label) {
  const found = collect(view.components);
  assert.ok(view.flags & (1 << 15), label + ' is Components V2');
  assert.ok(found.rows.length <= 5, label + ' rows ' + found.rows.length);
  assert.equal(new Set(found.ids).size, found.ids.length, label + ' custom ids are unique');
  assert.ok(found.total <= 40, label + ' components ' + found.total);
  for (const id of found.ids) assert.ok(id.length <= 100);
  for (const row of found.rows) {
    const kinds = row.components.map((c) => c.type);
    if (kinds.includes(2)) assert.ok(kinds.length <= 5 && kinds.every((k) => k === 2), label + ' button row');
    else assert.equal(kinds.length, 1, label + ' select row has one menu');
    for (const c of row.components) if (c.options) { assert.ok(c.options.length <= 25); assert.ok(c.max_values <= c.options.length || c.max_values === undefined); }
  }
}

async function main() {
  // ---- emoji parsing
  assert.deepEqual(tickets.parseEmoji('🛠️'), { name: '🛠️' });
  assert.deepEqual(tickets.parseEmoji('<:cool:123456789012345678>'), { id: '123456789012345678', name: 'cool', animated: false });
  assert.equal(tickets.parseEmoji('<a:wave:123456789012345678>').animated, true);
  assert.equal(tickets.parseEmoji('hello'), undefined);
  assert.equal(tickets.parseEmoji('🛠️🛠️'), undefined);

  // ---- categories
  const env = mkEnv(); const { guild } = env;
  assert.throws(() => tickets.addCategory(guild.id, { label: '  ' }), /needs a name/);
  assert.throws(() => tickets.addCategory(guild.id, { label: 'X', emoji: 'nope' }), /emoji is not valid/);
  const support = tickets.addCategory(guild.id, { label: 'Support', emoji: '🛠️', description: 'Need help?' });
  assert.throws(() => tickets.addCategory(guild.id, { label: 'support' }), /already exists/);
  tickets.updateCategory(guild.id, support.id, {
    roleIds: ['700000000000000001'], parentId: '500000000000000001',
    message: 'Hi {user}! {staff} will answer your {category} ticket #{ticket} on {server}. @everyone',
  });
  for (let n = 0; n < 19; n += 1) tickets.addCategory(guild.id, { label: 'Cat ' + n });
  assert.throws(() => tickets.addCategory(guild.id, { label: 'One too many' }), /at most 20/);
  for (const c of tickets.cfgOf(guild.id).categories.slice(1)) tickets.removeCategory(guild.id, c.id);
  assert.equal(tickets.cfgOf(guild.id).categories.length, 1);
  assert.equal(tickets.fill('{user}|{staff}|{nope}', { user: 'U', staff: 'S' }), 'U|S|{nope}');

  // ---- panel message
  const panel = tickets.panelMessage(guild);
  checkView(panel, 'panel');
  assert.ok(text(panel).includes('tkt:menu') && text(panel).includes('Support'));
  assert.ok(collect(panel.components).rows.some((r) => r.components[0].options?.[0]?.emoji?.name === '🛠️'));

  // ---- opening a ticket
  const t = tickets.cfgOf(guild.id);
  t.logChannelId = '600000000000000001';
  const open1 = mkInteraction(env, OWNER_USER, { values: [support.id] });
  await tickets.createTicket(open1);
  assert.equal(env.created.length, 1);
  const ch = env.created[0];
  assert.equal(ch.name, 'support-0001');
  assert.equal(ch.parent, '500000000000000001');
  assert.equal(ch.topic, `ticket:${OWNER_USER}:${support.id}:1`);
  const ow = ch.permissionOverwrites;
  assert.ok(ow.some((o) => o.id === guild.id && o.deny.length === 1), 'everyone cannot see it');
  assert.ok(ow.some((o) => o.id === OWNER_USER && o.allow.length >= 4));
  assert.ok(ow.some((o) => o.id === '700000000000000001' && o.allow.length >= 4), 'staff role can see it');
  assert.ok(ow.some((o) => o.id === '400000000000000001' && o.allow.length > 5), 'bot keeps access');
  const welcome = ch.sent[0]; const welcomeText = text(welcome);
  assert.ok(welcomeText.includes(`Hi <@${OWNER_USER}>! <@&700000000000000001> will answer your Support ticket #0001 on Test Server.`));
  assert.ok(welcomeText.includes('tkt:close') && welcomeText.includes('tkt:claim'));
  assert.deepEqual(welcome.allowedMentions, { users: [OWNER_USER], roles: ['700000000000000001'] }, 'only the member and staff roles are pinged');
  assert.ok(text(env.logSent[0]).includes('opened by'));
  assert.ok(text(open1.replies.at(-1)).includes('Ticket created'));
  assert.equal(open1.menuReset, 1, 'the menu is reset so it can be used again');
  checkView(welcome, 'welcome');

  // limits and clean-up
  const again = mkInteraction(env, OWNER_USER, { values: [support.id] });
  await tickets.createTicket(again);
  assert.ok(text(again.replies[0]).includes('already have a ticket'));
  assert.equal(env.created.length, 1);
  t.maxPerUser = 2;
  await new Promise((resolve) => setTimeout(resolve, 4100));
  await tickets.createTicket(mkInteraction(env, OWNER_USER, { values: [support.id] }));
  assert.equal(env.created.length, 2);
  assert.equal(env.created[1].name, 'support-0002');
  env.channels.delete(env.created[1].id);
  t.maxPerUser = 1; delete t.open[env.created[1].id];
  const gone = mkInteraction(env, OTHER_USER, { values: ['unknown'] });
  await tickets.createTicket(gone);
  assert.ok(text(gone.replies[0]).includes('Category missing'));
  const noPerm = mkEnv(); noPerm.guild.members.me.permissions.has = () => false;
  const c2 = tickets.addCategory(noPerm.guild.id, { label: 'Help' });
  const denied = mkInteraction(noPerm, OWNER_USER, { values: [c2.id] });
  await tickets.createTicket(denied);
  assert.ok(text(denied.replies[0]).includes('Manage Channels'));
  assert.equal(noPerm.created.length, 0);

  // ---- claim and close
  const inTicket = (userId, customId, who) => mkInteraction(env, userId, { customId, channelId: ch.id, channel: ch, member: who });
  const nonStaffClaim = inTicket(OTHER_USER, 'tkt:claim', member());
  await tickets.onComponent(nonStaffClaim);
  assert.ok(text(nonStaffClaim.replies[0]).includes('Staff only'));
  const staffClaim = inTicket(STAFF_USER, 'tkt:claim', member(['700000000000000001']));
  await tickets.onComponent(staffClaim);
  assert.equal(t.open[ch.id].claimedBy, STAFF_USER);
  const claimAgain = inTicket(STAFF_USER, 'tkt:claim', member(['700000000000000001']));
  await tickets.onComponent(claimAgain);
  assert.ok(text(claimAgain.replies[0]).includes('Already claimed'));

  const strangerClose = inTicket(OTHER_USER, 'tkt:close', member());
  await tickets.onComponent(strangerClose);
  assert.ok(text(strangerClose.replies[0]).includes('Not allowed'));
  t.userClose = false;
  const ownerBlocked = inTicket(OWNER_USER, 'tkt:close', member());
  await tickets.onComponent(ownerBlocked);
  assert.ok(text(ownerBlocked.replies[0]).includes('Not allowed'));
  t.userClose = true;
  const ownerClose = inTicket(OWNER_USER, 'tkt:close', member());
  await tickets.onComponent(ownerClose);
  assert.ok(text(ownerClose.replies[0]).includes('tkt:yes'), 'closing asks for confirmation');
  assert.ok(t.open[ch.id], 'still open before confirming');
  await tickets.onComponent(inTicket(OWNER_USER, 'tkt:no', member()));
  assert.ok(t.open[ch.id], 'cancel keeps it open');

  const timers = []; const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => { timers.push(fn); return 0; };
  try { await tickets.onComponent(inTicket(OWNER_USER, 'tkt:yes', member())); } finally { global.setTimeout = realSetTimeout; }
  assert.equal(t.open[ch.id], undefined, 'closed tickets are no longer tracked');
  const logged = env.logSent.at(-1);
  assert.ok(logged.content.includes('Support #0001') && logged.content.includes(`Claimed by <@${STAFF_USER}>`));
  assert.equal(logged.files[0].name, 'ticket-0001.txt');
  assert.ok(logged.files[0].attachment.toString().includes('hello there'), 'transcript has the messages');
  assert.ok(env.dms.some(([id, p]) => id === OWNER_USER && p.files.length === 1), 'member gets the transcript');
  assert.ok(text(ch.sent.at(-1)).includes('Closing ticket'));
  timers[0](); await Promise.resolve();
  assert.equal(ch.deleted, true, 'channel is deleted after the notice');

  // ---- slash command guards
  assert.deepEqual(ticketCommands.commands.map((c) => c.name), ['config', 'post', 'add', 'remove', 'close']);
  assert.equal(ticketCommands.commands[0].custom, true);
  const add = ticketCommands.commands.find((c) => c.name === 'add');
  await assert.rejects(() => add.run({ g: guild, ch: { id: 'not-a-ticket' }, i: { member: member(), user: { id: OTHER_USER } }, u: () => ({ id: STAFF_USER }) }), /not an open ticket/);
  const post = ticketCommands.commands.find((c) => c.name === 'post');
  await assert.rejects(() => post.run({ g: guild, ch: { id: 'x' }, i: { user: { id: OTHER_USER }, memberPermissions: { has: () => false } }, c: () => null }), /Manage Server/);

  // ---- setup panel views
  const view = mkEnv(); const vg = view.guild;
  const cat = tickets.addCategory(vg.id, { label: 'Rewards', emoji: '🎁' });
  tickets.updateCategory(vg.id, cat.id, { roleIds: ['700000000000000001'], parentId: '500000000000000001' });
  tickets.cfgOf(vg.id).logChannelId = '600000000000000001';
  checkView(ui.homeView(vg), 'home');
  checkView(ui.homeView(vg, true), 'home (closed)');
  checkView(ui.categoryView(vg, cat.id), 'category');
  checkView(ui.categoryView(vg, cat.id, true), 'category (confirm)');
  checkView(ui.settingsView(vg), 'settings');
  assert.ok(text(ui.categoryView(vg, cat.id)).includes('default_values'), 'saved roles are preselected');
  assert.ok(ui.isManager(vg, '100000000000000001', null) && !ui.isManager(vg, OTHER_USER, member()));
  const many = mkEnv();
  for (let n = 0; n < 20; n += 1) tickets.addCategory(many.guild.id, { label: 'Many ' + n });
  checkView(ui.homeView(many.guild), 'home with 20 categories');
  checkView(tickets.panelMessage(many.guild), 'panel with 20 categories');
  console.log('Ticket categories, panel, creation, claim, close, transcripts and setup views checks passed.');
}
module.exports = main().catch((error) => { console.error(error); process.exit(1); });
