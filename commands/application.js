const { C, S } = require('../lib/cmd');
const { UserError, res } = require('../lib/util');
const appEmojiTools = require('../lib/application-emojis');
const cv2 = require('../lib/cv2');

const own = (title, desc, x = {}) => res(title, desc, { icon: '😀', color: 0x5865f2, ...x });

async function listApplicationEmojis(c) {
  const app = c.i.client.application || await c.i.client.application.fetch();
  const emojis = [...(await app.emojis.fetch()).values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!emojis.length) return own('No application emojis yet', 'Use `!epadd <emoji> <name>` to add the first one.');
  const perPage = 15;
  const pages = Math.ceil(emojis.length / perPage);
  let page = 0;
  const render = (disabled = false) => {
    const slice = emojis.slice(page * perPage, (page + 1) * perPage);
    const lines = slice.map((emoji, index) => {
      const kind = emoji.animated ? 'GIF' : 'Static';
      return `**${page * perPage + index + 1}.** ${emoji}  ` + '`' + `:${emoji.name}:` + '`' + `  • ${kind}`;
    });
    return cv2.message([
      cv2.text(`# Uranium application emojis\n-# ${emojis.length} total • Page ${page + 1}/${pages}`),
      cv2.separator(),
      cv2.text(lines.join('\n')),
      cv2.separator(),
      cv2.row([
        cv2.button('appem:prev', 'Previous', 2, '⬅️'),
        cv2.button('appem:next', 'Next', 2, '➡️'),
        cv2.button('appem:close', 'Close', 4, '✖️')
      ].map((button, index) => disabled || (index === 0 && page === 0) || (index === 1 && page >= pages - 1)
        ? { ...button, disabled: true } : button))
    ], 0x5865f2);
  };
  const message = await c.i.editReply(render());
  const collector = message.createMessageComponentCollector({
    time: 120000,
    filter: (interaction) => interaction.customId.startsWith('appem:') && interaction.user.id === c.i.user.id
  });
  collector.on('collect', async (interaction) => {
    const action = interaction.customId.split(':')[1];
    if (action === 'close') {
      collector.stop('closed');
      return interaction.update(render(true));
    }
    if (action === 'prev') page = Math.max(0, page - 1);
    if (action === 'next') page = Math.min(pages - 1, page + 1);
    return interaction.update(render());
  });
  collector.on('end', () => c.i.editReply(render(true)).catch(() => {}));
  return { handled: true };
}

module.exports = {
  name: 'application',
  description: 'Uranium application management commands.',
  commands: [
    C('epadd', 'Owner only: upload a Unicode or Discord emoji to Uranium application emojis', [
      S('source', 'Unicode emoji, Discord emoji mention or HTTPS image URL', true, { max: 500 }),
      S('name', 'Application emoji name', true, { max: 32 })
    ], null, async (c) => {
      const source = c.s('source').trim();
      const customMention = /^<a?:([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/.exec(source);
      const sourceLink = appEmojiTools.sourceUrl(source);
      const image = await appEmojiTools.fetchEmojiImage(source);
      const name = appEmojiTools.normalizeEmojiName(c.s('name'), customMention?.[1] || appEmojiTools.deriveEmojiName(sourceLink));
      const app = c.i.client.application;
      const existing = await app.emojis.fetch();
      if (existing.size >= 2000) throw new UserError('Application emoji limit reached', 'Discord allows up to 2,000 emojis for an application. Delete an unused app emoji in the Developer Portal first.');
      const duplicate = existing.find((emoji) => emoji.name.toLowerCase() === name);
      if (duplicate) throw new UserError('That application emoji name already exists', `Use another name or manage the existing emoji ` + '`' + `:${duplicate.name}:` + '`' + ` in the Developer Portal.`);
      const emoji = await app.emojis.create({ attachment: image.bytes, name });
      return own('Application emoji uploaded', `${emoji} ` + '`' + `:${emoji.name}:` + '`' + ` is now stored in **Uranium → Developer Portal → Emojis**.`, {
        icon: '😀',
        fields: [['Name', `:${emoji.name}:`, true], ['Type', image.animated || emoji.animated ? 'Animated' : 'Static', true], ['File size', `${image.bytes.length} / 262,144 bytes`, true]]
      });
    }, { owner: true, ephemeral: true }),
    C('list-emojis', 'Owner only: view every Uranium application emoji', [], null, listApplicationEmojis, { owner: true, ephemeral: true, custom: true })
  ]
};
