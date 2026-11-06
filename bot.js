const http = require('http');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const db = require('./lib/db');
const ui = require('./lib/ui');
require('./lib/ui2');
const art = require('./lib/art');
const prefix = require('./lib/prefix');
const ai = require('./lib/ai');
const security = require('./lib/security');
const dmAi = require('./lib/dm-ai');
const np = require('./lib/np');
const music = require('./lib/music');
const emojis = require('./lib/emojis');
const { UserError, permName } = require('./lib/util');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DEV_GUILD_ID, PORT } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) { console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID'); process.exit(1); }

let client = null, started = false, contentIntent = false;
if (PORT) http.createServer((q, r) => { r.writeHead(200); r.end('Uranium is running. Ready: ' + started); }).listen(PORT, () => console.log('Health server on ' + PORT));

const cats = ['member', 'message', 'channel', 'role', 'voice', 'server', 'automod', 'info', 'music', 'ai', 'premium'].map((n) => require('./commands/' + n));
for (const cat of cats) cat.map = new Map(cat.commands.map((c) => [c.name, c]));
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
      return msg.reply('Owner identity verified. Session active for 15 minutes. Sensitive actions still require separate confirmation.');
    }
    return msg.reply('Owner controls: !owner status | !owner unlock 123456 | !owner lock');
  }
  return dmAi.reply(msg, owner && ownerSessionActive(id));
}

/* ---------- owner & blacklist ---------- */
const OWNERS = new Set((process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean));
const isOwner = (id) => OWNERS.has(id);
const G = () => db.g('__global');
const blacklisted = (id) => (G().blacklist || []).some((x) => x.id === id);
const getPrefix = (gid) => db.g(gid).config.prefix || '!';
ai.init({ cats, byName, execute: (...a) => execute(...a), isOwner, getPrefix });
async function loadOwners() {
  try {
    const app = await client.application.fetch(); const o = app.owner; if (!o) return;
    if (o.members) { for (const m of o.members.values()) OWNERS.add(m.user?.id || m.id); if (o.ownerId) OWNERS.add(o.ownerId); } else OWNERS.add(o.id);
    console.log('Owner loaded');
  } catch (e) { console.warn('Could not load owner:', e.message); }
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
  await i.deferReply();
  try {
    if (def.owner && !isOwner(i.user.id)) throw new UserError('💎 This is a **Premium** command and it is only for the bot owner.', 'Normal moderation commands are in the other groups. Use the help menu.');
    const me = await i.guild.members.fetchMe();
    if (def.perm) {
      if (!i.memberPermissions.has(def.perm)) throw new UserError(`You need the **${permName(def.perm)}** permission to use \`${label}\`.`, 'Ask a server admin to give you that permission or a role that has it.');
      if (!me.permissions.has(def.perm)) throw new UserError(`I (Uranium) am missing the **${permName(def.perm)}** permission.`, 'Give my role that permission in Server Settings → Roles. Run the setup check to see everything I need.');
    }
    const c = ctx(i, me);
    if (def.danger && !(await ui.confirm(i, def.danger))) return { ok: false, error: 'The user cancelled or did not confirm.' };
    const r = def.custom ? await def.run(c) : await ui.animate(i, label, () => def.run(c));
    if (r?.handled) return { ok: true, note: 'Done (the result was shown in the channel).' };
    await ui.sendResult(i, r);
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
async function tick() {
  for (const s of db.dueSchedules()) {
    try {
      if (s.type === 'giveaway') { await premium.endGiveaway(client, s); db.dropSchedule(s.id); continue; }
      const g = await client.guilds.fetch(s.guildId);
      if (s.type === 'unban') { await g.members.unban(s.userId, 'Temp ban expired').catch(() => {}); db.addCase(s.guildId, { type: 'unban', userId: s.userId, modId: client.user.id, reason: 'Temp ban expired' }); }
      if (s.type === 'unrole') { const m = await g.members.fetch(s.userId).catch(() => null); if (m) await m.roles.remove(s.roleId, 'Temp role expired').catch(() => {}); }
      if (s.type === 'unlock') { const ch = await g.channels.fetch(s.channelId).catch(() => null); if (ch?.permissionOverwrites) { await ch.permissionOverwrites.edit(g.roles.everyone, { SendMessages: null }, { reason: 'Timed lockdown ended' }).catch(() => {}); ch.send?.({ embeds: [ui.okEmbed('Channel unlocked', 'The timed lockdown has ended.')] }).catch(() => {}); } }
    } catch (e) { console.error('Schedule error:', e.message); }
    db.dropSchedule(s.id);
  }
}

/* ---------- client ---------- */
const onReady = async () => {
  if (started) return; started = true;
  console.log(`✅ Uranium online as ${client.user.tag}`);
  const st = G().config.status; const T = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing };
  client.user.setActivity(st ? st.text : '/help • !help', { type: st ? T[st.type] : ActivityType.Watching });
  if (!contentIntent) console.warn('⚠️ Message Content Intent is OFF: prefix commands only work after @mentioning the bot. Turn it on in the Developer Portal → Bot.');
  loadOwners(); emojis.ensure(client); music.startWatch(client);
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN); const body = cats.map(build);
    await rest.put(DEV_GUILD_ID ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DEV_GUILD_ID) : Routes.applicationCommands(DISCORD_CLIENT_ID), { body });
    console.log(`✅ Registered ${body.length} command groups`);
  } catch (e) { console.error('❌ Command registration failed:', e.rawError ? JSON.stringify(e.rawError).slice(0, 800) : e); }
  setInterval(tick, 30000).unref(); tick();
  art.build().then((ok) => ok && console.log('✅ Banner animation ready'));
};
function makeClient(withContent) {
  contentIntent = withContent;
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages];
  if (withContent) intents.push(GatewayIntentBits.MessageContent);
  client = new Client({ intents, partials: [Partials.Channel] });
  client.on('interactionCreate', (i) => {
    const run = i.isAutocomplete() ? autocomplete(i) : i.isChatInputCommand() ? slash(i) : (i.isButton() || i.isStringSelectMenu()) ? button(i) : null;
    run?.catch((e) => console.error('Interaction error:', e));
  });
  client.on('messageCreate', onMessage);
  client.on('messageDelete', (m) => { if (m.guild && m.content && !m.author?.bot) premium.snipes.set(m.channelId, { content: m.content, author: m.author?.username || 'unknown', authorId: m.author?.id, at: Date.now() }); });
  client.once('clientReady', onReady);
  client.on('error', (e) => console.error('Client error:', e));
  client.on('shardError', (e) => console.error('Shard error:', e));
  return client;
}
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
(async () => {
  for (const withContent of [true, false]) {
    const cl = makeClient(withContent);
    try { console.log('Logging in to Discord...'); await cl.login(DISCORD_BOT_TOKEN); return; } catch (e) {
      if (withContent && /disallowed intents/i.test(String(e?.message || e))) { console.warn('⚠️ Message Content Intent is not enabled in the Developer Portal. Retrying without it...'); try { cl.destroy(); } catch { /* ignore */ } started = false; continue; }
      console.error('Login failed:', e); process.exit(1);
    }
  }
})();
