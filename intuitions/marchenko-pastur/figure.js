// Figures for Marchenko–Pastur, as SVG strings (no DOM access). The law is the ink
// curve with its edges dashed; simulated eigenvalues are grey bars or blue circles with
// their 5–95% ranges; spikes are orange triangles, filled when they leave the bulk and
// hollow when they do not; the two batches are blue circles and orange triangles.

import { formatNumber } from '../lib/format.js';
import { axisBottom, axisLeft, el, linePath, logTicks, marker, niceTicks, scaleLinear, scaleLog, svgRoot, text, textWidth } from '../lib/plot.js';

/** @typedef {[number, number]} Point */

/** A number for an axis tick: whole when it is, else up to two decimals. @param {number} v */
const tick = (v) => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(Number(v.toFixed(2))));

/**
 * Bins eigenvalues into a density histogram on [0, top]; `share` scales it (the share of
 * the law's mass the values stand for, below 1 when some eigenvalues are exactly 0).
 * @param {ArrayLike<number>} values @param {number} top @param {number} bins @param {number} [share]
 */
export function binValues(values, top, bins, share = 1) {
  const width = top / bins;
  const counts = new Array(bins).fill(0);
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    counts[Math.min(bins - 1, Math.max(0, Math.floor(values[i] / width)))] += 1;
    total += 1;
  }
  return { edges: Array.from({ length: bins + 1 }, (_, i) => i * width), density: counts.map((c) => (total ? (c * share) / (total * width) : 0)) };
}

/**
 * Eigenvalues as a density histogram against the law's density, with its edges and
 * the population variance marked, and optional marks (spikes) along the axis.
 * @param {{ histogram: { edges: number[], density: number[] }, curve: { x: number[], density: number[] }, edges: { lower: number, upper: number },
 *   variance: number, zeroShare: number, marks?: { x: number, detectable: boolean }[] }} data
 * @param {{ width: number, height: number, compact?: boolean }} size
 */
export function spectrumFigure(data, { width, height, compact = false }) {
  const left = compact ? 4 : 44;
  const right = compact ? 4 : 14;
  const top = compact ? 6 : 30;
  const bottom = compact ? 4 : 44;
  const marks = data.marks ?? [];
  const xMax = Math.max(data.histogram.edges[data.histogram.edges.length - 1], data.edges.upper * 1.12, ...marks.map((m) => m.x * 1.06));
  const yMax = Math.max(...data.curve.density, ...data.histogram.density) * 1.1 || 1;
  const x = scaleLinear([0, xMax], [left, width - right]);
  const y = scaleLinear([0, yMax], [height - bottom, top]);
  const { edges, density } = data.histogram;
  const parts = [];
  if (!compact) parts.push(axisLeft({ scale: y, x: left, ticks: niceTicks(0, yMax, 4), format: tick, gridTo: width - right }));
  density.forEach((d, i) => {
    if (d <= 0) return;
    parts.push(el('rect', { x: x(edges[i]) + 0.4, y: y(d), width: Math.max(0.5, x(edges[i + 1]) - x(edges[i]) - 0.8), height: y(0) - y(d), class: 'hist-bar' }));
  });
  /** @type {Point[]} */
  const law = data.curve.x.map((v, i) => [x(v), y(data.curve.density[i])]);
  parts.push(el('path', { d: linePath([[x(data.edges.lower), y(0)], ...law, [x(data.edges.upper), y(0)]]), class: 'ink-line' }));
  if (!compact) {
    for (const [v, label, anchor] of /** @type {const} */ ([[data.edges.lower, 'lower edge', 'end'], [data.edges.upper, 'upper edge', 'start']])) {
      parts.push(el('line', { x1: x(v), x2: x(v), y1: y(0), y2: top - 6, class: 'edge-line' }));
      const at = anchor === 'end' ? x(v) - 4 : x(v) + 4;
      const fits = anchor === 'end' ? at - textWidth(label) > left : at + textWidth(label) < width - right;
      parts.push(text(fits ? at : x(v), top - 12, label, { class: 'axis-label halo', 'text-anchor': fits ? anchor : 'middle' }));
    }
    parts.push(el('line', { x1: x(data.variance), x2: x(data.variance), y1: y(0), y2: y(yMax * 0.55), class: 'variance-line' }),
      text(x(data.variance), y(yMax * 0.55) - 5, 'σ²', { class: 'direct-label halo', 'text-anchor': 'middle' }));
    for (const m of marks) parts.push(marker('triangle', x(m.x), y(0) - 9, 5, m.detectable ? 'b-mark' : 'hollow-b'));
    if (data.zeroShare > 0) parts.push(text(x(0) + 4, top + 12, `${formatNumber(data.zeroShare * 100, 0)}% of the eigenvalues are exactly 0 (not drawn)`, { class: 'axis-label halo' }));
    parts.push(axisBottom({ scale: x, y: y(0), ticks: niceTicks(0, xMax, Math.max(3, Math.floor((width - left - right) / 70))), format: tick, label: 'eigenvalue of the sample covariance', labelGap: 34 }));
  }
  return svgRoot({
    width, height,
    label: `Eigenvalues of the sample covariance against the Marchenko–Pastur density, which runs from ${formatNumber(data.edges.lower, 3)} to ${formatNumber(data.edges.upper, 3)} though every population eigenvalue is ${tick(data.variance)}${marks.length ? `; ${marks.filter((m) => m.detectable).length} of ${marks.length} spikes lie beyond the upper edge` : ''}.`,
  }, ...parts);
}

/**
 * Each eigenvalue, largest first: its 5–95% range over the replicates, its median, and
 * where the law puts it (its quantile at 1 − (k − ½)/p), between the law's edges.
 * @param {any} result the noise view's result
 * @param {{ width: number, height: number }} size
 */
export function indexFigure(result, { width, height }) {
  const left = 44;
  const right = 14;
  const top = 14;
  const bottom = 44;
  const rows = result.sample.byIndex;
  const x = scaleLinear([0.4, rows.length + 0.6], [left, width - right]);
  const yMax = Math.max(result.edges.upper, ...rows.map((/** @type {any} */ r) => r.hi)) * 1.05;
  const yMin = Math.min(result.zeroShare > 0 ? 0 : result.edges.lower, ...rows.map((/** @type {any} */ r) => r.lo)) * 0.95;
  const y = scaleLinear([yMin, yMax], [height - bottom, top]);
  const step = (width - left - right) / rows.length;
  const parts = [
    axisLeft({ scale: y, x: left, ticks: niceTicks(yMin, yMax, 5), format: tick, gridTo: width - right }),
    el('line', { x1: left, x2: width - right, y1: y(result.edges.upper), y2: y(result.edges.upper), class: 'edge-line' }),
    text(width - right, y(result.edges.upper) - 5, 'upper edge', { class: 'axis-label halo', 'text-anchor': 'end' }),
  ];
  if (result.zeroShare === 0) parts.push(el('line', { x1: left, x2: width - right, y1: y(result.edges.lower), y2: y(result.edges.lower), class: 'edge-line' }));
  /** @type {Point[]} */
  const law = rows.map((/** @type {any} */ r) => [x(r.index), y(r.law)]);
  parts.push(el('path', { d: linePath(law), class: 'ink-line dashed thin-dash' }));
  for (const r of rows) {
    parts.push(el('line', { x1: x(r.index), x2: x(r.index), y1: y(r.lo), y2: y(r.hi), class: 'a-range' }),
      marker('circle', x(r.index), y(r.median), Math.min(4, Math.max(2.2, step / 3)), 'a-mark'));
  }
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor((width - left - right) / 40))));
  const ticks = rows.map((/** @type {any} */ r) => r.index).filter((/** @type {number} */ k) => k === 1 || k % every === 0);
  parts.push(axisBottom({ scale: x, y: height - bottom, ticks, format: String, label: 'eigenvalue, largest first', labelGap: 34 }));
  return svgRoot({
    width, height,
    label: `The ${rows.length} largest eigenvalues one at a time: the largest has median ${formatNumber(rows[0].median, 3)} and 5–95% range ${formatNumber(rows[0].lo, 3)} to ${formatNumber(rows[0].hi, 3)}, against an upper edge of ${formatNumber(result.edges.upper, 3)}.`,
  }, ...parts);
}

/**
 * The BBP transition: where a spike of strength θ ends up (its eigenvalue), or how well
 * its eigenvector points along the truth (squared cosine), against θ; the theory as a
 * line, the simulated spikes as markers with their 5–95% ranges.
 * @param {any} result the spikes view's result
 * @param {'eigenvalue' | 'overlap'} which
 * @param {{ width: number, height: number }} size
 */
export function transitionFigure(result, which, { width, height }) {
  const left = 44;
  const right = 14;
  const top = 18;
  const bottom = 44;
  const grid = result.theory.strength;
  const xMax = grid[grid.length - 1];
  const x = scaleLinear([0, xMax], [left, width - right]);
  const values = result.theory[which];
  const sampled = result.spikes.map((/** @type {any} */ s) => (which === 'eigenvalue' ? s.sample.hi : s.sample.overlap));
  const yMax = which === 'overlap' ? 1 : Math.max(...values, ...sampled, 1 + xMax) * 1.04;
  const yMin = which === 'overlap' ? 0 : Math.min(1, result.edges.lower);
  const y = scaleLinear([yMin, yMax], [height - bottom, top]);
  const parts = [
    axisLeft({ scale: y, x: left, ticks: niceTicks(yMin, yMax, 5), format: tick, gridTo: width - right }),
    el('line', { x1: x(result.threshold), x2: x(result.threshold), y1: y(yMin), y2: top, class: 'edge-line' }),
    text(x(result.threshold) + 4, top + 10, `√γ = ${formatNumber(result.threshold, 3)}`, { class: 'axis-label halo' }),
  ];
  if (which === 'eigenvalue') {
    parts.push(el('line', { x1: left, x2: width - right, y1: y(result.edges.upper), y2: y(result.edges.upper), class: 'edge-line' }),
      el('path', { d: linePath([[x(0), y(1)], [x(xMax), y(1 + xMax)]]), class: 'muted-line' }),
      text(x(xMax) - 4, y(1 + xMax) + 16, 'population, 1 + θ', { class: 'axis-label halo', 'text-anchor': 'end' }),
      text(left + 4, y(result.edges.upper) - 5, 'upper edge', { class: 'axis-label halo' }));
  }
  /** @type {Point[]} */
  const line = grid.map((/** @type {number} */ t, /** @type {number} */ i) => [x(t), y(values[i])]);
  parts.push(el('path', { d: linePath(line), class: 'ink-line' }));
  for (const s of result.spikes) {
    const px = x(s.strength);
    if (which === 'eigenvalue') {
      parts.push(el('line', { x1: px, x2: px, y1: y(s.sample.lo), y2: y(s.sample.hi), class: 'b-range' }), marker('triangle', px, y(s.sample.median), 5, s.detectable ? 'b-mark' : 'hollow-b'));
    } else parts.push(marker('triangle', px, y(s.sample.overlap), 5, s.detectable ? 'b-mark' : 'hollow-b'));
  }
  parts.push(axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(0, xMax, Math.max(3, Math.floor((width - left - right) / 70))), format: tick, label: 'spike strength θ (population eigenvalue 1 + θ)', labelGap: 34 }));
  const what = which === 'eigenvalue' ? 'the largest sample eigenvalues' : 'the squared cosine between each spike’s sample eigenvector and its true direction';
  return svgRoot({ width, height, label: `The BBP transition at θ = √γ = ${formatNumber(result.threshold, 3)}: ${what} against spike strength, theory and simulation.` }, ...parts);
}

/**
 * The samples on their first two principal components (each scaled to variance 1),
 * the batches as blue circles and orange triangles.
 * @param {{ pc1: number[], pc2: number[] | null }} scores @param {number[]} batch
 * @param {{ width: number, height: number, label: string }} options
 */
export function scatterFigure(scores, batch, { width, height, label }) {
  const pad = 36;
  const pc2 = scores.pc2 ?? scores.pc1.map(() => 0);
  const extent = Math.max(3, ...scores.pc1.map(Math.abs), ...pc2.map(Math.abs)) * 1.05;
  const x = scaleLinear([-extent, extent], [pad, width - 10]);
  const y = scaleLinear([-extent, extent], [height - pad, 10]);
  const ticks = niceTicks(-extent, extent, 4);
  const parts = [
    axisLeft({ scale: y, x: pad, ticks, format: tick, gridTo: width - 10 }),
    axisBottom({ scale: x, y: height - pad, ticks, format: tick, label: 'PC 1', labelGap: 30 }),
    text(pad - 4, 6, 'PC 2', { class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'hanging' }),
  ];
  scores.pc1.forEach((v, i) => parts.push(marker(batch[i] ? 'triangle' : 'circle', x(v), y(pc2[i]), 3, batch[i] ? 'b-dot' : 'a-dot')));
  return svgRoot({ width, height, label }, ...parts);
}

/**
 * Eigenvalues by index on a log scale, before and after the batch is regressed out,
 * against the noise's upper edge.
 * @param {any} result the pcs view's result
 * @param {{ width: number, height: number }} size
 */
export function screeFigure(result, { width, height }) {
  const left = 52;
  const right = 14;
  const top = 14;
  const bottom = 44;
  const count = Math.min(100, result.uncorrected.eigenvalues.length);
  const before = result.uncorrected.eigenvalues.slice(0, count);
  const after = result.corrected.eigenvalues.slice(0, count);
  const all = [...before, ...after, result.edges.upper].filter((v) => v > 0);
  const lo = Math.min(...all) * 0.8;
  const hi = Math.max(...all) * 1.25;
  const x = scaleLinear([0.5, count + 0.5], [left, width - right]);
  const y = scaleLog([lo, hi], [height - bottom, top]);
  const ticks = logTicks(lo, hi, 5);
  const parts = [
    axisLeft({ scale: y, x: left, ticks, format: tick, gridTo: width - right }),
    el('line', { x1: left, x2: width - right, y1: y(result.edges.upper), y2: y(result.edges.upper), class: 'edge-line' }),
    text(width - right, y(result.edges.upper) - 5, 'noise edge', { class: 'axis-label halo', 'text-anchor': 'end' }),
  ];
  /** @param {number[]} values */
  const pts = (values) => /** @type {Point[]} */ (values.map((v, i) => [x(i + 1), y(Math.max(lo, v))]));
  parts.push(el('path', { d: linePath(pts(after)), class: 'a-line' }), el('path', { d: linePath(pts(before)), class: 'b-line' }));
  const r = Math.min(3.2, Math.max(1.6, (width - left - right) / count / 2.5));
  before.forEach((/** @type {number} */ v, /** @type {number} */ i) => { if (i < 12) parts.push(marker('triangle', x(i + 1), y(v), r + 0.6, 'b-mark')); });
  after.forEach((/** @type {number} */ v, /** @type {number} */ i) => { if (i < 12) parts.push(marker('circle', x(i + 1), y(v), r, 'a-mark')); });
  const every = Math.max(1, Math.ceil(count / Math.max(2, Math.floor((width - left - right) / 50))) * 5 / 5);
  parts.push(axisBottom({ scale: x, y: height - bottom, ticks: [1, ...Array.from({ length: Math.floor(count / every) }, (_, i) => (i + 1) * every)].filter((v, i, a) => a.indexOf(v) === i && v <= count), format: String, label: 'principal component', labelGap: 34 }));
  return svgRoot({
    width, height,
    label: `Eigenvalues of the ${count} largest principal components on a log scale, before and after the batch is regressed out: ${result.uncorrected.aboveEdge} and ${result.corrected.aboveEdge} lie above the noise edge of ${formatNumber(result.edges.upper, 1)}.`,
  }, ...parts);
}

/**
 * The difference between the batches' mean scores on each principal component (in SDs
 * of that component), before the batch is regressed out; after, every one is 0.
 * @param {any} result the pcs view's result
 * @param {{ width: number, height: number }} size
 */
export function differenceFigure(result, { width, height }) {
  const left = 44;
  const right = 14;
  const top = 14;
  const bottom = 44;
  const diffs = result.uncorrected.batchDifference.map(Math.abs);
  const x = scaleLinear([0.5, diffs.length + 0.5], [left, width - right]);
  const yMax = Math.max(0.5, ...diffs) * 1.1;
  const y = scaleLinear([0, yMax], [height - bottom, top]);
  const bar = Math.max(1, (width - left - right) / diffs.length - 2);
  const parts = [axisLeft({ scale: y, x: left, ticks: niceTicks(0, yMax, 4), format: tick, gridTo: width - right })];
  diffs.forEach((/** @type {number} */ d, /** @type {number} */ i) => parts.push(el('rect', { x: x(i + 1) - bar / 2, y: y(d), width: bar, height: y(0) - y(d), class: i === 0 ? 'b-strong' : 'hist-bar' })));
  const every = Math.max(1, Math.ceil(diffs.length / Math.max(2, Math.floor((width - left - right) / 44))));
  parts.push(axisBottom({ scale: x, y: height - bottom, ticks: [1, ...Array.from({ length: diffs.length }, (_, i) => i + 1).filter((k) => k % every === 0)], format: String, label: 'principal component', labelGap: 34 }));
  return svgRoot({ width, height, label: `How far apart the batches' mean scores are on each of the first ${diffs.length} components, before the batch is regressed out: ${formatNumber(diffs[0], 2)} SDs on PC 1.` }, ...parts);
}
