// Bot-side HTTP API for the website: /pay/status, /pay/orders, /pay/orders/:ref/utr
// Only the website may call it (shared DASHBOARD_API_SECRET), and it tells us which Discord user is acting.
const store = require('./premium-store');
const ui = require('./pay-ui');

async function readJson(req, limit = 2000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString('utf8');
    if (Buffer.byteLength(raw, 'utf8') > limit) throw new store.PayError('Request too large.', 413);
  }
  let value;
  try { value = JSON.parse(raw || '{}'); } catch { throw new store.PayError('Invalid JSON request body.', 400); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new store.PayError('Request body must be a JSON object.', 400);
  return value;
}

async function handle(req, res, url, { sendJson, safeEqual, allowApiRequest, client }) {
  if (!allowApiRequest(req, res, 60)) return undefined;
  const secret = process.env.DASHBOARD_API_SECRET;
  if (!secret || !safeEqual(req.headers['x-dashboard-secret'], secret)) return sendJson(res, 401, { error: 'Unauthorized dashboard request' });
  const userId = String(req.headers['x-discord-user-id'] || '');
  if (!/^\d{17,20}$/.test(userId)) return sendJson(res, 401, { error: 'Invalid Discord user' });
  let username = '';
  try { username = decodeURIComponent(String(req.headers['x-discord-username'] || '')); } catch { /* ignore */ }
  try {
    if (req.method === 'GET' && url.pathname === '/pay/status') return sendJson(res, 200, store.statusFor(userId));
    if (req.method === 'POST') {
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return sendJson(res, 415, { error: 'Content-Type must be application/json.' });
      if (url.pathname === '/pay/orders') {
        const body = await readJson(req);
        return sendJson(res, 200, { order: store.publicOrder(store.createOrder(userId, username, String(body.plan || ''))) });
      }
      const match = /^\/pay\/orders\/(URX-[A-Z0-9]{6})\/utr$/.exec(url.pathname);
      if (match) {
        const body = await readJson(req);
        const order = store.submitUtr(userId, match[1], String(body.utr || ''));
        let delivered = 0;
        try { delivered = await ui.notifyOwners(client, order); } catch (error) { console.error('[pay] notify failed', error.message); }
        return sendJson(res, 200, { order: store.publicOrder(order), ownerNotified: delivered > 0 });
      }
    }
    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error?.name === 'PayError') return sendJson(res, error.status, { error: error.message });
    console.error('[pay api]', error);
    return sendJson(res, 500, { error: 'Payment service error. Please retry.' });
  }
}

module.exports = { handle };
