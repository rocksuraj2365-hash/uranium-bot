const { PermissionFlagsBits: P, ChannelType: CT } = require('discord.js');
const { C, S, I, B, CH, RS } = require('../lib/cmd');
const { UserError, res } = require('../lib/util');

const MC = P.ManageChannels;
const TEXT = [CT.GuildText, CT.GuildAnnouncement];
const CHN = () => CH('channel', 'Channel (default: this one)');
const tg = (c) => c.c('channel') || c.ch;
const needOv = (ch) => { if (!ch?.permissionOverwrites) throw new UserError('This channel type has no permission settings', 'Use a text or voice channel.'); return ch; };

async function setPerm(c, label, perms, undo, icon = '🔒') {
  const ch = needOv(tg(c)); const ev = c.g.roles.everyone;
  await ch.permissionOverwrites.edit(ev, perms, { reason: c.audit() });
  return res(label, `<#${ch.id}> was updated for **@everyone**.`, { icon, fields: [['Reason', c.reason()]], undo: undo && { label: 'Channel restored', fn: () => ch.permissionOverwrites.edit(ev, undo) } });
}
async function allText(c) { await c.g.channels.fetch(); return [...c.g.channels.cache.filter((x) => x.type === CT.GuildText).values()]; }
async function bulk(c, perms) {
  const chs = await allText(c); let ok = 0;
  for (const ch of chs) { try { await ch.permissionOverwrites.edit(c.g.roles.everyone, perms, { reason: c.audit() }); ok++; } catch { /* skip */ } }
  return [ok, chs.length];
}

module.exports = {
  name: 'channel', description: 'Channel tools: lock, slowmode, create, nuke',
  commands: [
    C('lock', 'Stop @everyone from sending messages', [CHN(), RS()], MC, (c) => setPerm(c, 'Channel locked', { SendMessages: false }, { SendMessages: null })),
    C('unlock', 'Let @everyone send messages again', [CHN(), RS()], MC, (c) => setPerm(c, 'Channel unlocked', { SendMessages: null }, null, '🔓')),
    C('lockdown-all', 'Lock every text channel in the server', [RS()], MC, async (c) => {
      const [ok, total] = await bulk(c, { SendMessages: false });
      return res('Server lockdown', `Locked **${ok}** of **${total}** text channels.`, { icon: '🚨', color: 0xff4d6d, undo: { label: 'Server unlocked', fn: () => bulk(c, { SendMessages: null }) } });
    }, { danger: 'This will **lock every text channel** for @everyone.' }),
    C('unlock-all', 'Unlock every text channel in the server', [RS()], MC, async (c) => {
      const [ok, total] = await bulk(c, { SendMessages: null });
      return res('Server unlocked', `Unlocked **${ok}** of **${total}** text channels.`, { icon: '🔓' });
    }, { danger: 'This will unlock **every text channel**.' }),
    C('slowmode', 'Set slowmode (seconds between messages)', [I('seconds', 'Seconds (1-21600)', true, 1, 21600), CHN()], MC, async (c) => {
      const ch = tg(c); if (!ch.setRateLimitPerUser) throw new UserError('Slowmode does not work here', 'Use a text channel.');
      const old = ch.rateLimitPerUser || 0; await ch.setRateLimitPerUser(c.n('seconds'), c.audit());
      return res('Slowmode set', `<#${ch.id}> now has **${c.n('seconds')}s** slowmode.`, { icon: '🐢', undo: { label: 'Slowmode restored', fn: () => ch.setRateLimitPerUser(old) } });
    }),
    C('slowmode-off', 'Turn slowmode off', [CHN()], MC, async (c) => {
      const ch = tg(c); if (!ch.setRateLimitPerUser) throw new UserError('Slowmode does not work here', 'Use a text channel.');
      await ch.setRateLimitPerUser(0, c.audit()); return res('Slowmode off', `<#${ch.id}> has no slowmode.`, { icon: '⚡' });
    }),
    C('hide', 'Hide a channel from @everyone', [CHN(), RS()], MC, (c) => setPerm(c, 'Channel hidden', { ViewChannel: false }, { ViewChannel: null }, '🙈')),
    C('unhide', 'Show a hidden channel again', [CHN(), RS()], MC, (c) => setPerm(c, 'Channel visible', { ViewChannel: null }, null, '👀')),
    C('topic', 'Change the channel topic', [S('text', 'New topic', true, { max: 1000 }), CHN()], MC, async (c) => {
      const ch = tg(c); if (!ch.setTopic) throw new UserError('This channel has no topic', 'Use a text channel.');
      await ch.setTopic(c.s('text'), c.audit()); return res('Topic changed', `<#${ch.id}> topic updated.`, { icon: '📝' });
    }),
    C('rename', 'Rename a channel', [S('name', 'New name', true, { max: 100 }), CHN()], MC, async (c) => {
      const ch = tg(c); const old = ch.name; await ch.setName(c.s('name'), c.audit());
      return res('Channel renamed', `**${old}** → **${c.s('name')}**`, { icon: '✏️', undo: { label: 'Name restored', fn: () => ch.setName(old) } });
    }),
    C('nsfw-on', 'Mark a channel as age-restricted', [CHN()], MC, async (c) => {
      const ch = tg(c); if (!ch.setNSFW) throw new UserError('Only text channels can be age-restricted'); await ch.setNSFW(true, c.audit());
      return res('NSFW on', `<#${ch.id}> is age-restricted.`, { icon: '🔞' });
    }),
    C('nsfw-off', 'Remove the age restriction', [CHN()], MC, async (c) => {
      const ch = tg(c); if (!ch.setNSFW) throw new UserError('Only text channels can be age-restricted'); await ch.setNSFW(false, c.audit());
      return res('NSFW off', `<#${ch.id}> is no longer age-restricted.`, { icon: '✅' });
    }),
    C('clone', 'Make a copy of a channel', [CHN()], MC, async (c) => {
      const n = await tg(c).clone({ reason: c.audit() });
      return res('Channel cloned', `Created <#${n.id}>.`, { icon: '🧬', undo: { label: 'Clone deleted', fn: () => n.delete() } });
    }),
    C('delete', 'Delete a channel', [CH('channel', 'Channel to delete', true), RS()], MC, async (c) => {
      const ch = c.c('channel'); const name = ch.name; await ch.delete(c.audit());
      return res('Channel deleted', `**#${name}** was deleted.`, { icon: '🗑️', color: 0xff4d6d });
    }, { danger: 'This will **permanently delete** the channel and its messages.' }),
    C('create-text', 'Create a text channel', [S('name', 'Channel name', true, { max: 100 }), CH('category', 'Category', false, [CT.GuildCategory])], MC, async (c) => {
      const n = await c.g.channels.create({ name: c.s('name'), type: CT.GuildText, parent: c.c('category')?.id, reason: c.audit() });
      return res('Text channel created', `Created <#${n.id}>.`, { icon: '💬', undo: { label: 'Channel deleted', fn: () => n.delete() } });
    }),
    C('create-voice', 'Create a voice channel', [S('name', 'Channel name', true, { max: 100 }), CH('category', 'Category', false, [CT.GuildCategory])], MC, async (c) => {
      const n = await c.g.channels.create({ name: c.s('name'), type: CT.GuildVoice, parent: c.c('category')?.id, reason: c.audit() });
      return res('Voice channel created', `Created **${n.name}**.`, { icon: '🔊', undo: { label: 'Channel deleted', fn: () => n.delete() } });
    }),
    C('create-category', 'Create a category', [S('name', 'Category name', true, { max: 100 })], MC, async (c) => {
      const n = await c.g.channels.create({ name: c.s('name'), type: CT.GuildCategory, reason: c.audit() });
      return res('Category created', `Created **${n.name}**.`, { icon: '📁', undo: { label: 'Category deleted', fn: () => n.delete() } });
    }),
    C('nuke', 'Wipe a text channel by cloning it and deleting the old one', [RS()], MC, async (c) => {
      const old = c.ch; if (old.type !== CT.GuildText) throw new UserError('Nuke only works in normal text channels');
      const n = await old.clone({ reason: c.audit() }); await n.setPosition(old.position);
      await c.i.deleteReply().catch(() => {}); await old.delete(c.audit());
      await n.send({ embeds: [require('../lib/ui').resultEmbed(res('Channel nuked', `All messages were wiped by **${c.i.user.username}**.`, { icon: '💥', color: 0xff4d6d }))] });
      return { handled: true };
    }, { danger: 'This will **delete all messages** in this channel by recreating it.' }),
    C('lock-reactions', 'Stop @everyone from adding reactions', [CHN()], MC, (c) => setPerm(c, 'Reactions locked', { AddReactions: false }, { AddReactions: null }, '🚫')),
    C('lock-attachments', 'Stop @everyone from uploading files', [CHN()], MC, (c) => setPerm(c, 'Attachments locked', { AttachFiles: false }, { AttachFiles: null }, '📎')),
    C('lock-embeds', 'Stop @everyone from embedding links', [CHN()], MC, (c) => setPerm(c, 'Embeds locked', { EmbedLinks: false }, { EmbedLinks: null }, '🔗')),
    C('lock-threads', 'Stop @everyone from creating threads', [CHN()], MC, (c) => setPerm(c, 'Threads locked', { CreatePublicThreads: false, CreatePrivateThreads: false, SendMessagesInThreads: false }, { CreatePublicThreads: null, CreatePrivateThreads: null, SendMessagesInThreads: null }, '🧵')),
    C('reset-perms', 'Remove the @everyone overwrite from a channel', [CHN()], MC, async (c) => {
      const ch = needOv(tg(c)); await ch.permissionOverwrites.delete(c.g.roles.everyone, c.audit());
      return res('Permissions reset', `<#${ch.id}> uses its category/default permissions for @everyone.`, { icon: '♻️' });
    }, { danger: 'This will remove the @everyone permission settings of the channel.' }),
    C('archive-thread', 'Archive the thread you are in', [B('lock', 'Also lock it')], P.ManageThreads, async (c) => {
      const t = c.ch; if (!t.isThread?.()) throw new UserError('This is not a thread', 'Run it inside a thread.');
      if (c.b('lock')) await t.setLocked(true); await t.setArchived(true, c.audit());
      return res('Thread archived', 'The thread was archived.', { icon: '🗄️' });
    }),
    C('lock-thread', 'Lock the thread you are in', [], P.ManageThreads, async (c) => {
      const t = c.ch; if (!t.isThread?.()) throw new UserError('This is not a thread', 'Run it inside a thread.');
      await t.setLocked(true, c.audit()); return res('Thread locked', 'Only moderators can write now.', { icon: '🔒', undo: { label: 'Thread unlocked', fn: () => t.setLocked(false) } });
    }),
  ],
};
