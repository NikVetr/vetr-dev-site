// Forecast Calibration: the page's example (48 synthetic predictions, its default settings) as
// the tool's calibration plot, simplified: realized frequency against stated probability, the
// observed line with the tool's markers (a circle inside the middle 95% of calibrated worlds, a
// triangle pointing the way out of it), over 150 of the simulated calibrated worlds and the
// dashed line of perfect calibration. The loop picks out eight of those worlds in turn, each
// fading in and out across the next, and ends with none picked out, as it starts.
import { readFileSync } from 'node:fs';
import { submit } from '../../../forecast-calibration/core/index.js';
import { art, num, polyline } from '../svg.mjs';

const WORLDS = 150;
const PICKED = 8;
const STEP = 0.55;   // seconds between picked worlds; each shows for two steps

export function build() {
  const table = readFileSync(new URL('../../../forecast-calibration/examples/synthetic.csv', import.meta.url), 'utf8');
  const result = submit({ table });
  const bins = result.bins;
  const [left, right, top, bottom] = [34, 300, 14, 164];
  const x = (p) => left + p * (right - left);
  const y = (f) => bottom - f * (bottom - top);
  const line = (freqs) => polyline(freqs.map((f, b) => [x(bins[b].meanProbability), y(f)]));
  const freqs = (world) => world.map((hits, b) => hits / bins[b].n);

  const worlds = result.worlds.slice(0, WORLDS).map((w) => `<path d="${line(freqs(w))}"/>`).join('');
  const picked = result.worlds.slice(WORLDS, WORLDS + PICKED)
    .map((w, k) => `<path d="${line(freqs(w))}"${k ? ` style="animation-delay:${num(k * STEP, 3)}s"` : ''}/>`).join('');
  const marker = (bin) => {
    const [cx, cy] = [x(bin.meanProbability), y(bin.frequency)];
    if (bin.position === 'inside') return `<circle cx="${num(cx)}" cy="${num(cy)}" r="3.6"/>`;
    const s = 5;
    const tip = bin.position === 'above' ? -1 : 1;
    return `<path d="${polyline([[cx, cy + tip * s], [cx - s, cy - tip * s * 0.75], [cx + s, cy - tip * s * 0.75]], true)}"/>`;
  };
  const grid = [0.25, 0.5, 0.75].map((t) => `M${num(x(0))} ${num(y(t))}H${num(x(1))}M${num(x(t))} ${num(y(0))}V${num(y(1))}`).join('');
  const body = `<path class="grid" d="${grid}"/>
<path class="axes" d="M${x(0)} ${y(1)}V${y(0)}H${x(1)}"/>
<g class="worlds">${worlds}</g>
<path class="diagonal" d="M${x(0)} ${y(0)}L${x(1)} ${y(1)}"/>
<g class="picked">${picked}</g>
<path class="observed" d="${line(bins.map((b) => b.frequency))}"/>
<g class="markers">${bins.map(marker).join('')}</g>`;

  const period = (PICKED + 1) * STEP;
  const p = (t) => num((100 * t) / period, 3);
  return art({
    name: 'forecast-calibration',
    period: num(period, 3),
    body,
    // The tool's colours: black worlds and #c62828 observed on light, white and #ff6b6b on dark.
    css: `& .grid { fill: none; stroke: var(--art-line); stroke-width: 0.6; }
& .axes { fill: none; stroke: var(--art-muted); stroke-width: 1; }
& .worlds path { fill: none; stroke: var(--art-ink); stroke-opacity: 0.032; stroke-width: 1; }
& .diagonal { stroke: var(--art-muted); stroke-width: 1.3; stroke-dasharray: 5 4; }
& .picked path { fill: none; stroke: var(--art-ink); stroke-width: 1.8; stroke-linejoin: round; opacity: 0; }
& .observed { fill: none; stroke: #c62828; stroke-width: 2.6; stroke-linejoin: round; }
& .markers > * { fill: #c62828; stroke: var(--surface); stroke-width: 1.2; }
:root[data-theme="dark"] & .observed { stroke: #ff6b6b; }
:root[data-theme="dark"] & .markers > * { fill: #ff6b6b; }`,
    loop: `& .picked path { animation: forecast-calibration-pick ${num(period, 3)}s linear infinite; }
@keyframes forecast-calibration-pick { 0% { opacity: 0; } ${p(STEP)}% { opacity: 0.9; } ${p(2 * STEP)}% { opacity: 0; } 100% { opacity: 0; } }`,
  });
}
