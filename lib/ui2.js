// One Components V2 renderer for every command result, including attachment results.
const crypto = require('node:crypto');
const ui = require('./ui');
const cv2 = require('./cv2');
const icons = require('./emojis');
const { sleep, trunc } = require('./util');

const SPIN = ['◐', '◓', '◑', '◒'];
const STEPS = ['Checking permissions', 'Running command', 'Preparing result'];
const bar = (p) => '▰'.repeat(Math.round(p * 10)) + '▱'.repeat(10 - Math.round(p * 10));
const ACTION_ICONS = [
  [/ban|unban|softban/, 'security'], [/kick/, 'member'], [/timeout|slowmode|schedule/, 'warn'],
  [/warn|note|case|history/, 'page'], [/purge|clear|delete|clean/, 'purge'],
  [/lock|hide|restrict|block/, 'lock'], [/unlock|unhide|unrestrict|unblock/, 'unlock'],
  [/role|permission|permit/, 'role'], [/channel|thread|forum/, 'channel'],
  [/voice|mute|deafen|disconnect|move|pull/, 'voice'], [/music|radio|play|pause|resume|volume/, 'music'],
  [/automod|filter|spam|keyword/, 'automod'], [/ai|chat|ask/, 'ai'],
  [/premium|grant|revoke|license/, 'premium'], [/support|report|feedback|ticket/, 'support'],
  [/welcome|goodbye|poll|giveaway|event/, 'community'], [/server|guild|setup|config/, 'server'],
  [/avatar|banner|profile|user|member/, 'member'], [/info|status|ping|about/, 'info'],
  [/calc|convert|time|date|remind|utility/, 'utility'],
];
function actionIcon(command, category) {
  const name = String(command || '').toLowerCase();
  const match = ACTION_ICONS.find(([pattern]) => pattern.test(name));
  return icons.E(match?.[1] || category) || icons.E('atom');
}

function frame(label, stage, pct, spin) {
  const category = String(label || '').split(/\\s+/)[0]?.replace(/^\\//, '');\n  const command = String(label || '').split(/\\s+/)[1];\n  const lines = STEPS.map((step, index) =>
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
  const heading = result.title || embedText(sourceEmbed).split('\n')[0]?.replace(/^#+\s*/, '') || 'Command completed';
  const category = String(result.category || 'uranium').toLowerCase();
  const command = String(result.command || '').toLowerCase();
  const categoryIcon = icons.E(category) || icons.E('atom');
  const commandIcon = actionIcon(command, category);
  const textParts = [
    `# ${categoryIcon} ${commandIcon} ${result.icon || icons.E('check')} ${trunc(heading, 180)}`,
    `-# URANIUM CONTROL SYSTEM · ${category.toUpperCase()} ${command ? `/ ${command}` : ''}`
  ];
  const description = result.desc || embedText(sourceEmbed);
  if (description) textParts.push(trunc(description, 3000));
  for (const [name, value] of result.fields || []) textParts.push(`**${trunc(name, 160)}**\n${trunc(value || '—', 700)}`);
  if (result.case) textParts.push(`**${icons.E('page')} Case #${result.case.id}** · Use the case button to inspect this record.`);
  if (result.user?.id) textParts.push(`**Target:** <@${result.user.id}>`);
  const controls = [];
  const undoButton = registerUndo(interaction, result.undo);
  if (undoButton) controls.push(undoButton);
  if (result.case) controls.push(cv2.button(`case:${result.case.id}`, `Case #${result.case.id}`, 1, icons.E('page')));
  for (const [label, url] of (result.links || []).slice(0, 2)) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) controls.push({ type: 2, style: 5, label: String(label).slice(0, 80), url });
  }
  controls.push(cv2.button(`dismiss:${interaction.user.id}`, 'Dismiss', 2, icons.E('dismiss')));
  const files = (result.files || []).filter((file) => file?.data && file?.name).slice(0, 7);
  const children = [cv2.text(textParts.join('\n\n').slice(0, 4000))];
  const embedData = sourceEmbed ? (typeof sourceEmbed.toJSON === 'function' ? sourceEmbed.toJSON() : sourceEmbed) : null;
  const media = [embedData?.image?.url, embedData?.thumbnail?.url].filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
  if (media.length) children.push({ type: 12, items: media.map((url) => ({ media: { url } })) });
  if (controls.length) children.push(cv2.separator(), cv2.row(controls));
  for (const file of files) children.push({ type: 13, file: { url: `attachment://${String(file.name).slice(0, 100)}` } });
  const payload = cv2.message(children, result.color ?? sourceEmbed?.data?.color ?? ui.COLORS.ok);
  if (files.length) payload.files = files.map((file) => ({ attachment: file.data, name: String(file.name).slice(0, 100) }));
  await interaction.editReply(payload);
}

module.exports = ui;
