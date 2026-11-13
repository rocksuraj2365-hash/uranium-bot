// Normalize persisted state from JSONB, including legacy double-encoded payloads.
// Older writes accidentally stored a JSON string, then startup spread that string into
// numeric character keys. Reassemble those character maps without materializing a
// million-key object in the running bot.
function normalizeRemotePayload(payload) {
  let value = payload;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return null; }
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    const numeric = keys.filter((key) => /^(0|[1-9]\\d*)$/.test(key));
    if (numeric.length >= 64) {
      numeric.sort((a, b) => Number(a) - Number(b));
      const contiguous = numeric.length === Number(numeric[numeric.length - 1]) + 1;
      const chars = contiguous && numeric.every((key) => typeof value[key] === 'string' && value[key].length === 1);
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
