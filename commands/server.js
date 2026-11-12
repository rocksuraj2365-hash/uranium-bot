const { PermissionFlagsBits: P, ChannelType: CT, AuditLogEvent, GuildVerificationLevel, GuildDefaultMessageNotifications } = require('discord.js');
const { C, S, I, CH, RS } = require('../lib/cmd');
const db = require('../lib/db');
const cv2 = require('../lib/cv2');
const icons = require('../lib/emojis');
const { UserError, res, ts, trunc, snowflake } = require('../lib/util');

const MG = P.ManageGuild;
const caseLine = (x) => `**#${x.id}** \`${x.type}\` • <@${x.userId}> • ${trunc(x.reason || '—', 60)} • ${ts(x.at)}`;
const getCase = (c, id) => { const x = db.getCase(c.g.id, id); if (!x) throw new UserError(`Case #${id} does not exist`, 'Use /server cases to see case numbers.'); return x; };
const VL = ['None', 'Low', 'Medium', 'High', 'VeryHigh'];

module.exports = {
  name: 'server', description: 'Server settings, cases, invites, logs',
  commands: [
    C('set-modlog', 'Choose the channel where mod actions are logged', [CH('channel', 'Log channel', true, [CT.GuildText, CT.GuildAnnouncement])], MG, async (c) => {
      const ch = c.c('channel'); db.g(c.g.id).config.modlog = ch.id; db.save();
      await ch.send({ content: '✅ Uranium will log moderation actions here.' }).catch(() => { throw new UserError(`I cannot write in <#${ch.id}>`, 'Give me View Channel and Send Messages there.'); });
      return res('Mod log set', `Actions will be logged in <#${ch.id}>.`, { icon: '📜' });
    }),
    C('clear-modlog', 'Stop logging mod actions', [], MG, async (c) => {
      if (!db.g(c.g.id).config.modlog) throw new UserError('No mod log is set', 'Use /server set-modlog first.');
      delete db.g(c.g.id).config.modlog; db.save(); return res('Mod log cleared', 'Actions are no longer logged.', { icon: '🧹' });
    }),
    C('config', 'Show Uranium settings of this server', [], MG, async (c) => {
      const d = db.g(c.g.id);
      return res('Uranium config', 'Current settings for this server', { icon: '⚙️', color: 0x5b8cff, fields: [['Mod log', d.config.modlog ? `<#${d.config.modlog}>` : 'Not set', true], ['Appeal link', d.config.appeal || 'Not set', true], ['Cases', String(d.cases.length), true], ['Warnings', String(d.warns.length), true], ['Notes', String(d.notes.length), true], ['Watchlist', String(d.watch.length), true]] });
    }),
    C('cases', 'List recent moderation cases', [S('type', 'Filter by type (e.g. ban)', false, { max: 20 })], P.ModerateMembers, async (c) => {
      let l = db.g(c.g.id).cases; if (c.s('type')) l = l.filter((x) => x.type === c.s('type').toLowerCase());
      return res('Recent cases', l.length ? l.slice(-12).reverse().map(caseLine).join('\n') : '_No cases yet._', { icon: '📋', color: 0x5b8cff, fields: [['Total', String(l.length), true]] });
    }),
    C('case', 'Show one case', [I('id', 'Case number', true, 1)], P.ModerateMembers, async (c) => {
      const x = getCase(c, c.n('id'));
      return res(`Case #${x.id} — ${x.type}`, null, { icon: '📋', color: 0x5b8cff, fields: [['User', `<@${x.userId}> (\`${x.userId}\`)`], ['Moderator', `<@${x.modId}>`, true], ['When', ts(x.at), true], ['Reason', x.reason || '—']] });
    }),
    C('case-reason', 'Edit the reason of a case', [I('id', 'Case number', true, 1), S('reason', 'New reason', true, { max: 300 })], P.ModerateMembers, async (c) => {
      const x = getCase(c, c.n('id')); x.reason = c.s('reason'); db.save();
      return res('Case updated', `Case **#${x.id}** reason changed.`, { icon: '✏️' });
    }),
    C('case-delete', 'Delete a case', [I('id', 'Case number', true, 1)], MG, async (c) => {
      getCase(c, c.n('id')); db.remove(c.g.id, 'cases', c.n('id')); return res('Case deleted', `Case **#${c.n('id')}** was removed.`, { icon: '🗑️' });
    }),
    C('stats', 'Moderation statistics', [], P.ModerateMembers, async (c) => {
      const cs = db.g(c.g.id).cases; const by = {}; for (const x of cs) by[x.type] = (by[x.type] || 0) + 1;
      return res('Moderation stats', Object.keys(by).length ? Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `\`${k}\` — **${v}**`).join('\n') : '_No actions yet._', { icon: '📊', color: 0x5b8cff, fields: [['Total cases', String(cs.length), true]] });
    }),
    C('audit-log', 'Show the latest audit log entries', [], P.ViewAuditLog, async (c) => {
      const l = await c.g.fetchAuditLogs({ limit: 10 });
      return res('Latest audit log', trunc([...l.entries.values()].map((e) => `**${AuditLogEvent[e.action] || e.action}** • ${e.executor ? `<@${e.executor.id}>` : '?'} • ${ts(e.createdTimestamp)}`).join('\n') || '_Empty._', 3800), { icon: '🕵️', color: 0x5b8cff });
    }),
    C('invite-list', 'List active invites', [], MG, async (c) => {
      const l = [...(await c.g.invites.fetch()).values()];
      return res(`Invites (${l.length})`, trunc(l.slice(0, 20).map((i) => `\`${i.code}\` • ${i.uses} uses • ${i.inviter?.username || '?'}`).join('\n') || '_None._', 3800), { icon: '🔗', color: 0x5b8cff });
    }),
    C('invite-delete', 'Delete an invite by its code', [S('code', 'Invite code', true, { max: 30 })], MG, async (c) => {
      await c.g.invites.delete(c.s('code').replace(/^.*\//, ''), c.audit()); return res('Invite deleted', `Invite \`${c.s('code')}\` no longer works.`, { icon: '🗑️' });
    }),
    C('invite-create', 'Create an invite link', [CH('channel', 'Channel', true, [CT.GuildText, CT.GuildVoice, CT.GuildAnnouncement]), I('hours', 'Valid for hours (0 = forever)', false, 0, 168), I('uses', 'Max uses (0 = unlimited)', false, 0, 100)], P.CreateInstantInvite, async (c) => {
      const inv = await c.c('channel').createInvite({ maxAge: (c.n('hours') || 0) * 3600, maxUses: c.n('uses') || 0, unique: true, reason: c.audit() });
      return res('Invite created', inv.url, { icon: '🔗', links: [['Open invite', inv.url]], undo: { label: 'Invite deleted', fn: () => inv.delete() } });
    }),
    C('verification-level', 'Set the server verification level', [S('level', 'Level', true, { choices: VL })], MG, async (c) => {
      const old = c.g.verificationLevel; await c.g.setVerificationLevel(GuildVerificationLevel[c.s('level')], c.audit());
      return res('Verification level set', `Now **${c.s('level')}**.`, { icon: '🛡️', undo: { label: 'Level restored', fn: () => c.g.setVerificationLevel(old) } });
    }),
    C('default-notifications', 'Set default notification level', [S('level', 'Level', true, { choices: ['AllMessages', 'OnlyMentions'] })], MG, async (c) => {
      await c.g.setDefaultMessageNotifications(GuildDefaultMessageNotifications[c.s('level')], c.audit());
      return res('Notifications set', `Default is **${c.s('level')}**.`, { icon: '🔔' });
    }),
    C('rename', 'Rename the server', [S('name', 'New server name', true, { max: 100 })], MG, async (c) => {
      const old = c.g.name; await c.g.setName(c.s('name'), c.audit());
      return res('Server renamed', `**${old}** → **${c.s('name')}**`, { icon: '✏️', undo: { label: 'Name restored', fn: () => c.g.setName(old) } });
    }),
    C('afk-channel', 'Set the AFK voice channel', [CH('channel', 'Voice channel', true, [CT.GuildVoice])], MG, async (c) => {
      await c.g.setAFKChannel(c.c('channel'), c.audit()); return res('AFK channel set', `**${c.c('channel').name}**`, { icon: '😴' });
    }),
    C('afk-timeout', 'Set AFK timeout', [I('seconds', 'Seconds', true, 60, 3600)], MG, async (c) => {
      const ok = [60, 300, 900, 1800, 3600]; if (!ok.includes(c.n('seconds'))) throw new UserError('Discord only allows 60, 300, 900, 1800 or 3600 seconds', 'Pick one of those numbers.');
      await c.g.setAFKTimeout(c.n('seconds'), c.audit()); return res('AFK timeout set', `**${c.n('seconds')}s**`, { icon: '⏰' });
    }),
    C('system-channel', 'Set the system messages channel', [CH('channel', 'Text channel', true, [CT.GuildText])], MG, async (c) => {
      await c.g.setSystemChannel(c.c('channel'), c.audit()); return res('System channel set', `<#${c.c('channel').id}>`, { icon: '📨' });
    }),
    C('emoji-list', 'List custom emojis', [], P.ManageGuildExpressions, async (c) => {
      const l = [...(await c.g.emojis.fetch()).values()];
      return res(`Emojis (${l.length})`, trunc(l.map((e) => `${e} \`${e.name}\``).join('  ') || '_None._', 3800), { icon: '😀', color: 0x5b8cff });
    }),
    C('emoji-delete', 'Delete a custom emoji', [S('emoji', 'Emoji name or ID', true, { max: 60 })], P.ManageGuildExpressions, async (c) => {
      const l = await c.g.emojis.fetch(); const q = c.s('emoji').toLowerCase().replace(/[<>:]/g, '');
      const e = l.find((x) => x.id === q || x.name.toLowerCase() === q || q.endsWith(x.id));
      if (!e) throw new UserError('Emoji not found', 'Use /server emoji-list to see names.');
      const name = e.name; await e.delete(c.audit()); return res('Emoji deleted', `**:${name}:** was removed.`, { icon: '🗑️' });
    }, { danger: 'This will **delete the emoji**.' }),
    C('webhook-list', 'List server webhooks', [], P.ManageWebhooks, async (c) => {
      const l = [...(await c.g.fetchWebhooks()).values()];
      return res(`Webhooks (${l.length})`, trunc(l.map((w) => `**${w.name}** • \`${w.id}\` • <#${w.channelId}>`).join('\n') || '_None._', 3800), { icon: '🪝', color: 0x5b8cff });
    }),
    C('webhook-delete', 'Delete a webhook by ID', [S('id', 'Webhook ID', true, { max: 25 })], P.ManageWebhooks, async (c) => {
      const w = (await c.g.fetchWebhooks()).get(snowflake(c.s('id'))); if (!w) throw new UserError('Webhook not found', 'Use /server webhook-list to see IDs.');
      await w.delete(c.audit()); return res('Webhook deleted', `**${w.name}** was removed.`, { icon: '🗑️' });
    }, { danger: 'This will **delete the webhook**.' }),
    C('prune-preview', 'See how many inactive members a prune would kick', [I('days', 'Inactive for days (1-30)', true, 1, 30)], P.KickMembers, async (c) => {
      const n = await c.g.members.prune({ days: c.n('days'), dry: true }); return res('Prune preview', `**${n}** member(s) would be kicked (inactive ${c.n('days')}+ days).`, { icon: '🔍', color: 0x5b8cff });
    }),
    C('prune-run', 'Kick members inactive for N days', [I('days', 'Inactive for days (1-30)', true, 1, 30), RS()], P.KickMembers, async (c) => {
      const n = await c.g.members.prune({ days: c.n('days'), reason: c.audit() }); return res('Prune finished', `Kicked **${n}** inactive member(s).`, { icon: '🧹', color: 0xffb84d });
    }, { danger: 'This will **kick all members** inactive for the chosen days.' }),
    C('set-appeal-link', 'Set a ban appeal link shown in DMs', [S('url', 'https:// link', true, { max: 200 })], MG, async (c) => {
      if (!/^https?:\/\/\S+$/i.test(c.s('url'))) throw new UserError('That is not a valid link', 'It must start with https://');
      db.g(c.g.id).config.appeal = c.s('url'); db.save(); return res('Appeal link saved', c.s('url'), { icon: '📨' });
    }),
  ],
};
