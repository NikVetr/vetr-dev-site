// Figures for the samplers, as SVG strings (no DOM access). A chain figure has a still part
// (axes and the target's contours, drawn once per result) and a moving part (the path up
// to the iteration shown, and that iteration's proposal or leapfrog trajectory), which the
// page redraws as the chain plays. Accepted moves are solid with filled markers, rejected
// ones dashed with hollow markers, divergent ones an alert-coloured ×. Where a chain with
// the wrong Hastings ratio settles is orange and dashed.

import { axisBottom, axisLeft, el, isoline, linePath, marker, niceTicks, r2, scaleLinear, svgRoot, text } from '../lib/plot.js';

/** @typedef {[number, number]} Point */
/** @typedef {import('../lib/plot.js').Scale} Scale */
/** @typedef {{ x: [number, number], y: [number, number] }} Domain */

/**
 * Highest-density levels holding the given shares of a grid's mass (within the grid).
 * @param {Float64Array} values log densities @param {number[]} shares
 */
function hpdLevels(values, shares) {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  const w = Array.from(values, (v) => Math.exp(v - max)).sort((a, b) => b - a);
  const total = w.reduce((s, v) => s + v, 0);
  return shares.map((share) => {
    let acc = 0;
    for (const v of w) {
      acc += v;
      if (acc >= share * total) return Math.log(v) + max;
    }
    return -Infinity;
  });
}

/**
 * The still part of a chain figure: frame, axes and the density's 50%, 90% and 99%
 * contours, or a funnel's walls. Returns the markup and the scales; the moving part goes
 * in the group with id `${id}-chain`.
 * @param {{ width: number, height: number, domain: Domain, logDensity?: (p: Point) => number, walls?: number, xLabel: string, yLabel: string, id: string, label: string, compact?: boolean,
 *   layer?: (x: Scale, y: Scale) => string }} options `layer`, if given, fills the moving part now
 */
export function chainFigure({ width, height, domain, logDensity, walls, xLabel, yLabel, id, label, compact = false, layer }) {
  const left = compact ? 4 : 44;
  const right = compact ? 4 : 10;
  const upper = compact ? 4 : 10;
  const bottom = compact ? 4 : 42;
  const x = scaleLinear(domain.x, [left, width - right]);
  const y = scaleLinear(domain.y, [height - bottom, upper]);
  const parts = [el('clipPath', { id: `${id}-clip` }, el('rect', { x: left, y: upper, width: width - left - right, height: height - upper - bottom }))];
  if (!compact) {
    parts.push(
      axisLeft({ scale: y, x: left, ticks: niceTicks(domain.y[0], domain.y[1], 5), format: tick, gridTo: width - right }),
      axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(domain.x[0], domain.x[1], width < 340 ? 4 : 6), format: tick, label: xLabel, labelGap: 34 }),
      text(left - 38, upper - 2, yLabel, { class: 'axis-label', 'text-anchor': 'start', 'dominant-baseline': 'hanging' }),
    );
  }
  const shapes = [];
  if (walls !== undefined) {
    // The funnel: 50% and 95% of x for each y lie within ±0.674 e^y and ±1.96 e^y.
    for (const [k, cls] of /** @type {const} */ ([[1.959964, 'contour c90'], [0.67449, 'contour c50']])) {
      for (const sign of [-1, 1]) {
        /** @type {Point[]} */
        const pts = [];
        for (let s = 0; s <= 160; s++) {
          const yy = domain.y[0] + ((domain.y[1] - domain.y[0]) * s) / 160;
          pts.push([x(sign * k * Math.exp(yy)), y(yy)]);
        }
        shapes.push(el('path', { d: linePath(pts), class: cls }));
      }
    }
  } else if (logDensity) {
    const nx = Math.max(40, Math.min(110, Math.round((width - left - right) / 4)));
    const ny = Math.max(40, Math.min(110, Math.round((height - upper - bottom) / 4)));
    const values = new Float64Array(nx * ny);
    const gx = (/** @type {number} */ i) => domain.x[0] + ((domain.x[1] - domain.x[0]) * i) / (nx - 1);
    const gy = (/** @type {number} */ j) => domain.y[0] + ((domain.y[1] - domain.y[0]) * j) / (ny - 1);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = logDensity([gx(i), gy(j)]);
    const levels = hpdLevels(values, [0.5, 0.9, 0.99]);
    const at = (/** @type {number} */ i, /** @type {number} */ j) => /** @type {Point} */ ([x(gx(i)), y(gy(j))]);
    ['contour c50', 'contour c90', 'contour c99'].forEach((cls, k) => shapes.push(el('path', { d: isoline(values, nx, ny, levels[k], at), class: cls })));
  }
  parts.push(el('g', { 'clip-path': `url(#${id}-clip)` }, ...shapes, el('g', { id: `${id}-settled` }), el('g', { id: `${id}-chain` }, layer ? layer(x, y) : '')));
  return { svg: svgRoot({ width, height, label }, ...parts), x, y };
}

/** Dashed contours of a second density (where a chain settles), to put in `${id}-settled`. */
export function settledContours(/** @type {{ x: Scale, y: Scale, domain: Domain, logDensity: (p: Point) => number }} */ { x, y, domain, logDensity }) {
  const nx = 90;
  const ny = 90;
  const values = new Float64Array(nx * ny);
  const gx = (/** @type {number} */ i) => domain.x[0] + ((domain.x[1] - domain.x[0]) * i) / (nx - 1);
  const gy = (/** @type {number} */ j) => domain.y[0] + ((domain.y[1] - domain.y[0]) * j) / (ny - 1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = logDensity([gx(i), gy(j)]);
  const levels = hpdLevels(values, [0.5, 0.9]);
  const at = (/** @type {number} */ i, /** @type {number} */ j) => /** @type {Point} */ ([x(gx(i)), y(gy(j))]);
  return levels.map((level, k) => el('path', { d: isoline(values, nx, ny, level, at), class: `settled-contour ${k ? 'c90' : 'c50'}` })).join('');
}

/** A tick label with a typographic minus. @param {number} v */
const tick = (v) => String(v).replace(/^-/, '−');

/**
 * The moving part: the path through the first `i + 1` states, then iteration i's move,
 * drawn up to `fraction` of the way (a leapfrog trajectory step by step, or the proposal),
 * divergent transitions so far as ×, and the current state.
 * @param {{ a: ArrayLike<number>, b: ArrayLike<number>, accepted: ArrayLike<number>, divergent: number[], trajectories: number[][] | null, proposals: { a: ArrayLike<number>, b: ArrayLike<number> } | null }} chain
 * @param {Scale} x @param {Scale} y @param {number} t iterations shown (fractional: partway through the next)
 */
export function chainLayer(chain, x, y, t) {
  const n = chain.accepted.length;
  const i = Math.min(n, Math.floor(t));
  const fraction = i < n ? t - i : 0;
  const parts = [];
  // The path: up to 3,000 points as one line; longer runs keep every k-th state.
  const every = Math.max(1, Math.ceil((i + 1) / 3000));
  const pts = [];
  for (let k = 0; k <= i; k += every) pts.push(`${r2(x(chain.a[k]))},${r2(y(chain.b[k]))}`);
  if (i % every) pts.push(`${r2(x(chain.a[i]))},${r2(y(chain.b[i]))}`);
  parts.push(el('polyline', { points: pts.join(' '), class: 'chain-path' }));
  for (const k of chain.divergent) {
    if (k >= i) break;
    parts.push(cross(x(chain.a[k]), y(chain.b[k]), 'divergent-mark'));
  }
  const cx = x(chain.a[i]);
  const cy = y(chain.b[i]);
  if (fraction > 0) {
    const ok = chain.accepted[i] === 1;
    const diverged = chain.divergent.includes(i);
    if (chain.trajectories) {
      const path = chain.trajectories[i];
      const steps = path.length / 2 - 1;
      const shown = Math.max(1, Math.ceil(fraction * steps));
      /** @type {Point[]} */
      const tp = [];
      for (let s = 0; s <= shown; s++) tp.push([x(path[2 * s]), y(path[2 * s + 1])]);
      parts.push(el('path', { d: linePath(tp), class: `trajectory${ok ? '' : ' rejected'}` }));
      const end = tp[tp.length - 1];
      if (shown === steps) parts.push(diverged ? cross(end[0], end[1], 'divergent-mark') : marker('circle', end[0], end[1], 4, ok ? 'move-mark' : 'move-hollow'));
    } else if (chain.proposals) {
      const px = x(chain.proposals.a[i]);
      const py = y(chain.proposals.b[i]);
      parts.push(el('line', { x1: cx, y1: cy, x2: cx + (px - cx) * Math.min(1, fraction * 2), y2: cy + (py - cy) * Math.min(1, fraction * 2), class: `proposal${ok ? '' : ' rejected'}` }));
      if (fraction >= 0.5) parts.push(marker('circle', px, py, 4, ok ? 'move-mark' : 'move-hollow'));
    }
  }
  parts.push(marker('circle', cx, cy, 5.5, 'current-mark'));
  return parts.join('');
}

/** An × marker. @param {number} px @param {number} py @param {string} cls */
function cross(px, py, cls) {
  const s = 4;
  return el('path', { d: `M${r2(px - s)} ${r2(py - s)}L${r2(px + s)} ${r2(py + s)}M${r2(px - s)} ${r2(py + s)}L${r2(px + s)} ${r2(py - s)}`, class: cls });
}

/**
 * One coordinate's draws against the iteration, up to `t`, with exact quantiles as dashed
 * lines.
 * @param {ArrayLike<number>} values every state, the start first
 * @param {{ width: number, height: number, t: number, range: [number, number], quantiles?: { value: number, label: string }[], label: string, yLabel: string, id: string }} options
 */
export function traceFigure(values, { width, height, t, range, quantiles = [], label, yLabel, id }) {
  const left = 44;
  const right = 40;
  const upper = 10;
  const bottom = 40;
  const n = values.length - 1;
  const x = scaleLinear([0, n], [left, width - right]);
  const y = scaleLinear(range, [height - bottom, upper]);
  const parts = [
    el('clipPath', { id: `${id}-clip` }, el('rect', { x: left, y: upper, width: width - left - right, height: height - upper - bottom })),
    axisLeft({ scale: y, x: left, ticks: niceTicks(range[0], range[1], 4), format: tick, gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(0, n, width < 360 ? 3 : 5), format: (v) => v.toLocaleString('en-US'), label: 'iteration', labelGap: 34 }),
    text(left - 38, upper - 2, yLabel, { class: 'axis-label', 'text-anchor': 'start', 'dominant-baseline': 'hanging' }),
  ];
  for (const q of quantiles) {
    parts.push(el('line', { x1: left, x2: width - right, y1: y(q.value), y2: y(q.value), class: 'quantile-line' }),
      text(width - right + 4, y(q.value) + 4, q.label, { class: 'small' }));
  }
  const i = Math.min(n, Math.floor(t));
  const every = Math.max(1, Math.ceil((i + 1) / 2000));
  const pts = [];
  for (let k = 0; k <= i; k += every) pts.push(`${r2(x(k))},${r2(y(values[k]))}`);
  parts.push(el('g', { 'clip-path': `url(#${id}-clip)` }, el('polyline', { points: pts.join(' '), class: 'trace-line' })));
  return svgRoot({ width, height, label }, ...parts);
}

/**
 * A histogram of the draws so far (as a density) against exact densities: the target
 * solid, and where a chain settles dashed.
 * @param {ArrayLike<number>} values @param {{ width: number, height: number, t: number, range: [number, number], density: (v: number) => number,
 *   settled?: ((v: number) => number) | null, label: string, xLabel: string, bins?: number }} options
 */
export function histogramFigure(values, { width, height, t, range, density, settled = null, label, xLabel, bins = 40 }) {
  const left = 12;
  const right = 10;
  const upper = 10;
  const bottom = 38;
  const x = scaleLinear(range, [left, width - right]);
  const i = Math.min(values.length - 1, Math.floor(t));
  const counts = new Float64Array(bins);
  const w = (range[1] - range[0]) / bins;
  for (let k = 1; k <= i; k++) {
    const b = Math.floor((values[k] - range[0]) / w);
    if (b >= 0 && b < bins) counts[b]++;
  }
  const curve = (/** @type {(v: number) => number} */ f) => Array.from({ length: 161 }, (_, k) => {
    const v = range[0] + ((range[1] - range[0]) * k) / 160;
    return /** @type {Point} */ ([v, f(v)]);
  });
  const exact = curve(density);
  const other = settled ? curve(settled) : [];
  const heights = Array.from(counts, (c) => (i ? c / (i * w) : 0));
  const top = Math.max(...exact.map((p) => p[1]), ...other.map((p) => p[1]), ...heights) * 1.08 || 1;
  const y = scaleLinear([0, top], [height - bottom, upper]);
  const parts = [axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(range[0], range[1], width < 340 ? 4 : 6), format: tick, label: xLabel, labelGap: 32 })];
  heights.forEach((h, b) => {
    if (h > 0) parts.push(el('rect', { x: x(range[0] + b * w) + 0.5, y: y(h), width: Math.max(0.5, x(range[0] + w) - x(range[0]) - 1), height: y(0) - y(h), class: 'hist-bar' }));
  });
  parts.push(el('path', { d: linePath(exact.map(([v, f]) => [x(v), y(f)])), class: 'ink-line' }));
  if (settled) parts.push(el('path', { d: linePath(other.map(([v, f]) => [x(v), y(f)])), class: 'settled-line' }));
  return svgRoot({ width, height, label }, ...parts);
}
