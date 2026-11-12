const { ChannelType: CT, EmbedBuilder } = require('discord.js');
const { C, S, I, CH } = require('../lib/cmd');
const music = require('../lib/music');
const { E } = require('../lib/emojis');
const { UserError, res, fmt, sleep } = require('../lib/util');

const vcOf = (c) => { const ch = c.c('channel') || c.i.member.voice?.channel; if (!ch) throw new UserError('Join a voice channel first', 'Join a voice channel (or pick one in the channel option) and try again.'); return ch; };
const m = (title, desc, x = {}) => res(title, desc, { icon: '🎵', color: 0x8b5cf6, ...x });

module.exports = {
  name: 'music', description: 'Music: 24/7 radio and live streams',
  commands: [
    C('join', 'Join your voice channel', [CH('channel', 'Voice channel (default: yours)', false, [CT.GuildVoice, CT.GuildStageVoice])], null, async (c) => {
      const ch = vcOf(c); await music.join(c.g, ch.id); return m('Joined', `Connected to **${ch.name}**. Pick a station with the panel or \`/music play\`.`);
    }),
    C('play', 'Play a radio station or a direct audio link', [S('station', 'Station name', false, { choices: music.STATIONS.map((s) => ({ name: s[1].slice(0, 100), value: s[0] })) }), S('url', 'Direct audio link (https://...)', false, { max: 400 }), CH('channel', 'Voice channel (default: yours)', false, [CT.GuildVoice, CT.GuildStageVoice])], null, async (c) => {
      const ch = vcOf(c); let st = c.s('station') ? music.byKey(c.s('station')) : null; let station = st ? { name: st[1], url: st[2] } : null;
      if (!station && c.s('url')) { if (!/^https?:\/\//i.test(c.s('url'))) throw new UserError('That is not a link', 'Use a direct audio stream link starting with https://'); station = { name: 'Custom stream', url: c.s('url') }; }
      if (!station) { const f = music.STATIONS[0]; station = { name: f[1], url: f[2] }; }
      await music.play(c.g, ch.id, station);
      return m('Now playing', `${E('play')} **${station.name}**\nin **${ch.name}**`, { fields: [['Tip', 'Use `/music twentyfour7` to keep it running 24/7']] });
    }),
    C('stop', 'Stop the music (stays in the channel)', [], null, async (c) => { music.stop(c.g.id); return m('Stopped', `${E('stop')} Music stopped.`); }),
    C('pause', 'Pause the music', [], null, async (c) => { music.pause(c.g.id); return m('Paused', `${E('pause')} Music paused.`); }),
    C('resume', 'Resume the music', [], null, async (c) => { music.resume(c.g.id); return m('Resumed', `${E('play')} Music resumed.`); }),
    C('volume', 'Change the volume (1-100)', [I('level', 'Volume percent', true, 1, 100)], null, async (c) => { music.volume(c.g.id, c.n('level')); return m('Volume set', `${E('vol')} **${c.n('level')}%**\n\`${music.bar(c.n('level') / 100)}\``); }),
    C('nowplaying', 'Show what is playing with a live equalizer', [], null, async (c) => {
      for (let k = 0; k < 8; k++) { const p = music.panel(c.g); await c.i.editReply(p); if (!music.state(c.g.id)) break; await sleep(3000); }
      return { handled: true };
    }, { custom: true }),
    C('stations', 'List all radio stations', [], null, async () => m('Radio stations', music.STATIONS.map((s) => `🎶 \`${s[0]}\` — ${s[1]}`).join('\n') + '\n\nPlay one with `/music play station:<name>`', { icon: '📻' })),
    C('panel', 'Post an interactive music control panel', [], null, async (c) => {
      const msg = await c.ch.send(music.panel(c.g)); return m('Panel posted', 'Use the buttons and the station menu.', { links: [['Open panel', msg.url]] });
    }),
    C('twentyfour7', 'Keep the music running 24/7 (auto-rejoin)', [S('mode', 'on or off', true, { choices: ['on', 'off'] })], 32n, async (c) => {
      music.set247(c.g, c.s('mode') === 'on'); return m(`24/7 ${c.s('mode')}`, c.s('mode') === 'on' ? `${E('bolt')} I will stay in the voice channel and rejoin automatically.` : 'Auto-rejoin is off.');
    }),
    C('leave', 'Leave the voice channel (also turns 24/7 off)', [], null, async (c) => { music.leave(c.g.id); return m('Left', 'Disconnected from voice.'); }),
    C('status', 'Show music status and the last error', [], null, async (c) => {
      const st = music.state(c.g.id);
      return m('Music status', null, { fields: [['Playing', st?.station ? st.station.name : 'nothing', true], ['Channel', st ? `<#${st.channelId}>` : '—', true], ['24/7', music.is247(c.g.id) ? 'on' : 'off', true], ['Last error', music.lastError() || 'none']] });
    }),
  ],
};
