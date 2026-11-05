// Figures for the backpack fallacy, as SVG strings (no DOM access). Each group size keeps
// one colour (categorical slots 1–6, in the order of the sizes) and one marker in every
// figure, and is named in the legend and beside its line.

import { axisBottom, axisLeft, el, linePath, marker, niceTicks, scaleLinear, svgRoot, text, textWidth } from '../lib/plot.js';

/** @typedef {[number, number]} Point */
/** @typedef {import('../lib/plot.js').Shape} Shape */

const SHAPES = /** @type {const} */ (['circle', 'triangle', 'square', 'diamond', 'circle', 'triangle']);
const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (/** @type {number} */ n) => String(n).split('').map((c) => SUPERSCRIPT[/** @type {keyof typeof SUPERSCRIPT} */ (c)]).join('');

/** The marker of the k-th size: filled shapes first, then hollow ones. @param {number} k */
export function sizeMark(k) {
  return { shape: /** @type {Shape} */ (SHAPES[k]), mark: `${k >= 4 ? 'k-hollow' : 'k-mark'} k${k}` };
}

/** A p-value 10^−x as text: "1", "0.1", "0.01", "0.001", then "10⁻⁴". @param {number} x */
export function pLabel(x) {
  if (x <= 3 && Number.isInteger(x)) return x === 0 ? '1' : (10 ** -x).toFixed(x);
  if (Number.isInteger(x)) return `10${sup(-x)}`;
  const p = 10 ** -x;
  const [mantissa, exponent] = p.toExponential(1).split('e');
  return Number(exponent) >= -3 ? String(Number(p.toPrecision(2))) : `${mantissa.replace(/\.0$/, '')} × 10${sup(Number(exponent))}`;
}

/** A difference in SDs on a log axis: 0.001 … 100, then 10³. @param {number} e power of ten */
const differenceLabel = (e) => (e >= -3 && e <= 2 ? String(Number((10 ** e).toPrecision(1))) : `10${sup(e)}`);

/**
 * Spreads labels apart vertically, at least `gap` px, keeping their order.
 * @param {{ y: number }[]} labels sorted by y @param {number} gap @param {number} top @param {number} bottom
 */
function spread(labels, gap, top, bottom) {
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + gap);
  const over = labels.length ? labels[labels.length - 1].y - bottom : 0;
  if (over > 0) for (const l of labels) l.y -= over;
  for (let i = labels.length - 2; i >= 0; i--) labels[i].y = Math.min(labels[i].y, labels[i + 1].y - gap);
  if (labels.length && labels[0].y < top) for (const l of labels) l.y += top - labels[0].y;
}

/**
 * P(the smaller study has the larger true effect) against the shared p-value, for the
 * chosen smaller size against each larger one; the other pairs are faint context. The
 * script's window average, when asked for, is dashed. A vertical line marks `at`.
 * @param {any} result compute()'s result
 * @param {{ width: number, height: number, smaller: number, at: number, windowed?: boolean, compact?: boolean }} options
 */
export function curvesFigure(result, { width, height, smaller, at, windowed = false, compact = false }) {
  const narrow = width < 480;
  const labelled = !compact && !narrow;
  const left = compact ? 6 : 44;
  const right = compact ? 6 : 14;
  const upper = compact ? 8 : 18;
  const bottom = compact ? 6 : 46;
  const xs = result.x;
  const upTo = xs[xs.length - 1];
  const x = scaleLinear([0, upTo], [left, width - right]);
  const chosen = result.pairs.filter((/** @type {any} */ p) => p.smaller === smaller);
  const values = result.pairs.flatMap((/** @type {any} */ p) => [...p.matched, ...(windowed && p.windowed ? p.windowed : [])]);
  const floor = Math.min(0.5, Math.floor(Math.min(...values) * 10) / 10);
  const y = scaleLinear([floor, 1], [height - bottom, upper]);
  const index = (/** @type {number} */ n) => result.studies.findIndex((/** @type {any} */ s) => s.n === n);
  const path = (/** @type {number[]} */ v) => linePath(v.map((p, k) => /** @type {Point} */ ([x(xs[k]), y(p)])));
  const parts = [];
  if (!compact) {
    const step = upTo > 16 ? 5 : upTo > 8 ? 2 : 1;
    const ticks = [];
    for (let t = 0; t <= upTo + 1e-9; t += step) ticks.push(t);
    parts.push(
      axisLeft({ scale: y, x: left, ticks: niceTicks(floor, 1, 5), format: (v) => `${Math.round(v * 100)}%`, gridTo: width - right }),
      axisBottom({ scale: x, y: height - bottom, ticks, format: pLabel, label: 'the p-value both studies report', labelGap: 36 }),
    );
  }
  parts.push(el('line', { x1: left, x2: width - right, y1: y(0.5), y2: y(0.5), class: 'ink-line dashed thin-dash' }));
  if (!compact) parts.push(text(width - right - 4, y(0.5) - 5, 'even odds', { class: 'axis-label halo', 'text-anchor': 'end' }));
  for (const p of result.pairs) if (p.smaller !== smaller) parts.push(el('path', { d: path(p.matched), class: 'context-line' }));
  const ax = x(Math.min(at, upTo));
  parts.push(el('line', { x1: ax, x2: ax, y1: upper - 6, y2: height - bottom, class: 'at-line' }));
  /** @type {{ y: number, line: number, k: number, text: string }[]} */
  const labels = [];
  for (const p of chosen) {
    const k = index(p.larger);
    if (windowed && p.windowed) parts.push(el('path', { d: path(p.windowed), class: `k-line k${k} dashed` }));
    parts.push(el('path', { d: path(p.matched), class: `k-line k${k}` }));
    // Markers at a few points along the line and where it crosses the marked p-value.
    const m = sizeMark(k);
    const every = Math.max(1, Math.round(xs.length / (compact ? 4 : 6)));
    for (let i = Math.round(every / 2) + k * 2; i < xs.length; i += every) parts.push(marker(m.shape, x(xs[i]), y(p.matched[i]), compact ? 3.2 : 4, m.mark));
    if (at <= upTo) {
      const i = Math.min(xs.length - 1, Math.round(at / (xs[1] - xs[0])));
      parts.push(marker(m.shape, ax, y(p.matched[i]), compact ? 3.6 : 5, m.mark));
    }
    // Labelled where the lines start, at p = 1, since they all converge towards 100%.
    const first = y(p.matched[0]);
    labels.push({ y: first < upper + 24 ? first + 16 : first - 7, line: first, k, text: `vs ${p.larger.toLocaleString('en-US')}` });
  }
  if (labelled) {
    labels.sort((a, b) => a.y - b.y);
    spread(labels, 15, upper + 12, height - bottom - 6);
    for (const l of labels) {
      const m = sizeMark(l.k);
      parts.push(marker(m.shape, left + 12, l.y - 4, 3.6, m.mark), text(left + 20, l.y, l.text, { class: 'direct-label halo' }));
    }
  }
  if (!compact) {
    parts.push(text(left - 40, upper - 8, 'chance the smaller study has the larger true effect', { class: 'axis-label', 'text-anchor': 'start' }));
    parts.push(el('rect', { x: left, y: upper - 6, width: width - right - left, height: height - bottom - upper + 6, class: 'scrub-hit' }));
  }
  const summary = chosen.map((/** @type {any} */ p) => {
    const i = Math.min(xs.length - 1, Math.round(at / (xs[1] - xs[0])));
    return `against ${p.larger} per group, ${Math.round(p.matched[i] * 100)}%`;
  }).join('; ');
  return svgRoot({
    width, height,
    label: `The chance that a study with ${smaller} per group has the larger true difference than a larger study with the same p-value, as the p-value shrinks. At p = ${pLabel(at)}: ${summary}.`,
    className: compact ? '' : 'scrub-plot',
  }, ...parts);
}

/**
 * Each size's distribution of |true difference| at one p-value: one row per size, its
 * density on a log axis (each scaled to its own peak), the middle 50% and 90% as bars
 * and the median as the size's marker.
 * @param {any} at compute()'s result.at
 * @param {{ width: number, height: number }} size
 */
export function ridgeFigure(at, { width, height }) {
  const narrow = width < 480;
  const full = (/** @type {number} */ n) => `${n.toLocaleString('en-US')} per group`;
  const short = (/** @type {number} */ n) => `n = ${n.toLocaleString('en-US')}`;
  const widest = (/** @type {(n: number) => string} */ f) => Math.max(...at.studies.map((/** @type {any} */ s) => textWidth(f(s.n))));
  const name = !narrow && widest(full) <= 120 ? full : short;
  const left = widest(name) + 16;
  const right = 14;
  const upper = 10;
  const bottom = 46;
  const grid = at.studies[0].curve.log10;
  const lo = grid[0];
  const hi = grid[grid.length - 1];
  const x = scaleLinear([lo, hi], [left, width - right]);
  const rows = at.studies.length;
  const rowHeight = (height - upper - bottom) / rows;
  const parts = [];
  const ticks = [];
  const every = Math.max(1, Math.ceil((hi - lo) / (narrow ? 4 : 7)));
  for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) if ((e % every + every) % every === 0) ticks.push(e);
  for (const t of ticks) parts.push(el('line', { x1: x(t), x2: x(t), y1: upper, y2: height - bottom, class: 'grid' }));
  parts.push(axisBottom({ scale: x, y: height - bottom, ticks, format: differenceLabel, label: narrow ? 'true difference, in SDs (log scale)' : 'true difference between the groups, in SDs (log scale)', labelGap: 36 }));
  at.studies.forEach((/** @type {any} */ s, /** @type {number} */ k) => {
    const base = upper + rowHeight * (k + 1) - 12;
    const peak = Math.max(...s.curve.density);
    const h = rowHeight - 18;
    /** @type {Point[]} */
    const pts = s.curve.log10.map((/** @type {number} */ g, /** @type {number} */ i) => [x(g), base - (s.curve.density[i] / peak) * h]);
    parts.push(el('path', { d: `${linePath(pts)}L${x(hi)} ${base}L${x(lo)} ${base}Z`, class: `k-soft k${k}` }),
      el('path', { d: linePath(pts), class: `k-line k${k}` }),
      el('line', { x1: left, x2: width - right, y1: base, y2: base, class: 'baseline' }));
    const q = s.quantiles;
    const lx = (/** @type {number} */ v) => x(Math.log10(v));
    parts.push(el('line', { x1: lx(q.q05), x2: lx(q.q95), y1: base + 6, y2: base + 6, class: `k-bar k${k} thin` }),
      el('line', { x1: lx(q.q25), x2: lx(q.q75), y1: base + 6, y2: base + 6, class: `k-bar k${k}` }));
    const m = sizeMark(k);
    parts.push(marker(m.shape, lx(q.q50), base + 6, 4.5, m.mark));
    parts.push(text(left - 8, base - 2, name(s.n), { class: 'direct-label', 'text-anchor': 'end' }));
  });
  return svgRoot({
    width, height,
    label: `At p = ${pLabel(at.x)}, the likely true difference of each study: ${at.studies.map((/** @type {any} */ s) => `${s.n} per group, median ${Number(s.quantiles.q50.toPrecision(2))} SD`).join('; ')}.`,
  }, ...parts);
}
