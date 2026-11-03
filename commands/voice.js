const { PermissionFlagsBits: P, ChannelType: CT } = require('discord.js');
const { C, U, S, I, CH, RS } = require('../lib/cmd');
const { UserError, res, checkTarget, trunc } = require('../lib/util');

const VT = [CT.GuildVoice, CT.GuildStageVoice];
const VCH = (req = false) => CH('channel', 'Voice channel (default: the one you are in)', req, VT);
const REGIONS = ['automatic', 'brazil', 'hongkong', 'india', 'japan', 'rotterdam', 'russia', 'singapore', 'southafrica', 'sydney', 'us-central', 'us-east', 'us-south', 'us-west'];

function vc(c) {
  const ch = c.c('channel') || c.i.member.voice.channel;
  if (!ch) throw new UserError('No voice channel selected', 'Join a voice channel or pick one in the "channel" option.');
  return ch;
}
async function inVoice(c) {
  const m = await c.m('user'); checkTarget(c, m, 'moderate');
  if (!m.voice.channel) throw new UserError(`**${m.user.username}** is not in a voice channel`, 'They must be connected to voice first.');
  return m;
}
async function one(c, label, icon, fn, undo) {
  const m = await inVoice(c); await fn(m, c.audit());
  return res(label, `**${m.user.username}** in **${m.voice.channel?.name || 'voice'}**.`, { icon, user: m.user, fields: [['Reason', c.reason()]], undo: undo && { label: 'Reverted', fn: () => undo(m) } });
}
async function all(c, label, icon, fn) {
  const ch = vc(c); const ms = [...ch.members.values()].filter((m) => m.id !== c.me.id && m.id !== c.g.ownerId);
  if (!ms.length) throw new UserError(`Nobody to change in **${ch.name}**`, 'The channel has no other members.');
  let ok = 0; for (const m of ms) { try { await fn(m, c.audit()); ok++; } catch { /* skip */ } }
  return res(label, `Done for **${ok}** of **${ms.length}** member(s) in **${ch.name}**.`, { icon });
}
async function ov(c, label, icon, perms, undo) {
  const ch = vc(c); const ev = c.g.roles.everyone; await ch.permissionOverwrites.edit(ev, perms, { reason: c.audit() });
  return res(label, `**${ch.name}** updated for @everyone.`, { icon, undo: undo && { label: 'Reverted', fn: () => ch.permissionOverwrites.edit(ev, undo) } });
}

module.exports = {
  name: 'voice', description: 'Voice tools: mute, move, lock, limit',
  commands: [
    C('mute', 'Server-mute a member in voice', [U(), RS()], P.MuteMembers, (c) => one(c, 'Member voice-muted', '🔇', (m, r) => m.voice.setMute(true, r), (m) => m.voice.setMute(false))),
    C('unmute', 'Remove a voice mute', [U(), RS()], P.MuteMembers, (c) => one(c, 'Member voice-unmuted', '🔊', (m, r) => m.voice.setMute(false, r))),
    C('deafen', 'Server-deafen a member in voice', [U(), RS()], P.DeafenMembers, (c) => one(c, 'Member deafened', '🙉', (m, r) => m.voice.setDeaf(true, r), (m) => m.voice.setDeaf(false))),
    C('undeafen', 'Remove a voice deafen', [U(), RS()], P.DeafenMembers, (c) => one(c, 'Member undeafened', '👂', (m, r) => m.voice.setDeaf(false, r))),
    C('disconnect', 'Kick a member out of voice', [U(), RS()], P.MoveMembers, (c) => one(c, 'Member disconnected', '📴', (m, r) => m.voice.disconnect(r))),
    C('move', 'Move a member to another voice channel', [U(), VCH(true), RS()], P.MoveMembers, async (c) => {
      const m = await inVoice(c); const to = c.c('channel'); const from = m.voice.channel; await m.voice.setChannel(to, c.audit());
      return res('Member moved', `**${m.user.username}** → **${to.name}**`, { icon: '➡️', user: m.user, undo: { label: 'Moved back', fn: () => m.voice.setChannel(from) } });
    }),
    C('move-all', 'Move everyone from one voice channel to another', [CH('from', 'Move from', true, VT), CH('to', 'Move to', true, VT)], P.MoveMembers, async (c) => {
      const from = c.c('from'), to = c.c('to'); if (from.id === to.id) throw new UserError('Both channels are the same', 'Pick two different channels.');
      const ms = [...from.members.values()]; if (!ms.length) throw new UserError(`**${from.name}** is empty`, 'Nobody to move.');
      let ok = 0; for (const m of ms) { try { await m.voice.setChannel(to, c.audit()); ok++; } catch { /* skip */ } }
      return res('Everyone moved', `Moved **${ok}** of **${ms.length}** from **${from.name}** to **${to.name}**.`, { icon: '🚚' });
    }),
    C('disconnect-all', 'Disconnect everyone from a voice channel', [VCH(), RS()], P.MoveMembers, (c) => all(c, 'Everyone disconnected', '📴', (m, r) => m.voice.disconnect(r)), { danger: 'This will **disconnect everyone** in the voice channel.' }),
    C('mute-all', 'Mute everyone in a voice channel', [VCH(), RS()], P.MuteMembers, (c) => all(c, 'Everyone muted', '🔇', (m, r) => m.voice.setMute(true, r))),
    C('unmute-all', 'Unmute everyone in a voice channel', [VCH(), RS()], P.MuteMembers, (c) => all(c, 'Everyone unmuted', '🔊', (m, r) => m.voice.setMute(false, r))),
    C('deafen-all', 'Deafen everyone in a voice channel', [VCH(), RS()], P.DeafenMembers, (c) => all(c, 'Everyone deafened', '🙉', (m, r) => m.voice.setDeaf(true, r))),
    C('undeafen-all', 'Undeafen everyone in a voice channel', [VCH(), RS()], P.DeafenMembers, (c) => all(c, 'Everyone undeafened', '👂', (m, r) => m.voice.setDeaf(false, r))),
    C('lock', 'Stop @everyone from joining a voice channel', [VCH(), RS()], P.ManageChannels, (c) => ov(c, 'Voice channel locked', '🔒', { Connect: false }, { Connect: null })),
    C('unlock', 'Let @everyone join a voice channel', [VCH(), RS()], P.ManageChannels, (c) => ov(c, 'Voice channel unlocked', '🔓', { Connect: null })),
    C('hide', 'Hide a voice channel from @everyone', [VCH(), RS()], P.ManageChannels, (c) => ov(c, 'Voice channel hidden', '🙈', { ViewChannel: false }, { ViewChannel: null })),
    C('unhide', 'Show a voice channel again', [VCH(), RS()], P.ManageChannels, (c) => ov(c, 'Voice channel visible', '👀', { ViewChannel: null })),
    C('limit', 'Set the user limit (0 = unlimited)', [I('users', 'Max users (0-99)', true, 0, 99), VCH()], P.ManageChannels, async (c) => {
      const ch = vc(c); const old = ch.userLimit; await ch.setUserLimit(c.n('users'), c.audit());
      return res('User limit set', `**${ch.name}** now allows **${c.n('users') || 'unlimited'}** user(s).`, { icon: '👥', undo: { label: 'Limit restored', fn: () => ch.setUserLimit(old) } });
    }),
    C('rename', 'Rename a voice channel', [S('name', 'New name', true, { max: 100 }), VCH()], P.ManageChannels, async (c) => {
      const ch = vc(c); const old = ch.name; await ch.setName(c.s('name'), c.audit());
      return res('Voice channel renamed', `**${old}** → **${c.s('name')}**`, { icon: '✏️', undo: { label: 'Name restored', fn: () => ch.setName(old) } });
    }),
    C('bitrate', 'Set voice quality in kbps (8-384)', [I('kbps', 'Bitrate in kbps', true, 8, 384), VCH()], P.ManageChannels, async (c) => {
      const ch = vc(c); const old = ch.bitrate; await ch.setBitrate(c.n('kbps') * 1000, c.audit());
      return res('Bitrate set', `**${ch.name}** is now **${c.n('kbps')} kbps**.`, { icon: '🎚️', undo: { label: 'Bitrate restored', fn: () => ch.setBitrate(old) } });
    }),
    C('region', 'Set the voice server region', [S('region', 'Region', true, { choices: REGIONS }), VCH()], P.ManageChannels, async (c) => {
      const ch = vc(c); await ch.setRTCRegion(c.s('region') === 'automatic' ? null : c.s('region'), c.audit());
      return res('Region set', `**${ch.name}** uses **${c.s('region')}**.`, { icon: '🌍' });
    }),
    C('permit', 'Allow one member to join a locked voice channel', [U(), VCH()], P.ManageChannels, async (c) => {
      const ch = vc(c); const u = c.u('user'); await ch.permissionOverwrites.edit(u.id, { Connect: true, ViewChannel: true }, { reason: c.audit() });
      return res('Member permitted', `**${u.username}** can join **${ch.name}**.`, { icon: '🎟️', user: u, undo: { label: 'Permit removed', fn: () => ch.permissionOverwrites.delete(u.id) } });
    }),
    C('ban-from-vc', 'Stop one member from joining a voice channel', [U(), VCH(), RS()], P.ManageChannels, async (c) => {
      const ch = vc(c); const m = await c.m('user'); if (m) checkTarget(c, m, 'block'); const u = c.u('user');
      await ch.permissionOverwrites.edit(u.id, { Connect: false }, { reason: c.audit() }); if (m?.voice.channelId === ch.id) await m.voice.disconnect(c.audit());
      return res('Blocked from voice', `**${u.username}** cannot join **${ch.name}**.`, { icon: '⛔', user: u, undo: { label: 'Block removed', fn: () => ch.permissionOverwrites.delete(u.id) } });
    }),
    C('unban-from-vc', 'Remove a member voice block', [U(), VCH()], P.ManageChannels, async (c) => {
      const ch = vc(c); const u = c.u('user'); await ch.permissionOverwrites.delete(u.id, c.audit());
      return res('Voice block removed', `**${u.username}** can join **${ch.name}** again.`, { icon: '✅', user: u });
    }),
    C('pull', 'Pull a member into your voice channel', [U(), RS()], P.MoveMembers, async (c) => {
      const mine = c.i.member.voice.channel; if (!mine) throw new UserError('You are not in a voice channel', 'Join one first, then pull them.');
      const m = await inVoice(c); const from = m.voice.channel; await m.voice.setChannel(mine, c.audit());
      return res('Member pulled', `**${m.user.username}** → **${mine.name}**`, { icon: '🧲', user: m.user, undo: { label: 'Moved back', fn: () => m.voice.setChannel(from) } });
    }),
    C('who', 'See who is in a voice channel', [VCH()], P.MoveMembers, async (c) => {
      const ch = vc(c); const ms = [...ch.members.values()];
      return res(`In ${ch.name}`, ms.length ? trunc(ms.map((m) => `• ${m.user.username}${m.voice.mute ? ' 🔇' : ''}${m.voice.deaf ? ' 🙉' : ''}`).join('\n'), 3800) : '_Nobody here._', { icon: '👥', color: 0x5b8cff, fields: [['Members', String(ms.length), true], ['Limit', String(ch.userLimit || '∞'), true]] });
    }),
  ],
};
