// Normalize persisted state from JSONB, including legacy double-encoded payloads.
// Older writes stored JSON strings and startup spread them into numeric character keys.
// Decode those maps directly from text so a multi-million-character payload never becomes
// a multi-million-property JavaScript object during recovery.
function decodeCharacterMap(text) {
  if (typeof text !== 'string' || !text.startsWith('{"0":')) return null;
  const pair = /"([0-9]+)":("(?:\\\\.|[^"\\\\])*")/g;
  pair.lastIndex = 1;
  const chunks = [];
  let chunk = '';
  let expected = 0;
  let match;
  while ((match = pair.exec(text))) {
    if (Number(match[1]) !== expected) break;
    let character;
    try { character = JSON.parse(match[2]); } catch { return null; }
    if (typeof character !== 'string' || [...character].length !== 1) return null;
    chunk += character;
    expected += 1;
    if (chunk.length >= 8192) {
      chunks.push(chunk);
      chunk = '';
    }
  }
  if (expected < 64) return null;
  if (chunk) chunks.push(chunk);
  return chunks.join('');
}

function normalizeRemotePayload(payload) {
  let value = payload;
  for (let depth = 0; depth < 16; depth += 1) {
    if (typeof value === 'string') {
      const reconstructed = decodeCharacterMap(value);
      if (reconstructed !== null) {
        value = reconstructed;
        continue;
      }
      try { value = JSON.parse(value); } catch { return null; }
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    const numeric = keys.filter((key) => /^(0|[1-9]\\d*)$/.test(key));
    if (numeric.length >= 64) {
      numeric.sort((a, b) => Number(a) - Number(b));
      const contiguous = numeric.length === Number(numeric[numeric.length - 1]) + 1;
      const chars = contiguous && numeric.every((key) => typeof value[key] === 'string' && [...value[key]].length === 1);
      if (chars && value['0'] === '{') {
        value = numeric.map((key) => value[key]).join('');
        continue;
      }
    }
    if (value.guilds && typeof value.guilds === 'object' && !Array.isArray(value.guilds)) return value;
    return null;
  }
  return null;
}

module.exports = { normalizeRemotePayload };
