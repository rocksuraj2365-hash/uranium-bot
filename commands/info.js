const { PermissionFlagsBits: P, ChannelType: CT, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, SnowflakeUtil, PermissionsBitField } = require('discord.js');
const { C, U, S, R, CH } = require('../lib/cmd');
const { UserError, res, ts, nice, trunc, inviteUrl, snowflake, MOD_PERMS } = require('../lib/util');
const { COLORS, FOOT } = require('../lib/ui');

const started = Date.now();
const link = (label, url) => new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
const tu = (c) => c.u('user') || c.i.user;
const needsLook = ['SendMessages', 'ViewChannel', 'ManageMessages', 'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageRoles', 'ManageChannels', 'ManageGuild', 'ManageNicknames', 'ViewAuditLog', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'EmbedLinks'];

async function help(c) {
  const cats = c.cats; let page = 0; const total = cats.length + 1;
  const build = () => {
    const e = new EmbedBuilder().setColor(COLORS.ok).setFooter({ text: `${FOOT} • Page ${page + 1}/${total}` });
    if (page === 0) {
      e.setTitle('☢️ Uranium — Command Center').setDescription('Browse moderation, utility, community, fun, server tools, music and AI commands. Prefix commands work too.\nUse `/info setup-check` first to see if I have all permissions.')
        .addFields(cats.map((x) => ({ name: `/${x.name}`, value: `${x.description}\n**${x.commands.length}** commands`, inline: true })));
    } else {
      const x = cats[page - 1];
      e.setTitle(`/${x.name} — ${x.description}`).setDescription(trunc(x.commands.map((s) => `\`/${x.name} ${s.name}\` — ${s.desc}`).join('\n'), 4000));
    }
    return e;
  };
  const row = (off) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help:home').setEmoji('🏠').setStyle(ButtonStyle.Primary).setDisabled(off || page === 0),
    new ButtonBuilder().setCustomId('help:prev').setEmoji('◀️').setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(off || page === 0),
    new ButtonBuilder().setCustomId('help:next').setEmoji('▶️').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(off || page === total - 1),
    new ButtonBuilder().setCustomId('help:close').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(off));
  const msg = await c.i.editReply({ embeds: [build()], components: [row(false)] });
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000, filter: (b) => b.customId.startsWith('help:') });
  col.on('collect', async (b) => {
    if (b.user.id !== c.i.user.id) return b.reply({ content: 'Only the person who opened help can use these buttons. Run `/info help` yourself.', flags: 64 });
    const k = b.customId.split(':')[1];
    if (k === 'close') { col.stop('closed'); return b.update({ components: [row(true)] }); }
    page = k === 'home' ? 0 : k === 'next' ? Math.min(page + 1, total - 1) : Math.max(page - 1, 0);
    await b.update({ embeds: [build()], components: [row(false)] });
  });
  col.on('end', () => c.i.editReply({ components: [row(true)] }).catch(() => {}));
  return { handled: true };
}
async function memberOf(c, u) { return c.g.members.fetch(u.id).catch(() => null); }

const reportCooldown = new Map();
async function submitReport(c) {
  const userId = c.i.user.id;
  const now = Date.now();
  const until = reportCooldown.get(userId) || 0;
  if (until > now) throw new UserError('Please wait before sending another report.', `Try again in ${Math.ceil((until - now) / 60000)} minute(s).`);
  const details = String(c.s('details') || '').trim();
  if (details.length < 8) throw new UserError('Please add a little more detail.', 'A useful report needs at least 8 characters.');
  const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle('Uranium user report')
    .setDescription(trunc(details, 1000))
    .addFields(
      { name: 'Reporter', value: `${c.i.user.username} (\`${userId}\`)`, inline: true },
      { name: 'Server', value: trunc(c.g.name, 100), inline: true },
      { name: 'Channel', value: `#${trunc(c.ch?.name || 'unknown', 90)} (\`${c.ch?.id || 'unknown'}\`)`, inline: true }
    ).setTimestamp();
  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  let delivered = false;
  const reportChannelId = String(process.env.BOT_REPORT_CHANNEL_ID || '').trim();
  if (reportChannelId) {
    const channel = await c.i.client.channels.fetch(reportChannelId).catch(() => null);
    if (channel?.isTextBased?.() && typeof channel.send === 'function') {
      await channel.send(payload).then(() => { delivered = true; }).catch(() => {});
    }
  }
  if (!delivered) {
    const owners = [...new Set(String(process.env.OWNER_IDS || '').split(/[\\s,]+/).filter(id => /^\\d{17,20}$/.test(id)))];
    for (const ownerId of owners) {
      const owner = await c.i.client.users.fetch(ownerId).catch(() => null);
      if (!owner) continue;
      try { await owner.send(payload); delivered = true; } catch {}
    }
  }
  if (!delivered) throw new UserError('Reporting is temporarily unavailable.', 'Please contact a server administrator or the bot operator directly.');
  reportCooldown.set(userId, now + 5 * 60 * 1000);
  return res('Report sent', 'Thanks for reporting this. The Uranium operator has been notified. Your report is sent to the configured support destination and is not posted publicly.', { icon: '📨', color: 0x8b5cf6 });
}

module.exports = {
  name: 'info', description: 'Info, help and bot status',
  commands: [
    C('help', 'Browse all Uranium commands', [], null, help, { custom: true }),
    C('report', 'Privately report a Uranium issue or policy concern', [S('details', 'Describe the issue (8-1000 characters)', true, { max: 1000 })], null, submitReport),
    C('ping', 'Check the bot speed', [], null, async (c) => res('Pong!', null, { icon: '🏓', fields: [['Websocket', `${Math.round(c.i.client.ws.ping)} ms`, true], ['Response', `${Date.now() - c.i.createdTimestamp} ms`, true]] })),
    C('uptime', 'How long the bot has been running', [], null, async () => res('Uptime', `Online since ${ts(started)}`, { icon: '⏱️', fields: [['Running for', `${Math.floor(process.uptime() / 3600)}h ${Math.floor(process.uptime() / 60) % 60}m`]] })),
    C('about', 'About Uranium', [], null, async (c) => res('About Uranium', 'A modern Discord bot with moderation, utility, community, fun, music, AI and a web dashboard.', { icon: '☢️', links: [['Invite Uranium', inviteUrl(c.i.client.application.id)], ...(process.env.PUBLIC_BASE_URL ? [['Website', process.env.PUBLIC_BASE_URL]] : [])] })),
    C('botinfo', 'Technical bot info', [], null, async (c) => res('Bot info', null, { icon: '🤖', color: 0x5b8cff, fields: [['Servers', String(c.i.client.guilds.cache.size), true], ['Node.js', process.version, true], ['Memory', `${Math.round(process.memoryUsage().rss / 1048576)} MB`, true], ['Commands', String(c.cats.reduce((n, x) => n + x.commands.length, 0)), true]] })),
    C('userinfo', 'Info about a member', [U(false)], null, async (c) => {
      const u = tu(c); const m = await memberOf(c, u); const roles = m ? [...m.roles.cache.values()].filter((r) => r.id !== c.g.id).sort((a, b) => b.position - a.position).slice(0, 15).map((r) => `<@&${r.id}>`).join(' ') : '';
      return res(u.username, null, { icon: '👤', color: m?.displayColor || 0x5b8cff, user: u, fields: [['ID', `\`${u.id}\``, true], ['Created', ts(u.createdTimestamp), true], ['Joined', m ? ts(m.joinedTimestamp) : 'Not in server', true], ['Bot', u.bot ? 'Yes' : 'No', true], ['Timed out', m?.isCommunicationDisabled() ? 'Yes' : 'No', true], ['Roles', roles || 'None']] });
    }),
    C('avatar', 'Show a profile picture', [U(false)], null, async (c) => { const u = tu(c); const url = u.displayAvatarURL({ size: 1024 }); return { embed: new EmbedBuilder().setColor(COLORS.info).setTitle(`${u.username}'s avatar`).setImage(url).setFooter({ text: FOOT }), links: [['Open full size', url]] }; }),
    C('banner', 'Show a profile banner', [U(false)], null, async (c) => {
      const u = await tu(c).fetch(true); const url = u.bannerURL({ size: 1024 }); if (!url) throw new UserError(`**${u.username}** has no banner`, 'Only users with a banner can be shown.');
      return { embed: new EmbedBuilder().setColor(COLORS.info).setTitle(`${u.username}'s banner`).setImage(url).setFooter({ text: FOOT }), links: [['Open full size', url]] };
    }),
    C('serverinfo', 'Info about this server', [], null, async (c) => {
      const g = c.g; await g.channels.fetch();
      return res(g.name, g.description || null, { icon: '🏰', color: 0x5b8cff, fields: [['Owner', `<@${g.ownerId}>`, true], ['Members', String(g.memberCount), true], ['Created', ts(g.createdTimestamp), true], ['Text', String(g.channels.cache.filter((x) => x.type === CT.GuildText).size), true], ['Voice', String(g.channels.cache.filter((x) => x.type === CT.GuildVoice).size), true], ['Roles', String(g.roles.cache.size), true], ['Boost level', String(g.premiumTier), true], ['Boosts', String(g.premiumSubscriptionCount || 0), true]] });
    }),
    C('server-icon', 'Show the server icon', [], null, async (c) => { const url = c.g.iconURL({ size: 1024 }); if (!url) throw new UserError('This server has no icon'); return { embed: new EmbedBuilder().setColor(COLORS.info).setTitle(`${c.g.name} icon`).setImage(url).setFooter({ text: FOOT }), links: [['Open full size', url]] }; }),
    C('roleinfo', 'Info about a role', [R('role', 'Role')], null, async (c) => { const r = c.r('role'); return res(r.name, null, { icon: '🏷️', color: r.color || 0x5b8cff, fields: [['ID', `\`${r.id}\``, true], ['Members', String(r.members.size), true], ['Position', String(r.position), true], ['Color', r.hexColor, true], ['Hoisted', r.hoist ? 'Yes' : 'No', true], ['Mentionable', r.mentionable ? 'Yes' : 'No', true], ['Created', ts(r.createdTimestamp), true]] }); }),
    C('channelinfo', 'Info about a channel', [CH('channel', 'Channel (default: this one)')], null, async (c) => { const ch = c.c('channel') || c.ch; return res(`#${ch.name}`, ch.topic || null, { icon: '📺', color: 0x5b8cff, fields: [['ID', `\`${ch.id}\``, true], ['Type', nice(CT[ch.type]), true], ['Created', ts(ch.createdTimestamp), true], ['Slowmode', `${ch.rateLimitPerUser || 0}s`, true], ['NSFW', ch.nsfw ? 'Yes' : 'No', true]] }); }),
    C('membercount', 'How many members the server has', [], null, async (c) => res('Members', `**${c.g.memberCount}** members`, { icon: '👥' })),
    C('boosts', 'Server boost status', [], null, async (c) => res('Boosts', `Level **${c.g.premiumTier}** with **${c.g.premiumSubscriptionCount || 0}** boost(s).`, { icon: '🚀', color: 0xff73fa })),
    C('snowflake', 'Turn a Discord ID into a date', [S('id', 'Any Discord ID', true, { max: 25 })], null, async (c) => { const t = SnowflakeUtil.timestampFrom(snowflake(c.s('id'))); return res('Snowflake', `Created ${ts(t, 'F')} (${ts(t)})`, { icon: '🧮', color: 0x5b8cff }); }),
    C('account-age', 'How old an account is', [U(false)], null, async (c) => { const u = tu(c); return res(`${u.username}'s account`, `Created ${ts(u.createdTimestamp, 'F')} (${ts(u.createdTimestamp)})`, { icon: '🎂', user: u }); }),
    C('permissions', 'See permissions of a member in this channel', [U(false)], null, async (c) => {
      const u = tu(c); const m = await memberOf(c, u); if (!m) throw new UserError('That user is not in this server'); const p = c.ch.permissionsFor(m);
      return res(`${u.username} here`, trunc(p.toArray().map(nice).join(', ') || 'None', 3800), { icon: '🔑', user: u, color: 0x5b8cff });
    }),
    C('bot-permissions', 'See what permissions the bot has here', [], null, async (c) => res('My permissions here', trunc(c.ch.permissionsFor(c.me).toArray().map(nice).join(', ') || 'None', 3800), { icon: '🤖', color: 0x5b8cff })),
    C('setup-check', 'Check if the bot has everything it needs', [], null, async (c) => {
      const lines = needsLook.map((k) => `${c.me.permissions.has(P[k]) ? '✅' : '❌'} ${nice(k)}`); const miss = needsLook.filter((k) => !c.me.permissions.has(P[k])).length;
      return res(miss ? `${miss} permission(s) missing` : 'Everything is ready', lines.join('\n') + `\n\nMy top role position: **${c.me.roles.highest.position}**. Keep it above the members you moderate.`, { icon: miss ? '⚠️' : '✅', color: miss ? 0xffb84d : 0x39d98a, links: miss ? [['Re-invite with permissions', inviteUrl(c.i.client.application.id)]] : [] });
    }),
    C('invite-bot', 'Get the bot invite link', [], null, async (c) => res('Invite Uranium', 'Add Uranium to another server with the right permissions.', { icon: '➕', links: [['Invite Uranium', inviteUrl(c.i.client.application.id)]] })),
    C('dashboard', 'Open the web dashboard', [], null, async () => { const u = process.env.PUBLIC_BASE_URL; if (!u) throw new UserError('The dashboard link is not set yet', 'The owner must set PUBLIC_BASE_URL on the bot service.'); return res('Dashboard', 'Manage Uranium on the website.', { icon: '🖥️', links: [['Open dashboard', `${u.replace(/\/$/, '')}/dashboard`]] }); }),
    C('commands-list', 'Count commands per category', [], null, async (c) => res('Commands', c.cats.map((x) => `\`/${x.name}\` — **${x.commands.length}**`).join('\n') + `\n\n**${c.cats.reduce((n, x) => n + x.commands.length, 0)}** total`, { icon: '📚', color: 0x5b8cff })),
    C('time', 'Show the current time in Discord format', [], null, async () => res('Current time', `${ts(Date.now(), 'F')}\n${ts(Date.now())}`, { icon: '🕒', color: 0x5b8cff })),
    C('id-lookup', 'Find a user by ID', [S('id', 'User ID', true, { max: 25 })], null, async (c) => {
      const u = await c.i.client.users.fetch(snowflake(c.s('id'))).catch(() => null); if (!u) throw new UserError('No user with that ID', 'Check the number.');
      return res(u.username, null, { icon: '🔍', user: u, color: 0x5b8cff, fields: [['ID', `\`${u.id}\``, true], ['Created', ts(u.createdTimestamp), true], ['Bot', u.bot ? 'Yes' : 'No', true]] });
    }),
    C('mod-guide', 'Quick moderation tips', [], null, async () => res('Moderation guide', '**1.** Warn first, then timeout, then kick, then ban.\n**2.** Always give a reason so the log stays clear.\n**3.** Use `/server set-modlog` so every action is logged.\n**4.** Made a mistake? Press the **Undo** button under the result.\n**5.** Turn on `/automod spam-enable` and `/automod preset-all` for basic protection.', { icon: '📘', color: 0x5b8cff })),
  ],
};
