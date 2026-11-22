const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const PostgresSessionStore = require('./lib/postgres-session-store');

const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET, PUBLIC_BASE_URL } = process.env;
const BASE = (PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const REDIRECT_URI = BASE + '/auth/callback';
const DISCORD_API = 'https://discord.com/api/v10';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || req.get('x-forwarded-proto') === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '12kb', strict: true }));

function rateLimit({ windowMs = 60000, max = 60 } = {}) {
  const buckets = new Map();
  const cleanup = setInterval(() => { const now = Date.now(); for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key); }, Math.min(windowMs, 60000));
  cleanup.unref?.();
  return (req, res, next) => {
    const key = String(req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + windowMs }; buckets.set(key, bucket); }
    bucket.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) { res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000))); return res.status(429).json({ error: 'Too many requests. Please wait and retry.' }); }
    next();
  };
}
app.use('/api', rateLimit({ windowMs: 60000, max: 90 }));
app.use(['/login', '/auth/callback'], rateLimit({ windowMs: 15 * 60 * 1000, max: 12 }));

const sessionDatabaseUrl = process.env.SESSION_DATABASE_URL || process.env.DATABASE_URL;
const sessionSql = sessionDatabaseUrl
  ? require('postgres')(sessionDatabaseUrl, { max: 2, idle_timeout: 20, connect_timeout: 12, prepare: false, ssl: 'require', connection: { application_name: 'uranium-dashboard-sessions' } })
  : null;
const sessionStore = sessionSql ? new PostgresSessionStore(sessionSql) : null;

app.use(
  session({
    secret: SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    ...(sessionStore ? { store: sessionStore } : {}),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: BASE.startsWith('https') || String(process.env.RENDER_EXTERNAL_URL || '').startsWith('https://'),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Only these files are public (server.js, bot.js etc. stay private)
const pages = {
  '/': 'index.html',
  '/premium': 'premium.html',
  '/premium.js': 'premium.js',
  '/commands': 'commands.html',
  '/docs': 'docs.html',
  '/getting-started': 'getting-started.html',
  '/permissions-guide': 'permissions-guide.html',
  '/moderation-guide': 'moderation-guide.html',
  '/automod-guide': 'automod-guide.html',
  '/dashboard-guide': 'dashboard-guide.html',
  '/faq': 'faq.html',
  '/changelog': 'changelog.html',
  '/support': 'support.html',
  '/commands.js': 'commands.js',
  '/commands.json': 'commands.json',
  '/dashboard': 'dashboard.html',
  '/admin': 'admin.html',
  '/admin.js': 'admin.js',
  '/style.css': 'style.css',
  '/dashboard.js': 'dashboard.js',
  '/terms-of-service': 'terms-of-service.html',
  '/privacy-policy': 'privacy-policy.html',
  '/verify-user': 'verify-user.html',
  '/interactions': 'interactions.html',
};
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => {
    if (route === '/admin') {
      if (!req.session.user) return res.redirect('/login');
      const admins = new Set((process.env.ADMIN_DISCORD_IDS || process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean));
      if (!admins.has(String(req.session.user.id))) return res.status(403).send('Owner access only.');
    }
    res.sendFile(path.join(__dirname, file));
  });
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
  req.session.returnTo = req.query.next === 'premium' ? '/premium' : undefined;
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
  const returnTo = req.session.returnTo === '/premium' ? '/premium' : '/dashboard';
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
    const safeUser = { id: user.id, username: user.global_name || user.username, avatar: user.avatar };
    const safeGuilds = guilds.map((g) => ({
      id: g.id, name: g.name, icon: g.icon,
      manageable: !!g.owner || (BigInt(g.permissions) & 0x28n) !== 0n,
    }));
    // Rotate the session ID after authentication to prevent session fixation.
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.user = safeUser;
    req.session.guilds = safeGuilds;
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.status(500).send('Login failed. Please try again.');
  }
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

require('./lib/premium-web')(app, { requireAuth, rateLimit });
app.get('/api/me', requireAuth, (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(req.session.user); });
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const admins = new Set((process.env.ADMIN_DISCORD_IDS || process.env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean));
  if (!admins.has(String(req.session.user.id))) return res.status(403).json({ error: 'Owner access only.' });
  next();
}
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const base = String(process.env.BOT_CONTROL_URL || '').replace(/\/$/, '');
  const secret = process.env.DASHBOARD_API_SECRET;
  if (!base || !secret) return res.status(503).json({ error: 'Bot connection is not configured.' });
  try {
    const response = await fetch(base + '/owner/stats', { headers: { 'x-dashboard-secret': secret, 'x-owner-user-id': req.session.user.id }, signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch { return res.status(502).json({ error: 'Could not reach the bot service. It may be starting or sleeping.' }); }
});
app.get('/api/guilds', requireAuth, (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(req.session.guilds || []); });

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
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if (req.get('origin') !== expectedOrigin) return res.status(403).json({ error: 'Request origin check failed.' });
  next();
}, forwardBotControl);

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// Keep internal stack traces and provider details out of public responses.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const malformedJson = err instanceof SyntaxError && err.status === 400 && 'body' in err;
  if (malformedJson) return res.status(400).json({ error: 'Invalid JSON request body.' });
  console.error('[web error]', req.method, req.path, err?.message || 'Unknown error');
  return res.status(500).json({ error: 'An internal server error occurred. Please retry.' });
});

const port = process.env.PORT || 3000;
async function start() {
  if (sessionStore) {
    await sessionStore.init();
    console.log('[web] Persistent PostgreSQL session store enabled.');
  } else {
    console.warn('[web] DATABASE_URL missing: dashboard sessions use temporary in-memory storage and reset on restart.');
  }
  if (!SESSION_SECRET) console.warn('[web] SESSION_SECRET missing: sessions will be invalidated whenever this process restarts.');
  app.listen(port, () => console.log('Uranium web running on port ' + port));
}
start().catch(error => { console.error('[web] Startup failed:', error.message); process.exit(1); });
