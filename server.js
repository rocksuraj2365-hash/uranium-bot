const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET, PUBLIC_BASE_URL } = process.env;
const BASE = (PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const REDIRECT_URI = BASE + '/auth/callback';
const DISCORD_API = 'https://discord.com/api/v10';

const app = express();
app.set('trust proxy', 1);

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
  const p = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    scope: 'bot applications.commands',
    permissions: '0',
  });
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
    return res.status(400).send('Invalid login state. Please try again.');
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

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

app.get('/api/me', requireAuth, (req, res) => res.json(req.session.user));
app.get('/api/guilds', requireAuth, (req, res) => res.json(req.session.guilds || []));

function manageableGuild(req, res, next) {
  const guild = (req.session.guilds || []).find(g => g.id === String(req.params.guildId) && g.manageable);
  if (!guild) return res.status(403).json({ error: 'You do not have Manage Server access to this guild.' });
  next();
}
async function forwardBotControl(req, res) {
  const base = String(process.env.BOT_CONTROL_URL || '').replace(/\/$/, '');
  const secret = process.env.DASHBOARD_API_SECRET;
  if (!base || !secret) return res.status(503).json({ error: 'Dashboard-to-bot connection is not configured yet.' });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(base + '/control/guild/' + encodeURIComponent(req.params.guildId), {
      method: req.method, headers: { 'x-dashboard-secret': secret, 'x-discord-user-id': req.session.user.id, ...(req.method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      ...(req.method === 'POST' ? { body: JSON.stringify(req.body || {}) } : {}), signal: controller.signal
    });
    const data = await response.json().catch(() => ({ error: 'The bot returned an unreadable response.' }));
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({ error: error.name === 'AbortError' ? 'The bot took too long to wake up. Please retry.' : 'Could not connect to the bot service.' });
  } finally { clearTimeout(timeout); }
}
app.get('/api/guilds/:guildId/control', requireAuth, manageableGuild, forwardBotControl);
app.post('/api/guilds/:guildId/control', requireAuth, manageableGuild, (req, res, next) => {
  if (req.get('origin') !== BASE) return res.status(403).json({ error: 'Request origin check failed.' });
  next();
}, forwardBotControl);

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Uranium web running on port ' + port));
