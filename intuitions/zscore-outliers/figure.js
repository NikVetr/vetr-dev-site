// Figures for pooled vs stratified outlier removal, drawn from compute()'s result as
// SVG strings (no DOM access). The density figure has two tiers on one scale, so an
// area in either tier is the same share of all the data.

import { formatNumber, formatShare, formatTickShare } from '../lib/format.js';
import { dnorm } from '../lib/normal.js';
import {
  areaPath, axisBottom, axisLeft, el, linePath, logTicks, marker, niceTicks, scaleLinear, scaleLog, svgRoot, text, textWidth,
} from '../lib/plot.js';
import { RANGES } from './compute.js';

/** @typedef {ReturnType<typeof import('./compute.js').compute>} Result */
/** @typedef {import('./compute.js').Params} Params */

const GROUP_STYLE = [
  { line: 'a-line', soft: 'a-soft', strong: 'a-strong', cut: 'a-cut', mark: 'a-mark', shape: /** @type {const} */ ('circle') },
  { line: 'b-line', soft: 'b-soft', strong: 'b-strong', cut: 'b-cut', mark: 'b-mark', shape: /** @type {const} */ ('triangle') },
];

export const SWEEP_LABELS = {
  meanDifference: 'Mean difference, B − A (SDs of A)',
  sdRatio: 'SD of B ÷ SD of A',
  proportionA: 'Share of the data in group A',
  z: 'Cutoff z',
};

/**
 * Both groups' densities, scaled by their shares, with the removed tails filled.
 * Top tier: each group cut at its own mean ± z SD. Bottom tier: the groups stacked
 * into the pooled distribution, cut at the pooled mean ± z pooled SD.
 * `zoom` stretches the vertical scale (both tiers alike, so areas stay comparable)
 * and clips each tier at its top, which makes thin removed tails visible.
 * @param {Result} result
 * @param {{ width: number, height: number, compact?: boolean, zoom?: number, id?: string }} size
 */
export function densityFigure(result, { width, height, compact = false, zoom = 1, id = 'density' }) {
  const { groups, pooled, overall } = result;
  const cut = pooled.cutoffs[1];
  const reach = (/** @type {typeof groups[number]} */ g) => Math.max(4.2, (g.cutoffs[1] - g.mean) / g.sd + 0.6) * g.sd;
  const lo = Math.min(...groups.map((g) => g.mean - reach(g)), -cut * 1.1);
  const hi = Math.max(...groups.map((g) => g.mean + reach(g)), cut * 1.1);
  const pad = compact ? 2 : 8;
  const bottom = compact ? 2 : 42;
  const band = compact ? 0 : 22;
  const gap = compact ? 6 : 12;
  const tier = (height - 2 * pad - bottom - gap - 2 * band) / 2;
  const x = scaleLinear([lo, hi], [pad, width - pad]);
  const top1 = pad + band;
  const base1 = top1 + tier;
  const top2 = base1 + gap + band;
  const base2 = top2 + tier;

  const n = Math.min(700, Math.max(180, Math.round(width)));
  const densities = groups.map((g) => (/** @type {number} */ v) => g.proportion * dnorm(v, g.mean, g.sd));
  let peak = 0;
  for (let i = 0; i <= n; i++) {
    const v = lo + ((hi - lo) * i) / n;
    peak = Math.max(peak, densities[0](v) + densities[1](v));
  }
  const yTo = (/** @type {number} */ base) => (/** @type {number} */ d) => base - ((d * zoom) / (peak * 1.06)) * tier;

  /**
   * Area of f stacked on g over [a, b], sampled finely enough for the width.
   * @param {(v: number) => number} f @param {(v: number) => number} g
   * @param {number} a @param {number} b @param {(d: number) => number} y @param {string} cls
   */
  const area = (f, g, a, b, y, cls) => {
    const from = Math.max(a, lo);
    const to = Math.min(b, hi);
    if (!(to > from)) return '';
    const steps = Math.max(2, Math.ceil(((to - from) / (hi - lo)) * n));
    /** @type {[number, number][]} */
    const topLine = [];
    /** @type {[number, number][]} */
    const bottomLine = [];
    for (let i = 0; i <= steps; i++) {
      const v = from + ((to - from) * i) / steps;
      topLine.push([x(v), y(g(v) + f(v))]);
      bottomLine.push([x(v), y(g(v))]);
    }
    return el('path', { d: areaPath(topLine, bottomLine), class: cls });
  };
  const curve = (/** @type {(v: number) => number} */ f, /** @type {(d: number) => number} */ y, /** @type {string} */ cls) => {
    /** @type {[number, number][]} */
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const v = lo + ((hi - lo) * i) / n;
      pts.push([x(v), y(f(v))]);
    }
    return el('path', { d: linePath(pts), class: cls });
  };
  const zero = () => 0;

  // Top tier: stratified.
  const y1 = yTo(base1);
  const stratified = groups.map((g, i) => {
    const s = GROUP_STYLE[i];
    const [ownLow, ownHigh] = g.cutoffs;
    return [
      area(densities[i], zero, ownLow, ownHigh, y1, s.soft),
      area(densities[i], zero, -Infinity, ownLow, y1, s.strong),
      area(densities[i], zero, ownHigh, Infinity, y1, s.strong),
    ].join('');
  });
  const stratifiedLines = groups.map((g, i) => {
    const s = GROUP_STYLE[i];
    return [
      ...g.cutoffs.map((c) => el('line', { x1: x(c), x2: x(c), y1: base1, y2: top1 + 6, class: s.cut })),
      ...g.cutoffs.map((c) => marker(s.shape, x(c), top1 + 4, 4, s.mark)),
    ].join('');
  });

  // Bottom tier: pooled, A stacked under B.
  const y2 = yTo(base2);
  const pooledParts = groups.map((_, i) => {
    const s = GROUP_STYLE[i];
    const f = densities[i];
    const below = i === 0 ? zero : densities[0];
    return [
      area(f, below, -cut, cut, y2, s.soft),
      area(f, below, -Infinity, -cut, y2, s.strong),
      area(f, below, cut, Infinity, y2, s.strong),
    ].join('');
  });
  const total = (/** @type {number} */ v) => densities[0](v) + densities[1](v);

  const labels = [];
  if (!compact) {
    const stratText = 'Stratified: each group cut at its own mean ± z SD';
    const poolText = 'Pooled: everyone cut at the pooled mean ± z SD';
    const stratShare = `removes ${formatShare(overall.stratifiedRemoved)}`;
    const poolShare = `removes ${formatShare(overall.pooledRemoved)}`;
    const room = width - 2 * pad;
    const fits = (/** @type {string} */ a, /** @type {string} */ b) => textWidth(a, 12.5) + textWidth(b, 12) + 16 <= room;
    const tierLabel = (/** @type {string} */ long, /** @type {string} */ short, /** @type {string} */ share, /** @type {number} */ y) => {
      const name = fits(long, share) ? long : short;
      return text(pad, y, name, { class: 'tier-label' })
        + (fits(name, share) ? text(width - pad, y, share, { class: 'value-label', 'text-anchor': 'end' }) : '');
    };
    labels.push(tierLabel(stratText, 'Stratified', stratShare, top1 - 8), tierLabel(poolText, 'Pooled', poolShare, top2 - 8));
  }

  const ticks = niceTicks(lo, hi, Math.max(3, Math.floor(width / 90)));
  const axisLabel = textWidth('value, in SDs of group A (pooled mean 0)') < width - 2 * pad ? 'value, in SDs of group A (pooled mean 0)' : 'value (SDs of A)';
  const clip = (/** @type {string} */ name, /** @type {number} */ y0) => el('clipPath', { id: `${id}-${name}` },
    el('rect', { x: 0, y: y0, width, height: tier + 1 }));
  const svg = svgRoot({
    width, height,
    label: `Densities of groups A and B scaled by their shares. Stratified cutoffs remove ${formatShare(overall.stratifiedRemoved)} of the data; pooled cutoffs at ±${formatNumber(cut)} remove ${formatShare(overall.pooledRemoved)}.`,
  },
  el('defs', {}, clip('top', top1), clip('bottom', top2)),
  el('line', { x1: pad, x2: width - pad, y1: base1, y2: base1, class: 'baseline' }),
  el('g', { 'clip-path': `url(#${id}-top)` }, stratified, groups.map((_, i) => curve(densities[i], y1, GROUP_STYLE[i].line))),
  stratifiedLines,
  el('g', { 'clip-path': `url(#${id}-bottom)` }, pooledParts, curve(densities[0], y2, 'a-line'), curve(total, y2, 'ink-line')),
  [-cut, cut].map((c) => el('line', { x1: x(c), x2: x(c), y1: base2, y2: top2, class: 'cut-pooled' })),
  el('line', { x1: pad, x2: width - pad, y1: base2, y2: base2, class: 'baseline' }),
  labels,
  compact ? '' : axisBottom({ scale: x, y: base2, ticks, format: (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1), label: axisLabel }));
  return { svg };
}

/**
 * Share removed by the pooled rule as one parameter sweeps its range, per group and
 * overall, with the stratified share (the nominal rate) for reference. The current
 * value is marked; the returned scale lets a page turn a pointer position back into
 * a parameter value.
 * @param {Result} result
 * @param {Params} params
 * @param {{ width: number, height: number, log: boolean }} options
 */
export function sweepFigure(result, params, { width, height, log }) {
  const { sweep } = result;
  if (!sweep) throw new Error('sweepFigure needs a result computed with a sweep parameter, not sweep: null');
  const parameter = sweep.parameter;
  const series = [
    { key: 'stratified', values: sweep.stratified, current: result.overall.stratifiedRemoved, line: 'muted-line', mark: 'hollow-mark', shape: /** @type {const} */ ('diamond'), label: 'Stratified' },
    { key: 'pooledOverall', values: sweep.pooledOverall, current: result.overall.pooledRemoved, line: 'ink-line', mark: 'ink-mark', shape: /** @type {const} */ ('square'), label: 'All' },
    { key: 'pooledA', values: sweep.pooledA, current: result.groups[0].pooledRemoved, line: 'a-line', mark: 'a-mark', shape: /** @type {const} */ ('circle'), label: 'A' },
    { key: 'pooledB', values: sweep.pooledB, current: result.groups[1].pooledRemoved, line: 'b-line', mark: 'b-mark', shape: /** @type {const} */ ('triangle'), label: 'B' },
  ];
  const left = log ? 54 : 50;
  const right = 82;
  const top = 10;
  const bottom = 46;
  const range = RANGES[parameter];
  const x = parameter === 'sdRatio' ? scaleLog(range, [left, width - right]) : scaleLinear(range, [left, width - right]);

  const all = series.flatMap((s) => s.values);
  const positive = all.filter((v) => v > 0);
  const maxValue = Math.max(...all);
  /** @type {[number, number]} */
  let domain;
  if (log) {
    const lowest = Math.max(1e-10, Math.min(...positive));
    domain = [10 ** Math.floor(Math.log10(lowest)), Math.min(1, 10 ** Math.ceil(Math.log10(maxValue)))];
    if (domain[1] <= domain[0]) domain[0] = domain[1] / 10;
  } else {
    domain = [0, maxValue * 1.08 || 1];
  }
  const plotHeight = height - top - bottom;
  const y = (log ? scaleLog : scaleLinear)(domain, [top + plotHeight, top]);
  const yTicks = log ? logTicks(domain[0], domain[1], Math.max(3, Math.floor(plotHeight / 30))) : niceTicks(0, domain[1], 5);
  const clampY = (/** @type {number} */ v) => Math.max(top, Math.min(top + plotHeight, y(Math.max(v, log ? domain[0] : 0))));

  const paths = series.map((s) => {
    /** @type {[number, number][][]} */
    const runs = [[]];
    s.values.forEach((v, i) => {
      if (log && !(v >= domain[0])) {
        if (runs[runs.length - 1].length) runs.push([]);
        return;
      }
      runs[runs.length - 1].push([x(sweep.values[i]), y(v)]);
    });
    return runs.filter((run) => run.length > 1).map((run) => el('path', { d: linePath(run), class: s.line })).join('');
  });

  // Direct labels at the right end, nudged apart so they never overlap.
  const ends = series.map((s) => ({ label: s.label, y: clampY(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
  const overflow = ends[ends.length - 1].y - (top + plotHeight + 4);
  if (overflow > 0) ends.forEach((e) => { e.y -= overflow; });

  const current = params[parameter];
  const cx = x(current);
  const xTicks = parameter === 'sdRatio' ? [0.2, 0.5, 1, 2, 5] : parameter === 'proportionA' ? [0.25, 0.5, 0.75] : niceTicks(range[0], range[1], Math.max(3, Math.floor((width - left - right) / 70)));
  const xFormat = parameter === 'proportionA' ? (/** @type {number} */ v) => `${Math.round(v * 100)}%` : (/** @type {number} */ v) => formatNumber(v, Number.isInteger(v) ? 0 : 1);
  const yFormat = log ? formatTickShare : (/** @type {number} */ v) => `${Number((v * 100).toPrecision(3))}%`;

  const svg = svgRoot({
    width, height,
    label: `Share removed by the pooled rule as ${SWEEP_LABELS[parameter].toLowerCase()} varies; the current value ${xFormat(current)} is marked.`,
  },
  axisLeft({ scale: y, x: left, ticks: yTicks, format: yFormat, gridTo: width - right }),
  axisBottom({ scale: x, y: top + plotHeight, ticks: xTicks, format: xFormat, label: SWEEP_LABELS[parameter], labelGap: 36 }),
  paths,
  el('line', { x1: cx, x2: cx, y1: top, y2: top + plotHeight, class: 'marker-line' }),
  series.map((s) => marker(s.shape, cx, clampY(s.current), 4.5, s.mark)),
  ends.map((e) => text(width - right + 8, e.y + 4, e.label, { class: 'direct-label' })));
  return { svg, x, plot: { left, right: width - right, top, bottom: top + plotHeight } };
}
