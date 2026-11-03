const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');

class UserError extends Error {
  constructor(message, hint) { super(message); this.hint = hint; this.user = true; }
}
const res = (title, desc, x = {}) => ({ title, desc, ...x });
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = (ms, f = 'R') => `<t:${Math.floor(ms / 1000)}:${f}>`;
const nice = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2');
const permName = (bit) => nice(new PermissionsBitField(bit).toArray()[0] || 'Permission');
const trunc = (s, n = 1000) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function parseDuration(input) {
  const hint = 'Use units like 30s, 10m, 2h, 1d, 1w (you can combine: 1h30m)';
  const s = String(input || '').replace(/\s+/g, '').toLowerCase();
  if (!s) throw new UserError('Duration is missing', hint);
  const re = /(\d+)([smhdw])/g;
  if (s.replace(re, '').length) throw new UserError(`"${input}" is not a valid duration`, hint);
  const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  let total = 0, m;
  while ((m = re.exec(s))) total += Number(m[1]) * mult[m[2]];
  if (total <= 0) throw new UserError(`"${input}" is not a valid duration`, hint);
  return total;
}
function fmt(ms) {
  const parts = [];
  for (const [n, v] of [['d', 864e5], ['h', 36e5], ['m', 6e4], ['s', 1e3]]) {
    const q = Math.floor(ms / v); ms -= q * v; if (q) parts.push(q + n);
  }
  return parts.join(' ') || '0s';
}
function checkTarget(c, m, action) {
  if (!m) throw new UserError('That user is not in this server', 'Pick a member who is currently in the server.');
  if (m.id === c.i.user.id) throw new UserError(`You cannot ${action} yourself`);
  if (m.id === c.me.id) throw new UserError(`I cannot ${action} myself`);
  if (m.id === c.g.ownerId) throw new UserError(`You cannot ${action} the server owner`);
  if (c.i.user.id !== c.g.ownerId && m.roles.highest.position >= c.i.member.roles.highest.position)
    throw new UserError(`Your highest role is not above **${m.user.username}**'s highest role`, 'You can only moderate members below your top role.');
  if (m.roles.highest.position >= c.me.roles.highest.position)
    throw new UserError(`My role is not above **${m.user.username}**'s highest role`, 'Drag the Uranium role higher in Server Settings → Roles.');
}
function checkRole(c, role) {
  if (role.id === c.g.id) throw new UserError('You cannot manage @everyone like this');
  if (role.managed) throw new UserError('That role is managed by an integration', 'Bot and integration roles cannot be changed manually.');
  if (role.position >= c.me.roles.highest.position)
    throw new UserError(`I cannot manage **${role.name}** (it is above or equal to my top role)`, 'Drag the Uranium role above it in Server Settings → Roles.');
  if (c.i.user.id !== c.g.ownerId && role.position >= c.i.member.roles.highest.position)
    throw new UserError(`Your top role is not above **${role.name}**`, 'Ask someone with a higher role.');
}
function hexColor(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
  if (!m) throw new UserError(`"${s}" is not a valid color`, 'Use a hex color like #39d98a');
  return parseInt(m[1], 16);
}
function snowflake(s) {
  if (!/^\d{17,20}$/.test(String(s || '').trim())) throw new UserError(`"${s}" is not a valid ID`, 'IDs are 17-20 digit numbers. Enable Developer Mode in Discord → right click → Copy ID.');
  return String(s).trim();
}
const MOD_PERMS = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.AddReactions, P.KickMembers, P.BanMembers,
  P.ModerateMembers, P.ManageMessages, P.ManageRoles, P.ManageChannels, P.ManageNicknames, P.ManageGuild, P.ViewAuditLog,
  P.MuteMembers, P.DeafenMembers, P.MoveMembers];
function inviteUrl(clientId) {
  const bits = new PermissionsBitField(MOD_PERMS).bitfield;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${bits}`;
}
module.exports = { UserError, res, clean, sleep, ts, nice, permName, trunc, parseDuration, fmt, checkTarget, checkRole, hexColor, snowflake, MOD_PERMS, inviteUrl };
