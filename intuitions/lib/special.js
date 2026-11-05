// Gamma and beta functions for the gallery: log-gamma, the regularized incomplete
// gamma and beta functions and the gamma quantile, which give the chi-square, beta and
// Student's t distributions their CDFs and quantiles. Accurate to about 1e-14 relative error for
// the arguments the entries use (shape parameters up to a few thousand).

import { qnorm } from './normal.js';

const LANCZOS_G = 607 / 128;
const LANCZOS = [0.99999999999999709182, 57.156235665862923517, -59.597960355475491248, 14.136097974741747174,
  -0.49191381609762019978, 0.33994649984811888699e-4, 0.46523628927048575665e-4, -0.98374475304879564677e-4,
  0.15808870322491248884e-3, -0.21026444172410488319e-3, 0.21743961811521264320e-3, -0.16431810653676389022e-3,
  0.84418223983852743293e-4, -0.26190838401581408670e-4, 0.36899182659531622704e-5];
const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI);
const EPS = 1e-16;
const TINY = 1e-300;

/**
 * log Γ(x) for x > 0 (Lanczos, Godfrey's coefficients).
 * @param {number} x
 * @returns {number}
 */
export function lgamma(x) {
  if (x < 0.5) return lgamma(x + 1) - Math.log(x);
  const y = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (y + i);
  const t = y + LANCZOS_G + 0.5;
  return HALF_LOG_2PI + (y + 0.5) * Math.log(t) - t + Math.log(sum);
}

/**
 * Γ(β + ½) / Γ(β) for β a positive multiple of ½, by the recurrence from β = ½ or 1,
 * which keeps full precision where a difference of two log-gammas would not.
 * @param {number} beta
 */
export function halfGammaRatio(beta) {
  let b = Number.isInteger(beta) ? 1 : 0.5;
  let g = b === 1 ? Math.sqrt(Math.PI) / 2 : 1 / Math.sqrt(Math.PI);
  while (b < beta - 1e-9) {
    g *= (b + 0.5) / b;
    b += 1;
  }
  return g;
}

/**
 * log P(a, x) and log Q(a, x), the regularized lower and upper incomplete gamma
 * functions, by the series (x < a + 1) or the continued fraction, each computed
 * directly so that a tiny tail keeps its precision.
 * @param {number} a shape, > 0
 * @param {number} x ≥ 0
 * @returns {{ logP: number, logQ: number }}
 */
function incompleteGammaLog(a, x) {
  if (x <= 0) return { logP: -Infinity, logQ: 0 };
  const prefix = a * Math.log(x) - x - lgamma(a);
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 10000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * EPS) break;
    }
    const logP = prefix + Math.log(sum);
    return { logP, logQ: Math.log1p(-Math.exp(logP)) };
  }
  // Modified Lentz for the continued fraction of Q.
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < EPS) break;
  }
  const logQ = prefix + Math.log(h);
  return { logP: Math.log1p(-Math.exp(logQ)), logQ };
}

/** Regularized lower incomplete gamma P(a, x). @param {number} a @param {number} x */
export const gammaP = (a, x) => Math.exp(incompleteGammaLog(a, x).logP);
/** Regularized upper incomplete gamma Q(a, x) = 1 − P(a, x). @param {number} a @param {number} x */
export const gammaQ = (a, x) => Math.exp(incompleteGammaLog(a, x).logQ);
/** log P(a, x), finite even where P itself underflows. @param {number} a @param {number} x */
export const logGammaP = (a, x) => incompleteGammaLog(a, x).logP;

/**
 * The gamma quantile: x with P(a, x) = p (unit scale). Newton steps on whichever
 * tail is smaller, from the Wilson–Hilferty guess, kept inside a shrinking bracket.
 * @param {number} p in (0, 1)
 * @param {number} a shape, > 0
 */
export function qgamma(p, a) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  const z = qnorm(p);
  const w = 1 / (9 * a);
  let x = a * Math.max(1e-3, 1 - w + z * Math.sqrt(w)) ** 3;
  let lo = 0;
  let hi = Infinity;
  const upper = p > 0.5;
  const target = upper ? 1 - p : p;
  for (let i = 0; i < 200; i++) {
    const { logP, logQ } = incompleteGammaLog(a, x);
    const f = (upper ? Math.exp(logQ) : Math.exp(logP)) - target;
    // P rises with x and Q falls; keep the bracket on the right sides.
    if ((f > 0) !== upper) hi = x;
    else lo = x;
    const density = Math.exp((a - 1) * Math.log(x) - x - lgamma(a));
    let next = x - (upper ? -f : f) / density;
    if (!(next > lo && next < hi)) next = Number.isFinite(hi) ? (lo + hi) / 2 : Math.max(2 * x, lo * 2 + 1);
    if (Math.abs(next - x) <= 1e-15 * x) return next;
    x = next;
  }
  return x;
}

/**
 * The regularized incomplete beta function I_x(a, b), by its continued fraction on
 * whichever side converges.
 * @param {number} x in [0, 1]
 * @param {number} a > 0
 * @param {number} b > 0
 */
export function betaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaFraction(x, a, b)) / a;
  return 1 - (front * betaFraction(1 - x, b, a)) / b;
}

/** The continued fraction of the incomplete beta function (modified Lentz). @param {number} x @param {number} a @param {number} b */
function betaFraction(x, a, b) {
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < EPS) break;
  }
  return h;
}

/**
 * The two-sided tail of Student's t, P(|T| ≥ |t|) with `df` degrees of freedom (any
 * positive df), as I_{df/(df + t²)}(df/2, ½), so a small p-value keeps its precision.
 * @param {number} t @param {number} df
 */
export function ptTwoSided(t, df) {
  return betaI(df / (df + t * t), df / 2, 0.5);
}

/** Student's t distribution function P(T ≤ t). @param {number} t @param {number} df */
export function pt(t, df) {
  const tail = ptTwoSided(t, df) / 2;
  return t < 0 ? tail : 1 - tail;
}

/**
 * The t value whose two-sided tail is `tail`: P(|T| ≥ t) = tail, for tail in (0, 1].
 * The tail is I_x(df/2, ½) with x = df/(df + t²), and 1 − I_w(½, df/2) with w = 1 − x;
 * bisection on log x for small tails and on log w for tails near 1 keeps t's digits
 * at both ends.
 * @param {number} tail @param {number} df
 */
export function qtTwoSided(tail, df) {
  if (tail >= 1) return 0;
  const small = tail < 0.5;
  const rises = (/** @type {number} */ v) => (small ? betaI(v, df / 2, 0.5) < tail : betaI(v, 0.5, df / 2) < 1 - tail);
  let lo = -745;
  let hi = 0;
  for (let i = 0; i < 200 && hi - lo > 1e-15 * Math.max(1, -lo); i++) {
    const mid = (lo + hi) / 2;
    if (rises(Math.exp(mid))) lo = mid;
    else hi = mid;
  }
  const v = Math.exp((lo + hi) / 2);
  return Math.sqrt(small ? (df * (1 - v)) / v : (df * v) / (1 - v));
}

/** Student's t quantile: t with P(T ≤ t) = p. @param {number} p in (0, 1) @param {number} df */
export function qt(p, df) {
  if (p === 0.5) return 0;
  const t = qtTwoSided(2 * Math.min(p, 1 - p), df);
  return p < 0.5 ? -t : t;
}
