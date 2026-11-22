// Website helpers: UPI deep link and QR code for an order.
const QRCode = require('qrcode');
const validUpiId = (id) => /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,32}$/.test(String(id || ''));
function upiLink({ upiId, payee, amount, ref }) {
  const params = [['pa', upiId], ['pn', payee], ['am', Number(amount).toFixed(2)], ['cu', 'INR'], ['tn', ref]];
  return 'upi://pay?' + params.map(([key, value]) => key + '=' + encodeURIComponent(String(value))).join('&');
}
const qrSvg = (text) => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
module.exports = { validUpiId, upiLink, qrSvg };
