// The threshold (liability) model: an ordered discrete trait arises when a hidden
// normal liability with SD 1 is cut at thresholds. With two traits the liabilities
// are bivariate normal with correlation rho, and the thresholds cut the plane into
// the cells of a contingency table. In reverse, a table gives back the thresholds
// (from its margins) and rho (the polychoric correlation, by maximum likelihood).
// Cell probabilities are exact bivariate-normal rectangles, not grid sums.

import { bvnRectangle, dbvnorm } from '../lib/bvn.js';
import { pnormInterval, qnorm, standardNormal } from '../lib/normal.js';
import { checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {{ n: number, seed: number }} SampleSpec */
/**
 * @typedef {{ means: number[], thresholds: number[][], rho?: number, sample?: SampleSpec | null }} ModelParams
 * @typedef {{ table: number[][] }} TableParams
 */

export const ENTRY = 'threshold-model';

export const LIMITS = Object.freeze({
  mean: 3,
  threshold: 4,
  maxThresholds: 5,
  maxSample: 100_000,
  tableSize: [2, 8],
  minGap: 0.01,
});

/** @type {Readonly<{ means: readonly number[], thresholds: readonly (readonly number[])[], rho: number, sample: null }>} */
export const DEFAULTS = Object.freeze({
  means: Object.freeze([0.75, 0.85]),
  thresholds: Object.freeze([Object.freeze([0, 1, 2]), Object.freeze([0, 0.8, 1.9])]),
  rho: 0.4,
  sample: null,
});

const MODEL_FIELDS = ['means', 'thresholds', 'rho', 'sample'];
const FIELDS = [...MODEL_FIELDS, 'table'];

/**
 * Validates params and fills in defaults. Give either the model (means, thresholds,
 * rho, sample) or a table, not both.
 * @param {unknown} params
 * @returns {ModelParams | TableParams}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  /** @type {Issue[]} */
  const issues = [];
  rejectUnknown(params, FIELDS, 'params', issues);
  const has = (/** @type {string} */ key) => Object.hasOwn(params, key);

  if (has('table')) {
    const modelKeys = MODEL_FIELDS.filter(has);
    if (modelKeys.length) {
      issues.push({ code: 'conflicting_fields', path: 'params', message: `give either a table or a model (${modelKeys.join(', ')}), not both` });
    }
    const table = checkTable(params.table, 'params.table', issues);
    if (issues.length) throw invalidRequest(issues);
    return { table };
  }

  let means = [...DEFAULTS.means];
  if (has('means')) {
    const value = params.means;
    if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
      issues.push({ code: 'wrong_type', path: 'params.means', message: 'must be an array of one or two numbers, one latent mean per trait' });
    } else {
      means = value.map((m, i) => checkNumber(m, `params.means[${i}]`, -LIMITS.mean, LIMITS.mean, 0, issues));
    }
  }
  const traits = means.length;

  let thresholds = DEFAULTS.thresholds.slice(0, traits).map((t) => [...t]);
  if (has('thresholds')) {
    const value = params.thresholds;
    if (!Array.isArray(value) || value.length !== traits) {
      issues.push({ code: 'wrong_type', path: 'params.thresholds', message: `must be an array with one array of thresholds per trait (${traits} here, matching means)` });
    } else {
      thresholds = value.map((t, i) => checkThresholds(t, `params.thresholds[${i}]`, issues));
    }
  }

  /** @type {ModelParams} */
  const resolved = { means, thresholds };
  if (traits === 2) {
    resolved.rho = has('rho') ? checkNumber(params.rho, 'params.rho', -1, 1, DEFAULTS.rho, issues) : DEFAULTS.rho;
    resolved.sample = has('sample') ? checkSample(params.sample, issues) : DEFAULTS.sample;
  } else {
    for (const key of ['rho', 'sample']) {
      if (has(key)) issues.push({ code: 'not_applicable', path: `params.${key}`, message: 'applies only to two traits; give two means' });
    }
  }
  if (issues.length) throw invalidRequest(issues);
  return resolved;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Issue[]} issues
 */
function checkThresholds(value, path, issues) {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.maxThresholds) {
    issues.push({ code: 'wrong_type', path, message: `must be an array of 1 to ${LIMITS.maxThresholds} increasing numbers` });
    return [0];
  }
  const t = value.map((x, j) => checkNumber(x, `${path}[${j}]`, -LIMITS.threshold, LIMITS.threshold, 0, issues));
  for (let j = 1; j < t.length; j++) {
    if (!(t[j] - t[j - 1] >= LIMITS.minGap - 1e-12)) {
      issues.push({ code: 'out_of_range', path: `${path}[${j}]`, message: `must exceed the threshold before it by at least ${LIMITS.minGap}` });
    }
  }
  return t;
}

/**
 * @param {unknown} value
 * @param {Issue[]} issues
 * @returns {SampleSpec | null}
 */
function checkSample(value, issues) {
  if (value === null) return null;
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path: 'params.sample', message: 'must be null or an object {n, seed}' });
    return null;
  }
  rejectUnknown(value, ['n', 'seed'], 'params.sample', issues);
  const n = Object.hasOwn(value, 'n')
    ? checkInteger(value.n, 'params.sample.n', 1, LIMITS.maxSample, 1, issues)
    : (issues.push({ code: 'missing_field', path: 'params.sample.n', message: 'is missing; give the number of individuals to draw' }), 1);
  const seed = Object.hasOwn(value, 'seed') ? checkInteger(value.seed, 'params.sample.seed', 0, 4294967295, 1, issues) : 1;
  return { n, seed };
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Issue[]} issues
 */
function checkTable(value, path, issues) {
  const [min, max] = LIMITS.tableSize;
  const before = issues.length;
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every(Array.isArray)) {
    issues.push({ code: 'wrong_type', path, message: `must be an array of ${min} to ${max} rows, each an array of counts` });
    return [];
  }
  const width = value[0].length;
  if (width < min || width > max) {
    issues.push({ code: 'wrong_type', path: `${path}[0]`, message: `must have ${min} to ${max} counts` });
    return [];
  }
  const table = value.map((row, i) => {
    if (row.length !== width) {
      issues.push({ code: 'wrong_type', path: `${path}[${i}]`, message: `has ${row.length} counts but row 0 has ${width}` });
    }
    return row.map((/** @type {unknown} */ x, j) => {
      if (!Number.isInteger(x) || Number(x) < 0) {
        issues.push({ code: Number.isInteger(x) ? 'out_of_range' : 'wrong_type', path: `${path}[${i}][${j}]`, message: 'must be a count: an integer of 0 or more' });
        return 0;
      }
      return Number(x);
    });
  });
  if (issues.length > before) return table;
  table.forEach((row, i) => {
    if (row.every((x) => x === 0)) issues.push({ code: 'empty_category', path: `${path}[${i}]`, message: 'row has no observations; remove or merge that category' });
  });
  for (let j = 0; j < width; j++) {
    if (table.every((row) => row[j] === 0)) issues.push({ code: 'empty_category', path: `${path}[*][${j}]`, message: `column ${j} has no observations; remove or merge that category` });
  }
  return table;
}

/**
 * Bounds of each category: (-∞, t1], (t1, t2], …, (tk, ∞).
 * @param {number[]} thresholds
 * @returns {[number, number][]}
 */
function categoryBounds(thresholds) {
  const edges = [-Infinity, ...thresholds, Infinity];
  return edges.slice(0, -1).map((lower, i) => [lower, edges[i + 1]]);
}

/** Infinite bounds become null in JSON results. @param {number} x */
const bound = (x) => (Number.isFinite(x) ? x : null);

/**
 * Cell probabilities for standardised liabilities (mean 0, SD 1) cut at the given
 * thresholds, rows by trait 1.
 * @param {number[]} rowThresholds
 * @param {number[]} columnThresholds
 * @param {number} rho
 */
export function cellProbabilities(rowThresholds, columnThresholds, rho) {
  const rows = categoryBounds(rowThresholds);
  const columns = categoryBounds(columnThresholds);
  return rows.map(([a1, b1]) => columns.map(([a2, b2]) => Math.max(0, bvnRectangle([a1, a2], [b1, b2], rho))));
}

/**
 * Pearson correlation of the category codes 0, 1, 2, … under cell weights (counts or
 * probabilities); null when either trait has no spread.
 * @param {number[][]} cells
 */
export function codeCorrelation(cells) {
  let total = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  cells.forEach((row, i) => row.forEach((w, j) => {
    total += w;
    sx += w * i;
    sy += w * j;
    sxx += w * i * i;
    syy += w * j * j;
    sxy += w * i * j;
  }));
  const vx = sxx / total - (sx / total) ** 2;
  const vy = syy / total - (sy / total) ** 2;
  if (!(vx > 1e-15) || !(vy > 1e-15)) return null;
  return (sxy / total - (sx / total) * (sy / total)) / Math.sqrt(vx * vy);
}

/**
 * The cos-π shortcut for a 2×2 table, cos(π / (1 + √(AD / BC))), as in rtet() of the
 * original R. It equals the latent correlation only when both traits are split at
 * their medians; null for larger tables or when it is undefined.
 * @param {number[][]} cells
 */
export function cosPiApproximation(cells) {
  if (cells.length !== 2 || cells[0].length !== 2) return null;
  const [[a, b], [c, d]] = cells;
  const odds = (a * d) / (b * c);
  if (Number.isNaN(odds)) return null;
  return Math.cos(Math.PI / (1 + Math.sqrt(odds)));
}

/**
 * Probability of each cell and its first and second derivatives in rho. The
 * derivative of a rectangle probability in rho is the signed sum of the density
 * at its four corners.
 * @param {[number, number][]} rows
 * @param {[number, number][]} columns
 * @param {number} rho
 */
function cellTerms(rows, columns, rho) {
  const s = 1 - rho * rho;
  /** density and its rho-derivative at one corner */
  const corner = (/** @type {number} */ h, /** @type {number} */ k) => {
    const f = dbvnorm(h, k, rho);
    if (f === 0) return [0, 0];
    const q = h * h - 2 * rho * h * k + k * k;
    return [f, f * (rho / s + (h * k * s - rho * q) / (s * s))];
  };
  return rows.map(([a1, b1]) => columns.map(([a2, b2]) => {
    const p = Math.max(0, bvnRectangle([a1, a2], [b1, b2], rho));
    const [f11, g11] = corner(b1, b2);
    const [f01, g01] = corner(a1, b2);
    const [f10, g10] = corner(b1, a2);
    const [f00, g00] = corner(a1, a2);
    return { p, d1: f11 - f01 - f10 + f00, d2: g11 - g01 - g10 + g00 };
  }));
}

/**
 * Two-step polychoric fit (Olsson 1979; polycor's default): thresholds from the
 * cumulative margins, then the rho that maximises the multinomial likelihood with the
 * thresholds held fixed. The SE is from the observed information in rho alone, as in
 * polycor's two-step standard error, so it ignores uncertainty in the thresholds.
 * @param {number[][]} table rows by trait 1, columns by trait 2; no empty row or column
 */
export function fitTable(table) {
  const n = table.flat().reduce((sum, x) => sum + x, 0);
  const rowTotals = table.map((row) => row.reduce((sum, x) => sum + x, 0));
  const columnTotals = table[0].map((_, j) => table.reduce((sum, row) => sum + row[j], 0));
  const cutsFrom = (/** @type {number[]} */ totals) => {
    let cumulative = 0;
    return totals.slice(0, -1).map((x) => qnorm((cumulative += x) / n));
  };
  const thresholds = [cutsFrom(rowTotals), cutsFrom(columnTotals)];
  const rows = categoryBounds(thresholds[0]);
  const columns = categoryBounds(thresholds[1]);

  /** log-likelihood, score and its derivative at rho */
  const evaluate = (/** @type {number} */ rho) => {
    let logLik = 0;
    let score = 0;
    let curvature = 0;
    cellTerms(rows, columns, rho).forEach((row, i) => row.forEach(({ p, d1, d2 }, j) => {
      const count = table[i][j];
      if (count === 0) return;
      logLik += count * Math.log(p);
      score += (count * d1) / p;
      curvature += count * (d2 / p - (d1 / p) ** 2);
    }));
    return { logLik, score, curvature };
  };

  // The score falls from + to − across (−1, 1) at the maximum; bracket it, then
  // bisect with Newton steps. A score of one sign throughout puts rho on the boundary.
  const edge = 1 - 1e-9;
  let rho;
  if (evaluate(edge).score > 0) rho = 1;
  else if (evaluate(-edge).score < 0) rho = -1;
  else {
    let lo = -edge;
    let hi = edge;
    rho = 0;
    for (let iteration = 0; iteration < 200 && hi - lo > 1e-14; iteration++) {
      const { score, curvature } = evaluate(rho);
      if (Math.abs(score) < 1e-12 * n) break;
      if (score > 0) lo = rho;
      else hi = rho;
      /** @type {number} */
      const newton = rho - score / curvature;
      rho = curvature < 0 && newton > lo && newton < hi ? newton : (lo + hi) / 2;
    }
  }

  const atBoundary = Math.abs(rho) === 1;
  const at = evaluate(atBoundary ? Math.sign(rho) * edge : rho);
  const probabilities = cellProbabilities(thresholds[0], thresholds[1], rho);
  return {
    n,
    thresholds,
    rho,
    se: atBoundary || !(at.curvature < 0) ? null : 1 / Math.sqrt(-at.curvature),
    atBoundary,
    logLikelihood: table.reduce((sum, row, i) => sum + row.reduce((s, x, j) => (x ? s + x * Math.log(probabilities[i][j]) : s), 0), 0),
    expected: probabilities.map((row) => row.map((p) => p * n)),
    codeCorrelation: codeCorrelation(table),
    cosPiApproximation: cosPiApproximation(table),
  };
}

/**
 * Latent liabilities of n individuals: inversion of seeded uniforms, two per person,
 * so the same seed gives the same people under any means and rho.
 * @param {number[]} means
 * @param {number} rho
 * @param {SampleSpec} sample
 * @returns {[number, number][]}
 */
export function samplePoints(means, rho, { n, seed }) {
  const rng = mulberry32(seed);
  const s = Math.sqrt(Math.max(0, 1 - rho * rho));
  return Array.from({ length: n }, () => {
    const z1 = standardNormal(rng);
    const z2 = standardNormal(rng);
    return [means[0] + z1, means[1] + rho * z1 + s * z2];
  });
}

/**
 * Category of a liability: the number of thresholds it exceeds.
 * @param {number} x
 * @param {number[]} thresholds
 */
export function categoryOf(x, thresholds) {
  let category = 0;
  while (category < thresholds.length && x > thresholds[category]) category++;
  return category;
}

/**
 * The entry's computation. Same params (and seed), same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  if ('table' in p) return { mode: 'table', fit: fitTable(p.table) };

  const traits = p.means.map((mean, t) => ({
    mean,
    thresholds: p.thresholds[t],
    categories: categoryBounds(p.thresholds[t]).map(([lower, upper], category) => ({
      category, lower: bound(lower), upper: bound(upper), probability: pnormInterval(lower, upper, mean, 1),
    })),
  }));
  if (traits.length === 1) return { mode: 'model', traits };

  const rho = /** @type {number} */ (p.rho);
  const shift = (/** @type {number} */ t) => p.thresholds[t].map((x) => x - p.means[t]);
  const cells = cellProbabilities(shift(0), shift(1), rho);
  let sample = null;
  if (p.sample) {
    const counts = cells.map((row) => row.map(() => 0));
    for (const [x1, x2] of samplePoints(p.means, rho, p.sample)) {
      counts[categoryOf(x1, p.thresholds[0])][categoryOf(x2, p.thresholds[1])]++;
    }
    const empty = emptyCategories(counts);
    sample = { ...p.sample, counts, fit: empty ? null : fitTable(counts), unfittable: empty };
  }
  return {
    mode: 'model',
    traits,
    rho,
    cells,
    codeCorrelation: codeCorrelation(cells),
    cosPiApproximation: cosPiApproximation(cells),
    sample,
  };
}

/**
 * Why a sampled table cannot be fitted (an empty category), or null.
 * @param {number[][]} counts
 */
function emptyCategories(counts) {
  const rows = counts.map((row, i) => (row.every((x) => x === 0) ? i : -1)).filter((i) => i >= 0);
  const columns = counts[0].map((_, j) => (counts.every((row) => row[j] === 0) ? j : -1)).filter((j) => j >= 0);
  if (!rows.length && !columns.length) return null;
  const parts = [];
  if (rows.length) parts.push(`trait 1 category ${rows.join(', ')}`);
  if (columns.length) parts.push(`trait 2 category ${columns.join(', ')}`);
  return `no one in the sample falls in ${parts.join(' or ')}, so the polychoric fit is undefined; draw more individuals`;
}
