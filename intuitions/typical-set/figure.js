// Figures for where the probability mass is, as SVG strings (no DOM access). Density
// is drawn in blue with circles, volume in orange with triangles and mass in ink, on
// every panel that shows them, and each curve is labelled where it is drawn.

import { formatNumber, formatShare } from '../lib/format.js';
import {
  areaPath, axisBottom, axisLeft, el, linePath, logTicks, marker, niceTicks, scaleLinear, scaleLog, svgRoot, text, textWidth,
} from '../lib/plot.js';

/** @typedef {[number, number]} Point */

/** "10⁻⁵" style for a power of ten. @param {number} exponent */
export function powerOfTen(exponent) {
  const sup = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return `10${String(exponent).split('').map((c) => sup[/** @type {keyof typeof sup} */ (c)]).join('')}`;
}

/**
 * A share that may be far below the smallest double: a percentage down to 10⁻³⁰⁰,
 * then "10⁻¹²⁸⁵" from its log.
 * @param {number} share @param {number | null} log10Share
 */
export function formatTinyShare(share, log10Share) {
  if (share > 0) return formatShare(share);
  if (log10Share === null) return '0%';
  return `about ${powerOfTen(Math.round(log10Share + 2))}%`;
}

/**
 * Density at radius r (relative to the mode), the volume of the shell at r (relative to
 * its largest on the axis) and their product, the chi density (relative to its
 * peak), on one radius axis. The central `coverage` shell is shaded under the mass
 * curve; the ball of the given radius around the mode is marked.
 * @param {any} result the shell view's result
 * @param {{ width: number, height: number, compact?: boolean }} size
 */
export function shellFigure(result, { width, height, compact = false }) {
  const { curve, k } = result;
  const left = compact ? 4 : 40;
  const right = compact ? 4 : 14;
  const top = compact ? 6 : 26;
  const bottom = compact ? 4 : 44;
  const rMax = curve.radius[curve.radius.length - 1];
  const x = scaleLinear([0, rMax], [left, width - right]);
  const y = scaleLinear([0, 1.08], [height - bottom, top]);
  const d0 = curve.log10Density[0];
  const sMax = Math.max(...curve.log10Surface.filter((/** @type {number | null} */ v) => v !== null));
  const mMax = Math.max(...curve.mass);
  const density = curve.radius.map((/** @type {number} */ r, /** @type {number} */ i) => /** @type {Point} */ ([x(r), y(10 ** (curve.log10Density[i] - d0))]));
  const volume = curve.radius.map((/** @type {number} */ r, /** @type {number} */ i) => /** @type {Point} */ ([x(r), y(curve.log10Surface[i] === null ? 0 : 10 ** (curve.log10Surface[i] - sMax))]));
  const mass = curve.radius.map((/** @type {number} */ r, /** @type {number} */ i) => /** @type {Point} */ ([x(r), y(curve.mass[i] / mMax)]));
  const shell = curve.radius.map((/** @type {number} */ r, /** @type {number} */ i) => /** @type {Point} */ ([r, curve.mass[i] / mMax]))
    .filter((/** @type {Point} */ [r]) => r >= result.shell.lo && r <= result.shell.hi)
    .map((/** @type {Point} */ [r, v]) => /** @type {Point} */ ([x(r), y(v)]));
  const base = y(0);
  const parts = [
    el('line', { x1: left, x2: width - right, y1: base, y2: base, class: 'baseline' }),
    shell.length > 1 ? el('path', { d: areaPath(shell, base), class: 'shell-fill' }) : '',
    el('path', { d: areaPath(mass, base), class: 'mass-fill' }),
    el('path', { d: linePath(density), class: 'a-line' }),
    el('path', { d: linePath(volume), class: 'b-line dashed' }),
    el('path', { d: linePath(mass), class: 'ink-line' }),
  ];
  if (!compact) {
    const modeX = x(result.mode);
    const ballX = x(result.ball.radius);
    // The legend names the curves; each carries its legend shape where it crosses half
    // height, and the mass is labelled at its peak.
    const massLabel = 'mass = density × volume';
    const half = (/** @type {Point[]} */ line) => line.find(([, py]) => py <= y(0.5)) ?? line[0];
    const densityHalf = density.find((/** @type {Point} */ [, py]) => py > y(0.5)) ?? density[0];
    parts.push(marker('circle', densityHalf[0], y(0.5), 4, 'a-mark'), marker('triangle', half(volume)[0], y(0.5), 4.5, 'b-mark'));
    const peakAnchor = modeX > width / 2 ? 'end' : 'start';
    const peakX = modeX + (peakAnchor === 'end' ? -8 : 8);
    const fitsAbove = textWidth(massLabel) < (peakAnchor === 'end' ? peakX - left : width - right - peakX);
    parts.push(
      el('line', { x1: modeX, x2: modeX, y1: base, y2: y(1), class: 'marker-line' }),
      marker('square', modeX, y(1), 4.5, 'ink-mark'),
      text(peakX, top - 10, fitsAbove ? massLabel : 'mass', { class: 'direct-label strong halo', 'text-anchor': peakAnchor }),
      text(peakX, top + 5, `peak at √(k − 1) = ${formatNumber(result.mode)}`, { class: 'axis-label halo', 'text-anchor': peakAnchor }),
    );
    if (result.ball.radius > 0) {
      // The label goes on the side away from the mass peak, where no curve crosses it.
      const before = ballX < modeX;
      parts.push(el('line', { x1: ballX, x2: ballX, y1: base, y2: y(0.25), class: 'ball-line' }),
        text(ballX + (before ? -4 : 4), y(0.25) - 4, `ball, r = ${formatNumber(result.ball.radius, 1)}`, { class: 'axis-label halo', 'text-anchor': before ? 'end' : 'start' }));
    }
    const ticks = niceTicks(0, rMax, Math.max(3, Math.floor((width - left - right) / 70)));
    parts.push(axisBottom({ scale: x, y: base, ticks, format: (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1), label: 'distance from the mode, r', labelGap: 34 }));
  }
  return svgRoot({
    width, height,
    label: `In ${k} dimensions: the density falls from the mode, the volume at radius r grows like r^${k - 1}, and their product, the mass, peaks at r = ${formatNumber(result.mode)}; ${formatShare(result.coverage)} of the mass lies between r = ${formatNumber(result.shell.lo)} and ${formatNumber(result.shell.hi)}.`,
  }, ...parts);
}

/**
 * The shell's position as the dimension grows: the central `coverage` band of the
 * radius, its mean, and the radius of the ball that holds as much mass, on a log k axis.
 * @param {any} result the shell view's result
 * @param {{ width: number, height: number }} size
 */
export function shellSweepFigure(result, { width, height }) {
  const { sweep, k } = result;
  const narrow = width < 520;
  const left = 40;
  const right = narrow ? 70 : 120;
  const top = 12;
  const bottom = 42;
  const x = scaleLog([1, 1000], [left, width - right]);
  const yMax = Math.max(...sweep.hi) * 1.05;
  const y = scaleLinear([0, yMax], [height - bottom, top]);
  const pts = (/** @type {number[]} */ values) => sweep.k.map((/** @type {number} */ kk, /** @type {number} */ i) => /** @type {Point} */ ([x(kk), y(values[i])]));
  const hiLine = pts(sweep.hi);
  const loLine = pts(sweep.lo);
  const meanLine = pts(sweep.mean);
  const hdrLine = pts(sweep.hdrRadius);
  const ends = [
    { y: meanLine[meanLine.length - 1][1], t: narrow ? 'shell' : 'shell (mean)' },
    { y: hdrLine[hdrLine.length - 1][1], t: narrow ? 'ball' : `ball holding ${formatShare(result.coverage)}` },
  ].sort((a, b) => a.y - b.y);
  if (ends[1].y - ends[0].y < 14) ends[0].y = ends[1].y - 14;
  const cx = x(k);
  return svgRoot({
    width, height,
    label: `The radius of the shell against the dimension k, on a log scale: the central ${formatShare(result.coverage)} band keeps a width of about ${formatNumber(result.shell.width, 1)} while its centre moves out like √k.`,
  },
  axisLeft({ scale: y, x: left, ticks: niceTicks(0, yMax, 5), format: String, gridTo: width - right }),
  axisBottom({ scale: x, y: height - bottom, ticks: [1, 10, 100, 1000], format: (v) => v.toLocaleString('en-US'), label: 'dimensions, k (log scale)', labelGap: 32 }),
  text(left - 8, top - 2, 'r', { class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'hanging' }),
  el('path', { d: areaPath(hiLine, loLine), class: 'shell-fill' }),
  el('path', { d: linePath(meanLine), class: 'ink-line' }),
  el('path', { d: linePath(hdrLine), class: 'muted-line' }),
  el('line', { x1: cx, x2: cx, y1: top, y2: height - bottom, class: 'marker-line' }),
  marker('square', cx, y(result.mean), 4.5, 'ink-mark'),
  marker('diamond', cx, y(result.hdrRadius), 4.5, 'hollow-mark'),
  ends.map((e) => text(width - right + 8, e.y + 4, e.t, { class: 'direct-label' })));
}

/**
 * The cube criterion's corner distance a*√k against k (a straight line of slope ½ on
 * log axes), with Monte Carlo radii (median and 5–95% range) and, for the normal,
 * the exact chi median.
 * @param {any} result the cube view's result
 * @param {{ width: number, height: number }} size
 */
export function cubeFigure(result, { width, height }) {
  const narrow = width < 520;
  const left = 46;
  const right = narrow ? 64 : 120;
  const top = 24;
  const bottom = 42;
  const dims = result.dimensions;
  const values = [...result.distance, ...(result.sample ? [...result.sample.lo, ...result.sample.hi] : [])].filter((v) => v > 0);
  const yLo = 10 ** Math.floor(Math.log10(Math.min(...values)));
  const yHi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
  const x = scaleLog([1, dims[dims.length - 1]], [left, width - right]);
  const y = scaleLog([yLo, yHi], [height - bottom, top]);
  const line = dims.map((/** @type {number} */ k, /** @type {number} */ i) => /** @type {Point} */ ([x(k), y(result.distance[i])]));
  const parts = [
    axisLeft({ scale: y, x: left, ticks: logTicks(yLo, yHi, 6), format: (v) => (v >= 1 ? v.toLocaleString('en-US') : String(v)), gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: narrow ? [1, 8, 64, 512] : [1, 4, 16, 64, 256, 1024], format: (v) => v.toLocaleString('en-US'), label: 'dimensions, k (log scale)', labelGap: 32 }),
    text(left - 8, 4, 'r', { class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'hanging' }),
    el('path', { d: linePath(line), class: 'ink-line dashed' }),
  ];
  const ends = [{ y: line[line.length - 1][1], t: narrow ? 'cube' : 'cube corner, a*√k' }];
  if (result.exact) {
    const exact = dims.map((/** @type {number} */ k, /** @type {number} */ i) => /** @type {Point} */ ([x(k), y(result.exact.median[i])]));
    parts.push(el('path', { d: linePath(exact), class: 'c-line' }));
    ends.push({ y: exact[exact.length - 1][1] + (narrow ? 0 : 0), t: narrow ? 'exact' : 'exact median' });
  }
  if (result.sample) {
    const s = result.sample;
    dims.forEach((/** @type {number} */ k, /** @type {number} */ i) => {
      parts.push(el('line', { x1: x(k), x2: x(k), y1: y(s.lo[i]), y2: y(s.hi[i]), class: 'a-range' }), marker('circle', x(k), y(s.median[i]), 4, 'a-mark'));
    });
    ends.push({ y: y(s.median[s.median.length - 1]), t: narrow ? 'sample' : 'sampled radius' });
  }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
  parts.push(...ends.map((e) => text(width - right + 8, e.y + 4, e.t, { class: 'direct-label' })));
  return svgRoot({
    width, height,
    label: `Distance from the centre against dimension on log scales for the ${result.family} family: the cube criterion's corner a*√k with a* = ${formatNumber(result.halfWidth, 3)}${result.sample ? `, and the median sampled radius, ${formatNumber(result.sample.median[result.sample.median.length - 1], 1)} at k = ${dims[dims.length - 1]}` : ''}.`,
  }, ...parts);
}

/**
 * A one-dimensional mixture density with the water level and the highest-density
 * region below it shaded, and the mode, mean and median marked on the axis.
 * @param {any} result the modes view's result
 * @param {{ width: number, height: number, compact?: boolean }} size
 */
export function modesFigure(result, { width, height, compact = false }) {
  const left = compact ? 4 : 14;
  const right = compact ? 4 : 14;
  const top = compact ? 6 : 16;
  const bottom = compact ? 4 : 84;
  const xs = result.curve.x;
  const x = scaleLinear([xs[0], xs[xs.length - 1]], [left, width - right]);
  const y = scaleLinear([0, result.peak * 1.1], [height - bottom, top]);
  const base = y(0);
  const pts = xs.map((/** @type {number} */ v, /** @type {number} */ i) => /** @type {Point} */ ([x(v), y(result.curve.density[i])]));
  const regionPaths = result.regions.map((/** @type {{ lo: number | null, hi: number | null }} */ r) => {
    const lo = r.lo ?? xs[0];
    const hi = r.hi ?? xs[xs.length - 1];
    const inside = pts.filter((/** @type {Point} */ _, /** @type {number} */ i) => xs[i] >= lo && xs[i] <= hi);
    return inside.length > 1 ? el('path', { d: areaPath(inside, base), class: 'region-fill' }) : '';
  });
  const parts = [
    el('path', { d: areaPath(pts, base), class: 'mass-fill' }),
    regionPaths,
    el('path', { d: linePath(pts), class: 'ink-line' }),
    el('line', { x1: left, x2: width - right, y1: base, y2: base, class: 'baseline' }),
  ];
  if (result.threshold > 0) parts.push(el('line', { x1: left, x2: width - right, y1: y(result.threshold), y2: y(result.threshold), class: 'water-line' }));
  if (!compact) {
    parts.push(text(width - right, Math.max(top + 10, y(result.threshold) - 6), `level ${formatShare(result.level)} of the peak`, { class: 'axis-label halo', 'text-anchor': 'end' }));
    const ticks = niceTicks(xs[0], xs[xs.length - 1], Math.max(3, Math.floor(width / 90)));
    parts.push(el('g', { class: 'axis' },
      ticks.map((t) => el('line', { x1: x(t), x2: x(t), y1: base, y2: base + 5, class: 'axis-line' })),
      ticks.map((t) => text(x(t), base + 18, formatNumber(t, Number.isInteger(t) ? 0 : 1), { class: 'tick', 'text-anchor': 'middle' }))));
    // The three summaries, each a marker with its name beside it, on the first of
    // three rows where it does not collide with one already placed.
    const marks = [
      { v: result.mode, shape: /** @type {const} */ ('triangle'), cls: 'ink-mark', t: 'mode' },
      { v: result.mean, shape: /** @type {const} */ ('diamond'), cls: 'hollow-strong', t: 'mean' },
      { v: result.median, shape: /** @type {const} */ ('square'), cls: 'hollow-mark', t: 'median' },
    ];
    /** @type {[number, number][][]} */
    const rows = [[], [], []];
    for (const m of marks) {
      const mx = x(m.v);
      const w = textWidth(m.t) + 12;
      const leftward = mx + w > width - right;
      const span = /** @type {[number, number]} */ (leftward ? [mx - w, mx + 6] : [mx - 6, mx + w]);
      const row = rows.findIndex((placed) => placed.every(([a, b]) => span[1] < a - 4 || span[0] > b + 4));
      const r = row < 0 ? 2 : row;
      rows[r].push(span);
      const my = base + 36 + r * 17;
      parts.push(marker(m.shape, mx, my - 4, 5, m.cls),
        text(mx + (leftward ? -9 : 9), my, m.t, { class: 'direct-label', 'text-anchor': leftward ? 'end' : 'start' }));
    }
  }
  return svgRoot({
    width, height,
    label: `A mixture density with its mode at ${formatNumber(result.mode)}, mean ${formatNumber(result.mean)} and median ${formatNumber(result.median)}. Above the water level the density covers ${formatShare(result.covered)} of the mass in ${result.regions.length} region${result.regions.length === 1 ? '' : 's'}.`,
  }, ...parts);
}

/**
 * Mass covered by the highest-density region as the water level falls from the peak
 * to 0, with the current level marked.
 * @param {any} result the modes view's result
 * @param {{ width: number, height: number }} size
 */
export function coverageFigure(result, { width, height }) {
  const left = 46;
  const right = 14;
  const top = 12;
  const bottom = 42;
  const x = scaleLinear([1, 0], [left, width - right]);
  const y = scaleLinear([0, 1], [height - bottom, top]);
  const line = result.coverage.level.map((/** @type {number} */ l, /** @type {number} */ i) => /** @type {Point} */ ([x(l), y(result.coverage.covered[i])]));
  return svgRoot({
    width, height,
    label: `Mass above the water level as it falls from the peak to 0; at ${formatShare(result.level)} of the peak it is ${formatShare(result.covered)}.`,
  },
  axisLeft({ scale: y, x: left, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => `${Math.round(v * 100)}%`, gridTo: width - right }),
  axisBottom({ scale: x, y: height - bottom, ticks: [1, 0.75, 0.5, 0.25, 0], format: (v) => `${Math.round(v * 100)}%`, label: 'water level, share of the peak density', labelGap: 32 }),
  el('path', { d: linePath(line), class: 'ink-line' }),
  el('line', { x1: x(result.level), x2: x(result.level), y1: top, y2: height - bottom, class: 'marker-line' }),
  marker('circle', x(result.level), y(result.covered), 5, 'ink-mark'));
}

/**
 * The density of one coordinate of a uniform point on the unit sphere, with the band
 * around the equator shaded and, when sampled, the Monte Carlo histogram behind it.
 * @param {any} result the sphere view's result
 * @param {{ width: number, height: number }} size
 */
export function sphereFigure(result, { width, height }) {
  const left = 46;
  const right = 14;
  const top = 14;
  const bottom = 42;
  const x = scaleLinear([-1, 1], [left, width - right]);
  const { curve, sample, band } = result;
  // k = 2 has infinite density at ±1: cap the axis at the histogram or a little above the centre.
  const finite = curve.density.filter((/** @type {number} */ _, /** @type {number} */ i) => Math.abs(curve.x[i]) < 0.97);
  const yMax = Math.max(...finite, ...(sample ? sample.density : [])) * 1.08;
  const y = scaleLinear([0, yMax], [height - bottom, top]);
  const base = y(0);
  const pts = curve.x.map((/** @type {number} */ v, /** @type {number} */ i) => /** @type {Point} */ ([x(v), y(Math.min(yMax, curve.density[i]))]));
  const inBand = pts.filter((/** @type {Point} */ _, /** @type {number} */ i) => Math.abs(curve.x[i]) <= band);
  const parts = [
    axisLeft({ scale: y, x: left, ticks: niceTicks(0, yMax, 4), format: (v) => formatNumber(v, v < 1 && v > 0 ? 1 : 0), gridTo: width - right }),
    text(left - 8, top - 4, 'density', { class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'hanging' }),
  ];
  if (sample) {
    sample.density.forEach((/** @type {number} */ dv, /** @type {number} */ i) => {
      if (dv > 0) parts.push(el('rect', { x: x(sample.edges[i]), y: y(dv), width: Math.max(0.5, x(sample.edges[i + 1]) - x(sample.edges[i]) - 0.5), height: base - y(dv), class: 'hist-bar' }));
    });
  }
  parts.push(
    inBand.length > 1 ? el('path', { d: areaPath(inBand, base), class: 'shell-fill' }) : '',
    el('path', { d: linePath(pts), class: 'ink-line' }),
    el('line', { x1: x(-band), x2: x(-band), y1: base, y2: top, class: 'ball-line' }),
    el('line', { x1: x(band), x2: x(band), y1: base, y2: top, class: 'ball-line' }),
    axisBottom({ scale: x, y: base, ticks: [-1, -0.5, 0, 0.5, 1], format: (v) => formatNumber(v, v === 0 || Math.abs(v) === 1 ? 0 : 1), label: 'first coordinate, x₁', labelGap: 32 }),
  );
  return svgRoot({
    width, height,
    label: `Density of one coordinate of a uniform point on the sphere in ${result.k} dimensions, SD ${formatNumber(result.sd, 3)}; ${formatShare(result.bandMass)} of points have |x₁| < ${formatNumber(band)}${sample ? `, and ${formatShare(sample.bandShare)} of the ${sample.n.toLocaleString('en-US')} sampled points` : ''}.`,
  }, ...parts);
}
