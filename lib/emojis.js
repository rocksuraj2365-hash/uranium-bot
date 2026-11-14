// Uranium icon system: Tabler open-source SVGs delivered through Iconify.
// Icon source: https://icon-sets.iconify.design/tabler/
// Iconify API docs: https://iconify.design/docs/api/svg/
// Tabler icons are MIT-licensed. No emoji characters or original Uranium mascot artwork.
const ICONS = {
  atom: 'atom', mod: 'shield-check', fortress: 'castle', raid: 'alarm-triangle',
  mute: 'mic-off', unmute: 'mic', report: 'flag', verify: 'badge-check',
  case: 'clipboard-list', fox: 'paw', fox_angry: 'alert-circle',
  fox_sleep: 'moon', fox_heart: 'heart', skull: 'skull',
  check: 'check', cross: 'x', warn: 'alert-triangle', shield: 'shield',
  play: 'player-play', pause: 'player-pause', stop: 'player-stop',
  vol: 'volume-2', note: 'music', bolt: 'bolt', radio: 'radio',
  crown: 'crown', ai: 'sparkles', member: 'user-round', message: 'message-circle',
  channel: 'hash', role: 'tag', voice: 'headphones', server: 'server',
  automod: 'shield-check', info: 'info-circle', premium: 'gem',
  license: 'key', utility: 'tool', community: 'users', fun: 'gamepad-2',
  servertools: 'settings', support: 'headset', template: 'layout-template',
  security: 'shield-lock', ban: 'ban', kick: 'log-out', timeout: 'clock',
  lock: 'lock', unlock: 'lock-open', purge: 'broom', settings: 'settings',
  search: 'search', home: 'home', page: 'file-text', undo: 'undo-2',
  dismiss: 'x-circle', warning: 'alert-octagon', unban: 'shield-check',
  softban: 'user-minus', tempban: 'calendar-clock', massban: 'users',
  masskick: 'user-x', purgeuser: 'user-round-x', purgebots: 'bot',
  purgeimages: 'image-off', purgefiles: 'file-x', lockdown: 'lock-keyhole',
  slowmode: 'hourglass', deafen: 'volume-x', undeafen: 'volume-2',
  nick: 'user-pen', watchlist: 'eye', notes: 'notebook-pen', cases: 'files',
  modlog: 'scroll-text', antiraid: 'shield-alert', spam: 'message-square-warning',
  mention: 'at-sign', phishing: 'fish', scam: 'badge-alert', links: 'link',
  invite: 'mail-plus', captcha: 'scan-face', quarantine: 'shield-ban',
  audit: 'clipboard-check', incident: 'siren', alert: 'bell-ring',
  firewall: 'shield-half', permissions: 'key-round', rolelock: 'lock-keyhole',
  members: 'users-round', welcome: 'handshake', goodbye: 'door-open',
  channels: 'messages-square', roles: 'tags', reaction: 'smile',
  poll: 'chart-no-axes-column', giveaway: 'gift', ticket: 'ticket',
  tickets: 'tickets', suggestion: 'lightbulb', starboard: 'star',
  level: 'chart-line', rank: 'medal', leaderboard: 'trophy',
  profile: 'id-card', help: 'circle-help', config: 'sliders-horizontal',
  database: 'database', backup: 'cloud-download', restore: 'history',
  schedule: 'calendar-clock', reminder: 'bell', timer: 'timer',
  stats: 'chart-no-axes-combined', ping: 'activity', uptime: 'heart-pulse',
  latency: 'gauge', bot: 'bot', dashboard: 'layout-dashboard',
  docs: 'book-open', logs: 'scroll-text', foxangry: 'paw-print',
  foxsleep: 'moon-star', foxheart: 'heart-handshake', mascot: 'cat',
  music: 'music-2', aiassistant: 'brain-circuit'
};

// Fallbacks are plain text symbols, never pictographic emoji.
const FALLBACK = Object.fromEntries(Object.keys(ICONS).map((key) => [key, '◆']));
const map = Object.create(null);
const E = (name) => map[name] || FALLBACK[name] || '◆';

const API = 'https://api.iconify.design/';
const COLOR = '%23c4a1ff';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Icons are pre-rendered into lib/emoji-icons.js. Iconify is only a fallback for names that are not embedded yet.
// Many slugs come from Lucide, so a 404 in Tabler falls through to Lucide.
const svgCache = new Map();

async function loadSvg(slug) {
  if (svgCache.has(slug)) return svgCache.get(slug);
  let lastError = new Error(`Iconify unavailable for ${slug}`);
  for (const set of ['tabler', 'lucide']) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`${API}${set}/${encodeURIComponent(slug)}.svg?color=${COLOR}&width=128&height=128`, {
          signal: AbortSignal.timeout(12000),
          headers: { 'User-Agent': 'UraniumDiscordBot/3.0 icon-sync' }
        });
        if (response.status === 404) { lastError = new Error(`Icon ${slug} was not found in ${set}`); break; }
        if (!response.ok) {
          lastError = new Error(`Iconify returned HTTP ${response.status} for ${slug}`);
          await delay(500 * (attempt + 1));
          continue;
        }
        const svg = await response.text();
        if (!svg.includes('<svg') || svg.length > 50000) { lastError = new Error(`Invalid SVG for ${slug}`); break; }
        svgCache.set(slug, svg);
        return svg;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError;
}

function pngFor(name) {
  let embedded = {};
  try { embedded = require('./emoji-icons'); } catch { /* optional */ }
  return embedded[name] ? Buffer.from(embedded[name], 'base64') : null;
}

// Reuses the ux_* emojis already uploaded to the application and only creates the missing ones,
// so a restart never re-downloads or deletes the whole pack.
async function ensureTabler(client) {
  try {
    const names = Object.keys(ICONS);
    const existing = await client.application.emojis.fetch();
    const have = new Map();
    for (const emoji of existing.values()) if (emoji.name.startsWith('ux_')) have.set(emoji.name.slice(3), emoji);
    const missing = [];
    for (const name of names) {
      const found = have.get(name);
      if (found) map[name] = `<${found.animated ? 'a' : ''}:${found.name}:${found.id}>`;
      else missing.push(name);
    }
    console.log(`[icons] ${names.length - missing.length} icons reused, ${missing.length} to create.`);
    let Resvg = null;
    let ready = 0;
    let failed = 0;
    let streak = 0;
    for (const name of missing) {
      try {
        let png = pngFor(name);
        if (!png) {
          if (!Resvg) ({ Resvg } = require('@resvg/resvg-js'));
          const svg = await loadSvg(ICONS[name]);
          png = new Resvg(svg, { fitTo: { mode: 'width', value: 128 }, font: { loadSystemFonts: false } }).render().asPng();
        }
        const emoji = await client.application.emojis.create({ attachment: png, name: `ux_${name}` });
        map[name] = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
        ready += 1;
        streak = 0;
        if (ready % 20 === 0) console.log(`[icons] Created ${ready}/${missing.length}`);
      } catch (error) {
        failed += 1;
        streak += 1;
        console.warn(`[icons] Could not create ${name} (${ICONS[name]}): ${error.message}`);
        if (streak >= 6) { console.warn('[icons] Too many consecutive failures; the rest will be retried on the next start.'); break; }
      }
    }
    console.log(`[icons] Icon pack ready: ${ready} created, ${failed} failed.`);
  } catch (error) {
    console.warn('[icons] Icon sync did not complete:', error.message);
  }
}

// ---- Community pack (lib/emoji-pack.js) ----
// Uploaded once as application emojis named up_<name> (not touched by the ux_ cleanup above),
// then reused on later boots. Exposed through E('pk_<name>'); E() returns the plain fallback until ready.
async function ensurePack(client) {
  let pack;
  try { pack = require('./emoji-pack'); } catch { return; }
  try {
    const existing = await client.application.emojis.fetch();
    const byName = new Map([...existing.values()].map((emoji) => [emoji.name, emoji]));
    let created = 0; let reused = 0; let failed = 0;
    for (const [name, item] of Object.entries(pack)) {
      const full = `up_${name}`;
      const found = byName.get(full);
      if (found) {
        map[`pk_${name}`] = `<${found.animated ? 'a' : ''}:${found.name}:${found.id}>`;
        reused += 1;
        continue;
      }
      try {
        const emoji = await client.application.emojis.create({ attachment: Buffer.from(item.data, 'base64'), name: full });
        map[`pk_${name}`] = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
        created += 1;
      } catch (error) {
        failed += 1;
        console.warn(`[icons] Pack upload failed for ${full}: ${error.message}`);
        await delay(1500);
      }
    }
    console.log(`[icons] Community pack synced: ${created} uploaded, ${reused} reused, ${failed} failed.`);
  } catch (error) {
    console.warn('[icons] Community pack sync did not complete:', error.message);
  }
}

async function ensure(client) {
  await ensurePack(client);
  await ensureTabler(client);
}

module.exports = { E, ensure, FALLBACK };
