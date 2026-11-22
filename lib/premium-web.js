// Website routes for Premium: /api/premium/config, /status, /orders, /orders/:ref/utr
// They forward to the bot (BOT_CONTROL_URL) and add the UPI link + QR code for unpaid orders.
const plans = require('./plans');
const payLink = require('./pay-link');

module.exports = function registerPremiumRoutes(app, { requireAuth, rateLimit }) {
  const upiId = () => String(process.env.PAYMENT_UPI_ID || '').trim();
  const payee = () => String(process.env.PAYMENT_PAYEE_NAME || 'Uranium').slice(0, 40);
  const open = () => payLink.validUpiId(upiId()) && !!process.env.BOT_CONTROL_URL && !!process.env.DASHBOARD_API_SECRET;
  const writeLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
  const sameOrigin = (req, res, next) => {
    if (req.get('origin') !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Request origin check failed.' });
    return next();
  };

  async function bot(req, method, pathname, body) {
    const base = String(process.env.BOT_CONTROL_URL || '').replace(/\/$/, '');
    const secret = process.env.DASHBOARD_API_SECRET;
    if (!base || !secret) return { status: 503, data: { error: 'Payments are not configured yet.' } };
    try {
      const response = await fetch(base + pathname, {
        method,
        headers: {
          'x-dashboard-secret': secret,
          'x-discord-user-id': String(req.session.user.id),
          'x-discord-username': encodeURIComponent(String(req.session.user.username || '').slice(0, 40)),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(60000),
      });
      const data = await response.json().catch(() => ({ error: 'The bot returned an unreadable response.' }));
      return { status: response.status, data };
    } catch { return { status: 502, data: { error: 'Could not reach the bot. It may be waking up, try again in a minute.' } }; }
  }

  async function withPay(order) {
    if (!order || order.status !== 'awaiting_payment' || !open()) return order;
    const link = payLink.upiLink({ upiId: upiId(), payee: payee(), amount: order.amount, ref: order.ref });
    return { ...order, pay: { upiId: upiId(), payee: payee(), amount: order.amount, link, qrSvg: await payLink.qrSvg(link) } };
  }

  app.get('/api/premium/config', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ open: open(), plans: plans.publicPlans() }); });

  app.get('/api/premium/status', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { status, data } = await bot(req, 'GET', '/pay/status');
    if (status === 200 && Array.isArray(data.orders)) data.orders = await Promise.all(data.orders.map(withPay));
    return res.status(status).json(data);
  });

  app.post('/api/premium/orders', requireAuth, sameOrigin, writeLimit, async (req, res) => {
    if (!open()) return res.status(503).json({ error: 'Payments are not open yet.' });
    const plan = String(req.body?.plan || '');
    if (!plans.isPlan(plan)) return res.status(400).json({ error: 'Unknown plan.' });
    const { status, data } = await bot(req, 'POST', '/pay/orders', { plan });
    if (status === 200 && data.order) data.order = await withPay(data.order);
    return res.status(status).json(data);
  });

  app.post('/api/premium/orders/:ref/utr', requireAuth, sameOrigin, writeLimit, async (req, res) => {
    const ref = String(req.params.ref || '');
    if (!/^URX-[A-Z0-9]{6}$/.test(ref)) return res.status(400).json({ error: 'Invalid order reference.' });
    const { status, data } = await bot(req, 'POST', `/pay/orders/${ref}/utr`, { utr: String(req.body?.utr || '') });
    return res.status(status).json(data);
  });
};
