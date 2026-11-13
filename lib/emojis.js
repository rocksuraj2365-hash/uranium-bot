// Custom emojis drawn from SVG (logo style) and uploaded as APPLICATION emojis (work in every server, use no server slots).
// If anything fails, normal Discord emojis are used instead.
const FALLBACK = { mod: '🛡️', fortress: '🏰', raid: '🚨', mute: '🔇', unmute: '🔊', report: '🚩', verify: '✅', case: '📋', fox: '🦊', fox_angry: '😾', fox_sleep: '😴', fox_heart: '💜', skull: '💀',  atom: '☢️', check: '✅', cross: '❌', warn: '⚠️', shield: '🛡️', play: '▶️', pause: '⏸️', stop: '⏹️', vol: '🔊', note: '🎵', bolt: '⚡', radio: '📻', crown: '💎', ai: '🤖', member: '👤', message: '💬', channel: '📺', role: '🏷️', voice: '🔊', server: '🏰', automod: '🛡️', info: 'ℹ️', premium: '💎', license: '🔑', utility: '🧮', community: '🌐', fun: '🎮', servertools: '🧰', support: '📨', template: '🧩', security: '🛡️', ban: '🔨', kick: '👢', timeout: '⏳', lock: '🔒', unlock: '🔓', purge: '🧹', settings: '⚙️', search: '🔎', home: '🏠', page: '📄', undo: '↩️', dismiss: '🗑️' };
const wrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${inner}</svg>`;
const ICONS = {
  atom: wrap('<g fill="none" stroke="#39d98a" stroke-width="5"><ellipse cx="64" cy="64" rx="52" ry="19"/><ellipse cx="64" cy="64" rx="52" ry="19" transform="rotate(60 64 64)"/><ellipse cx="64" cy="64" rx="52" ry="19" transform="rotate(120 64 64)"/></g><circle cx="64" cy="64" r="13" fill="#7dffb8"/>'),
  check: wrap('<path d="M22 68 L52 98 L106 34" fill="none" stroke="#39d98a" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>'),
  cross: wrap('<path d="M30 30 L98 98 M98 30 L30 98" fill="none" stroke="#ff4d6d" stroke-width="16" stroke-linecap="round"/>'),
  warn: wrap('<path d="M64 14 L120 110 H8 Z" fill="#ffb84d"/><rect x="58" y="46" width="12" height="36" rx="6" fill="#1b2333"/><circle cx="64" cy="94" r="7" fill="#1b2333"/>'),
  shield: wrap('<path d="M64 10 L112 28 V62 C112 92 90 112 64 120 C38 112 16 92 16 62 V28 Z" fill="#5b8cff"/><path d="M40 64 L58 82 L90 46" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'),
  play: wrap('<path d="M34 18 L106 64 L34 110 Z" fill="#39d98a"/>'),
  pause: wrap('<rect x="28" y="20" width="26" height="88" rx="6" fill="#ffb84d"/><rect x="74" y="20" width="26" height="88" rx="6" fill="#ffb84d"/>'),
  stop: wrap('<rect x="24" y="24" width="80" height="80" rx="12" fill="#ff4d6d"/>'),
  vol: wrap('<path d="M14 48 H36 L66 22 V106 L36 80 H14 Z" fill="#5b8cff"/><path d="M82 44 C94 56 94 72 82 84 M96 30 C116 52 116 76 96 98" fill="none" stroke="#5b8cff" stroke-width="9" stroke-linecap="round"/>'),
  note: wrap('<ellipse cx="42" cy="98" rx="22" ry="16" fill="#8b5cf6"/><rect x="58" y="22" width="11" height="76" fill="#8b5cf6"/><path d="M69 22 C100 28 110 46 102 70 C98 54 86 48 69 46 Z" fill="#8b5cf6"/>'),
  bolt: wrap('<path d="M74 8 L22 74 H58 L50 120 L106 50 H68 Z" fill="#ffd166"/>'),
  radio: wrap('<rect x="12" y="44" width="104" height="70" rx="12" fill="#5b8cff"/><circle cx="46" cy="79" r="20" fill="#1b2333"/><rect x="78" y="62" width="26" height="10" rx="5" fill="#1b2333"/><rect x="78" y="84" width="26" height="10" rx="5" fill="#1b2333"/><path d="M30 44 L88 10" stroke="#5b8cff" stroke-width="7" stroke-linecap="round"/>'),
  crown: wrap('<path d="M12 104 L22 36 L48 66 L64 22 L80 66 L106 36 L116 104 Z" fill="#ffd166"/>'),
  ai: wrap('<path d="M64 8 L78 50 L120 64 L78 78 L64 120 L50 78 L8 64 L50 50 Z" fill="#8b5cf6"/><circle cx="100" cy="24" r="9" fill="#c4b5fd"/>'),
  member: wrap('<circle cx="64" cy="42" r="25" fill="#5b8cff"/><path d="M18 116 C20 83 42 72 64 72 S108 83 110 116 Z" fill="#5b8cff"/>'),
  message: wrap('<path d="M14 20 H114 V91 H58 L30 112 V91 H14 Z" fill="#39d98a"/><path d="M34 44 H94 M34 64 H78" stroke="#17352b" stroke-width="8" stroke-linecap="round"/>'),
  channel: wrap('<rect x="12" y="18" width="104" height="92" rx="12" fill="#38bdf8"/><path d="M34 42 H94 M34 64 H94 M34 86 H76" stroke="#123044" stroke-width="8" stroke-linecap="round"/>'),
  role: wrap('<path d="M64 12 L112 38 V90 L64 116 L16 90 V38 Z" fill="#ffb84d"/><circle cx="64" cy="64" r="18" fill="#543a12"/>'),
  voice: wrap('<path d="M14 48 H36 L66 22 V106 L36 80 H14 Z" fill="#8b5cf6"/><path d="M82 42 C100 56 100 72 82 86 M96 26 C122 50 122 78 96 102" fill="none" stroke="#8b5cf6" stroke-width="9" stroke-linecap="round"/>'),
  server: wrap('<path d="M12 108 H116 L64 18 Z" fill="#38bdf8"/><path d="M42 108 V72 H86 V108" fill="#123044"/>'),
  automod: wrap('<path d="M64 10 L112 28 V62 C112 92 90 112 64 120 C38 112 16 92 16 62 V28 Z" fill="#39d98a"/><path d="M42 64 L58 80 L90 46" fill="none" stroke="#123c2b" stroke-width="10" stroke-linecap="round"/>'),
  premium: wrap('<path d="M12 104 L22 36 L48 66 L64 22 L80 66 L106 36 L116 104 Z" fill="#ffd166"/>'),
  security: wrap('<path d="M64 10 L112 28 V62 C112 92 90 112 64 120 C38 112 16 92 16 62 V28 Z" fill="#5b8cff"/><path d="M42 64 L58 80 L90 46" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>'),
  settings: wrap('<circle cx="64" cy="64" r="22" fill="#5b8cff"/><path d="M56 10 H72 L78 26 L92 32 L108 26 L118 42 L106 54 L106 74 L118 86 L108 102 L92 96 L78 102 L72 118 H56 L50 102 L36 96 L20 102 L10 86 L22 74 V54 L10 42 L20 26 L36 32 L50 26 Z" fill="#5b8cff"/>'),
};
// Give every command family a stable application emoji name. Several related actions
// intentionally share artwork, while still getting their own Discord emoji names.
Object.assign(ICONS, {
  info: ICONS.atom, license: ICONS.shield, utility: ICONS.bolt, community: ICONS.message,
  fun: ICONS.ai, servertools: ICONS.settings, support: ICONS.message, template: ICONS.atom,
  music: ICONS.note, ban: ICONS.shield, kick: ICONS.member, timeout: ICONS.warn,
  lock: ICONS.shield, unlock: ICONS.check, purge: ICONS.cross, search: ICONS.atom,
  home: ICONS.server, page: ICONS.message, undo: ICONS.check, dismiss: ICONS.cross,
});
Object.assign(ICONS, {
  // Uranium moderation mascot + command-family artwork (neon violet / black / gold).
  mod: wrap('<path d="M64 8 L112 28 V62 C112 94 90 114 64 122 C38 114 16 94 16 62 V28 Z" fill="#241044" stroke="#c084fc" stroke-width="7"/><path d="M38 54 L48 43 L58 54 M70 54 L80 43 L90 54" fill="none" stroke="#e9d5ff" stroke-width="6" stroke-linecap="round"/><path d="M42 72 Q64 94 86 72" fill="none" stroke="#c084fc" stroke-width="7" stroke-linecap="round"/>'),
  fortress: wrap('<path d="M18 108 V44 L34 54 V34 L50 48 V22 H78 V48 L94 34 V54 L110 44 V108 Z" fill="#241044" stroke="#a855f7" stroke-width="7"/><path d="M52 108 V78 Q64 60 76 78 V108" fill="#fbbf24"/>'),
  raid: wrap('<path d="M64 8 L112 28 V62 C112 94 90 114 64 122 C38 114 16 94 16 62 V28 Z" fill="#2b103d" stroke="#fb7185" stroke-width="7"/><path d="M64 34 V72 M64 92 V94" stroke="#fb7185" stroke-width="11" stroke-linecap="round"/>'),
  mute: wrap('<path d="M18 48 H40 L68 24 V104 L40 80 H18 Z" fill="#a855f7"/><path d="M82 42 L110 86 M110 42 L82 86" stroke="#fb7185" stroke-width="10" stroke-linecap="round"/>'),
  unmute: wrap('<path d="M18 48 H40 L68 24 V104 L40 80 H18 Z" fill="#a855f7"/><path d="M82 52 Q100 64 82 76 M94 38 Q122 64 94 90" fill="none" stroke="#e9d5ff" stroke-width="8" stroke-linecap="round"/>'),
  report: wrap('<path d="M28 112 V18 M32 24 H100 L84 48 L100 72 H32" fill="#a855f7" stroke="#e9d5ff" stroke-width="7" stroke-linejoin="round"/>'),
  verify: wrap('<circle cx="64" cy="64" r="50" fill="#241044" stroke="#c084fc" stroke-width="8"/><path d="M34 66 L54 86 L96 40" fill="none" stroke="#86efac" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'),
  case: wrap('<path d="M18 42 H110 V108 H18 Z" fill="#241044" stroke="#c084fc" stroke-width="7"/><path d="M42 42 V26 H86 V42 M36 64 H92 M36 82 H80" fill="none" stroke="#e9d5ff" stroke-width="7" stroke-linecap="round"/>'),
  fox: wrap('<path d="M18 40 L14 10 L44 28 Q64 16 84 28 L114 10 L110 40 Q118 88 64 116 Q10 88 18 40 Z" fill="#241044" stroke="#c084fc" stroke-width="7"/><path d="M38 60 Q48 48 58 60 M70 60 Q80 48 90 60" fill="none" stroke="#f5d0fe" stroke-width="7" stroke-linecap="round"/><path d="M56 78 L64 86 L72 78" fill="none" stroke="#fbbf24" stroke-width="6" stroke-linecap="round"/>'),
  fox_angry: wrap('<path d="M18 40 L14 10 L44 28 Q64 16 84 28 L114 10 L110 40 Q118 88 64 116 Q10 88 18 40 Z" fill="#241044" stroke="#fb7185" stroke-width="7"/><path d="M34 54 L56 66 M94 54 L72 66" stroke="#fb7185" stroke-width="8" stroke-linecap="round"/><path d="M52 88 L64 78 L76 88" fill="none" stroke="#fbbf24" stroke-width="6"/>'),
  fox_sleep: wrap('<path d="M18 40 L14 10 L44 28 Q64 16 84 28 L114 10 L110 40 Q118 88 64 116 Q10 88 18 40 Z" fill="#241044" stroke="#c084fc" stroke-width="7"/><path d="M36 62 Q46 72 56 62 M72 62 Q82 72 92 62" fill="none" stroke="#e9d5ff" stroke-width="7" stroke-linecap="round"/><path d="M84 18 L94 8 L104 18" fill="none" stroke="#c084fc" stroke-width="5"/>'),
  fox_heart: wrap('<path d="M18 40 L14 10 L44 28 Q64 16 84 28 L114 10 L110 40 Q118 88 64 116 Q10 88 18 40 Z" fill="#241044" stroke="#c084fc" stroke-width="7"/><path d="M64 94 C20 66 44 42 64 62 C84 42 108 66 64 94" fill="#ec4899" stroke="#fbcfe8" stroke-width="4"/>'),
  skull: wrap('<path d="M64 12 C28 12 18 40 24 68 C28 82 40 88 42 98 H86 C88 88 100 82 104 68 C110 40 100 12 64 12 Z" fill="#241044" stroke="#c084fc" stroke-width="7"/><circle cx="46" cy="60" r="10" fill="#f5d0fe"/><circle cx="82" cy="60" r="10" fill="#f5d0fe"/><path d="M56 88 L64 78 L72 88" fill="none" stroke="#fbbf24" stroke-width="6"/>'),
});
const map = {};
const E = (n) => map[n] || FALLBACK[n] || '';
async function ensure(client) {
  try {
    const { Resvg } = require('@resvg/resvg-js');
    const have = await client.application.emojis.fetch();
    for (const [name, svg] of Object.entries(ICONS)) {
      const full = `ux_${name}`; let em = have.find((x) => x.name === full);
      if (!em) { const png = new Resvg(svg, { fitTo: { mode: 'width', value: 128 }, font: { loadSystemFonts: false } }).render().asPng(); em = await client.application.emojis.create({ attachment: png, name: full }); }
      map[name] = `<${em.animated ? 'a' : ''}:${em.name}:${em.id}>`;
    }
    console.log('✅ Custom emojis ready');
  } catch (e) { console.warn('Custom emojis disabled:', e.message); }
}
module.exports = { E, ensure, FALLBACK };
