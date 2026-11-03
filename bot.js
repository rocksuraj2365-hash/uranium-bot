const http = require('http');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType, ChannelType } = require('discord.js');
const db = require('./lib/db');
const ui = require('./lib/ui');
const { UserError, permName, fmt } = require('./lib/util');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DEV_GUILD_ID, PORT } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) { console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID'); process.exit(1); }

// Tiny web server so Render "Web Service" sees an open port (not needed for a Worker)
if (PORT) http.createServer((q, r) => { r.writeHead(200); r.end('Uranium bot is running'); }).listen(PORT, () => console.log('Health server on ' + PORT));

const cats = ['member', 'message', 'channel', 'role', 'voice', 'server', 'automod', 'info'].map((n) => require('./commands/' + n));
for (const cat of cats) cat.map = new Map(cat.commands.map((c) => [c.name, c]));
const byName = new Map(cats.map((c) => [c.name, c]));

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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

function ctx(i, me) {
  const o = i.options;
  const c = {
    i, g: i.guild, ch: i.channel, me, cats,
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
  return c;
}

async function slash(i) {
  if (!i.inGuild() || !i.guild) return i.reply({ embeds: [ui.errorEmbed('This command only works inside a server.', 'Use it in a server channel.')], flags: ui.EPH });
  const cat = byName.get(i.commandName); const def = cat?.map.get(i.options.getSubcommand(false));
  if (!def) return i.reply({ embeds: [ui.errorEmbed('This command does not exist.', 'It may have been removed. Use /info help to see all commands.')], flags: ui.EPH });
  const label = `/${cat.name} ${def.name}`;
  await i.deferReply();
  try {
    const me = await i.guild.members.fetchMe();
    if (def.perm) {
      if (!i.memberPermissions.has(def.perm)) throw new UserError(`You need the **${permName(def.perm)}** permission to use \`${label}\`.`, 'Ask a server admin to give you that permission or a role that has it.');
      if (!me.permissions.has(def.perm)) throw new UserError(`I (Uranium) am missing the **${permName(def.perm)}** permission.`, 'Give my role that permission in Server Settings → Roles. Run /info setup-check to see everything I need.');
    }
    const c = ctx(i, me);
    if (def.danger && !(await ui.confirm(i, def.danger))) return;
    const r = def.custom ? await def.run(c) : await ui.animate(i, label, () => def.run(c));
    if (r?.handled) return;
    await ui.sendResult(i, r);
    modlog(i, cat, def, r);
  } catch (e) { await ui.sendError(i, e, label); }
}

async function modlog(i, cat, def, r) {
  try {
    if (!r?.case) return; const id = db.g(i.guildId).config.modlog; if (!id) return;
    const ch = await i.guild.channels.fetch(id).catch(() => null); if (!ch) return;
    const e = ui.resultEmbed(r); e.addFields({ name: 'Moderator', value: `<@${i.user.id}>`, inline: true }, { name: 'Command', value: `\`/${cat.name} ${def.name}\``, inline: true });
    await ch.send({ embeds: [e] });
  } catch { /* log channel not reachable */ }
}

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
  if (kind === 'cf' || kind === 'help') return; // handled by collectors
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

client.on('interactionCreate', (i) => {
  const run = i.isAutocomplete() ? autocomplete(i) : i.isChatInputCommand() ? slash(i) : i.isButton() ? button(i) : null;
  run?.catch((e) => console.error('Interaction error:', e));
});

async function tick() {
  for (const s of db.dueSchedules()) {
    try {
      const g = await client.guilds.fetch(s.guildId);
      if (s.type === 'unban') { await g.members.unban(s.userId, 'Temp ban expired').catch(() => {}); db.addCase(s.guildId, { type: 'unban', userId: s.userId, modId: client.user.id, reason: 'Temp ban expired' }); }
      if (s.type === 'unrole') { const m = await g.members.fetch(s.userId).catch(() => null); if (m) await m.roles.remove(s.roleId, 'Temp role expired').catch(() => {}); }
    } catch (e) { console.error('Schedule error:', e.message); }
    db.dropSchedule(s.id);
  }
}

let started = false;
const onReady = async () => {
  if (started) return; started = true;
  console.log(`✅ Uranium online as ${client.user.tag}`);
  client.user.setActivity('200 moderation commands', { type: ActivityType.Watching });
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
    const body = cats.map(build);
    await rest.put(DEV_GUILD_ID ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DEV_GUILD_ID) : Routes.applicationCommands(DISCORD_CLIENT_ID), { body });
    console.log(`✅ Registered ${body.length} command groups (${cats.reduce((n, c) => n + c.commands.length, 0)} commands)`);
  } catch (e) { console.error('❌ Command registration failed:', e.rawError ? JSON.stringify(e.rawError).slice(0, 800) : e); }
  setInterval(tick, 30000).unref(); tick();
};
client.once('clientReady', onReady);
client.once('ready', onReady);
client.on('error', (e) => console.error('Client error:', e));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
client.login(DISCORD_BOT_TOKEN);
