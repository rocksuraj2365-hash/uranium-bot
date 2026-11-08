const { T, TXT, S, I } = require('../lib/simple');
const { UserError, trunc } = require('../lib/util');

const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const out = (s) => trunc(s, 1800);
const t = (name, desc, fn, icon, label) => T(name, desc, [TXT(label)], (c) => out(fn(c.s('text'))), icon);
const rot = (s, n) => s.replace(/[a-z]/gi, (ch) => { const b = ch <= 'Z' ? 65 : 97; return String.fromCharCode(((ch.charCodeAt(0) - b + n + 26 * 10) % 26) + b); });
const bad = (what) => new UserError(`That is not valid ${what}`, 'Check the text and try again.');

module.exports = {
  name: 'text', description: 'Text tools: styles, encoders and counters',
  commands: [
    t('upper', 'Make text UPPERCASE', (s) => s.toUpperCase(), '🔠'),
    t('lower', 'Make text lowercase', (s) => s.toLowerCase(), '🔡'),
    t('titlecase', 'Make Every Word Start Big', (s) => s.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()), '🔤'),
    t('reverse', 'Reverse your text', (s) => [...s].reverse().join(''), '🔁'),
    t('mock', 'sPoNgEbOb mocking text', (s) => [...s].map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join(''), '🧽'),
    t('uwu', 'Turn text into uwu speak', (s) => s.replace(/[rl]/g, 'w').replace(/[RL]/g, 'W').replace(/n([aeiou])/g, 'ny$1').replace(/!+/g, ' >w<'), '🐱'),
    t('leet', 'Write in 1337 speak', (s) => s.replace(/a/gi, '4').replace(/e/gi, '3').replace(/i/gi, '1').replace(/o/gi, '0').replace(/s/gi, '5').replace(/t/gi, '7'), '🤖'),
    t('clap', 'Put 👏 between 👏 words', (s) => s.trim().split(/\s+/).join(' 👏 '), '👏'),
    t('spaced', 'S P A C E  O U T text', (s) => [...s].join(' '), '↔️'),
    T('wordcount', 'Count words, characters and lines', [TXT()], (c) => { const s = c.s('text'); return `Words: **${s.trim().split(/\s+/).filter(Boolean).length}**\nCharacters: **${[...s].length}**\nCharacters without spaces: **${s.replace(/\s/g, '').length}**\nLines: **${s.split('\n').length}**`; }, '🔢'),
    T('charcount', 'Count characters only', [TXT()], (c) => `**${[...c.s('text')].length}** characters`, '🔢'),
    t('slug', 'Make a URL-friendly slug', (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-'), '🔗'),
    T('palindrome', 'Check if text is a palindrome', [TXT()], (c) => { const s = c.s('text').toLowerCase().replace(/[^a-z0-9]/g, ''); return s && s === [...s].reverse().join('') ? '✅ Yes, it is a palindrome!' : '❌ No, it is not a palindrome.'; }, '🪞'),
    T('vowels', 'Count vowels and consonants', [TXT()], (c) => { const l = c.s('text').toLowerCase().replace(/[^a-z]/g, ''); const v = (l.match(/[aeiou]/g) || []).length; return `Vowels: **${v}**\nConsonants: **${l.length - v}**`; }, '🅰️'),
    T('caesar', 'Caesar cipher with a shift', [I('shift', 'Shift (-25 to 25)', true, -25, 25), TXT()], (c) => out(rot(c.s('text'), c.n('shift'))), '🔐'),
    t('rot13', 'ROT13 encode or decode', (s) => rot(s, 13), '🔐'),
    t('morse', 'Text to Morse code', (s) => s.toLowerCase().split('').map((ch) => (ch === ' ' ? '/' : MORSE[ch] || '')).filter(Boolean).join(' '), '📡'),
    t('unmorse', 'Morse code to text', (s) => s.trim().split(/\s+/).map((x) => (x === '/' ? ' ' : UNMORSE[x] || '?')).join(''), '📡', 'Morse (dots, dashes, / for spaces)'),
    t('binary', 'Text to binary', (s) => [...Buffer.from(s, 'utf8')].map((b) => b.toString(2).padStart(8, '0')).join(' '), '💾'),
    t('unbinary', 'Binary to text', (s) => { const p = s.trim().split(/\s+/); if (!p.every((x) => /^[01]{8}$/.test(x))) throw bad('binary (groups of 8 digits)'); return Buffer.from(p.map((x) => parseInt(x, 2))).toString('utf8'); }, '💾', 'Binary like 01001000 01101001'),
    t('hex', 'Text to hexadecimal', (s) => Buffer.from(s, 'utf8').toString('hex').replace(/(..)/g, '$1 ').trim(), '🧮'),
    t('unhex', 'Hexadecimal to text', (s) => { const h = s.replace(/\s/g, ''); if (!/^([0-9a-f]{2})+$/i.test(h)) throw bad('hexadecimal'); return Buffer.from(h, 'hex').toString('utf8'); }, '🧮', 'Hex like 48 69'),
    t('b64', 'Text to Base64', (s) => Buffer.from(s, 'utf8').toString('base64'), '📦'),
    t('unb64', 'Base64 to text', (s) => { if (!/^[A-Za-z0-9+/=\s]+$/.test(s)) throw bad('Base64'); return Buffer.from(s, 'base64').toString('utf8'); }, '📦', 'Base64 text'),
    t('urlencode', 'Encode text for a URL', (s) => encodeURIComponent(s), '🌐'),
  ],
};
