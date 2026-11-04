// Draws an animated uranium atom with SVG, then turns it into a GIF (Discord cannot show SVG directly).
// Everything is optional: if the image libraries are missing, the bot simply works without the picture.
let gif = null;
const R = (n) => Math.round(n * 100) / 100;

function atom(t) {
  const W = 480, H = 200, cx = 240, cy = 100, rx = 110, ry = 30;
  let g = '';
  [0, 60, 120].forEach((deg, k) => {
    const th = 2 * Math.PI * (t + k / 3);
    const ex = R(cx + rx * Math.cos(th)), ey = R(cy + ry * Math.sin(th));
    g += `<g transform="rotate(${deg} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#39d98a" stroke-opacity="0.45" stroke-width="2"/><circle cx="${ex}" cy="${ey}" r="13" fill="#39d98a" fill-opacity="0.25"/><circle cx="${ex}" cy="${ey}" r="7" fill="#7dffb8"/></g>`;
  });
  const pulse = 14 + 3 * Math.sin(2 * Math.PI * t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="#1b2333"/></linearGradient><radialGradient id="nu"><stop offset="0" stop-color="#d9ffe9"/><stop offset="1" stop-color="#39d98a"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>${g}<circle cx="${cx}" cy="${cy}" r="${R(pulse + 10)}" fill="#39d98a" fill-opacity="0.18"/><circle cx="${cx}" cy="${cy}" r="${R(pulse)}" fill="url(#nu)"/></svg>`;
}
async function build() {
  try {
    const { Resvg } = require('@resvg/resvg-js');
    const { GIFEncoder, quantize, applyPalette } = require('gifenc');
    const enc = GIFEncoder(); const frames = 12;
    for (let f = 0; f < frames; f++) {
      const r = new Resvg(atom(f / frames), { font: { loadSystemFonts: false } }).render();
      const rgba = new Uint8Array(r.pixels); const palette = quantize(rgba, 128);
      enc.writeFrame(applyPalette(rgba, palette), r.width, r.height, { palette, delay: 90 });
      await new Promise((ok) => setTimeout(ok, 40));
    }
    enc.finish(); gif = Buffer.from(enc.bytes()); return true;
  } catch (e) { console.warn('Banner animation disabled:', e.message); return false; }
}
module.exports = { build, getGif: () => gif, atom };
