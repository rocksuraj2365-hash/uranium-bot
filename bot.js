const http = require('http');
const crypto = require('crypto');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const db = require('./lib/db');
const ui = require('./lib/ui');
require('./lib/ui2');
const art = require('./lib/art');
const prefix = require('./lib/prefix');
const ai = require('./lib/ai');
const security = require('./lib/security');
const fortress = require('./lib/fortress');
const devTools = require('./lib/dev-tools');
const dmAi = require('./lib/dm-ai');
const np = require('./lib/np');
const music = require('./lib/music');
const supportTemplate = require('./lib/support-template');
const emojis = require('./lib/emojis');
const waitForGatewayReady = require('./lib/gateway-ready');
const { UserError, permName } = require('./lib/util');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DEV_GUILD_ID, PORT } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) { console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID'); process.exit(1); }

let client = null, started = false, contentIntent = false;

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
if (PORT) http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok', ready: started });
  if (req.method === 'GET' && url.pathname === '/owner/stats') {
    const secret = process.env.DASHBOARD_API_SECRET;
    if (!secret || !safeEqual(req.headers['x-dashboard-secret'], secret)) return sendJson(res, 401, { error: 'Unauthorized dashboard request' });
    const ownerId = String(req.headers['x-owner-user-id'] || '');
    if (!isOwner(ownerId)) return sendJson(res, 403, { error: 'Owner access only' });
    if (!client || !started) return sendJson(res, 503, { error: 'Bot is not ready yet.' });
    const servers = [...client.guilds.cache.values()].map(guild => {
      const record = db.g(guild.id);
      return { id: guild.id, name: guild.name, memberCount: guild.memberCount || 0, createdAt: guild.createdTimestamp, caseCount: (record.cases || []).length, warnCount: (record.warns || []).length };
    }).sort((a,b) => b.memberCount - a.memberCount);
    return sendJson(res, 200, {
      ready: true, guildCount: servers.length,
      memberTotal: servers.reduce((sum, g) => sum + g.memberCount, 0),
      caseCount: servers.reduce((sum, g) => sum + g.caseCount, 0),
      warnCount: servers.reduce((sum, g) => sum + g.warnCount, 0),
      databaseGuildRecords: servers.length, pingMs: client.ws.ping >= 0 ? client.ws.ping : null,
      uptimeSeconds: process.uptime(), memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024), servers
    });
  }
  const match = /^\/control\/guild\/(\d{17,20})$/.exec(url.pathname);
  if (!match || !['GET', 'POST'].includes(req.method)) return sendJson(res, 404, { error: 'Not found' });
  const secret = process.env.DASHBOARD_API_SECRET;
  if (!secret || !safeEqual(req.headers['x-dashboard-secret'], secret)) return sendJson(res, 401, { error: 'Unauthorized dashboard request' });
  const userId = String(req.headers['x-discord-user-id'] || '');
  if (!/^\d{17,20}$/.test(userId)) return sendJson(res, 401, { error: 'Invalid Discord user' });
  if (!client || !started) return sendJson(res, 503, { error: 'Bot is still starting. Retry shortly.' });
  try {
    const guild = await client.guilds.fetch(match[1]);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || (!member.permissions.has('ManageGuild') && !member.permissions.has('Administrator'))) return sendJson(res, 403, { error: 'Manage Server permission is required.' });
    const config = db.g(guild.id).config;
    if (req.method === 'GET') {
      await guild.channels.fetch().catch(() => {});
      const channels = [...guild.channels.cache.values()].filter(ch => [0, 5].includes(ch.type)).sort((a,b) => a.rawPosition-b.rawPosition).map(ch => ({ id: ch.id, name: ch.name, type: ch.type }));
      const aiLocked = process.env.AI_ENABLED !== 'true' || !process.env.GEMINI_API_KEY;
      return sendJson(res, 200, { settings: { ai: !aiLocked && ai.available(guild.id), aiLocked, prefix: config.prefix || '!', aiChannel: config.aiChannel || '', modlog: config.modlog || '' }, channels });
    }
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 12000) return sendJson(res, 413, { error: 'Request too large' }); }
    const input = JSON.parse(raw || '{}');
    const nextPrefix = String(input.prefix ?? config.prefix ?? '!');
    if (!nextPrefix || nextPrefix.length > 3 || /[`\s]/.test(nextPrefix)) return sendJson(res, 400, { error: 'Prefix must be 1 to 3 characters with no spaces.' });
    const aiLocked = process.env.AI_ENABLED !== 'true' || !process.env.GEMINI_API_KEY;
    if (aiLocked && input.ai === true) return sendJson(res, 403, { error: 'AI is globally disabled while provider compliance is reviewed.' });
    const selected = {};
    for (const key of ['aiChannel', 'modlog']) {
      const id = String(input[key] || '');
      if (!id) { selected[key] = ''; continue; }
      const channel = await guild.channels.fetch(id).catch(() => null);
      if (!channel || ![0, 5].includes(channel.type)) return sendJson(res, 400, { error: 'Choose a valid text channel from this server.' });
      selected[key] = channel.id;
    }
    config.ai = aiLocked ? false : input.ai !== false; config.prefix = nextPrefix;
    if (selected.aiChannel) config.aiChannel = selected.aiChannel; else delete config.aiChannel;
    if (selected.modlog) config.modlog = selected.modlog; else delete config.modlog;
    db.save();
    return sendJson(res, 200, { ok: true, settings: { ai: !aiLocked && ai.available(guild.id), aiLocked, prefix: config.prefix, aiChannel: config.aiChannel || '', modlog: config.modlog || '' } });
  } catch (error) { console.error('[dashboard control]', error.message); return sendJson(res, 502, { error: 'Could not reach that server through Uranium.' }); }
}).listen(PORT, () => console.log('Bot API listening on ' + PORT));

const cats = ['member', 'message', 'channel', 'role', 'voice', 'server', 'automod', 'info', 'music', 'ai', 'premium', 'license', 'utility', 'community', 'fun', 'servertools', 'support', 'template', 'security'].map((n) => require('./commands/' + n));
prefix.CAT_SHORT.utility = 'ut'; prefix.CAT_SHORT.community = 'cm'; prefix.CAT_SHORT.fun = 'fn'; prefix.CAT_SHORT.servertools = 'st'; prefix.CAT_SHORT.support = 'sp'; prefix.CAT_SHORT.template = 'tpl'; prefix.CAT_SHORT.security = 'sec';
for (const cat of cats) {
  // A moderation reason is always optional for both slash and prefix commands.
  for (const command of cat.commands) {
    for (const option of command.opts || []) if (option.n === 'reason') option.req = false;
  }
  cat.map = new Map(cat.commands.map((c) => [c.name, c]));
}
const byName = new Map(cats.map((c) => [c.name, c]));
require('./lib/patch')(byName);
Object.assign(prefix.CURATED, { ai: 'ai ask', aichan: 'ai channel', aion: 'ai toggle', aistatus: 'ai status', aireset: 'ai reset' });
prefix.CAT_SHORT.ai = 'ai';
Object.assign(prefix.CURATED, { play: 'music play', stop: 'music stop', pause: 'music pause', resume: 'music resume', vol: 'music volume', now: 'music nowplaying', radio: 'music stations', mpanel: 'music panel', mjoin: 'music join', mleave: 'music leave', m247: 'music twentyfour7', mstatus: 'music status' });
prefix.CAT_SHORT.music = 'mu';
prefix.init(cats);
const premium = byName.get('premium');
const npDef = premium.map.get('noprefix'); npDef.opts = np.opts; npDef.run = np.run; npDef.desc = 'Premium: give or remove no-prefix access';
const aiGo = (msg, text, owner, force) => { if (blacklisted(msg.author.id) && !owner) return; if (!force && !ai.available(msg.guild.id)) return; return ai.fromMessage(msg, text, owner); };
const ownerSessions = new Map();
const OWNER_SESSION_MS = 15 * 60 * 1000;
function ownerSessionActive(id) { const until = ownerSessions.get(id) || 0; if (until <= Date.now()) { ownerSessions.delete(id); return false; } return true; }
async function handleDM(msg) {
  const id = msg.author.id, owner = isOwner(id), text = String(msg.content || '').trim();
  if (!text) return;
  if (owner && /^!owner(?:\s|$)/i.test(text)) {
    const parts = text.split(/\s+/), action = (parts[1] || 'status').toLowerCase();
    if (action === 'lock') { ownerSessions.delete(id); return msg.reply('Owner session locked.'); }
    if (action === 'status') return msg.reply(ownerSessionActive(id) ? 'Owner session unlocked. It expires after 15 minutes.' : 'Owner session locked. Use !owner unlock followed by your 6-digit authenticator code.');
    if (action === 'unlock') {
      const code = parts[2] || '';
      if (!/^\d{6}$/.test(code)) return msg.reply('Use: !owner unlock 123456');
      if (!security.verifyTotp(process.env.OWNER_TOTP_SECRET, code)) return msg.reply('Verification failed. Check your authenticator code.');
      ownerSessions.set(id, Date.now() + OWNER_SESSION_MS);
      console.log('[security] Owner DM session unlocked.');
      return msg.reply('Owner identity verified. Session active for 15 minutes. Sensitive actions require separate confirmation.');
    }
    return msg.reply('Owner controls: !owner status | !owner unlock 123456 | !owner lock');
  }
  if (owner && /^!dev\s+confirm\s+\d{6}$/i.test(text)) {
    if (!ownerSessionActive(id)) return msg.reply('Owner session is locked. Unlock first with !owner unlock 123456.');
    const code = text.split(/\s+/)[2];
    try {
      const result = await devTools.confirm(id, code);
      return msg.reply({ content: 'Developer action result:\n' + JSON.stringify(result).slice(0, 1800), allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('[DEV TOOL CONFIRM]', error);
      return msg.reply('The confirmed action failed: ' + String(error.message || error).slice(0, 300));
    }
  }
  return dmAi.reply(msg, owner && ownerSessionActive(id), () => owner && ownerSessionActive(id));
}
/* ---------- owner & blacklist ---------- */
const OWNERS = new Set((process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean));
const isOwner = (id) => OWNERS.has(id);
const G = () => db.g('__global');
const blacklisted = (id) => (G().blacklist || []).some((x) => x.id === id);
const getPrefix = (gid) => db.g(gid).config.prefix || '!';
ai.init({ cats, byName, execute: (...a) => execute(...a), isOwner, getPrefix });
async function loadOwners() {
  console.log('Configured owner IDs loaded:', OWNERS.size);
}

/* ---------- slash command builder ---------- */
function addOpt(sc, x) {
  const base = (o) => o.setName(x.n).setDescription(x.d).setRequired(!!x.req);
  switch (x.t) {
    case 'user': return sc.addUserOption(base);
    case 'role': return sc.addRoleOption(base);
    case 'bool': return sc.addBooleanOption(base);
    case 'int': return sc.addIntegerOption((o) => { base(o); if (x.min != null) o.setMinValue(x.min); if (x.max != null) o.setMaxValue(x.max); return o; });
    case 'chan': return sc.addChannelOption((o) => { base(o); if (x.types) o.addChannelTypes(...x.types); return o; });
    default: return sc.addStringOption((o) => {
      base(o); if (x.max) o.setMaxLength(x.max);
      if (x.choices) o.addChoices(...x.choices.map((v) => (typeof v === 'string' ? { name: v, value: v } : v)));
      else if (x.ac) o.setAutocomplete(true);
      return o;
    });
  }
}
function build(cat) {
  const b = new SlashCommandBuilder().setName(cat.name).setDescription(cat.description);
  if (b.setContexts) b.setContexts(0); else b.setDMPermission(false);
  for (const c of cat.commands) {
    b.addSubcommand((sc) => {
      sc.setName(c.name).setDescription(c.desc);
      for (const x of [...c.opts].sort((a, z) => (z.req ? 1 : 0) - (a.req ? 1 : 0))) addOpt(sc, x);
      return sc;
    });
  }
  return b.toJSON();
}

/* ---------- running a command (slash or prefix) ---------- */
function ctx(i, me) {
  const o = i.options;
  return {
    i, g: i.guild, ch: i.channel, me, cats, isOwner: isOwner(i.user.id), prefix: getPrefix(i.guildId), short: prefix.shortOf,
    u: (n) => o.getUser(n), s: (n) => o.getString(n), n: (n) => o.getInteger(n), b: (n) => o.getBoolean(n), c: (n) => o.getChannel(n), r: (n) => o.getRole(n),
    m: async (n) => { const u = o.getUser(n); return u ? i.guild.members.fetch(u.id).catch(() => null) : null; },
    reason: () => o.getString('reason') || 'No reason provided',
    audit: () => `${o.getString('reason') || 'No reason provided'} | by ${i.user.username}`.slice(0, 500),
    case: (type, userId, extra = {}) => db.addCase(i.guildId, { type, userId, modId: i.user.id, reason: o.getString('reason') || 'No reason provided', ...extra }),
    async notify(user, title, desc, color = ui.COLORS.warn, links) {
      try {
        const e = new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setFooter({ text: `Uranium • ${i.guild.name}` }).setTimestamp();
        const appeal = db.g(i.guildId).config.appeal; const comps = [];
        if (appeal && links !== false) comps.push({ type: 1, components: [{ type: 2, style: 5, label: 'Appeal', url: appeal }] });
        await user.send({ embeds: [e], components: comps }); return '✅ Sent';
      } catch { return '⚠️ DMs closed'; }
    },
  };
}
async function execute(i, cat, def) {
  const label = `/${cat.name} ${def.name}`;
  await i.deferReply(def.ephemeral ? { flags: ui.EPH } : undefined);
  try {
    if (def.owner && !isOwner(i.user.id)) throw new UserError('💎 This is a **Premium** command and it is only for the bot owner.', 'Normal moderation commands are in the other groups. Use the help menu.');
    if (def.premium && !premium.hasAccess(i.guildId, i.user.id)) throw new UserError('💎 This server feature requires Premium access.', 'Only the bot owner can grant it with `/license grant` or `!premium add @member`.');
    const me = await i.guild.members.fetchMe();
    if (def.perm) {
      if (!i.memberPermissions.has(def.perm)) throw new UserError(`You need the **${permName(def.perm)}** permission to use \`${label}\`.`, 'Ask a server admin to give you that permission or a role that has it.');
      if (!me.permissions.has(def.perm)) throw new UserError(`I (Uranium) am missing the **${permName(def.perm)}** permission.`, 'Give my role that permission in Server Settings → Roles. Run the setup check to see everything I need.');
    }
    const c = ctx(i, me);
    if (def.danger && !(await ui.confirm(i, def.danger))) return { ok: false, error: 'The user cancelled or did not confirm.' };
    const r = def.custom ? await def.run(c) : await ui.animate(i, label, () => def.run(c));
    if (r?.handled) return { ok: true, note: 'Done (the result was shown in the channel).' };
    await ui.sendResult(i, { ...r, category: cat.name, command: def.name });
    modlog(i, cat, def, r);
    return { ok: true, title: r.title, details: String(r.desc || '').slice(0, 300) };
  } catch (e) { await ui.sendError(i, e, label); return { ok: false, error: String(e?.message || e).slice(0, 300) }; }
}
async function slash(i) {
  if (!i.inGuild() || !i.guild) return i.reply({ embeds: [ui.errorEmbed('This command only works inside a server.', 'Use it in a server channel.')], flags: ui.EPH });
  if (blacklisted(i.user.id) && !isOwner(i.user.id)) return i.reply({ embeds: [ui.errorEmbed('You are not allowed to use this bot.')], flags: ui.EPH });
  const cat = byName.get(i.commandName); const def = cat?.map.get(i.options.getSubcommand(false));
  if (!def) return i.reply({ embeds: [ui.errorEmbed('This command does not exist.', 'It may have been removed. Open the help menu to see all commands.')], flags: ui.EPH });
  return execute(i, cat, def);
}
async function modlog(i, cat, def, r) {
  try {
    if (!r?.case) return; const id = db.g(i.guildId).config.modlog; if (!id) return;
    const ch = await i.guild.channels.fetch(id).catch(() => null); if (!ch) return;
    const e = ui.resultEmbed(r); e.addFields({ name: 'Moderator', value: `<@${i.user.id}>`, inline: true }, { name: 'Command', value: `\`/${cat.name} ${def.name}\``, inline: true });
    await ch.send({ embeds: [e] });
  } catch { /* log channel not reachable */ }
}

/* ---------- prefix / no-prefix messages ---------- */
async function onMessage(msg) {
  try {
    if (msg.author.bot || !msg.content) return;
    if (!msg.guild) return handleDM(msg);
    if (await fortress.inspectMessage(msg)) return;
    const px = getPrefix(msg.guild.id); const owner = isOwner(msg.author.id); let body = null, viaPrefix = true, mention = false, npAi = false;
    if (msg.content.startsWith(px)) body = msg.content.slice(px.length);
    else { const m = new RegExp(`^<@!?${client.user.id}>\s*`).exec(msg.content); if (m) { body = msg.content.slice(m[0].length); mention = true; } }
    if (body == null) {
      const inAi = db.g(msg.guild.id).config.aiChannel === msg.channelId;
      if ((owner && G().config.np !== false) || np.has(msg.author.id)) { body = msg.content; viaPrefix = false; npAi = inAi; }
      else if (inAi) return aiGo(msg, msg.content, owner);
      else return;
    }
    body = body.trim();
    if (!body) { if (viaPrefix) await msg.reply({ embeds: [ui.infoEmbed('☢️ Hi, I am Uranium', `My prefix here is \`${px}\`. Type \`${px}help\` to open the menu.`, ui.COLORS.ok)], allowedMentions: { repliedUser: false } }); return; }
    const tokens = prefix.tokenize(body);
    if (viaPrefix && tokens[0].text.toLowerCase() === 'prefix') return setPrefix(msg, tokens, px);
    const hit = prefix.resolve(tokens);
    if (!hit) { if (mention) return aiGo(msg, body, owner, true); if (npAi) return aiGo(msg, body, owner); return; }
    if (blacklisted(msg.author.id) && !owner) return;
    if (hit.def.owner && !owner) return;
    if (hit.def.premium && !premium.hasAccess(msg.guild.id, msg.author.id)) return msg.reply({ embeds: [ui.errorEmbed('💎 This server feature requires Premium access.', 'Only the bot owner can grant it with `!premium add @member`.')], allowedMentions: { repliedUser: false } });
    const member = msg.member || await msg.guild.members.fetch(msg.author.id).catch(() => null); if (!member) return;
    const vals = {}; const fi = prefix.fakeInteraction(msg, member, hit.def, vals, client); fi.srcId = msg.id;
    const alias = prefix.shortOf(hit.cat.name, hit.def.name);
    try {
      Object.assign(vals, await prefix.parseArgs({ msg, client, guild: msg.guild }, hit.def, tokens.slice(hit.used), body, prefix.usage(px, alias, hit.def)));
    } catch (e) {
      if (mention) return aiGo(msg, body, owner, true); if (npAi) return aiGo(msg, body, owner);
      if (!viaPrefix) return; await msg.channel.sendTyping().catch(() => {}); return ui.sendError(fi, e, `${px}${alias}`); }
    msg.channel.sendTyping().catch(() => {});
    return execute(fi, hit.cat, hit.def);
  } catch (e) { console.error('Message handler error:', e); }
}
async function setPrefix(msg, tokens, px) {
  const reply = (e) => msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  if (!tokens[1]) return reply(ui.infoEmbed('🔧 Prefix', `The prefix here is \`${px}\`.\nChange it with \`${px}prefix <new>\`.`));
  if (!msg.member?.permissions.has('ManageGuild')) return reply(ui.errorEmbed('You need the **Manage Server** permission to change the prefix.'));
  const newPx = tokens[1].text; if (newPx.length > 3 || /[`\s]/.test(newPx)) return reply(ui.errorEmbed('The prefix must be 1 to 3 characters.', 'Example: `!`, `?`, `u.`'));
  db.g(msg.guild.id).config.prefix = newPx; db.save(); return reply(ui.okEmbed('Prefix changed', `The new prefix is \`${newPx}\`.`));
}

/* ---------- buttons & autocomplete ---------- */
async function autocomplete(i) {
  try {
    const f = i.options.getFocused(true);
    if (f.name !== 'rule' || !i.guild) return i.respond([]);
    const l = [...(await i.guild.autoModerationRules.fetch()).values()].filter((r) => r.name.toLowerCase().includes(String(f.value).toLowerCase())).slice(0, 25);
    await i.respond(l.map((r) => ({ name: `${r.enabled ? '🟢' : '🔴'} ${r.name}`.slice(0, 100), value: r.id })));
  } catch { await i.respond([]).catch(() => {}); }
}
async function button(i) {
  const [kind, a] = i.customId.split(':');
  if (kind === 'template') return supportTemplate.onButton(i);
  if (['cf', 'help', 'eb', 'lst', 'sv'].includes(kind)) return; // handled by collectors
  if (kind === 'mu') return music.onComponent(i);
  if (kind === 'ai') { ai.resetHistory(i.channelId, i.user.id); return i.reply({ content: '🧠 I forgot our earlier messages here.', flags: ui.EPH }); }
  if (['poll', 'gw', 'rp', 'tk'].includes(kind)) { if (i.inGuild() && blacklisted(i.user.id)) return i.reply({ content: 'You are not allowed to use this bot.', flags: ui.EPH }); return premium.onButton(i); }
  const deny = (m) => i.reply({ embeds: [ui.errorEmbed(m)], flags: ui.EPH });
  if (kind === 'dismiss') { if (i.user.id !== a) return deny('Only the moderator who ran the command can dismiss it.'); return i.update({ components: [] }); }
  if (kind === 'case') {
    const x = db.getCase(i.guildId, Number(a)); if (!x) return deny('That case no longer exists.');
    return i.reply({ flags: ui.EPH, embeds: [ui.infoEmbed(`📋 Case #${x.id} — ${x.type}`, null).addFields({ name: 'User', value: `<@${x.userId}> (\`${x.userId}\`)` }, { name: 'Moderator', value: `<@${x.modId}>`, inline: true }, { name: 'When', value: `<t:${Math.floor(x.at / 1000)}:R>`, inline: true }, { name: 'Reason', value: x.reason || '—' })] });
  }
  if (kind === 'undo') {
    const p = ui.pending.get(a); if (!p) return deny('This Undo button expired (they last 10 minutes).');
    if (i.user.id !== p.userId) return deny('Only the moderator who ran the command can undo it.');
    ui.pending.delete(a); await i.deferUpdate();
    try {
      await p.fn(); await i.editReply({ components: [] });
      await i.followUp({ embeds: [ui.okEmbed('Undone', p.label)], flags: ui.EPH });
    } catch (e) { await i.followUp({ embeds: [ui.errorEmbed('The undo failed.', e?.message)], flags: ui.EPH }).catch(() => {}); }
  }
}

/* ---------- scheduler ---------- */
async function fetchScheduleResource(promise, missingCodes = []) {
  try { return await promise; }
  catch (error) { if (error.status === 404 || missingCodes.includes(error.code)) return null; throw error; }
}
async function tick() {
  for (const s of db.dueSchedules()) {
    try {
      let complete = false;
      if (s.type === 'giveaway') complete = await premium.endGiveaway(client, s);
      else {
        const g = await fetchScheduleResource(client.guilds.fetch(s.guildId), [10004]);
        if (!g) complete = true;
        else if (s.type === 'unban') {
          const ban = await fetchScheduleResource(g.bans.fetch(s.userId), [10026]);
          if (ban) { await g.members.unban(s.userId, 'Temp ban expired'); db.addCase(s.guildId, { type: 'unban', userId: s.userId, modId: client.user.id, reason: 'Temp ban expired' }); }
          complete = true;
        } else if (s.type === 'unrole') {
          const member = await fetchScheduleResource(g.members.fetch(s.userId), [10007]);
          if (!member || !member.roles.cache.has(s.roleId)) complete = true;
          else { await member.roles.remove(s.roleId, 'Temp role expired'); complete = true; }
        } else if (s.type === 'unlock') {
          const channel = await fetchScheduleResource(g.channels.fetch(s.channelId), [10003]);
          if (!channel?.permissionOverwrites) complete = true;
          else {
            await channel.permissionOverwrites.edit(g.roles.everyone, { SendMessages: null }, { reason: 'Timed lockdown ended' });
            channel.send?.({ embeds: [ui.okEmbed('Channel unlocked', 'The timed lockdown has ended.')] }).catch(() => {});
            complete = true;
          }
        } else {
          console.warn('Unknown scheduled action; removing it:', s.type);
          complete = true;
        }
      }
      if (complete) db.dropSchedule(s.id);
      else db.retrySchedule(s.id, new Error('Scheduled action did not confirm completion'));
    } catch (e) {
      console.error('Schedule action failed; it will be retried:', e.message);
      db.retrySchedule(s.id, e);
    }
  }
}

/* ---------- client ---------- */
const onReady = async () => {
  if (started) return; started = true;
  console.log(`✅ Uranium online as ${client.user.tag}`);
  const st = G().config.status; const T = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing };
  client.user.setActivity(st ? st.text : '/help • !help', { type: st ? T[st.type] : ActivityType.Watching });
  if (process.env.ENABLE_GUILD_MEMBERS_INTENT !== 'true') console.warn('⚠️ Welcome/goodbye automation needs the Server Members Intent enabled in Discord Developer Portal and ENABLE_GUILD_MEMBERS_INTENT=true.');
  if (!contentIntent) console.warn('⚠️ Message Content Intent is OFF: prefix commands only work after @mentioning the bot. Turn it on in the Developer Portal → Bot.');
  loadOwners(); emojis.ensure(client); music.startWatch(client);
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
    const route = DEV_GUILD_ID ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DEV_GUILD_ID) : Routes.applicationCommands(DISCORD_CLIENT_ID);
    const body = cats.map(build);
    // Discord's bulk overwrite also replaces PRIMARY_ENTRY_POINT commands.
    // Preserve the app's Activity entry point instead of accidentally deleting it.
    if (!DEV_GUILD_ID) {
      const existing = await rest.get(Routes.applicationCommands(DISCORD_CLIENT_ID));
      const entryPoints = (Array.isArray(existing) ? existing : [])
        .filter((command) => command.type === 4)
        .map(({ name, description, type, handler }) => ({ name, description, type, handler }));
      body.push(...entryPoints);
    }
    await rest.put(route, { body });
    console.log(`✅ Registered ${cats.length} command groups and preserved the app Entry Point command`);
  } catch (e) { console.error('❌ Command registration failed:', e.rawError ? JSON.stringify(e.rawError).slice(0, 800) : e); }
  setInterval(tick, 30000).unref(); tick();
  art.build().then((ok) => ok && console.log('✅ Banner animation ready'));
};
function makeClient(withContent) {
  contentIntent = withContent;
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages];
  if (withContent) intents.push(GatewayIntentBits.MessageContent);
  if (process.env.ENABLE_GUILD_MEMBERS_INTENT === 'true') intents.push(GatewayIntentBits.GuildMembers);
  client = new Client({ intents, partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User] });
  client.on('interactionCreate', (i) => {
    const run = i.isAutocomplete() ? autocomplete(i) : i.isChatInputCommand() ? slash(i) : (i.isButton() || i.isStringSelectMenu()) ? button(i) : null;
    run?.catch((e) => console.error('Interaction error:', e));
  });
  client.on('messageCreate', onMessage);
  client.on('guildMemberAdd', async (member) => {
    fortress.onMemberJoin(member).catch((error) => console.error('[fortress join]', error.message));
    try {
      const cfg = db.g(member.guild.id).config, id = cfg.welcomeChannel;
      if (!id) return;
      const ch = await member.guild.channels.fetch(id).catch(() => null);
      if (!ch?.isTextBased()) return;
      const content = String(cfg.welcomeMessage || 'Welcome {user} to **{server}**!').replaceAll('{user}', '<@' + member.id + '>').replaceAll('{username}', member.user.username).replaceAll('{server}', member.guild.name).replaceAll('{memberCount}', String(member.guild.memberCount));
      await ch.send({ content, allowedMentions: { users: [member.id] } });
    } catch (e) { console.error('[welcome]', e.message); }
  });
  client.on('guildMemberRemove', async (member) => {
    try {
      const cfg = db.g(member.guild.id).config, id = cfg.goodbyeChannel;
      if (!id) return;
      const ch = await member.guild.channels.fetch(id).catch(() => null);
      if (!ch?.isTextBased()) return;
      const content = String(cfg.goodbyeMessage || '**{username}** has left **{server}**.').replaceAll('{user}', member.user.username).replaceAll('{username}', member.user.username).replaceAll('{server}', member.guild.name).replaceAll('{memberCount}', String(member.guild.memberCount));
      await ch.send({ content, allowedMentions: { parse: [] } });
    } catch (e) { console.error('[goodbye]', e.message); }
  });
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      const msg = reaction.message, guild = msg.guild;
      if (!guild || !['⭐', '🌟'].includes(reaction.emoji.name) || reaction.count < 3) return;
      const cfg = db.g(guild.id).config, channelId = cfg.starboardChannel;
      if (!channelId || msg.channelId === channelId) return;
      const data = db.g(guild.id); data.starboard ||= {};
      if (data.starboard[msg.id]) return;
      const dest = await guild.channels.fetch(channelId).catch(() => null);
      if (!dest?.isTextBased()) return;
      const embed = new EmbedBuilder().setColor(0xffd166).setAuthor({ name: msg.author?.tag || 'Unknown member', iconURL: msg.author?.displayAvatarURL?.() }).setDescription((msg.content || '[No text content]').slice(0, 3500)).addFields({ name: 'Source', value: '<#' + msg.channelId + '>', inline: true }, { name: 'Jump', value: '[Open message](' + msg.url + ')', inline: true }).setFooter({ text: '⭐ ' + reaction.count + ' stars' }).setTimestamp(msg.createdAt);
      const attachment = msg.attachments?.find(a => a.contentType?.startsWith('image/'));
      if (attachment) embed.setImage(attachment.url);
      const posted = await dest.send({ embeds: [embed], allowedMentions: { parse: [] } });
      data.starboard[msg.id] = posted.id; db.save();
    } catch (e) { console.error('[starboard]', e.message); }
  });
  client.on('messageDelete', (m) => { if (m.guild && m.content && !m.author?.bot) premium.snipes.set(m.channelId, { content: m.content, author: m.author?.username || 'unknown', authorId: m.author?.id, at: Date.now() }); });
  const startAfterGatewayReady = (source) => {
    console.log(`[gateway] Startup readiness reached via ${source}.`);
    void onReady().catch((error) => console.error('[startup] Ready initialization failed:', error));
  };
  client.once('clientReady', () => startAfterGatewayReady('clientReady'));
  // shardReady fires as soon as Discord accepts the Gateway READY packet.
  // clientReady can be delayed while a large guild cache is hydrated; do not
  // tear down a healthy Gateway connection just because that cache is slow.
  client.once('shardReady', (id) => {
    console.log(`[gateway] Shard ${id} is ready; starting while guild cache finishes syncing.`);
    startAfterGatewayReady('shardReady');
  });
  client.on('error', (e) => console.error('[gateway] Client error:', e));
  client.on('shardError', (e) => console.error('[gateway] Shard error:', e));
  client.on('shardReady', (id) => console.log(`[gateway] Shard ${id} is ready.`));
  client.on('shardReconnecting', (id) => console.warn(`[gateway] Shard ${id} is reconnecting.`));
  client.on('shardDisconnect', (event, id) => console.warn('[gateway] Shard disconnected:', { shardId: id, code: event?.code, reason: event?.reason || 'No reason supplied', wasClean: event?.wasClean }));
  client.on('shardResume', (id, replayedEvents) => console.log('[gateway] Shard resumed:', { shardId: id, replayedEvents }));
  client.on('warn', (warning) => console.warn('[discord.js]', warning));
  client.on('debug', (message) => {
    if (/websocket|gateway|heartbeat|identify|resume|connect|close/i.test(message)) {
      console.log('[discord.js debug]', message);
    }
  });
  return client;
}
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
async function shutdown(signal) {
  console.log(`Received ${signal}; flushing Uranium data before shutdown.`);
  await db.close().catch((error) => console.error('[db] Shutdown flush failed:', error.message));
  if (client) client.destroy();
  process.exit(0);
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
async function loginAndWaitUntilReady(cl, timeoutMs = 45000) {
  const login = cl.login(DISCORD_BOT_TOKEN);
  const ready = waitForGatewayReady(cl, timeoutMs);
  const source = await Promise.all([login, ready]).then(([, event]) => event);
  console.log(`[gateway] Login confirmed by ${source}.`);
}

(async () => {
  try { await db.ready; }
  catch (error) {
    console.error('[db] Persistent database initialization failed; refusing to start with an unloaded state:', error.message);
    process.exit(1);
    return;
  }
  let withContent = true;
  let attempt = 0;
  // Run the REST diagnostic in the background: a slow Discord REST response must
  // never prevent the independent Gateway connection attempt from starting.
  void (async () => {
    try {
      const rest = new REST({ version: '10', timeout: 15000 }).setToken(DISCORD_BOT_TOKEN);
      const gateway = await rest.get(Routes.gatewayBot());
      console.log(`[gateway] Discord REST authentication passed; gateway host ${new URL(gateway.url).host}; recommended shards ${gateway.shards}.`);
    } catch (e) {
      const status = e?.status || e?.statusCode || null;
      console.error('[gateway] Discord REST preflight failed:', { status, code: e?.code || null, message: String(e?.message || e) });
      if (status === 401 || status === 403) console.error('[gateway] Discord rejected the configured bot credentials or access. Check the Render secret in the dashboard; do not paste it into chat.');
    }
  })();
  while (true) {
    const cl = makeClient(withContent);
    try {
      console.log(`[gateway] Starting Discord login (Message Content Intent: ${withContent ? 'enabled' : 'disabled'}).`);
      await loginAndWaitUntilReady(cl);
      return;
    } catch (e) {
      const message = String(e?.message || e);
      if (withContent && /disallowed intents/i.test(message)) {
        console.warn('⚠️ Message Content Intent is not enabled in the Developer Portal. Retrying without it...');
        try { cl.destroy(); } catch { /* ignore */ }
        if (client === cl) client = null;
        started = false;
        withContent = false;
        attempt = 0;
        continue;
      }
      console.error(`[gateway] Discord login attempt ${attempt + 1} failed:`, message);
      try { cl.destroy(); } catch { /* ignore */ }
      if (client === cl) client = null;
      started = false;
      const delay = Math.min(60000, 5000 * (2 ** Math.min(attempt, 4)));
      attempt += 1;
      console.warn(`[gateway] Retrying Discord login in ${Math.round(delay / 1000)} seconds.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
})();
