const { isIP } = require('node:net');

const MAX_BYTES = 256 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

function safePublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('That is not a valid image URL.'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host ||
      isIP(host) || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host === 'metadata.google.internal') {
    throw new Error('Only public HTTPS image links are accepted.');
  }
  url.hash = '';
  return url;
}

function sourceUrl(source) {
  const value = String(source || '').trim();
  const custom = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/.exec(value);
  if (custom) return new URL(`https://cdn.discordapp.com/emojis/${custom[3]}.${custom[1] ? 'gif' : 'png'}?size=128&quality=lossless`);
  const discordCdn = /^https:\/\/(?:cdn|media)\.discordapp\.com\/emojis\/(\d{17,20})(?:\.(gif|png|jpe?g|webp|avif))?(?:\?.*)?$/i.exec(value);
  if (discordCdn && !/\.(?:gif|png|jpe?g|webp|avif)$/i.test(new URL(value).pathname)) {
    return new URL(`https://cdn.discordapp.com/emojis/${discordCdn[1]}.${discordCdn[2] || 'webp'}?size=128&quality=lossless`);
  }
  return safePublicUrl(value);
}

function deriveEmojiName(url) {
  const leaf = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  const stem = leaf.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  const name = (stem || 'imported_emoji').slice(0, 32);
  return name.length >= 2 ? name : `emoji_${name}`.slice(0, 32);
}

function normalizeEmojiName(value, fallback) {
  const name = String(value || fallback || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  if (name.length < 2) throw new Error('Emoji name must contain 2–32 letters, numbers or underscores.');
  return name;
}

function imageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp' &&
      /^(?:avif|avis)$/.test(bytes.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}

async function readLimited(response) {
  if (!response.body) throw new Error('The image host returned an empty response.');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw new Error('Emoji files must be 256 KiB or smaller.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('Emoji files must be 256 KiB or smaller.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

async function fetchEmojiImage(source, fetchImpl = fetch) {
  let url = sourceUrl(source);
  let response;
  for (let hop = 0; hop <= 3; hop += 1) {
    // Re-check every redirect target; never follow redirects automatically.
    url = safePublicUrl(url.href);
    response = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'UraniumDiscordBot/3.0 application-emoji-import' }
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (hop === 3) throw new Error('The image link redirected too many times.');
    const location = response.headers.get('location');
    if (!location) throw new Error('The image host returned an invalid redirect.');
    url = new URL(location, url);
  }
  if (!response?.ok) throw new Error(`Could not fetch that image (HTTP ${response?.status || 'network error'}).`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) throw new Error('The link must point directly to a PNG, JPG, GIF, WebP or AVIF image.');
  const bytes = await readLimited(response);
  if (!bytes.length || imageType(bytes) !== contentType) throw new Error('The link did not return a valid image file.');
  return { bytes, contentType, animated: contentType === 'image/gif' || (contentType === 'image/avif' && bytes.toString('ascii').includes('avis')) };
}

module.exports = { MAX_BYTES, sourceUrl, deriveEmojiName, normalizeEmojiName, imageType, fetchEmojiImage };
