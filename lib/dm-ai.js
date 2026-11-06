const { EmbedBuilder } = require('discord.js');
const history = new Map(), busy = new Set(), rates = new Map();
const model = () => process.env.AI_MODEL || 'gemini-3.8-flash';
const cut = (s, n) => String(s || '').slice(0, n);
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
    ].join('\\n');
    const prompt = cut(msg.content, 3000);
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model()) + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [...prior, { role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1200 } })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Gemini HTTP ' + response.status);
    const answer = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('\\n').trim();
    if (!answer) throw new Error('Empty Gemini response');
    history.set(key, [...prior, { role: 'user', parts: [{ text: prompt }] }, { role: 'model', parts: [{ text: answer }] }].slice(-12));
    return send(answer);
  } catch (error) {
    console.error('[DM AI]', error.message);
    return send('I could not process that message right now. Please try again later.');
  } finally { busy.delete(key); }
}
module.exports = { reply };
