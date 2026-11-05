// Figures for the null p-value lab, as SVG strings (no DOM access). The shortcut is
// drawn in orange with triangles and the sound analysis in blue with circles, in every
// panel; the uniform, which a valid test follows, is the dashed ink line.

import { formatShare } from '../lib/format.js';
import { axisBottom, axisLeft, el, linePath, marker, niceTicks, scaleLinear, scaleLog, svgRoot, text, textWidth } from '../lib/plot.js';

/** @typedef {import('./compute.js').Analysis} Analysis */
/** @typedef {[number, number]} Point */

export const ROLES = /** @type {const} */ ({
  shortcut: { line: 'b-line', bar: 'b-strong', mark: 'b-mark', shape: /** @type {const} */ ('triangle') },
  sound: { line: 'a-line', bar: 'a-strong', mark: 'a-mark', shape: /** @type {const} */ ('circle') },
});

/** Density axis shared by a panel's two histograms: past 5, tall bars are cut and labelled. @param {Analysis[]} analyses */
export function histogramTop(analyses) {
  const top = Math.max(...analyses.flatMap((a) => a.histogram.density));
  return Math.max(1.5, Math.min(5, top * 1.08));
}

/**
 * One analysis's p-values as a 20-bin density histogram on [0, 1], with the uniform
 * density 1 dashed and α marked.
 * @param {Analysis} analysis @param {'shortcut' | 'sound'} role
 * @param {{ width: number, height: number, top: number, alpha: number, compact?: boolean }} options
 */
export function histogramFigure(analysis, role, { width, height, top, alpha, compact = false }) {
  const left = compact ? 4 : 32;
  const right = compact ? 4 : 8;
  const upper = compact ? 6 : 16;
  const bottom = compact ? 4 : 38;
  const x = scaleLinear([0, 1], [left, width - right]);
  const y = scaleLinear([0, top], [height - bottom, upper]);
  const { edges, density } = analysis.histogram;
  const parts = [];
  if (!compact) parts.push(axisLeft({ scale: y, x: left, ticks: niceTicks(0, top, 4), format: String, gridTo: width - right }));
  density.forEach((d, i) => {
    const h = Math.min(d, top);
    const x0 = x(edges[i]) + 0.5;
    const x1 = x(edges[i + 1]) - 0.5;
    if (d > 0) parts.push(el('rect', { x: x0, y: y(h), width: Math.max(0.5, x1 - x0), height: y(0) - y(h), class: ROLES[role].bar }));
    if (d > top && !compact) {
      // A bar past the axis is cut at the top and labelled with its height.
      const label = d >= 10 ? d.toFixed(0) : d.toFixed(1);
      const anchor = i > 15 ? 'end' : 'start';
      parts.push(el('path', { d: `M${x0} ${y(top) + 4}L${x1} ${y(top) - 1}`, class: 'cut-mark' }),
        text(anchor === 'start' ? x0 : x1, y(top) - 5, `${label} ▲`, { class: 'value-label halo', 'text-anchor': anchor }));
    }
  });
  parts.push(el('line', { x1: left, x2: width - right, y1: y(1), y2: y(1), class: 'ink-line dashed thin-dash' }));
  if (!compact) {
    parts.push(
      el('line', { x1: x(alpha), x2: x(alpha), y1: y(0), y2: upper, class: 'alpha-line' }),
      axisBottom({ scale: x, y: y(0), ticks: width < 260 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1], format: (v) => String(v), label: 'p-value', labelGap: 32 }),
    );
  }
  return svgRoot({
    width, height,
    label: `Histogram of p-values, ${analysis.name}: ${analysis.rejectionRate === null ? 'none' : formatShare(analysis.rejectionRate)} are at or below α = ${alpha}; the first bin holds ${formatShare(density[0] / 20)} against 5% for a uniform.`,
  }, ...parts);
}

/** Tick labels for the log axes: 10⁻⁴, 0.001, 0.01, 0.1, 1. @param {number} v */
const logLabel = (v) => (v < 0.001 ? '10⁻⁴' : String(Number(v.toPrecision(1))));

/**
 * The share of p-values at or below each threshold, both analyses, on log–log axes from
 * 10⁻⁴ to 1. A valid test lies on the diagonal; above it, the test rejects a true null
 * more often than its threshold promises. α is marked, with each analysis's rate there.
 * @param {{ alpha: number, shortcut: Analysis, sound: Analysis }} result
 * @param {{ width: number, height: number }} size
 */
export function rateFigure(result, { width, height }) {
  const narrow = width < 520;
  const left = 46;
  const right = narrow ? 12 : 18;
  const upper = 24;
  const bottom = 44;
  const lo = 1e-4;
  const x = scaleLog([lo, 1], [left, width - right]);
  const y = scaleLog([lo, 1], [height - bottom, upper]);
  const ticks = [1e-4, 1e-3, 1e-2, 1e-1, 1];
  const parts = [
    axisLeft({ scale: y, x: left, ticks, format: logLabel, gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks, format: logLabel, label: 'threshold α (log scale)', labelGap: 34 }),
    el('line', { x1: x(lo), x2: x(1), y1: y(lo), y2: y(1), class: 'ink-line dashed thin-dash' }),
  ];
  for (const role of /** @type {const} */ (['sound', 'shortcut'])) {
    const { threshold, rate } = result[role].curve;
    /** @type {Point[]} */
    const pts = [];
    // Where the curve enters the axes: its value at the left edge, if any p-values fall there.
    let start = 0;
    threshold.forEach((t, i) => { if (t <= lo) start = rate[i]; });
    if (start >= lo) pts.push([x(lo), y(Math.min(1, start))]);
    threshold.forEach((t, i) => { if (t > lo && rate[i] >= lo) pts.push([x(t), y(rate[i])]); });
    if (pts.length) parts.push(el('path', { d: linePath(pts), class: ROLES[role].line }));
  }
  const ax = x(result.alpha);
  parts.push(el('line', { x1: ax, x2: ax, y1: height - bottom, y2: upper, class: 'alpha-line' }),
    text(ax + 4, height - bottom - 6, `α = ${result.alpha}`, { class: 'axis-label halo' }));
  // Each analysis's rate at α, labelled beside its marker; the two labels keep apart.
  const marks = /** @type {const} */ (['shortcut', 'sound']).map((role) => ({ role, rate: result[role].rejectionRate }))
    .filter((m) => m.rate !== null && m.rate >= lo).map((m) => ({ ...m, py: y(/** @type {number} */ (m.rate)), ly: y(/** @type {number} */ (m.rate)) + 4 }))
    .sort((a, b) => a.py - b.py);
  if (marks.length === 2 && marks[1].ly - marks[0].ly < 14) {
    const mid = (marks[0].ly + marks[1].ly) / 2;
    marks[0].ly = mid - 7;
    marks[1].ly = mid + 7;
  }
  for (const m of marks) {
    const label = formatShare(/** @type {number} */ (m.rate));
    const toLeft = ax + 10 + textWidth(label) > width - right;
    parts.push(marker(ROLES[m.role].shape, ax, m.py, 4.5, ROLES[m.role].mark),
      text(toLeft ? ax - 9 : ax + 9, m.ly, label, { class: 'value-label halo', 'text-anchor': toLeft ? 'end' : 'start' }));
  }
  parts.push(text(left - 40, upper - 12, 'share of p-values ≤ threshold', { class: 'axis-label', 'text-anchor': 'start' }));
  const describe = (/** @type {Analysis} */ a) => `${a.name}, ${a.rejectionRate === null ? 'no p-values' : formatShare(a.rejectionRate)}`;
  return svgRoot({
    width, height,
    label: `Share of p-values at or below each threshold, on log scales, against the diagonal a valid test follows. At α = ${result.alpha}: ${describe(result.shortcut)}; ${describe(result.sound)}.`,
  }, ...parts);
}

/**
 * The index thumbnail: the two analyses' histograms side by side on one density axis,
 * without labels.
 * @param {{ shortcut: Analysis, sound: Analysis, alpha: number }} result
 * @param {{ width: number, height: number }} size
 */
export function pairThumbnail(result, { width, height }) {
  const top = histogramTop([result.shortcut, result.sound]);
  const gap = 14;
  const half = (width - gap) / 2;
  const panel = (/** @type {'shortcut' | 'sound'} */ role, /** @type {number} */ x0) => el('g', { transform: `translate(${x0} 0)` },
    histogramFigure(result[role], role, { width: half, height, top, alpha: result.alpha, compact: true }).replace(/^<svg[^>]*>|<\/svg>$/g, ''));
  return svgRoot({ width, height, label: `p-values under a true null: ${result.shortcut.name}, against ${result.sound.name}.` },
    panel('shortcut', 0), panel('sound', half + gap));
}
