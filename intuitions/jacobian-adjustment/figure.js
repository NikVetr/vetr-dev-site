// Figures for the Jacobian adjustment, as SVG strings (no DOM access). What the model samples
// is blue: its contours, its filled densities and its draws. The priors the model states are
// black and dashed, so where the two agree the dashes lie on the blue line. A target that is
// not a distribution is drawn at levels relative to its highest point, in the alert colour.

import { axisBottom, axisLeft, el, isoline, linePath, niceTicks, scaleLinear, svgRoot, text } from '../lib/plot.js';
import { label } from './compute.js';

/** @typedef {[number, number]} Point */
/** @typedef {import('../lib/plot.js').Scale} Scale */

const tick = (/** @type {number} */ v) => String(v).replace(/^-/, '−');

/**
 * The density over the sampled parameters: contours holding 50% and 90% of the mass, or,
 * for a target that is not a distribution, lines at ½ and 1/20 of its highest value in the
 * window. The square samples a alone, so its figure is a's density.
 * @param {any} result compute()'s result for the transform view
 * @param {((p: Point) => number) | null} logDensity jointLogDensity(params)
 * @param {{ width: number, height: number, id: string, compact?: boolean }} options
 */
export function sampledFigure(result, logDensity, { width, height, id, compact = false }) {
  if (!result.joint) return squareFigure(result, { width, height, compact });
  const left = compact ? 4 : 44;
  const right = compact ? 4 : 10;
  const upper = compact ? 4 : 12;
  const bottom = compact ? 4 : 42;
  const { window, levels, x: xName, y: yName } = result.joint;
  const x = scaleLinear(window.x, [left, width - right]);
  const y = scaleLinear(window.y, [height - bottom, upper]);
  const nx = Math.max(60, Math.min(160, Math.round((width - left - right) / 3)));
  const ny = Math.max(60, Math.min(160, Math.round((height - upper - bottom) / 3)));
  const values = new Float64Array(nx * ny);
  const gx = (/** @type {number} */ i) => window.x[0] + ((window.x[1] - window.x[0]) * i) / (nx - 1);
  const gy = (/** @type {number} */ j) => window.y[0] + ((window.y[1] - window.y[0]) * j) / (ny - 1);
  let max = -Infinity;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = /** @type {(p: Point) => number} */ (logDensity)([gx(i), gy(j)]);
      values[j * nx + i] = v;
      if (v > max) max = v;
    }
  }
  const at = (/** @type {number} */ i, /** @type {number} */ j) => /** @type {Point} */ ([x(gx(i)), y(gy(j))]);
  const parts = [el('clipPath', { id: `${id}-clip` }, el('rect', { x: left, y: upper, width: width - left - right, height: height - upper - bottom }))];
  if (!compact) {
    parts.push(
      axisLeft({ scale: y, x: left, ticks: niceTicks(window.y[0], window.y[1], 5), format: tick, gridTo: width - right }),
      axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(window.x[0], window.x[1], width < 300 ? 5 : 7), format: tick, label: xName, labelGap: 34 }),
      text(left - 38, upper - 4, yName, { class: 'axis-label', 'text-anchor': 'start', 'dominant-baseline': 'hanging' }),
    );
  }
  const shapes = [];
  if (levels) {
    shapes.push(el('path', { d: isoline(values, nx, ny, levels.q90, at), class: 'sampled-contour c90' }));
    shapes.push(el('path', { d: isoline(values, nx, ny, levels.q50, at), class: 'sampled-contour c50' }));
  } else {
    shapes.push(el('path', { d: isoline(values, nx, ny, max + Math.log(1 / 20), at), class: 'improper-contour c90' }));
    shapes.push(el('path', { d: isoline(values, nx, ny, max + Math.log(1 / 2), at), class: 'improper-contour c50' }));
  }
  parts.push(el('g', { 'clip-path': `url(#${id}-clip)` }, ...shapes));
  if (!levels && !compact) {
    parts.push(text(x(0) + 8, upper + 16, '↑ no end along a = 0', { class: 'direct-label improper-label halo' }));
    parts.push(text(x(0) + 8, height - bottom - 10, '↓', { class: 'direct-label improper-label halo' }));
  }
  const what = levels ? 'contours holding 50% and 90% of the mass' : 'lines at one half and one twentieth of its highest value; it is not a distribution';
  return svgRoot({ width, height, label: `The density over ${xName} and ${yName} that the model samples: ${what}.` }, ...parts);
}

/**
 * The square's figure: the density of a, or, where it is not a distribution, its shape
 * scaled to the window, rising without bound towards a = 0.
 * @param {any} result @param {{ width: number, height: number, compact?: boolean }} options
 */
function squareFigure(result, { width, height, compact = false }) {
  const left = compact ? 4 : 44;
  const right = compact ? 4 : 10;
  const upper = compact ? 6 : 14;
  const bottom = compact ? 4 : 42;
  const row = result.quantities[0];
  const [lo, hi] = result.sampled.window;
  const x = scaleLinear([lo, hi], [left, width - right]);
  const xs = /** @type {number[]} */ (row.curve.x);
  /** @type {string[]} */
  const parts = [];
  if (!compact) parts.push(axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(lo, hi, 5), format: tick, label: 'a', labelGap: 34 }));
  if (row.implied) {
    const ys = /** @type {number[]} */ (row.curve.implied);
    const top = Math.max(...ys.filter(Number.isFinite)) * 1.08;
    const y = scaleLinear([0, top], [height - bottom, upper]);
    if (!compact) parts.push(axisLeft({ scale: y, x: left, ticks: niceTicks(0, top, 4), format: (v) => String(v), gridTo: width - right }));
    const pts = xs.map((v, i) => /** @type {Point} */ ([x(v), y(Math.min(top, ys[i]))]));
    parts.push(el('path', { d: `${linePath(pts)}L${x(hi)} ${y(0)}L${x(lo)} ${y(0)}Z`, class: 'k-soft k0' }), el('path', { d: linePath(pts), class: 'k-line k0' }));
    return svgRoot({ width, height, label: `The density of a that the model samples, ${label(row.implied)}.` }, ...parts);
  }
  // e^{−a²/2}/a: scaled so the window's right half is legible; the rise to 0 runs off the top.
  const kernel = xs.map((v) => (v > 0 ? Math.exp(-(v * v) / 2) / v : Infinity));
  const mid = kernel[Math.round(xs.length * 0.12)];
  const top = mid * 1.4;
  const y = scaleLinear([0, top], [height - bottom, upper]);
  parts.push(el('clipPath', { id: 'square-clip' }, el('rect', { x: left, y: upper, width: width - left - right, height: height - upper - bottom })));
  const pts = xs.map((v, i) => /** @type {Point} */ ([x(v), y(Math.min(top * 1.5, kernel[i]))]));
  parts.push(el('line', { x1: left, x2: width - right, y1: y(0), y2: y(0), class: 'baseline' }));
  parts.push(el('g', { 'clip-path': 'url(#square-clip)' }, el('path', { d: linePath(pts), class: 'improper-line' })));
  if (!compact) {
    parts.push(text(left - 38, upper - 6, 'relative density', { class: 'axis-label', 'text-anchor': 'start', 'dominant-baseline': 'hanging' }));
    parts.push(text(x(lo) + 14, upper + 30, '↑ to infinity at a = 0', { class: 'direct-label improper-label halo' }));
  }
  return svgRoot({ width, height, label: 'The shape of the density over a, e^(−a²/2)/a, which rises without bound towards a = 0: it is not a distribution.' }, ...parts);
}

/**
 * Each quantity's distribution under the model (blue, filled) against the prior stated for
 * it (black, dashed), one row per quantity, each with its own axis and scaled to its own peak.
 * @param {any} result @param {{ width: number, rowHeight?: number }} options
 */
export function quantitiesFigure(result, { width, rowHeight = 78 }) {
  const left = 52;
  const right = 10;
  const rows = result.quantities;
  const height = rows.length * rowHeight + 6;
  /** @type {string[]} */
  const parts = [];
  rows.forEach((/** @type {any} */ r, /** @type {number} */ k) => {
    const top = k * rowHeight + 8;
    const base = top + rowHeight - 30;
    const xs = /** @type {number[]} */ (r.curve.x);
    const x = scaleLinear([xs[0], xs[xs.length - 1]], [left, width - right]);
    const all = [...(r.curve.implied ?? []), ...(r.curve.stated ?? [])];
    // The peak ignores the first few points, where χ²(1)'s density runs to infinity.
    const skip = Math.round(xs.length * 0.03);
    const peak = Math.max(1e-12, ...all.filter((_, i) => i % xs.length >= skip).filter(Number.isFinite)) * 1.1;
    const y = scaleLinear([0, peak], [base, top + 8]);
    const clip = `q-clip-${result.transform}-${k}`;
    const pts = (/** @type {number[]} */ ys) => xs.map((v, i) => /** @type {Point} */ ([x(v), y(Math.min(peak * 1.3, ys[i]))]));
    parts.push(el('clipPath', { id: clip }, el('rect', { x: left, y: top, width: width - left - right, height: base - top + 1 })));
    const shapes = [];
    if (r.curve.implied) {
      const p = pts(r.curve.implied);
      shapes.push(el('path', { d: `${linePath(p)}L${x(xs[xs.length - 1])} ${base}L${x(xs[0])} ${base}Z`, class: 'k-soft k0' }), el('path', { d: linePath(p), class: 'k-line k0' }));
    }
    if (r.curve.stated) shapes.push(el('path', { d: linePath(pts(r.curve.stated)), class: 'ink-line dashed' }));
    parts.push(el('g', { 'clip-path': `url(#${clip})` }, ...shapes));
    parts.push(el('line', { x1: left, x2: width - right, y1: base, y2: base, class: 'baseline' }));
    const ticks = niceTicks(xs[0], xs[xs.length - 1], width < 300 ? 5 : 7);
    parts.push(...ticks.map((t) => el('line', { x1: x(t), x2: x(t), y1: base, y2: base + 4, class: 'axis-line' })));
    parts.push(...ticks.map((t) => text(x(t), base + 16, tick(t), { class: 'tick', 'text-anchor': 'middle' })));
    parts.push(text(left - 10, base - 4, r.axis, { class: 'direct-label strong', 'text-anchor': 'end' }));
    if (!r.implied) parts.push(text(width - right, top + 6, 'no distribution', { class: 'direct-label improper-label halo', 'text-anchor': 'end' }));
  });
  const say = rows.map((/** @type {any} */ r) => `${r.axis}: ${r.implied ? label(r.implied) : 'no distribution'}${r.stated ? `, stated ${label(r.stated)}` : ''}`).join('; ');
  return svgRoot({ width, height, label: `Each quantity's distribution under this model against the prior stated for it. ${say}.` }, ...parts);
}

/** Points on the ellipse holding `share` of a bivariate normal. @param {number[][]} cov 2 × 2 @param {number} share */
function ellipse(cov, share) {
  const [[p, q], [, r]] = cov;
  const mid = (p + r) / 2;
  const half = Math.sqrt(((p - r) / 2) ** 2 + q * q);
  const l1 = mid + half;
  const l2 = Math.max(0, mid - half);
  const theta = 0.5 * Math.atan2(2 * q, p - r);
  const k = Math.sqrt(-2 * Math.log(1 - share));
  return Array.from({ length: 97 }, (_, i) => {
    const phi = (2 * Math.PI * i) / 96;
    const u = k * Math.sqrt(l1) * Math.cos(phi);
    const v = k * Math.sqrt(l2) * Math.sin(phi);
    return /** @type {Point} */ ([u * Math.cos(theta) - v * Math.sin(theta), u * Math.sin(theta) + v * Math.cos(theta)]);
  });
}

/**
 * One plane of the marginals view, (a, b) or (a, c): the stated joint's 50% and 90%
 * ellipses (blue) and the meant joint's (black, dashed). On (a, b), with the data: each
 * data point a with one draw from b's posterior, and b's posterior mean given a.
 * @param {any} result @param {{ width: number, height: number, pair: 'ab' | 'ac', compact?: boolean }} options
 */
export function planeFigure(result, { width, height, pair, compact = false }) {
  const left = compact ? 4 : 44;
  const right = compact ? 4 : 10;
  const upper = compact ? 4 : 12;
  const bottom = compact ? 4 : 42;
  const j = pair === 'ab' ? 1 : 2;
  const sub = (/** @type {number[][]} */ m) => [[m[0][0], m[0][j]], [m[j][0], m[j][j]]];
  const stated = sub(result.stated.covariance);
  const meant = sub(result.meant.covariance);
  const reach = 2.6 * Math.sqrt(Math.max(stated[1][1], meant[1][1]));
  const X = 3.2;
  const x = scaleLinear([-X, X], [left, width - right]);
  const y = scaleLinear([-reach, reach], [height - bottom, upper]);
  const name = pair === 'ab' ? 'b' : 'c';
  const parts = [el('clipPath', { id: `plane-${pair}-clip` }, el('rect', { x: left, y: upper, width: width - left - right, height: height - upper - bottom }))];
  if (!compact) {
    parts.push(
      axisLeft({ scale: y, x: left, ticks: niceTicks(-reach, reach, 5), format: tick, gridTo: width - right }),
      axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(-X, X, width < 300 ? 5 : 7), format: tick, label: 'a', labelGap: 34 }),
      text(left - 38, upper - 4, name, { class: 'axis-label', 'text-anchor': 'start', 'dominant-baseline': 'hanging' }),
    );
  }
  const shapes = [];
  const path = (/** @type {Point[]} */ pts) => linePath(pts.map(([u, v]) => /** @type {Point} */ ([x(u), y(v)])));
  if (pair === 'ab' && !compact) {
    for (let i = 0; i < result.data.a.length; i++) shapes.push(el('circle', { cx: x(result.data.a[i]), cy: y(result.data.b[i]), r: 2.4, class: 'draw-dot' }));
    const { slope } = result.conditional;
    shapes.push(el('line', { x1: x(-X), x2: x(X), y1: y(-X * slope), y2: y(X * slope), class: 'k-line k2 conditional-line' }));
  }
  shapes.push(el('path', { d: path(ellipse(meant, 0.9)), class: 'ink-line dashed thin-dash' }), el('path', { d: path(ellipse(meant, 0.5)), class: 'ink-line dashed thin-dash' }));
  shapes.push(el('path', { d: path(ellipse(stated, 0.9)), class: 'k-line k0 thin' }), el('path', { d: path(ellipse(stated, 0.5)), class: 'k-line k0' }));
  parts.push(el('g', { 'clip-path': `url(#plane-${pair}-clip)` }, ...shapes));
  const r = result.stated.correlation[pair];
  const m = result.meant.correlation[pair];
  return svgRoot({
    width, height,
    label: `a against ${name}: the joint the statements give (correlation ${r.toFixed(2)}) and the one meant (correlation ${m.toFixed(2)}), as 50% and 90% ellipses${pair === 'ab' ? ', with each data point a and one posterior draw of its b' : ''}.`,
  }, ...parts);
}
