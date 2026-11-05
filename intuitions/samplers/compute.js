// Samplers on two-dimensional targets, step by step: random-walk Metropolis, Gibbs, Hamiltonian
// Monte Carlo with a fixed step size and number of leapfrog steps, and a Metropolis–Hastings
// move that multiplies a positive parameter, with its Hastings ratio applied, left out or
// reversed. Three views:
//   funnel    Neal's funnel, y ~ N(0, σ²) and x | y ~ N(0, e^{2y}) (x's SD is e^y), sampled
//             in its own coordinates (centred), as two standard normals (non-centred), or as
//             two quantiles, through Stan's logit transform of (0, 1) (quantile)
//   hastings  a log-normal pair sampled by multiplying both by e^{λZ}: the chain's actual
//             target is the log-normal, or, without the ratio x′/x or with it upside down,
//             a log-normal shifted down by Σ1 or 2Σ1 on the log scale
//   target    MCMC_Demo.R's correlated normal (with its Gibbs sampler) and the "evil smiley"
//             mixture of evil_smiley.stan, a banana and two blobs
// Every chain is seeded, has no warm-up and no adaptation, and is reported with posterior's
// bulk effective sample size and, against every exact marginal, the Kolmogorov–Smirnov
// distance. The scripts sampled with Stan's NUTS (truncated_funnel.R, funnel_test.R,
// evil_smiley_bug.R) or hand-written R samplers (MCMC_Demo.R, DoIUnderstandMCMC.R,
// simplex_proposal_distributions.R); api.md says what changed and why.

import { pnorm, qnorm, standardNormal } from '../lib/normal.js';
import { checkChoice, checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {[number, number]} Point */
/** @typedef {'funnel' | 'hastings' | 'target'} View */
/** @typedef {'centred' | 'non-centred' | 'quantile'} Coordinates */
/** @typedef {'rwm' | 'hmc' | 'gibbs'} Sampler */
/** @typedef {'correct' | 'missing' | 'reversed'} Correction */
/**
 * @typedef {{ view: 'funnel', coordinates: Coordinates, sampler: 'rwm' | 'hmc', sdY: number, step: number, leapfrog: number, iterations: number, start: number[], seed: number }} FunnelParams
 * @typedef {{ view: 'hastings', correction: Correction, step: number, sd: number, correlation: number, iterations: number, start: number[], seed: number }} HastingsParams
 * @typedef {{ view: 'target', target: 'normal' | 'smiley', sampler: Sampler, step: number, leapfrog: number, iterations: number, start: number[], seed: number }} TargetParams
 * @typedef {FunnelParams | HastingsParams | TargetParams} Params
 */
/**
 * A target in the sampler's coordinates: its log density (up to a constant) and gradient,
 * and the map from sampler coordinates to the target's own (x, y).
 * @typedef {{ logDensity: (p: Point) => number, gradient: (p: Point) => Point, toTarget: (p: Point) => Point, fromTarget: (p: Point) => Point }} Space
 */

export const ENTRY = 'samplers';
export const VIEWS = /** @type {const} */ (['funnel', 'hastings', 'target']);
export const COORDINATES = /** @type {const} */ (['centred', 'non-centred', 'quantile']);
export const CORRECTIONS = /** @type {const} */ (['correct', 'missing', 'reversed']);
/** Stan's threshold: an energy error past this marks the transition divergent. */
export const DIVERGENCE = 1000;
/** The most points one response may store (draws, proposals and leapfrog positions). */
const MAX_POINTS = 400000;

/** MCMC_Demo.R's normal. */
export const NORMAL = Object.freeze({ mean: Object.freeze([3, -1.5]), cov: Object.freeze([Object.freeze([2, 0.7]), Object.freeze([0.7, 1])]) });
/** evil_smiley.stan's mixture with evil_smiley_bug.R's data: a banana (the mouth) and two blobs (the eyes). */
export const SMILEY = Object.freeze({
  banana: Object.freeze({ weight: 0.75, mu: [0, 0], sd: [1, 1] }),
  blobs: Object.freeze([Object.freeze({ weight: 0.125, mu: [-1.5, 4], sd: 0.5 }), Object.freeze({ weight: 0.125, mu: [1.5, 4], sd: 0.5 })]),
});

export const DEFAULTS = Object.freeze({
  funnel: Object.freeze({ coordinates: 'centred', sampler: 'hmc', sdY: 1.5, leapfrog: 20, iterations: 1000, start: Object.freeze([1, 0]), seed: 1 }),
  hastings: Object.freeze({ correction: 'missing', step: 0.5, sd: 0.5, correlation: 0.6, iterations: 2000, start: Object.freeze([1, 1]), seed: 1 }),
  target: Object.freeze({ target: 'smiley', sampler: 'rwm', leapfrog: 20, iterations: 2000, start: Object.freeze([0, 0]), seed: 1 }),
});
/** The default step: the proposal SD of random-walk Metropolis, or HMC's step size ε. */
export const STEPS = Object.freeze({ rwm: 1, hmc: 0.2, gibbs: 1 });

// ---------- Parameters ----------

/** @param {unknown} value @param {string} path @param {Issue[]} issues @param {(p: Point) => boolean} [ok] @param {string} [why] */
function checkPoint(value, path, issues, ok, why) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1000)) {
    issues.push({ code: 'wrong_type', path, message: 'must be [x, y], two numbers from −1000 to 1000' });
    return null;
  }
  const point = /** @type {Point} */ ([value[0], value[1]]);
  if (ok && !ok(point)) {
    issues.push({ code: 'out_of_range', path, message: /** @type {string} */ (why) });
    return null;
  }
  return point;
}

/**
 * @param {unknown} [params]
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'funnel';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  const d = /** @type {Record<string, any>} */ (DEFAULTS[/** @type {View} */ (view)]);
  rejectUnknown(params, ['view', 'step', ...Object.keys(d)], 'params', issues);
  const field = (/** @type {string} */ key, /** @type {(v: unknown, path: string) => any} */ check) => (Object.hasOwn(params, key) ? check(params[key], `params.${key}`) : d[key]);
  /** @type {Record<string, any>} */
  const out = { view };
  if (view === 'funnel') {
    out.coordinates = field('coordinates', (v, p) => checkChoice(v, p, COORDINATES, 'centred', issues));
    out.sampler = field('sampler', (v, p) => checkChoice(v, p, /** @type {const} */ (['rwm', 'hmc']), 'hmc', issues));
    out.sdY = field('sdY', (v, p) => checkNumber(v, p, 0.25, 3, d.sdY, issues));
  } else if (view === 'hastings') {
    out.correction = field('correction', (v, p) => checkChoice(v, p, CORRECTIONS, 'missing', issues));
    out.sd = field('sd', (v, p) => checkNumber(v, p, 0.1, 1.5, d.sd, issues));
    out.correlation = field('correlation', (v, p) => checkNumber(v, p, -0.95, 0.95, d.correlation, issues));
  } else {
    out.target = field('target', (v, p) => checkChoice(v, p, /** @type {const} */ (['normal', 'smiley']), 'smiley', issues));
    out.sampler = field('sampler', (v, p) => checkChoice(v, p, /** @type {const} */ (['rwm', 'hmc', 'gibbs']), 'rwm', issues));
    if (out.sampler === 'gibbs' && out.target !== 'normal') issues.push({ code: 'not_applicable', path: 'params.sampler', message: 'Gibbs sampling needs the full conditionals, which only the normal target has here' });
  }
  const sampler = view === 'hastings' ? 'rwm' : out.sampler;
  out.step = Object.hasOwn(params, 'step') ? checkNumber(params.step, 'params.step', 0.001, 10, 1, issues) : view === 'hastings' ? d.step : STEPS[/** @type {Sampler} */ (sampler)];
  if (view !== 'hastings') out.leapfrog = field('leapfrog', (v, p) => checkInteger(v, p, 1, 500, d.leapfrog, issues));
  out.iterations = field('iterations', (v, p) => checkInteger(v, p, 10, 100000, d.iterations, issues));
  out.start = Object.hasOwn(params, 'start')
    ? (view === 'hastings'
      ? checkPoint(params.start, 'params.start', issues, (q) => q[0] > 0 && q[1] > 0, 'must be positive: the multiplier keeps each coordinate above 0')
      : checkPoint(params.start, 'params.start', issues))
    : [...d.start];
  out.seed = field('seed', (v, p) => checkInteger(v, p, 0, 4294967295, 1, issues));
  if (!issues.length) {
    const hmc = sampler === 'hmc';
    const points = out.iterations * (hmc ? out.leapfrog + 2 : 2);
    if (points > MAX_POINTS) issues.push({ code: 'too_much_work', path: 'params.iterations', message: `stores ${points.toLocaleString('en-US')} points, and a request may store ${MAX_POINTS.toLocaleString('en-US')}: lower the iterations${hmc ? ' or the leapfrog steps' : ''}` });
  }
  if (issues.length) throw invalidRequest(issues);
  return /** @type {Params} */ (out);
}

// ---------- Targets ----------

/** log(1 + e^x) without overflow. @param {number} x */
const softplus = (x) => (x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)));
/** The logistic function. @param {number} x */
const logistic = (x) => 1 / (1 + Math.exp(-x));
/** Φ⁻¹(logistic(u)), from whichever tail keeps its digits. @param {number} u */
const probit = (u) => (u < 0 ? qnorm(logistic(u)) : -qnorm(logistic(-u)));
/** logit(Φ(z)), likewise. @param {number} z */
const logitPhi = (z) => (z < 0 ? Math.log(pnorm(z)) - Math.log1p(-pnorm(z)) : Math.log1p(-pnorm(-z)) - Math.log(pnorm(-z)));

/**
 * Neal's funnel in one of its three coordinates. Its (x, y): y ~ N(0, σ²), x ~ N(0, e^{2y}).
 * @param {Coordinates} coordinates @param {number} sd σ
 * @returns {Space}
 */
export function funnelSpace(coordinates, sd) {
  if (coordinates === 'centred') {
    return {
      logDensity: ([x, y]) => -(y * y) / (2 * sd * sd) - y - 0.5 * x * x * Math.exp(-2 * y),
      gradient: ([x, y]) => {
        const e = Math.exp(-2 * y);
        return [-x * e, -y / (sd * sd) - 1 + x * x * e];
      },
      toTarget: (p) => [p[0], p[1]],
      fromTarget: (p) => [p[0], p[1]],
    };
  }
  if (coordinates === 'non-centred') {
    return {
      logDensity: ([a, b]) => -0.5 * (a * a + b * b),
      gradient: ([a, b]) => [-a, -b],
      toTarget: ([a, b]) => [a * Math.exp(sd * b), sd * b],
      fromTarget: ([x, y]) => [x * Math.exp(-y), y / sd],
    };
  }
  // Stan's (0, 1) parameters on their logit scale: each a standard logistic.
  return {
    logDensity: ([u, v]) => -softplus(-u) - softplus(u) - softplus(-v) - softplus(v),
    gradient: ([u, v]) => [1 - 2 * logistic(u), 1 - 2 * logistic(v)],
    toTarget: ([u, v]) => {
      const y = sd * probit(v);
      return [probit(u) * Math.exp(y), y];
    },
    fromTarget: ([x, y]) => [logitPhi(x * Math.exp(-y)), logitPhi(y / sd)],
  };
}

/** MCMC_Demo.R's correlated normal. @returns {Space} */
export function normalSpace() {
  const [[a, b], [, c]] = NORMAL.cov;
  const det = a * c - b * b;
  const inv = [[c / det, -b / det], [-b / det, a / det]];
  const [m1, m2] = NORMAL.mean;
  return {
    logDensity: ([x, y]) => {
      const dx = x - m1;
      const dy = y - m2;
      return -0.5 * (inv[0][0] * dx * dx + 2 * inv[0][1] * dx * dy + inv[1][1] * dy * dy);
    },
    gradient: ([x, y]) => {
      const dx = x - m1;
      const dy = y - m2;
      return [-(inv[0][0] * dx + inv[0][1] * dy), -(inv[0][1] * dx + inv[1][1] * dy)];
    },
    toTarget: (p) => [p[0], p[1]],
    fromTarget: (p) => [p[0], p[1]],
  };
}

/** The smiley's components' log densities and gradients at a point. @param {Point} point */
function smileyParts([x, y]) {
  const { banana, blobs } = SMILEY;
  const LOG_2PI = Math.log(2 * Math.PI);
  const r = y - banana.mu[1] - x * x;
  const parts = [{
    log: Math.log(banana.weight) - LOG_2PI - Math.log(banana.sd[0] * banana.sd[1]) - (((x - banana.mu[0]) / banana.sd[0]) ** 2 + (r / banana.sd[1]) ** 2) / 2,
    grad: [-(x - banana.mu[0]) / banana.sd[0] ** 2 + (r / banana.sd[1] ** 2) * 2 * x, -r / banana.sd[1] ** 2],
  }];
  for (const b of blobs) {
    const dx = x - b.mu[0];
    const dy = y - b.mu[1];
    parts.push({ log: Math.log(b.weight) - LOG_2PI - 2 * Math.log(b.sd) - (dx * dx + dy * dy) / (2 * b.sd * b.sd), grad: [-dx / b.sd ** 2, -dy / b.sd ** 2] });
  }
  return parts;
}

/** The evil smiley, normalised (evil_smiley_functions.R's log_posterior). @returns {Space} */
export function smileySpace() {
  return {
    logDensity: (p) => {
      const parts = smileyParts(p);
      const m = Math.max(...parts.map((q) => q.log));
      return m + Math.log(parts.reduce((s, q) => s + Math.exp(q.log - m), 0));
    },
    gradient: (p) => {
      const parts = smileyParts(p);
      const m = Math.max(...parts.map((q) => q.log));
      const w = parts.map((q) => Math.exp(q.log - m));
      const total = w.reduce((s, v) => s + v, 0);
      const g = (/** @type {number} */ k) => parts.reduce((s, q, i) => s + (w[i] / total) * q.grad[k], 0);
      return [g(0), g(1)];
    },
    toTarget: (p) => [p[0], p[1]],
    fromTarget: (p) => [p[0], p[1]],
  };
}

/**
 * The log-normal pair: log x ~ N(shift·(1, 1), Σ), Σ = s²[[1, ρ], [ρ, 1]]. Shift 0 is the
 * target; −(1 + ρ)s² and −2(1 + ρ)s² are where a chain without the Hastings ratio, or with
 * it reversed, settles.
 * @param {number} sd s @param {number} rho ρ @param {number} [shift]
 */
export function logNormalDensity(sd, rho, shift = 0) {
  const v = sd * sd;
  const det = v * v * (1 - rho * rho);
  return (/** @type {Point} */ [x1, x2]) => {
    if (!(x1 > 0 && x2 > 0)) return -Infinity;
    const z1 = Math.log(x1) - shift;
    const z2 = Math.log(x2) - shift;
    return -Math.log(2 * Math.PI) - 0.5 * Math.log(det) - (v * (z1 * z1 - 2 * rho * z1 * z2 + z2 * z2)) / (2 * det) - Math.log(x1) - Math.log(x2);
  };
}

/** Where a multiplier chain settles on the log scale, per coordinate. @param {Correction} correction @param {number} sd @param {number} rho */
export const settledShift = (correction, sd, rho) => ({ correct: 0, missing: -(1 + rho) * sd * sd, reversed: -2 * (1 + rho) * sd * sd })[correction];

// ---------- Exact marginals ----------

/** Nodes and weights of the trapezoid rule for y ~ N(0, σ²) over ±9σ. @param {number} sd */
function normalNodes(sd, count = 241) {
  const nodes = [];
  for (let k = 0; k < count; k++) {
    const z = -9 + (18 * k) / (count - 1);
    nodes.push({ y: sd * z, w: (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * (18 / (count - 1)) * (k === 0 || k === count - 1 ? 0.5 : 1) });
  }
  return nodes;
}

/** The funnel's marginal distribution function of x: ∫ φ(y/σ)/σ Φ(x e^{−y}) dy. @param {number} x @param {number} sd */
export function funnelXCdf(x, sd) {
  if (x === 0) return 0.5;
  let s = 0;
  for (const { y, w } of normalNodes(sd)) s += w * pnorm(x * Math.exp(-y));
  return s;
}

/** The smiley's marginal distribution function of x. @param {number} x */
export function smileyXCdf(x) {
  const { banana, blobs } = SMILEY;
  return banana.weight * pnorm(x, banana.mu[0], banana.sd[0]) + blobs.reduce((s, b) => s + b.weight * pnorm(x, b.mu[0], b.sd), 0);
}

/** The smiley's marginal distribution function of y: the banana's ∫ φ(x) Φ(y − x²) dx, and the blobs'. @param {number} y */
export function smileyYCdf(y) {
  const { banana, blobs } = SMILEY;
  let s = 0;
  for (const { y: x, w } of normalNodes(banana.sd[0])) s += w * pnorm(y, banana.mu[1] + (x + banana.mu[0]) ** 2, banana.sd[1]);
  return banana.weight * s + blobs.reduce((acc, b) => acc + b.weight * pnorm(y, b.mu[1], b.sd), 0);
}

/**
 * The marginal distribution functions of a view's target, for (x, y), and of the target a
 * chain actually has when it differs.
 * @param {Params} p
 * @returns {{ x: (v: number) => number, y: (v: number) => number, settled: null | { x: (v: number) => number, y: (v: number) => number } }}
 */
export function marginals(p) {
  if (p.view === 'funnel') return { x: (v) => funnelXCdf(v, p.sdY), y: (v) => pnorm(v, 0, p.sdY), settled: null };
  if (p.view === 'hastings') {
    const ln = (/** @type {number} */ shift) => (/** @type {number} */ v) => (v > 0 ? pnorm(Math.log(v), shift, p.sd) : 0);
    const shift = settledShift(p.correction, p.sd, p.correlation);
    return { x: ln(0), y: ln(0), settled: shift === 0 ? null : { x: ln(shift), y: ln(shift) } };
  }
  if (p.target === 'normal') return { x: (v) => pnorm(v, NORMAL.mean[0], Math.sqrt(NORMAL.cov[0][0])), y: (v) => pnorm(v, NORMAL.mean[1], Math.sqrt(NORMAL.cov[1][1])), settled: null };
  return { x: smileyXCdf, y: smileyYCdf, settled: null };
}

/** The normal density. @param {number} v @param {number} m @param {number} s */
const dnormal = (v, m, s) => Math.exp(-0.5 * ((v - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

/**
 * The marginal densities matching marginals(): for (x, y), and where a chain settles.
 * @param {Params} p
 * @returns {{ x: (v: number) => number, y: (v: number) => number, settled: null | { x: (v: number) => number, y: (v: number) => number } }}
 */
export function marginalDensities(p) {
  if (p.view === 'funnel') {
    const nodes = normalNodes(p.sdY);
    return { x: (v) => nodes.reduce((s, { y, w }) => s + w * dnormal(v * Math.exp(-y), 0, 1) * Math.exp(-y), 0), y: (v) => dnormal(v, 0, p.sdY), settled: null };
  }
  if (p.view === 'hastings') {
    const ln = (/** @type {number} */ shift) => (/** @type {number} */ v) => (v > 0 ? dnormal(Math.log(v), shift, p.sd) / v : 0);
    const shift = settledShift(p.correction, p.sd, p.correlation);
    return { x: ln(0), y: ln(0), settled: shift === 0 ? null : { x: ln(shift), y: ln(shift) } };
  }
  if (p.target === 'normal') return { x: (v) => dnormal(v, NORMAL.mean[0], Math.sqrt(NORMAL.cov[0][0])), y: (v) => dnormal(v, NORMAL.mean[1], Math.sqrt(NORMAL.cov[1][1])), settled: null };
  const { banana, blobs } = SMILEY;
  const nodes = normalNodes(banana.sd[0]);
  return {
    x: (v) => banana.weight * dnormal(v, banana.mu[0], banana.sd[0]) + blobs.reduce((s, b) => s + b.weight * dnormal(v, b.mu[0], b.sd), 0),
    y: (v) => banana.weight * nodes.reduce((s, { y: x, w }) => s + w * dnormal(v, banana.mu[1] + (x + banana.mu[0]) ** 2, banana.sd[1]), 0) + blobs.reduce((s, b) => s + b.weight * dnormal(v, b.mu[1], b.sd), 0),
    settled: null,
  };
}

// ---------- Diagnostics ----------

/** posterior's .ess() on the columns of a matrix (an array of chains). @param {number[][]} chains */
function essOfChains(chains) {
  const m = chains.length;
  const n = chains[0].length;
  const centred = chains.map((c) => {
    const mean = c.reduce((s, v) => s + v, 0) / n;
    return { mean, values: c.map((v) => v - mean) };
  });
  // autocovariance at lag t: Σ_i (x_i − x̄)(x_{i+t} − x̄) / n, the FFT's, averaged over chains
  const acov = (/** @type {number} */ t) => {
    let s = 0;
    for (const { values } of centred) {
      let a = 0;
      for (let i = 0; i + t < n; i++) a += values[i] * values[i + t];
      s += a / n;
    }
    return s / m;
  };
  const meanVar = (acov(0) * n) / (n - 1);
  let varPlus = (meanVar * (n - 1)) / n;
  if (m > 1) {
    const means = centred.map((c) => c.mean);
    const grand = means.reduce((s, v) => s + v, 0) / m;
    varPlus += means.reduce((s, v) => s + (v - grand) ** 2, 0) / (m - 1);
  }
  const rho = new Float64Array(n);
  let t = 0;
  let even = 1;
  rho[0] = even;
  let odd = 1 - (meanVar - acov(1)) / varPlus;
  rho[1] = odd;
  while (t < n - 5 && !Number.isNaN(even + odd) && even + odd > 0) {
    t += 2;
    even = 1 - (meanVar - acov(t)) / varPlus;
    odd = 1 - (meanVar - acov(t + 1)) / varPlus;
    if (even + odd >= 0) {
      rho[t] = even;
      rho[t + 1] = odd;
    }
  }
  const maxT = t;
  if (even > 0) rho[maxT] = even;
  t = 0;
  while (t <= maxT - 4) {
    t += 2;
    if (rho[t] + rho[t + 1] > rho[t - 2] + rho[t - 1]) {
      rho[t] = (rho[t - 2] + rho[t - 1]) / 2;
      rho[t + 1] = rho[t];
    }
  }
  let sum = 0;
  for (let k = 0; k < maxT; k++) sum += rho[k];
  const total = m * n;
  const tau = Math.max(-1 + 2 * sum + rho[maxT], 1 / Math.log10(total));
  return total / tau;
}

/**
 * Bulk effective sample size, as posterior::ess_bulk computes it for one chain: split in
 * two halves (the middle draw dropped when the count is odd), rank-normalised, then
 * Geyer's initial monotone sequence. null for a constant chain.
 * @param {ArrayLike<number>} draws
 */
export function essBulk(draws) {
  const n = draws.length;
  const values = Array.from(draws);
  if (n < 6 || values.every((v) => v === values[0])) return null;
  const half = Math.floor(n / 2);
  const kept = [...values.slice(0, half), ...values.slice(Math.ceil(n / 2 + 1) - 1)];
  // ranks with ties averaged, then z = Φ⁻¹((r − 3/8)/(S + 1/4))
  const order = kept.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Float64Array(kept.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const S = kept.length;
  const z = Array.from(ranks, (r) => qnorm((r - 3 / 8) / (S - 0.75 + 1)));
  return essOfChains([z.slice(0, half), z.slice(half)]);
}

/** The Kolmogorov–Smirnov distance of draws from a distribution function. @param {ArrayLike<number>} draws @param {(v: number) => number} cdf */
export function ksDistance(draws, cdf) {
  const sorted = Float64Array.from(draws).sort();
  const n = sorted.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = cdf(sorted[i]);
    d = Math.max(d, (i + 1) / n - f, f - i / n);
  }
  return d;
}

// ---------- Samplers ----------

/**
 * Runs a chain. Every state, proposal and leapfrog position is in the sampler's
 * coordinates. A divergent HMC transition stops where its energy error passes 1000 (or
 * stops being finite) and is rejected.
 * @param {Space} space
 * @param {{ sampler: Sampler | 'multiplier', step: number, leapfrog?: number, iterations: number, start: Point, seed: number,
 *   correction?: Correction, gibbs?: (rng: () => number, p: Point, coordinate: number) => Point, store?: boolean }} spec
 */
export function runChain(space, spec) {
  const { sampler, step, iterations, seed, store = true } = spec;
  const L = spec.leapfrog ?? 1;
  const rng = mulberry32(seed);
  const a = new Float64Array(iterations + 1);
  const b = new Float64Array(iterations + 1);
  const accepted = new Uint8Array(iterations);
  const proposals = store && sampler !== 'gibbs' && sampler !== 'hmc' ? { a: new Float64Array(iterations), b: new Float64Array(iterations) } : null;
  /** @type {Float64Array[] | null} */
  const paths = store && sampler === 'hmc' ? [] : null;
  /** @type {number[]} */
  const divergent = [];
  let current = /** @type {Point} */ ([spec.start[0], spec.start[1]]);
  let logP = space.logDensity(current);
  a[0] = current[0];
  b[0] = current[1];
  let gradients = 0;
  for (let i = 0; i < iterations; i++) {
    if (sampler === 'gibbs') {
      current = /** @type {NonNullable<typeof spec.gibbs>} */ (spec.gibbs)(rng, current, (i + 1) % 2 === 0 ? 0 : 1);
      accepted[i] = 1;
    } else if (sampler === 'hmc') {
      let q = /** @type {Point} */ ([current[0], current[1]]);
      let p = /** @type {Point} */ ([standardNormal(rng), standardNormal(rng)]);
      const h0 = -logP + 0.5 * (p[0] * p[0] + p[1] * p[1]);
      const path = paths ? new Float64Array(2 * (L + 1)) : null;
      if (path) { path[0] = q[0]; path[1] = q[1]; }
      let g = space.gradient(q);
      gradients++;
      let steps = 0;
      let diverged = false;
      let h = h0;
      for (let s = 0; s < L; s++) {
        p = [p[0] + 0.5 * step * g[0], p[1] + 0.5 * step * g[1]];
        q = [q[0] + step * p[0], q[1] + step * p[1]];
        g = space.gradient(q);
        gradients++;
        p = [p[0] + 0.5 * step * g[0], p[1] + 0.5 * step * g[1]];
        steps = s + 1;
        if (path) { path[2 * steps] = q[0]; path[2 * steps + 1] = q[1]; }
        h = -space.logDensity(q) + 0.5 * (p[0] * p[0] + p[1] * p[1]);
        if (!(h - h0 <= DIVERGENCE)) {
          diverged = true;
          break;
        }
      }
      if (paths && path) paths.push(path.slice(0, 2 * (steps + 1)));
      const u = rng();
      if (diverged) {
        divergent.push(i);
      } else if (Math.log(u) < h0 - h) {
        current = q;
        logP = space.logDensity(q);
        accepted[i] = 1;
      }
    } else {
      const proposal = /** @type {Point} */ ([current[0] + step * standardNormal(rng), current[1] + step * standardNormal(rng)]);
      if (proposals) { proposals.a[i] = proposal[0]; proposals.b[i] = proposal[1]; }
      const logQ = space.logDensity(proposal);
      let ratio = logQ - logP;
      if (sampler === 'multiplier') {
        // The state is z = log x and the density is x's, so this is x′ = x e^{λZ}, whose
        // Hastings ratio q(x | x′)/q(x′ | x) is x′₁x′₂/(x₁x₂).
        const log = proposal[0] + proposal[1] - current[0] - current[1];
        ratio += spec.correction === 'correct' ? log : spec.correction === 'reversed' ? -log : 0;
      }
      if (Math.log(rng()) < ratio) {
        current = proposal;
        logP = logQ;
        accepted[i] = 1;
      }
    }
    a[i + 1] = current[0];
    b[i + 1] = current[1];
  }
  return { a, b, accepted, proposals, paths, divergent, gradients };
}

/** MCMC_Demo.R's Gibbs step: one coordinate redrawn from its conditional. @param {() => number} rng @param {Point} p @param {number} k @returns {Point} */
function normalGibbs(rng, p, k) {
  const [m1, m2] = NORMAL.mean;
  const [[a, b], [, c]] = NORMAL.cov;
  if (k === 0) return [m1 + (b / c) * (p[1] - m2) + Math.sqrt(a - (b * b) / c) * standardNormal(rng), p[1]];
  return [p[0], m2 + (b / a) * (p[0] - m1) + Math.sqrt(c - (b * b) / a) * standardNormal(rng)];
}

// ---------- The entry ----------

/** The space a view samples in. @param {Params} p @returns {Space} */
export function spaceOf(p) {
  if (p.view === 'funnel') return funnelSpace(p.coordinates, p.sdY);
  if (p.view === 'hastings') {
    // The multiplier's state is z = log x, with x's own density at e^z (no Jacobian):
    // the move works on the log scale and the target is x's.
    const f = logNormalDensity(p.sd, p.correlation);
    return {
      logDensity: ([z1, z2]) => f([Math.exp(z1), Math.exp(z2)]),
      gradient: () => [0, 0],
      toTarget: ([z1, z2]) => [Math.exp(z1), Math.exp(z2)],
      fromTarget: ([x1, x2]) => [Math.log(x1), Math.log(x2)],
    };
  }
  return p.target === 'normal' ? normalSpace() : smileySpace();
}

/** A share, or null for an empty denominator. @param {number} k @param {number} n */
const share = (k, n) => (n ? k / n : null);

/**
 * @param {unknown} params
 */
export function compute(params) {
  const p = resolveParams(params);
  const space = spaceOf(p);
  const start = /** @type {Point} */ (space.fromTarget(/** @type {Point} */ (p.start)));
  const sampler = p.view === 'hastings' ? 'multiplier' : p.sampler;
  const chain = runChain(space, {
    sampler, step: p.step, leapfrog: p.view === 'hastings' ? 1 : p.leapfrog, iterations: p.iterations, start, seed: p.seed,
    correction: p.view === 'hastings' ? p.correction : undefined, gibbs: normalGibbs,
  });
  const n = p.iterations;
  const x = new Float64Array(n + 1);
  const y = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) [x[i], y[i]] = space.toTarget([chain.a[i], chain.b[i]]);
  const drawsX = x.subarray(1);
  const drawsY = y.subarray(1);
  const m = marginals(p);
  const accepted = chain.accepted.reduce((s, v) => s + v, 0);
  const stats = {
    acceptance: share(accepted, n),
    divergences: chain.divergent.length,
    gradients: sampler === 'hmc' ? chain.gradients : null,
    ess: { x: essBulk(drawsX), y: essBulk(drawsY) },
    ks: { x: ksDistance(drawsX, m.x), y: ksDistance(drawsY, m.y) },
    settledKs: m.settled ? { x: ksDistance(drawsX, m.settled.x), y: ksDistance(drawsY, m.settled.y) } : null,
    mean: { x: mean(drawsX), y: mean(drawsY) },
  };
  /** @type {Record<string, any>} */
  const out = {
    view: p.view,
    sampler,
    draws: { x: Array.from(x), y: Array.from(y) },
    space: p.view === 'funnel' && p.coordinates !== 'centred' ? { a: Array.from(chain.a), b: Array.from(chain.b) } : null,
    accepted: Array.from(chain.accepted),
    proposals: chain.proposals ? { a: Array.from(chain.proposals.a), b: Array.from(chain.proposals.b) } : null,
    trajectories: chain.paths ? chain.paths.map((path) => Array.from(path)) : null,
    divergent: chain.divergent,
    stats,
  };
  if (p.view === 'funnel') {
    const q = [0.05, 0.5, 0.95].map((v) => qnorm(v, 0, p.sdY));
    out.exact = { y: { quantiles: { q05: q[0], q50: q[1], q95: q[2] }, mean: 0, sd: p.sdY } };
    out.stats.tails = { below05: share(drawsY.filter((v) => v < q[0]).length, n), above95: share(drawsY.filter((v) => v > q[2]).length, n) };
  } else if (p.view === 'hastings') {
    const shift = settledShift(p.correction, p.sd, p.correlation);
    const meanOf = (/** @type {number} */ s) => Math.exp(s + (p.sd * p.sd) / 2);
    out.exact = { mean: meanOf(0), median: 1, settled: { shift, mean: meanOf(shift), median: Math.exp(shift) } };
  }
  return out;
}

/** @param {ArrayLike<number>} v */
function mean(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s / v.length;
}
