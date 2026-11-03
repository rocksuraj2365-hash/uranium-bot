const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const { sleep, UserError, trunc } = require('./util');

const COLORS = { ok: 0x39d98a, err: 0xff4d6d, warn: 0xffb84d, info: 0x5b8cff, run: 0x8b5cf6 };
const FRAMES = ['◐', '◓', '◑', '◒'];
const BARS = ['▱▱▱▱▱▱▱▱', '▰▰▱▱▱▱▱▱', '▰▰▰▰▱▱▱▱', '▰▰▰▰▰▰▱▱', '▰▰▰▰▰▰▰▱'];
const EPH = MessageFlags.Ephemeral;
const FOOT = 'Uranium Moderation';
const pending = new Map();

const errorEmbed = (msg, hint, title = 'Command failed') => {
  const e = new EmbedBuilder().setColor(COLORS.err).setTitle(`❌ ${title}`).setDescription(trunc(msg, 3500)).setFooter({ text: FOOT });
  if (hint) e.addFields({ name: '💡 How to fix', value: trunc(hint, 1000) });
  return e;
};
const okEmbed = (title, desc) => new EmbedBuilder().setColor(COLORS.ok).setTitle(`✅ ${title}`).setDescription(desc || null).setFooter({ text: FOOT });
const infoEmbed = (title, desc, color = COLORS.info) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc || null).setFooter({ text: FOOT }).setTimestamp();

function resultEmbed(r) {
  const e = new EmbedBuilder().setColor(r.color ?? COLORS.ok).setTitle(`${r.icon || '✅'} ${r.title}`).setTimestamp();
  if (r.desc) e.setDescription(trunc(r.desc, 3900));
  for (const [n, v, inl] of r.fields || []) e.addFields({ name: n, value: trunc(v || '—', 1000), inline: !!inl });
  if (r.user) e.setThumbnail(r.user.displayAvatarURL({ size: 256 }));
  e.setFooter({ text: r.case ? `Case #${r.case.id} • ${FOOT}` : FOOT });
  return e;
}

// Running animation: edits the "thinking" reply with moving frames while the command works
async function animate(i, label, work) {
  let done = false, result, error;
  const p = work().then((r) => { result = r; }, (e) => { error = e; }).finally(() => { done = true; });
  let n = 0;
  for (;;) {
    const e = new EmbedBuilder().setColor(COLORS.run).setTitle(`${FRAMES[n % 4]} Running ${label}`)
      .setDescription(`\`${BARS[Math.min(n, BARS.length - 1)]}\`  Working on it…`).setFooter({ text: FOOT });
    await i.editReply({ embeds: [e], components: [] }).catch(() => {});
    n++;
    await Promise.race([p, sleep(850)]);
    if (done && n >= 2) break;
  }
  await p;
  if (error) throw error;
  return result;
}

async function confirm(i, text) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cf:yes').setLabel('Confirm').setEmoji('✅').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cf:no').setLabel('Cancel').setEmoji('✖️').setStyle(ButtonStyle.Secondary));
  const e = infoEmbed('⚠️ Please confirm', `${text}\n\nThis expires in **30 seconds**.`, COLORS.warn);
  const msg = await i.editReply({ embeds: [e], components: [row] });
  try {
    const b = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30000, filter: (x) => x.user.id === i.user.id && x.customId.startsWith('cf:') });
    await b.deferUpdate();
    if (b.customId === 'cf:no') { await i.editReply({ embeds: [infoEmbed('🚫 Cancelled', 'Nothing was changed.', COLORS.err)], components: [] }); return false; }
    return true;
  } catch {
    await i.editReply({ embeds: [infoEmbed('⌛ Timed out', 'No answer, so nothing was changed.', COLORS.err)], components: [] });
    return false;
  }
}

async function sendResult(i, r) {
  const e = r.embed || resultEmbed(r);
  const row = new ActionRowBuilder();
  if (r.undo) {
    const key = crypto.randomBytes(6).toString('hex');
    pending.set(key, { fn: r.undo.fn, userId: i.user.id, label: r.undo.label || 'Action undone' });
    setTimeout(() => pending.delete(key), 10 * 60 * 1000).unref();
    row.addComponents(new ButtonBuilder().setCustomId(`undo:${key}`).setLabel('Undo').setEmoji('↩️').setStyle(ButtonStyle.Secondary));
  }
  if (r.case) row.addComponents(new ButtonBuilder().setCustomId(`case:${r.case.id}`).setLabel(`Case #${r.case.id}`).setEmoji('📋').setStyle(ButtonStyle.Primary));
  for (const [label, url] of (r.links || []).slice(0, 2)) row.addComponents(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
  row.addComponents(new ButtonBuilder().setCustomId(`dismiss:${i.user.id}`).setLabel('Dismiss').setEmoji('🗑️').setStyle(ButtonStyle.Secondary));
  await i.editReply({ embeds: [e], components: [row] });
}

const API = {
  50013: ['I do not have permission to do that.', 'Give the Uranium role the needed permission and move it above the target in Server Settings → Roles. Run /info setup-check.'],
  50001: ['I cannot access that channel or resource.', 'Give me View Channel (and the needed permission) there.'],
  50007: ['I cannot send messages to that user.', 'They have DMs closed.'],
  10007: ['That member is not in this server.', 'Pick a member who is currently in the server.'],
  10013: ['Unknown user.', 'Check the user and try again.'],
  10008: ['Message not found.', 'Check the message ID and run the command in the same channel as that message.'],
  10011: ['Role not found.', 'Pick the role from the list.'],
  10003: ['Channel not found.', 'Pick the channel from the list.'],
  10026: ['That user is not banned.', 'Use /member ban-list to see banned users.'],
  10014: ['Unknown emoji.', 'Use a normal emoji like 👍 or a server emoji.'],
  50034: ['Messages older than 14 days cannot be bulk deleted.', 'Discord does not allow that.'],
  40032: ['That user is not connected to a voice channel.', 'They must be in a voice channel first.'],
  50035: ['Discord rejected one of the values you typed.', 'Check lengths, numbers and formats.'],
  30005: ['The server reached the maximum number of roles.', 'Delete some roles first.'],
  30013: ['The server reached the maximum number of channels.', 'Delete some channels first.'],
  30032: ['The server reached the limit for this AutoMod rule type.', 'Edit or delete the existing rule instead (see /automod rules).'],
};
async function sendError(i, e, label) {
  let embed;
  if (e instanceof UserError) embed = errorEmbed(e.message, e.hint);
  else if (e && API[e.code]) embed = errorEmbed(API[e.code][0], API[e.code][1] + (e.code === 50035 ? `\n\`${trunc(e.message, 300)}\`` : ''));
  else { console.error(`[${label}]`, e); embed = errorEmbed(`Something unexpected went wrong while running **${label}**.`, `Details: \`${trunc(e?.message || e, 300)}\``, 'Unexpected error'); }
  const payload = { embeds: [embed], components: [] };
  if (i.deferred || i.replied) await i.editReply(payload).catch(() => {});
  else await i.reply({ ...payload, flags: EPH }).catch(() => {});
}

module.exports = { COLORS, EPH, FOOT, pending, errorEmbed, okEmbed, infoEmbed, resultEmbed, animate, confirm, sendResult, sendError };
