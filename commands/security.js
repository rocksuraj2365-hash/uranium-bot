const { PermissionFlagsBits: P, AuditLogEvent } = require('discord.js');
const { C, S, I, U } = require('../lib/cmd');
const { UserError, res, ts, trunc } = require('../lib/util');
const db = require('../lib/db');
const fortress = require('../lib/fortress');
const PREMIUM = { premium: true };
const title = (name) => '☢ Uranium Security • ' + name;
function requireManager(ctx) { if (!ctx.i.memberPermissions.has(P.ManageGuild)) throw new UserError('You need Manage Server permission to use this security tool.'); }
const flags = [
  ['Administrator', P.Administrator], ['Manage Server', P.ManageGuild],
  ['Manage Roles', P.ManageRoles], ['Manage Channels', P.ManageChannels],
  ['Manage Webhooks', P.ManageWebhooks], ['Ban Members', P.BanMembers],
  ['Kick Members', P.KickMembers], ['Mention Everyone', P.MentionEveryone],
];
const roleSnapshot = (r) => ({ id:r.id, name:r.name, perms:r.permissions.bitfield.toString(), position:r.position, managed:r.managed });
const channelSnapshot = (ch) => ({
  id:ch.id, name:ch.name, type:ch.type, parentId:ch.parentId || null,
  overwrites:[...(ch.permissionOverwrites?.cache?.values() || [])]
    .map(o => ({ id:o.id, type:o.type, allow:o.allow.bitfield.toString(), deny:o.deny.bitfield.toString() }))
    .sort((a,b) => a.id.localeCompare(b.id))
});
const channelSignature = (ch) => JSON.stringify({ name:ch.name, type:ch.type, parentId:ch.parentId || null, overwrites:ch.overwrites });
const roleSignature = (r) => JSON.stringify({ name:r.name, perms:r.perms, position:r.position, managed:r.managed });

async function scan(c) {
  requireManager(c);
  await c.g.roles.fetch().catch(() => {});
  await c.g.channels.fetch().catch(() => {});
  const riskyRoles = [];
  for (const role of c.g.roles.cache.values()) {
    const grants = flags.filter((x) => role.permissions.has(x[1])).map((x) => x[0]);
    if (grants.length) riskyRoles.push({ role, grants });
  }
  const everyoneGrants = flags.filter((x) => c.g.roles.everyone.permissions.has(x[1])).map((x) => x[0]);
  const riskyOverwrites = [];
  for (const ch of c.g.channels.cache.values()) {
    for (const ow of ch.permissionOverwrites.cache.values()) {
      if (ow.id !== c.g.id) continue;
      const grants = flags.filter((x) => ow.allow.has(x[1])).map((x) => x[0]);
      if (grants.length) riskyOverwrites.push({ channel:ch, grants });
    }
  }
  const score = Math.min(100, riskyRoles.reduce((n,x) => n + (x.grants.includes('Administrator') ? 12 : 5), 0) + everyoneGrants.length * 12 + riskyOverwrites.length * 8);
  const level = score >= 60 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';
  const lines = [
    '**Risk indicator: ' + level + ' (' + score + '/100)**',
    'Roles granting sensitive permissions: **' + riskyRoles.length + '**',
    '@everyone sensitive grants: **' + everyoneGrants.length + '**',
    'Channels with sensitive @everyone overrides: **' + riskyOverwrites.length + '**'
  ];
  if (everyoneGrants.length) lines.push('\n**@everyone:** ' + everyoneGrants.join(', '));
  if (riskyRoles.length) lines.push('\n**Sensitive roles**\n' + riskyRoles.slice(0,8).map(x => '• <@&' + x.role.id + '>: ' + x.grants.join(', ')).join('\n'));
  if (riskyOverwrites.length) lines.push('\n**Channel overrides**\n' + riskyOverwrites.slice(0,6).map(x => '• <#' + x.channel.id + '>: ' + x.grants.join(', ')).join('\n'));
  if (!riskyRoles.length && !everyoneGrants.length && !riskyOverwrites.length) lines.push('\nNo sensitive permission grants were detected in the current role/channel cache.');
  lines.push('\nThis is a configuration review, not a guarantee that the server is secure. Review findings before changing permissions.');
  return res(title('Risk scan'), lines.join('\n'), { icon:score >= 60 ? '🚨' : score >= 25 ? '⚠️' : '🛡️' });
}
async function audit(c) {
  const logs = await c.g.fetchAuditLogs({ limit:20 });
  const entries = [...logs.entries.values()].filter(x => Date.now() - x.createdTimestamp <= 7 * 86400000);
  if (!entries.length) return res(title('Audit intelligence'), 'No audit-log entries were returned from the last 7 days.');
  const lines = entries.slice(0,15).map(x => {
    const action = AuditLogEvent[x.action] || 'Action ' + x.action;
    const target = x.target?.name || x.target?.tag || x.target?.id || 'Unknown target';
    const actor = x.executor ? '<@' + x.executor.id + '>' : 'Unknown actor';
    return '• **' + trunc(action,40) + '** • ' + trunc(String(target),55) + '\n  by ' + actor + ' • ' + ts(x.createdTimestamp);
  });
  return res(title('Recent audit intelligence'), lines.join('\n'), { icon:'🧾', fields:[['Window','Last 7 days',true],['Returned',String(entries.length),true]] });
}
async function invites(c) {
  const list = await c.g.invites.fetch();
  const rows = [...list.values()].sort((a,b) => (b.uses || 0) - (a.uses || 0)).slice(0,18);
  if (!rows.length) return res(title('Invite intelligence'), 'No active invites were found.');
  const lines = rows.map(inv => '• **' + inv.code + '** • ' + (inv.maxUses ? (inv.uses || 0) + '/' + inv.maxUses + ' uses' : (inv.uses || 0) + ' uses') + ' • ' + (inv.maxAge ? Math.round(inv.maxAge/3600) + 'h expiry' : 'never expires') + '\n  Channel: ' + (inv.channel ? '<#' + inv.channel.id + '>' : 'Unknown') + ' • Creator: ' + (inv.inviter ? '<@' + inv.inviter.id + '>' : 'Unknown'));
  return res(title('Invite intelligence'), lines.join('\n'), { icon:'🔗', fields:[['Active invites',String(list.size),true],['Displayed',String(rows.length),true]] });
}
async function webhooks(c) {
  const hooks = await c.g.fetchWebhooks();
  const rows = [...hooks.values()].slice(0,20);
  if (!rows.length) return res(title('Webhook inventory'), 'No webhooks were found.');
  const lines = rows.map(h => '• **' + trunc(h.name || 'Unnamed webhook',55) + '**\n  Channel: ' + (h.channel ? '<#' + h.channel.id + '>' : 'Unknown') + ' • Creator: ' + (h.owner ? '<@' + h.owner.id + '>' : 'Unknown'));
  return res(title('Webhook inventory'), lines.join('\n'), { icon:'🪝', fields:[['Total webhooks',String(hooks.size),true]], footer:'Webhook tokens are never displayed.' });
}
async function saveBaseline(c) {
  requireManager(c);
  await c.g.roles.fetch().catch(() => {});
  await c.g.channels.fetch().catch(() => {});
  const roles = [...c.g.roles.cache.values()].map(roleSnapshot);
  const channels = [...c.g.channels.cache.values()].map(channelSnapshot);
  const d = db.g(c.g.id);
  d.securityBaseline = { at:Date.now(), by:c.i.user.id, roles, channels };
  db.save();
  return res(title('Security baseline saved'), 'Saved a configuration baseline containing **' + roles.length + ' roles** and **' + channels.length + ' channels**. Use !security drift later to compare the current setup.', { icon:'🧬' });
}
async function drift(c) {
  requireManager(c);
  await c.g.roles.fetch().catch(() => {});
  await c.g.channels.fetch().catch(() => {});
  const base = db.g(c.g.id).securityBaseline;
  if (!base) throw new UserError('No security baseline exists yet.', 'Run !security baseline first.');
  const oldRoles = new Map(base.roles.map(x => [x.id,x]));
  const newRoles = new Map([...c.g.roles.cache.values()].map(x => [x.id,roleSnapshot(x)]));
  const oldChannels = new Map(base.channels.map(x => [x.id,x]));
  const newChannels = new Map([...c.g.channels.cache.values()].map(x => [x.id,channelSnapshot(x)]));
  const changes = [];
  for (const [id,x] of newRoles) if (!oldRoles.has(id)) changes.push('🟢 Role added: **' + trunc(x.name,70) + '**');
  for (const [id,x] of oldRoles) if (!newRoles.has(id)) changes.push('🔴 Role removed: **' + trunc(x.name,70) + '**');
  for (const [id,x] of newRoles) if (oldRoles.has(id) && roleSignature(x) !== roleSignature(oldRoles.get(id))) changes.push('🟠 Role changed: **' + trunc(x.name,70) + '** (name, permissions or position)');
  for (const [id,x] of newChannels) if (!oldChannels.has(id)) changes.push('🟢 Channel added: **#' + trunc(x.name,70) + '**');
  for (const [id,x] of oldChannels) if (!newChannels.has(id)) changes.push('🔴 Channel removed: **#' + trunc(x.name,70) + '**');
  for (const [id,x] of newChannels) if (oldChannels.has(id) && channelSignature(x) !== channelSignature(oldChannels.get(id))) changes.push('🟠 Channel changed: **#' + trunc(x.name,70) + '** (name, type, category or permissions)');
  const summary = changes.length ? changes.slice(0,22).join('\n') : 'No role or channel configuration changes were detected.';
  return res(title('Configuration drift'), 'Baseline: ' + ts(base.at) + '\nDetected changes: **' + changes.length + '**\n\n' + summary + (changes.length > 22 ? '\n…and ' + (changes.length - 22) + ' more.' : ''), { icon:changes.length ? '🔎' : '✅' });
}

async function fortressCommand(c) {
  requireManager(c);
  const mode = String(c.s('mode') || 'on').toLowerCase();
  if (mode === 'status') {
    const state = db.g(c.g.id).config.fortress;
    return res(title('Fortress status'), state?.enabled
      ? '🛡️ **MAXIMUM PROTECTION ACTIVE**\\nJoin-rate monitoring, spam detection and Discord AutoMod safeguards are enabled.'
      : 'Fortress protection is currently off. Run `!fortress` to enable it.', { icon: state?.enabled ? '🛡️' : '🔎' });
  }
  if (mode === 'off') {
    await fortress.disable(c.g);
    return res(title('Fortress disabled'), 'Protection rules have been disabled and the previous verification level was restored when safe to do so.', { icon: '🔓' });
  }
  const result = await fortress.enable(c.g, c.i.user.id);
  return res(title('FORTRESS MAXIMUM PROTECTION'), result.message, { icon: '🛡️', fields: [
    ['Join defence', 'Burst detection + very-high verification escalation', true],
    ['Spam defence', 'Rapid-repeat and message-flood detection', true],
    ['Discord AutoMod', 'Spam and mention-spam rules', true],
    ['Sanctions', 'Message removal + short timeout for detected spam', true],
    ['DM notices', 'Attempts to notify sanctioned members', true],
  ] });
}


async function securityStatus(c) {
  requireManager(c);
  const cfg = db.g(c.g.id).config;
  const modlog = cfg.modlog ? await c.g.channels.fetch(cfg.modlog).catch(() => null) : null;
  const rules = await c.g.autoModerationRules.fetch().catch(() => null);
  return res(title('Security status'), [
    '**Fortress:** ' + (cfg.fortress?.enabled ? '🟢 Active' : '🔴 Off'),
    '**Verification level:** ' + String(c.g.verificationLevel),
    '**AutoMod rules:** ' + (rules ? rules.size : 'Unavailable'),
    '**Mod-log:** ' + (modlog ? '<#' + modlog.id + '>' : 'Not configured or inaccessible'),
    '**Baseline:** ' + (cfg.securityBaseline ? 'Saved ' + ts(cfg.securityBaseline.at) : 'Not saved'),
    '**Saved channel locks:** ' + Object.keys(cfg.securityLocks || {}).length
  ].join('\n'), { icon:'🛡️' });
}
async function setVerification(c) {
  requireManager(c);
  const levels = { none:0, low:1, medium:2, high:3, 'very-high':4 };
  const choice = c.s('level');
  await c.g.setVerificationLevel(levels[choice], c.audit());
  return res(title('Verification updated'), 'Server verification level set to **' + choice + '**.', { icon:'🔐' });
}
async function lockdown(c) {
  requireManager(c);
  if (!c.ch?.permissionOverwrites || !c.ch.isTextBased()) throw new UserError('Run this command in a server text channel.');
  const cfg = db.g(c.g.id).config;
  cfg.securityLocks ||= {};
  if (cfg.securityLocks[c.ch.id]) throw new UserError('This channel is already locked by Uranium.', 'Use security unlockdown to restore its previous setting.');
  const old = c.ch.permissionOverwrites.cache.get(c.g.id);
  const previous = old?.allow.has(P.SendMessages) ? true : old?.deny.has(P.SendMessages) ? false : null;
  await c.ch.permissionOverwrites.edit(c.g.roles.everyone, { SendMessages:false }, c.audit());
  cfg.securityLocks[c.ch.id] = { previous, at:Date.now(), by:c.i.user.id };
  db.save();
  return res(title('Channel locked'), 'Members using @everyone can no longer send messages in <#' + c.ch.id + '>. The previous permission state was saved for restoration.', { icon:'🔒' });
}
async function unlockdown(c) {
  requireManager(c);
  if (!c.ch?.permissionOverwrites || !c.ch.isTextBased()) throw new UserError('Run this command in a server text channel.');
  const cfg = db.g(c.g.id).config;
  const saved = cfg.securityLocks?.[c.ch.id];
  if (!saved) throw new UserError('No Uranium lockdown record exists for this channel.', 'Uranium will not guess or overwrite permissions it did not save.');
  await c.ch.permissionOverwrites.edit(c.g.roles.everyone, { SendMessages:saved.previous }, c.audit());
  delete cfg.securityLocks[c.ch.id];
  db.save();
  return res(title('Channel unlocked'), 'Restored the previous @everyone Send Messages setting for <#' + c.ch.id + '>.', { icon:'🔓' });
}
async function setSlowmode(c) {
  requireManager(c);
  if (!c.ch?.setRateLimitPerUser) throw new UserError('This channel does not support slowmode.');
  const seconds = c.n('seconds');
  await c.ch.setRateLimitPerUser(seconds, c.audit());
  return res(title('Slowmode updated'), seconds ? 'Slowmode set to **' + seconds + ' seconds**.' : 'Slowmode is now off.', { icon:'⏱️' });
}
async function roleAudit(c) {
  requireManager(c);
  await c.g.roles.fetch();
  const rows = [...c.g.roles.cache.values()].map(role => ({ role, grants:flags.filter(x => role.permissions.has(x[1])).map(x => x[0]) })).filter(x => x.grants.length);
  const text = rows.length ? rows.slice(0,18).map(x => '• <@&' + x.role.id + '> — ' + x.grants.join(', ')).join('\n') : 'No roles with the selected sensitive permissions were found.';
  return res(title('Sensitive role audit'), text + (rows.length > 18 ? '\n…and ' + (rows.length - 18) + ' more.' : ''), { icon:'🧩', fields:[['Roles reviewed',String(c.g.roles.cache.size),true],['Sensitive roles',String(rows.length),true]] });
}
async function adminAudit(c) {
  requireManager(c);
  await c.g.roles.fetch();
  const rows = [...c.g.roles.cache.values()].filter(role => role.permissions.has(P.Administrator));
  return res(title('Administrator role audit'), rows.length ? rows.map(role => '• <@&' + role.id + '> • position ' + role.position + ' • ' + (role.managed ? 'integration-managed' : 'manually managed')).join('\n') : 'No Administrator roles were found.', { icon:rows.length ? '⚠️' : '🛡️', fields:[['Administrator roles',String(rows.length),true]] });
}
async function channelAudit(c) {
  requireManager(c);
  await c.g.channels.fetch();
  const rows = [];
  for (const ch of c.g.channels.cache.values()) {
    const ow = ch.permissionOverwrites?.cache?.get(c.g.id);
    if (!ow) continue;
    const grants = [];
    if (ow.allow.has(P.ViewChannel)) grants.push('ViewChannel');
    if (ow.allow.has(P.SendMessages)) grants.push('SendMessages');
    if (ow.allow.has(P.MentionEveryone)) grants.push('MentionEveryone');
    if (grants.length) rows.push('• <#' + ch.id + '> — @everyone explicitly allowed: ' + grants.join(', '));
  }
  return res(title('Channel permission audit'), rows.length ? rows.slice(0,22).join('\n') : 'No explicit sensitive @everyone channel grants were found.', { icon:'📁', fields:[['Channels reviewed',String(c.g.channels.cache.size),true],['Findings',String(rows.length),true]] });
}
async function botAudit(c) {
  requireManager(c);
  const bots = [...c.g.members.cache.values()].filter(member => member.user.bot);
  const rows = bots.slice(0,20).map(member => {
    const risky = flags.filter(x => member.permissions.has(x[1])).map(x => x[0]);
    return '• <@' + member.id + '> — ' + (risky.length ? risky.join(', ') : 'no selected sensitive permissions');
  });
  return res(title('Bot account audit'), rows.length ? rows.join('\n') : 'No bot accounts are currently present in the member cache. This report only includes members Discord has already cached.', { icon:'🤖', fields:[['Cached bot accounts',String(bots.length),true]] });
}
async function auditUser(c) {
  const user = c.u('user');
  const logs = await c.g.fetchAuditLogs({ limit:25, ...(user ? { user:user.id } : {}) });
  const rows = [...logs.entries.values()].slice(0,18).map(entry => {
    const action = AuditLogEvent[entry.action] || 'Action ' + entry.action;
    const target = entry.target?.name || entry.target?.tag || entry.target?.id || 'Unknown target';
    return '• **' + trunc(action,36) + '** • ' + trunc(String(target),55) + '\n  ' + (entry.executor ? '<@' + entry.executor.id + '>' : 'Unknown actor') + ' • ' + ts(entry.createdTimestamp);
  });
  return res(title('Filtered audit log'), rows.length ? rows.join('\n') : 'No matching audit-log entries were returned.', { icon:'🧾', fields:[['Filter',user ? user.tag : 'All actors',true],['Entries',String(rows.length),true]] });
}
async function inviteAudit(c) {
  const list = await c.g.invites.fetch();
  const rows = [...list.values()].sort((a,b) => (a.maxAge || 0) - (b.maxAge || 0)).slice(0,20);
  const text = rows.length ? rows.map(inv => '• **' + inv.code + '** — uses ' + (inv.uses || 0) + (inv.maxUses ? '/' + inv.maxUses : '/∞') + ', expiry ' + (inv.maxAge ? Math.round(inv.maxAge / 3600) + 'h' : 'never') + ', creator ' + (inv.inviter ? '<@' + inv.inviter.id + '>' : 'unknown')).join('\n') : 'No active invites were found.';
  return res(title('Invite risk audit'), text, { icon:'🔗', fields:[['Active invites',String(list.size),true]] });
}
async function webhookAudit(c) {
  const hooks = await c.g.fetchWebhooks();
  const rows = [...hooks.values()].slice(0,22).map(hook => '• **' + trunc(hook.name || 'Unnamed',55) + '** — ' + (hook.channel ? '<#' + hook.channel.id + '>' : 'unknown channel') + ' — ' + (hook.owner ? '<@' + hook.owner.id + '>' : 'unknown owner'));
  return res(title('Webhook risk audit'), rows.length ? rows.join('\n') : 'No webhooks were found.', { icon:'🪝', fields:[['Total webhooks',String(hooks.size),true]], footer:'Webhook tokens are never requested or displayed.' });
}
async function clearBaseline(c) {
  requireManager(c);
  const cfg = db.g(c.g.id).config;
  if (!cfg.securityBaseline) throw new UserError('There is no saved baseline to clear.');
  delete cfg.securityBaseline;
  db.save();
  return res(title('Baseline cleared'), 'The saved comparison snapshot was removed. No server roles or channels were changed.', { icon:'🗑️' });
}
async function securityReport(c) {
  requireManager(c);
  await c.g.roles.fetch();
  await c.g.channels.fetch();
  const adminRoles = [...c.g.roles.cache.values()].filter(role => role.permissions.has(P.Administrator));
  const everyone = flags.filter(x => c.g.roles.everyone.permissions.has(x[1])).map(x => x[0]);
  const cfg = db.g(c.g.id).config;
  const rules = await c.g.autoModerationRules.fetch().catch(() => null);
  return res(title('Security overview'), [
    '**Administrator roles:** ' + adminRoles.length,
    '**Sensitive @everyone permissions:** ' + (everyone.join(', ') || 'None detected'),
    '**Channels:** ' + c.g.channels.cache.size,
    '**AutoMod rules:** ' + (rules ? rules.size : 'Could not fetch'),
    '**Fortress:** ' + (cfg.fortress?.enabled ? 'Active' : 'Off'),
    '**Baseline:** ' + (cfg.securityBaseline ? 'Saved' : 'Not saved'),
    '**Mod-log:** ' + (cfg.modlog ? '<#' + cfg.modlog + '>' : 'Not configured')
  ].join('\n'), { icon:'🛡️' });
}
async function modlogCheck(c) {
  requireManager(c);
  const id = db.g(c.g.id).config.modlog;
  if (!id) throw new UserError('No moderation log channel is configured.', 'Set one with server set-modlog first.');
  const channel = await c.g.channels.fetch(id).catch(() => null);
  if (!channel?.isTextBased()) throw new UserError('The configured moderation log channel is missing or is not text-based.');
  const perms = channel.permissionsFor(c.me);
  const missing = [P.ViewChannel, P.SendMessages].filter(bit => !perms?.has(bit));
  return res(title('Mod-log permission check'), missing.length ? 'Uranium is missing: **' + missing.map(bit => flags.find(x => x[1] === bit)?.[0] || String(bit)).join(', ') + '** in <#' + id + '>.' : 'Uranium can view and send messages in <#' + id + '>.', { icon:missing.length ? '⚠️' : '✅' });
}
async function permissionCheck(c) {
  requireManager(c);
  const member = await c.m('member') || c.i.member;
  const channelPerms = c.ch.permissionsFor(member);
  const grants = flags.filter(x => member.permissions.has(x[1])).map(x => x[0]);
  const channelGrants = flags.filter(x => channelPerms?.has(x[1])).map(x => x[0]);
  return res(title('Member permission check'), [
    '**Member:** <@' + member.id + '>',
    '**Sensitive server permissions:** ' + (grants.join(', ') || 'None'),
    '**Sensitive permissions in this channel:** ' + (channelGrants.join(', ') || 'None')
  ].join('\n'), { icon:grants.includes('Administrator') ? '⚠️' : '🔎' });
}
async function alertTest(c) {
  requireManager(c);
  const id = db.g(c.g.id).config.modlog;
  if (!id) throw new UserError('No moderation log channel is configured.', 'Set one with server set-modlog first.');
  const channel = await c.g.channels.fetch(id).catch(() => null);
  if (!channel?.isTextBased() || !channel.permissionsFor(c.me)?.has(P.SendMessages)) throw new UserError('Uranium cannot send a test message to the configured log channel.');
  await channel.send({ content:'🛡️ Uranium security alert test requested by <@' + c.i.user.id + '>.', allowedMentions:{ parse:[] } });
  return res(title('Alert test sent'), 'A test security notice was posted in <#' + id + '>.', { icon:'✅' });
}

module.exports = {
  name:'security',
  description:'Premium security intelligence: permission scans, audit review and configuration drift.',
  commands:[
    C('fortress','Enable or manage Uranium maximum server protection',[{ n:'mode', d:'on, off, or status', t:'str', req:false, choices:['on','off','status'] }],P.ManageGuild,fortressCommand),
    C('scan','Premium: scan roles and channel overrides for sensitive permissions',[],null,scan,PREMIUM),
    C('audit','Premium: review recent server audit-log activity',[],P.ViewAuditLog,audit,PREMIUM),
    C('invites','Premium: inspect active server invites and usage limits',[],P.ManageGuild,invites,PREMIUM),
    C('webhooks','Premium: inventory server webhooks without exposing tokens',[],P.ManageWebhooks,webhooks,PREMIUM),
    C('baseline','Premium: save a role and channel configuration baseline',[],null,saveBaseline,PREMIUM),
    C('drift','Premium: compare current roles and channels against the saved baseline',[],null,drift,PREMIUM),

    C('status','Premium: show the server security configuration at a glance',[],null,securityStatus,PREMIUM),
    C('verification','Premium: set the server verification level',[S('level','none, low, medium, high, or very-high',true,{ choices:['none','low','medium','high','very-high'] })],P.ManageGuild,setVerification,PREMIUM),
    C('lockdown','Premium: lock this text channel and save its previous permission',[],P.ManageChannels,lockdown,PREMIUM),
    C('unlockdown','Premium: restore the channel permission saved by Uranium',[],P.ManageChannels,unlockdown,PREMIUM),
    C('slowmode','Premium: set slowmode in this channel',[I('seconds','Seconds (0-21600)',true,0,21600)],P.ManageChannels,setSlowmode,PREMIUM),
    C('slowmode-off','Premium: turn off slowmode in this channel',[],P.ManageChannels,async (c) => { if (!c.ch?.setRateLimitPerUser) throw new UserError('This channel does not support slowmode.'); await c.ch.setRateLimitPerUser(0,c.audit()); return res(title('Slowmode disabled'),'Slowmode is now off in this channel.',{icon:'✅'}); },PREMIUM),
    C('role-audit','Premium: list roles with sensitive permissions',[],null,roleAudit,PREMIUM),
    C('admin-audit','Premium: list every role with Administrator permission',[],null,adminAudit,PREMIUM),
    C('channel-audit','Premium: inspect explicit sensitive @everyone channel grants',[],null,channelAudit,PREMIUM),
    C('bot-audit','Premium: review cached bot accounts and their effective permissions',[],null,botAudit,PREMIUM),
    C('audit-user','Premium: filter audit-log entries by an optional user',[U(false,'user','Filter by audit-log actor')],P.ViewAuditLog,auditUser,PREMIUM),
    C('invite-audit','Premium: review active invites, creators, limits and expiry',[],P.ManageGuild,inviteAudit,PREMIUM),
    C('webhook-audit','Premium: review webhook names, channels and owners without tokens',[],P.ManageWebhooks,webhookAudit,PREMIUM),
    C('baseline-clear','Premium: remove the saved security comparison snapshot',[],null,clearBaseline,{...PREMIUM,danger:'This removes the saved security baseline. It does not change server settings.'}),
    C('report','Premium: create a compact overview of important server security settings',[],null,securityReport,PREMIUM),
    C('modlog-check','Premium: check whether Uranium can access the configured moderation log',[],null,modlogCheck,PREMIUM),
    C('permission-check','Premium: inspect sensitive permissions for a member in this channel',[U(false,'member','Member to inspect')],null,permissionCheck,PREMIUM),
    C('alert-test','Premium: send a test notice to the configured moderation log',[],P.ManageGuild,alertTest,PREMIUM),
  ],
};
