// Small raw-payload helpers for Discord Components V2.
// Raw API component objects are intentionally used so the bot can adopt CV2
// without coupling every command to a particular discord.js builder release.
const FLAG = 1 << 15;
const EPHEMERAL = 1 << 6;

function text(content) {
  return { type: 10, content: String(content ?? '').slice(0, 4000) };
}
function separator(spacing = 1) {
  return { type: 14, divider: true, spacing };
}
function row(components) {
  return { type: 1, components: components.slice(0, 5) };
}
function emojiObject(value) {
  if (!value) return undefined;
  const match = /^<(a?):([a-zA-Z0-9_]{2,32}):(\\d{17,20})>$/.exec(String(value));
  if (match) return { id: match[3], name: match[2], animated: match[1] === 'a' };
  return { name: String(value) };
}
function button(customId, label, style = 2, icon) {
  return {
    type: 2,
    style,
    custom_id: customId,
    label: String(label).slice(0, 80),
    ...(icon ? { emoji: emojiObject(icon) } : {}),
  };
}
function select(customId, placeholder, options, disabled = false) {
  return {
    type: 3,
    custom_id: customId,
    placeholder: String(placeholder).slice(0, 150),
    min_values: 1,
    max_values: 1,
    disabled: !!disabled,
    options: options.slice(0, 25),
  };
}
function container(children, accentColor = 0x5b8cff) {
  return {
    type: 17,
    accent_color: accentColor,
    components: children.slice(0, 10),
  };
}
function message(children, accentColor = 0x5b8cff) {
  return {
    // When converting an existing deferred reply, explicitly clear legacy fields.
    content: null,
    embeds: [],
    flags: FLAG,
    components: [container(children, accentColor)],
  };
}
function ephemeralMessage(children, accentColor = 0x5b8cff) {
  return { ...message(children, accentColor), flags: FLAG | EPHEMERAL };
}

module.exports = { FLAG, EPHEMERAL, text, separator, row, button, select, container, message, ephemeralMessage, emoji: emojiObject };
