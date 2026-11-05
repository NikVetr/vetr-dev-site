// Bivariate normal probabilities for standardised margins with correlation r.
// bvnUpper is Genz's BVNU (Drezner & Wesolowsky 1990 with Genz's refinements), and
// bvnRectangle follows his BVNMVN, the routine mvtnorm's pmvnorm uses in two
// dimensions; both are accurate to about 1e-15 for every r in [-1, 1].

import { pnorm, pnormInterval } from './normal.js';

const TWO_PI = 2 * Math.PI;

/**
 * Negative-half Gauss-Legendre nodes and weights for an n-point rule, computed by
 * Newton's method on the Legendre polynomial.
 * @param {number} n even
 * @returns {{ x: number[], w: number[] }}
 */
function gaussLegendreHalf(n) {
  const x = [];
  const w = [];
  for (let i = 1; i <= n / 2; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let derivative = 0;
    for (let iteration = 0; iteration < 100; iteration++) {
      let p0 = 1;
      let p1 = 0;
      for (let j = 1; j <= n; j++) {
        const p2 = p1;
        p1 = p0;
        p0 = ((2 * j - 1) * z * p1 - (j - 1) * p2) / j;
      }
      derivative = (n * (z * p0 - p1)) / (z * z - 1);
      const step = p0 / derivative;
      z -= step;
      if (Math.abs(step) < 1e-16) break;
    }
    x.push(-z);
    w.push(2 / ((1 - z * z) * derivative * derivative));
  }
  return { x, w };
}

const RULES = [gaussLegendreHalf(6), gaussLegendreHalf(12), gaussLegendreHalf(20)];

/**
 * P(X > h, Y > k) for standard bivariate normal X, Y with correlation r.
 * Infinite h or k are allowed.
 * @param {number} h
 * @param {number} k
 * @param {number} r in [-1, 1]
 */
export function bvnUpper(h, k, r) {
  if (h === Infinity || k === Infinity) return 0;
  if (h === -Infinity) return k === -Infinity ? 1 : pnorm(-k);
  if (k === -Infinity) return pnorm(-h);
  const { x, w } = Math.abs(r) < 0.3 ? RULES[0] : Math.abs(r) < 0.75 ? RULES[1] : RULES[2];
  let hk = h * k;
  let bvn = 0;
  if (Math.abs(r) < 0.925) {
    const hs = (h * h + k * k) / 2;
    const asr = Math.asin(r);
    for (let i = 0; i < x.length; i++) {
      let sn = Math.sin((asr * (x[i] + 1)) / 2);
      bvn += w[i] * Math.exp((sn * hk - hs) / (1 - sn * sn));
      sn = Math.sin((asr * (1 - x[i])) / 2);
      bvn += w[i] * Math.exp((sn * hk - hs) / (1 - sn * sn));
    }
    return (bvn * asr) / (2 * TWO_PI) + pnorm(-h) * pnorm(-k);
  }
  if (r < 0) {
    k = -k;
    hk = -hk;
  }
  if (Math.abs(r) < 1) {
    const as = (1 - r) * (1 + r);
    let a = Math.sqrt(as);
    const bs = (h - k) ** 2;
    const c = (4 - hk) / 8;
    const d = (12 - hk) / 16;
    bvn = a * Math.exp(-(bs / as + hk) / 2) * (1 - (c * (bs - as) * (1 - (d * bs) / 5)) / 3 + (c * d * as * as) / 5);
    if (hk > -160) {
      const b = Math.sqrt(bs);
      bvn -= Math.exp(-hk / 2) * Math.sqrt(TWO_PI) * pnorm(-b / a) * b * (1 - (c * bs * (1 - (d * bs) / 5)) / 3);
    }
    a /= 2;
    for (let i = 0; i < x.length; i++) {
      let xs = (a * (x[i] + 1)) ** 2;
      let rs = Math.sqrt(1 - xs);
      bvn += a * w[i] * (Math.exp(-bs / (2 * xs) - hk / (1 + rs)) / rs - Math.exp(-(bs / xs + hk) / 2) * (1 + c * xs * (1 + d * xs)));
      xs = (as * (1 - x[i]) ** 2) / 4;
      rs = Math.sqrt(1 - xs);
      bvn += a * w[i] * Math.exp(-(bs / xs + hk) / 2) * (Math.exp((-hk * xs) / (2 * (1 + rs) ** 2)) / rs - (1 + c * xs * (1 + d * xs)));
    }
    bvn = -bvn / TWO_PI;
  }
  if (r > 0) return bvn + pnorm(-Math.max(h, k));
  bvn = -bvn;
  if (k > h) bvn += h < 0 ? pnorm(k) - pnorm(h) : pnorm(-h) - pnorm(-k);
  return bvn;
}

/**
 * P(X <= h, Y <= k), the bivariate normal CDF.
 * @param {number} h
 * @param {number} k
 * @param {number} r
 */
export function pbvnorm(h, k, r) {
  return bvnUpper(-h, -k, r);
}

/**
 * P(lower[0] < X < upper[0], lower[1] < Y < upper[1]) for standard margins with
 * correlation r. Bounds may be infinite. The case split keeps each probability a
 * difference of as few terms as possible (Genz's BVNMVN).
 * @param {[number, number]} lower
 * @param {[number, number]} upper
 * @param {number} r
 */
export function bvnRectangle(lower, upper, r) {
  const [a1, a2] = lower;
  const [b1, b2] = upper;
  if (!(b1 > a1) || !(b2 > a2)) return 0;
  const lo1 = a1 !== -Infinity;
  const hi1 = b1 !== Infinity;
  const lo2 = a2 !== -Infinity;
  const hi2 = b2 !== Infinity;
  if (!lo1 && !hi1) return pnormInterval(a2, b2);
  if (!lo2 && !hi2) return pnormInterval(a1, b1);
  if (lo1 && hi1 && lo2 && hi2) return bvnUpper(a1, a2, r) - bvnUpper(b1, a2, r) - bvnUpper(a1, b2, r) + bvnUpper(b1, b2, r);
  if (lo1 && hi1 && lo2) return bvnUpper(a1, a2, r) - bvnUpper(b1, a2, r);
  if (lo1 && lo2 && hi2) return bvnUpper(a1, a2, r) - bvnUpper(a1, b2, r);
  if (lo1 && hi1) return bvnUpper(-b1, -b2, r) - bvnUpper(-a1, -b2, r);
  if (hi1 && lo2 && hi2) return bvnUpper(-b1, -b2, r) - bvnUpper(-b1, -a2, r);
  if (lo1 && hi2) return bvnUpper(a1, -b2, -r);
  if (hi1 && lo2) return bvnUpper(-b1, a2, -r);
  if (lo1 && lo2) return bvnUpper(a1, a2, r);
  return bvnUpper(-b1, -b2, r);
}

/**
 * Standard bivariate normal density at (h, k) with correlation r (|r| < 1).
 * @param {number} h
 * @param {number} k
 * @param {number} r
 */
export function dbvnorm(h, k, r) {
  if (!Number.isFinite(h) || !Number.isFinite(k)) return 0;
  const s = 1 - r * r;
  return Math.exp(-(h * h - 2 * r * h * k + k * k) / (2 * s)) / (TWO_PI * Math.sqrt(s));
}
