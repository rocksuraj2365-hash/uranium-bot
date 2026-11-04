// Custom emojis drawn from SVG (logo style) and uploaded as APPLICATION emojis (work in every server, use no server slots).
// If anything fails, normal Discord emojis are used instead.
const FALLBACK = { atom: '☢️', check: '✅', cross: '❌', warn: '⚠️', shield: '🛡️', play: '▶️', pause: '⏸️', stop: '⏹️', vol: '🔊', note: '🎵', bolt: '⚡', radio: '📻', crown: '💎', ai: '🤖' };
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
};
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
