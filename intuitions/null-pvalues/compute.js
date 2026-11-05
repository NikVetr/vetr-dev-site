// Ways to break a p-value. When the null hypothesis is true, a valid test's p-value is
// uniform on [0, 1], so it falls below α a share α of the time. Each scenario puts a
// common shortcut beside a sound analysis of the same data, under a true null, and
// reports the distribution of the p-values each gives: a 20-bin histogram, the share
// at or below every threshold from 10⁻⁴ to 1 (the uniform's is the threshold itself),
// and the realised false-positive rate at α.
// Closed forms where they exist; seeded Monte Carlo otherwise.
//   batch            the batch regressed out of the outcome before the treatment is tested
//   stepwise         noise covariates residualised out one at a time
//   bootstrap        a t-test on bootstrap means
//   autocorrelation  two autocorrelated series correlated as if their points were independent
//   two-step         an interaction tested only where one group's own test found an effect
//   pairing          paired measurements tested as two independent samples
//   enrichment       one-sided hypergeometric (Fisher) tests kept only for pathways with a hit
// The R scripts are basic_batch_correction_error.R, fisher-cor-pval_deflation.R,
// two-step_multiple-testing.R, test-1s-vs-2s.R and hypergeometric_bias.R in
// ~/repos/minor_scripts/postdoc/, and stepwise_regression_inflate_false_disc.R and
// bootstrap_ttest_demo.R in ~/repos/montgomery_lab/; api.md says what was corrected.

import { pnormUpper, standardNormal } from '../lib/normal.js';
import { checkChoice, checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { ptTwoSided, qtTwoSided } from '../lib/special.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {'batch' | 'stepwise' | 'bootstrap' | 'autocorrelation' | 'two-step' | 'pairing' | 'enrichment'} Scenario */
/** @typedef {'effective-df' | 'circular-shift' | 'newey-west'} Fix */
/**
 * @typedef {{ scenario: 'batch', alpha: number, perBatch: number, batches: number, treatedShare: number }} BatchParams
 * @typedef {{ scenario: 'stepwise', alpha: number, n: number, steps: number, finalDf: 'fitted' | 'rescaled', replicates: number, seed: number }} StepwiseParams
 * @typedef {{ scenario: 'bootstrap', alpha: number, n: number, resamples: number, replicates: number, seed: number }} BootstrapParams
 * @typedef {{ scenario: 'autocorrelation', alpha: number, n: number, phi: number, naive: 'pearson' | 'fisher', fix: Fix, replicates: number, seed: number }} AutocorrelationParams
 * @typedef {{ scenario: 'two-step', alpha: number, n: number, effect: number, features: number, q: number, seed: number }} TwoStepParams
 * @typedef {{ scenario: 'pairing', alpha: number, pairs: number, betweenSD: number, changeSD: number, noiseSD: number, meanChange: number, replicates: number, seed: number }} PairingParams
 * @typedef {{ scenario: 'enrichment', alpha: number, genes: number, de: number, minSize: number, maxSize: number, pathways: number, seed: number }} EnrichmentParams
 * @typedef {BatchParams | StepwiseParams | BootstrapParams | AutocorrelationParams | TwoStepParams | PairingParams | EnrichmentParams} Params
 */
/**
 * One analysis's p-values under the null.
 * @typedef {{ name: string, method: 'exact' | 'monte-carlo', count: number | null, rejections: number | null,
 *   rejectionRate: number | null, se: number | null, histogram: { edges: number[], density: number[] },
 *   curve: { threshold: number[], rate: number[] } }} Analysis
 */

export const ENTRY = 'null-pvalues';
export const SCENARIOS = /** @type {const} */ (['batch', 'stepwise', 'bootstrap', 'autocorrelation', 'two-step', 'pairing', 'enrichment']);
export const FIXES = /** @type {const} */ (['effective-df', 'circular-shift', 'newey-west']);
const BINS = 20;
/** The most work one request may ask for, in rough units of one random draw. */
export const MAX_WORK = 1e9;

/** Each scenario's defaults; Monte Carlo ones have replicates (features for two-step) and a seed. */
export const DEFAULTS = Object.freeze({
  batch: Object.freeze({ alpha: 0.05, perBatch: 10, batches: 2, treatedShare: 0.5 }),
  stepwise: Object.freeze({ alpha: 0.05, n: 100, steps: 50, finalDf: /** @type {'fitted' | 'rescaled'} */ ('fitted'), replicates: 2000, seed: 1 }),
  bootstrap: Object.freeze({ alpha: 0.05, n: 50, resamples: 1000, replicates: 500, seed: 1 }),
  autocorrelation: Object.freeze({ alpha: 0.05, n: 200, phi: 0.7, naive: /** @type {'pearson' | 'fisher'} */ ('pearson'), fix: /** @type {Fix} */ ('effective-df'), replicates: 2000, seed: 1 }),
  'two-step': Object.freeze({ alpha: 0.05, n: 100, effect: 0.1, features: 20000, q: 0.05, seed: 1 }),
  pairing: Object.freeze({ alpha: 0.05, pairs: 10, betweenSD: 2, changeSD: 0.5, noiseSD: 1, meanChange: 0, replicates: 10000, seed: 1 }),
  enrichment: Object.freeze({ alpha: 0.05, genes: 20000, de: 50, minSize: 5, maxSize: 50, pathways: 2000, seed: 1 }),
});

/** [kind, min, max] per numeric field; choices for the rest. */
const RANGES = {
  alpha: ['number', 0.0001, 0.5],
  replicates: ['integer', 100, 100000],
  seed: ['integer', 0, 4294967295],
  perBatch: ['integer', 4, 100],
  batches: ['integer', 2, 8],
  treatedShare: ['number', 0, 1],
  n: { stepwise: ['integer', 20, 500], bootstrap: ['integer', 5, 200], autocorrelation: ['integer', 20, 1000], 'two-step': ['integer', 30, 500] },
  steps: ['integer', 1, 200],
  resamples: ['integer', 10, 5000],
  phi: ['number', 0, 0.99],
  effect: ['number', 0, 1],
  features: ['integer', 100, 100000],
  q: ['number', 0.001, 0.5],
  pairs: ['integer', 3, 200],
  betweenSD: ['number', 0, 10],
  changeSD: ['number', 0, 10],
  noiseSD: ['number', 0.01, 10],
  meanChange: ['number', -5, 5],
  genes: ['integer', 100, 100000],
  de: ['integer', 1, 5000],
  minSize: ['integer', 1, 1000],
  maxSize: ['integer', 1, 1000],
  pathways: ['integer', 10, 20000],
};
const CHOICES = { finalDf: ['fitted', 'rescaled'], naive: ['pearson', 'fisher'], fix: FIXES };

// ---------- Parameters ----------

/**
 * Validates params and fills in defaults for the chosen scenario (default "batch").
 * Throws one IntuitionsError listing every problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const scenario = params.scenario ?? 'batch';
  if (typeof scenario !== 'string' || !SCENARIOS.includes(/** @type {Scenario} */ (scenario))) {
    throw invalidRequest([{ code: typeof scenario === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.scenario', message: `must be one of ${SCENARIOS.map((s) => `"${s}"`).join(', ')}` }]);
  }
  const s = /** @type {Scenario} */ (scenario);
  const defaults = /** @type {Record<string, any>} */ (DEFAULTS[s]);
  /** @type {Issue[]} */
  const issues = [];
  rejectUnknown(params, ['scenario', ...Object.keys(defaults)], 'params', issues);
  /** @type {Record<string, any>} */
  const out = { scenario: s };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!Object.hasOwn(params, key)) {
      out[key] = fallback;
      continue;
    }
    const path = `params.${key}`;
    if (Object.hasOwn(CHOICES, key)) {
      out[key] = checkChoice(params[key], path, CHOICES[/** @type {keyof typeof CHOICES} */ (key)], fallback, issues);
      continue;
    }
    const range = /** @type {any} */ (RANGES)[key];
    const [kind, min, max] = Array.isArray(range) ? range : range[s];
    out[key] = kind === 'integer' ? checkInteger(params[key], path, min, max, fallback, issues) : checkNumber(params[key], path, min, max, fallback, issues);
  }
  if (!issues.length) checkScenario(/** @type {Params} */ (out), issues);
  if (issues.length) throw invalidRequest(issues);
  return /** @type {Params} */ (out);
}

/**
 * Constraints between fields, and the work limit.
 * @param {Params} p @param {Issue[]} issues
 */
function checkScenario(p, issues) {
  let work = 0;
  if (p.scenario === 'batch' && batchDesign(p).r2 > 1 - 1e-12) {
    issues.push({ code: 'not_estimable', path: 'params.treatedShare', message: 'puts every sample of a batch in one arm, so treatment and batch cannot be told apart' });
  }
  if (p.scenario === 'stepwise') {
    if (p.steps > p.n - 3) issues.push({ code: 'out_of_range', path: 'params.steps', message: `is ${p.steps}; it must be at most n − 3 = ${p.n - 3}, which leaves the final test a degree of freedom` });
    work = p.replicates * p.n * (p.steps + 1);
  } else if (p.scenario === 'bootstrap') work = p.replicates * p.resamples * 2 * p.n;
  else if (p.scenario === 'autocorrelation') work = p.replicates * p.n * (p.fix === 'circular-shift' ? p.n : 8);
  else if (p.scenario === 'two-step') work = p.features * p.n * 6;
  else if (p.scenario === 'pairing') work = p.replicates * p.pairs * 4;
  else if (p.scenario === 'enrichment') {
    if (p.de >= p.genes) issues.push({ code: 'out_of_range', path: 'params.de', message: `is ${p.de}; it must be below the number of genes, ${p.genes}` });
    if (p.minSize > p.maxSize) issues.push({ code: 'out_of_range', path: 'params.minSize', message: `is ${p.minSize}; it must not exceed maxSize, ${p.maxSize}` });
    if (p.maxSize > p.genes) issues.push({ code: 'out_of_range', path: 'params.maxSize', message: `is ${p.maxSize}; it must not exceed the number of genes, ${p.genes}` });
    work = p.pathways * p.maxSize;
  }
  if (work > MAX_WORK) {
    issues.push({ code: 'too_much_work', path: p.scenario === 'two-step' ? 'params.features' : 'params.replicates', message: `asks for about ${work.toExponential(1)} draws; the most is ${MAX_WORK.toExponential(0)}: lower it or the sample sizes` });
  }
}

// ---------- Summaries of a p-value distribution ----------

const EDGES = Array.from({ length: BINS + 1 }, (_, i) => i / BINS);
/** Thresholds for an exact curve: 121 from 10⁻⁴ to 1, even in log. */
const THRESHOLDS = Array.from({ length: 121 }, (_, i) => 10 ** (-4 + i / 30));

/**
 * An analysis whose p-value has a known distribution function.
 * @param {string} name @param {(u: number) => number} cdf P(p ≤ u) @param {number} alpha
 * @returns {Analysis}
 */
function exactAnalysis(name, cdf, alpha) {
  const F = EDGES.map((e, i) => (i === 0 ? 0 : i === BINS ? 1 : cdf(e)));
  return {
    name,
    method: 'exact',
    count: null,
    rejections: null,
    rejectionRate: cdf(alpha),
    se: null,
    histogram: { edges: [...EDGES], density: F.slice(1).map((f, i) => (f - F[i]) * BINS) },
    curve: { threshold: [...THRESHOLDS], rate: THRESHOLDS.map(cdf) },
  };
}

/** The uniform, which a valid continuous test's p-value follows exactly. @param {string} name @param {number} alpha */
const uniformAnalysis = (name, alpha) => exactAnalysis(name, (u) => u, alpha);

/**
 * An analysis from simulated p-values. Bins are (a, b] (the first [0, 0.05]), so a
 * p-value at α counts as a rejection in the same bin it is drawn in.
 * @param {string} name @param {Float64Array} values @param {number} alpha
 * @returns {Analysis}
 */
function sampledAnalysis(name, values, alpha) {
  const sorted = Float64Array.from(values).sort();
  const m = sorted.length;
  const counts = new Array(BINS).fill(0);
  let rejections = 0;
  for (const p of sorted) {
    counts[Math.max(0, Math.min(BINS - 1, Math.ceil(p * BINS) - 1))] += 1;
    if (p <= alpha) rejections += 1;
  }
  // The empirical distribution function at every rank up to 20, then about 30 ranks a
  // decade, so the far tail and the bulk are both drawn.
  const ranks = [...new Set(Array.from({ length: 151 }, (_, i) => Math.round(10 ** ((i / 150) * Math.log10(Math.max(1, m))))).concat(Array.from({ length: Math.min(20, m) }, (_, i) => i + 1)))]
    .filter((r) => r >= 1 && r <= m).sort((a, b) => a - b);
  const rate = m ? rejections / m : null;
  return {
    name,
    method: 'monte-carlo',
    count: m,
    rejections,
    rejectionRate: rate,
    se: rate === null ? null : Math.sqrt((rate * (1 - rate)) / m),
    histogram: { edges: [...EDGES], density: counts.map((c) => (m ? (c / m) * BINS : 0)) },
    curve: { threshold: ranks.map((r) => sorted[r - 1]), rate: ranks.map((r) => r / m) },
  };
}

// ---------- Tests on data (exported for the R checks) ----------

/** Sample mean. @param {ArrayLike<number>} v */
function mean(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s / v.length;
}

/** Sample variance (n − 1). @param {ArrayLike<number>} v */
function variance(v) {
  const m = mean(v);
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i] - m) ** 2;
  return s / (v.length - 1);
}

/** Pearson's correlation. @param {ArrayLike<number>} x @param {ArrayLike<number>} y */
export function correlation(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** cor.test(x, y)$p.value: t = r √((n − 2)/(1 − r²)) on n − 2 df. @param {ArrayLike<number>} x @param {ArrayLike<number>} y */
export function pearsonTest(x, y) {
  const r = correlation(x, y);
  return ptTwoSided(r * Math.sqrt((x.length - 2) / (1 - r * r)), x.length - 2);
}

/** Fisher's z test of a correlation: atanh(r) √(n − 3) against the normal. @param {ArrayLike<number>} x @param {ArrayLike<number>} y */
export function fisherTest(x, y) {
  return 2 * pnormUpper(Math.abs(Math.atanh(correlation(x, y)) * Math.sqrt(x.length - 3)));
}

/** R's acf() at lags 1..K (demeaned, divided by n, over lag 0). @param {ArrayLike<number>} v @param {number} K */
function acf(v, K) {
  const m = mean(v);
  const n = v.length;
  /** @type {number[]} */
  const c = [];
  for (let k = 0; k <= K; k++) {
    let s = 0;
    for (let t = 0; t + k < n; t++) s += (v[t] - m) * (v[t + k] - m);
    c.push(s / n);
  }
  return c.slice(1).map((ck) => ck / c[0]);
}

/**
 * cor_test_effdf() of fisher-cor-pval_deflation.R: the t test of a correlation on an
 * effective sample size n / (1 + 2 Σₖ ρₓ(k) ρᵧ(k)), lags 1 to ⌊n^⅓⌋. The script's
 * t takes √(n_eff − 2), which is NaN below 2; here it takes the same floor of 1 as its df.
 * @param {ArrayLike<number>} x @param {ArrayLike<number>} y
 */
export function effectiveDfTest(x, y) {
  const n = x.length;
  const K = Math.floor(n ** (1 / 3));
  const ax = acf(x, K);
  const ay = acf(y, K);
  let denom = 1;
  for (let k = 0; k < K; k++) denom += 2 * ax[k] * ay[k];
  const neff = n / Math.max(denom, 1e-8);
  const r = correlation(x, y);
  const df = Math.max(neff - 2, 1);
  return { p: ptTwoSided(r * Math.sqrt(df / Math.max(1 - r * r, 1e-12)), df), neff };
}

/**
 * cor_test_tts() of fisher-cor-pval_deflation.R: the correlation of the middle 80% of
 * the series against the same for every circular shift of y, p = (1 + #|r_s| ≥ |r₀|)/n.
 * Every shift is used (the script samples 2,000 when n exceeds 2,001).
 * @param {ArrayLike<number>} x @param {ArrayLike<number>} y
 */
export function circularShiftTest(x, y) {
  const n = x.length;
  const m = Math.floor(0.1 * n);
  const len = n - 2 * m;
  const xs = Float64Array.from({ length: len }, (_, i) => x[m + i]);
  const mx = mean(xs);
  let sxx = 0;
  for (let i = 0; i < len; i++) {
    xs[i] -= mx;
    sxx += xs[i] * xs[i];
  }
  const shifted = (/** @type {number} */ s) => {
    let sy = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = 0; i < len; i++) {
      const v = y[(m + i + s) % n];
      sy += v;
      syy += v * v;
      sxy += xs[i] * v;
    }
    return sxy / Math.sqrt(sxx * (syy - (sy * sy) / len));
  };
  const r0 = Math.abs(shifted(0));
  let count = 0;
  for (let s = 1; s < n; s++) if (Math.abs(shifted(s)) >= r0) count += 1;
  return (1 + count) / n;
}

/** 2 × 2 inverse. @param {number[]} a [a11, a12, a21, a22] */
const inverse2 = ([a, b, c, d]) => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det];
};
/** 2 × 2 product. @param {number[]} p @param {number[]} q */
const times2 = ([a, b, c, d], [e, f, g, h]) => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];

/**
 * cor_test_hac() of fisher-cor-pval_deflation.R: the slope of lm(y ~ x) with
 * sandwich::NeweyWest(lag = ⌊4 (n/100)^(2/9)⌋, prewhite = TRUE, adjust = TRUE) and a t
 * test on n − 2 df, as lmtest::coeftest gives it. The estimating functions are
 * prewhitened by a VAR(1) fitted by least squares (ar.ols, no mean), Bartlett-weighted,
 * recoloured by (I − A)⁻¹, and scaled by n/(n − 2).
 * @param {ArrayLike<number>} x @param {ArrayLike<number>} y
 */
export function neweyWestTest(x, y) {
  const n = x.length;
  const lag = Math.floor(4 * (n / 100) ** (2 / 9));
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let sx2 = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    sx2 += x[i] * x[i];
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  const u0 = new Float64Array(n);
  const u1 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const e = y[i] - a - b * x[i];
    u0[i] = e;
    u1[i] = e * x[i];
  }
  // VAR(1): A = (Σ u_t u_{t−1}ᵀ)(Σ u_{t−1} u_{t−1}ᵀ)⁻¹.
  const lagged = [0, 0, 0, 0];
  const cross = [0, 0, 0, 0];
  for (let t = 1; t < n; t++) {
    lagged[0] += u0[t - 1] * u0[t - 1];
    lagged[1] += u0[t - 1] * u1[t - 1];
    lagged[3] += u1[t - 1] * u1[t - 1];
    cross[0] += u0[t] * u0[t - 1];
    cross[1] += u0[t] * u1[t - 1];
    cross[2] += u1[t] * u0[t - 1];
    cross[3] += u1[t] * u1[t - 1];
  }
  lagged[2] = lagged[1];
  const A = times2(cross, inverse2(lagged));
  const m = n - 1;
  const v0 = new Float64Array(m);
  const v1 = new Float64Array(m);
  for (let t = 1; t < n; t++) {
    v0[t - 1] = u0[t] - A[0] * u0[t - 1] - A[1] * u1[t - 1];
    v1[t - 1] = u1[t] - A[2] * u0[t - 1] - A[3] * u1[t - 1];
  }
  // Σⱼ wⱼ (Γⱼ + Γⱼᵀ) with Bartlett weights wⱼ = 1 − j/(lag + 1), Γ₀ counted once.
  const S = [0, 0, 0, 0];
  for (let j = 0; j <= lag; j++) {
    const w = 1 - j / (lag + 1);
    const g = [0, 0, 0, 0];
    for (let t = 0; t + j < m; t++) {
      g[0] += v0[t] * v0[t + j];
      g[1] += v0[t] * v1[t + j];
      g[2] += v1[t] * v0[t + j];
      g[3] += v1[t] * v1[t + j];
    }
    const sym = j === 0 ? g : [2 * g[0], g[1] + g[2], g[1] + g[2], 2 * g[3]];
    for (let i = 0; i < 4; i++) S[i] += w * sym[i];
  }
  const D = inverse2([1 - A[0], -A[1], -A[2], 1 - A[3]]);
  const Dt = [D[0], D[2], D[1], D[3]];
  const meat = times2(times2(D, S.map((s) => (s * n) / (n - 2))), Dt);
  const bread = inverse2([n, n * mx, n * mx, sx2]);
  const V = times2(times2(bread, meat), bread);
  return ptTwoSided(b / Math.sqrt(V[3]), n - 2);
}

/** t.test(a, b)$p.value: Welch's two-sample test. @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
export function welchTest(a, b) {
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  const se2 = va + vb;
  const df = (se2 * se2) / ((va * va) / (a.length - 1) + (vb * vb) / (b.length - 1));
  return ptTwoSided((mean(a) - mean(b)) / Math.sqrt(se2), df);
}

/** t.test(d)$p.value: the one-sample t test of mean 0. @param {ArrayLike<number>} d */
export function oneSampleTest(d) {
  return ptTwoSided(mean(d) / Math.sqrt(variance(d) / d.length), d.length - 1);
}

/**
 * p.adjust(p, "BH"): Benjamini–Hochberg adjusted p-values.
 * @param {ArrayLike<number>} p
 * @returns {Float64Array}
 */
export function bhAdjust(p) {
  const m = p.length;
  const order = Array.from({ length: m }, (_, i) => i).sort((i, j) => p[j] - p[i]);
  const out = new Float64Array(m);
  let running = Infinity;
  order.forEach((index, k) => {
    running = Math.min(running, (m / (m - k)) * p[index]);
    out[index] = Math.min(1, running);
  });
  return out;
}

/** How many BH-adjusted values fall below a level. @param {ArrayLike<number>} p @param {number} level */
const discoveries = (p, level) => bhAdjust(p).reduce((sum, q) => sum + (q < level ? 1 : 0), 0);

// ---------- batch: regressing the batch out before the test ----------

/**
 * The design of the batch scenario: `batches` batches of `perBatch` samples, with
 * round(perBatch × treatedShare) treated in odd-numbered batches and
 * round(perBatch × (1 − treatedShare)) in even ones; R² of the treatment on the batches.
 * @param {{ perBatch: number, batches: number, treatedShare: number }} p
 */
export function batchDesign({ perBatch, batches, treatedShare }) {
  const treated = Array.from({ length: batches }, (_, j) => Math.round(perBatch * (j % 2 === 0 ? treatedShare : 1 - treatedShare)));
  const n = perBatch * batches;
  const total = treated.reduce((a, b) => a + b, 0);
  const share = total / n;
  const ss = total * (1 - share);
  const between = treated.reduce((sum, t) => sum + perBatch * (t / perBatch - share) ** 2, 0);
  return { n, treated, r2: ss > 0 ? between / ss : 1 };
}

/** @param {BatchParams} p */
function batch(p) {
  const { n, treated, r2 } = batchDesign(p);
  // Regressing y on the batches and the treatment, then refitting y minus the batch
  // effects on the treatment alone, gives the same coefficient and residuals, but the
  // refit forgets the batch's degrees of freedom and its share of the treatment's
  // variance: its t is the model's times √((n − 2)/(n − k − 1)) / √(1 − R²).
  const dfModel = n - p.batches - 1;
  const dfShortcut = n - 2;
  const ratio = Math.sqrt(dfShortcut / dfModel / (1 - r2));
  return {
    scenario: 'batch',
    alpha: p.alpha,
    simulation: null,
    n,
    treated,
    r2,
    df: { model: dfModel, shortcut: dfShortcut },
    tRatio: ratio,
    shortcut: exactAnalysis('Batch regressed out first', (u) => ptTwoSided(qtTwoSided(u, dfShortcut) / ratio, dfModel), p.alpha),
    sound: uniformAnalysis('Batch in the model', p.alpha),
  };
}

// ---------- stepwise: residualising covariates one at a time ----------

/** A genotype, 0, 1 or 2 copies at frequency ½. @param {() => number} rng */
const genotype = (rng) => (rng() < 0.5 ? 1 : 0) + (rng() < 0.5 ? 1 : 0);

/** @param {StepwiseParams} p */
function stepwise(p) {
  const { n, steps, replicates } = p;
  const rng = mulberry32(p.seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  const zt = new Float64Array(n);
  const pvalues = new Float64Array(replicates);
  const rescale = p.finalDf === 'rescaled';
  const df = rescale ? n - 2 - steps : n - 2;
  for (let r = 0; r < replicates; r++) {
    let sxx = 0;
    while (sxx === 0) {
      for (let i = 0; i < n; i++) x[i] = genotype(rng);
      const mx = mean(x);
      sxx = 0;
      for (let i = 0; i < n; i++) {
        x[i] -= mx;
        sxx += x[i] * x[i];
      }
    }
    for (let i = 0; i < n; i++) y[i] = 2 * standardNormal(rng);
    for (let step = 0; step < steps; step++) {
      // y minus the noise's coefficient in lm(y ~ 1 + noise + x) times the noise; by
      // Frisch–Waugh that coefficient is the noise, residualised on (1, x), against y.
      for (let i = 0; i < n; i++) z[i] = genotype(rng);
      const mz = mean(z);
      let szx = 0;
      for (let i = 0; i < n; i++) szx += (z[i] - mz) * x[i];
      const bz = szx / sxx;
      let szz = 0;
      let szy = 0;
      for (let i = 0; i < n; i++) {
        zt[i] = z[i] - mz - bz * x[i];
        szz += zt[i] * zt[i];
        szy += zt[i] * y[i];
      }
      if (szz > 0) {
        const g = szy / szz;
        for (let i = 0; i < n; i++) y[i] -= g * z[i];
      }
    }
    const my = mean(y);
    let sxy = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += x[i] * y[i];
      syy += (y[i] - my) ** 2;
    }
    const b = sxy / sxx;
    const s2 = (syy - b * sxy) / (n - 2);
    const t = b / Math.sqrt(s2 / sxx);
    pvalues[r] = ptTwoSided(rescale ? t * Math.sqrt(df / (n - 2)) : t, df);
  }
  return {
    scenario: 'stepwise',
    alpha: p.alpha,
    simulation: { replicates, seed: p.seed },
    df: { final: df, joint: n - 2 - steps },
    shortcut: sampledAnalysis(rescale ? 'One at a time, σ on n − 2 − k df' : 'One at a time, as fitted', pvalues, p.alpha),
    sound: uniformAnalysis('All covariates in one model', p.alpha),
  };
}

// ---------- bootstrap: a t-test on bootstrap means ----------

/** @param {BootstrapParams} p */
function bootstrap(p) {
  const { n, resamples: B, replicates } = p;
  const rng = mulberry32(p.seed);
  const x1 = new Float64Array(n);
  const x2 = new Float64Array(n);
  const m1 = new Float64Array(B);
  const m2 = new Float64Array(B);
  const shortcut = new Float64Array(replicates);
  const sound = new Float64Array(replicates);
  for (let r = 0; r < replicates; r++) {
    for (let i = 0; i < n; i++) x1[i] = standardNormal(rng);
    for (let i = 0; i < n; i++) x2[i] = standardNormal(rng);
    for (let b = 0; b < B; b++) {
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < n; i++) s1 += x1[Math.floor(rng() * n)];
      for (let i = 0; i < n; i++) s2 += x2[Math.floor(rng() * n)];
      m1[b] = s1 / n;
      m2[b] = s2 / n;
    }
    shortcut[r] = welchTest(m1, m2);
    // The share of bootstrap differences m1 − m2 above 0, over all B² pairings (the
    // script draws 5,000 of them), by a merge of the two sorted sets of means.
    m1.sort();
    m2.sort();
    let above = 0;
    let j = 0;
    for (let i = 0; i < B; i++) {
      while (j < B && m2[j] < m1[i]) j += 1;
      above += j;
    }
    sound[r] = 1 - Math.abs(1 - (2 * above) / (B * B));
  }
  return {
    scenario: 'bootstrap',
    alpha: p.alpha,
    simulation: { replicates, seed: p.seed },
    shortcut: sampledAnalysis('t-test on the bootstrap means', shortcut, p.alpha),
    sound: sampledAnalysis('Bootstrap distribution of the difference', sound, p.alpha),
  };
}

// ---------- autocorrelation: correlating two autocorrelated series ----------

/** A stationary AR(1) series with unit variance. @param {() => number} rng @param {Float64Array} out @param {number} phi */
function ar1(rng, out, phi) {
  const s = Math.sqrt(1 - phi * phi);
  out[0] = standardNormal(rng);
  for (let t = 1; t < out.length; t++) out[t] = phi * out[t - 1] + s * standardNormal(rng);
}

const FIX_TESTS = {
  'effective-df': { name: 'Effective degrees of freedom', test: (/** @type {Float64Array} */ x, /** @type {Float64Array} */ y) => effectiveDfTest(x, y).p },
  'circular-shift': { name: 'Circular shifts of one series', test: circularShiftTest },
  'newey-west': { name: 'Newey–West standard error', test: neweyWestTest },
};

/** @param {AutocorrelationParams} p */
function autocorrelation(p) {
  const { n, phi, replicates } = p;
  const rng = mulberry32(p.seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const naive = new Float64Array(replicates);
  const fixed = new Float64Array(replicates);
  const naiveTest = p.naive === 'pearson' ? pearsonTest : fisherTest;
  const fix = FIX_TESTS[p.fix];
  for (let r = 0; r < replicates; r++) {
    ar1(rng, x, phi);
    ar1(rng, y, phi);
    naive[r] = naiveTest(x, y);
    fixed[r] = fix.test(x, y);
  }
  // Var(r) ≈ (1 + φ²) / (n (1 − φ²)) for two independent AR(1) series, against 1/n.
  return {
    scenario: 'autocorrelation',
    alpha: p.alpha,
    simulation: { replicates, seed: p.seed },
    varianceInflation: (1 + phi * phi) / (1 - phi * phi),
    shortcut: sampledAnalysis(p.naive === 'pearson' ? "Pearson's t test" : "Fisher's z test", naive, p.alpha),
    sound: sampledAnalysis(fix.name, fixed, p.alpha),
  };
}

// ---------- two-step: an interaction tested where one group found an effect ----------

/** One group's centred sums and slope. @param {ArrayLike<number>} x @param {ArrayLike<number>} y */
function groupFit(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { n: x.length, sxx, sxy, syy, slope, rss: syy - slope * sxy };
}

/**
 * The two-step script's tests of one variant in groups A and B: lm(y ~ x) in each group,
 * the main effect of lm(y ~ x + f) (one slope, two intercepts) and the x:f interaction
 * of lm(y ~ x * f), which is the difference of the groups' slopes over the pooled
 * residual variance.
 * @param {ArrayLike<number>} xa @param {ArrayLike<number>} ya @param {ArrayLike<number>} xb @param {ArrayLike<number>} yb
 */
export function twoStepTests(xa, ya, xb, yb) {
  const a = groupFit(xa, ya);
  const b = groupFit(xb, yb);
  const N = a.n + b.n;
  const own = (/** @type {ReturnType<typeof groupFit>} */ g) => ptTwoSided(g.slope / Math.sqrt(g.rss / (g.n - 2) / g.sxx), g.n - 2);
  const pooled = (a.sxy + b.sxy) / (a.sxx + b.sxx);
  const rssPooled = a.syy + b.syy - pooled * (a.sxy + b.sxy);
  const s2 = (a.rss + b.rss) / (N - 4);
  return {
    a: own(a),
    b: own(b),
    pooled: ptTwoSided(pooled / Math.sqrt(rssPooled / (N - 3) / (a.sxx + b.sxx)), N - 3),
    interaction: ptTwoSided((b.slope - a.slope) / Math.sqrt(s2 * (1 / a.sxx + 1 / b.sxx)), N - 4),
  };
}

/** @param {TwoStepParams} p */
function twoStep(p) {
  const { n, effect, features } = p;
  const rng = mulberry32(p.seed);
  const xa = new Float64Array(n);
  const ya = new Float64Array(n);
  const xb = new Float64Array(n);
  const yb = new Float64Array(n);
  const pA = new Float64Array(features);
  const pB = new Float64Array(features);
  const pPooled = new Float64Array(features);
  const pInteraction = new Float64Array(features);
  /** One group: genotypes scaled to SD 1 (not centred), y = effect·x + noise. @param {Float64Array} x @param {Float64Array} y */
  const draw = (x, y) => {
    for (let i = 0; i < n; i++) x[i] = genotype(rng);
    const sd = Math.sqrt(variance(x));
    for (let i = 0; i < n; i++) {
      x[i] /= sd;
      y[i] = effect * x[i] + standardNormal(rng);
    }
  };
  for (let f = 0; f < features; f++) {
    draw(xa, ya);
    draw(xb, yb);
    const t = twoStepTests(xa, ya, xb, yb);
    pA[f] = t.a;
    pB[f] = t.b;
    pPooled[f] = t.pooled;
    pInteraction[f] = t.interaction;
  }
  const qA = bhAdjust(pA);
  const qB = bhAdjust(pB);
  const qPooled = bhAdjust(pPooled);
  const byEither = pInteraction.filter((_, f) => qA[f] < p.q || qB[f] < p.q);
  const byPooled = pInteraction.filter((_, f) => qPooled[f] < p.q);
  return {
    scenario: 'two-step',
    alpha: p.alpha,
    simulation: { features, seed: p.seed },
    selected: { shortcut: byEither.length, sound: byPooled.length },
    discoveries: { shortcut: discoveries(byEither, p.alpha), sound: discoveries(byPooled, p.alpha) },
    shortcut: sampledAnalysis("Kept by either group's own test", byEither, p.alpha),
    sound: sampledAnalysis('Kept by the pooled effect', byPooled, p.alpha),
  };
}

// ---------- pairing: paired data tested as two independent samples ----------

/** @param {PairingParams} p */
function pairing(p) {
  const { pairs, betweenSD, changeSD, noiseSD, meanChange, replicates } = p;
  const rng = mulberry32(p.seed);
  const before = new Float64Array(pairs);
  const after = new Float64Array(pairs);
  const change = new Float64Array(pairs);
  const unpaired = new Float64Array(replicates);
  const paired = new Float64Array(replicates);
  let both = 0;
  for (let r = 0; r < replicates; r++) {
    for (let i = 0; i < pairs; i++) {
      const level = betweenSD * standardNormal(rng);
      const delta = meanChange + changeSD * standardNormal(rng);
      before[i] = level + noiseSD * standardNormal(rng);
      after[i] = level + delta + noiseSD * standardNormal(rng);
      change[i] = after[i] - before[i];
    }
    unpaired[r] = welchTest(before, after);
    paired[r] = oneSampleTest(change);
    if (unpaired[r] <= p.alpha && paired[r] <= p.alpha) both += 1;
  }
  const vb = betweenSD ** 2 + noiseSD ** 2;
  const va = betweenSD ** 2 + changeSD ** 2 + noiseSD ** 2;
  return {
    scenario: 'pairing',
    alpha: p.alpha,
    simulation: { replicates, seed: p.seed },
    correlation: betweenSD ** 2 / Math.sqrt(vb * va),
    bothReject: both / replicates,
    shortcut: sampledAnalysis('Two-sample (Welch) t-test', unpaired, p.alpha),
    sound: sampledAnalysis('Paired t-test', paired, p.alpha),
  };
}

// ---------- enrichment: hypergeometric tests kept only where a pathway has a hit ----------

/**
 * The hypergeometric distribution of the overlap X of a pathway of `size` distinct
 * genes with `de` of `genes`: pmf[x] and the upper tail P(X ≥ x), the one-sided
 * Fisher p-value, for x = 0 … min(size, de). The pmf is built by its ratio recurrence
 * from the mode and normalised, so it is exact to rounding.
 * @param {number} genes @param {number} de @param {number} size
 */
export function hypergeometric(genes, de, size) {
  const lo = Math.max(0, size - (genes - de));
  const hi = Math.min(size, de);
  const pmf = new Float64Array(hi + 1);
  const mode = Math.min(hi, Math.max(lo, Math.floor(((size + 1) * (de + 1)) / (genes + 2))));
  pmf[mode] = 1;
  const ratio = (/** @type {number} */ k) => ((de - k) * (size - k)) / ((k + 1) * (genes - de - size + k + 1)); // P(k + 1)/P(k)
  for (let k = mode; k < hi; k++) pmf[k + 1] = pmf[k] * ratio(k);
  for (let k = mode; k > lo; k--) pmf[k - 1] = pmf[k] / ratio(k - 1);
  const total = pmf.reduce((a, b) => a + b, 0);
  for (let k = lo; k <= hi; k++) pmf[k] /= total;
  const tail = new Float64Array(hi + 1);
  let sum = 0;
  for (let k = hi; k >= lo; k--) {
    sum += pmf[k];
    tail[k] = k === lo ? 1 : sum;
  }
  for (let k = 0; k < lo; k++) tail[k] = 1;
  return { pmf, tail };
}

/**
 * The distribution function of a discrete p-value given its atoms (p, weight).
 * @param {{ p: number, w: number }[]} atoms weights summing to 1
 */
function discreteCdf(atoms) {
  return (/** @type {number} */ u) => Math.min(1, atoms.reduce((sum, a) => sum + (a.p <= u ? a.w : 0), 0));
}

/** @param {EnrichmentParams} p */
function enrichment(p) {
  const { genes, de, minSize, maxSize } = p;
  const sizes = maxSize - minSize + 1;
  const tables = Array.from({ length: sizes }, (_, i) => hypergeometric(genes, de, minSize + i));
  /** @type {{ p: number, w: number }[]} */
  const all = [];
  tables.forEach(({ pmf, tail }) => pmf.forEach((w, k) => { if (w > 0) all.push({ p: tail[k], w: w / sizes }); }));
  /** @type {{ p: number, w: number }[]} */
  const nonEmptyAtoms = [];
  let hit = 0;
  for (const { pmf, tail } of tables) {
    for (let k = 1; k < pmf.length; k++) {
      if (pmf[k] > 0) {
        nonEmptyAtoms.push({ p: tail[k], w: pmf[k] / sizes });
        hit += pmf[k] / sizes;
      }
    }
  }
  const nonEmpty = discreteCdf(nonEmptyAtoms.map((a) => ({ p: a.p, w: a.w / hit })));
  const everything = discreteCdf(all);

  // One seeded draw of the script's experiment: a DE set, then `pathways` pathways of
  // uniformly drawn sizes, each a set of distinct genes, and BH across them.
  const rng = mulberry32(p.seed);
  const pool = Int32Array.from({ length: genes }, (_, i) => i);
  const isDE = new Uint8Array(genes);
  for (let i = 0; i < de; i++) {
    const j = i + Math.floor(rng() * (genes - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    isDE[pool[i]] = 1;
  }
  const sampleAll = new Float64Array(p.pathways);
  const sampleHits = [];
  for (let k = 0; k < p.pathways; k++) {
    const size = minSize + Math.floor(rng() * sizes);
    // Floyd's algorithm: `size` distinct genes.
    const chosen = new Set();
    for (let j = genes - size; j < genes; j++) {
      const t = Math.floor(rng() * (j + 1));
      chosen.add(chosen.has(t) ? j : t);
    }
    let overlap = 0;
    for (const g of chosen) overlap += isDE[g];
    sampleAll[k] = tables[size - minSize].tail[overlap];
    if (overlap > 0) sampleHits.push(sampleAll[k]);
  }
  return {
    scenario: 'enrichment',
    alpha: p.alpha,
    simulation: null,
    nonEmptyShare: hit,
    sample: {
      pathways: p.pathways,
      seed: p.seed,
      nonEmpty: sampleHits.length,
      rejections: { shortcut: sampleHits.filter((v) => v <= p.alpha).length, sound: sampleAll.filter((v) => v <= p.alpha).length },
      discoveries: { shortcut: discoveries(sampleHits, p.alpha), sound: discoveries(sampleAll, p.alpha) },
    },
    shortcut: exactAnalysis('Pathways with at least one hit', nonEmpty, p.alpha),
    sound: exactAnalysis('All pathways', everything, p.alpha),
  };
}

// ---------- Entry point ----------

const RUN = { batch, stepwise, bootstrap, autocorrelation, 'two-step': twoStep, pairing, enrichment };

/**
 * The entry's computation. Same params, same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  return RUN[p.scenario](/** @type {any} */ (p));
}
