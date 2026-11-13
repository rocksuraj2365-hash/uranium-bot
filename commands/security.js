const { PermissionFlagsBits: P, AuditLogEvent } = require('discord.js');
const { C } = require('../lib/cmd');
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
  ],
};
