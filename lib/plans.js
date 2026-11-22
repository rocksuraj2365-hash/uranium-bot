// Premium plans. Shared by the bot (entitlements) and the website (prices).
// grants: 'premium' includes No Prefix while active, 'noprefix' is the standalone add-on.
const PLANS = {
  noprefix: { id: 'noprefix', label: 'No Prefix', amount: 20, period: 'month', days: 30, grants: 'noprefix' },
  premium_monthly: { id: 'premium_monthly', label: 'Premium Monthly', amount: 39, period: 'month', days: 30, grants: 'premium' },
  premium_yearly: { id: 'premium_yearly', label: 'Premium Yearly', amount: 249, period: 'year', days: 365, grants: 'premium' },
  premium_lifetime: { id: 'premium_lifetime', label: 'Premium Lifetime', amount: 799, period: 'once', days: null, grants: 'premium' },
};
const isPlan = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PLANS, id);
const publicPlans = () => Object.values(PLANS).map(({ id, label, amount, period }) => ({ id, label, amount, period }));
module.exports = { PLANS, isPlan, publicPlans };
