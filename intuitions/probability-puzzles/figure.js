// Figures for the probability puzzles, as SVG strings (no DOM access). Every state that a
// colour marks has a second cue: suits have their glyphs (red ♥ ♦, black ♠ ♣), each kid a
// colour and a marker shape, opened boxes their ticket number and a tint, heads and tails
// their letters and a fill, outcomes a ✓ or ✗. The play-through figures take `t`, how far
// the playback has got.

import { axisBottom, axisLeft, el, linePath, marker, niceTicks, scaleLinear, seriesMark, svgRoot, text } from '../lib/plot.js';

/** @typedef {[number, number]} Point */

const GLYPH = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const percent = (/** @type {number} */ p, d = 1) => `${(p * 100).toFixed(d)}%`;

// ---------- The Kruskal count ----------

/**
 * The deal: 52 cards in rows, each with its position, rank and suit, and what it counts
 * when that differs from its rank; each kid's path up to jump `t`, with the kid's marker
 * where they stand; at the end, the last cards outlined.
 * @param {any} result @param {{ width: number, t: number }} options
 */
export function dealFigure(result, { width, t }) {
  const { cards, walks, ends, together } = result.play;
  const cols = width >= 720 ? 13 : width >= 470 ? 9 : 7;
  const gap = 4;
  const w = (width - gap * (cols - 1)) / cols;
  const h = Math.min(w * 1.25, 66);
  const rows = Math.ceil(52 / cols);
  const height = rows * (h + gap) + 4;
  const cell = (/** @type {number} */ i) => ({ x: (i % cols) * (w + gap), y: Math.floor(i / cols) * (h + gap) + 2 });
  // Paths run through each card's lower band, below its rank.
  const anchor = (/** @type {number} */ i) => /** @type {Point} */ ([cell(i).x + w / 2, cell(i).y + h * 0.8]);
  const done = walks.every((/** @type {number[]} */ path) => t >= path.length - 1);
  const endSet = new Set(done ? ends : []);
  const step = Math.floor(t);
  /** @type {string[]} */
  const cardsOut = [];
  /** @type {string[]} */
  const labels = [];
  const big = w >= 44;
  cards.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
    const { x, y } = cell(i);
    const red = c.suit === 'hearts' || c.suit === 'diamonds';
    cardsOut.push(el('rect', { x, y, width: w, height: h, rx: 5, class: `card-face${endSet.has(i) ? ' end' : ''}` }));
    labels.push(text(x + 4, y + 11, String(i + 1), { class: 'card-index' }));
    labels.push(text(x + w / 2, y + h * 0.5 + 2, `${c.rank}${GLYPH[/** @type {keyof typeof GLYPH} */ (c.suit)]}`, { class: `card-rank halo ${red ? 'suit-red' : 'suit-black'}${big ? '' : ' small'}`, 'text-anchor': 'middle' }));
    if (String(c.value) !== c.rank && c.rank !== 'A') labels.push(text(x + w - 4, y + 11, `=${c.value}`, { class: 'card-count', 'text-anchor': 'end' }));
  });
  // A stretch walked by several kids is drawn once, in ink; one kid's alone in their colour.
  /** @type {Map<string, Set<number>>} */
  const segments = new Map();
  walks.forEach((/** @type {number[]} */ path, /** @type {number} */ k) => {
    for (let j = 1; j < Math.min(path.length, step + 1); j++) {
      const key = `${path[j - 1]} ${path[j]}`;
      if (!segments.has(key)) segments.set(key, new Set());
      /** @type {Set<number>} */ (segments.get(key)).add(k);
    }
  });
  const lines = [...segments].map(([key, kids]) => {
    const [a, b] = key.split(' ').map(Number);
    const cls = kids.size > 1 ? 'walk-line shared' : `k-line k${[...kids][0] % 6} walk-line`;
    return el('path', { d: linePath([anchor(a), anchor(b)]), class: cls });
  });
  // Each kid's marker where they stand, side by side when they share a card.
  /** @type {Map<number, number[]>} */
  const standing = new Map();
  walks.forEach((/** @type {number[]} */ path, /** @type {number} */ k) => {
    const at = path[Math.min(path.length - 1, step)];
    standing.set(at, [...(standing.get(at) ?? []), k]);
  });
  /** @type {string[]} */
  const marks = [];
  for (const [at, kids] of standing) {
    const [ax, ay] = anchor(at);
    const space = Math.min(9, (w - 8) / kids.length);
    kids.forEach((k, j) => {
      const s = seriesMark(k);
      marks.push(marker(s.shape, ax + (j - (kids.length - 1) / 2) * space, ay, big ? 4 : 3.4, s.mark));
    });
  }
  const m = walks.length;
  const at = walks.map((/** @type {number[]} */ p) => p[Math.min(p.length - 1, step)] + 1);
  return svgRoot({
    width, height,
    label: `A shuffled deck of 52 cards. ${m} kids start on cards 1 to ${m}; after ${step} jumps they stand on cards ${at.join(', ')}.${done ? (together ? ` They all end on card ${ends[0] + 1}.` : ` They end on cards ${[...new Set(ends)].map((e) => e + 1).join(' and ')}.`) : ''}`,
  }, ...cardsOut, ...lines, ...labels, ...marks);
}

/**
 * The chance that kids on all of the first i cards end on the same card, i = 1 … 52, from
 * the simulation, with a 95% band; the window marked.
 * @param {any} result @param {{ width: number, height: number }} options
 */
export function windowFigure(result, { width, height }) {
  const sim = result.simulation;
  const left = 46;
  const right = 14;
  const upper = 28;
  const bottom = 42;
  const x = scaleLinear([1, 52], [left, width - right]);
  const y = scaleLinear([0, 1], [height - bottom, upper]);
  const n = sim.replicates;
  const values = /** @type {number[]} */ (sim.byWindow);
  const se = values.map((p) => 1.96 * Math.sqrt((p * (1 - p)) / n));
  const upperBand = values.map((p, i) => /** @type {Point} */ ([x(i + 1), y(Math.min(1, p + se[i]))]));
  const lowerBand = values.map((p, i) => /** @type {Point} */ ([x(i + 1), y(Math.max(0, p - se[i]))])).reverse();
  const m = result.window;
  const parts = [
    axisLeft({ scale: y, x: left, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => `${Math.round(v * 100)}%`, gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: [1, 10, 20, 30, 40, 52], label: 'kids, one on each of the first cards', labelGap: 34 }),
    el('path', { d: `${linePath(upperBand)}${lowerBand.map(([a, b]) => `L${a} ${b}`).join('')}Z`, class: 'k-soft k0' }),
    el('path', { d: linePath(values.map((p, i) => /** @type {Point} */ ([x(i + 1), y(p)]))), class: 'k-line k0' }),
    el('line', { x1: x(m), x2: x(m), y1: upper, y2: height - bottom, class: 'at-line' }),
    marker('circle', x(m), y(values[m - 1]), 5, 'k-mark k0'),
    text(x(m) + 8, y(values[m - 1]) - 8, `${m} kids: ${percent(values[m - 1])}`, { class: 'direct-label halo' }),
    text(left - 40, 12, 'share of deals', { class: 'axis-label' }),
  ];
  return svgRoot({ width, height, label: `The simulated chance that kids starting on each of the first i cards all end on the same card: ${percent(values[0])} for one, ${percent(values[m - 1])} for ${m}, ${percent(values[51])} for all 52.` }, ...parts);
}

// ---------- The secretary problem ----------

/**
 * The applicants in order, each a dot at their quality, shown up to applicant `t`: the best
 * so far filled, the rest faint; the cutoff rule's skipped stretch shaded, or a threshold
 * rule's line; the one hired, and at the end the best.
 * @param {any} result @param {{ width: number, height: number, t: number }} options
 */
export function applicantsFigure(result, { width, height, t }) {
  const { values, records, best, pick, thresholds } = result.play;
  const n = result.n;
  const left = 46;
  const right = 14;
  const upper = 30;
  const bottom = 42;
  const x = scaleLinear([0.5, n + 0.5], [left, width - right]);
  const y = scaleLinear([0, 1], [height - bottom, upper]);
  const shown = Math.floor(t);
  const parts = [
    axisLeft({ scale: y, x: left, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => String(v), gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(1, n, width < 420 ? 4 : 8).filter((v) => v >= 1), label: 'applicants, in the order they come', labelGap: 34 }),
    text(left - 40, 12, 'quality, as a quantile', { class: 'axis-label' }),
  ];
  if (result.strategy === 'cutoff') {
    if (result.cutoff > 0) {
      parts.push(el('rect', { x: x(0.5), y: upper, width: x(result.cutoff + 0.5) - x(0.5), height: height - bottom - upper, class: 'skip-zone' }));
      parts.push(text(x(0.5) + 6, height - bottom - 8, `skip ${result.cutoff}`, { class: 'direct-label halo' }));
    }
  } else {
    const pts = thresholds.map((/** @type {number} */ v, /** @type {number} */ i) => /** @type {Point} */ ([x(i + 1), y(v)]));
    parts.push(el('path', { d: linePath(pts), class: 'threshold-curve' }));
  }
  const isRecord = new Set(records);
  const r = n > 300 ? 1.6 : n > 120 ? 2.2 : 3;
  for (let i = 0; i < Math.min(n, shown); i++) {
    parts.push(isRecord.has(i) ? marker('circle', x(i + 1), y(values[i]), r + 0.6, 'k-mark k0') : el('circle', { cx: x(i + 1), cy: y(values[i]), r, class: 'applicant-dot' }));
  }
  if (pick >= 0 && shown > pick) {
    parts.push(marker('diamond', x(pick + 1), y(values[pick]), 6.5, 'k-mark k1'));
    parts.push(text(x(pick + 1), y(values[pick]) - 12, `hired: ${pick + 1}`, { class: 'direct-label strong halo', 'text-anchor': x(pick + 1) > width - 80 ? 'end' : 'middle' }));
  }
  if (shown >= n) {
    parts.push(el('circle', { cx: x(best + 1), cy: y(values[best]), r: 10, class: 'best-ring' }));
    if (best !== pick) parts.push(text(x(best + 1), y(values[best]) + 24, `best: ${best + 1}`, { class: 'direct-label halo', 'text-anchor': x(best + 1) > width - 80 ? 'end' : 'middle' }));
  }
  const outcome = shown >= n ? (pick === best ? ' The one hired is the best.' : pick < 0 ? ' No one was hired.' : ` The best was applicant ${best + 1}.`) : '';
  return svgRoot({ width, height, label: `${n} applicants by quality, ${Math.min(n, shown)} seen so far.${pick >= 0 && shown > pick ? ` Applicant ${pick + 1} was hired.` : ''}${outcome}` }, ...parts);
}

/**
 * The chance of hiring the best against how many applicants are skipped, exactly, with 1/e,
 * the chosen cutoff and its simulated rate, and what knowing the distribution gives.
 * @param {any} result @param {{ width: number, height: number }} options
 */
export function cutoffFigure(result, { width, height }) {
  const n = result.n;
  const e = result.exact;
  const left = 46;
  const right = 14;
  const upper = 28;
  const bottom = 42;
  const x = scaleLinear([0, n - 1], [left, width - right]);
  const top = Math.min(1, Math.max(0.7, e.optimal + 0.08));
  const y = scaleLinear([0, top], [height - bottom, upper]);
  const parts = [
    axisLeft({ scale: y, x: left, ticks: niceTicks(0, top, 5), format: (v) => `${Math.round(v * 100)}%`, gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(0, n - 1, width < 420 ? 4 : 8), label: 'applicants skipped before choosing, r', labelGap: 34 }),
    text(left - 40, 12, 'chance', { class: 'axis-label' }),
    el('line', { x1: left, x2: width - right, y1: y(1 / Math.E), y2: y(1 / Math.E), class: 'ink-line dashed thin-dash' }),
    text(width - right - 4, y(1 / Math.E) + 15, '1/e', { class: 'axis-label halo', 'text-anchor': 'end' }),
  ];
  // The two full-information rules are within a point of each other: one line, both numbers.
  parts.push(el('line', { x1: left, x2: width - right, y1: y(e.optimal), y2: y(e.optimal), class: 'k-line k2 dashed' }));
  parts.push(text(width - right - 4, y(e.optimal) - 6, `knowing the distribution: ${percent(e.optimal)}, or ${percent(e.half)} by the 50% rule`, { class: 'direct-label halo', 'text-anchor': 'end' }));
  parts.push(el('path', { d: linePath(e.curve.map((/** @type {number} */ p, /** @type {number} */ r) => /** @type {Point} */ ([x(r), y(p)]))), class: 'k-line k0' }));
  const r = result.cutoff;
  parts.push(el('line', { x1: x(r), x2: x(r), y1: upper, y2: height - bottom, class: 'at-line' }));
  const sim = result.simulation?.cutoff;
  if (sim) {
    parts.push(el('line', { x1: x(r), x2: x(r), y1: y(Math.max(0, sim.rate - 1.96 * sim.se)), y2: y(Math.min(top, sim.rate + 1.96 * sim.se)), class: 'k-bar k1 thin' }));
    parts.push(marker('triangle', x(r), y(sim.rate), 5, 'k-mark k1'));
  }
  parts.push(marker('circle', x(r), y(e.cutoff), 5, 'k-mark k0'));
  parts.push(marker('square', x(e.best.cutoff), y(e.best.probability), 3.4, 'hollow-strong'));
  const anchor = x(r) > width * 0.6 ? 'end' : 'start';
  parts.push(text(x(r) + (anchor === 'end' ? -10 : 10), y(e.cutoff) + 22, `skip ${r}: ${percent(e.cutoff)}`, { class: 'direct-label strong halo', 'text-anchor': anchor }));
  return svgRoot({ width, height, label: `For ${n} applicants, the chance that skipping r and taking the next best so far hires the best, for every r: ${percent(e.cutoff)} at r = ${r}, at most ${percent(e.best.probability)} at r = ${e.best.cutoff}. Knowing the distribution of qualities, the best rule wins ${percent(e.optimal)}.` }, ...parts);
}

// ---------- The prisoners ----------

/**
 * The boxes in a grid, each with its number; the boxes the prisoner has opened by step `t`
 * tinted, with the ticket inside and the order they were opened (#1, #2, …), the latest
 * outlined; ✓ on the box with the
 * prisoner's own number, ✗ on the last one opened if it never turned up.
 * @param {any} result @param {{ width: number, t: number, columns?: number }} options
 */
export function boxesFigure(result, { width, t, columns }) {
  const n = result.boxes;
  const { tickets, opened, found } = result.play;
  const cols = columns ?? Math.min(Math.ceil(Math.sqrt(n)), width < 420 ? 10 : 20);
  const gap = 3;
  const w = (width - gap * (cols - 1)) / cols;
  const h = Math.min(w, 52);
  const rows = Math.ceil(n / cols);
  const height = rows * (h + gap) + 2;
  const cell = (/** @type {number} */ b) => ({ x: (b % cols) * (w + gap), y: Math.floor(b / cols) * (h + gap) + 1 });
  const step = Math.min(opened.length, Math.floor(t));
  /** @type {Map<number, number>} */
  const order = new Map(opened.slice(0, step).map((/** @type {number} */ b, /** @type {number} */ i) => [b - 1, i]));
  const parts = [];
  const small = w < 30;
  for (let b = 0; b < n; b++) {
    const { x, y } = cell(b);
    const at = order.get(b);
    const open = at !== undefined;
    const own = open && tickets[b] === result.prisoner;
    const last = open && at === step - 1 && step === opened.length && !found;
    const current = open && at === step - 1;
    parts.push(el('rect', { x, y, width: w, height: h, rx: 3, class: `box${open ? ' open' : ''}${own ? ' own' : ''}${last ? ' failed' : ''}${current && !own && !last ? ' current' : ''}` }));
    if (open) {
      parts.push(text(x + 3, y + (small ? 8 : 10), String(b + 1), { class: 'box-number small' }));
      if (!small) parts.push(text(x + w - 3, y + 10, `#${(at ?? 0) + 1}`, { class: 'box-order', 'text-anchor': 'end' }));
      parts.push(text(x + w / 2, y + h / 2 + (small ? 6 : 7), `${own ? '✓' : last ? '✗' : ''}${tickets[b]}`, { class: `box-ticket${small ? ' small' : ''}${own ? ' own' : ''}`, 'text-anchor': 'middle' }));
    } else {
      parts.push(text(x + w / 2, y + h / 2 + 4, String(b + 1), { class: `box-number${small ? ' small' : ''}`, 'text-anchor': 'middle' }));
    }
  }
  const shownBoxes = opened.slice(0, step);
  return svgRoot({
    width, height,
    label: `${n} boxes. Prisoner ${result.prisoner} has opened ${step} of up to ${result.attempts}: ${shownBoxes.map((/** @type {number} */ b) => `box ${b} holds ${tickets[b - 1]}`).join(', ')}.${step === opened.length ? (found ? ' The last holds their number.' : ' Their number did not turn up.') : ''}`,
  }, ...parts);
}

/**
 * The shuffle's loops as one strip, each loop a segment as long as it is: within the
 * prisoners' limit plain, longer ones in the alert colour with ✗; the chosen prisoner's
 * loop outlined.
 * @param {any} result @param {{ width: number }} options
 */
export function loopsFigure(result, { width }) {
  const n = result.boxes;
  const t = result.attempts;
  const { loops, loopOf } = result.play;
  const left = 2;
  const right = 2;
  const height = 64;
  const x = scaleLinear([0, n], [left, width - right]);
  const sorted = loops.map((/** @type {number[]} */ l, /** @type {number} */ k) => ({ k, length: l.length })).sort((/** @type {any} */ a, /** @type {any} */ b) => b.length - a.length);
  const mine = loopOf[result.prisoner - 1];
  const parts = [];
  let at = 0;
  const y0 = 6;
  const bar = 28;
  for (const { k, length } of sorted) {
    const long = length > t;
    parts.push(el('rect', { x: x(at), y: y0, width: Math.max(0.8, x(at + length) - x(at) - 0.8), height: bar, class: `loop-segment${long ? ' long' : ''}${k === mine ? ' mine' : ''}` }));
    const wide = x(at + length) - x(at);
    if (wide > 26) parts.push(text(x(at) + wide / 2, y0 + bar / 2 + 4, `${long ? '✗ ' : ''}${length}`, { class: `loop-label${long ? ' long' : ''}`, 'text-anchor': 'middle' }));
    at += length;
  }
  parts.push(text(left, y0 + bar + 18, `${loops.length} loops; a loop longer than ${t} fails everyone in it`, { class: 'axis-label' }));
  return svgRoot({ width, height, label: `The shuffle's ${loops.length} loops, longest first: ${sorted.map((/** @type {any} */ s) => s.length).join(', ')}. Loops longer than ${t}: ${sorted.filter((/** @type {any} */ s) => s.length > t).length}.` }, ...parts);
}

// ---------- The coins ----------

/**
 * Trials one after another, up to `t`: the coin drawn and its flips, H filled and T hollow,
 * stopped at the first tail; trials with k heads first are kept, and their next flip ringed.
 * @param {any} result @param {{ width: number, t: number }} options
 */
export function trialsFigure(result, { width, t }) {
  const trials = result.play.trials;
  const k = result.heads;
  const flip = 15;
  const LABEL = 86;
  const tileW = LABEL + 8 + (k + 1) * flip;
  const cols = Math.max(1, Math.min(4, Math.floor((width + 10) / (tileW + 10))));
  const tile = (width - 10 * (cols - 1)) / cols;
  const rowH = 24;
  const rows = Math.ceil(trials.length / cols);
  const height = rows * rowH + 4;
  const step = Math.min(trials.length, Math.floor(t));
  /** @type {string[]} */
  const parts = [];
  trials.slice(0, step).forEach((/** @type {any} */ tr, /** @type {number} */ i) => {
    const x0 = (i % cols) * (tile + 10);
    const y0 = Math.floor(i / cols) * rowH + 2;
    parts.push(el('rect', { x: x0, y: y0, width: tile, height: rowH - 4, rx: 4, class: `trial${tr.kept ? ' kept' : ''}` }));
    parts.push(text(x0 + 6, y0 + 14, tr.twoHeaded ? 'two-headed' : 'fair', { class: `coin-label${tr.twoHeaded ? ' two' : ''}` }));
    const flipScale = Math.min(1, (tile - LABEL - 8) / ((k + 1) * flip));
    tr.flips.forEach((/** @type {boolean} */ head, /** @type {number} */ f) => {
      const cx = x0 + LABEL + (f + 0.5) * flip * flipScale;
      const cy = y0 + 10;
      const next = tr.kept && f === k;
      parts.push(el('circle', { cx, cy, r: 6.2 * Math.max(0.75, flipScale), class: `flip ${head ? 'head' : 'tail'}${next ? ' next' : ''}` }));
      parts.push(text(cx, cy + 3.5, head ? 'H' : 'T', { class: `flip-letter ${head ? 'head' : 'tail'}`, 'text-anchor': 'middle' }));
    });
  });
  const kept = trials.slice(0, step).filter((/** @type {any} */ tr) => tr.kept);
  return svgRoot({ width, height, label: `${step} trials: ${kept.length} began with ${k} heads and were kept, and ${kept.filter((/** @type {any} */ tr) => tr.flips[k]).length} of those came up heads once more.` }, ...parts);
}

/**
 * The chance that the coin is two-headed, and that the next flip is heads, after k heads in a
 * row, k = 0 … 20, exactly; the chosen k marked, with the simulated rates.
 * @param {any} result @param {{ width: number, height: number }} options
 */
export function posteriorFigure(result, { width, height }) {
  const curve = result.exact.curve;
  const left = 46;
  const right = 14;
  const upper = 28;
  const bottom = 42;
  const x = scaleLinear([0, 20], [left, width - right]);
  const y = scaleLinear([0, 1], [height - bottom, upper]);
  const k = result.heads;
  const parts = [
    axisLeft({ scale: y, x: left, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => `${Math.round(v * 100)}%`, gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: [0, 5, 10, 15, 20], label: 'heads in a row so far, k', labelGap: 34 }),
    el('line', { x1: x(k), x2: x(k), y1: upper, y2: height - bottom, class: 'at-line' }),
    text(left - 40, 12, 'chance', { class: 'axis-label' }),
  ];
  const sim = result.simulation;
  for (const [key, j, shape, label] of /** @type {const} */ ([['posterior', 0, 'circle', 'the coin is two-headed'], ['nextHead', 1, 'triangle', 'the next flip is heads']])) {
    const pts = curve.map((/** @type {any} */ c) => /** @type {Point} */ ([x(c.heads), y(c[key])]));
    parts.push(el('path', { d: linePath(pts), class: `k-line k${j}` }));
    for (const c of curve) if (c.heads % 5 === 0 || c.heads === k) parts.push(marker(shape, x(c.heads), y(c[key]), c.heads === k ? 5.5 : 3.6, `k-mark k${j}`));
    const s = sim?.[key === 'posterior' ? 'twoHeaded' : 'nextHead'];
    if (s) parts.push(el('line', { x1: x(k) + 8, x2: x(k) + 8, y1: y(Math.max(0, s.rate - 1.96 * s.se)), y2: y(Math.min(1, s.rate + 1.96 * s.se)), class: `k-bar k${j} thin` }), marker('square', x(k) + 8, y(s.rate), 2.6, `k-hollow k${j}`));
    const c0 = curve[Math.min(20, Math.max(0, k <= 10 ? 14 : 3))];
    parts.push(text(x(c0.heads), y(c0[key]) + (key === 'posterior' ? 18 : -10), label, { class: 'direct-label halo', 'text-anchor': 'middle' }));
  }
  const e = result.exact;
  return svgRoot({ width, height, label: `After ${k} heads in a row, the coin is two-headed with chance ${percent(e.posterior)} and the next flip is heads with chance ${percent(e.nextHead)}.` }, ...parts);
}
