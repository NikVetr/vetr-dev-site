// Forecast Calibration: the page's example (48 synthetic predictions, its default settings) as
// the tool's calibration plot, simplified: realized frequency against stated probability, the
// observed line with the tool's markers (a circle inside the middle 95% of calibrated worlds, a
// triangle pointing the way out of it), over 150 of the simulated calibrated worlds and the
// dashed line of perfect calibration, with the tool's legend below the plot as it draws it. The
// loop picks out eight of those worlds in turn, each fading in and out across the next, and ends
// with none picked out, as it starts.
import { readFileSync } from 'node:fs';
import { submit } from '../../../forecast-calibration/core/index.js';
import { TALL, art, esc, num, polyline } from '../svg.mjs';

const { width: W, height: H } = TALL;   // a 1x3 tile

const WORLDS = 150;
const PICKED = 8;
const STEP = 0.55;   // seconds between picked worlds; each shows for two steps

export function build() {
  const table = readFileSync(new URL('../../../forecast-calibration/examples/synthetic.csv', import.meta.url), 'utf8');
  const result = submit({ table });
  const bins = result.bins;
  const [left, right, top, bottom] = [14, W - 10, 14, 14 + (W - 24)];
  const x = (/** @type {number} */ p) => left + p * (right - left);
  const y = (/** @type {number} */ f) => bottom - f * (bottom - top);
  const line = (/** @type {number[]} */ freqs) => polyline(freqs.map((f, b) => [x(bins[b].meanProbability), y(f)]));
  const freqs = (/** @type {number[]} */ world) => world.map((hits, b) => hits / bins[b].n);

  const worlds = result.worlds.slice(0, WORLDS).map((w) => `<path d="${line(freqs(w))}"/>`).join('');
  const picked = result.worlds.slice(WORLDS, WORLDS + PICKED)
    .map((w, k) => `<path d="${line(freqs(w))}"${k ? ` style="animation-delay:${num(k * STEP, 3)}s"` : ''}/>`).join('');
  const marker = (/** @type {typeof bins[number]} */ bin) => {
    const [cx, cy] = [x(bin.meanProbability), y(bin.frequency)];
    if (bin.position === 'inside') return `<circle cx="${num(cx)}" cy="${num(cy)}" r="3.6"/>`;
    const s = 5;
    const tip = bin.position === 'above' ? -1 : 1;
    return `<path d="${polyline([[cx, cy + tip * s], [cx - s, cy - tip * s * 0.75], [cx + s, cy - tip * s * 0.75]], true)}"/>`;
  };
  const grid = [0.25, 0.5, 0.75].map((t) => `M${num(x(0))} ${num(y(t))}H${num(x(1))}M${num(x(t))} ${num(y(0))}V${num(y(1))}`).join('');
  // The tool's legend, one row per mark, below the axes.
  const rows = [
    [`<path class="observed" d="M0 0H22"/><circle class="mark" cx="11" cy="0" r="3.6"/>`, 'Observed frequency'],
    [`<path class="mark" d="${polyline([[5, -5], [0, 3.75], [10, 3.75]], true)}"/><path class="mark" d="${polyline([[17, 5], [12, -3.75], [22, -3.75]], true)}"/>`, `Outside the middle ${Math.round(result.settings.interval * 100)}% of worlds`],
    [`<path class="world-sample" d="M0 0H22"/>`, `Calibrated worlds (${WORLDS} drawn)`],
    [`<path class="diagonal" d="M0 0H22"/>`, 'Perfect calibration'],
  ];
  const legendTop = bottom + 22;
  const legend = `<g class="legend">${rows.map(([mark, label], i) => `<g transform="translate(${left} ${legendTop + i * 19})">${mark}<text x="30" y="0">${esc(label)}</text></g>`).join('')}</g>`;
  if (legendTop + 3 * 19 + 8 > H) throw new Error('forecast-calibration: the legend does not fit');
  const body = `<path class="grid" d="${grid}"/>
<path class="axes" d="M${x(0)} ${y(1)}V${y(0)}H${x(1)}"/>
<g class="worlds">${worlds}</g>
<path class="diagonal" d="M${x(0)} ${y(0)}L${x(1)} ${y(1)}"/>
<g class="picked">${picked}</g>
<path class="observed" d="${line(bins.map((b) => b.frequency))}"/>
<g class="markers">${bins.map(marker).join('')}</g>
${legend}`;

  const period = (PICKED + 1) * STEP;
  const p = (/** @type {number} */ t) => num((100 * t) / period, 3);
  return art({
    name: 'forecast-calibration',
    period,
    width: W,
    height: H,
    body,
    // The tool's colours: black worlds and #c62828 observed on light, white and #ff6b6b on dark.
    css: `& .grid { fill: none; stroke: var(--art-line); stroke-width: 0.6; }
& .axes { fill: none; stroke: var(--art-muted); stroke-width: 1; }
& .worlds path { fill: none; stroke: var(--art-ink); stroke-opacity: 0.032; stroke-width: 1; }
& .diagonal { stroke: var(--art-muted); stroke-width: 1.3; stroke-dasharray: 5 4; }
& .picked path { fill: none; stroke: var(--art-ink); stroke-width: 1.8; stroke-linejoin: round; opacity: 0; }
& .observed { fill: none; stroke: #c62828; stroke-width: 2.6; stroke-linejoin: round; }
& .markers > *, & .mark { fill: #c62828; stroke: var(--surface); stroke-width: 1.2; }
& .world-sample { stroke: var(--art-ink); stroke-opacity: 0.45; stroke-width: 1; }
& .legend text { fill: var(--art-ink); font: 8.5px ui-sans-serif, system-ui, sans-serif; dominant-baseline: central; }
:root[data-theme="dark"] & .observed { stroke: #ff6b6b; }
:root[data-theme="dark"] & .markers > *, :root[data-theme="dark"] & .mark { fill: #ff6b6b; }`,
    loop: `& .picked path { animation: forecast-calibration-pick ${num(period, 3)}s linear infinite; }
@keyframes forecast-calibration-pick { 0% { opacity: 0; } ${p(STEP)}% { opacity: 0.9; } ${p(2 * STEP)}% { opacity: 0; } 100% { opacity: 0; } }`,
  });
}
