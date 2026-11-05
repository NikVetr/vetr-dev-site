// How many principal components are noise? The eigenvalues of a sample covariance of
// pure noise do not sit at the true variance σ²: they spread over the Marchenko–Pastur
// law, from σ²(1 − √γ)² to σ²(1 + √γ)², with γ = p/(n − 1) for n centred observations
// of p variables. Three views:
//   noise   the eigenvalues of simulated noise against the law, pooled and one index
//           at a time
//   spikes  population eigenvalues 1 + θ added to the noise: a spike shows up as a sample
//           eigenvalue beyond the edge only when θ > √γ (the BBP transition), and its
//           eigenvector then points partly along the true direction
//   pcs     a batch effect and latent factors in many features: what the first two
//           principal components show before and after the batch is regressed out
// The R scripts are marchenko–pastur_intuitions.R and 1st_two_pc_axes.R in
// ~/repos/minor_scripts/postdoc/; api.md says what was changed.

import { symmetricEigen, symmetricEigenvalues } from '../lib/linalg.js';
import { standardNormal } from '../lib/normal.js';
import { checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {'noise' | 'spikes' | 'pcs'} View */
/**
 * @typedef {{ view: 'noise', n: number, p: number, variance: number, replicates: number, seed: number }} NoiseParams
 * @typedef {{ view: 'spikes', n: number, p: number, spikes: number[], replicates: number, seed: number }} SpikesParams
 * @typedef {{ view: 'pcs', n: number, p: number, factors: number, batchVariance: number, noiseVariance: number, interactions: boolean, seed: number }} PcsParams
 * @typedef {NoiseParams | SpikesParams | PcsParams} Params
 */

export const ENTRY = 'marchenko-pastur';
export const VIEWS = /** @type {const} */ (['noise', 'spikes', 'pcs']);
/** The most work one request may ask for, in rough floating-point operations. */
export const MAX_WORK = 2e10;
const BY_INDEX = 60;
const DIFFERENCES = 50;

export const DEFAULTS = Object.freeze({
  noise: Object.freeze({ n: 200, p: 20, variance: 1, replicates: 1000, seed: 1 }),
  spikes: Object.freeze({ n: 200, p: 100, spikes: Object.freeze([4, 1, 0.5]), replicates: 100, seed: 1 }),
  pcs: Object.freeze({ n: 200, p: 500, factors: 49, batchVariance: 10, noiseVariance: 25, interactions: true, seed: 1 }),
});

/** [min, max] per numeric field, all integers but the variances and spikes. */
const RANGES = {
  noise: { n: [3, 1000], p: [1, 500], variance: [0.01, 100], replicates: [1, 5000], seed: [0, 4294967295] },
  spikes: { n: [3, 1000], p: [2, 500], replicates: [1, 2000], seed: [0, 4294967295] },
  pcs: { n: [4, 500], p: [2, 2000], factors: [0, 100], batchVariance: [0, 100], noiseVariance: [0.01, 100], seed: [0, 4294967295] },
};
const REAL = ['variance', 'batchVariance', 'noiseVariance'];
const MAX_SPIKES = 5;

// ---------- Parameters ----------

/**
 * Validates params and fills in defaults for the chosen view (default "noise").
 * Throws one IntuitionsError listing every problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'noise';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  const v = /** @type {View} */ (view);
  const defaults = /** @type {Record<string, any>} */ (DEFAULTS[v]);
  /** @type {Issue[]} */
  const issues = [];
  rejectUnknown(params, ['view', ...Object.keys(defaults)], 'params', issues);
  /** @type {Record<string, any>} */
  const out = { view: v };
  for (const [key, fallback] of Object.entries(defaults)) {
    const path = `params.${key}`;
    if (!Object.hasOwn(params, key)) out[key] = Array.isArray(fallback) ? [...fallback] : fallback;
    else if (key === 'spikes') out[key] = checkSpikes(params.spikes, issues);
    else if (key === 'interactions') {
      if (typeof params.interactions === 'boolean') out[key] = params.interactions;
      else {
        issues.push({ code: 'wrong_type', path, message: 'must be true or false' });
        out[key] = fallback;
      }
    } else {
      const [min, max] = /** @type {Record<string, number[]>} */ (RANGES[v])[key];
      out[key] = REAL.includes(key) ? checkNumber(params[key], path, min, max, fallback, issues) : checkInteger(params[key], path, min, max, fallback, issues);
    }
  }
  const p = /** @type {Params} */ (out);
  if (!issues.length) {
    const work = workOf(p);
    if (work > MAX_WORK) {
      issues.push({ code: 'too_much_work', path: p.view === 'pcs' ? 'params.p' : 'params.replicates', message: `asks for about ${Number((work / 1e9).toPrecision(2)).toLocaleString('en-US')} billion operations, and the most a request may ask for is ${MAX_WORK / 1e9} billion: lower it or n and p` });
    }
  }
  if (issues.length) throw invalidRequest(issues);
  return p;
}

/** 0 to 5 spike strengths θ from 0 to 100. @param {unknown} value @param {Issue[]} issues */
function checkSpikes(value, issues) {
  if (!Array.isArray(value) || value.length > MAX_SPIKES) {
    issues.push({ code: 'wrong_type', path: 'params.spikes', message: `must be an array of up to ${MAX_SPIKES} strengths, each from 0 to 100` });
    return [];
  }
  return value.map((s, i) => checkNumber(s, `params.spikes[${i}]`, 0, 100, 0, issues));
}

/** Rough operation count: covariance products and eigendecompositions. @param {Params} p */
function workOf(p) {
  const small = Math.min(p.n, p.p);
  const large = Math.max(p.n, p.p);
  if (p.view === 'noise') return p.replicates * (small * small * large + 2 * small ** 3);
  if (p.view === 'spikes') return p.replicates * (small * small * large + 6 * small ** 3);
  return 2 * (p.n * p.n * p.p + 6 * p.n ** 3) + p.n * p.p * 2 * p.factors;
}

// ---------- The Marchenko–Pastur law ----------

/**
 * The law's ratio, edges and share of zero eigenvalues for n centred observations of p
 * variables with variance σ²: γ = p/(n − 1), edges σ²(1 ∓ √γ)², and when p > n − 1 a
 * share 1 − 1/γ of the eigenvalues is exactly 0.
 * @param {number} n @param {number} p @param {number} variance
 */
export function mpLaw(n, p, variance) {
  const gamma = p / (n - 1);
  return { gamma, ...mpEdges(gamma, variance), zeroShare: Math.max(0, 1 - 1 / gamma) };
}

/** The edges σ²(1 ∓ √γ)². @param {number} gamma @param {number} variance */
const mpEdges = (gamma, variance) => ({ lower: variance * (1 - Math.sqrt(gamma)) ** 2, upper: variance * (1 + Math.sqrt(gamma)) ** 2 });

/**
 * The law's density at x (its continuous part, which holds min(1, 1/γ) of the mass):
 * √((b − x)(x − a)) / (2π σ² γ x) between the edges a and b. RMTstat's dmp with
 * ndf = n − 1 and pdim = p.
 * @param {number} x @param {number} gamma @param {number} variance
 */
export function mpDensity(x, gamma, variance) {
  const a = variance * (1 - Math.sqrt(gamma)) ** 2;
  const b = variance * (1 + Math.sqrt(gamma)) ** 2;
  if (x <= a || x >= b) return 0;
  return Math.sqrt((b - x) * (x - a)) / (2 * Math.PI * variance * gamma * x);
}

/**
 * The law's distribution function, zeros included, in closed form, and its inverse by
 * bisection. With R = √((b − x)(x − a)), the density integrates to
 * G(x) = R + ((a + b)/2) asin((2x − a − b)/(b − a)) − √(ab) asin(((a + b)x − 2ab)/(x(b − a))),
 * so P(λ ≤ x) = share of zeros + (G(x) − G(a)) / (2π σ² γ).
 * @param {number} gamma @param {number} variance
 */
export function mpDistribution(gamma, variance) {
  const { lower: a, upper: b } = mpEdges(gamma, variance);
  const zero = Math.max(0, 1 - 1 / gamma);
  const ab = Math.sqrt(a * b);
  const clamp = (/** @type {number} */ u) => Math.max(-1, Math.min(1, u));
  const cdf = (/** @type {number} */ x) => {
    if (x < 0) return 0;
    if (x <= a) return zero;
    if (x >= b) return 1;
    const R = Math.sqrt((b - x) * (x - a));
    const first = ((a + b) / 2) * (Math.asin(clamp((2 * x - a - b) / (b - a))) + Math.PI / 2);
    const second = ab > 0 ? ab * (Math.asin(clamp(((a + b) * x - 2 * a * b) / (x * (b - a)))) + Math.PI / 2) : 0;
    return Math.min(1, zero + (R + first - second) / (2 * Math.PI * variance * gamma));
  };
  return {
    cdf,
    quantile: (/** @type {number} */ q) => {
      if (q <= zero) return 0;
      if (q >= 1) return b;
      let lo = a;
      let hi = b;
      for (let i = 0; i < 100 && hi - lo > 1e-15 * b; i++) {
        const mid = (lo + hi) / 2;
        if (cdf(mid) < q) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    },
  };
}

/** The density on 201 points between the edges. @param {number} gamma @param {number} variance */
function densityCurve(gamma, variance) {
  const a = variance * (1 - Math.sqrt(gamma)) ** 2;
  const b = variance * (1 + Math.sqrt(gamma)) ** 2;
  // Cosine spacing puts more points near the edges, where the density turns.
  const x = Array.from({ length: 201 }, (_, i) => (a + b) / 2 - ((b - a) / 2) * Math.cos((Math.PI * i) / 200));
  return { x, density: x.map((v) => mpDensity(v, gamma, variance)) };
}

// ---------- Sample covariances ----------

/**
 * The eigenvalues of the sample covariance of an n × p matrix (rows observations),
 * with the columns centred: through whichever of XᵀX/(n − 1) and XXᵀ/(n − 1) is smaller.
 * The p − n + 1 structural zeros of a wide matrix are returned as 0.
 * @param {Float64Array[]} X rows, centred in place
 * @returns {Float64Array} p values, largest first
 */
export function covarianceEigenvalues(X) {
  const n = X.length;
  const p = X[0].length;
  centreColumns(X);
  const values = symmetricEigenvalues(gram(X, p <= n));
  const out = new Float64Array(p);
  const rank = Math.min(p, n - 1);
  for (let i = 0; i < rank; i++) out[i] = Math.max(0, values[i]) / (n - 1);
  return out;
}

/** Subtracts each column's mean. @param {Float64Array[]} X */
function centreColumns(X) {
  const n = X.length;
  const p = X[0].length;
  const means = new Float64Array(p);
  for (const row of X) for (let j = 0; j < p; j++) means[j] += row[j] / n;
  for (const row of X) for (let j = 0; j < p; j++) row[j] -= means[j];
}

/**
 * XᵀX (p × p) when `columns`, else XXᵀ (n × n).
 * @param {Float64Array[]} X @param {boolean} columns
 */
function gram(X, columns) {
  const n = X.length;
  const p = X[0].length;
  if (!columns) {
    const G = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      for (let k = 0; k <= i; k++) {
        const xk = X[k];
        let s = 0;
        for (let j = 0; j < p; j++) s += xi[j] * xk[j];
        G[i][k] = s;
        G[k][i] = s;
      }
    }
    return G;
  }
  const G = Array.from({ length: p }, () => new Float64Array(p));
  for (const row of X) {
    for (let a = 0; a < p; a++) {
      const v = row[a];
      if (v === 0) continue;
      const Ga = G[a];
      for (let b = 0; b <= a; b++) Ga[b] += v * row[b];
    }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) G[b][a] = G[a][b];
  return G;
}

/** R's default (type 7) quantile of sorted values. @param {ArrayLike<number>} sorted @param {number} q */
function quantileSorted(sorted, q) {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Median and 5–95% of a set of values. @param {Float64Array} values */
function spread(values) {
  const s = Float64Array.from(values).sort();
  let sum = 0;
  for (const v of s) sum += v;
  return { mean: sum / s.length, lo: quantileSorted(s, 0.05), median: quantileSorted(s, 0.5), hi: quantileSorted(s, 0.95) };
}

/** An n × p matrix of independent normals with the given SD. @param {() => number} rng @param {number} n @param {number} p @param {number} sd */
function noiseMatrix(rng, n, p, sd) {
  return Array.from({ length: n }, () => {
    const row = new Float64Array(p);
    for (let j = 0; j < p; j++) row[j] = sd * standardNormal(rng);
    return row;
  });
}

// ---------- noise ----------

/** @param {NoiseParams} p */
function noise({ n, p, variance, replicates, seed }) {
  const law = mpLaw(n, p, variance);
  const dist = mpDistribution(law.gamma, variance);
  const rng = mulberry32(seed);
  const indices = Math.min(p, BY_INDEX);
  const byIndex = Array.from({ length: indices }, () => new Float64Array(replicates));
  const rank = Math.min(p, n - 1);
  const pooled = new Float64Array(replicates * rank);
  let above = 0;
  let below = 0;
  /** @type {number[]} */
  let first = [];
  for (let r = 0; r < replicates; r++) {
    const values = covarianceEigenvalues(noiseMatrix(rng, n, p, Math.sqrt(variance)));
    if (r === 0) first = [...values];
    for (let k = 0; k < indices; k++) byIndex[k][r] = values[k];
    pooled.set(values.subarray(0, rank), r * rank);
    if (values[0] > law.upper) above += 1;
    if (law.zeroShare === 0 && values[rank - 1] < law.lower) below += 1;
  }
  // The pooled non-zero eigenvalues as a density, scaled so that it matches the law's
  // continuous part (which holds 1 − zeroShare of the mass).
  pooled.sort();
  const top = Math.max(law.upper * 1.15, pooled[pooled.length - 1]);
  const bins = 60;
  const width = top / bins;
  const counts = new Array(bins).fill(0);
  for (const v of pooled) counts[Math.min(bins - 1, Math.floor(v / width))] += 1;
  const scale = (1 - law.zeroShare) / (pooled.length * width);
  return {
    view: 'noise',
    ...law,
    edges: { lower: law.lower, upper: law.upper },
    // The script's edges take γ = p/n, as if the data were not centred.
    scriptEdges: mpEdges(p / n, variance),
    curve: densityCurve(law.gamma, variance),
    sample: {
      replicates,
      seed,
      histogram: { edges: Array.from({ length: bins + 1 }, (_, i) => i * width), density: counts.map((c) => c * scale) },
      byIndex: byIndex.map((values, k) => ({ index: k + 1, ...spread(values), law: dist.quantile(1 - (k + 0.5) / p) })),
      largest: { ...spread(byIndex[0]), aboveEdge: above / replicates },
      smallestBelowEdge: law.zeroShare === 0 ? below / replicates : null,
      first,
    },
  };
}

// ---------- spikes ----------

/**
 * Where a spike of strength θ (population eigenvalue σ²(1 + θ)) ends up as n and p grow
 * with p/n → γ: beyond the bulk at σ²(1 + θ)(1 + γ/θ) when θ > √γ, at the edge
 * σ²(1 + √γ)² otherwise; and the squared cosine between its sample eigenvector and the
 * true direction, (1 − γ/θ²)/(1 + γ/θ) above the threshold and 0 below.
 * @param {number} theta @param {number} gamma
 */
export function bbp(theta, gamma) {
  const root = Math.sqrt(gamma);
  if (theta <= root) return { detectable: false, eigenvalue: (1 + root) ** 2, overlap: 0 };
  return { detectable: true, eigenvalue: (1 + theta) * (1 + gamma / theta), overlap: (1 - gamma / (theta * theta)) / (1 + gamma / theta) };
}

/** @param {SpikesParams} p */
function spikes({ n, p, spikes: strengths, replicates, seed }) {
  const law = mpLaw(n, p, 1);
  const order = strengths.map((theta, i) => ({ theta, i })).sort((a, b) => b.theta - a.theta);
  const sorted = order.map((s) => s.theta);
  const r = sorted.length;
  const rng = mulberry32(seed);
  const scales = sorted.map((theta) => Math.sqrt(1 + theta));
  const tracked = Math.min(p, r + 1);
  const values = Array.from({ length: tracked }, () => new Float64Array(replicates));
  const overlaps = Array.from({ length: r }, () => new Float64Array(replicates));
  /** @type {number[]} */
  let first = [];
  for (let rep = 0; rep < replicates; rep++) {
    // The spikes lie along the first r axes; noise is rotation invariant, so any
    // orthonormal directions give the same eigenvalues.
    const X = noiseMatrix(rng, n, p, 1);
    for (const row of X) for (let k = 0; k < r; k++) row[k] *= scales[k];
    centreColumns(X);
    let eig;
    if (p <= n) {
      const e = symmetricEigen(gram(X, true));
      eig = { values: e.values.map((v) => Math.max(0, v) / (n - 1)), along: (/** @type {number} */ k, /** @type {number} */ j) => e.vectors[k][j] };
    } else {
      // Through the n × n Gram matrix: a variable-space eigenvector is Xᵀu/√λ.
      const e = symmetricEigen(gram(X, false));
      eig = {
        values: [...e.values.slice(0, n - 1).map((v) => Math.max(0, v) / (n - 1)), ...new Array(p - n + 1).fill(0)],
        along: (/** @type {number} */ k, /** @type {number} */ j) => {
          let s = 0;
          for (let i = 0; i < n; i++) s += X[i][j] * e.vectors[k][i];
          return s / Math.sqrt(Math.max(1e-300, e.values[k]));
        },
      };
    }
    if (rep === 0) first = eig.values.slice(0, p);
    for (let k = 0; k < tracked; k++) values[k][rep] = eig.values[k];
    for (let k = 0; k < r && k < Math.min(p, n - 1); k++) overlaps[k][rep] = eig.along(k, k) ** 2;
  }
  const thetaMax = Math.max(4 * Math.sqrt(law.gamma), 1.15 * (sorted[0] ?? 0), 1);
  const grid = Array.from({ length: 161 }, (_, i) => (thetaMax * i) / 160);
  return {
    view: 'spikes',
    ...law,
    threshold: Math.sqrt(law.gamma),
    edges: { lower: law.lower, upper: law.upper },
    curve: densityCurve(law.gamma, 1),
    theory: { strength: grid, eigenvalue: grid.map((t) => bbp(t, law.gamma).eigenvalue), overlap: grid.map((t) => bbp(t, law.gamma).overlap) },
    spikes: sorted.map((theta, k) => ({
      strength: theta,
      population: 1 + theta,
      ...bbp(theta, law.gamma),
      sample: { ...spread(values[k]), overlap: spread(overlaps[k]).mean },
    })),
    nextLargest: tracked > r ? spread(values[r]) : null,
    sample: { replicates, seed, first },
  };
}

// ---------- pcs: the first two principal components with a batch ----------

/**
 * Principal components of an n × p matrix (rows samples): the eigenvalues of its
 * sample covariance (prcomp's sdev²) and each sample's scores on the first `keep` axes,
 * scaled to variance 1, through the n × n Gram matrix of the centred columns.
 * @param {Float64Array[]} X rows, centred in place
 * @param {number} keep
 */
export function principalComponents(X, keep) {
  const n = X.length;
  centreColumns(X);
  const { values, vectors } = symmetricEigen(gram(X, false));
  const rank = Math.min(n - 1, X[0].length);
  return {
    eigenvalues: values.slice(0, rank).map((v) => Math.max(0, v) / (n - 1)),
    // Unit-variance scores: u √(n − 1), u the Gram matrix's unit eigenvector.
    scores: vectors.slice(0, Math.min(keep, rank)).map((u) => u.map((x) => x * Math.sqrt(n - 1))),
  };
}

/** @param {PcsParams} p */
function pcs({ n, p, factors, batchVariance, noiseVariance, interactions, seed }) {
  const rng = mulberry32(seed);
  const batch = Array.from({ length: n }, (_, i) => (i < Math.floor(n / 2) ? 0 : 1));
  // As 1st_two_pc_axes.R: factor scores and their effects on each feature are standard
  // normal, the batch shifts each feature by a normal with variance batchVariance, and
  // with interactions each factor's effect also differs between the batches by a
  // standard normal times (batch − ½).
  const scores = Array.from({ length: n }, () => Float64Array.from({ length: factors }, () => standardNormal(rng)));
  const effects = Array.from({ length: factors }, () => Float64Array.from({ length: p }, () => standardNormal(rng)));
  const changes = interactions ? Array.from({ length: factors }, () => Float64Array.from({ length: p }, () => standardNormal(rng))) : [];
  const shift = Float64Array.from({ length: p }, () => Math.sqrt(batchVariance) * standardNormal(rng));
  const Y = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(p);
    for (let j = 0; j < p; j++) row[j] = batch[i] * shift[j] + Math.sqrt(noiseVariance) * standardNormal(rng);
    for (let f = 0; f < factors; f++) {
      const s = scores[i][f];
      const e = effects[f];
      const c = interactions ? changes[f] : null;
      const d = batch[i] - 0.5;
      for (let j = 0; j < p; j++) row[j] += s * (e[j] + (c ? d * c[j] : 0));
    }
    return row;
  });
  // Regressing each feature on the batch leaves each feature minus its batch's mean.
  const centred = Y.map((row) => Float64Array.from(row));
  for (const b of [0, 1]) {
    const members = centred.filter((_, i) => batch[i] === b);
    const means = new Float64Array(p);
    for (const row of members) for (let j = 0; j < p; j++) means[j] += row[j] / members.length;
    for (const row of members) for (let j = 0; j < p; j++) row[j] -= means[j];
  }
  const law = mpLaw(n, p, noiseVariance);
  const summarise = (/** @type {Float64Array[]} */ X) => {
    const { eigenvalues, scores: axes } = principalComponents(X, DIFFERENCES);
    const difference = axes.map((u) => {
      let m0 = 0;
      let m1 = 0;
      u.forEach((v, i) => { if (batch[i] === 0) m0 += v; else m1 += v; });
      return m0 / Math.floor(n / 2) - m1 / (n - Math.floor(n / 2));
    });
    return {
      eigenvalues,
      aboveEdge: eigenvalues.filter((v) => v > law.upper).length,
      scores: { pc1: axes[0], pc2: axes[1] ?? null },
      batchDifference: difference,
    };
  };
  return {
    view: 'pcs',
    ...law,
    edges: { lower: law.lower, upper: law.upper },
    batch,
    // Per feature: the factors' variance, the interactions', the batch's (a balanced
    // 0/1 batch has variance ¼) and the noise's.
    variance: { factors, interactions: interactions ? factors / 4 : 0, batch: batchVariance / 4, noise: noiseVariance },
    uncorrected: summarise(Y),
    corrected: summarise(centred),
  };
}

// ---------- Entry point ----------

/**
 * The entry's computation. Same params, same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  if (p.view === 'noise') return noise(p);
  if (p.view === 'spikes') return spikes(p);
  return pcs(p);
}
