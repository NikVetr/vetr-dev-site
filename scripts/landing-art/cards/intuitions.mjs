// Six actual gallery entries on one small mosaic. Thresholds use the normal-liability
// core, correlation arrows are the cone solution projected by the shared 3-D library,
// radial mass uses the chi density, the phylogeny is a seeded Brownian simulation,
// calibration uses the app's synthetic CSV, and the hypercube replays its saved plan.
// No parameter defaults in the applications are changed by these illustrative sweeps.
import { readFileSync } from 'node:fs';
import { compute as threshold } from '../../../intuitions/threshold-model/compute.js';
import { compute as correlation } from '../../../intuitions/correlation-geometry/compute.js';
import { chiLogDensity } from '../../../intuitions/typical-set/compute.js';
import { compute as traits } from '../../../intuitions/trait-evolution/compute.js';
import { dnorm } from '../../../intuitions/lib/normal.js';
import { orientation, project } from '../../../intuitions/lib/geom3d.js';
import { submit as calibrate } from '../../../forecast-calibration/core/index.js';
import { art, esc, flipbook, num, polyline } from '../svg.mjs';
import { hypercubeStill } from './hypercube.mjs';

const PW = 100, PH = 60;
const frames = 48;
/** @type {[number, number, string, string][]} */
const titles = [
  [4, 4, 'Thresholds', 'threshold-model'],
  [110, 4, 'Correlations', 'correlation-geometry'],
  [216, 4, 'Hypercube', 'hypercube'],
  [4, 92, 'Probability mass', 'typical-set'],
  [110, 92, 'Traits on a tree', 'trait-evolution'],
  [216, 92, 'Calibration', 'forecast-calibration'],
];
const tile = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ body) => `<g transform="translate(${x} ${y})">${body}</g>`;

/** @param {number} phase */
function movingPanels(phase) {
  const value = /** @type {any} */ (correlation({ view: 'cone', rBC: 0.6 + 0.3 * Math.sin(phase) }));
  const camera = { rotation: orientation(-20 + 25 * Math.sin(phase), 25), width: PW, height: PH, scale: 24, distance: Infinity };
  const points = [value.a, value.b, value.meets[0]];
  const centre = [PW / 2, PH / 2];
  const arrows = points.map((point, i) => {
    const projected = project(camera, point);
    const tip = [projected.x, projected.y];
    const angle = Math.atan2(tip[1] - centre[1], tip[0] - centre[0]);
    const wing = (/** @type {number} */ side) => [tip[0] - 5 * Math.cos(angle + side * 0.42), tip[1] - 5 * Math.sin(angle + side * 0.42)];
    return `<path class="arrow series-${i}" d="${polyline([centre, tip])}${polyline([wing(-1), tip, wing(1)])}"/>`;
  }).join('');
  const k = Math.round(10 + 7 * Math.sin(phase));
  const curve = Array.from({ length: 71 }, (_, i) => {
    const radius = i / 10;
    return [6 + radius / 7 * 88, 53 - Math.exp(chiLogDensity(radius, k)) / 0.8 * 43];
  });
  return tile(110, 19, `<circle class="sphere" cx="50" cy="30" r="25"/>${arrows}`)
    + tile(4, 107, `<path class="axis" d="M6 8V53H94"/><path class="mass-fill" d="${polyline(curve)}L94 53H6Z"/><path class="mass" d="${polyline(curve)}"/><text class="parameter" x="8" y="12">k = ${k}</text>`);
}

export function build() {
  const hc = hypercubeStill(234, 18, 64);
  const period = hc.plan.frames / hc.plan.stepsPerSecond;
  const sweep = period / 4;
  const flip = flipbook('intuitions-panels', Array.from({ length: frames }, (_, i) => movingPanels(i * 2 * Math.PI / frames)), sweep);
  const trait = /** @type {any} */ (threshold({ means: [0.4], thresholds: [[-0.6, 0.5, 1.4]] })).traits[0];
  const x = (/** @type {number} */ value) => 6 + (value + 4) / 8 * 88;
  const curve = Array.from({ length: 101 }, (_, i) => -5 + i / 10).map(v => [x(v), 53 - dnorm(v, trait.mean, 1) / 0.5 * 45]);
  const density = `${polyline(curve)}L${num(x(5))} 53H${num(x(-5))}Z`;
  const edges = [-4, ...trait.thresholds, 4];
  const palette = ['#77bfa8', '#488e79', '#175f4d', '#004939'];
  const defs = `<path id="intuitions-density" d="${density}"/>`
    + edges.slice(0, -1).map((lo, i) => `<clipPath id="intuitions-category-${i}"><rect x="${num(x(lo))}" y="0" width="${num(x(edges[i + 1]) - x(lo))}" height="${PH}"/></clipPath>`).join('')
    + '<clipPath id="intuitions-trait-reveal"><rect class="trait-reveal" x="0" y="0" width="100" height="60"/></clipPath>';
  const densityBands = edges.slice(0, -1).map((_, i) => `<g clip-path="url(#intuitions-category-${i})"><use class="liability" href="#intuitions-density" fill="${palette[i]}"/></g>`).join('');
  const cutoffs = trait.thresholds.map((/** @type {number} */ value) => `M${num(x(value))} 7V53`).join('');
  const liability = tile(4, 19, `${densityBands}<path class="thresholds" d="${cutoffs}"/><path class="axis" d="M6 53H94"/>`);

  const evolution = /** @type {any} */ (traits({ view: 'tree', model: 'bm', tree: { tips: 12, seed: 1 }, steps: 80, seed: 1 }));
  const values = evolution.branches.flatMap((/** @type {any} */ b) => b.values);
  const lo = Math.min(...values), hi = Math.max(...values);
  const branches = evolution.branches.map((/** @type {any} */ branch) => polyline(branch.times.map((/** @type {number} */ time, /** @type {number} */ i) => [5 + time / evolution.treeHeight * 90, 55 - (branch.values[i] - lo) / (hi - lo) * 47]))).join('');
  const phylogeny = tile(110, 107, `<path class="branch-future" d="${branches}"/><g clip-path="url(#intuitions-trait-reveal)"><path class="branch" d="${branches}"/></g>`);

  const table = readFileSync(new URL('../../../forecast-calibration/examples/synthetic.csv', import.meta.url), 'utf8');
  const result = calibrate({ table });
  const line = (/** @type {number[]} */ frequencies) => polyline(frequencies.map((f, i) => [6 + result.bins[i].meanProbability * 88, 54 - f * 48]));
  const worlds = result.worlds.slice(0, 40).map(w => `<path d="${line(w.map((hits, i) => hits / result.bins[i].n))}"/>`).join('');
  const selected = result.worlds.slice(40, 48).map((w, i) => `<path style="animation-delay:${num(i * sweep / 8, 5)}s" d="${line(w.map((hits, j) => hits / result.bins[j].n))}"/>`).join('');
  const observed = line(result.bins.map(bin => bin.frequency));
  const forecast = tile(216, 107, `<path class="axis" d="M6 6V54H94"/><path class="diagonal" d="M6 54L94 6"/><g class="worlds">${worlds}</g><g class="picked">${selected}</g><path class="observed" d="${observed}"/>`);
  const panels = titles.map(([px, py, title, entry]) => `<g data-entry="${entry}"><rect class="mini-paper" x="${px}" y="${py}" width="100" height="80" rx="4"/><text class="mini-title" x="${Number(px) + 5}" y="${Number(py) + 10}">${esc(title)}</text></g>`).join('');
  const sine = Array.from({ length: 25 }, (_, i) => `${num(i / 24 * 100, 3)}% { transform: translateX(${num(11 * Math.sin(i / 24 * 2 * Math.PI), 3)}px); }`).join(' ');
  return art({
    name: 'intuitions', period, player: 'hypercube', playerBox: hc.box, defs,
    body: `${panels}${liability}${flip.body}${phylogeny}${forecast}${hc.body}`,
    frames,
    css: `${hc.css}\n${flip.css}
& .mini-paper { fill: var(--art-paper); stroke: var(--art-line); stroke-width: .65; }
& .mini-title { fill: var(--art-ink); font: 600 8.5px ui-sans-serif, system-ui, sans-serif; }
& .parameter { fill: var(--art-muted); font: 7px ui-sans-serif, system-ui, sans-serif; }
& .axis, & .thresholds { fill: none; stroke: var(--art-muted); stroke-width: .75; }
& .sphere { fill: none; stroke: var(--art-line); stroke-width: 1; }
& .arrow { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
& .series-0 { stroke: #2a78d6; } & .series-1 { stroke: #eb6834; } & .series-2 { stroke: #1baf7a; }
& .mass-fill { fill: #2a78d6; fill-opacity: .13; }
& .mass { fill: none; stroke: #2a78d6; stroke-width: 1.7; }
& .branch-future { fill: none; stroke: var(--art-line); stroke-width: .8; }
& .branch { fill: none; stroke: #2a78d6; stroke-width: 1; }
& .diagonal { fill: none; stroke: var(--art-muted); stroke-width: .8; stroke-dasharray: 3 2; }
& .worlds path { fill: none; stroke: var(--art-ink); stroke-opacity: .06; stroke-width: .6; }
& .picked path { fill: none; stroke: var(--art-ink); stroke-opacity: .5; stroke-width: 1; opacity: 0; }
& .observed { fill: none; stroke: #c62828; stroke-width: 1.5; }
:root[data-theme="dark"] & .observed { stroke: #ff6b6b; }`,
    loop: `${flip.loop}
& .liability { animation: intuitions-liability ${num(sweep, 5)}s linear infinite; }
@keyframes intuitions-liability { ${sine} }
& .trait-reveal { transform-origin: 0 0; animation: intuitions-traits ${num(sweep, 5)}s ease-in-out infinite; }
@keyframes intuitions-traits { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(.02); } }
& .picked path { animation: intuitions-world ${num(sweep, 5)}s linear infinite; }
@keyframes intuitions-world { 0%, 25%, 100% { opacity: 0; } 12.5% { opacity: 1; } }`,
  });
}
