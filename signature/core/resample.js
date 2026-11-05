// Arc-length resampling, as the R script's interpolate_to_length_kd(x, n,
// equal_increments = TRUE, segs) and break_integer(): every stroke is cut
// into equal steps along its length, a total point budget split across the
// strokes in proportion to their lengths. Each new point carries its raw arc
// length, so the timing and pressure of the raw samples can be read off it.

import { seqLength } from '../../shared/rstats.js';

/**
 * @typedef {{ x: number, y: number, t?: number, pressure?: number }} RawPoint
 * @typedef {{ x: Float64Array, y: Float64Array, s: Float64Array }} Resampled  s: raw arc length of each point
 */

/** Cumulative arc length of a polyline, from 0. @param {ArrayLike<number>} x @param {ArrayLike<number>} y */
export function cumulativeLength(x, y) {
  const s = new Float64Array(x.length);
  for (let i = 1; i < x.length; i++) {
    const dx = x[i] - x[i - 1];
    const dy = y[i] - y[i - 1];
    s[i] = s[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return s;
}

/**
 * break_integer(x, proportions): x split into whole parts as near x × proportions
 * as rounding allows, the remainder going to the parts rounding moved most.
 * @param {number} x @param {number[]} proportions
 */
export function breakInteger(x, proportions) {
  const chunks = proportions.map((p) => roundHalfEven(x * p));
  const diff = x - chunks.reduce((a, b) => a + b, 0);
  const err = chunks.map((c, i) => Math.abs(c - x * proportions[i]));
  // order(abs_error, decreasing = TRUE): stable, so ties keep their order
  const idx = err.map((_, i) => i).sort((a, b) => err[b] - err[a] || a - b);
  for (let k = 0; k < Math.abs(diff); k++) chunks[idx[k]] += Math.sign(diff);
  return chunks;
}

/**
 * One stroke resampled to n points at equal steps along its length (n >= 2),
 * or its first point when n is 1.
 * @param {ArrayLike<number>} x @param {ArrayLike<number>} y @param {number} n
 * @returns {Resampled}
 */
export function resampleStroke(x, y, n) {
  const cum = cumulativeLength(x, y);
  const total = cum[cum.length - 1];
  const at = seqLength(0, total, n);
  const out = { x: new Float64Array(n), y: new Float64Array(n), s: Float64Array.from(at) };
  const m = x.length;
  let floor = 0; // 0-based: the last raw point with cum <= at (R's sum(at >= cum), 1-based)
  for (let i = 0; i < n; i++) {
    while (floor + 1 < m && at[i] >= cum[floor + 1]) floor++;
    const step = floor + 1 < m ? cum[floor + 1] - cum[floor] : 1; // R's c(dists, 1)[floor]
    const prop = (at[i] - cum[floor]) / step;
    const next = Math.min(floor + 1, m - 1);
    out.x[i] = x[floor] + (x[next] - x[floor]) * prop;
    out.y[i] = y[floor] + (y[next] - y[floor]) * prop;
  }
  return out;
}

/**
 * interpolate_to_length_kd(x, n, equal_increments = TRUE, segs): n points over
 * all strokes, split by length (break_integer), each stroke resampled evenly.
 * @param {{ x: ArrayLike<number>, y: ArrayLike<number> }[]} strokes @param {number} n
 */
export function resampleBudget(strokes, n) {
  const lengths = strokes.map((s) => {
    const cum = cumulativeLength(s.x, s.y);
    return cum[cum.length - 1];
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  const counts = breakInteger(n, lengths.map((l) => l / total));
  return strokes.map((s, i) => resampleStroke(s.x, s.y, counts[i]));
}

/** C's nearbyint, R's round(): halves to even. @param {number} v */
function roundHalfEven(v) {
  const r = Math.round(v);
  return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
