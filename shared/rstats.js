// R's sum(), mean() and cumsum() of doubles, as close as doubles allow: R accumulates
// in long double, so these use compensated (Neumaier) summation, and mean() adds R's
// refinement pass. Also seq() by length and by step, with R's rounding of the
// length and its fuzz at the end of a stepped sequence.

const DBL_EPSILON = 2.220446049250313e-16;

/** @param {ArrayLike<number>} values */
export function sum(values) {
  let s = 0;
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
  }
  return s + c;
}

/** @param {ArrayLike<number>} values */
export function mean(values) {
  const n = values.length;
  const m = sum(values) / n;
  if (!Number.isFinite(m)) return m;
  let s = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i] - m;
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
  }
  return m + (s + c) / n;
}

/** cumsum() of doubles, accumulated with compensation as R does in long double. @param {ArrayLike<number>} values */
export function cumsum(values) {
  const out = new Array(values.length);
  let s = 0;
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
    out[i] = s + c;
  }
  return out;
}

/** seq(from, to, length.out = n), n rounded up as R does. @param {number} from @param {number} to @param {number} n */
export function seqLength(from, to, n) {
  const len = Math.ceil(n);
  if (len === 1) return [from];
  if (len === 2) return [from, to];
  if (from === to) return new Array(len).fill(from);
  const n1 = len - 1;
  const by = (to - from) / n1;
  const out = [from];
  for (let i = 1; i < n1; i++) out.push(from + i * by);
  out.push(to);
  return out;
}

/** seq(from, to, by = by) for by > 0. @param {number} from @param {number} to @param {number} by */
export function seqBy(from, to, by) {
  const del = to - from;
  if (del === 0 && to === 0) return [to];
  if (Math.abs(del) / Math.max(Math.abs(to), Math.abs(from)) < 100 * DBL_EPSILON) return [from];
  const n = Math.trunc(del / by + 1e-10);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(Math.min(from + i * by, to));
  return out;
}
