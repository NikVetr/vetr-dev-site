// The backpack fallacy. Two studies report the same p-value, but one measured fewer
// people per group. Which of them is likely to have the larger true effect?
// backpack_fallacy.R simulates it: every group's true mean is drawn from a Cauchy(0, 1),
// two groups of n people with SD 1 are compared by a two-sample t-test, for n = 2, 16,
// 128, 1024 and 8192, ten million tests each; the tests are sorted by p-value, each is
// paired with its neighbour in that order, and in a sliding window of −log10 p it reports
// the share of pairs in which the smaller study has the larger |true difference|.
//
// This entry computes the same quantity without simulating. For n per group the true
// difference Δ has a known distribution (Cauchy(0, 2τ) when the means are Cauchy(0, τ),
// N(0, 2τ²) when they are normal), and given Δ the t statistic is noncentral t with
// 2n − 2 df and noncentrality Δ/√(2/n). So, at a given p-value, the distribution of |Δ|
// is a one-dimensional integral; the chance that the smaller study's |Δ| is the larger
// is a double one, with the two studies independent; and the density of −log10 p is the
// same integral's normalising constant, which weights the script's window. The integrals
// are Simpson's rule on cells that follow where the posterior lies; the noncentral t's
// kernel ∫₀^∞ yᵛ e^{−(y − μ)²/2} dy is tabulated once per df.

import { qnorm } from '../lib/normal.js';
import { checkChoice, checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { lgamma, ptTwoSided, qgamma } from '../lib/special.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {'cauchy' | 'normal'} Prior */
/** @typedef {{ prior: Prior, scale: number, sizes: number[], upTo: number, window: number, at: number }} Params */
/**
 * One study's distribution of |Δ| at one p-value, on cells: edges, the density at the
 * edges and at the cells' midpoints, and the distribution function at the edges.
 * @typedef {{ edges: Float64Array, atEdge: Float64Array, atMid: Float64Array, cdf: Float64Array, logZ: number }} Posterior
 */

export const ENTRY = 'backpack-fallacy';
export const PRIORS = /** @type {const} */ (['cauchy', 'normal']);
export const DEFAULTS = Object.freeze({ prior: /** @type {Prior} */ ('cauchy'), scale: 1, sizes: Object.freeze([2, 16, 128, 1024, 8192]), upTo: 6, window: 1, at: 2 });
/** −log10 p is computed every STEP. */
export const STEP = 0.05;
const MAX_SIZES = 6;

const LN10 = Math.LN10;
const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI);

/**
 * @param {unknown} [params]
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  /** @type {Issue[]} */
  const issues = [];
  rejectUnknown(params, Object.keys(DEFAULTS), 'params', issues);
  const d = DEFAULTS;
  const prior = Object.hasOwn(params, 'prior') ? checkChoice(params.prior, 'params.prior', PRIORS, d.prior, issues) : d.prior;
  const scale = Object.hasOwn(params, 'scale') ? checkNumber(params.scale, 'params.scale', 0.01, 100, d.scale, issues) : d.scale;
  const upTo = Object.hasOwn(params, 'upTo') ? checkNumber(params.upTo, 'params.upTo', 1, 30, d.upTo, issues) : d.upTo;
  const window = Object.hasOwn(params, 'window') ? checkNumber(params.window, 'params.window', 0, 5, d.window, issues) : d.window;
  const at = Object.hasOwn(params, 'at') ? checkNumber(params.at, 'params.at', 0, 30, d.at, issues) : d.at;
  let sizes = [...d.sizes];
  if (Object.hasOwn(params, 'sizes')) {
    const value = params.sizes;
    if (!Array.isArray(value) || value.length < 2 || value.length > MAX_SIZES) {
      issues.push({ code: 'wrong_type', path: 'params.sizes', message: `must be an array of 2 to ${MAX_SIZES} group sizes` });
    } else {
      const before = issues.length;
      sizes = value.map((v, i) => checkInteger(v, `params.sizes[${i}]`, 2, 100000, 2, issues));
      if (issues.length === before && new Set(sizes).size < sizes.length) issues.push({ code: 'duplicate_size', path: 'params.sizes', message: 'lists a group size twice; give distinct sizes' });
      sizes.sort((a, b) => a - b);
    }
  }
  if (issues.length) throw invalidRequest(issues);
  return { prior, scale, sizes, upTo, window, at };
}

// ---------- The t distribution ----------

/** log density of Student's t with ν df. @param {number} t @param {number} nu */
function logDensityT(t, nu) {
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - ((nu + 1) / 2) * Math.log1p((t * t) / nu);
}

/**
 * The t value with P(|T| ≥ t) = p, ν df: closed form for ν = 2, else Newton steps on
 * log p against log t, kept inside a bracket.
 * @param {number} p in (0, 1]
 * @param {number} nu
 */
export function tQuantile(p, nu) {
  if (p >= 1) return 0;
  if (nu === 2) return Math.sqrt((2 * (1 - p) * (1 - p)) / (p * (2 - p)));
  const target = Math.log(p);
  const g = (/** @type {number} */ r) => Math.log(ptTwoSided(Math.exp(r), nu)) - target;
  const z = -qnorm(p / 2);
  let r = Math.log(Math.max(1e-8, z + (z ** 3 + z) / (4 * nu)));
  let lo = -40;
  let hi = r;
  while (g(hi) > 0) hi += 2;
  if (r >= hi) r = (lo + hi) / 2;
  for (let i = 0; i < 100; i++) {
    const t = Math.exp(r);
    const tail = ptTwoSided(t, nu);
    const gr = Math.log(tail) - target;
    if (gr > 0) lo = r;
    else hi = r;
    const slope = (-2 * t * Math.exp(logDensityT(t, nu))) / tail;
    let next = r - gr / slope;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - r) < 1e-14 * Math.max(1, Math.abs(r))) return Math.exp(next);
    r = next;
  }
  return Math.exp(r);
}

// ---------- The noncentral t's kernel ----------

const KERNEL_NODES = 24;
/** The log-space branch needs a finer step: its integrand is analytic only in a narrow strip. */
const LOG_NODES = 64;
/** Points of the first pass (geometric and uniform), of the second's uniform cells, and near 0. */
const COARSE = 48;
const FINE = 160;
const CORE = 24;

/**
 * log ∫₀^∞ yᵛ e^{−(y − μ)²/2} dy, by the trapezoid rule around the integrand's peak:
 * in y when the peak is well away from 0, else in log y.
 * @param {number} nu
 * @param {number} mu
 */
export function logKernelDirect(nu, mu) {
  const root = Math.sqrt(mu * mu + 4 * nu);
  const peak = mu > 0 ? (mu + root) / 2 : (2 * nu) / (root - mu);
  const gap = mu > 0 ? (2 * nu) / (root + mu) : peak - mu; // peak − μ, without cancellation
  const width = 1 / Math.sqrt(1 + nu / (peak * peak));
  const inY = peak - 12 * width > 0;
  const nodes = inY ? KERNEL_NODES : LOG_NODES;
  const values = new Float64Array(nodes + 1);
  let h;
  if (inY) {
    h = (20 * width) / nodes;
    const logPeak = Math.log(peak);
    for (let k = 0; k <= nodes; k++) {
      const z = -10 * width + k * h;
      const d = gap + z;
      values[k] = nu * (logPeak + Math.log1p(z / peak)) - 0.5 * d * d;
    }
  } else {
    const r2 = Math.sqrt(mu * mu + 4 * (nu + 1));
    const e = mu > 0 ? (mu + r2) / 2 : (2 * (nu + 1)) / (r2 - mu); // peak in log y
    const sd = 1 / Math.sqrt(e * (2 * e - mu));
    const start = Math.log(e) - 16 * sd;
    h = (26 * sd) / nodes;
    for (let k = 0; k <= nodes; k++) {
      const r = start + k * h;
      const y = Math.exp(r);
      values[k] = (nu + 1) * r - 0.5 * (y - mu) * (y - mu);
    }
  }
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  let sum = 0;
  for (let k = 0; k <= nodes; k++) sum += (k === 0 || k === nodes ? 0.5 : 1) * Math.exp(values[k] - max);
  return max + Math.log(sum * h);
}

/** The kernel on u = asinh(μ/c), c = min(√(ν + 1), 8), every KERNEL_STEP, from μ = −45 to 10¹⁸. */
const KERNEL_STEP = 0.004;
/** @typedef {{ start: number, c: number, values: Float64Array, constant: number }} KernelTable */
/** @type {Map<number, KernelTable>} */
const kernels = new Map();

/** @param {number} nu */
function kernelTable(nu) {
  let table = kernels.get(nu);
  if (!table) {
    const c = Math.min(Math.sqrt(nu + 1), 8);
    const start = Math.asinh(-45 / c) - 2 * KERNEL_STEP;
    const count = Math.ceil((Math.asinh(1e18 / c) - start) / KERNEL_STEP) + 3;
    const values = new Float64Array(count);
    for (let j = 0; j < count; j++) values[j] = logKernelDirect(nu, c * Math.sinh(start + j * KERNEL_STEP));
    // log of 2 (ν/2)^(ν/2) / (Γ(ν/2) √(2π)), the density's constant
    table = { start, c, values, constant: Math.log(2) + (nu / 2) * Math.log(nu / 2) - lgamma(nu / 2) - HALF_LOG_2PI };
    kernels.set(nu, table);
  }
  return table;
}

/** The tabulated kernel, by cubic interpolation. @param {KernelTable} table @param {number} mu */
function logKernel(table, mu) {
  const pos = (Math.asinh(mu / table.c) - table.start) / KERNEL_STEP;
  const j = Math.min(Math.max(1, Math.floor(pos)), table.values.length - 3);
  const t = pos - j;
  const v = table.values;
  return (-t * (t - 1) * (t - 2) * v[j - 1]) / 6 + ((t + 1) * (t - 1) * (t - 2) * v[j]) / 2
    - ((t + 1) * t * (t - 2) * v[j + 1]) / 2 + ((t + 1) * t * (t - 1) * v[j + 2]) / 6;
}

/**
 * log density of |T| at t for T = (δ + Z)/S, S² ~ χ²_ν/ν: the noncentral t with
 * noncentrality δ, at t and at −t.
 * @param {number} nu
 * @param {number} t ≥ 0
 * @param {number} delta ≥ 0
 */
export function logAbsT(nu, t, delta) {
  const table = kernelTable(nu);
  const A = nu + t * t;
  const base = table.constant - ((nu + 1) / 2) * Math.log(A) - (delta * delta * nu) / (2 * A);
  const mu = (t * delta) / Math.sqrt(A);
  const plus = logKernel(table, mu);
  return base + (mu < 45 ? plus + Math.log1p(Math.exp(logKernel(table, -mu) - plus)) : plus);
}

// ---------- The true difference ----------

/** The scale of |Δ|'s distribution: the Cauchy's 2τ or the normal's √2 τ. @param {Params} p */
const priorScale = (p) => (p.prior === 'cauchy' ? 2 * p.scale : Math.SQRT2 * p.scale);

/** log density of |Δ| = |θ₁ − θ₂|. @param {Params} p @param {number} a */
function logPrior(p, a) {
  const s = priorScale(p);
  const z = a / s;
  return p.prior === 'cauchy' ? Math.log(2 / (Math.PI * s)) - Math.log1p(z * z) : Math.log(2 / s) - HALF_LOG_2PI - 0.5 * z * z;
}

/**
 * The distribution of |Δ| for a study of n per group whose two-sided p-value has
 * t statistic t. A first pass on a coarse grid finds where it lies; the second puts
 * Simpson cells there, more of them near 0 when the prior is narrow.
 * @param {Params} p @param {number} n @param {number} t
 * @returns {Posterior}
 */
export function posterior(p, n, t) {
  const nu = 2 * n - 2;
  const se = Math.sqrt(2 / n);
  const sp = priorScale(p);
  const sHigh = Math.sqrt((2 * qgamma(1 - 1e-14, nu / 2)) / nu);
  const top = se * (t * sHigh + 12);
  const tiny = 1e-9 * Math.min(se, sp);
  const logF = (/** @type {number} */ a) => logPrior(p, a) + logAbsT(nu, t, a / se);
  const coarse = new Float64Array(2 * COARSE + CORE + 3);
  let c = 1;
  for (let k = 0; k <= COARSE; k++) {
    coarse[c++] = tiny * (top / tiny) ** (k / COARSE);
    coarse[c++] = (top * (k + 1)) / (COARSE + 1);
  }
  for (let k = 1; k <= CORE; k++) coarse[c++] = (Math.min(top, 12 * sp) * k) / CORE;
  coarse.sort();
  const values = coarse.map(logF);
  let peak = -Infinity;
  for (const v of values) if (v > peak) peak = v;
  let first = 0;
  while (values[first] <= peak - 46) first++;
  let last = values.length - 1;
  while (values[last] <= peak - 46) last--;
  const lo = coarse[Math.max(0, first - 1)];
  const hi = coarse[Math.min(coarse.length - 1, last + 1)];
  /** @type {number[]} */
  const points = [];
  for (let k = 0; k <= FINE; k++) points.push(lo + ((hi - lo) * k) / FINE);
  const from = Math.max(lo, tiny);
  if (hi / from > 1e3) for (let k = 0; k <= COARSE; k++) points.push(from * (hi / from) ** (k / COARSE));
  const core = Math.min(hi, lo + 12 * sp);
  if (core - lo < (hi - lo) / 8) for (let k = 1; k <= CORE; k++) points.push(lo + ((core - lo) * k) / CORE);
  points.sort((a, b) => a - b);
  const edges = Float64Array.from(points.filter((v, i) => i === 0 || v > points[i - 1] * (1 + 1e-12)));
  const cells = edges.length - 1;
  const logEdge = edges.map(logF);
  const logMid = new Float64Array(cells);
  for (let k = 0; k < cells; k++) logMid[k] = logF((edges[k] + edges[k + 1]) / 2);
  let max = -Infinity;
  for (const v of logEdge) if (v > max) max = v;
  for (const v of logMid) if (v > max) max = v;
  const atEdge = logEdge.map((v) => Math.exp(v - max));
  const atMid = logMid.map((v) => Math.exp(v - max));
  const cdf = new Float64Array(cells + 1);
  for (let k = 0; k < cells; k++) cdf[k + 1] = cdf[k] + ((edges[k + 1] - edges[k]) / 6) * (atEdge[k] + 4 * atMid[k] + atEdge[k + 1]);
  const total = cdf[cells];
  for (let k = 0; k <= cells; k++) {
    cdf[k] /= total;
    atEdge[k] /= total;
  }
  for (let k = 0; k < cells; k++) atMid[k] /= total;
  return { edges, atEdge, atMid, cdf, logZ: max + Math.log(total) };
}

/**
 * The distribution function at sorted points, from the quadratic through each cell's
 * three densities (which Simpson's rule integrates exactly).
 * @param {Posterior} d @param {number[]} points ascending
 */
function cdfAt(d, points) {
  const { edges, atEdge, atMid, cdf } = d;
  const out = new Float64Array(points.length);
  let k = 0;
  const cells = edges.length - 1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    if (a <= edges[0]) continue;
    if (a >= edges[cells]) { out[i] = 1; continue; }
    while (edges[k + 1] < a) k++;
    const h = edges[k + 1] - edges[k];
    const s = (a - edges[k]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    out[i] = cdf[k] + h * (atEdge[k] * ((2 / 3) * s3 - 1.5 * s2 + s) + atMid[k] * (2 * s2 - (4 / 3) * s3) + atEdge[k + 1] * ((2 / 3) * s3 - 0.5 * s2));
  }
  return out;
}

/** E_d[F(|Δ|)] by Simpson's rule on d's cells. @param {Posterior} d @param {Posterior} other */
function expectCdf(d, other) {
  const cells = d.edges.length - 1;
  /** @type {number[]} */
  const points = [];
  for (let k = 0; k < cells; k++) points.push(d.edges[k], (d.edges[k] + d.edges[k + 1]) / 2);
  points.push(d.edges[cells]);
  const F = cdfAt(other, points);
  let sum = 0;
  for (let k = 0; k < cells; k++) sum += ((d.edges[k + 1] - d.edges[k]) / 6) * (d.atEdge[k] * F[2 * k] + 4 * d.atMid[k] * F[2 * k + 1] + d.atEdge[k + 1] * F[2 * k + 2]);
  return sum;
}

/**
 * P(|Δ| of study a > |Δ| of study b), the two independent. The sum runs over whichever
 * distribution is narrower, against the other's distribution function.
 * @param {Posterior} a @param {Posterior} b
 */
export function chanceLarger(a, b) {
  const span = (/** @type {Posterior} */ d) => d.edges[d.edges.length - 1] - d.edges[0];
  return span(b) <= span(a) ? 1 - expectCdf(b, a) : expectCdf(a, b);
}

/** A quantile of |Δ|, by bisection on the distribution function. @param {Posterior} d @param {number} q */
function quantile(d, q) {
  let lo = d.edges[0];
  let hi = d.edges[d.edges.length - 1];
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cdfAt(d, [mid])[0] < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- The entry ----------

/**
 * @param {unknown} params
 */
export function compute(params) {
  const p = resolveParams(params);
  /** @type {number[]} */
  const xs = [];
  const last = Math.round((p.upTo + p.window) / STEP);
  for (let k = 0; k <= last; k++) xs.push(Number((k * STEP).toFixed(10)));
  const shown = Math.round(p.upTo / STEP) + 1;
  const studies = p.sizes.map((n) => {
    const nu = 2 * n - 2;
    const t = xs.map((x) => tQuantile(10 ** -x, nu));
    const dist = t.map((tv) => posterior(p, n, tv));
    // Density of −log10 p: the density of |T| at t times dt/dx = p ln 10 / (2 f_t(t)).
    const logDensity = t.map((tv, k) => dist[k].logZ - xs[k] * LN10 + Math.log(LN10 / 2) - logDensityT(tv, nu));
    return { n, nu, t, dist, logDensity };
  });
  // The script's pairs are neighbours in the pooled order of all the tests, so a pair of
  // sizes a and b sits at x with weight density_a × density_b / Σ density.
  const logPooled = xs.map((_, k) => {
    const v = studies.map((s) => s.logDensity[k]);
    const m = Math.max(...v);
    return m + Math.log(v.reduce((acc, x) => acc + Math.exp(x - m), 0));
  });
  const pairs = [];
  for (let i = 0; i < studies.length; i++) {
    for (let j = i + 1; j < studies.length; j++) {
      const a = studies[i];
      const b = studies[j];
      const matched = xs.map((_, k) => chanceLarger(a.dist[k], b.dist[k]));
      const logWeight = xs.map((_, k) => a.logDensity[k] + b.logDensity[k] - logPooled[k]);
      pairs.push({
        smaller: a.n,
        larger: b.n,
        matched: matched.slice(0, shown),
        windowed: p.window > 0 ? xs.slice(0, shown).map((x) => windowAverage(xs, matched, logWeight, x - p.window, x + p.window)) : null,
      });
    }
  }
  return {
    prior: p.prior,
    scale: p.scale,
    window: p.window,
    x: xs.slice(0, shown),
    studies: studies.map((s) => ({ n: s.n, df: s.nu, se: Math.sqrt(2 / s.n), density: s.logDensity.slice(0, shown).map(Math.exp) })),
    pairs,
    at: atPoint(p),
  };
}

/**
 * The weighted average of `values` over (lo, hi), by the trapezoid rule on the grid with
 * linear interpolation at the ends.
 * @param {number[]} xs @param {number[]} values @param {number[]} logWeight @param {number} lo @param {number} hi
 */
function windowAverage(xs, values, logWeight, lo, hi) {
  const from = Math.max(lo, 0);
  const to = Math.min(hi, xs[xs.length - 1]);
  const at = (/** @type {number[]} */ v, /** @type {number} */ x) => {
    const k = Math.min(xs.length - 2, Math.floor(x / STEP));
    const s = (x - xs[k]) / STEP;
    return v[k] * (1 - s) + v[k + 1] * s;
  };
  const points = [from];
  for (let k = Math.ceil(from / STEP + 1e-9); xs[k] < to - 1e-12; k++) points.push(xs[k]);
  points.push(to);
  const lw = points.map((x) => at(logWeight, x));
  const m = Math.max(...lw);
  const w = lw.map((v) => Math.exp(v - m));
  const v = points.map((x) => at(values, x));
  let num = 0;
  let den = 0;
  for (let k = 0; k + 1 < points.length; k++) {
    const h = points[k + 1] - points[k];
    num += (h / 2) * (w[k] * v[k] + w[k + 1] * v[k + 1]);
    den += (h / 2) * (w[k] + w[k + 1]);
  }
  return num / den;
}

/** Each study's |Δ| at the p-value 10^−at, and the pairs' chances there. @param {Params} p */
export function atPoint(p) {
  const pValue = 10 ** -p.at;
  const dists = p.sizes.map((n) => {
    const t = tQuantile(pValue, 2 * n - 2);
    return { n, t, dist: posterior(p, n, t) };
  });
  const qs = dists.map(({ dist }) => ({ q005: quantile(dist, 0.0005), q995: quantile(dist, 0.9995) }));
  const lo = Math.log10(Math.max(1e-12, Math.min(...qs.map((q) => q.q005))));
  const hi = Math.log10(Math.max(...qs.map((q) => q.q995)));
  const grid = Array.from({ length: 241 }, (_, k) => lo + ((hi - lo) * k) / 240);
  const pairs = [];
  for (let i = 0; i < dists.length; i++) {
    for (let j = i + 1; j < dists.length; j++) pairs.push({ smaller: dists[i].n, larger: dists[j].n, matched: chanceLarger(dists[i].dist, dists[j].dist) });
  }
  return {
    x: p.at,
    p: pValue,
    studies: dists.map(({ n, t, dist }) => ({
      n,
      t,
      quantiles: { q05: quantile(dist, 0.05), q25: quantile(dist, 0.25), q50: quantile(dist, 0.5), q75: quantile(dist, 0.75), q95: quantile(dist, 0.95) },
      curve: { log10: grid, density: grid.map((g) => densityAt(dist, 10 ** g) * 10 ** g * LN10) },
    })),
    pairs,
  };
}

/** The density of |Δ| at a, from the cell's quadratic. @param {Posterior} d @param {number} a */
function densityAt(d, a) {
  const { edges, atEdge, atMid } = d;
  const cells = edges.length - 1;
  if (a <= edges[0] || a >= edges[cells]) return 0;
  let lo = 0;
  let hi = cells;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] <= a) lo = mid;
    else hi = mid;
  }
  const s = (a - edges[lo]) / (edges[lo + 1] - edges[lo]);
  return Math.max(0, atEdge[lo] * 2 * (s - 0.5) * (s - 1) - atMid[lo] * 4 * s * (s - 1) + atEdge[lo + 1] * 2 * s * (s - 0.5));
}
