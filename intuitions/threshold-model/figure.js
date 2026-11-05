// Figures for the threshold model, as SVG strings (no DOM access). Category colours
// are an ordinal ramp (darker = higher category) and always come with the category's
// number; cell shading is a sequential ramp and always comes with the cell's value.

import { formatNumber, formatPercentShort, formatShare } from '../lib/format.js';
import { dnorm } from '../lib/normal.js';
import { areaPath, axisBottom, el, linePath, niceTicks, scaleLinear, svgRoot, text } from '../lib/plot.js';

export const DOMAIN = /** @type {[number, number]} */ ([-4.5, 4.5]);
export const PLANE = /** @type {[number, number]} */ ([-4, 4]);

/** Class of category c out of k on the six-step ramp. @param {number} c @param {number} k */
const rampClass = (c, k) => `cat-${k === 1 ? 0 : Math.round((c * 5) / (k - 1))}`;

/** Sequential shading bin for p relative to the largest value. @param {number} p @param {number} max */
const seqClass = (p, max) => `seq-${max > 0 ? Math.min(6, Math.floor((p / max) * 6.999)) : 0}`;

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
/** "t₁" for threshold j (0-based). @param {number} j @param {string} [prefix] */
export const thresholdName = (j, prefix = 't') => `${prefix}${String(j + 1).split('').map((d) => SUBSCRIPT[Number(d)]).join('')}`;

/**
 * One trait: the liability density N(mean, 1) with each category's area filled and a
 * handle on every threshold (data-drag="t0", "t1", …).
 * @param {{ mean: number, thresholds: number[], categories: { probability: number }[] }} trait
 * @param {{ width: number, height: number, compact?: boolean }} size
 */
export function liabilityFigure(trait, { width, height, compact = false }) {
  const pad = compact ? 2 : 10;
  const top = compact ? 4 : 34;
  const bottom = compact ? 2 : 40;
  const x = scaleLinear(DOMAIN, [pad, width - pad]);
  const base = height - bottom;
  const y = scaleLinear([0, 0.5], [base, top]);
  const k = trait.thresholds.length + 1;
  const edges = [DOMAIN[0], ...trait.thresholds, DOMAIN[1]];
  const n = Math.max(120, Math.round(width / 2));
  const f = (/** @type {number} */ v) => dnorm(v, trait.mean, 1);

  const regions = edges.slice(0, -1).map((a, c) => {
    const b = edges[c + 1];
    const steps = Math.max(2, Math.ceil(((b - a) / (DOMAIN[1] - DOMAIN[0])) * n));
    /** @type {[number, number][]} */
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const v = a + ((b - a) * i) / steps;
      pts.push([x(v), y(f(v))]);
    }
    return el('path', { d: areaPath(pts, base), class: rampClass(c, k) });
  });
  /** @type {[number, number][]} */
  const outline = [];
  for (let i = 0; i <= n; i++) {
    const v = DOMAIN[0] + ((DOMAIN[1] - DOMAIN[0]) * i) / n;
    outline.push([x(v), y(f(v))]);
  }

  const parts = [regions.join(''), el('path', { d: linePath(outline), class: 'ink-line' }), el('line', { x1: pad, x2: width - pad, y1: base, y2: base, class: 'baseline' })];
  if (compact) parts.push(...trait.thresholds.map((t) => el('line', { x1: x(t), x2: x(t), y1: base, y2: top, class: 'threshold-line' })));
  else {
    // Category numbers centred in each column, above the curve; skipped where a
    // column is too narrow to hold one (the bar chart always lists them all).
    edges.slice(0, -1).forEach((a, c) => {
      const mid = (x(a) + x(edges[c + 1])) / 2;
      if (x(edges[c + 1]) - x(a) >= 16) parts.push(text(mid, top + 14, String(c), { class: 'direct-label', 'text-anchor': 'middle' }));
    });
    trait.thresholds.forEach((t, j) => {
      const px = x(t);
      parts.push(
        el('line', { x1: px, x2: px, y1: base, y2: top - 8, class: 'threshold-line' }),
        el('rect', { x: px - 12, y: top - 30, width: 24, height: base - top + 30, class: 'handle-hit', 'data-drag': `t${j}` }),
        el('circle', { cx: px, cy: top - 16, r: 8, class: 'handle', 'data-drag': `t${j}` }),
        text(px, top - 12, String(j + 1), { class: 'handle-label', 'text-anchor': 'middle', 'data-drag': `t${j}` }),
      );
    });
    parts.push(axisBottom({ scale: x, y: base, ticks: niceTicks(-4, 4, width < 420 ? 4 : 8), format: (v) => formatNumber(v, 0), label: 'liability (SD units)' }));
  }
  const svg = svgRoot({
    width, height,
    label: `Normal liability with mean ${formatNumber(trait.mean)} cut at ${trait.thresholds.map((t) => formatNumber(t)).join(', ')}; category frequencies ${trait.categories.map((c) => formatShare(c.probability)).join(', ')}.`,
  }, ...parts);
  return { svg, x };
}

/**
 * Category frequencies as bars on a fixed 0–100% scale, each labelled.
 * @param {{ probability: number }[]} categories
 * @param {{ width: number, height: number }} size
 */
export function barsFigure(categories, { width, height }) {
  const k = categories.length;
  const left = 8;
  const top = 22;
  const bottom = 40;
  const band = (width - 2 * left) / k;
  const barWidth = Math.min(56, band - 6);
  const base = height - bottom;
  const y = scaleLinear([0, 1], [base, top]);
  const bars = categories.map((c, i) => {
    const cx = left + band * (i + 0.5);
    const h = base - y(c.probability);
    return [
      el('rect', { x: cx - barWidth / 2, y: base - h, width: barWidth, height: Math.max(0, h), rx: Math.min(4, h / 2), class: rampClass(i, k) }),
      text(cx, base - h - 6, formatShare(c.probability), { class: 'value-label', 'text-anchor': 'middle' }),
      text(cx, base + 18, String(i), { class: 'tick', 'text-anchor': 'middle' }),
    ].join('');
  });
  return svgRoot({ width, height, label: `Category frequencies: ${categories.map((c, i) => `${i}: ${formatShare(c.probability)}`).join(', ')}.` },
    el('line', { x1: left, x2: width - left, y1: base, y2: base, class: 'baseline' }),
    bars, text(width / 2, base + 34, 'category', { class: 'axis-label', 'text-anchor': 'middle' }));
}

/**
 * Two traits: the latent plane with probability ellipses (50%, 90%, 99%), the threshold
 * grid with handles (data-drag="x0", …, "y0", …) and an optional sample of individuals.
 * Cells are not shaded here: a large cell would look dense for holding a modest share,
 * so cell probabilities live in tableFigure.
 * @param {{ means: number[], rho: number, thresholds: number[][], points?: [number, number][] }} model
 * @param {{ width: number, compact?: boolean, id?: string }} size `id` keeps the clip path unique on the page
 */
export function planeFigure(model, { width, compact = false, id = 'plane' }) {
  const left = compact ? 2 : 44;
  const right = compact ? 2 : 30;
  const top = compact ? 2 : 30;
  const bottom = compact ? 2 : 42;
  const side = Math.min(width - left - right, 460);
  const height = top + side + bottom;
  const x = scaleLinear(PLANE, [left, left + side]);
  const y = scaleLinear(PLANE, [top + side, top]);
  const clampX = (/** @type {number} */ v) => Math.max(PLANE[0], Math.min(PLANE[1], v));
  const [t1, t2] = model.thresholds;
  const xEdges = [PLANE[0], ...t1.map(clampX), PLANE[1]];
  const yEdges = [PLANE[0], ...t2.map(clampX), PLANE[1]];
  // Ellipse holding a share q of a unit-variance bivariate normal: Mahalanobis radius
  // sqrt(-2 log(1 - q)) mapped through the Cholesky factor of the correlation matrix.
  const s = Math.sqrt(Math.max(0, 1 - model.rho ** 2));
  const ellipses = [0.5, 0.9, 0.99].map((q) => {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    /** @type {[number, number][]} */
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const a = (2 * Math.PI * i) / 120;
      pts.push([x(model.means[0] + r * Math.cos(a)), y(model.means[1] + r * (model.rho * Math.cos(a) + s * Math.sin(a)))]);
    }
    return el('path', { d: `${linePath(pts)}Z`, class: 'ellipse' });
  });

  const points = (model.points ?? []).filter(([a, b]) => a >= PLANE[0] && a <= PLANE[1] && b >= PLANE[0] && b <= PLANE[1])
    .map(([a, b]) => `M${x(a).toFixed(1)} ${y(b).toFixed(1)}h0`).join('');

  const parts = [
    el('defs', {}, el('clipPath', { id: `${id}-clip` }, el('rect', { x: left, y: top, width: side, height: side }))),
    el('g', { 'clip-path': `url(#${id}-clip)` }, ellipses, points ? el('path', { d: points, class: 'point-path' }) : ''),
    el('rect', { x: left, y: top, width: side, height: side, class: 'frame' }),
  ];
  if (!compact) {
    t1.forEach((t, j) => {
      const px = x(clampX(t));
      parts.push(el('line', { x1: px, x2: px, y1: top - 8, y2: top + side, class: 'threshold-line' }),
        el('rect', { x: px - 9, y: top - 26, width: 18, height: side + 26, class: 'handle-hit', 'data-drag': `x${j}` }),
        el('circle', { cx: px, cy: top - 14, r: 8, class: 'handle', 'data-drag': `x${j}` }),
        text(px, top - 10, String(j + 1), { class: 'handle-label', 'text-anchor': 'middle', 'data-drag': `x${j}` }));
    });
    t2.forEach((t, j) => {
      const py = y(clampX(t));
      parts.push(el('line', { x1: left, x2: left + side + 8, y1: py, y2: py, class: 'threshold-line' }),
        el('rect', { x: left, y: py - 9, width: side + 26, height: 18, class: 'handle-hit', 'data-drag': `y${j}` }),
        el('circle', { cx: left + side + 14, cy: py, r: 8, class: 'handle', 'data-drag': `y${j}` }),
        text(left + side + 14, py + 4, String(j + 1), { class: 'handle-label', 'text-anchor': 'middle', 'data-drag': `y${j}` }));
    });
    // Category numbers along the top and right edges inside the frame.
    xEdges.slice(0, -1).forEach((a, i) => {
      if (x(xEdges[i + 1]) - x(a) >= 16) parts.push(text((x(a) + x(xEdges[i + 1])) / 2, top + 14, String(i), { class: 'direct-label', 'text-anchor': 'middle' }));
    });
    yEdges.slice(0, -1).forEach((a, j) => {
      if (y(a) - y(yEdges[j + 1]) >= 16) parts.push(text(left + side - 8, (y(a) + y(yEdges[j + 1])) / 2 + 4, String(j), { class: 'direct-label', 'text-anchor': 'end' }));
    });
    const ticks = niceTicks(-4, 4, side < 300 ? 4 : 8);
    parts.push(axisBottom({ scale: x, y: top + side, ticks, format: (v) => formatNumber(v, 0), label: 'trait 1 liability' }),
      ...ticks.map((t) => text(left - 6, y(t) + 4, formatNumber(t, 0), { class: 'tick', 'text-anchor': 'end' })),
      text(12, top + side / 2, 'trait 2 liability', { class: 'axis-label', 'text-anchor': 'middle', transform: `rotate(-90 12 ${top + side / 2})` }));
  }
  const svg = svgRoot({
    width: left + side + right, height,
    label: `Latent plane: bivariate normal liabilities with means ${model.means.map((m) => formatNumber(m)).join(' and ')} and correlation ${formatNumber(model.rho)}, cut by ${t1.length} and ${t2.length} thresholds${model.points?.length ? `, with ${model.points.length} sampled individuals` : ''}.`,
  }, ...parts);
  return { svg, x, y };
}

/**
 * The contingency table as a heatmap laid out like the plane: trait 1 categories
 * left to right, trait 2 categories bottom to top. Each cell shows its probability
 * (and the sampled count, if given); bars on the top and right show the margins.
 * @param {{ cells: number[][], counts?: number[][] | null }} table
 * @param {{ width: number }} size
 */
export function tableFigure({ cells, counts }, { width }) {
  const k1 = cells.length;
  const k2 = cells[0].length;
  const left = 46;
  const top = 50;
  const right = 80;
  const bottom = 44;
  // Cells shrink with the width (and their text with them) rather than overflow.
  const cell = Math.max(22, Math.min(76, (width - left - right) / k1));
  const font = Math.max(8.5, Math.min(13, cell / 4.4));
  const gridW = cell * k1;
  const gridH = cell * k2;
  const height = top + gridH + bottom;
  const max = Math.max(...cells.flat());
  const rowTotals = cells.map((row) => row.reduce((a, b) => a + b, 0));
  const columnTotals = cells[0].map((_, j) => cells.reduce((a, row) => a + row[j], 0));
  const cx = (/** @type {number} */ i) => left + cell * i;
  const cy = (/** @type {number} */ j) => top + cell * (k2 - 1 - j);
  const parts = [];
  cells.forEach((row, i) => row.forEach((p, j) => {
    parts.push(el('g', { class: seqClass(p, max) },
      el('rect', { x: cx(i), y: cy(j), width: cell, height: cell, class: 'cell-fill' }),
      el('rect', { x: cx(i), y: cy(j), width: cell, height: cell, class: 'cell-outline' }),
      text(cx(i) + cell / 2, cy(j) + cell / 2 + (counts ? -2 : font / 3), formatPercentShort(p), { class: 'cell-text cell-ink', 'text-anchor': 'middle', style: `font-size:${font}px` }),
      counts ? text(cx(i) + cell / 2, cy(j) + cell / 2 + font, `n ${counts[i][j]}`, { class: 'cell-count cell-ink', 'text-anchor': 'middle', style: `font-size:${font * 0.85}px` }) : ''));
  }));
  // Margins: trait 1 above the columns, trait 2 right of the rows (bars to 100%).
  rowTotals.forEach((p, i) => {
    const h = p * (top - 26);
    parts.push(el('rect', { x: cx(i) + 4, y: top - 4 - h, width: cell - 8, height: h, class: 'margin-bar' }),
      text(cx(i) + cell / 2, top - 8 - h, formatPercentShort(p), { class: 'value-label small', 'text-anchor': 'middle' }));
  });
  columnTotals.forEach((p, j) => {
    const w = p * 24;
    parts.push(el('rect', { x: left + gridW + 4, y: cy(j) + 4, width: w, height: cell - 8, class: 'margin-bar' }),
      text(left + gridW + 8 + w, cy(j) + cell / 2 + 4, formatPercentShort(p), { class: 'value-label small' }));
  });
  for (let i = 0; i < k1; i++) parts.push(text(cx(i) + cell / 2, top + gridH + 16, String(i), { class: 'tick', 'text-anchor': 'middle' }));
  for (let j = 0; j < k2; j++) parts.push(text(left - 8, cy(j) + cell / 2 + 4, String(j), { class: 'tick', 'text-anchor': 'end' }));
  parts.push(text(left + gridW / 2, top + gridH + 34, 'trait 1 category', { class: 'axis-label', 'text-anchor': 'middle' }),
    text(14, top + gridH / 2, 'trait 2 category', { class: 'axis-label', 'text-anchor': 'middle', transform: `rotate(-90 14 ${top + gridH / 2})` }));
  return svgRoot({
    width: left + gridW + right, height,
    label: `Cell probabilities, trait 1 category by trait 2 category: ${cells.map((row, i) => row.map((p, j) => `(${i}, ${j}) ${formatShare(p)}`).join(', ')).join('; ')}.`,
  }, ...parts);
}
