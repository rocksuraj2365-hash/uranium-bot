const { PermissionFlagsBits: P, ChannelType: CT } = require('discord.js');
const { C, S, CH } = require('../lib/cmd');
const db = require('../lib/db');
const ai = require('../lib/ai');
const { res } = require('../lib/util');

module.exports = {
  name: 'ai', description: 'AI assistant: ask, chat channel, settings',
  commands: [
    C('ask', 'Talk to Uranium AI (it can run commands for you)', [S('text', 'What do you want? (any language)', true, { max: 1500 })], null, async (c) => {
      const i = c.i;
      await ai.ask({ client: i.client, guild: c.g, channel: c.ch, user: i.user, member: i.member, text: c.s('text'), srcId: i.srcId, owner: c.isOwner });
      await i.deleteReply().catch(() => {});
      return { handled: true };
    }, { custom: true }),
    C('channel', 'Set a channel where the AI answers every message', [CH('channel', 'AI chat channel (leave empty to turn off)', false, [CT.GuildText])], P.ManageGuild, async (c) => {
      const ch = c.c('channel'); const cfg = db.g(c.g.id).config;
      if (ch) cfg.aiChannel = ch.id; else delete cfg.aiChannel; db.save();
      return res(ch ? 'AI chat channel set' : 'AI chat channel removed', ch ? `The AI now answers every message in <#${ch.id}>.` : 'The AI only answers when asked.', { icon: '🤖', color: 0x8b5cf6 });
    }),
    C('toggle', 'Turn the AI on or off in this server', [S('mode', 'on or off', true, { choices: ['on', 'off'] })], P.ManageGuild, async (c) => {
      db.g(c.g.id).config.ai = c.s('mode') === 'on'; db.save();
      return res(`AI turned ${c.s('mode')}`, c.s('mode') === 'on' ? 'Members can talk to the AI again.' : 'The AI is disabled in this server.', { icon: '🤖', color: 0x8b5cf6 });
    }),
    C('status', 'Show AI status and usage today', [], null, async (c) => {
      const s = ai.status(); const cfg = db.g(c.g.id).config;
      return res('AI status', null, { icon: '🤖', color: 0x8b5cf6, fields: [['Key', s.key ? '✅ set' : '❌ missing', true], ['Model', s.model, true], ['Server', cfg.ai === false ? '🔴 off' : '🟢 on', true], ['Used today', `${s.used}/${s.limit}`, true], ['Chat channel', cfg.aiChannel ? `<#${cfg.aiChannel}>` : 'none', true]] });
    }),
    C('reset', 'Make the AI forget this chat', [], null, async (c) => {
      ai.resetHistory(c.ch.id, c.i.user.id); return res('Memory cleared', 'I forgot our earlier messages in this channel.', { icon: '🧠', color: 0x8b5cf6 });
    }),
  ],
};
