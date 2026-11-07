const { EmbedBuilder } = require('discord.js');
const { C, U, S } = require('../lib/cmd');
const db = require('../lib/db');
const { UserError, hexColor } = require('../lib/util');

const GOLD = 0xffd166;
const O = { owner: true };
const P = { premium: true };
const card = (title, desc, user, icon = '💎') => ({
  title, desc, icon, color: GOLD, user,
});

module.exports = {
  name: 'license',
  description: 'Owner-managed server Premium licenses and branding',
  commands: [
    C('grant', 'Owner: grant Premium access to a member in this server', [U(true, 'user', 'Member to grant Premium')], null, async (c) => {
      const user = c.u('user'); const d = db.g(c.g.id); d.premiumUsers ||= [];
      if (d.premiumUsers.includes(user.id)) throw new UserError(`**${user.username}** already has Premium in this server.`);
      d.premiumUsers.push(user.id); db.save();
      return { ...card('Premium granted', `**${user.username}** can now use server Premium features in **${c.g.name}**. Use `/license revoke` to remove access.`, user, '✅'), fields: [['Server', c.g.name], ['Premium members', String(d.premiumUsers.length), true]] };
    }, O),
    C('revoke', 'Owner: revoke Premium access from a member in this server', [U(true, 'user', 'Member to revoke Premium from')], null, async (c) => {
      const user = c.u('user'); const d = db.g(c.g.id); d.premiumUsers ||= [];
      const before = d.premiumUsers.length; d.premiumUsers = d.premiumUsers.filter((id) => id !== user.id);
      if (before === d.premiumUsers.length) throw new UserError(`**${user.username}** does not have Premium in this server.`);
      db.save();
      return card('Premium revoked', `**${user.username}** no longer has server Premium access in **${c.g.name}**.`, user, '🔒');
    }, O),
    C('access', 'Check Premium access in this server', [U(false, 'user', 'Member to check (default: you)')], null, async (c) => {
      const user = c.u('user') || c.i.user; const active = db.g(c.g.id).premiumUsers?.includes(user.id) || false;
      return card('Premium access', `**${user.username}**: ${active ? '✅ Premium active' : '❌ No Premium'} in **${c.g.name}**.`, user, active ? '💎' : '🔒');
    }),
    C('profile', 'Customize Uranium branding for this server', [
      S('name', 'Bot nickname / brand name', false, { max: 80 }),
      S('bio', 'Server-specific profile bio', false, { max: 300 }),
      S('color', 'Embed color, hex e.g. #8b5cf6', false, { max: 7 }),
      S('avatar', 'Profile-card avatar image URL', false, { max: 500 }),
      S('banner', 'Profile-card banner image URL', false, { max: 500 }),
    ], null, async (c) => {
      const d = db.g(c.g.id); const brand = d.config.branding ||= {};
      for (const key of ['name', 'bio', 'color', 'avatar', 'banner']) {
        const value = c.s(key); if (value == null || value === '') continue;
        if (['avatar', 'banner'].includes(key) && !/^https:\/\//i.test(value)) throw new UserError(`The ${key} must be an HTTPS image URL.`);
        if (key === 'color') { try { brand.color = hexColor(value); } catch { throw new UserError('Color must be a 6-digit hex value, such as #8b5cf6.'); } }
        else brand[key] = value;
      }
      if (brand.name) {
        try { await c.me.setNickname(brand.name.slice(0, 32), 'Premium server branding'); }
        catch { /* nickname permission is optional; profile card still uses the brand name */ }
      }
      db.save();
      const e = new EmbedBuilder().setColor(brand.color || GOLD).setTitle(brand.name || c.g.name)
        .setDescription(brand.bio || 'Server-specific Uranium profile')
        .setFooter({ text: `Uranium • ${c.g.name}` }).setTimestamp();
      if (brand.avatar) e.setThumbnail(brand.avatar);
      if (brand.banner) e.setImage(brand.banner);
      await c.i.editReply({ embeds: [e] });
      return { handled: true };
    }, { ...P, custom: true }),
  ],
};
