const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET, PUBLIC_BASE_URL } = process.env;
const BASE = (PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const REDIRECT_URI = BASE + '/auth/callback';
const DISCORD_API = 'https://discord.com/api/v10';
// Moderation permissions plus Connect and Speak for music (same set the bot asks for in /info invite-bot)
const INVITE_PERMS = process.env.INVITE_PERMISSIONS || '1099946880246';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

// NOTE: MemoryStore is only OK for a starter. Add a persistent store before production.
app.use(
  session({
    secret: SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: BASE.startsWith('https'),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Only these files are public (server.js, bot.js etc. stay private)
const pages = {
  '/': 'index.html',
  '/dashboard': 'dashboard.html',
  '/style.css': 'style.css',
  '/dashboard.css': 'dashboard.css',
  '/dashboard.js': 'dashboard.js',
  '/terms-of-service': 'terms-of-service.html',
  '/privacy-policy': 'privacy-policy.html',
  '/verify-user': 'verify-user.html',
  '/interactions': 'interactions.html',
};
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/invite', (req, res) => {
  if (!DISCORD_CLIENT_ID) return res.status(500).send('DISCORD_CLIENT_ID not set');
  const p = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, scope: 'bot applications.commands', permissions: INVITE_PERMS });
  const gid = String(req.query.guild_id || '');
  if (/^\d{17,20}$/.test(gid)) { p.set('guild_id', gid); p.set('disable_guild_select', 'true'); }
  res.redirect('https://discord.com/oauth2/authorize?' + p);
});

app.get('/login', (req, res) => {
  if (!DISCORD_CLIENT_ID) return res.status(500).send('DISCORD_CLIENT_ID not set');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const p = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'identify guilds',
    state,
  });
  res.redirect('https://discord.com/oauth2/authorize?' + p);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send('Invalid login state. Open the home page and press "Login with Discord" (do not open this link directly).');
  }
  delete req.session.oauthState;
  try {
    const tokenRes = await fetch(DISCORD_API + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) throw new Error('Token exchange failed: ' + tokenRes.status);
    const token = await tokenRes.json();
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const [userRes, guildRes] = await Promise.all([
      fetch(DISCORD_API + '/users/@me', { headers }),
      fetch(DISCORD_API + '/users/@me/guilds', { headers }),
    ]);
    if (!userRes.ok || !guildRes.ok) throw new Error('Profile fetch failed');
    const user = await userRes.json();
    const guilds = await guildRes.json();
    req.session.user = {
      id: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar,
    };
    req.session.guilds = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      manageable: g.owner || (BigInt(g.permissions) & 0x28n) !== 0n,
    }));
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Login failed. Please try again.');
  }
});

/* ---------- API ---------- */
// Dashboard controls work only when the bot runs in this same process (RUN_WEB=1 on the bot service).
const live = () => { const u = global.uranium; return u && u.client && u.client.isReady && u.client.isReady() ? u : null; };

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}
function writeGuard(req, res, next) {
  const o = req.get('origin');
  if ((o && o !== BASE) || req.get('x-uranium') !== '1') return res.status(403).json({ error: 'Request blocked (bad origin).' });
  next();
}
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error('API error:', e.message); res.status(500).json({ error: 'Something went wrong.' }); });

function access(req, res) {
  const id = String(req.params.id || '');
  if (!/^\d{17,20}$/.test(id)) { res.status(400).json({ error: 'Bad server id' }); return null; }
  const sg = (req.session.guilds || []).find((g) => g.id === id);
  if (!sg || !sg.manageable) { res.status(403).json({ error: 'You need Manage Server in that server.' }); return null; }
  const u = live();
  if (!u) { res.status(503).json({ error: 'The bot is not connected to the dashboard yet.' }); return null; }
  const g = u.client.guilds.cache.get(id);
  if (!g) { res.status(404).json({ error: 'Uranium is not in that server yet.', needsInvite: true }); return null; }
  return { u, g, id };
}
const textChannels = (g) => [...g.channels.cache.values()].filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position);
const musicOf = (u, id) => { const st = u.music.state(id); return { playing: !!(st && st.station), station: st && st.station ? st.station.name : null, channelId: st ? st.channelId : null, volume: st ? Math.round(st.volume * 100) : null, is247: u.music.is247(id) }; };

app.get('/api/me', requireAuth, (req, res) => res.json(req.session.user));
app.get('/api/guilds', requireAuth, (req, res) => {
  const u = live();
  res.json((req.session.guilds || []).map((g) => ({ ...g, botIn: u ? u.client.guilds.cache.has(g.id) : null })));
});
app.get('/api/stats', (req, res) => {
  const u = live();
  res.json(u ? { mode: 'combined', servers: u.client.guilds.cache.size, ping: Math.round(u.client.ws.ping), uptime: Math.round(process.uptime()) } : { mode: 'web-only' });
});

app.get('/api/guild/:id', requireAuth, wrap(async (req, res) => {
  const a = access(req, res); if (!a) return;
  const { u, g, id } = a; const d = u.db.g(id); const cfg = d.config;
  await g.channels.fetch().catch(() => {});
  res.json({
    id, name: g.name, icon: g.icon, members: g.memberCount, channelCount: g.channels.cache.size,
    prefix: cfg.prefix || '!', ai: cfg.ai !== false, aiChannel: cfg.aiChannel || null, modlog: cfg.modlog || null, appeal: cfg.appeal || null,
    channels: textChannels(g).map((c) => ({ id: c.id, name: c.name })),
    cases: d.cases.slice(-25).reverse().map((c) => ({ id: c.id, type: c.type, userId: c.userId, modId: c.modId, reason: c.reason || null, at: c.at })),
    totals: { cases: d.cases.length, warns: d.warns.length, notes: d.notes.length, watch: d.watch.length },
    music: musicOf(u, id),
  });
}));

app.post('/api/guild/:id/settings', requireAuth, writeGuard, wrap(async (req, res) => {
  const a = access(req, res); if (!a) return;
  const { u, g, id } = a; const cfg = u.db.g(id).config; const b = req.body || {};
  await g.channels.fetch().catch(() => {});
  const okChannel = (v) => v === null || (typeof v === 'string' && textChannels(g).some((c) => c.id === v));
  if ('prefix' in b) { const p = String(b.prefix); if (!p || p.length > 3 || /[`\s]/.test(p)) return res.status(400).json({ error: 'The prefix must be 1 to 3 characters without spaces.' }); cfg.prefix = p; }
  if ('ai' in b) cfg.ai = !!b.ai;
  if ('aiChannel' in b) { if (!okChannel(b.aiChannel)) return res.status(400).json({ error: 'Pick a text channel from this server.' }); if (b.aiChannel) cfg.aiChannel = b.aiChannel; else delete cfg.aiChannel; }
  if ('modlog' in b) { if (!okChannel(b.modlog)) return res.status(400).json({ error: 'Pick a text channel from this server.' }); if (b.modlog) cfg.modlog = b.modlog; else delete cfg.modlog; }
  if ('appeal' in b) { if (b.appeal === null || b.appeal === '') delete cfg.appeal; else if (typeof b.appeal === 'string' && /^https:\/\/\S{1,190}$/.test(b.appeal)) cfg.appeal = b.appeal; else return res.status(400).json({ error: 'The appeal link must start with https://' }); }
  u.db.save();
  res.json({ ok: true, prefix: cfg.prefix || '!', ai: cfg.ai !== false, aiChannel: cfg.aiChannel || null, modlog: cfg.modlog || null, appeal: cfg.appeal || null });
}));

app.post('/api/guild/:id/music', requireAuth, writeGuard, wrap(async (req, res) => {
  const a = access(req, res); if (!a) return;
  const { u, g, id } = a; const { action, value } = req.body || {};
  try {
    if (['pause', 'resume', 'stop'].includes(action)) u.music[action](id);
    else if (action === 'volume') { const n = Number(value); if (!Number.isFinite(n) || n < 1 || n > 100) return res.status(400).json({ error: 'Volume must be 1 to 100.' }); u.music.volume(id, n); }
    else if (action === '247') u.music.set247(g, !!value);
    else return res.status(400).json({ error: 'Unknown music action.' });
  } catch (e) { return res.status(400).json({ error: e.message || 'Music error.' }); }
  res.json({ ok: true, music: musicOf(u, id) });
}));

app.post('/api/guild/:id/lock', requireAuth, writeGuard, wrap(async (req, res) => {
  const a = access(req, res); if (!a) return;
  const { g } = a; const { channelId, lock } = req.body || {};
  const ch = typeof channelId === 'string' ? g.channels.cache.get(channelId) : null;
  if (!ch || (ch.type !== 0 && ch.type !== 5)) return res.status(400).json({ error: 'Pick a text channel from this server.' });
  try { await ch.permissionOverwrites.edit(g.roles.everyone, { SendMessages: lock ? false : null }, { reason: `Dashboard: ${req.session.user.username}` }); }
  catch { return res.status(400).json({ error: 'I could not change that channel. Check my Manage Channels permission and role position.' }); }
  res.json({ ok: true, locked: !!lock });
}));

app.post('/api/guild/:id/case-delete', requireAuth, writeGuard, wrap(async (req, res) => {
  const a = access(req, res); if (!a) return;
  const n = Number((req.body || {}).id);
  if (!Number.isInteger(n) || !a.u.db.remove(a.id, 'cases', n)) return res.status(404).json({ error: 'That case does not exist.' });
  res.json({ ok: true });
}));

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Uranium web running on port ' + port));
