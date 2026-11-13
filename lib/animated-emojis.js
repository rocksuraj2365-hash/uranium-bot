'use strict';
const { Resvg } = require('@resvg/resvg-js');
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const SIZE = 96;
const FRAMES = 6;
function renderFrame(svg, frame) {
  const match = svg.match(/^<svg[^>]*>([\\s\\S]*)<\\/svg>$/);
  if (!match) throw new Error('Invalid SVG emoji source');
  const phase = (frame / FRAMES) * Math.PI * 2;
  const scale = 0.94 + 0.045 * (0.5 + 0.5 * Math.sin(phase));
  const rotate = Math.sin(phase) * 2.2;
  const opacity = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(phase));
  const animated = '<svg xmlns="http://www.w3.org/2000/svg" width="' + SIZE + '" height="' + SIZE + '" viewBox="0 0 128 128">' +
    '<defs><radialGradient id="bg"><stop offset="0" stop-color="#321052"/><stop offset="1" stop-color="#10051f"/></radialGradient></defs>' +
    '<rect width="128" height="128" rx="28" fill="url(#bg)"/>' +
    '<circle cx="64" cy="64" r="52" fill="none" stroke="#c084fc" stroke-width="5" opacity="' + opacity + '"/>' +
    '<g transform="translate(64 64) rotate(' + rotate.toFixed(2) + ') scale(' + scale.toFixed(3) + ') translate(-64 -64)">' + match[1] + '</g></svg>';
  const png = new Resvg(animated, { fitTo: { mode: 'width', value: SIZE }, font: { loadSystemFonts: false } }).render().asPng();
  return new Uint8Array(PNG.sync.read(png).data);
}
function createAnimatedEmoji(svg) {
  const frames = Array.from({ length: FRAMES }, (_, i) => renderFrame(svg, i));
  const palette = quantize(frames[0], 256, { format: 'rgb565' });
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    gif.writeFrame(applyPalette(frames[i], palette), SIZE, SIZE, { palette: i === 0 ? palette : undefined, delay: 120, repeat: 0, dispose: 1 });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}
module.exports = { createAnimatedEmoji };
