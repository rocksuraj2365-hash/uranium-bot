const crypto = require('crypto');
const accepted = new Map(), failures = new Map();
function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of String(input || '').toUpperCase().replace(/=|\s+/g, '')) {
    const n = alphabet.indexOf(ch);
    if (n < 0) throw new Error('Invalid Base32');
    bits += n.toString(2).padStart(5, '0');
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function verifyTotp(secret, token, now = Date.now()) {
  if (!secret || !/^\d{6}$/.test(String(token || ''))) return false;
  let key;
  try { key = decodeBase32(secret); } catch { return false; }
  if (key.length < 20) return false;
  const step = Math.floor(now / 30000);
  for (const counter of [step - 1, step, step + 1]) {
    const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', key).update(msg).digest();
    const offset = digest[digest.length - 1] & 15;
    const n = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
    const expected = Buffer.from(String(n % 1000000).padStart(6, '0'));
    if (crypto.timingSafeEqual(Buffer.from(String(token)), expected) && counter > (accepted.get('owner') || 0)) {
      accepted.set('owner', counter); failures.delete('owner'); return true;
    }
  }
  attempts.push(now); failures.set('owner', attempts);
  return false;
}
module.exports = { verifyTotp };
