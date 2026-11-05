// Priors on transformed parameters, and the Jacobian adjustment. A Stan model samples its
// parameters, say a and b. A sampling statement on a quantity computed from them,
// c = f(a, b), multiplies the density over (a, b) by p_c(f(a, b)), and that does not give c
// the distribution p_c: the density of (a, c) is the density of (a, b) divided by
// |∂c/∂b|. To give a and c the priors stated for them, the model has to multiply by
// |∂c/∂b| as well, Stan's target += log|J|. Two views, both in closed form:
//   transform  understanding_Jacobian_adjustments.R's transforms (a sum, a sum and a
//              difference, a square, and a product with log-normal or normal priors), with
//              the Jacobian included or left out: the density over the sampled parameters,
//              and each quantity's distribution against the prior stated for it, or no
//              distribution at all where the target's integral diverges
//   marginals  jacobian-adjustment_marginal-vs-joint.R: a ~ N(0, 1) and c = a + b given
//              c's right marginal in a statement of its own, against one joint statement for
//              (a, c); what each makes of b, and of b's posterior when a is data
// The scripts sample these models with Stan; tests/fixtures/r-jacobian.json holds those
// draws' moments, which match the closed forms here within Monte Carlo error.

import { dnorm, pnormUpper, qnorm, standardNormal } from '../lib/normal.js';
import { checkChoice, checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { halfGammaRatio, lgamma, qgamma } from '../lib/special.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {'transform' | 'marginals'} View */
/** @typedef {'sum' | 'sum-difference' | 'square' | 'product-lognormal' | 'product-normal'} Transform */
/** @typedef {'separate' | 'joint'} Statement */
/**
 * @typedef {{ view: 'transform', transform: Transform, jacobian: boolean, df?: number }} TransformParams
 * @typedef {{ view: 'marginals', statement: Statement, sdB: number, n: number, seed: number }} MarginalsParams
 * @typedef {TransformParams | MarginalsParams} Params
 */
/**
 * @typedef {{ family: 'normal', mean: number, sd: number } | { family: 'chi', df: number }
 *   | { family: 'chi-squared', df: number } | { family: 'cauchy', location: number, scale: number }} Distribution
 */
/** @typedef {[number, number]} Point */
/**
 * @typedef {{ kind: 'normal', x: string, y: string, mean: number[], covariance: number[][] }
 *   | { kind: 'formula', x: string, y: string, logDensity: string }} Joint
 */

export const ENTRY = 'jacobian-adjustment';
export const VIEWS = /** @type {const} */ (['transform', 'marginals']);
export const TRANSFORMS = /** @type {const} */ (['sum', 'sum-difference', 'square', 'product-lognormal', 'product-normal']);
export const STATEMENTS = /** @type {const} */ (['separate', 'joint']);
export const DEFAULTS = Object.freeze({
  transform: Object.freeze({ transform: /** @type {Transform} */ ('product-lognormal'), jacobian: /** @type {boolean} */ (false), df: /** @type {number} */ (1) }),
  marginals: Object.freeze({ statement: /** @type {Statement} */ ('separate'), sdB: /** @type {number} */ (1), n: /** @type {number} */ (100), seed: /** @type {number} */ (1) }),
});
/** Points on each marginal's curve. */
export const CURVE_POINTS = 241;

// ---------- Parameters ----------

/**
 * @param {unknown} [params]
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'transform';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  if (view === 'transform') {
    const d = DEFAULTS.transform;
    rejectUnknown(params, ['view', 'transform', 'jacobian', 'df'], 'params', issues);
    const transform = Object.hasOwn(params, 'transform') ? checkChoice(params.transform, 'params.transform', TRANSFORMS, d.transform, issues) : d.transform;
    let jacobian = d.jacobian;
    if (Object.hasOwn(params, 'jacobian')) {
      if (typeof params.jacobian === 'boolean') jacobian = params.jacobian;
      else issues.push({ code: 'wrong_type', path: 'params.jacobian', message: 'must be true (target += log|J|) or false (left out)' });
    }
    /** @type {TransformParams} */
    const out = { view: 'transform', transform, jacobian };
    if (transform === 'square') out.df = Object.hasOwn(params, 'df') ? checkInteger(params.df, 'params.df', 1, 10, d.df, issues) : d.df;
    else if (Object.hasOwn(params, 'df')) issues.push({ code: 'not_applicable', path: 'params.df', message: 'applies only to the square, b = a² ~ χ²(df)' });
    if (issues.length) throw invalidRequest(issues);
    return out;
  }
  const d = DEFAULTS.marginals;
  rejectUnknown(params, ['view', ...Object.keys(d)], 'params', issues);
  const statement = Object.hasOwn(params, 'statement') ? checkChoice(params.statement, 'params.statement', STATEMENTS, d.statement, issues) : d.statement;
  const sdB = Object.hasOwn(params, 'sdB') ? checkNumber(params.sdB, 'params.sdB', 0.05, 5, d.sdB, issues) : d.sdB;
  const n = Object.hasOwn(params, 'n') ? checkInteger(params.n, 'params.n', 1, 2000, d.n, issues) : d.n;
  const seed = Object.hasOwn(params, 'seed') ? checkInteger(params.seed, 'params.seed', 0, 4294967295, d.seed, issues) : d.seed;
  if (issues.length) throw invalidRequest(issues);
  return { view: 'marginals', statement, sdB, n, seed };
}

// ---------- Distributions ----------

/** @param {number} mean @param {number} sd @returns {Distribution} */
const normal = (mean, sd) => ({ family: 'normal', mean, sd });

/** The density of a distribution at x. @param {Distribution} d @param {number} x */
export function density(d, x) {
  if (d.family === 'normal') return dnorm(x, d.mean, d.sd);
  if (d.family === 'cauchy') {
    const z = (x - d.location) / d.scale;
    return 1 / (Math.PI * d.scale * (1 + z * z));
  }
  if (x <= 0) return d.family === 'chi-squared' && d.df < 2 && x === 0 ? Infinity : 0;
  const k = d.df;
  if (d.family === 'chi') return Math.exp((k - 1) * Math.log(x) - (x * x) / 2 - (k / 2 - 1) * Math.LN2 - lgamma(k / 2));
  return Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lgamma(k / 2));
}

/** The p-quantile of a distribution. @param {Distribution} d @param {number} p in (0, 1) */
export function quantile(d, p) {
  if (d.family === 'normal') return qnorm(p, d.mean, d.sd);
  if (d.family === 'cauchy') return d.location + d.scale * Math.tan(Math.PI * (p - 0.5));
  const g = qgamma(p, d.df / 2);
  return d.family === 'chi' ? Math.sqrt(2 * g) : 2 * g;
}

/** Mean and SD, null for the Cauchy, which has neither. @param {Distribution} d */
export function moments(d) {
  if (d.family === 'normal') return { mean: d.mean, sd: d.sd };
  if (d.family === 'cauchy') return { mean: null, sd: null };
  if (d.family === 'chi-squared') return { mean: d.df, sd: Math.sqrt(2 * d.df) };
  const mean = Math.SQRT2 * halfGammaRatio(d.df / 2);
  return { mean, sd: Math.sqrt(Math.max(0, d.df - mean * mean)) };
}

/** A short name, such as "N(0, 1)", "χ(3)", "χ²(1)" or "Cauchy(0, 1)". @param {Distribution} d */
export function label(d) {
  const n = (/** @type {number} */ v) => {
    const roots = /** @type {Record<string, string>} */ ({ 1.4142: '√2', 1.7321: '√3', 0.7071: '√½', 2.2361: '√5' });
    return roots[v.toFixed(4)] ?? String(Number(v.toPrecision(3))).replace(/^-/, '−');
  };
  if (d.family === 'normal') return `N(${n(d.mean)}, ${n(d.sd)})`;
  if (d.family === 'cauchy') return `Cauchy(${n(d.location)}, ${n(d.scale)})`;
  return `${d.family === 'chi' ? 'χ' : 'χ²'}(${d.df})`;
}

/** Do two distributions agree (to rounding)? @param {Distribution} a @param {Distribution} b */
function same(a, b) {
  const x = /** @type {Record<string, any>} */ (a);
  const y = /** @type {Record<string, any>} */ (b);
  return a.family === b.family && Object.keys(x).every((k) => (typeof x[k] === 'number' ? Math.abs(x[k] - y[k]) < 1e-12 : x[k] === y[k]));
}

// ---------- The transforms ----------

/**
 * Each transform as the script writes it: what is sampled, what is computed, what the
 * statements are, and the Jacobian term the script adds.
 */
export const TRANSFORM_INFO = Object.freeze({
  sum: {
    parameters: ['a', 'b'], computed: 'c = a + b', statements: 'a ~ N(0, 1), c ~ N(0, √2)',
    factor: '|∂c/∂b| = 1', constant: true, script: 'target += log(abs(1))',
  },
  'sum-difference': {
    parameters: ['a', 'b'], computed: 'c = a + b, d = a − b', statements: 'c ~ N(0, 1), d ~ N(0, 1)',
    factor: '|det ∂(c, d)/∂(a, b)| = 2', constant: true, script: 'target += log(abs(-1))',
  },
  square: {
    parameters: ['a'], computed: 'b = a², a > 0', statements: 'b ~ χ²(df)',
    factor: '|db/da| = 2a', constant: false, script: 'target += log(abs(2*a))',
  },
  'product-lognormal': {
    parameters: ['a', 'b'], computed: 'c = ab, a, b > 0', statements: 'a ~ logN(0, 1), c ~ logN(0, √2)',
    factor: '|∂c/∂b| = a', constant: false, script: 'target += log(abs(a))',
  },
  'product-normal': {
    parameters: ['a', 'b'], computed: 'c = ab', statements: 'a ~ N(0, 1), c ~ N(0, 1)',
    factor: '|∂c/∂b| = |a|', constant: false, script: 'target += log(abs(a))',
  },
});

/** The window each transform's figures show, in the plotted scale of each quantity. */
const WINDOWS = Object.freeze({
  sum: { a: [-3.5, 3.5], b: [-6, 6], c: [-5, 5] },
  'sum-difference': { a: [-2.5, 2.5], b: [-2.5, 2.5], c: [-3.5, 3.5], d: [-3.5, 3.5] },
  'product-lognormal': { a: [-4.5, 4.5], b: [-6, 6], c: [-5, 5] },
  'product-normal': { a: [-3.5, 3.5], b: [-8, 8], c: [-3.5, 3.5] },
});

/**
 * One quantity: its distribution under this model (null where the target is not a
 * distribution) and the prior stated for it (null where none is), on the plotted scale.
 * @param {string} quantity @param {boolean} log plotted as log(quantity)
 * @param {Distribution | null} implied @param {Distribution | null} stated @param {number[]} window
 */
function row(quantity, log, implied, stated, window) {
  const [lo, hi] = window;
  const x = Array.from({ length: CURVE_POINTS }, (_, i) => lo + ((hi - lo) * i) / (CURVE_POINTS - 1));
  const curve = (/** @type {Distribution | null} */ d) => (d ? x.map((v) => density(d, v)) : null);
  return {
    quantity,
    axis: log ? `log ${quantity}` : quantity,
    implied,
    stated,
    matches: implied && stated ? same(implied, stated) : null,
    summary: implied ? { ...moments(implied), q05: quantile(implied, 0.05), q50: quantile(implied, 0.5), q95: quantile(implied, 0.95) } : null,
    curve: { x, implied: curve(implied), stated: curve(stated) },
  };
}

/**
 * The log density over the sampled parameters, in the plotted coordinates (log a and log b
 * for the log-normal product), up to a constant where the target is not a distribution.
 * Null for the square, which samples a alone.
 * @param {TransformParams} p
 * @returns {((point: Point) => number) | null}
 */
export function jointLogDensity(p) {
  const joint = jointOf(p);
  if (!joint) return null;
  if (joint.kind === 'normal') {
    const [[s11, s12], [, s22]] = joint.covariance;
    const det = s11 * s22 - s12 * s12;
    const [m1, m2] = joint.mean;
    const constant = -Math.log(2 * Math.PI) - 0.5 * Math.log(det);
    return ([x, y]) => {
      const u = x - m1;
      const v = y - m2;
      return constant - (s22 * u * u - 2 * s12 * u * v + s11 * v * v) / (2 * det);
    };
  }
  const half = -0.5 * Math.log(2 * Math.PI);
  // log φ(a) + log φ(ab), times |a| with the Jacobian.
  return p.jacobian
    ? ([a, b]) => 2 * half - (a * a) / 2 - (a * a * b * b) / 2 + Math.log(Math.abs(a))
    : ([a, b]) => 2 * half - (a * a) / 2 - (a * a * b * b) / 2;
}

/**
 * The density over the sampled parameters, described: a bivariate normal, or the product of
 * two normals with its formula.
 * @param {TransformParams} p
 * @returns {Joint | null}
 */
function jointOf(p) {
  const shift = p.jacobian ? 0 : -1;
  if (p.transform === 'sum') return { kind: 'normal', x: 'a', y: 'b', mean: [0, 0], covariance: [[1, -1], [-1, 3]] };
  if (p.transform === 'sum-difference') return { kind: 'normal', x: 'a', y: 'b', mean: [0, 0], covariance: [[0.5, 0], [0, 0.5]] };
  if (p.transform === 'product-lognormal') return { kind: 'normal', x: 'log a', y: 'log b', mean: [shift, -shift], covariance: [[1, -1], [-1, 3]] };
  if (p.transform === 'product-normal') return { kind: 'formula', x: 'a', y: 'b', logDensity: p.jacobian ? 'log φ(a) + log φ(ab) + log|a|' : 'log φ(a) + log φ(ab)' };
  return null;
}

/**
 * The log-density levels whose regions hold `shares` of the mass. A bivariate normal's are
 * closed form. The normal product's: in (a, c = ab) the pair is two independent standard
 * normals and the density over (a, b) is φ(a) φ(c) |a|, so the mass above a level L is
 * ∫ φ(a) (2Φ(c*(a)) − 1) da with c*(a)² = −2 log(2πL/|a|) − a², found by bisection on log L.
 * @param {TransformParams} p @param {number[]} shares
 */
export function massLevels(p, shares) {
  const joint = jointOf(p);
  if (!joint || !isProper(p)) return null;
  if (joint.kind === 'normal') {
    const cov = /** @type {number[][]} */ (joint.covariance);
    const det = cov[0][0] * cov[1][1] - cov[0][1] ** 2;
    // The region holding a share q is the ellipse of Mahalanobis radius² −2 log(1 − q).
    return shares.map((q) => -Math.log(2 * Math.PI) - 0.5 * Math.log(det) + Math.log(1 - q));
  }
  const nodes = 4000;
  const top = 9;
  const h = (2 * top) / nodes;
  const mass = (/** @type {number} */ logL) => {
    let total = 0;
    for (let k = 0; k <= nodes; k++) {
      const a = -top + k * h;
      if (a === 0) continue;
      const c2 = -2 * (Math.log(2 * Math.PI) + logL - Math.log(Math.abs(a))) - a * a;
      if (c2 <= 0) continue;
      const w = k === 0 || k === nodes ? 1 : k % 2 ? 4 : 2;
      total += w * dnorm(a) * (1 - 2 * pnormUpper(Math.sqrt(c2)));
    }
    return (total * h) / 3;
  };
  return shares.map((q) => {
    let lo = -40;
    let hi = Math.log(1 / (2 * Math.PI * Math.E)); // the density's peak, at |a| = 1, b = 0
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (mass(mid) > q) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  });
}

/** Is the target over the sampled parameters a distribution? @param {TransformParams} p */
export function isProper(p) {
  if (p.jacobian) return true;
  if (p.transform === 'square') return /** @type {number} */ (p.df) > 1;
  return p.transform !== 'product-normal';
}

/** @param {TransformParams} p */
function transformResult(p) {
  const info = TRANSFORM_INFO[p.transform];
  const proper = isProper(p);
  const base = { view: p.view, transform: p.transform, jacobian: p.jacobian, ...info, proper };
  if (p.transform === 'square') {
    const k = /** @type {number} */ (p.df);
    // With 2a, a² ~ χ²(k) makes a a χ(k). Without it the density of a is a^{k−2} e^{−a²/2}:
    // a χ(k − 1) for k ≥ 2, and for k = 1 not integrable at 0.
    const impliedA = /** @type {Distribution | null} */ (proper ? { family: 'chi', df: p.jacobian ? k : k - 1 } : null);
    const impliedB = /** @type {Distribution | null} */ (proper ? { family: 'chi-squared', df: p.jacobian ? k : k - 1 } : null);
    const stated = /** @type {Distribution} */ ({ family: 'chi-squared', df: k });
    const aTop = Math.max(3, quantile({ family: 'chi', df: k }, 0.999));
    const bTop = Math.max(6, quantile(stated, 0.995));
    return {
      ...base,
      statements: `b ~ χ²(${k})`,
      improper: proper ? null : 'The density of a is proportional to e^{−a²/2}/a, whose integral diverges at a = 0.',
      joint: null,
      sampled: { quantity: 'a', kernel: `a^${k - (p.jacobian ? 1 : 2)} e^(−a²/2)`, window: [0, aTop] },
      quantities: [row('a', false, impliedA, null, [0, aTop]), row('b', false, impliedB, stated, [0, bTop])],
    };
  }
  const w = /** @type {Record<string, number[]>} */ (WINDOWS[p.transform]);
  const joint = /** @type {NonNullable<ReturnType<typeof jointOf>>} */ (jointOf(p));
  const levels = massLevels(p, [0.5, 0.9]);
  const out = { ...base, improper: /** @type {string | null} */ (null), joint: { ...joint, window: { x: w.a, y: w.b }, levels: levels ? { q50: levels[0], q90: levels[1] } : null } };
  const R2 = Math.SQRT2;
  const R3 = Math.sqrt(3);
  if (p.transform === 'sum') {
    return { ...out, quantities: [row('a', false, normal(0, 1), normal(0, 1), w.a), row('b', false, normal(0, R3), null, w.b), row('c', false, normal(0, R2), normal(0, R2), w.c)] };
  }
  if (p.transform === 'sum-difference') {
    const h = Math.SQRT1_2;
    return {
      ...out,
      quantities: [row('a', false, normal(0, h), null, w.a), row('b', false, normal(0, h), null, w.b), row('c', false, normal(0, 1), normal(0, 1), w.c), row('d', false, normal(0, 1), normal(0, 1), w.d)],
    };
  }
  if (p.transform === 'product-lognormal') {
    // In (log a, log c) the target is φ(log a) φ_√2(log c), times 1/a without the Jacobian,
    // which moves log a from N(0, 1) to N(−1, 1); log b = log c − log a.
    const shift = p.jacobian ? 0 : -1;
    return {
      ...out,
      quantities: [row('a', true, normal(shift, 1), normal(0, 1), w.a), row('b', true, normal(-shift, R3), null, w.b), row('c', true, normal(0, R2), normal(0, R2), w.c)],
    };
  }
  // The normal product: with |a|, a and c are independent N(0, 1) and b = c/a is Cauchy.
  // Without it the density over (a, b), φ(a) φ(ab), is φ(0)² all along a = 0: its integral
  // over b is φ(a)/|a|, which diverges at a = 0.
  if (!proper) {
    return {
      ...out,
      improper: 'The density over (a, b) does not fall off along a = 0: integrating out b leaves φ(a)/|a|, whose integral diverges at a = 0.',
      quantities: [row('a', false, null, normal(0, 1), w.a), row('b', false, null, null, w.b), row('c', false, null, normal(0, 1), w.c)],
    };
  }
  return {
    ...out,
    quantities: [row('a', false, normal(0, 1), normal(0, 1), w.a), row('b', false, { family: 'cauchy', location: 0, scale: 1 }, null, w.b), row('c', false, normal(0, 1), normal(0, 1), w.c)],
  };
}

// ---------- Marginals and joints ----------

/**
 * The covariance of (a, b, c) meant (a and b independent, a ~ N(0, 1), b ~ N(0, s²)),
 * and as the two ways of stating it make it: c ~ N(0, √(1 + s²)) beside a ~ N(0, 1) makes
 * a and c independent, so b = c − a has variance 2 + s² and covariance −1 with a; one
 * joint statement for (a, c) gives back what was meant.
 * @param {number} s
 */
export function covariances(s) {
  const s2 = s * s;
  return {
    meant: [[1, 0, 1], [0, s2, s2], [1, s2, 1 + s2]],
    separate: [[1, -1, 0], [-1, 2 + s2, 1 + s2], [0, 1 + s2, 1 + s2]],
  };
}

/** Correlations of a 3 × 3 covariance, as {ab, ac, bc}. @param {number[][]} m */
const correlations = (m) => ({
  ab: m[0][1] / Math.sqrt(m[0][0] * m[1][1]),
  ac: m[0][2] / Math.sqrt(m[0][0] * m[2][2]),
  bc: m[1][2] / Math.sqrt(m[1][1] * m[2][2]),
});

/** @param {MarginalsParams} p */
function marginalsResult(p) {
  const { meant, separate } = covariances(p.sdB);
  const stated = p.statement === 'separate' ? separate : meant;
  // a fixed as data: b's posterior is its conditional given a under the stated prior.
  const slope = stated[0][1] / stated[0][0];
  const sd = Math.sqrt(stated[1][1] - (stated[0][1] * stated[0][1]) / stated[0][0]);
  const rng = mulberry32(p.seed);
  const a = Array.from({ length: p.n }, () => standardNormal(rng));
  const z = Array.from({ length: p.n }, () => standardNormal(rng));
  return {
    view: p.view,
    statement: p.statement,
    sdB: p.sdB,
    statements: p.statement === 'separate'
      ? `a ~ N(0, 1), c ~ ${label(normal(0, Math.sqrt(1 + p.sdB ** 2)))}`
      : `(a, c) ~ N(0, [[1, 1], [1, ${Number((1 + p.sdB ** 2).toPrecision(4))}]])`,
    meant: { covariance: meant, correlation: correlations(meant) },
    stated: { covariance: stated, correlation: correlations(stated) },
    conditional: { slope, sd },
    data: { a, b: a.map((v, i) => slope * v + sd * z[i]) },
  };
}

/**
 * @param {unknown} params
 */
export function compute(params) {
  const p = resolveParams(params);
  return p.view === 'transform' ? transformResult(p) : marginalsResult(p);
}
