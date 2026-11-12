// Modern animated look: replaces the basic running animation and result sender from ui.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const crypto = require('crypto');
const ui = require('./ui');
const cv2 = require('./cv2');
const icons = require('./emojis');
const { sleep } = require('./util');

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const STEPS = ['Checking permissions', 'Running command', 'Saving result'];
const bar = (p) => '▰'.repeat(Math.round(p * 10)) + '▱'.repeat(10 - Math.round(p * 10));

function frame(label, stage, pct, spin) {
  const lines = STEPS.map((s, k) => (k < stage ? `✅ ${s}` : k === stage ? `${spin} **${s}…**` : `⬜ ${s}`));
  return new EmbedBuilder().setColor(ui.COLORS.run).setTitle(`${spin} ${label}`).setDescription(`${lines.join('\n')}\n\n\`${bar(pct)}\` **${Math.round(pct * 100)}%**`).setFooter({ text: ui.FOOT });
}
ui.animate = async function animate(i, label, work) {
  let done = false, result, error;
  const p = work().then((r) => { result = r; }, (e) => { error = e; }).finally(() => { done = true; });
  let n = 0;
  for (;;) {
    await i.editReply({ embeds: [frame(label, n === 0 ? 0 : 1, Math.min(0.12 + n * 0.2, 0.88), SPIN[n % SPIN.length])], components: [] }).catch(() => {});
    n++;
    await Promise.race([p, sleep(700)]);
    if (done && n >= 2) break;
  }
  await p;
  if (error) throw error;
  await i.editReply({ embeds: [frame(label, 3, 1, '✨')], components: [] }).catch(() => {});
  await sleep(300);
  return result;
};
ui.sendResult = async function sendResult(i, r) {
  // Image-heavy results keep the legacy embed layout; text and action results use CV2.
  if (r.embed || r.files?.length) {
    const e = r.embed || ui.resultEmbed(r);
    if (!r.embed) e.setAuthor({ name: `Action by ${i.user.username}`, iconURL: i.user.displayAvatarURL({ size: 64 }) });
    const row = new ActionRowBuilder();
    if (r.undo) {
      const key = crypto.randomBytes(6).toString('hex');
      ui.pending.set(key, { fn: r.undo.fn, userId: i.user.id, label: r.undo.label || 'Action undone' });
      setTimeout(() => ui.pending.delete(key), 10 * 60 * 1000).unref();
      row.addComponents(new ButtonBuilder().setCustomId(`undo:${key}`).setLabel('Undo').setEmoji('↩️').setStyle(ButtonStyle.Secondary));
    }
    if (r.case) row.addComponents(new ButtonBuilder().setCustomId(`case:${r.case.id}`).setLabel(`Case #${r.case.id}`).setEmoji('📋').setStyle(ButtonStyle.Primary));
    for (const [label, url] of (r.links || []).slice(0, 2)) row.addComponents(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
    row.addComponents(new ButtonBuilder().setCustomId(`dismiss:${i.user.id}`).setLabel('Dismiss').setEmoji('🗑️').setStyle(ButtonStyle.Secondary));
    const payload = { embeds: [e], components: [row] };
    if (r.files?.length) payload.files = r.files.map((f) => new AttachmentBuilder(f.data, { name: f.name }));
    await i.editReply(payload);
    return;
  }

  const lines = [`# ${r.icon || icons.E('check')} ${r.title || 'Completed'}`];
  if (r.desc) lines.push(trunc(r.desc, 2500));
  for (const [name, value] of r.fields || []) lines.push(`**${name}**\n${trunc(value || '—', 900)}`);
  if (r.case) lines.push(`📋 **Case #${r.case.id}** · Use the button below to view the record.`);

  const controls = [];
  if (r.undo) {
    const key = crypto.randomBytes(6).toString('hex');
    ui.pending.set(key, { fn: r.undo.fn, userId: i.user.id, label: r.undo.label || 'Action undone' });
    setTimeout(() => ui.pending.delete(key), 10 * 60 * 1000).unref();
    controls.push(cv2.button(`undo:${key}`, 'Undo', 2, icons.E('undo')));
  }
  if (r.case) controls.push(cv2.button(`case:${r.case.id}`, `Case #${r.case.id}`, 1, icons.E('page')));
  for (const [label, url] of (r.links || []).slice(0, 2)) controls.push({ type: 2, style: 5, label: String(label).slice(0, 80), url });
  controls.push(cv2.button(`dismiss:${i.user.id}`, 'Dismiss', 2, icons.E('dismiss')));

  const children = [cv2.text(lines.join('\n\n'))];
  if (controls.length) children.push(cv2.separator(), cv2.row(controls));
  await i.editReply(cv2.message(children, r.color ?? ui.COLORS.ok));
};
