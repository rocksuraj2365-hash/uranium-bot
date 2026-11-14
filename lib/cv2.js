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
  const raw = String(value).trim();
  const match = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/.exec(raw);
  if (match) return { id: match[3], name: match[2], animated: match[1] === 'a' };
  // Discord accepts Unicode emoji or a valid custom emoji object, not arbitrary
  // fallback glyphs such as ◆. Omit those instead of sending an invalid payload.
  if (/\p{Extended_Pictographic}/u.test(raw) || /^(?:[0-9#*]\uFE0F?\u20E3|[\u{1F1E6}-\u{1F1FF}]{2})$/u.test(raw)) {
    return { name: raw };
  }
  return undefined;
}
function button(customId, label, style = 2, icon) {
  const emoji = emojiObject(icon);
  return {
    type: 2,
    style,
    custom_id: customId,
    ...(label ? { label: String(label).slice(0, 80) } : {}),
    ...(emoji ? { emoji } : {}),
  };
}
// Link button (style 5): opens a URL, never sends an interaction.
function linkButton(label, url, icon) {
  const emoji = emojiObject(icon);
  return {
    type: 2,
    style: 5,
    url,
    ...(label ? { label: String(label).slice(0, 80) } : {}),
    ...(emoji ? { emoji } : {}),
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
// Small image shown at the side of a section (e.g. the bot avatar).
function thumbnail(url, description) {
  return { type: 11, media: { url }, ...(description ? { description: String(description).slice(0, 1024) } : {}) };
}
// Section = up to 3 text blocks plus one accessory (thumbnail or button).
function section(texts, accessory) {
  return {
    type: 9,
    components: texts.slice(0, 3).map((t) => (typeof t === 'string' ? text(t) : t)),
    accessory,
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

module.exports = { FLAG, EPHEMERAL, text, separator, row, button, linkButton, select, thumbnail, section, container, message, ephemeralMessage, emoji: emojiObject };
