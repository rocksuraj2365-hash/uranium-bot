// Lavalink v4 music backend. Radio playback remains available as a fallback.
const { EventEmitter } = require('node:events');

let shoukaku = null;
let clientRef = null;
let lastError = '';
const queues = new Map();
const active = new Map();

const enabled = () => Boolean(process.env.LAVALINK_HOST && process.env.LAVALINK_PASSWORD);
const cleanHost = (value) => String(value || '').replace(/^wss?:\/\//i, '').replace(/\/$/, '');

function init(client) {
  clientRef = client;
  if (!enabled()) {
    console.log('[lavalink] Not configured; existing radio backend remains active.');
    return false;
  }
  try {
    const { Shoukaku, Connectors } = require('shoukaku');
    const host = cleanHost(process.env.LAVALINK_HOST);
    const secure = String(process.env.LAVALINK_SECURE || 'true').toLowerCase() === 'true';
    const port = Number(process.env.LAVALINK_PORT || (secure ? 443 : 2333));
    shoukaku = new Shoukaku(
      new Connectors.DiscordJS(client),
      [{ name: 'uranium-primary', url: host + ':' + port, auth: process.env.LAVALINK_PASSWORD, secure }],
      { resume: true, resumeTimeout: 60, reconnectTries: 5, reconnectInterval: 5 }
    );
    shoukaku.on('ready', (name) => { lastError = ''; console.log('[lavalink] Node ready:', name); });
    shoukaku.on('error', (name, error) => { lastError = String(error?.message || error).slice(0, 240); console.error('[lavalink] Node error:', name, lastError); });
    shoukaku.on('close', (name, code, reason) => console.warn('[lavalink] Node closed:', name, code, String(reason || '').slice(0, 120)));
    shoukaku.on('disconnect', (name, players, moved) => console.warn('[lavalink] Node disconnected:', name, players?.length || 0, Boolean(moved)));
    return true;
  } catch (error) {
    lastError = String(error?.message || error).slice(0, 240);
    console.error('[lavalink] Could not initialize:', lastError);
    return false;
  }
}

function requireNode() {
  if (!shoukaku) throw new Error(enabled()
    ? 'Lavalink is configured but its client did not initialize. Check the bot startup log and Shoukaku dependency.'
    : 'Lavalink is not configured yet. Add LAVALINK_HOST, LAVALINK_PORT, LAVALINK_PASSWORD and LAVALINK_SECURE to the bot service.');
  const node = shoukaku.options.nodeResolver(shoukaku.nodes);
  if (!node || node.state !== 2) throw new Error('Lavalink node is not connected yet. Check the Lavalink service URL, port and matching password.');
  return node;
}

async function getPlayer(guild, channelId) {
  requireNode();
  const existing = shoukaku.players.get(guild.id);
  const currentChannel = shoukaku.connections.get(guild.id)?.channelId;
  if (existing && currentChannel === channelId) return existing;
  if (existing) await shoukaku.leaveVoiceChannel(guild.id).catch(() => {});
  return shoukaku.joinVoiceChannel({ guildId: guild.id, channelId, shardId: guild.shardId || 0, deaf: true });
}

function trackTitle(track) {
  return String(track?.info?.title || track?.info?.identifier || 'Unknown track').slice(0, 180);
}
function trackAuthor(track) {
  return String(track?.info?.author || 'Unknown artist').slice(0, 100);
}
function isUrl(value) { return /^https?:\/\//i.test(String(value || '')); }
function sourceQuery(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Enter a song name or a supported music link.');
  if (isUrl(q)) return q;
  if (/^(spsearch|amsearch|dzsearch|scsearch|ytsearch):/i.test(q)) return q;
  return 'ytsearch:' + q;
}

async function resolve(query, player) {
  const result = await player.node.rest.resolve(sourceQuery(query));
  if (!result || !Array.isArray(result.tracks) || !result.tracks.length) {
    if (result?.loadType === 'error') throw new Error(result.data?.message || 'The music source rejected this request.');
    throw new Error('No playable tracks were found. Try a different title or a supported public link.');
  }
  return result.tracks;
}

async function startNext(guildId) {
  const list = queues.get(guildId) || [];
  const player = shoukaku?.players.get(guildId);
  if (!player) { active.delete(guildId); return null; }
  const next = list.shift();
  queues.set(guildId, list);
  if (!next) { active.delete(guildId); return null; }
  active.set(guildId, next);
  try {
    await player.playTrack({ track: { encoded: next.encoded } });
    return next;
  } catch (error) {
    lastError = String(error?.message || error).slice(0, 240);
    return startNext(guildId);
  }
}

function attachPlayer(player) {
  if (player.__uraniumQueueEvents) return;
  Object.defineProperty(player, '__uraniumQueueEvents', { value: true });
  player.on('end', (event) => {
    if (event?.reason === 'replaced' || event?.reason === 'stopped') return;
    void startNext(player.guildId).catch((error) => { lastError = String(error?.message || error); });
  });
  player.on('exception', (event) => { lastError = String(event?.exception?.message || event?.message || 'Track exception').slice(0, 240); });
  player.on('stuck', () => { lastError = 'A track became stuck; moving to the next track.'; void startNext(player.guildId); });
  player.on('closed', () => { lastError = 'Lavalink player connection closed.'; });
}

async function play(guild, channelId, query) {
  const player = await getPlayer(guild, channelId);
  attachPlayer(player);
  const tracks = await resolve(query, player);
  const list = queues.get(guild.id) || [];
  const current = active.get(guild.id);
  const first = tracks.shift();
  if (!current) {
    active.set(guild.id, first);
    await player.playTrack({ track: { encoded: first.encoded } });
  } else {
    list.push(first);
  }
  for (const track of tracks.slice(0, 99)) list.push(track);
  queues.set(guild.id, list);
  return { track: first, added: tracks.length + 1, queued: list.length };
}

async function skip(guildId) {
  const player = shoukaku?.players.get(guildId);
  if (!player) throw new Error('Nothing is playing through Lavalink.');
  await player.stopTrack();
}
async function stop(guildId) {
  queues.set(guildId, []);
  active.delete(guildId);
  const player = shoukaku?.players.get(guildId);
  if (player) await player.stopTrack();
}
async function pause(guildId, paused = true) {
  const player = shoukaku?.players.get(guildId);
  if (!player) throw new Error('Nothing is playing through Lavalink.');
  await player.setPaused(paused);
}
async function volume(guildId, percent) {
  const player = shoukaku?.players.get(guildId);
  if (!player) throw new Error('Nothing is playing through Lavalink.');
  await player.setGlobalVolume(Math.max(0, Math.min(100, Number(percent))));
}
async function leave(guildId) {
  queues.set(guildId, []);
  active.delete(guildId);
  if (shoukaku?.players.has(guildId)) await shoukaku.leaveVoiceChannel(guildId);
}
function state(guildId) {
  const track = active.get(guildId);
  if (!track) return null;
  return { title: trackTitle(track), author: trackAuthor(track), uri: track.info?.uri || null, queue: (queues.get(guildId) || []).length, paused: Boolean(shoukaku?.players.get(guildId)?.paused) };
}
function queue(guildId) {
  return (queues.get(guildId) || []).slice(0, 10).map((track, index) => ({ position: index + 1, title: trackTitle(track), author: trackAuthor(track) }));
}
function status() {
  const node = shoukaku ? [...shoukaku.nodes.values()][0] : null;
  return { configured: enabled(), initialized: Boolean(shoukaku), connected: Boolean(node && node.state === 2), error: lastError };
}

module.exports = { init, enabled, play, skip, stop, pause, volume, leave, state, queue, status };
