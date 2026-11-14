const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const cv2 = require('./cv2');
const emojis = require('./emojis');
const E = (name) => emojis.E(name);
const { sleep, UserError, trunc } = require('./util');

const COLORS = { ok: 0x39d98a, err: 0xff4d6d, warn: 0xffb84d, info: 0x5b8cff, run: 0x8b5cf6 };
const FRAMES = ['◐', '◓', '◑', '◒'];
const BARS = ['▱▱▱▱▱▱▱▱', '▰▰▱▱▱▱▱▱', '▰▰▰▰▱▱▱▱', '▰▰▰▰▰▰▱▱', '▰▰▰▰▰▰▰▱'];
const EPH = MessageFlags.Ephemeral;
const FOOT = 'Uranium Moderation';
const pending = new Map();

const errorEmbed = (msg, hint, title = 'Command failed') => {
  const e = new EmbedBuilder().setColor(COLORS.err).setTitle(`${E('warning')} ${title}`).setDescription(trunc(msg, 3500)).setFooter({ text: FOOT });
  if (hint) e.addFields({ name: `${E('help')} How to fix`, value: trunc(hint, 1000) });
  return e;
};
const okEmbed = (title, desc) => new EmbedBuilder().setColor(COLORS.ok).setTitle(`${E('verify')} ${title}`).setDescription(desc || null).setFooter({ text: FOOT });
const infoEmbed = (title, desc, color = COLORS.info) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc || null).setFooter({ text: FOOT }).setTimestamp();

function resultIcon(r) {
  if (r.icon) return r.icon;
  const title = String(r.title || '').toLowerCase();
  const rules = [
    [/ban|kick|timeout|mute|warn|member|nickname/, 'ban'],
    [/purge|delete|clear|remove/, 'purge'],
    [/lock|unlock|channel|slowmode/, 'lock'],
    [/role|permission/, 'role'],
    [/ticket|support/, 'ticket'],
    [/poll|giveaway|event/, 'poll'],
    [/raid|fortress|automod|spam|security|protect/, 'fortress'],
    [/backup|restore|database|storage/, 'database'],
    [/music|play|queue|voice/, 'music'],
    [/premium|upgrade|plan/, 'premium'],
    [/welcome|server/, 'server'],
    [/config|setting|setup/, 'settings'],
  ];
  const match = rules.find(([pattern]) => pattern.test(title));
  return E(match ? match[1] : 'shield');
}
function resultEmbed(r) {
  const e = new EmbedBuilder().setColor(r.color ?? COLORS.ok).setTitle(`${resultIcon(r)} ${r.title}`).setTimestamp();
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
  const row = cv2.row([
    cv2.button('cf:yes', 'Confirm action', 4, E('warning')),
    cv2.button('cf:no', 'Cancel', 2, E('cross')),
  ]);
  const body = [
    cv2.text(`# ${E('warning')} Please confirm\n\n` + trunc(text, 2500) + '\n\n_This confirmation expires in 30 seconds._'),
    cv2.separator(),
    row,
  ];
  const msg = await i.editReply(cv2.message(body, COLORS.warn));
  try {
    const button = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30000,
      filter: (component) => component.user.id === i.user.id && component.customId.startsWith('cf:'),
    });
    await button.deferUpdate();
    if (button.customId === 'cf:no') {
      await i.editReply(cv2.message([cv2.text(`# ${E('cross')} Cancelled\nNothing was changed.`)], COLORS.err));
      return false;
    }
    return true;
  } catch {
    await i.editReply(cv2.message([cv2.text(`# ${E('timeout')} Confirmation expired\nNo answer was received, so nothing was changed.`)], COLORS.err)).catch(() => {});
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
    row.addComponents(new ButtonBuilder().setCustomId(`undo:${key}`).setLabel('Undo').setEmoji(E('undo')).setStyle(ButtonStyle.Secondary));
  }
  if (r.case) row.addComponents(new ButtonBuilder().setCustomId(`case:${r.case.id}`).setLabel(`Case #${r.case.id}`).setEmoji(E('case')).setStyle(ButtonStyle.Primary));
  for (const [label, url] of (r.links || []).slice(0, 2)) row.addComponents(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
  row.addComponents(new ButtonBuilder().setCustomId(`dismiss:${i.user.id}`).setLabel('Dismiss').setEmoji(E('purge')).setStyle(ButtonStyle.Secondary));
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
  let title = 'Command could not be completed', message = 'Something went wrong.', hint = '';
  if (e instanceof UserError) { message = e.message; hint = e.hint || ''; }
  else if (e && API[e.code]) { message = API[e.code][0]; hint = API[e.code][1] + (e.code === 50035 ? '\n`' + trunc(e.message, 300) + '`' : ''); }
  else {
    console.error('[' + label + ']', e); title = 'Unexpected error';
    message = 'Something unexpected went wrong while running **' + label + '**.';
    hint = 'Details: `' + trunc(e?.message || e, 300) + '`';
  }
  const missing = /(?:need|missing|required|provide|did not receive|not receive)/i.test(message);
  if (missing) title = 'Missing information';
  const accent = missing ? COLORS.warn : COLORS.err;
  const headingIcon = E('pk_alert_yellow') || E('warning');
  const helpIcon = E('pk_star_help') || E('help');
  const arrowIcon = E('pk_arrow_flash') || E('info');
  const children = [
    cv2.text('# ' + headingIcon + ' ' + title + '\n-# URANIUM · COMMAND ASSISTANT'),
    cv2.separator(2),
    cv2.text(trunc(message, 2400)),
  ];
  if (hint) { children.push(cv2.separator()); children.push(cv2.text('## ' + helpIcon + ' How to fix it\n' + trunc(hint, 1000))); }
  if (label) { children.push(cv2.separator()); children.push(cv2.text('**' + arrowIcon + ' Command**\n`' + trunc(label, 100) + '`')); }
  children.push(cv2.separator());
  children.push(cv2.text('-# Nothing was changed by this failed command. Check the details above and try again.'));
  if (i.deferred || i.replied) await i.editReply(cv2.message(children, accent)).catch(() => {});
  else await i.reply(cv2.ephemeralMessage(children, accent)).catch(() => {});
}
module.exports = { COLORS, EPH, FOOT, pending, errorEmbed, okEmbed, infoEmbed, resultEmbed, animate, confirm, sendResult, sendError };
