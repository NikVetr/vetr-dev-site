// Actual example input, corrected centerlines, and variable-width outline from Signature's core.
import { readFileSync } from 'node:fs';
import { DEFAULTS, submit } from '../../../signature/core/index.js';
import { readSignature } from '../../../signature/core/input.js';
import { H, W, art, num, polyline } from '../svg.mjs';

const PERIOD = 10;

export function build() {
  const csv = readFileSync(new URL('../../../signature/examples/avery-quill.csv', import.meta.url), 'utf8');
  const result = submit({ csv });
  const raw = readSignature({ csv }, '', DEFAULTS.input, [], []);
  if (!raw) throw new Error('signature: the example could not be read');
  const [bx, by, bw, bh] = result.viewBox;
  const k = Math.min((W - 28) / bw, (H - 28) / bh);
  const ox = (W - bw * k) / 2 - bx * k;
  const oy = (H - bh * k) / 2 - by * k;
  const at = (/** @type {number} */ x, /** @type {number} */ y) => [ox + x * k, oy + y * k];
  const ink = result.outline.map((poly) => poly.map((ring) => polyline(ring.map(([x, y]) => at(x, y)), true)).join('')).join('');
  const smooth = result.strokes.map((st) => polyline(st.points.map(([x, y]) => at(x, y)))).join('');
  const lengths = raw.map(st => st.reduce((sum, p, i) => sum + (i ? Math.hypot(p.x - st[i - 1].x, p.y - st[i - 1].y) : 0), 0));
  const total = lengths.reduce((a, b) => a + b, 0);
  let elapsed = 0;
  /** @type {string[]} */
  const drawingRules = [];
  const input = raw.map((stroke, i) => {
    const from = 3 + elapsed / total * 25;
    elapsed += lengths[i];
    const to = 3 + elapsed / total * 25;
    drawingRules.push(`& .stroke-${i} { animation: signature-draw-${i} ${PERIOD}s linear infinite; }
@keyframes signature-draw-${i} { 0%, ${num(from, 3)}% { stroke-dashoffset: 1; } ${num(to, 3)}%, 100% { stroke-dashoffset: 0; } }`);
    return `<path class="stroke-${i}" pathLength="1" d="${polyline(stroke.map(p => at(p.x, p.y)))}"/>`;
  }).join('');
  return art({ name: 'signature', period: PERIOD,
    defs: `<clipPath id="signature-raw-clip"><rect class="smooth-front" width="${W}" height="${H}"/></clipPath>
<clipPath id="signature-smooth-clip"><rect class="smooth-front" x="${-W}" width="${W}" height="${H}"/></clipPath>
<clipPath id="signature-ink-clip"><rect class="ink-front" width="${W}" height="${H}"/></clipPath>`,
    body: `<g class="workflow"><g class="input" clip-path="url(#signature-raw-clip)">${input}</g><path class="centerline" clip-path="url(#signature-smooth-clip)" d="${smooth}"/></g>
<g clip-path="url(#signature-ink-clip)"><rect class="ink-paper" width="${W}" height="${H}"/><path class="ink" d="${ink}"/></g>
<path class="scanner" d="M0 9V171"/>`,
    css: `& .ink { fill: var(--art-ink); fill-rule: evenodd; }
& .ink-paper { fill: var(--art-paper); }
& .workflow, & .scanner { opacity: 0; }
& .input, & .centerline { fill: none; stroke: var(--art-ink); stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
& .input path { stroke-dasharray: 1; }
& .scanner { stroke: #d0312d; stroke-width: 1; }`,
    loop: `& .workflow { opacity: 1; animation: signature-workflow ${PERIOD}s linear infinite; }
& .smooth-front { animation: signature-smooth ${PERIOD}s linear infinite; }
& .ink-front { animation: signature-ink ${PERIOD}s linear infinite; }
& .scanner { animation: signature-scan ${PERIOD}s linear infinite; }
${drawingRules.join('\n')}
@keyframes signature-workflow { 0%, 91% { opacity: 1; } 97%, 100% { opacity: 0; } }
@keyframes signature-smooth { 0%, 34% { transform: translateX(0); } 55%, 100% { transform: translateX(${W}px); } }
@keyframes signature-ink { 0%, 62% { transform: translateX(${W}px); } 83%, 100% { transform: translateX(0); } }
@keyframes signature-scan { 0%, 33% { opacity: 0; transform: translateX(0); } 34% { opacity: 1; transform: translateX(0); } 55% { opacity: 1; transform: translateX(${W}px); } 56%, 61% { opacity: 0; transform: translateX(${W}px); } 62% { opacity: 1; transform: translateX(${W}px); } 83% { opacity: 1; transform: translateX(0); } 84%, 100% { opacity: 0; transform: translateX(0); } }`,
  });
}
