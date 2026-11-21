const { ChannelType: CT, EmbedBuilder } = require('discord.js');
const { C, S, I, CH } = require('../lib/cmd');
const music = require('../lib/music');
const lavalink = require('../lib/lavalink');
const { E } = require('../lib/emojis');
const { UserError, res, fmt, sleep } = require('../lib/util');

const vcOf = (c) => { const ch = c.c('channel') || c.i.member.voice?.channel; if (!ch) throw new UserError('Join a voice channel first', 'Join a voice channel (or pick one in the channel option) and try again.'); return ch; };
const m = (title, desc, x = {}) => res(title, desc, { icon: '🎵', color: 0x8b5cf6, ...x });

module.exports = {
  name: 'music', description: 'Music: Lavalink tracks, platform links and 24/7 radio',
  commands: [
    C('join', 'Join your voice channel', [CH('channel', 'Voice channel (default: yours)', false, [CT.GuildVoice, CT.GuildStageVoice])], null, async (c) => {
      const ch = vcOf(c); await music.join(c.g, ch.id); return m('Joined', `Connected to **${ch.name}**. Pick a station with the panel or use the music play command.`);
    }),
    C('play', 'Play a track, supported platform link or radio station', [S('station', 'Radio station name', false, { choices: music.STATIONS.map((s) => ({ name: s[1].slice(0, 100), value: s[0] })) }), S('url', 'Direct audio or platform URL', false, { max: 400 }), S('query', 'Song title or platform link (Lavalink)', false, { max: 400 }), CH('channel', 'Voice channel (default: yours)', false, [CT.GuildVoice, CT.GuildStageVoice])], null, async (c) => {
      const ch = vcOf(c);
      const query = c.s('query') || c.s('url');
      if (query && lavalink.enabled()) {
        music.leave(c.g.id);
        const result = await lavalink.play(c.g, ch.id, query);
        return m(result.queued > 1 ? 'Added to queue' : 'Now playing', `**[${result.track.info?.title || 'Unknown track'}](${result.track.info?.uri || 'https://lavalink.dev'})**\nby **${result.track.info?.author || 'Unknown artist'}**\nConnected in **${ch.name}**`, { fields: [['Queue', `${result.queued} track(s) added • ${Math.max(0, result.queued - 1)} waiting`], ['Tip', 'Use `/music skip` and `/music queue` to control playback.']] });
      }
      if (c.s('query')) throw new UserError('Lavalink is not configured yet.', 'The owner must add the Lavalink connection variables to Render. Radio stations still work.');
      let st = c.s('station') ? music.byKey(c.s('station')) : null;
      let station = st ? { name: st[1], url: st[2] } : null;
      if (!station && c.s('url')) { if (!/^https?:\/\//i.test(c.s('url'))) throw new UserError('That is not a link', 'Use a direct audio stream link starting with https://'); station = { name: 'Custom stream', url: c.s('url') }; }
      if (!station) { const first = music.STATIONS[0]; station = { name: first[1], url: first[2] }; }
      await lavalink.leave(c.g.id).catch(() => {});
      await music.play(c.g, ch.id, station);
      return m('Now playing radio', `${E('play')} **${station.name}**\nin **${ch.name}**`, { fields: [['Tip', 'Use `/music twentyfour7` to keep radio running 24/7.']] });
    }),
    C('skip', 'Skip the current Lavalink track', [], null, async (c) => { await lavalink.skip(c.g.id); return m('Skipped', 'Moving to the next track.'); }),
    C('queue', 'Show the Lavalink music queue', [], null, async (c) => {
      const current = lavalink.state(c.g.id), items = lavalink.queue(c.g.id);
      if (!current && !items.length) throw new UserError('The Lavalink queue is empty.', 'Play a song with /music play query:<song name>.');
      const lines = [current ? `**Now playing:** ${current.title} — ${current.author}` : '**Now playing:** —', ...items.map((x) => `${x.position}. ${x.title} — ${x.author}`)];
      return m('Music queue', lines.join('\n'), { fields: [['Waiting', String(items.length)]] });
    }),
    C('stop', 'Stop music playback', [], null, async (c) => {
      if (lavalink.state(c.g.id)) { await lavalink.stop(c.g.id); return m('Stopped', 'Lavalink playback and the queue have been cleared.'); }
      music.stop(c.g.id); return m('Stopped', `${E('stop')} Radio playback stopped.`);
    }),
    C('pause', 'Pause music playback', [], null, async (c) => {
      if (lavalink.state(c.g.id)) { await lavalink.pause(c.g.id, true); return m('Paused', 'Lavalink playback paused.'); }
      music.pause(c.g.id); return m('Paused', `${E('pause')} Radio playback paused.`);
    }),
    C('resume', 'Resume music playback', [], null, async (c) => {
      if (lavalink.state(c.g.id)) { await lavalink.pause(c.g.id, false); return m('Resumed', 'Lavalink playback resumed.'); }
      music.resume(c.g.id); return m('Resumed', `${E('play')} Radio playback resumed.`);
    }),
    C('volume', 'Change the volume (1-100)', [I('level', 'Volume percent', true, 1, 100)], null, async (c) => {
      if (lavalink.state(c.g.id)) { await lavalink.volume(c.g.id, c.n('level')); return m('Volume set', `**${c.n('level')}%**`); }
      music.volume(c.g.id, c.n('level')); return m('Volume set', `${E('vol')} **${c.n('level')}%**\n` + `\`${music.bar(c.n('level') / 100)}\``);
    }),
    C('nowplaying', 'Show what is playing with a live equalizer', [], null, async (c) => {
      const lv = lavalink.state(c.g.id);
      if (lv) return m('Now playing', `**${lv.title}**\nby **${lv.author}**\nQueue: ${lv.queue} • ${lv.paused ? 'Paused' : 'Playing'}`, { links: lv.uri ? [['Open source', lv.uri]] : [] });
      for (let k = 0; k < 8; k++) { const p = music.panel(c.g); await c.i.editReply(p); if (!music.state(c.g.id)) break; await sleep(3000); }
      return { handled: true };
    }, { custom: true }),
    C('stations', 'List all radio stations', [], null, async () => m('Radio stations', music.STATIONS.map((s) => `🎶 \`${s[0]}\` — ${s[1]}`).join('\n') + '\n\nPlay one with `/music play station:<name>`', { icon: '📻' })),
    C('panel', 'Post an interactive radio control panel', [], null, async (c) => {
      const msg = await c.ch.send(music.panel(c.g)); return m('Panel posted', 'Use the buttons and the station menu.', { links: [['Open panel', msg.url]] });
    }),
    C('twentyfour7', 'Keep the radio running 24/7 (auto-rejoin)', [S('mode', 'on or off', true, { choices: ['on', 'off'] })], 32n, async (c) => {
      music.set247(c.g, c.s('mode') === 'on'); return m(`24/7 ${c.s('mode')}`, c.s('mode') === 'on' ? `${E('bolt')} I will stay in the voice channel and rejoin automatically.` : 'Auto-rejoin is off.');
    }),
    C('leave', 'Leave the voice channel and clear playback', [], null, async (c) => {
      await lavalink.leave(c.g.id).catch(() => {}); music.leave(c.g.id); return m('Left', 'Disconnected from voice.');
    }),
    C('status', 'Show music and Lavalink connection status', [], null, async (c) => {
      const st = music.state(c.g.id), lv = lavalink.state(c.g.id), node = lavalink.status();
      return m('Music status', null, { fields: [['Playing', lv ? lv.title : st?.station?.name || 'nothing', true], ['Backend', lv ? 'Lavalink' : st ? 'Radio' : 'Idle', true], ['Lavalink node', node.connected ? 'Connected' : node.configured ? 'Connecting / offline' : 'Not configured', true], ['Channel', st ? `<#${st.channelId}>` : c.g.members.me?.voice?.channelId ? `<#${c.g.members.me.voice.channelId}>` : '—', true], ['24/7 radio', music.is247(c.g.id) ? 'on' : 'off', true], ['Last Lavalink error', node.error || 'none']] });
    }),
  ],
};
