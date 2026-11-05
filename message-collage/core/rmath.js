// The pieces of R's arithmetic the layout and the colouring use, computed as R computes them:
// round() (halves to even), quantile() type 7, var(), and dnorm() (src/nmath/dnorm.c, with a
// correctly rounded exp, as glibc's nearly always is). sum(), mean(), cumsum() and
// seq(from, to, length.out) are shared/rstats.js's.

import { exp } from './crmath.js';

export { cumsum, mean, seqLength, sum } from '../../shared/rstats.js';

/** R's round(x) for whole numbers: halves to even. @param {number} x */
export function roundHalfEven(x) {
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * R's quantile(x, probs) with the default type 7, on sorted data.
 * @param {Float64Array} sorted ascending @param {number} p
 */
export function quantile7(sorted, p) {
  const n = sorted.length;
  const index = 1 + Math.max(n - 1, 0) * p;
  const lo = Math.floor(index * (1 + 4 * Number.EPSILON)); // R's fuzz
  const hi = Math.ceil(index);
  const qs = sorted[lo - 1];
  if (index > lo && sorted[hi - 1] !== qs) {
    const h = index - lo;
    return (1 - h) * qs + h * sorted[hi - 1];
  }
  return qs;
}

/** R's var(x): squared deviations from the two-pass mean, summed and divided by n - 1. @param {ArrayLike<number>} x @param {number} xm the mean */
export function variance(x, xm) {
  let s = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (x[i] - xm) * (x[i] - xm);
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
  }
  return (s + c) / (x.length - 1);
}

const M_1_SQRT_2PI = 0.398942280401432677939946059934;

/** R's dnorm(x) (mean 0, sd 1). @param {number} x */
export function dnorm(x) {
  const z = Math.abs(x);
  if (z < 5) return M_1_SQRT_2PI * exp(-0.5 * z * z) / 1;
  if (z > Math.sqrt(-2 * Math.LN2 * (-1021 + 1 - 53))) return 0;
  const z1 = roundHalfEven(z * 65536) / 65536;
  const z2 = z - z1;
  return M_1_SQRT_2PI / 1 * (exp(-0.5 * z1 * z1) * exp((-0.5 * z2 - z1) * z2));
}
