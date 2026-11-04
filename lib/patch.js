// Runtime tweaks to a few info commands so no command counts are ever shown
const { res, ts, inviteUrl } = require('./util');
module.exports = (byName) => {
  const info = byName.get('info').map;
  info.get('help').run = require('./help');
  info.get('about').run = async (c) => res('About Uranium', 'A modern, button-driven moderation bot with a web dashboard.', { icon: '☢️', links: [['Invite Uranium', inviteUrl(c.i.client.application.id)], ...(process.env.PUBLIC_BASE_URL ? [['Website', process.env.PUBLIC_BASE_URL]] : [])] });
  info.get('botinfo').run = async (c) => res('Bot info', null, { icon: '🤖', color: 0x5b8cff, fields: [['Servers', String(c.i.client.guilds.cache.size), true], ['Node.js', process.version, true], ['Memory', `${Math.round(process.memoryUsage().rss / 1048576)} MB`, true], ['Online since', ts(Date.now() - process.uptime() * 1000), true]] });
  info.get('commands-list').run = async (c) => res('Command groups', c.cats.filter((x) => x.name !== 'premium' || c.isOwner).map((x) => `\`/${x.name}\` — ${x.description.split(':')[1]?.trim() || x.description}`).join('\n') + `\n\nType \`${c.prefix}help\` for the full menu.`, { icon: '📚', color: 0x5b8cff });
};
