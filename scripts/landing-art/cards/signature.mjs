// Signature Correction: the page's example, the synthetic "Avery Quill" signed on a trackpad,
// corrected by the tool's core with its defaults: the filled outline of the smoothed strokes
// with their pen widths. The loop is the page's "Both" view in motion: the raw trackpad strokes
// (thin, red, as the page draws them over the ink) appear, the corrected ink wipes away left to
// right to leave only the wobbly input, writes itself back on left to right, and the raw strokes
// go again, leaving the still. The wipe is a feathered mask band that only translates.
import { readFileSync } from 'node:fs';
import { DEFAULTS, submit } from '../../../signature/core/index.js';
import { readSignature } from '../../../signature/core/input.js';
import { H, W, art, num, polyline } from '../svg.mjs';

const PERIOD = 6;

export function build() {
  const csv = readFileSync(new URL('../../../signature/examples/avery-quill.csv', import.meta.url), 'utf8');
  const result = submit({ csv });
  const raw = readSignature({ csv }, '', DEFAULTS.input, [], []);
  if (!raw) throw new Error('signature: the example could not be read');

  // Fit the outline's bounds into the canvas with a margin.
  const [bx, by, bw, bh] = result.viewBox;
  const k = Math.min((W - 28) / bw, (H - 28) / bh);
  const ox = (W - bw * k) / 2 - bx * k;
  const oy = (H - bh * k) / 2 - by * k;
  const at = (/** @type {number} */ x, /** @type {number} */ y) => [ox + x * k, oy + y * k];
  const ink = result.outline.map((poly) => poly.map((ring) => polyline(ring.map(([x, y]) => at(x, y)), true)).join('')).join('');
  const input = raw.map((stroke) => polyline(stroke.map((p) => at(p.x, p.y)))).join('');

  // The wipe: a band of the card's paper colour, feathered F at both ends, as wide as the
  // signature plus both feathers. At rest it waits left of the signature; sweeping right by one
  // band covers the ink from the left, a second band uncovers it from the left, and once it
  // is clear on the right it jumps back left, which shows nothing.
  const F = 14;
  const [x0, x1] = [ox + bx * k, ox + (bx + bw) * k];
  const band = x1 - x0 + 2 * F;
  const p = (/** @type {number} */ t) => num((100 * t) / PERIOD, 3);
  const defs = `<linearGradient id="signature-feather" class="feather"><stop offset="0" stop-opacity="0"/><stop offset="${num(F / band, 4)}"/><stop offset="${num(1 - F / band, 4)}"/><stop offset="1" stop-opacity="0"/></linearGradient>`;
  const body = `<path class="ink" d="${ink}"/>
<rect class="cover" x="${num(x0 - F - band)}" y="0" width="${num(band)}" height="${H}" fill="url(#signature-feather)"/>
<path class="input" d="${input}"/>`;
  return art({
    name: 'signature',
    period: PERIOD,
    defs,
    body,
    // The page's colours: ink #1b1b1b (the theme's ink here), raw strokes #d0312d in both themes.
    css: `& .ink { fill: var(--art-ink); fill-rule: evenodd; }
& .feather stop { stop-color: var(--art-paper); }
& .input { fill: none; stroke: #d0312d; stroke-width: 0.9; stroke-linejoin: round; stroke-linecap: round; opacity: 0; }`,
    // 0-0.5 still; raw strokes in by 0.9; the cover sweeps over the ink 1.2-2.6; bare input
    // 2.6-3.2; the cover sweeps off 3.2-4.6 and jumps back at 4.8; raw strokes out 5.0-5.4.
    loop: `& .input { animation: signature-input ${PERIOD}s linear infinite; }
& .cover { animation: signature-cover ${PERIOD}s ease-in-out infinite; }
@keyframes signature-input { 0%, ${p(0.5)}% { opacity: 0; } ${p(0.9)}%, ${p(5)}% { opacity: 1; } ${p(5.4)}%, 100% { opacity: 0; } }
@keyframes signature-cover { 0%, ${p(1.2)}% { transform: none; } ${p(2.6)}%, ${p(3.2)}% { transform: translateX(${num(band)}px); } ${p(4.6)}% { transform: translateX(${num(2 * band)}px); animation-timing-function: step-end; } ${p(4.8)}%, 100% { transform: none; } }`,
  });
}
