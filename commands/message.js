const { PermissionFlagsBits: P } = require('discord.js');
const cv2 = require('../lib/cv2');
const icons = require('../lib/emojis');
const { C, U, S, I, CH, R } = require('../lib/cmd');
const { UserError, res, hexColor, snowflake, trunc, ts } = require('../lib/util');

const MM = P.ManageMessages;
const COUNT = () => I('count', 'How many of the last messages to check (1-100)', true, 1, 100);
const NOPING = { parse: [] };

async function purge(c, test, label, opts = {}) {
  const ch = c.ch;
  if (!ch || !ch.bulkDelete) throw new UserError('Purge does not work in this kind of channel', 'Use it in a normal text channel.');
  const count = c.n('count') || 100;
  const got = await ch.messages.fetch({ limit: 100, ...opts });
  const msgs = [...got.filter((m) => !m.pinned && test(m)).values()].slice(0, count);
  if (!msgs.length) throw new UserError(`No ${label} found in the last 100 messages`, 'Nothing matched, so nothing was deleted.');
  const del = await ch.bulkDelete(msgs, true);
  if (!del.size) throw new UserError('Those messages are older than 14 days', 'Discord cannot bulk delete messages older than 14 days.');
  return res('Messages purged', `Deleted **${del.size}** ${label} in <#${ch.id}>.`, { icon: '🧹', fields: [['Checked', 'last 100 messages', true], ['Filter', label, true]] });
}
const msgOf = (c, id) => c.ch.messages.fetch(snowflake(id));
const target = (c) => c.c('channel') || c.ch;
const sendable = (ch) => { if (!ch?.isTextBased?.() || !ch.send) throw new UserError('I cannot send messages there', 'Pick a text channel.'); return ch; };

module.exports = {
  name: 'message', description: 'Message tools: purge, pin, say, announce',
  commands: [
    C('purge', 'Delete the latest messages in this channel', [COUNT()], MM, (c) => purge(c, () => true, 'messages')),
    C('purge-user', 'Delete messages from one user', [U(), COUNT()], MM, (c) => purge(c, (m) => m.author.id === c.u('user').id, `messages from ${c.u('user').username}`)),
    C('purge-bots', 'Delete messages sent by bots', [COUNT()], MM, (c) => purge(c, (m) => m.author.bot, 'bot messages')),
    C('purge-humans', 'Delete messages sent by humans', [COUNT()], MM, (c) => purge(c, (m) => !m.author.bot, 'human messages')),
    C('purge-links', 'Delete messages that contain links', [COUNT()], MM, (c) => purge(c, (m) => /https?:\/\/\S+/i.test(m.content), 'messages with links')),
    C('purge-images', 'Delete messages that have images', [COUNT()], MM, (c) => purge(c, (m) => m.attachments.some((a) => a.contentType?.startsWith('image')) || m.embeds.some((e) => e.image || e.thumbnail), 'messages with images')),
    C('purge-attachments', 'Delete messages that have files', [COUNT()], MM, (c) => purge(c, (m) => m.attachments.size > 0, 'messages with files')),
    C('purge-embeds', 'Delete messages that have embeds', [COUNT()], MM, (c) => purge(c, (m) => m.embeds.length > 0, 'messages with embeds')),
    C('purge-contains', 'Delete messages containing some text', [S('text', 'Text to look for', true, { max: 100 }), COUNT()], MM, (c) => purge(c, (m) => m.content.toLowerCase().includes(c.s('text').toLowerCase()), `messages containing "${trunc(c.s('text'), 30)}"`)),
    C('purge-startswith', 'Delete messages that start with some text', [S('text', 'Starting text', true, { max: 100 }), COUNT()], MM, (c) => purge(c, (m) => m.content.toLowerCase().startsWith(c.s('text').toLowerCase()), `messages starting with "${trunc(c.s('text'), 30)}"`)),
    C('purge-before', 'Delete messages sent before a message', [S('message_id', 'Message ID', true, { max: 25 }), COUNT()], MM, (c) => purge(c, () => true, 'older messages', { before: snowflake(c.s('message_id')) })),
    C('purge-after', 'Delete messages sent after a message', [S('message_id', 'Message ID', true, { max: 25 }), COUNT()], MM, (c) => purge(c, () => true, 'newer messages', { after: snowflake(c.s('message_id')) })),
    C('purge-mentions', 'Delete messages that mention people or roles', [COUNT()], MM, (c) => purge(c, (m) => m.mentions.users.size > 0 || m.mentions.roles.size > 0 || m.mentions.everyone, 'messages with mentions')),
    C('purge-invites', 'Delete messages that contain Discord invites', [COUNT()], MM, (c) => purge(c, (m) => /(discord\.gg|discord(app)?\.com\/invite)\//i.test(m.content), 'messages with invites')),
    C('delete-message', 'Delete one message by its ID', [S('message_id', 'Message ID', true, { max: 25 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id')); await m.delete();
      return res('Message deleted', `Deleted a message by **${m.author.username}**.`, { icon: '🗑️', user: m.author, fields: [['Content', trunc(m.content || '(no text)', 300)]] });
    }),
    C('pin-message', 'Pin a message by ID', [S('message_id', 'Message ID', true, { max: 25 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id')); await m.pin(c.audit());
      return res('Message pinned', `[Jump to message](${m.url})`, { icon: '📌', undo: { label: 'Message unpinned', fn: () => m.unpin() } });
    }),
    C('unpin-message', 'Unpin a message by ID', [S('message_id', 'Message ID', true, { max: 25 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id'));
      if (!m.pinned) throw new UserError('That message is not pinned', 'Check the message ID.');
      await m.unpin(c.audit());
      return res('Message unpinned', `[Jump to message](${m.url})`, { icon: '📍' });
    }),
    C('clear-reactions', 'Remove all reactions from a message', [S('message_id', 'Message ID', true, { max: 25 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id')); const n = m.reactions.cache.size; await m.reactions.removeAll();
      return res('Reactions cleared', `Removed **${n}** reaction type(s).`, { icon: '🧽' });
    }),
    C('add-reaction', 'Make the bot react to a message', [S('message_id', 'Message ID', true, { max: 25 }), S('emoji', 'Emoji, e.g. 👍', true, { max: 60 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id')); await m.react(c.s('emoji'));
      return res('Reaction added', `Reacted with ${c.s('emoji')}.`, { icon: '😀' });
    }),
    C('say', 'Make the bot send a message', [S('text', 'What should I say?', true, { max: 1900 }), CH('channel', 'Where (default: here)')], MM, async (c) => {
      const ch = sendable(target(c)); const m = await ch.send({ ...cv2.message([cv2.text(`# ${icons.E('message')} Message\\n${c.s('text')}`)], 0x8b5cf6), allowedMentions: NOPING });
      return res('Message sent', `Posted in <#${ch.id}>.`, { icon: '💬', links: [['Open', m.url]] });
    }),
    C('say-embed', 'Make the bot send a nice embed', [S('title', 'Embed title', true, { max: 200 }), S('text', 'Embed text', true, { max: 3500 }), S('color', 'Hex color like #39d98a', false, { max: 10 }), CH('channel', 'Where (default: here)')], MM, async (c) => {
      const ch = sendable(target(c));
      const color = c.s('color') ? hexColor(c.s('color')) : 0x39d98a;
      const m = await ch.send(cv2.message([cv2.text(`# ${icons.E('message')} ${c.s('title')}\n${c.s('text')}`)], color));
      return res('Embed sent', `Posted in <#${ch.id}>.`, { icon: '🖼️', links: [['Open', m.url]] });
    }),
    C('announce', 'Post an announcement embed (optionally ping a role)', [S('title', 'Title', true, { max: 200 }), S('text', 'Announcement text', true, { max: 3500 }), CH('channel', 'Where (default: here)'), R('ping', 'Role to ping', false)], MM, async (c) => {
      const ch = sendable(target(c)); const role = c.r('ping');
      const mention = role ? `<@&${role.id}>\n` : '';
      const m = await ch.send({ ...cv2.message([cv2.text(`${mention}# ${icons.E('message')} ${c.s('title')}\n${c.s('text')}\n\n-# Announcement by ${c.i.user.username}`)], 0x5b8cff), allowedMentions: role ? { roles: [role.id] } : NOPING });
      return res('Announcement posted', `Posted in <#${ch.id}>.`, { icon: '📢', links: [['Open', m.url]] });
    }),
    C('edit-bot-message', 'Edit a message the bot sent', [S('message_id', 'Message ID', true, { max: 25 }), S('text', 'New text', true, { max: 1900 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id'));
      if (m.author.id !== c.me.id) throw new UserError('I can only edit my own messages', 'Pick a message that Uranium sent.');
      await m.edit({ ...cv2.message([cv2.text(`# ${icons.E('message')} Updated message\\n${c.s('text')}`)], 0x8b5cf6), allowedMentions: NOPING });
      return res('Message edited', `[Jump to message](${m.url})`, { icon: '✏️' });
    }),
    C('message-info', 'Show details about a message', [S('message_id', 'Message ID', true, { max: 25 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id'));
      return res('Message info', trunc(m.content || '(no text)', 800), { icon: '🔎', color: 0x5b8cff, user: m.author, fields: [['Author', `${m.author.username} (\`${m.author.id}\`)`], ['Sent', ts(m.createdTimestamp), true], ['Pinned', m.pinned ? 'Yes' : 'No', true], ['Files', String(m.attachments.size), true], ['Reactions', String(m.reactions.cache.size), true]], links: [['Open', m.url]] });
    }),
    C('reply', 'Make the bot reply to a message', [S('message_id', 'Message ID', true, { max: 25 }), S('text', 'Reply text', true, { max: 1900 })], MM, async (c) => {
      const m = await msgOf(c, c.s('message_id')); const r = await m.reply({ ...cv2.message([cv2.text(`# ${icons.E('message')} Reply\\n${c.s('text')}`)], 0x8b5cf6), allowedMentions: NOPING });
      return res('Reply sent', 'Replied to the message.', { icon: '↩️', links: [['Open', r.url]] });
    }),
  ],
};
