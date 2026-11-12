// One Components V2 renderer for every command result, including attachment results.
const crypto = require('node:crypto');
const ui = require('./ui');
const cv2 = require('./cv2');
const icons = require('./emojis');
const { sleep, trunc } = require('./util');

const SPIN = ['◐', '◓', '◑', '◒'];
const STEPS = ['Checking permissions', 'Running command', 'Preparing result'];
const bar = (p) => '▰'.repeat(Math.round(p * 10)) + '▱'.repeat(10 - Math.round(p * 10));

function frame(label, stage, pct, spin) {
  const lines = STEPS.map((step, index) =>
    index < stage ? `${icons.E('check')} **${step}**` :
    index === stage ? `${spin} **${step}…**` : `▫️ ${step}`);
  return cv2.message([
    cv2.text(`# ${icons.E('atom')} Uranium · ${trunc(label, 120)}\n\n${lines.join('\n')}\n\n\`${bar(pct)}\` **${Math.round(pct * 100)}%**`),
    cv2.separator(),
    cv2.text('_Uranium Moderation System_')
  ], ui.COLORS.run);
}

ui.animate = async function animate(interaction, label, work) {
  let done = false, result, error;
  const task = Promise.resolve().then(work).then((value) => { result = value; }, (reason) => { error = reason; }).finally(() => { done = true; });
  let tick = 0;
  for (;;) {
    await interaction.editReply(frame(label, Math.min(tick, 2), Math.min(0.12 + tick * 0.18, 0.88), SPIN[tick % SPIN.length])).catch(() => {});
    tick += 1;
    await Promise.race([task, sleep(650)]);
    if (done && tick >= 2) break;
  }
  await task;
  if (error) throw error;
  await interaction.editReply(frame(label, 3, 1, icons.E('check'))).catch(() => {});
  await sleep(180);
  return result;
};

function embedText(embed) {
  if (!embed) return '';
  const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
  const parts = [];
  if (data.author?.name) parts.push(`**${data.author.name}**`);
  if (data.title) parts.push(`## ${data.title}`);
  if (data.description) parts.push(data.description);
  for (const field of data.fields || []) parts.push(`**${field.name}**\n${field.value}`);
  if (data.footer?.text) parts.push(`-# ${data.footer.text}`);
  return parts.join('\n\n');
}

function registerUndo(interaction, undo) {
  if (!undo) return null;
  const key = crypto.randomBytes(6).toString('hex');
  ui.pending.set(key, { fn: undo.fn, userId: interaction.user.id, label: undo.label || 'Action undone' });
  const timer = setTimeout(() => ui.pending.delete(key), 10 * 60 * 1000);
  timer.unref?.();
  return cv2.button(`undo:${key}`, 'Undo', 2, icons.E('undo'));
}

ui.sendResult = async function sendResult(interaction, result = {}) {
  const sourceEmbed = result.embed || null;
  const blocks = [];
  const heading = result.title || sourceEmbed?.data?.title || 'Command completed';
  const leadingIcon = result.icon || icons.E('check');
  blocks.push(cv2.text(`# ${leadingIcon} ${trunc(heading, 180)}`));

  const description = result.desc || embedText(sourceEmbed);
  if (description) blocks.push(cv2.text(trunc(description, 3800)));
  for (const [name, value] of result.fields || []) {
    blocks.push(cv2.text(`**${trunc(name, 200)}**\n${trunc(value || '—', 900)}`));
  }
  if (result.case) blocks.push(cv2.text(`**${icons.E('page')} Case #${result.case.id}** · Use the case button to inspect this record.`));
  if (result.user?.displayAvatarURL) blocks.push(cv2.text(`**Target:** <@${result.user.id}>`));

  const controls = [];
  const undoButton = registerUndo(interaction, result.undo);
  if (undoButton) controls.push(undoButton);
  if (result.case) controls.push(cv2.button(`case:${result.case.id}`, `Case #${result.case.id}`, 1, icons.E('page')));
  for (const [label, url] of (result.links || []).slice(0, 2)) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) controls.push({ type: 2, style: 5, label: String(label).slice(0, 80), url });
  }
  controls.push(cv2.button(`dismiss:${interaction.user.id}`, 'Dismiss', 2, icons.E('dismiss')));
  if (controls.length) blocks.push(cv2.separator(), cv2.row(controls));

  const files = (result.files || []).filter((file) => file?.data && file?.name);
  const attachments = files.map((file, index) => ({ id: index, filename: String(file.name).slice(0, 100) }));
  for (let index = 0; index < files.length; index += 1) {
    blocks.push({ type: 13, file: { url: `attachment://${attachments[index].filename}` } });
  }
  const payload = cv2.message(blocks.slice(0, 10), result.color ?? sourceEmbed?.data?.color ?? ui.COLORS.ok);
  if (attachments.length) payload.attachments = attachments;
  if (files.length) payload.files = files.map((file) => ({ attachment: file.data, name: file.name }));
  await interaction.editReply(payload);
};

module.exports = ui;
