// No-prefix access: the owner always has it (can switch it on/off); the owner can also give it to other people.
const { U, S } = require('./cmd');
const db = require('./db');
const { UserError, res } = require('./util');

const G = () => db.g('__global');
const list = () => (G().config.npUsers ||= []);
const has = (id) => list().includes(id);
const opts = [S('mode', 'add, remove, list, on, off or status', false, { choices: ['add', 'remove', 'list', 'on', 'off', 'status'] }), U(false, 'user', 'User to add or remove')];
const out = (title, desc, x = {}) => res(title, desc, { icon: '⚡', color: 0xffd166, ...x });

async function run(c) {
  const mode = c.s('mode') || 'status'; const u = c.u('user'); const g = G();
  if (mode === 'add' || mode === 'remove') {
    if (!u) throw new UserError('Mention a user', `Example: ${c.prefix}np ${mode} @user`);
    if (u.bot) throw new UserError('Bots cannot get no-prefix access');
    if (mode === 'add') {
      if (has(u.id)) throw new UserError(`**${u.username}** already has no-prefix access`, `Remove with ${c.prefix}np remove @user`);
      list().push(u.id); db.save();
      return out('No-prefix added', `**${u.username}** can now use normal commands without any prefix.\nServer Premium commands need a separate Premium grant; global owner controls stay owner-only.`, { user: u, undo: { label: 'Access removed', fn: async () => { g.config.npUsers = list().filter((x) => x !== u.id); db.save(); } } });
    }
    if (!has(u.id)) throw new UserError(`**${u.username}** does not have no-prefix access`, `See the list with ${c.prefix}np list`);
    g.config.npUsers = list().filter((x) => x !== u.id); db.save();
    return out('No-prefix removed', `**${u.username}** must use the prefix again.`, { icon: '💤', user: u, undo: { label: 'Access restored', fn: async () => { list().push(u.id); db.save(); } } });
  }
  if (mode === 'list') return out('No-prefix users', list().length ? list().map((id) => `• <@${id}>`).join('\n') : '_Nobody except you._', { fields: [['Your own mode', g.config.np === false ? 'off' : 'on', true], ['Users', String(list().length), true]] });
  if (mode === 'on' || mode === 'off') { g.config.np = mode === 'on'; db.save(); }
  const on = g.config.np !== false;
  return out('No-prefix mode', `Your no-prefix is **${on ? 'ON' : 'OFF'}**.\nOthers with access: **${list().length}**.\nUse \`np add @user\`, \`np remove @user\`, \`np list\`, \`np on\`, \`np off\`.`, { icon: on ? '⚡' : '💤' });
}
module.exports = { opts, run, has };
