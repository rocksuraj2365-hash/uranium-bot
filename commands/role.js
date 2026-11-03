const { PermissionFlagsBits: P, ChannelType: CT } = require('discord.js');
const { C, U, S, B, R, RS, DUR, I } = require('../lib/cmd');
const db = require('../lib/db');
const { UserError, res, checkTarget, checkRole, hexColor, parseDuration, fmt, ts, nice, trunc } = require('../lib/util');

const MR = P.ManageRoles;
const PERMS = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'AttachFiles', 'EmbedLinks', 'UseExternalEmojis', 'MentionEveryone', 'ManageMessages',
  'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageNicknames', 'ManageRoles', 'ManageChannels', 'ManageThreads', 'CreateInstantInvite', 'ChangeNickname', 'Connect', 'Speak', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'ViewAuditLog'];
const PERM = () => S('permission', 'Permission', true, { choices: PERMS.map((p) => ({ name: nice(p), value: p })) });
const roleOpt = (n, req = true) => R(n, 'Role', req);
const ping = (r) => `<@&${r.id}>`;

async function give(c, add) {
  const m = await c.m('user'); checkTarget(c, m, add ? 'give a role to' : 'take a role from');
  const roles = ['role1', 'role2', 'role3'].map((n) => c.r(n)).filter(Boolean);
  for (const r of roles) checkRole(c, r);
  if (add) await m.roles.add(roles, c.audit()); else await m.roles.remove(roles, c.audit());
  return res(add ? 'Roles added' : 'Roles removed', `${roles.map(ping).join(' ')} ${add ? 'added to' : 'removed from'} **${m.user.username}**.`, { icon: add ? '🏷️' : '➖', user: m.user, undo: { label: 'Roles restored', fn: () => (add ? m.roles.remove(roles) : m.roles.add(roles)) } });
}
async function flag(c, key, val, label) {
  const r = c.r('role'); checkRole(c, r); const old = r[key];
  await r.edit({ [key]: val, reason: c.audit() });
  return res(label, `${ping(r)} updated.`, { icon: '🎛️', undo: { label: 'Role restored', fn: () => r.edit({ [key]: old }) } });
}

module.exports = {
  name: 'role', description: 'Role tools: give, remove, create, permissions',
  commands: [
    C('add', 'Give a role to a member', [U(), roleOpt('role'), RS()], MR, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'change roles of'); const r = c.r('role'); checkRole(c, r);
      if (m.roles.cache.has(r.id)) throw new UserError(`**${m.user.username}** already has ${r.name}`, 'Nothing to add.');
      await m.roles.add(r, c.audit());
      return res('Role added', `${ping(r)} given to **${m.user.username}**.`, { icon: '🏷️', user: m.user, case: c.case('role-add', m.id), undo: { label: 'Role removed', fn: () => m.roles.remove(r) } });
    }),
    C('remove', 'Take a role from a member', [U(), roleOpt('role'), RS()], MR, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'change roles of'); const r = c.r('role'); checkRole(c, r);
      if (!m.roles.cache.has(r.id)) throw new UserError(`**${m.user.username}** does not have ${r.name}`, 'Nothing to remove.');
      await m.roles.remove(r, c.audit());
      return res('Role removed', `${ping(r)} taken from **${m.user.username}**.`, { icon: '➖', user: m.user, case: c.case('role-remove', m.id), undo: { label: 'Role restored', fn: () => m.roles.add(r) } });
    }),
    C('temp-add', 'Give a role for a limited time', [U(), roleOpt('role'), DUR()], MR, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'change roles of'); const r = c.r('role'); checkRole(c, r); const ms = parseDuration(c.s('duration'));
      await m.roles.add(r, c.audit()); db.schedule({ type: 'unrole', at: Date.now() + ms, guildId: c.g.id, userId: m.id, roleId: r.id });
      return res('Temporary role added', `${ping(r)} on **${m.user.username}** until ${ts(Date.now() + ms)}.`, { icon: '⏳', user: m.user, fields: [['Duration', fmt(ms), true]] });
    }),
    C('create', 'Create a new role', [S('name', 'Role name', true, { max: 100 }), S('color', 'Hex color like #39d98a', false, { max: 10 }), B('hoist', 'Show separately in the member list'), B('mentionable', 'Anyone can mention it')], MR, async (c) => {
      const r = await c.g.roles.create({ name: c.s('name'), color: c.s('color') ? hexColor(c.s('color')) : undefined, hoist: !!c.b('hoist'), mentionable: !!c.b('mentionable'), reason: c.audit() });
      return res('Role created', `Created ${ping(r)}.`, { icon: '🎨', undo: { label: 'Role deleted', fn: () => r.delete() } });
    }),
    C('delete', 'Delete a role', [roleOpt('role'), RS()], MR, async (c) => {
      const r = c.r('role'); checkRole(c, r); const name = r.name; await r.delete(c.audit());
      return res('Role deleted', `**${name}** was deleted.`, { icon: '🗑️', color: 0xff4d6d });
    }, { danger: 'This will **delete the role** from everyone who has it.' }),
    C('rename', 'Rename a role', [roleOpt('role'), S('name', 'New name', true, { max: 100 })], MR, async (c) => {
      const r = c.r('role'); checkRole(c, r); const old = r.name; await r.setName(c.s('name'), c.audit());
      return res('Role renamed', `**${old}** → **${c.s('name')}**`, { icon: '✏️', undo: { label: 'Name restored', fn: () => r.setName(old) } });
    }),
    C('color', 'Change a role color', [roleOpt('role'), S('color', 'Hex color like #39d98a', true, { max: 10 })], MR, async (c) => {
      const r = c.r('role'); checkRole(c, r); const old = r.color; await r.setColor(hexColor(c.s('color')), c.audit());
      return res('Role color changed', `${ping(r)} has a new color.`, { icon: '🎨', undo: { label: 'Color restored', fn: () => r.setColor(old) } });
    }),
    C('hoist-on', 'Show a role separately in the member list', [roleOpt('role')], MR, (c) => flag(c, 'hoist', true, 'Role hoisted')),
    C('hoist-off', 'Stop showing a role separately', [roleOpt('role')], MR, (c) => flag(c, 'hoist', false, 'Role unhoisted')),
    C('mentionable-on', 'Let everyone mention a role', [roleOpt('role')], MR, (c) => flag(c, 'mentionable', true, 'Role mentionable')),
    C('mentionable-off', 'Stop everyone from mentioning a role', [roleOpt('role')], MR, (c) => flag(c, 'mentionable', false, 'Role not mentionable')),
    C('position', 'Move a role to a position number', [roleOpt('role'), I('position', 'New position (higher = more power)', true, 1, 250)], MR, async (c) => {
      const r = c.r('role'); checkRole(c, r); const old = r.position; await r.setPosition(c.n('position'), { reason: c.audit() });
      return res('Role moved', `${ping(r)} is now at position **${c.n('position')}**.`, { icon: '↕️', undo: { label: 'Position restored', fn: () => r.setPosition(old) } });
    }),
    C('clone', 'Copy a role with the same permissions', [roleOpt('role')], MR, async (c) => {
      const r = c.r('role'); const n = await c.g.roles.create({ name: `${r.name} copy`.slice(0, 100), color: r.color, permissions: r.permissions, hoist: r.hoist, mentionable: r.mentionable, reason: c.audit() });
      return res('Role cloned', `Created ${ping(n)}.`, { icon: '🧬', undo: { label: 'Clone deleted', fn: () => n.delete() } });
    }),
    C('perms-view', 'See which permissions a role has', [roleOpt('role')], MR, async (c) => {
      const r = c.r('role'); const list = r.permissions.toArray().map(nice);
      return res(`Permissions of ${r.name}`, list.length ? list.map((x) => `• ${x}`).join('\n') : '_No permissions._', { icon: '🔑', color: r.color || 0x5b8cff });
    }),
    C('perm-grant', 'Add one permission to a role', [roleOpt('role'), PERM()], MR, async (c) => {
      const r = c.r('role'); checkRole(c, r); const old = r.permissions; await r.setPermissions(old.add(P[c.s('permission')]), c.audit());
      return res('Permission granted', `${ping(r)} now has **${nice(c.s('permission'))}**.`, { icon: '🔑', undo: { label: 'Permissions restored', fn: () => r.setPermissions(old) } });
    }),
    C('perm-revoke', 'Remove one permission from a role', [roleOpt('role'), PERM()], MR, async (c) => {
      const r = c.r('role'); checkRole(c, r); const old = r.permissions; await r.setPermissions(old.remove(P[c.s('permission')]), c.audit());
      return res('Permission revoked', `${ping(r)} no longer has **${nice(c.s('permission'))}**.`, { icon: '🔐', undo: { label: 'Permissions restored', fn: () => r.setPermissions(old) } });
    }),
    C('perm-reset', 'Remove all permissions from a role', [roleOpt('role')], MR, async (c) => {
      const r = c.r('role'); checkRole(c, r); const old = r.permissions; await r.setPermissions(0n, c.audit());
      return res('Permissions cleared', `${ping(r)} has no permissions now.`, { icon: '🧼', undo: { label: 'Permissions restored', fn: () => r.setPermissions(old) } });
    }, { danger: 'This will remove **all permissions** from the role.' }),
    C('swap', 'Replace one role with another on a member', [U(), R('from', 'Role to remove'), R('to', 'Role to give')], MR, async (c) => {
      const m = await c.m('user'); checkTarget(c, m, 'change roles of'); const a = c.r('from'), b = c.r('to'); checkRole(c, a); checkRole(c, b);
      await m.roles.remove(a, c.audit()); await m.roles.add(b, c.audit());
      return res('Roles swapped', `${ping(a)} → ${ping(b)} for **${m.user.username}**.`, { icon: '🔁', user: m.user, undo: { label: 'Swap reverted', fn: async () => { await m.roles.remove(b); await m.roles.add(a); } } });
    }),
    C('add-multiple', 'Give up to 3 roles at once', [U(), R('role1', 'First role'), R('role2', 'Second role', false), R('role3', 'Third role', false)], MR, (c) => give(c, true)),
    C('remove-multiple', 'Take up to 3 roles at once', [U(), R('role1', 'First role'), R('role2', 'Second role', false), R('role3', 'Third role', false)], MR, (c) => give(c, false)),
    C('muted-setup', 'Create a Muted role and block it in every channel', [], P.ManageRoles, async (c) => {
      let role = c.g.roles.cache.find((r) => r.name === 'Muted');
      if (!role) role = await c.g.roles.create({ name: 'Muted', color: 0x808080, permissions: [], reason: c.audit() });
      await c.g.channels.fetch(); let ok = 0, fail = 0;
      for (const ch of c.g.channels.cache.values()) {
        if (!ch.permissionOverwrites || ch.isThread?.()) continue;
        try { await ch.permissionOverwrites.edit(role, { SendMessages: false, AddReactions: false, Speak: false, SendMessagesInThreads: false, CreatePublicThreads: false }, { reason: c.audit() }); ok++; } catch { fail++; }
      }
      return res('Muted role ready', `${ping(role)} is blocked in **${ok}** channel(s).`, { icon: '🔇', fields: fail ? [['Skipped', `${fail} channel(s) I could not edit`]] : [] });
    }, { danger: 'This will create a **Muted** role and edit permissions in every channel.' }),
    C('has-role', 'Check if a member has a role', [U(), roleOpt('role')], MR, async (c) => {
      const m = await c.m('user'); if (!m) throw new UserError('That user is not in this server'); const has = m.roles.cache.has(c.r('role').id);
      return res(has ? 'Yes, they have it' : 'No, they do not', `**${m.user.username}** ${has ? 'has' : 'does not have'} ${ping(c.r('role'))}.`, { icon: has ? '✅' : '❌', user: m.user, color: has ? 0x39d98a : 0xff4d6d });
    }),
    C('list', 'List all server roles', [], MR, async (c) => {
      const roles = [...c.g.roles.cache.values()].sort((a, b) => b.position - a.position).filter((r) => r.id !== c.g.id);
      return res(`Roles (${roles.length})`, trunc(roles.map((r) => `${ping(r)} • ${r.members.size}`).join('\n') || '_None_', 3800), { icon: '🏷️', color: 0x5b8cff });
    }),
    C('member-roles', 'List the roles of a member', [U()], MR, async (c) => {
      const m = await c.m('user'); if (!m) throw new UserError('That user is not in this server'); const r = [...m.roles.cache.values()].filter((x) => x.id !== c.g.id).sort((a, b) => b.position - a.position);
      return res(`Roles of ${m.user.username}`, r.length ? r.map(ping).join(' ') : '_No roles._', { icon: '🏷️', user: m.user, color: 0x5b8cff });
    }),
    C('manageable-check', 'Check if I and you can manage a role', [roleOpt('role')], MR, async (c) => {
      const r = c.r('role'); const botOk = !r.managed && r.position < c.me.roles.highest.position; const youOk = c.i.user.id === c.g.ownerId || r.position < c.i.member.roles.highest.position;
      return res(`Can manage ${r.name}?`, `${botOk ? '✅' : '❌'} **I** can manage it\n${youOk ? '✅' : '❌'} **You** can manage it${r.managed ? '\n⚠️ It is an integration role.' : ''}`, { icon: '🔎', color: 0x5b8cff });
    }),
  ],
};
