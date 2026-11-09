const { PermissionFlagsBits: P } = require('discord.js');

// Self-assignable and cloned roles must never grant server/moderation control.
const BLOCKED = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks',
  'ManageMessages', 'ManageThreads', 'ManageEvents', 'ManageGuildExpressions',
  'ManageNicknames', 'KickMembers', 'BanMembers', 'ModerateMembers', 'ViewAuditLog',
  'MentionEveryone', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'ManageEmojisAndStickers',
];

function blockedSelfAssignablePermissions(role) {
  if (!role?.permissions?.has) return BLOCKED;
  return BLOCKED.filter((name) => P[name] != null && role.permissions.has(P[name]));
}

function isSafeSelfAssignableRole(role) {
  return !!role && !role.managed && role.id !== role.guild?.id && blockedSelfAssignablePermissions(role).length === 0;
}

module.exports = { blockedSelfAssignablePermissions, isSafeSelfAssignableRole };
