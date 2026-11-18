const { C, S } = require('../lib/cmd');
const { UserError, res } = require('../lib/util');
const appEmojiTools = require('../lib/application-emojis');

const own = (title, desc, x = {}) => res(title, desc, { icon: '😀', color: 0x5865f2, ...x });

module.exports = {
  name: 'application',
  description: 'Uranium application management commands.',
  commands: [
    C('epadd', 'Owner only: upload a Unicode or Discord emoji to Uranium application emojis', [
      S('source', 'Unicode emoji, Discord emoji mention or HTTPS image URL', true, { max: 500 }),
      S('name', 'Application emoji name', true, { max: 32 })
    ], null, async (c) => {
      const source = c.s('source').trim();
      const customMention = /^<a?:([a-zA-Z0-9_]{2,32}):(\\d{17,20})>$/.exec(source);
      const sourceLink = appEmojiTools.sourceUrl(source);
      const image = await appEmojiTools.fetchEmojiImage(source);
      const name = appEmojiTools.normalizeEmojiName(c.s('name'), customMention?.[1] || appEmojiTools.deriveEmojiName(sourceLink));
      const app = c.i.client.application;
      const existing = await app.emojis.fetch();
      if (existing.size >= 2000) throw new UserError('Application emoji limit reached', 'Discord allows up to 2,000 emojis for an application. Delete an unused app emoji in the Developer Portal first.');
      const duplicate = existing.find((emoji) => emoji.name.toLowerCase() === name);
      if (duplicate) throw new UserError('That application emoji name already exists', `Use another name or manage the existing emoji \`:${duplicate.name}:\` in the Developer Portal.`);
      const emoji = await app.emojis.create({ attachment: image.bytes, name });
      return own('Application emoji uploaded', `${emoji} \`:${emoji.name}:\` is now stored in **Uranium → Developer Portal → Emojis**.`, {
        icon: '😀',
        fields: [['Name', `:${emoji.name}:`, true], ['Type', image.animated || emoji.animated ? 'Animated' : 'Static', true], ['File size', `${image.bytes.length} / 262,144 bytes`, true]]
      });
    }, { owner: true, ephemeral: true })
  ]
};
