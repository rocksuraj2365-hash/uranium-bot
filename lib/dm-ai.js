const { EmbedBuilder } = require('discord.js');
const history = new Map(), busy = new Set(), rates = new Map();
const model = () => process.env.AI_MODEL || 'gemini-3.8-flash';
const cut = (s, n) => String(s || '').slice(0, n);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function generate(system, contents) {
  const models = [...new Set([model(), ...(process.env.AI_FALLBACK_MODELS || 'gemini-3.6-flash,gemini-2.5-flash').split(',').map(x => x.trim()).filter(Boolean)])];
  let lastError = null;
  for (let i = 0; i < models.length; i++) {
    for (let attempt = 0; attempt < (i === 0 ? 2 : 1); attempt++) {
      try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(models[i]) + ':generateContent', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1200 } })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) return data;
        const message = data.error?.message || 'Gemini HTTP ' + response.status;
        if (response.status === 401 || response.status === 403) throw new Error('Gemini API key is invalid or not authorized.');
        const overloaded = response.status === 503 || response.status === 502 || /high demand|overloaded|temporarily unavailable|UNAVAILABLE/i.test(message);
        if (!overloaded) throw new Error(message);
        lastError = message;
        if (i === 0 && attempt === 0) await sleep(1200); else break;
      } catch (error) {
        if (/API key is invalid/.test(error.message)) throw error;
        lastError = error.message;
        if (i === 0 && attempt === 0) await sleep(1000);
      }
    }
  }
  throw new Error('All configured Gemini models are busy. ' + String(lastError || '').slice(0, 160));
}

async function reply(msg, ownerVerified = false) {
  const id = msg.author.id, key = 'dm:' + id;
  const send = text => msg.channel.send({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setAuthor({ name: 'Uranium AI' }).setDescription(cut(text, 3900))], allowedMentions: { parse: [] } });
  if (!process.env.GEMINI_API_KEY) return send('AI is not configured. The owner must configure Gemini in Render.');
  const now = Date.now(), recent = (rates.get(id) || []).filter(t => now - t < 60000);
  if (recent.length >= 6) return send('DM rate limit reached. Try again in a minute.');
  recent.push(now); rates.set(id, recent);
  if (busy.has(key)) return send('I am still working on your previous message. Please wait.');
  busy.add(key);
  try {
    await msg.channel.sendTyping().catch(() => {});
    const prior = history.get(key) || [];
    const system = [
      'You are Uranium AI, a helpful assistant in Discord direct messages.',
      'You have no tools in this DM chat. You cannot access GitHub or Render, edit code, deploy services, or change settings.',
      'Never claim an external action was completed. Explain the limitation if asked to perform one.',
      ownerVerified ? 'The sender has completed separate owner authenticator verification. You may provide technical assistance, but no external execution tools are enabled.' : 'The sender has normal user access. Do not disclose owner-only information.',
      'Reply in the language used by the sender. Be concise and helpful.'
    ].join('\n');
    const prompt = cut(msg.content, 3000);
    const data = await generate(system, [...prior, { role: 'user', parts: [{ text: prompt }] }]);
    const answer = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('\n').trim();
    if (!answer) throw new Error('Empty Gemini response');
    history.set(key, [...prior, { role: 'user', parts: [{ text: prompt }] }, { role: 'model', parts: [{ text: answer }] }].slice(-12));
    return send(answer);
  } catch (error) {
    console.error('[DM AI]', error.message);
    return send(/All configured Gemini models are busy|high demand|overloaded/i.test(error.message) ? 'Gemini is temporarily overloaded across the available models. Please try again shortly.' : 'I could not process that message right now. Please try again later.');
  } finally { busy.delete(key); }
}
module.exports = { reply };
