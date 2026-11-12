const { EmbedBuilder, Routes } = require('discord.js');
const cv2 = require('../lib/cv2');
const icons = require('../lib/emojis');
const { C, U, S } = require('../lib/cmd');
const db = require('../lib/db');
const { UserError, hexColor } = require('../lib/util');

const GOLD = 0xffd166;
const O = { owner: true };
const P = { premium: true };
const card = (title, desc, user, icon = '💎') => ({
  title, desc, icon, color: GOLD, user,
});


async function imageData(url, field) {
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { throw new UserError(`The ${field} URL is invalid.`); }
  if (parsed.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname) || parsed.port || parsed.username || parsed.password) {
    throw new UserError(`Use a direct HTTPS image URL from Discord's CDN for the ${field}.`, 'Upload the image to Discord first, then copy its media link.');
  }
  let response;
  try { response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { throw new UserError(`Could not download the ${field} image. Check the Discord CDN link and try again.`); }
  if (!response.ok) throw new UserError(`Discord could not load the ${field} image (HTTP ${response.status}).`);
  const type = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) throw new UserError(`The ${field} link must point to a PNG, JPG, GIF, or WebP image.`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > 8 * 1024 * 1024) throw new UserError(`The ${field} image must be 8 MB or smaller.`);
  const reader = response.body?.getReader();
  if (!reader) throw new UserError(`Could not read the ${field} image.`);
  const chunks = []; let total = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    total += part.value.byteLength;
    if (total > 8 * 1024 * 1024) { await reader.cancel().catch(() => {}); throw new UserError(`The ${field} image must be 8 MB or smaller.`); }
    chunks.push(Buffer.from(part.value));
  }
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new UserError(`The ${field} image is empty.`);
  return `data:${type};base64,${bytes.toString('base64')}`;
}

module.exports = {
  name: 'license',
  description: 'Owner-managed server Premium licenses and branding',
  commands: [
    C('grant', 'Owner: grant Premium access to a member in this server', [U(true, 'user', 'Member to grant Premium')], null, async (c) => {
      const user = c.u('user'); const d = db.g(c.g.id); d.premiumUsers ||= [];
      if (d.premiumUsers.includes(user.id)) throw new UserError(`**${user.username}** already has Premium in this server.`);
      d.premiumUsers.push(user.id); db.save();
      return { ...card('Premium granted', `**${user.username}** can now use server Premium features in **${c.g.name}**. Use the /license revoke command to remove access.`, user, '✅'), fields: [['Server', c.g.name], ['Premium members', String(d.premiumUsers.length), true]] };
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
      S('name', 'Bot nickname / display name', false, { max: 32 }),
      S('bio', 'Server-specific profile bio (max 190 characters)', false, { max: 190 }),
      S('color', 'Embed color, hex e.g. #8b5cf6', false, { max: 7 }),
      S('avatar', 'Per-server bot avatar image URL', false, { max: 500 }),
      S('banner', 'Per-server bot banner image URL', false, { max: 500 }),
    ], null, async (c) => {
      const d = db.g(c.g.id); const brand = d.config.branding ||= {};
      const body = {};
      for (const key of ['name', 'bio', 'color', 'avatar', 'banner']) {
        const value = c.s(key); if (value == null || value === '') continue;
        if (key === 'color') { try { brand.color = hexColor(value); } catch { throw new UserError('Color must be a 6-digit hex value, such as #8b5cf6.'); } }
        else brand[key] = value;
      }
      if (c.s('name') != null) body.nick = c.s('name');
      if (c.s('bio') != null) body.bio = c.s('bio');
      if (c.s('avatar') != null) body.avatar = await imageData(c.s('avatar'), 'avatar');
      if (c.s('banner') != null) body.banner = await imageData(c.s('banner'), 'banner');
      if (Object.keys(body).length) {
        try { await c.i.client.rest.patch(Routes.guildMember(c.g.id, '@me'), { body }); }
        catch (error) {
          const message = String(error?.rawError?.message || error?.message || '');
          throw new UserError('Discord could not update this server profile.', message.slice(0, 180) || 'Check the image, bio length, and bot permissions.');
        }
      }
      db.save();
      const e = new EmbedBuilder().setColor(brand.color || GOLD).setTitle(brand.name || c.g.name)
        .setDescription(brand.bio || 'Server-specific Uranium profile')
        .setFooter({ text: `Uranium • ${c.g.name}` }).setTimestamp();
      if (brand.avatar) e.setThumbnail(brand.avatar);
      if (brand.banner) e.setImage(brand.banner);
      const profileBody = [cv2.text(`# ${icons.E('atom')} ${brand.name || c.g.name}\n${brand.bio || 'Server-specific Uranium profile'}`)];
      const media = [brand.avatar, brand.banner].filter((url) => typeof url === 'string' && /^https?:\\/\\//i.test(url));
      if (media.length) profileBody.push({ type: 12, items: media.map((url) => ({ media: { url } })) });
      profileBody.push(cv2.separator(), cv2.text(`-# Uranium • ${c.g.name}`));
      await c.i.editReply(cv2.message(profileBody, brand.color || GOLD));
      return { handled: true };
    }, { ...P, custom: true }),
  ],
};
