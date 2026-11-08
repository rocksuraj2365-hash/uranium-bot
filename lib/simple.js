// Helper for small, pure commands (no Discord permissions needed)
const { C, S, I, U } = require('./cmd');
const { res } = require('./util');
const pretty = (n) => n.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase());
const T = (name, desc, opts, fn, icon = '✨', color = 0x8b5cf6) => C(name, desc, opts, null, async (c) => {
  const r = await fn(c); return typeof r === 'string' ? res(pretty(name), r, { icon, color }) : { icon, color, ...r };
});
const TXT = (d = 'Your text') => S('text', d, true, { max: 1500 });
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const bar = (p, n = 10) => '▰'.repeat(Math.round(p * n)) + '▱'.repeat(n - Math.round(p * n));
module.exports = { T, TXT, pick, hash, bar, S, I, U, res };
