// 24/7 radio and stream player. Uses direct audio streams (internet radio or any direct audio link).
const { spawn } = require('child_process');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const db = require('./db');
const cv2 = require('./cv2');
const { E } = require('./emojis');
const { UserError, fmt } = require('./util');

const STATIONS = [
  ['groovesalad', 'Groove Salad — chill beats', 'https://ice1.somafm.com/groovesalad-128-mp3'],
  ['lush', 'Lush — soft vocals', 'https://ice1.somafm.com/lush-128-mp3'],
  ['deepspace', 'Deep Space One — ambient', 'https://ice1.somafm.com/deepspaceone-128-mp3'],
  ['dronezone', 'Drone Zone — calm focus', 'https://ice1.somafm.com/dronezone-128-mp3'],
  ['beatblender', 'Beat Blender — deep house', 'https://ice1.somafm.com/beatblender-128-mp3'],
  ['fluid', 'Fluid — instrumental hip hop', 'https://ice1.somafm.com/fluid-128-mp3'],
  ['illstreet', 'Illinois Street Lounge', 'https://ice1.somafm.com/illstreet-128-mp3'],
  ['indiepop', 'Indie Pop Rocks', 'https://ice1.somafm.com/indiepop-128-mp3'],
  ['defcon', 'DEF CON Radio — hacker mix', 'https://ice1.somafm.com/defcon-128-mp3'],
  ['spacestation', 'Space Station Soma', 'https://ice1.somafm.com/spacestation-128-mp3'],
  ['paradise', 'Radio Paradise — main mix', 'https://stream.radioparadise.com/mp3-128'],
  ['paradise-mellow', 'Radio Paradise — mellow', 'https://stream.radioparadise.com/mellow-128'],
];
const byKey = (k) => STATIONS.find((s) => s[0] === k);
const S = new Map(); let V = null; let lastError = '';
const G = () => db.g('__global');
const bar = (p, n = 10) => '▰'.repeat(Math.round(p * n)) + '▱'.repeat(n - Math.round(p * n));
const eq = () => Array.from({ length: 14 }, () => '▁▂▃▄▅▆▇█'[Math.floor(Math.random() * 8)]).join('');

function libs() {
  if (V) return V;
  try { V = require('@discordjs/voice'); } catch { throw new UserError('Music libraries are not installed on the bot.', 'The owner must check the Render build log for @discordjs/voice, opusscript and ffmpeg-static.'); }
  try { const p = require('ffmpeg-static'); if (p) process.env.FFMPEG_PATH = p; } catch { /* use system ffmpeg */ }
  return V;
}
const ffmpeg = () => process.env.FFMPEG_PATH || 'ffmpeg';
function kill(st) { try { st.proc?.kill('SIGKILL'); } catch { /* ignore */ } st.proc = null; }

async function join(guild, channelId) {
  const v = libs(); let st = S.get(guild.id);
  if (st && st.channelId === channelId && st.conn.state.status !== v.VoiceConnectionStatus.Destroyed) return st;
  if (st) leave(guild.id, false);
  const conn = v.joinVoiceChannel({ channelId, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
  try { await v.entersState(conn, v.VoiceConnectionStatus.Ready, 25000); } catch { try { conn.destroy(); } catch { /* ignore */ } throw new UserError('I could not join that voice channel.', 'Check that I have Connect and Speak permission there.'); }
  const player = v.createAudioPlayer({ behaviors: { noSubscriber: v.NoSubscriberBehavior.Play } }); conn.subscribe(player);
  st = { conn, player, channelId, guildId: guild.id, volume: 0.5, station: null, since: Date.now(), stopped: false };
  S.set(guild.id, st);
  conn.on('stateChange', async (o, n) => {
    if (n.status !== v.VoiceConnectionStatus.Disconnected) return;
    try { await Promise.race([v.entersState(conn, v.VoiceConnectionStatus.Signalling, 5000), v.entersState(conn, v.VoiceConnectionStatus.Connecting, 5000)]); }
    catch { try { if (conn.state.status !== v.VoiceConnectionStatus.Destroyed) conn.destroy(); } catch { /* ignore */ } if (S.get(guild.id) === st) { kill(st); S.delete(guild.id); } }
  });
  player.on('stateChange', (o, n) => { if (n.status === v.AudioPlayerStatus.Idle && o.status !== v.AudioPlayerStatus.Idle && st.station && !st.stopped) setTimeout(() => { if (S.get(guild.id) === st && !st.stopped) start(st); }, 3000); });
  player.on('error', (e) => { lastError = e.message; });
  return st;
}
function start(st) {
  const v = libs(); if (!st.station) return; kill(st);
  const args = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', st.station.url, '-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];
  const proc = spawn(ffmpeg(), args, { stdio: ['ignore', 'pipe', 'ignore'] });
  proc.on('error', (e) => { lastError = `ffmpeg: ${e.message}`; });
  st.proc = proc; st.stopped = false;
  const res = v.createAudioResource(proc.stdout, { inputType: v.StreamType.Raw, inlineVolume: true }); res.volume?.setVolume(st.volume); st.resource = res; st.player.play(res);
}
async function play(guild, channelId, station) {
  const st = await join(guild, channelId); st.station = station; start(st);
  const cfg = (G().config.m247 ||= {}); if (cfg[guild.id]) { cfg[guild.id].station = station; cfg[guild.id].channelId = channelId; db.save(); }
  return st;
}
function leave(gid, clear = true) {
  const st = S.get(gid); if (st) { st.stopped = true; kill(st); try { st.player.stop(true); st.conn.destroy(); } catch { /* ignore */ } S.delete(gid); }
  if (clear) { const cfg = G().config.m247; if (cfg?.[gid]) { delete cfg[gid]; db.save(); } }
}
const need = (gid) => { const st = S.get(gid); if (!st) throw new UserError('Nothing is playing', 'Start music with /music play or the panel.'); return st; };
function pause(gid) { const st = need(gid); st.player.pause(); return st; }
function resume(gid) { const st = need(gid); st.player.unpause(); return st; }
function stop(gid) { const st = need(gid); st.stopped = true; kill(st); st.player.stop(true); return st; }
function volume(gid, pct) { const st = need(gid); st.volume = Math.max(0.01, Math.min(1, pct / 100)); st.resource?.volume?.setVolume(st.volume); const c = G().config.m247?.[gid]; if (c) { c.volume = st.volume; db.save(); } return st; }
function set247(guild, on) {
  const cfg = (G().config.m247 ||= {});
  if (!on) { delete cfg[guild.id]; db.save(); return; }
  const st = need(guild.id); if (!st.station) throw new UserError('Play a station first', 'Start a station, then turn 24/7 on.');
  cfg[guild.id] = { channelId: st.channelId, station: st.station, volume: st.volume }; db.save();
}
const state = (gid) => S.get(gid);
const is247 = (gid) => !!G().config.m247?.[gid];

function panel(guild) {
  const st = S.get(guild.id); const v = V; const paused = st && v && st.player.state.status === v.AudioPlayerStatus.Paused;
  const e = new EmbedBuilder().setColor(0x8b5cf6).setTitle(`${E('note')} Uranium Music`).setFooter({ text: '24/7 radio • Uranium' }).setTimestamp();
  if (st?.station) {
    e.setDescription(`${paused ? E('pause') : E('play')} **${st.station.name}**\n\`${paused ? '▁▁▁▁▁▁▁▁▁▁▁▁▁▁' : eq()}\``).addFields(
      { name: 'Channel', value: `<#${st.channelId}>`, inline: true }, { name: 'Volume', value: `${Math.round(st.volume * 100)}%\n\`${bar(st.volume)}\``, inline: true },
      { name: '24/7', value: is247(guild.id) ? `${E('bolt')} On` : 'Off', inline: true }, { name: 'Connected for', value: fmt(Date.now() - st.since), inline: true });
  } else e.setDescription(`Nothing is playing.\nJoin a voice channel and pick a station below ${E('radio')}`);
  const b = (id, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`mu:${id}`).setEmoji(emoji).setStyle(style);
  const row1 = new ActionRowBuilder().addComponents(b('pp', paused ? E('play') : E('pause'), ButtonStyle.Primary), b('stop', E('stop'), ButtonStyle.Danger), b('vd', '🔉'), b('vu', E('vol')), b('247', E('bolt'), is247(guild.id) ? ButtonStyle.Success : ButtonStyle.Secondary));
  const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('mu:st').setPlaceholder('📻 Choose a station…').addOptions(STATIONS.map((s) => ({ label: s[1].slice(0, 100), value: s[0], emoji: '🎶', default: st?.station?.url === s[2] }))));
  const data = e.toJSON();
  const parts = [`# ${E('note')} Uranium Music`, data.description || ''];
  for (const field of data.fields || []) parts.push(`**${field.name}**\\n${field.value}`);
  parts.push('-# 24/7 radio • Uranium');
  return cv2.message([cv2.text(parts.join('\\n\\n')), cv2.separator(), cv2.row(row1.toJSON().components), cv2.row(row2.toJSON().components)], 0x8b5cf6);
}
async function onComponent(i) {
  const act = i.customId.split(':')[1]; const st = S.get(i.guildId); const m = i.member; const admin = m.permissions.has('ManageGuild');
  const deny = (t) => i.reply(cv2.ephemeralMessage([cv2.text(`# ${E('warn')} Music control\\n${t}`)], 0x8b5cf6));
  try {
    if (act === 'st') {
      const s = byKey(i.values[0]); const vc = m.voice.channelId; if (!vc) return deny('Join a voice channel first, then pick a station.');
      if (st && st.channelId !== vc && !admin) return deny('Join my voice channel first.');
      await i.deferUpdate(); await play(i.guild, vc, { name: s[1], url: s[2] }); return i.editReply(panel(i.guild));
    }
    if (!st) return deny('Nothing is playing. Pick a station from the menu.');
    if (st.channelId !== m.voice.channelId && !admin) return deny('Join my voice channel first.');
    if (act === 'pp') { const v = libs(); if (st.player.state.status === v.AudioPlayerStatus.Paused) resume(i.guildId); else pause(i.guildId); }
    else if (act === 'stop') stop(i.guildId);
    else if (act === 'vd') volume(i.guildId, st.volume * 100 - 10);
    else if (act === 'vu') volume(i.guildId, st.volume * 100 + 10);
    else if (act === '247') { if (!admin) return deny('Only members with Manage Server can toggle 24/7.'); set247(i.guild, !is247(i.guildId)); }
    return i.update(panel(i.guild));
  } catch (e) { const t = e instanceof UserError ? `${e.message} ${e.hint || ''}` : `Music error: ${e.message}`; return i.replied || i.deferred ? i.followUp(cv2.ephemeralMessage([cv2.text(`# ${E('warn')} Music error\\n${t}`)], 0x8b5cf6)) : deny(t); }
}
async function watchdog(client) {
  let v; try { v = libs(); } catch { return; }
  for (const [gid, c] of Object.entries(G().config.m247 || {})) {
    try {
      const g = client.guilds.cache.get(gid); if (!g) continue; const st = S.get(gid);
      if (!st || st.conn.state.status === v.VoiceConnectionStatus.Destroyed) { const s2 = await join(g, c.channelId); s2.station = c.station; s2.volume = c.volume || 0.5; start(s2); }
      else if (st.station && !st.stopped && st.player.state.status === v.AudioPlayerStatus.Idle) start(st);
    } catch (e) { lastError = e.message; }
  }
}
const startWatch = (client) => { setTimeout(() => watchdog(client), 8000); setInterval(() => watchdog(client), 60000).unref(); };
module.exports = { STATIONS, byKey, join, play, leave, pause, resume, stop, volume, set247, state, is247, panel, onComponent, startWatch, eq, bar, lastError: () => lastError };
