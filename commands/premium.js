const { PermissionFlagsBits: P, ChannelType: CT, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType, MessageFlags } = require('discord.js');
const os = require('os');
const { C, U, S, I, CH, R } = require('../lib/cmd');
const db = require('../lib/db');
const { UserError, res, ts, trunc, snowflake, parseDuration, fmt, hexColor, checkRole } = require('../lib/util');
const { isSafeSelfAssignableRole, blockedSelfAssignablePermissions } = require('../lib/role-safety');
const { FOOT } = require('../lib/ui');
const cv2 = require('../lib/cv2');
const icons = require('../lib/emojis');

const GOLD = 0xffd166;
const EPH = MessageFlags.Ephemeral;
const own = (title, desc, x = {}) => res(title, desc, { icon: '💎', color: GOLD, ...x });
const G = () => db.g('__global');
const bar = (p, n = 10) => '▰'.repeat(Math.round(p * n)) + '▱'.repeat(n - Math.round(p * n));
const polls = new Map();
const snipes = new Map();
const O = { owner: true };
const PREMIUM_ACCESS = { premium: true };
const btn = (id, label, emoji, style = ButtonStyle.Secondary, off = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(off);
const goldEmbed = (t, d) => new EmbedBuilder().setColor(GOLD).setTitle(t).setDescription(d || null).setFooter({ text: `Uranium Premium` }).setTimestamp();
function v2View(embed, rows = []) {
  const data = embed.toJSON();
  const parts = [];
  if (data.title) parts.push(`# ${icons.E('premium')} ${data.title}`);
  if (data.description) parts.push(data.description);
  for (const field of data.fields || []) parts.push(`**${field.name}**\\n${field.value}`);
  if (data.footer?.text) parts.push(`-# ${data.footer.text}`);
  const children = [cv2.text(parts.join('\\n\\n').slice(0, 4000))];
  for (const row of rows) children.push(cv2.separator(), cv2.row(row.toJSON().components));
  return cv2.message(children, data.color ?? GOLD);
}

/* ---------- interactive views ---------- */
function pollView(id, closed = false) {
  const p = polls.get(id); const total = p.votes.size; const vals = [...p.votes.values()];
  const lines = p.opts.map((o, k) => { const n = vals.filter((v) => v === k).length; const pct = total ? n / total : 0; return `**${o}**\n\`${bar(pct)}\` ${n} • ${Math.round(pct * 100)}%`; });
  const e = goldEmbed(`📊 ${p.q}`, lines.join('\n\n')).setFooter({ text: `${total} vote(s) • ${closed ? 'Poll closed' : 'Click a button to vote'}` });
  const row1 = new ActionRowBuilder().addComponents(p.opts.map((o, k) => btn(`poll:${id}:${k}`, trunc(o, 60), ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][k], ButtonStyle.Primary, closed)));
  const row2 = new ActionRowBuilder().addComponents(btn(`poll:${id}:end`, 'End poll', '🔒', ButtonStyle.Danger, closed));
  return v2View(e, [row1, row2]);
}
function gwView(g, ended = false, winners = []) {
  const e = goldEmbed(`🎉 ${g.prize}`, ended ? (winners.length ? `**Winner(s):** ${winners.map((w) => `<@${w}>`).join(', ')}` : 'No valid entries.') : `Press the button to enter!\nEnds ${ts(g.end)}\nWinners: **${g.winners}**`)
    .setFooter({ text: `${g.entrants.length} entr${g.entrants.length === 1 ? 'y' : 'ies'} • Hosted by ${g.hostName || 'owner'}` });
  return v2View(e, [new ActionRowBuilder().addComponents(btn('gw:enter', ended ? 'Ended' : 'Enter giveaway', icons.E('crown'), ButtonStyle.Success, ended))]);
}
async function endGiveaway(client, s) {
  const d = db.g(s.guildId); const g = d.giveaways?.[s.messageId];
  if (!g || g.ended) return true;
  if (!g.ending) {
    const pool = [...g.entrants]; const winners = [];
    while (pool.length && winners.length < g.winners) winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    g.winnersSelected = winners;
    g.ending = true;
    db.save();
  }
  const ch = await client.channels.fetch(s.channelId).catch((error) => { if (error.code === 10003 || error.status === 404) return null; throw error; });
  if (!ch) { g.ended = true; db.save(); return true; }
  const msg = await ch.messages.fetch(s.messageId).catch((error) => { if (error.code === 10008 || error.status === 404) return null; throw error; });
  if (!msg) { g.ended = true; db.save(); return true; }
  const winners = g.winnersSelected || [];
  await msg.edit(gwView(g, true, winners));
  await ch.send({ content: winners.length ? `🎉 Congratulations ${winners.map((w) => `<@${w}>`).join(', ')}! You won **${g.prize}**!` : `No one entered the giveaway for **${g.prize}**.`, allowedMentions: { users: winners } });
  g.ended = true; g.ending = false; db.save();
  return true;
}
async function onButton(i) {
  const [kind, a, b] = i.customId.split(':');
  if (kind === 'poll') {
    const p = polls.get(a); if (!p) return i.reply(cv2.ephemeralMessage([cv2.text('# ⚠️ Poll unavailable\nThis poll is no longer active (the bot restarted).')], GOLD));
    if (b === 'end') { if (i.user.id !== p.by) return i.reply(cv2.ephemeralMessage([cv2.text('# 🔒 Poll control\nOnly the poll creator can end it.')], GOLD)); polls.set(a, p); return i.update(pollView(a, true)); }
    p.votes.set(i.user.id, Number(b)); return i.update(pollView(a));
  }
  if (kind === 'gw') {
    const g = db.g(i.guildId).giveaways?.[i.message.id]; if (!g || g.ended) return i.reply(cv2.ephemeralMessage([cv2.text('# 🎉 Giveaway ended')], GOLD));
    const k = g.entrants.indexOf(i.user.id); if (k >= 0) g.entrants.splice(k, 1); else g.entrants.push(i.user.id); db.save();
    return i.update(gwView(g));
  }
  if (kind === 'rp') {
    const role = i.guild.roles.cache.get(a); const me = i.guild.members.me;
    if (!role) return i.reply(cv2.ephemeralMessage([cv2.text('# ⚠️ Role unavailable\nThat role no longer exists.')], GOLD));
    if (!isSafeSelfAssignableRole(role) || role.id === i.guild.id) return i.reply(cv2.ephemeralMessage([cv2.text(`# ⚠️ Role unavailable\n**${role.name}** is managed or has powerful permissions and cannot be self-assigned.`)], GOLD));
    if (role.position >= me.roles.highest.position) return i.reply(cv2.ephemeralMessage([cv2.text(`# ⚠️ Role hierarchy\nI cannot give **${role.name}** because my highest role must be above it.`)], GOLD));
    const has = i.member.roles.cache.has(role.id);
    await (has ? i.member.roles.remove(role) : i.member.roles.add(role));
    return i.reply(cv2.ephemeralMessage([cv2.text(has ? `# ${icons.E('cross')} Role removed\n**${role.name}**` : `# ${icons.E('check')} Role added\nYou now have **${role.name}**`)], GOLD));
  }
  if (kind === 'tk' && a === 'open') {
    const [, , sup, cat] = i.customId.split(':'); await i.deferReply({ flags: EPH });
    const old = i.guild.channels.cache.find((c) => c.topic === `ticket:${i.user.id}`);
    if (old) return i.editReply(cv2.message([cv2.text(`# ${icons.E('warn')} Ticket already exists\nYou already have a ticket: <#${old.id}>`)], GOLD));
    const allow = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'];
    const ow = [{ id: i.guild.id, deny: ['ViewChannel'] }, { id: i.user.id, allow }, { id: i.client.user.id, allow: [...allow, 'ManageChannels', 'EmbedLinks'] }];
    if (sup !== '0') ow.push({ id: sup, allow });
    const ch = await i.guild.channels.create({ name: `ticket-${i.user.username}`.slice(0, 90), type: CT.GuildText, parent: cat !== '0' ? cat : undefined, topic: `ticket:${i.user.id}`, permissionOverwrites: ow });
    await ch.send({ ...cv2.message([cv2.text(`<@${i.user.id}>${sup !== '0' ? ` <@&${sup}>` : ''}\n\n# ${icons.E('support')} Ticket opened\nExplain your problem. A moderator will help you soon.`), cv2.separator(), cv2.row([cv2.button('tk:close', 'Close ticket', 4, icons.E('lock'))])], GOLD), allowedMentions: { users: [i.user.id], roles: sup !== '0' ? [sup] : [] } });
    return i.editReply(cv2.message([cv2.text(`# ${icons.E('check')} Ticket created\n<#${ch.id}>`)], GOLD));
  }
  if (kind === 'tk' && a === 'close') {
    const ownerId = (i.channel.topic || '').replace('ticket:', '');
    if (i.user.id !== ownerId && !i.memberPermissions.has(P.ManageChannels)) return i.reply(cv2.ephemeralMessage([cv2.text('# 🔒 Access denied\nOnly the ticket owner or a moderator can close this.')], GOLD));
    await i.reply(cv2.message([cv2.text(`# ${icons.E('lock')} Closing ticket\nDeleting this channel in **3**…`)], GOLD));
    for (const n of [2, 1]) { await new Promise((r) => setTimeout(r, 1000)); await i.editReply(cv2.message([cv2.text(`# ${icons.E('lock')} Closing ticket\nDeleting this channel in **${n}**…`)], GOLD)).catch(() => {}); }
    await new Promise((r) => setTimeout(r, 1000)); return i.channel.delete().catch(() => {});
  }
  return false;
}

/* ---------- custom (interactive) commands ---------- */
async function servers(c) {
  const gs = [...c.i.client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount); let page = 0; const per = 8; const pages = Math.max(1, Math.ceil(gs.length / per));
  const view = (off) => v2View(goldEmbed(`Servers (${gs.length})`, gs.slice(page * per, page * per + per).map((g, k) => `**${page * per + k + 1}.** ${g.name}\n\`${g.id}\` • ${g.memberCount} members`).join('\n\n') || '_None_').setFooter({ text: `Page ${page + 1}/${pages} • ${FOOT}` }), [new ActionRowBuilder().addComponents(btn('sv:prev', 'Prev', '◀️', ButtonStyle.Secondary, off || page === 0), btn('sv:next', 'Next', '▶️', ButtonStyle.Secondary, off || page >= pages - 1), btn('sv:close', 'Close', '✖️', ButtonStyle.Danger, off))]);
  const msg = await c.i.editReply(view(false));
  const col = msg.createMessageComponentCollector({ time: 120000, filter: (b) => b.customId.startsWith('sv:') && b.user.id === c.i.user.id });
  col.on('collect', async (b) => { const k = b.customId.split(':')[1]; if (k === 'close') { col.stop(); return b.update(view(true)); } page = k === 'next' ? Math.min(page + 1, pages - 1) : Math.max(page - 1, 0); await b.update(view(false)); });
  col.on('end', () => c.i.editReply(view(true)).catch(() => {}));
  return { handled: true };
}
async function liveStats(c) {
  const cl = c.i.client; const hist = []; const spark = '▁▂▃▄▅▆▇█';
  const render = (n) => {
    hist.push(Math.round(cl.ws.ping)); if (hist.length > 16) hist.shift(); const mx = Math.max(...hist, 1);
    const mem = process.memoryUsage().rss; const load = os.loadavg()[0];
    return goldEmbed('Live stats', null).addFields(
      { name: '📡 Ping', value: `**${Math.round(cl.ws.ping)} ms**\n\`${hist.map((v) => spark[Math.min(7, Math.floor((v / mx) * 7))]).join('')}\``, inline: true },
      { name: '🧠 Memory', value: `${Math.round(mem / 1048576)} MB\n\`${bar(mem / os.totalmem())}\``, inline: true },
      { name: '⚙️ CPU load', value: `${load.toFixed(2)}\n\`${bar(Math.min(1, load / os.cpus().length))}\``, inline: true },
      { name: '🏰 Servers', value: String(cl.guilds.cache.size), inline: true }, { name: '👥 Users (cached)', value: String(cl.users.cache.size), inline: true },
      { name: '⏱️ Uptime', value: fmt(process.uptime() * 1000), inline: true }).setFooter({ text: `Auto-refresh ${n}/12 • ${FOOT}` });
  };
  const row = (off) => new ActionRowBuilder().addComponents(btn('lst:r', 'Refresh', '🔄', ButtonStyle.Primary, off), btn('lst:x', 'Stop', '⏹️', ButtonStyle.Danger, off));
  let n = 0;
  const msg = await c.i.editReply(v2View(render(n), [row(false)]));
  const timer = setInterval(() => { n++; if (n > 12) return col.stop(); c.i.editReply(v2View(render(n), [row(false)])).catch(() => {}); }, 5000);
  const col = msg.createMessageComponentCollector({ time: 75000, filter: (b) => b.customId.startsWith('lst:') && b.user.id === c.i.user.id });
  col.on('collect', async (b) => { if (b.customId === 'lst:x') return col.stop(); await b.update(v2View(render(n), [row(false)])); });
  col.on('end', () => { clearInterval(timer); c.i.editReply(v2View(render(n), [row(true)])).catch(() => {}); });
  return { handled: true };
}
async function builder(c) {
  const st = { title: 'Your title', description: 'Press ✏️ Edit to change this text.', color: GOLD, image: '', footer: '' };
  const mk = () => { const e = new EmbedBuilder().setColor(st.color).setTitle(st.title || null).setDescription(st.description || null); if (st.image) e.setImage(st.image); if (st.footer) e.setFooter({ text: st.footer }); return e; };
  const row = (off) => new ActionRowBuilder().addComponents(btn('eb:edit', 'Edit', '✏️', ButtonStyle.Primary, off), btn('eb:send', 'Send', '📤', ButtonStyle.Success, off), btn('eb:x', 'Cancel', '✖️', ButtonStyle.Danger, off));
  const msg = await c.i.editReply(v2View(mk(), [row(false)]));
  const col = msg.createMessageComponentCollector({ time: 300000, filter: (b) => b.customId.startsWith('eb:') && b.user.id === c.i.user.id });
  col.on('collect', async (b) => {
    if (b.customId === 'eb:x') { col.stop('x'); return b.update(cv2.message([cv2.text('# ❌ Cancelled')], GOLD)); }
    if (b.customId === 'eb:send') {
      const ch = c.c('channel') || c.ch; await b.deferUpdate();
      try { await ch.send(v2View(mk())); col.stop('sent'); return c.i.editReply(v2View(goldEmbed('Builder sent', `Your Components V2 panel was sent to <#${ch.id}>.`))); } catch { return c.i.editReply(v2View(goldEmbed('Cannot send', 'I cannot send in that channel.'), [row(false)])); }
    }
    const inp = (id, label, style, val, req = false, max = 200) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(req).setMaxLength(max).setValue(String(val || '').slice(0, max)));
    await b.showModal(new ModalBuilder().setCustomId('eb:modal').setTitle('Edit embed').addComponents(
      inp('t', 'Title', TextInputStyle.Short, st.title, false, 200), inp('d', 'Description', TextInputStyle.Paragraph, st.description, false, 3000),
      inp('c', 'Color (hex like #ffd166)', TextInputStyle.Short, '#' + st.color.toString(16).padStart(6, '0'), false, 7), inp('i', 'Image URL (https://...)', TextInputStyle.Short, st.image, false, 300), inp('f', 'Footer', TextInputStyle.Short, st.footer, false, 200)));
    const m = await b.awaitModalSubmit({ time: 180000, filter: (x) => x.customId === 'eb:modal' && x.user.id === b.user.id }).catch(() => null); if (!m) return;
    await m.deferUpdate();
    st.title = m.fields.getTextInputValue('t'); st.description = m.fields.getTextInputValue('d'); st.footer = m.fields.getTextInputValue('f');
    const img = m.fields.getTextInputValue('i'); st.image = /^https?:\/\//i.test(img) ? img : '';
    try { st.color = hexColor(m.fields.getTextInputValue('c')); } catch { /* keep old color */ }
    await c.i.editReply({ embeds: [mk()], components: [row(false)] });
  });
  col.on('end', (_, why) => { if (why === 'time') c.i.editReply({ components: [] }).catch(() => {}); });
  return { handled: true };
}

/* ---------- command list ---------- */
const all = (fn) => async (c) => { const out = []; for (const g of c.i.client.guilds.cache.values()) { try { out.push([g, await fn(g)]); } catch { out.push([g, false]); } } return out; };

module.exports = {
  name: 'premium', description: 'Owner-managed Premium access and server customization', polls, snipes, endGiveaway, onButton,
  hasAccess(guildId, userId) { const owners = (process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean); return !!(guildId && userId && (owners.includes(userId) || db.g(guildId).premiumUsers?.includes(userId))); },
  commands: [
    C('noprefix', 'Premium: use commands without any prefix', [S('mode', 'on, off or status', false, { choices: ['on', 'off', 'status'] })], null, async (c) => {
      const g = G(); const m = c.s('mode') || 'status'; if (m !== 'status') { g.config.np = m === 'on'; db.save(); }
      const on = g.config.np !== false;
      return own('No-prefix mode', `No-prefix is **${on ? 'ON' : 'OFF'}** for you.\nType commands like \`b @user spam\` or \`ping\` without any prefix.\nTurn it off with \`np off\`.`, { icon: on ? '⚡' : '💤' });
    }, O),
    C('servers', 'Premium: list all servers the bot is in', [], null, servers, { ...O, custom: true }),
    C('server-info', 'Premium: details of a server by ID', [S('id', 'Server ID', true, { max: 25 })], null, async (c) => {
      const g = c.i.client.guilds.cache.get(snowflake(c.s('id'))); if (!g) throw new UserError('I am not in that server', 'Use /premium servers to see IDs.');
      return own(g.name, g.description || null, { fields: [['ID', `\`${g.id}\``, true], ['Owner', `<@${g.ownerId}>`, true], ['Members', String(g.memberCount), true], ['Created', ts(g.createdTimestamp), true], ['Boost', String(g.premiumTier), true], ['Channels', String(g.channels.cache.size), true]] });
    }, O),
    C('leave', 'Premium: make the bot leave a server', [S('id', 'Server ID', true, { max: 25 })], null, async (c) => {
      const g = c.i.client.guilds.cache.get(snowflake(c.s('id'))); if (!g) throw new UserError('I am not in that server', 'Use /premium servers to see IDs.');
      const n = g.name; await g.leave(); return own('Left server', `Uranium left **${n}**.`, { icon: '🚪' });
    }, { ...O, danger: 'The bot will **leave** that server.' }),
    C('gban', 'Premium: ban a user in every server', [U(true, 'user', 'User to ban everywhere'), S('reason', 'Reason', false, { max: 300 })], null, async (c) => {
      const u = c.u('user'); if (u.id === c.i.user.id) throw new UserError('You cannot gban yourself');
      const r = await all((g) => g.members.ban(u.id, { reason: `GBAN: ${c.reason()}` }))(c); const ok = r.filter((x) => x[1]).length;
      return own('Global ban done', `**${u.username}** banned in **${ok}** of **${r.length}** servers.`, { icon: '🌍', user: u, fields: [['Reason', c.reason()]] });
    }, { ...O, danger: 'This will **ban the user in every server** the bot is in.' }),
    C('ungban', 'Premium: unban a user in every server', [U(true, 'user', 'User to unban everywhere')], null, async (c) => {
      const u = c.u('user'); const r = await all((g) => g.members.unban(u.id, 'Global unban'))(c); const ok = r.filter((x) => x[1]).length;
      return own('Global unban done', `**${u.username}** unbanned in **${ok}** server(s).`, { icon: '🌍', user: u });
    }, O),
    C('blacklist', 'Premium: block a user from using the bot', [U(), S('reason', 'Reason', false, { max: 200 })], null, async (c) => {
      const u = c.u('user'); if (u.id === c.i.user.id) throw new UserError('You cannot blacklist yourself'); const g = G(); g.blacklist ||= [];
      if (g.blacklist.some((x) => x.id === u.id)) throw new UserError(`**${u.username}** is already blacklisted`);
      g.blacklist.push({ id: u.id, reason: c.reason(), at: Date.now() }); db.save();
      return own('User blacklisted', `**${u.username}** can no longer use Uranium.`, { icon: '🚫', user: u, fields: [['Total blacklisted', String(g.blacklist.length), true]] });
    }, O),
    C('unblacklist', 'Premium: allow a blocked user again', [U()], null, async (c) => {
      const u = c.u('user'); const g = G(); const n = (g.blacklist || []).length; g.blacklist = (g.blacklist || []).filter((x) => x.id !== u.id); db.save();
      if (g.blacklist.length === n) throw new UserError(`**${u.username}** is not blacklisted`);
      return own('User unblocked', `**${u.username}** can use Uranium again.`, { icon: '✅', user: u });
    }, O),
    C('status', 'Premium: change what the bot is doing', [S('type', 'playing, watching, listening or competing', true, { choices: ['playing', 'watching', 'listening', 'competing'] }), S('text', 'Status text', true, { max: 100 })], null, async (c) => {
      const map = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing };
      c.i.client.user.setActivity(c.s('text'), { type: map[c.s('type')] }); G().config.status = { type: c.s('type'), text: c.s('text') }; db.save();
      return own('Status changed', `Now **${c.s('type')}** ${c.s('text')}`, { icon: '🎮' });
    }, O),
    C('bot-avatar', 'Premium: change the bot profile picture', [S('url', 'Image URL (https://...)', true, { max: 400 })], null, async (c) => {
      if (!/^https?:\/\//i.test(c.s('url'))) throw new UserError('That is not a link', 'Use a direct image link starting with https://');
      await c.i.client.user.setAvatar(c.s('url')); return own('Avatar changed', 'The bot has a new profile picture.', { icon: '🖼️' });
    }, O),
    C('restart', 'Premium: restart the bot', [], null, async () => {
      setTimeout(() => { db.flush(); process.exit(0); }, 2500); return own('Restarting', 'Uranium will be back in about a minute.', { icon: '♻️' });
    }, { ...O, danger: 'The bot will **restart** and be offline for a minute.' }),
    C('live-stats', 'Premium: live animated bot statistics', [], null, liveStats, { ...O, custom: true }),
    C('emoji-add', 'Premium: add an emoji to this server', [S('name', 'Emoji name', true, { max: 32 }), S('source', 'Image URL or a custom emoji', true, { max: 300 })], P.ManageGuildExpressions, async (c) => {
      let url = c.s('source'); const m = /^<(a?):\w+:(\d+)>$/.exec(url); if (m) url = `https://cdn.discordapp.com/emojis/${m[2]}.${m[1] ? 'gif' : 'png'}`;
      if (!/^https?:\/\//i.test(url)) throw new UserError('Give an image link or a custom emoji', 'Example: https://.../image.png');
      const e = await c.g.emojis.create({ attachment: url, name: c.s('name').replace(/\W/g, '_'), reason: c.audit() });
      return own('Emoji added', `${e} \`:${e.name}:\``, { icon: '😀', undo: { label: 'Emoji deleted', fn: () => e.delete() } });
    }, PREMIUM_ACCESS),
    C('embed-builder', 'Premium: build and send a custom embed with buttons', [CH('channel', 'Where to send (default: here)')], null, builder, { ...PREMIUM_ACCESS, custom: true }),
    C('poll', 'Premium: live poll with buttons', [S('question', 'Poll question', true, { max: 200 }), S('options', 'Options separated by | or commas (2-5)', true, { max: 400 })], null, async (c) => {
      const opts = c.s('options').split(/[|,]/).map((x) => x.trim()).filter(Boolean).slice(0, 5); if (opts.length < 2) throw new UserError('Give at least 2 options', 'Example: yes | no | maybe');
      const id = Date.now().toString(36); polls.set(id, { q: c.s('question'), opts, votes: new Map(), by: c.i.user.id });
      const m = await c.ch.send(pollView(id)); return own('Poll posted', 'Members can vote with the buttons.', { icon: '📊', links: [['Open poll', m.url]] });
    }, PREMIUM_ACCESS),
    C('giveaway', 'Premium: giveaway with an enter button', [S('duration', 'e.g. 1h, 1d', true, { max: 20 }), I('winners', 'Winners (1-10)', false, 1, 10), S('prize', 'Prize', true, { max: 200 })], null, async (c) => {
      const ms = parseDuration(c.s('duration')); const end = Date.now() + ms; const g = { prize: c.s('prize'), winners: c.n('winners') || 1, end, entrants: [], channelId: c.ch.id, ended: false, hostName: c.i.user.username };
      const m = await c.ch.send(gwView(g)); const d = db.g(c.g.id); (d.giveaways ||= {})[m.id] = g; db.save();
      db.schedule({ type: 'giveaway', at: end, guildId: c.g.id, channelId: c.ch.id, messageId: m.id });
      return own('Giveaway started', `Ends ${ts(end)}.`, { icon: '🎉', links: [['Open giveaway', m.url]] });
    }, PREMIUM_ACCESS),
    C('role-panel', 'Premium: button panel to pick roles', [S('title', 'Panel title', true, { max: 100 }), R('role1', 'Role 1'), R('role2', 'Role 2', false), R('role3', 'Role 3', false), R('role4', 'Role 4', false), R('role5', 'Role 5', false)], P.ManageRoles, async (c) => {
      const roles = ['role1', 'role2', 'role3', 'role4', 'role5'].map((n) => c.r(n)).filter(Boolean);
      for (const role of roles) {
        checkRole(c, role);
        if (!isSafeSelfAssignableRole(role)) throw new UserError(`**${role.name}** cannot be placed in a self-assignment panel because it has powerful permissions.`, `Remove these permissions first: ${blockedSelfAssignablePermissions(role).join(', ')}`);
      }
      const e = goldEmbed(`🏷️ ${c.s('title')}`, roles.map((r) => `• <@&${r.id}>`).join('\n') + '\n\nPress a button to get or remove a role.');
      const m = await c.ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(roles.map((r) => btn(`rp:${r.id}`, trunc(r.name, 70), '🏷️')))] });
      return own('Role panel posted', 'Members can pick roles with the buttons.', { icon: '🏷️', links: [['Open panel', m.url]] });
    }, PREMIUM_ACCESS),
    C('ticket-panel', 'Premium: support ticket panel with a button', [CH('channel', 'Where to post (default: here)', false, [CT.GuildText]), CH('category', 'Category for tickets', false, [CT.GuildCategory]), R('support', 'Support role to add', false)], null, async (c) => {
      const ch = c.c('channel') || c.ch; const m = await ch.send({ embeds: [goldEmbed('🎫 Support tickets', 'Need help? Press the button to open a private ticket.')], components: [new ActionRowBuilder().addComponents(btn(`tk:open:${c.r('support')?.id || 0}:${c.c('category')?.id || 0}`, 'Open ticket', '🎫', ButtonStyle.Success))] });
      return own('Ticket panel posted', `Posted in <#${ch.id}>.`, { icon: '🎫', links: [['Open panel', m.url]] });
    }, PREMIUM_ACCESS),
    C('backup', 'Premium: download this server layout as a file', [], null, async (c) => {
      await c.g.channels.fetch();
      const data = { name: c.g.name, at: new Date().toISOString(), roles: [...c.g.roles.cache.values()].sort((a, b) => b.position - a.position).map((r) => ({ name: r.name, color: r.hexColor, perms: r.permissions.toArray(), hoist: r.hoist, mentionable: r.mentionable, position: r.position })), channels: [...c.g.channels.cache.values()].map((x) => ({ name: x.name, type: CT[x.type], parent: x.parent?.name || null, topic: x.topic || null, nsfw: !!x.nsfw, position: x.position })) };
      return own('Backup ready', `Saved **${data.roles.length}** roles and **${data.channels.length}** channels.`, { icon: '🗄️', files: [{ name: 'uranium-backup.json', data: Buffer.from(JSON.stringify(data, null, 2)) }] });
    }, PREMIUM_ACCESS),
    C('export-cases', 'Premium: download cases, warnings and notes as a file', [], null, async (c) => {
      const d = db.g(c.g.id); const data = { cases: d.cases, warns: d.warns, notes: d.notes, watch: d.watch };
      return own('Export ready', `**${d.cases.length}** cases, **${d.warns.length}** warnings, **${d.notes.length}** notes.`, { icon: '📤', files: [{ name: 'uranium-cases.json', data: Buffer.from(JSON.stringify(data, null, 2)) }] });
    }, PREMIUM_ACCESS),
    C('lockdown-timer', 'Premium: lock a channel and unlock it automatically', [S('duration', 'e.g. 10m, 1h', true, { max: 20 }), CH('channel', 'Channel (default: this one)', false, [CT.GuildText])], null, async (c) => {
      const ms = parseDuration(c.s('duration')); const ch = c.c('channel') || c.ch; if (!ch.permissionOverwrites) throw new UserError('That channel cannot be locked');
      await ch.permissionOverwrites.edit(c.g.roles.everyone, { SendMessages: false }, { reason: c.audit() });
      db.schedule({ type: 'unlock', at: Date.now() + ms, guildId: c.g.id, channelId: ch.id });
      return own('Timed lockdown', `<#${ch.id}> is locked and opens ${ts(Date.now() + ms)}.`, { icon: '⏳', undo: { label: 'Channel unlocked', fn: () => ch.permissionOverwrites.edit(c.g.roles.everyone, { SendMessages: null }) } });
    }, PREMIUM_ACCESS),
    C('history', 'Premium: full moderation history of a user', [U()], null, async (c) => {
      const u = c.u('user'); const d = db.g(c.g.id);
      const rows = [...d.cases.filter((x) => x.userId === u.id).map((x) => ({ at: x.at, t: `🔨 ${x.type}`, r: x.reason })), ...d.warns.filter((x) => x.userId === u.id).map((x) => ({ at: x.at, t: '⚠️ warning', r: x.reason })), ...d.notes.filter((x) => x.userId === u.id).map((x) => ({ at: x.at, t: '📝 note', r: x.text }))].sort((a, b) => b.at - a.at);
      return own(`History of ${u.username}`, rows.length ? rows.slice(0, 15).map((x) => `${ts(x.at)} • **${x.t}** • ${trunc(x.r || '—', 80)}`).join('\n') : '_Clean record._', { icon: '📜', user: u, fields: [['Total entries', String(rows.length), true]] });
    }, PREMIUM_ACCESS),
    C('leaderboard', 'Premium: top moderators by actions', [], null, async (c) => {
      const by = {}; for (const x of db.g(c.g.id).cases) by[x.modId] = (by[x.modId] || 0) + 1;
      const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10); const mx = top[0]?.[1] || 1;
      return own('Moderator leaderboard', top.length ? top.map(([id, n], k) => `${['🥇', '🥈', '🥉'][k] || `**${k + 1}.**`} <@${id}> • **${n}**\n\`${bar(n / mx)}\``).join('\n') : '_No actions yet._', { icon: '🏆' });
    }, PREMIUM_ACCESS),
    C('snipe', 'Premium: see the last deleted message here', [], null, async (c) => {
      const s = snipes.get(c.ch.id); if (!s) throw new UserError('Nothing to snipe here', 'No deleted message was seen in this channel since the bot started.');
      return own('Sniped message', trunc(s.content || '(no text)', 1500), { icon: '🎯', fields: [['Author', `<@${s.authorId}> (${s.author})`, true], ['Deleted', ts(s.at), true]] });
    }, PREMIUM_ACCESS),
  ],
};
