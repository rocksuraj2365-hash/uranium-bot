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
  music: 'music-2', aiassistant: 'brain-circuit', database: 'database'
};

// Fallbacks are plain text symbols, never pictographic emoji.
const FALLBACK = Object.fromEntries(Object.keys(ICONS).map((key) => [key, '◆']));
const map = Object.create(null);
const E = (name) => map[name] || FALLBACK[name] || '◆';

const API = 'https://api.iconify.design/tabler/';
const COLOR = '%23c4a1ff';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadSvg(slug) {
  const response = await fetch(`${API}${encodeURIComponent(slug)}.svg?color=${COLOR}&width=128&height=128`, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'UraniumDiscordBot/3.0 icon-sync' }
  });
  if (!response.ok) throw new Error(`Iconify returned HTTP ${response.status} for ${slug}`);
  const svg = await response.text();
  if (!svg.includes('<svg') || svg.length > 50000) throw new Error(`Invalid SVG for ${slug}`);
  return svg;
}

async function ensure(client) {
  let Resvg;
  try {
    ({ Resvg } = require('@resvg/resvg-js'));
    const names = Object.entries(ICONS);
    const rendered = new Map();
    // Download and render the entire replacement pack before touching existing assets.
    for (const [name, slug] of names) {
      try {
        const svg = await loadSvg(slug);
        const png = new Resvg(svg, {
          fitTo: { mode: 'width', value: 128 },
          font: { loadSystemFonts: false }
        }).render().asPng();
        rendered.set(name, png);
      } catch (error) {
        console.warn(`[icons] Could not prepare ${name} (${slug}): ${error.message}`);
      }
    }
    if (rendered.size < 45) {
      throw new Error(`Only ${rendered.size}/${names.length} external icons loaded; preserving existing icons.`);
    }

    const existing = await client.application.emojis.fetch();
    // Remove only the previous Uranium-managed pack, not unrelated application emojis.
    for (const emoji of existing.values()) {
      if (emoji.name.startsWith('ux_')) {
        await client.application.emojis.delete(emoji.id).catch((error) => {
          console.warn(`[icons] Could not replace ${emoji.name}: ${error.message}`);
        });
      }
    }

    let ready = 0;
    let failed = 0;
    for (const [name, png] of rendered) {
      try {
        const emoji = await client.application.emojis.create({
          attachment: png,
          name: `ux_${name}`
        });
        map[name] = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
        ready += 1;
        if (ready % 10 === 0) console.log(`[icons] Uploaded ${ready}/${rendered.size}`);
      } catch (error) {
        failed += 1;
        console.warn(`[icons] Upload failed for ux_${name}: ${error.message}`);
      }
    }
    console.log(`[icons] External Tabler pack synced: ${ready} ready, ${failed} unavailable; ${names.length - rendered.size} source icons skipped.`);
  } catch (error) {
    console.warn('[icons] External icon sync did not complete:', error.message);
    // Plain symbol fallbacks keep commands usable if the icon provider is unavailable.
  }
}

module.exports = { E, ensure, FALLBACK };
