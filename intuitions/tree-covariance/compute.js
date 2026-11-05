// A tree is a covariance matrix. Under Brownian motion two tips covary by the length of
// the path they share from the root, so the tips' covariance (VCV) is a Gram matrix: each
// tip is an arrow, and two arrows' dot product is their shared path. Three views:
//   covariance  the VCV, the tips as arrows (three at a time), and simulated tip values
//   reroot      the same unrooted tree hung from another root: the VCV changes, the
//               restricted likelihood does not (the pulley principle), the ordinary one does
//   pruning     Felsenstein's pruning, one cherry at a time: contrasts, extended branches
//               and the accumulated log-likelihood, against the direct normal likelihood
// The R scripts are drawingSimple3TipTrees.R, demonstratingUVBMonTree.R,
// pruningAlgorithmTestImplementationIThink.R (BMpruneLL) and exploringFasterPruning.R in
// ~/repos/dissertation_work/one-off_scripts/; api.md says what was changed.

import { cholesky } from '../lib/linalg.js';
import { standardNormal } from '../lib/normal.js';
import { checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { contrasts, isTip, NewickError, parseNewick, preorder, reroot, tipNodes, vcv, writeNewick } from '../lib/tree.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {import('../lib/tree.js').Tree} Tree */
/** @typedef {'covariance' | 'reroot' | 'pruning'} View */
/**
 * @typedef {{ view: 'covariance', newick: string, arrows: string[], pair: string[], sample: { n: number, seed: number } | null }} CovarianceParams
 * @typedef {{ view: 'reroot', newick: string, values: Record<string, number | number[]>, rate: number | number[][], root: { node: string, fraction: number }, sweep: string[] }} RerootParams
 * @typedef {{ view: 'pruning', newick: string, values: Record<string, number | number[]>, rate: number | number[][] }} PruningParams
 * @typedef {CovarianceParams | RerootParams | PruningParams} Params
 */

export const ENTRY = 'tree-covariance';
export const VIEWS = /** @type {const} */ (['covariance', 'reroot', 'pruning']);
/** drawingSimple3TipTrees.R's tree: E the root, A on v₁ = 50, D on v₄ = 40, B and C on v₂ = 30 and v₃ = 35. */
export const SCRIPT_TREE = '(A:50,(B:30,C:35)D:40)E;';
export const MAX_TIPS = 64;
const MAX_TRAITS = 4;
const SWEEP_POINTS = 24;

const VALUES = Object.freeze({ A: 3, B: -2, C: 1 });
export const DEFAULTS = Object.freeze({
  covariance: Object.freeze({ newick: SCRIPT_TREE, arrows: Object.freeze(['A', 'B', 'C']), pair: Object.freeze(['B', 'C']), sample: Object.freeze({ n: 500, seed: 1 }) }),
  reroot: Object.freeze({ newick: SCRIPT_TREE, values: VALUES, rate: 0.1, root: Object.freeze({ node: 'E', fraction: 0 }), sweep: Object.freeze(['A', 'C']) }),
  pruning: Object.freeze({ newick: SCRIPT_TREE, values: VALUES, rate: 0.1 }),
});

// ---------- Trees ----------

/**
 * Reads params.newick into a tree whose every node has a name: tips must be named, once
 * each; unnamed internal nodes are named N1, N2, … in drawing order. Every branch but the
 * root edge needs a positive length. A node may have more than two children; pruning
 * then takes them in turn, as if they were joined by branches of length 0.
 * @param {unknown} value @param {Issue[]} issues
 * @returns {Tree | null}
 */
export function readTree(value, issues) {
  const path = 'params.newick';
  if (typeof value !== 'string') {
    issues.push({ code: 'wrong_type', path, message: 'must be a Newick string such as "(A:1,(B:1,C:1):1);"' });
    return null;
  }
  let tree;
  try {
    tree = parseNewick(value);
  } catch (error) {
    if (!(error instanceof NewickError)) throw error;
    issues.push({ code: 'invalid_newick', path, message: `at character ${error.position + 1}: ${error.message}` });
    return null;
  }
  const tips = tipNodes(tree);
  const before = issues.length;
  if (tips.length < 2 || tips.length > MAX_TIPS) issues.push({ code: 'out_of_range', path, message: `has ${tips.length} tips; give 2 to ${MAX_TIPS}` });
  const names = new Set();
  for (const node of tips) {
    const label = tree.label[node];
    if (label === null) issues.push({ code: 'unnamed_tip', path, message: 'every tip needs a name' });
    else if (names.has(label)) issues.push({ code: 'duplicate_label', path, message: `two nodes are named "${label}"` });
    names.add(label);
  }
  for (const node of preorder(tree)) {
    if (node > 0 && !(tree.length[node] > 0)) issues.push({ code: 'missing_length', path, message: `${Number.isNaN(tree.length[node]) ? 'needs a length' : 'needs a positive length'} on the branch above ${tree.label[node] ?? 'an unnamed node'}` });
    if (!isTip(tree, node) && tree.label[node] !== null) {
      if (names.has(tree.label[node])) issues.push({ code: 'duplicate_label', path, message: `two nodes are named "${tree.label[node]}"` });
      names.add(tree.label[node]);
    }
  }
  if (issues.length > before) return null;
  let k = 1;
  for (const node of preorder(tree)) {
    if (tree.label[node] !== null) continue;
    while (names.has(`N${k}`)) k++;
    tree.label[node] = `N${k}`;
    names.add(`N${k++}`);
  }
  return tree;
}

/** A node's id by its name, or −1. @param {Tree} tree @param {string} label */
const nodeOf = (tree, label) => tree.label.indexOf(label);

/** The tree as the result carries it. @param {Tree} tree */
function treeOut(tree) {
  return { newick: writeNewick(tree), parent: tree.parent, children: tree.children, length: tree.length, label: tree.label };
}

// ---------- Parameters ----------

/**
 * Tip values: an object with a number for every tip, or an array of p numbers for p
 * traits, the same p for all.
 * @param {unknown} value @param {Tree} tree @param {Issue[]} issues
 * @returns {{ values: Record<string, number | number[]>, traits: number }}
 */
function checkValues(value, tree, issues) {
  const path = 'params.values';
  const tips = tipNodes(tree).map((node) => /** @type {string} */ (tree.label[node]));
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path, message: `must be an object with a value for each tip (${tips.join(', ')})` });
    return { values: {}, traits: 1 };
  }
  rejectUnknown(value, tips, path, issues);
  let traits = 0;
  /** @type {Record<string, number | number[]>} */
  const out = {};
  for (const tip of tips) {
    const v = value[tip];
    const at = `${path}.${tip}`;
    if (v === undefined) {
      issues.push({ code: 'missing_field', path: at, message: 'is missing; give every tip a value' });
      continue;
    }
    const p = Array.isArray(v) ? v.length : 1;
    if (Array.isArray(v) && (p < 1 || p > MAX_TRAITS)) {
      issues.push({ code: 'wrong_type', path: at, message: `must be a number, or an array of 1 to ${MAX_TRAITS} numbers` });
      continue;
    }
    if (traits && p !== traits) {
      issues.push({ code: 'wrong_type', path: at, message: `has ${p} traits where the other tips have ${traits}` });
      continue;
    }
    traits = p;
    out[tip] = Array.isArray(v) ? v.map((x, i) => checkNumber(x, `${at}[${i}]`, -1e6, 1e6, 0, issues)) : checkNumber(v, at, -1e6, 1e6, 0, issues);
  }
  return { values: out, traits: traits || 1 };
}

/**
 * The rate: σ² for one trait, or a p × p symmetric positive-definite matrix.
 * @param {unknown} value @param {number} traits @param {Issue[]} issues
 */
function checkRate(value, traits, issues) {
  const path = 'params.rate';
  if (traits === 1 && typeof value === 'number') return checkNumber(value, path, 1e-6, 1e6, 1, issues);
  if (!Array.isArray(value) || value.length !== traits || value.some((row) => !Array.isArray(row) || row.length !== traits)) {
    issues.push({ code: 'wrong_type', path, message: traits === 1 ? 'must be a number, σ²' : `must be a ${traits} × ${traits} matrix, one row per trait` });
    return traits === 1 ? 1 : identity(traits);
  }
  const m = value.map((row, i) => row.map((/** @type {unknown} */ x, /** @type {number} */ j) => checkNumber(x, `${path}[${i}][${j}]`, -1e6, 1e6, i === j ? 1 : 0, issues)));
  if (m.some((row, i) => row.some((/** @type {number} */ x, /** @type {number} */ j) => x !== m[j][i]))) issues.push({ code: 'not_symmetric', path, message: 'must be symmetric' });
  else if (!cholesky(m)) issues.push({ code: 'not_positive_definite', path, message: 'must be positive definite: every variance positive and every correlation strictly between −1 and 1' });
  return traits === 1 ? m[0][0] : m;
}

/** @param {number} p */
const identity = (p) => Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));

/**
 * Tip names: `count` distinct tips of the tree.
 * @param {unknown} value @param {string} path @param {Tree} tree @param {number} min @param {number} max @param {Issue[]} issues
 */
function checkTipList(value, path, tree, min, max, issues) {
  const tips = tipNodes(tree).map((node) => /** @type {string} */ (tree.label[node]));
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((v) => typeof v !== 'string')) {
    issues.push({ code: 'wrong_type', path, message: min === max ? `must be ${min} tip names` : `must be ${min} to ${max} tip names` });
    return tips.slice(0, max);
  }
  const bad = value.filter((v) => !tips.includes(v));
  if (bad.length) issues.push({ code: 'unknown_tip', path, message: `${bad.map((b) => `"${b}"`).join(', ')} ${bad.length > 1 ? 'are not tips' : 'is not a tip'}; the tips are ${tips.join(', ')}` });
  else if (new Set(value).size < value.length) issues.push({ code: 'duplicate_tip', path, message: 'names a tip twice' });
  return value;
}

/**
 * Validates params and fills in defaults for the chosen view (default "covariance").
 * Throws one IntuitionsError listing every problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'covariance';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  const v = /** @type {View} */ (view);
  const defaults = /** @type {Record<string, any>} */ (DEFAULTS[v]);
  /** @type {Issue[]} */
  const issues = [];
  rejectUnknown(params, ['view', ...Object.keys(defaults)], 'params', issues);
  const newick = params.newick ?? defaults.newick;
  const tree = readTree(newick, issues);
  if (!tree) throw invalidRequest(issues);
  const scriptTree = newick === SCRIPT_TREE;
  const tips = tipNodes(tree).map((node) => /** @type {string} */ (tree.label[node]));
  /** @type {Record<string, any>} */
  const out = { view: v, newick };
  if (v === 'covariance') {
    out.arrows = Object.hasOwn(params, 'arrows') ? checkTipList(params.arrows, 'params.arrows', tree, 2, 3, issues) : scriptTree ? [...defaults.arrows] : tips.slice(0, 3);
    out.pair = Object.hasOwn(params, 'pair') ? checkTipList(params.pair, 'params.pair', tree, 2, 2, issues) : scriptTree ? [...defaults.pair] : tips.slice(0, 2);
    out.sample = Object.hasOwn(params, 'sample') ? checkSample(params.sample, issues) : { ...defaults.sample };
  } else {
    const { values, traits } = Object.hasOwn(params, 'values') ? checkValues(params.values, tree, issues)
      : scriptTree ? { values: { ...VALUES }, traits: 1 } : { values: Object.fromEntries(tips.map((t, i) => [t, Number(Math.sin(i + 1).toFixed(2))])), traits: 1 };
    out.values = values;
    out.rate = Object.hasOwn(params, 'rate') ? checkRate(params.rate, traits, issues) : traits === 1 ? defaults.rate : identity(traits);
    if (v === 'reroot') {
      out.root = Object.hasOwn(params, 'root') ? checkRoot(params.root, tree, issues) : { node: /** @type {string} */ (tree.label[0]), fraction: 0 };
      out.sweep = Object.hasOwn(params, 'sweep') ? checkTipList(params.sweep, 'params.sweep', tree, 2, 2, issues) : scriptTree ? [...defaults.sweep] : [tips[0], tips[tips.length - 1]];
    }
  }
  if (issues.length) throw invalidRequest(issues);
  return /** @type {Params} */ (out);
}

/** {n, seed}: n from 2 to 5,000. @param {unknown} value @param {Issue[]} issues */
function checkSample(value, issues) {
  if (value === null) return null;
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path: 'params.sample', message: 'must be null or an object {n, seed}' });
    return null;
  }
  rejectUnknown(value, ['n', 'seed'], 'params.sample', issues);
  return {
    n: Object.hasOwn(value, 'n') ? checkInteger(value.n, 'params.sample.n', 2, 5000, 500, issues) : 500,
    seed: Object.hasOwn(value, 'seed') ? checkInteger(value.seed, 'params.sample.seed', 0, 4294967295, 1, issues) : 1,
  };
}

/** {node, fraction}: on the branch above the named node, a share of the way to its parent. @param {unknown} value @param {Tree} tree @param {Issue[]} issues */
function checkRoot(value, tree, issues) {
  const path = 'params.root';
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path, message: 'must be an object {node, fraction}' });
    return { node: /** @type {string} */ (tree.label[0]), fraction: 0 };
  }
  rejectUnknown(value, ['node', 'fraction'], path, issues);
  const node = value.node;
  if (typeof node !== 'string' || nodeOf(tree, node) < 0) {
    issues.push({ code: 'unknown_node', path: `${path}.node`, message: `must name a node; the nodes are ${tree.label.join(', ')}` });
    return { node: /** @type {string} */ (tree.label[0]), fraction: 0 };
  }
  const fraction = Object.hasOwn(value, 'fraction') ? checkNumber(value.fraction, `${path}.fraction`, 0, 1, 0, issues) : 0;
  if (nodeOf(tree, node) === 0 && fraction > 0) issues.push({ code: 'out_of_range', path: `${path}.fraction`, message: `must be 0: ${node} is the root, with no branch above it` });
  return { node, fraction };
}

// ---------- Normal densities ----------

/**
 * log|M| and M⁻¹ for a positive-definite matrix, through its Cholesky factor.
 * @param {number[][]} M
 */
function factor(M) {
  const L = /** @type {number[][]} */ (cholesky(M));
  const n = M.length;
  let logDet = 0;
  for (let i = 0; i < n; i++) logDet += 2 * Math.log(L[i][i]);
  // Columns of the inverse, each by forward and back substitution.
  const inverse = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let c = 0; c < n; c++) {
    const y = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = i === c ? 1 : 0;
      for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
      y[i] = s / L[i][i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k][i] * inverse[k][c];
      inverse[i][c] = s / L[i][i];
    }
  }
  return { logDet, inverse };
}

/** The rate as a matrix. @param {number | number[][]} rate */
const rateMatrix = (rate) => (typeof rate === 'number' ? [[rate]] : rate);

/**
 * log N(c; 0, v Σ) for a p-vector contrast.
 * @param {number[]} c @param {number} v @param {{ logDet: number, inverse: number[][] }} S Σ's factor
 */
function contrastDensity(c, v, S) {
  const p = c.length;
  let q = 0;
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) q += c[i] * S.inverse[i][j] * c[j];
  return -0.5 * (p * Math.log(2 * Math.PI) + p * Math.log(v) + S.logDet + q / v);
}

/**
 * The likelihoods straight from the tips' covariance C ⊗ Σ: the restricted one, with the
 * root's state integrated out against a flat prior, log ∫ N(X; 1μᵀ, C ⊗ Σ) dμ, and the
 * ordinary one at the root estimate μ̂ = 1ᵀC⁻¹X / 1ᵀC⁻¹1. With `known`, the root's state
 * is observed (the tree is rooted at a tip) and both are log N(X; 1·knownᵀ, C ⊗ Σ).
 * @param {number[][]} X tips × traits @param {number[][]} C @param {number[][]} rate @param {number[] | null} known
 */
export function directLikelihood(X, C, rate, known) {
  const n = X.length;
  const p = X[0].length;
  const Cf = factor(C);
  const S = factor(rate);
  const Ci = Cf.inverse;
  let s = 0;
  const w = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w[i] += Ci[i][j];
  for (let i = 0; i < n; i++) s += w[i];
  const mu = known ?? Array.from({ length: p }, (_, k) => X.reduce((sum, row, i) => sum + w[i] * row[k], 0) / s);
  const R = X.map((row) => row.map((x, k) => x - mu[k]));
  // tr(Σ⁻¹ Rᵀ C⁻¹ R)
  let q = 0;
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < p; b++) {
      let rcr = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) rcr += R[i][a] * Ci[i][j] * R[j][b];
      q += S.inverse[b][a] * rcr;
    }
  }
  const ml = -0.5 * (n * p * Math.log(2 * Math.PI) + p * Cf.logDet + n * S.logDet + q);
  const reml = known ? ml : ml + 0.5 * (p * Math.log(2 * Math.PI) + S.logDet - p * Math.log(s));
  return { reml, ml, rootEstimate: mu, rootVariance: known ? 0 : 1 / s };
}

// ---------- Pruning ----------

/**
 * Felsenstein's pruning with log-likelihoods: each cherry's contrast and its density, the
 * running total (the restricted log-likelihood), the root's estimate and variance and the
 * ordinary log-likelihood at that estimate; and, when the tree is rooted at a tip, the
 * last contrast between that tip and the estimate below it.
 * @param {Tree} tree @param {Record<string, number | number[]>} values @param {number | number[][]} rate
 */
export function prune(tree, values, rate) {
  const asVector = (/** @type {number | number[]} */ v) => (Array.isArray(v) ? v : [v]);
  const S = factor(rateMatrix(rate));
  const observedRoot = isTip(tree, 0) || (tree.children[0].length === 1 && Object.hasOwn(values, /** @type {string} */ (tree.label[0])));
  const byNode = tree.label.map((label, node) => (isTip(tree, node) && node !== 0 ? asVector(values[/** @type {string} */ (label)]) : null));
  const { steps, root } = contrasts(tree, byNode);
  let total = 0;
  const out = steps.map((step) => {
    const logDensity = contrastDensity(step.contrast, step.variance, S);
    total += logDensity;
    return {
      node: tree.label[step.node], children: step.children.map((group) => group.map((c) => tree.label[c]).join('+')), values: step.values,
      branches: step.branches, extensions: step.extensions, lengths: step.branches.map((b, k) => b + step.extensions[k]),
      contrast: step.contrast, variance: step.variance, scaled: step.contrast.map((c) => c / Math.sqrt(step.variance)),
      estimate: step.estimate, extension: step.extension, logDensity, total,
    };
  });
  if (observedRoot) {
    const known = asVector(values[/** @type {string} */ (tree.label[0])]);
    const contrast = known.map((x, k) => x - root.estimate[k]);
    const logDensity = contrastDensity(contrast, root.variance, S);
    total += logDensity;
    const child = tree.children[0][0];
    out.push({
      node: tree.label[0], children: [/** @type {string} */ (tree.label[0]), /** @type {string} */ (tree.label[child])], values: [known, root.estimate],
      branches: [0, tree.length[child]], extensions: [0, root.variance - tree.length[child]], lengths: [0, root.variance],
      contrast, variance: root.variance, scaled: contrast.map((c) => c / Math.sqrt(root.variance)),
      estimate: known, extension: 0, logDensity, total,
    });
  }
  const p = asVector(Object.values(values)[0]).length;
  const ml = observedRoot ? total : total - 0.5 * (p * Math.log(2 * Math.PI) + p * Math.log(root.variance) + S.logDet);
  return {
    steps: out, reml: total, ml, observedRoot: observedRoot ? tree.label[0] : null,
    root: observedRoot ? { estimate: asVector(values[/** @type {string} */ (tree.label[0])]), variance: 0 } : root,
  };
}

/**
 * Pruning and the direct likelihood for one rooted tree, with its VCV.
 * @param {Tree} tree @param {Record<string, number | number[]>} values @param {number | number[][]} rate
 */
function likelihoods(tree, values, rate) {
  const pruned = prune(tree, values, rate);
  const { tips, matrix } = vcv(tree);
  const leaves = tips.filter((node) => node !== 0);
  const C = tips.length === leaves.length ? matrix : leaves.map((i) => leaves.map((j) => matrix[tips.indexOf(i)][tips.indexOf(j)]));
  const X = leaves.map((node) => {
    const v = values[/** @type {string} */ (tree.label[node])];
    return Array.isArray(v) ? v : [v];
  });
  const known = pruned.observedRoot ? pruned.root.estimate : null;
  const direct = directLikelihood(X, C, rateMatrix(rate), known);
  return { pruned, direct, tips: leaves.map((node) => tree.label[node]), vcv: C };
}

// ---------- Views ----------

/** @param {CovarianceParams} p */
function covarianceView({ newick, arrows, pair, sample }) {
  const tree = /** @type {Tree} */ (readTree(newick, []));
  const { tips, matrix } = vcv(tree);
  const labels = tips.map((node) => /** @type {string} */ (tree.label[node]));
  const correlation = matrix.map((row, i) => row.map((c, j) => c / Math.sqrt(matrix[i][i] * matrix[j][j])));
  // Each tip's path from the root: the branches (named by the node below them) it runs along.
  const paths = tips.map((node) => {
    const branches = [];
    for (let n = node; n > 0; n = tree.parent[n]) branches.unshift(tree.label[n]);
    if (tree.length[0] > 0) branches.unshift(tree.label[0]);
    return branches;
  });
  // The chosen tips as arrows with the same dot products: rows of the Cholesky factor of
  // their covariance, in 3-D.
  const at = arrows.map((label) => labels.indexOf(label));
  const L = /** @type {number[][]} */ (cholesky(at.map((i) => at.map((j) => matrix[i][j]))));
  const vectors = L.map((row) => [...row, ...new Array(3 - row.length).fill(0)]);
  const angles = [];
  for (let a = 0; a < at.length; a++) {
    for (let b = a + 1; b < at.length; b++) {
      const r = correlation[at[a]][at[b]];
      angles.push({ tips: [arrows[a], arrows[b]], shared: matrix[at[a]][at[b]], correlation: r, degrees: (Math.acos(Math.max(-1, Math.min(1, r))) * 180) / Math.PI });
    }
  }
  /** @type {{ n: number, seed: number, x: number[], y: number[], correlation: number } | null} */
  let draws = null;
  if (sample) {
    // Brownian motion at rate 1 from 0 at the root, branch by branch; only the pair is kept.
    const rng = mulberry32(sample.seed);
    const [i, j] = pair.map((label) => tips[labels.indexOf(label)]);
    const x = [];
    const y = [];
    const state = new Array(tree.parent.length).fill(0);
    const order = preorder(tree);
    for (let r = 0; r < sample.n; r++) {
      for (const node of order) state[node] = (node === 0 ? 0 : state[tree.parent[node]]) + Math.sqrt(tree.length[node]) * standardNormal(rng);
      x.push(state[i]);
      y.push(state[j]);
    }
    draws = { n: sample.n, seed: sample.seed, x, y, correlation: pearson(x, y) };
  }
  return {
    view: 'covariance', tree: treeOut(tree), tips: labels, vcv: matrix, correlation, paths,
    arrows: { tips: arrows, vectors, lengths: at.map((i) => Math.sqrt(matrix[i][i])), angles }, sample: draws,
  };
}

/** @param {number[]} x @param {number[]} y */
function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** The tree re-rooted on the branch above `label`, `fraction` of the way up. @param {Tree} tree @param {string} label @param {number} fraction */
function rootedAt(tree, label, fraction) {
  const node = nodeOf(tree, label);
  return reroot(tree, node, node === 0 ? 0 : fraction * tree.length[node]).tree;
}

/** @param {RerootParams} p */
function rerootView({ newick, values, rate, root, sweep }) {
  const tree = /** @type {Tree} */ (readTree(newick, []));
  const rooted = rootedAt(tree, root.node, root.fraction);
  const here = likelihoods(rooted, values, rate);
  // Slide the root from one tip to the other, along the path between them.
  const [from, to] = sweep.map((label) => nodeOf(tree, label));
  const up = (/** @type {number} */ n) => {
    const path = [];
    for (let k = n; k >= 0; k = tree.parent[k]) path.push(k);
    return path;
  };
  const a = up(from);
  const b = up(to);
  const meet = /** @type {number} */ (a.find((n) => b.includes(n)));
  /** @type {{ node: number, upward: boolean }[]} branches in order from `from` */
  const legs = [...a.slice(0, a.indexOf(meet)).map((node) => ({ node, upward: true })), ...b.slice(0, b.indexOf(meet)).reverse().map((node) => ({ node, upward: false }))];
  const positions = [];
  const ml = [];
  const reml = [];
  const marks = [{ label: tree.label[from], at: 0 }];
  let distance = 0;
  for (const { node, upward } of legs) {
    const length = tree.length[node];
    for (let k = 0; k < SWEEP_POINTS; k++) {
      // Points strictly inside each branch: at a tip the ordinary likelihood is unbounded.
      const share = (k + 0.5) / SWEEP_POINTS;
      const f = upward ? share : 1 - share;
      const r = likelihoods(rootedAt(tree, /** @type {string} */ (tree.label[node]), f), values, rate);
      positions.push(distance + share * length);
      ml.push(r.direct.ml);
      reml.push(r.direct.reml);
    }
    distance += length;
    marks.push({ label: tree.label[upward ? tree.parent[node] : node], at: distance });
  }
  // Where the current root sits on the swept path, if it does.
  const leg = legs.findIndex((l) => tree.label[l.node] === root.node);
  const current = leg >= 0 ? legs.slice(0, leg).reduce((s, l) => s + tree.length[l.node], 0) + (legs[leg].upward ? root.fraction : 1 - root.fraction) * tree.length[legs[leg].node]
    : marks.find((m) => m.label === root.node)?.at ?? null;
  return {
    view: 'reroot', tree: treeOut(rooted), tips: here.tips, vcv: here.vcv, observedRoot: here.pruned.observedRoot,
    rootEstimate: here.direct.rootEstimate, rootVariance: here.direct.rootVariance,
    reml: here.pruned.reml, ml: here.pruned.ml, direct: { reml: here.direct.reml, ml: here.direct.ml },
    sweep: { tips: sweep, positions, reml, ml, marks, current },
  };
}

/** @param {PruningParams} p */
function pruningView({ newick, values, rate }) {
  const tree = /** @type {Tree} */ (readTree(newick, []));
  const r = likelihoods(tree, values, rate);
  const sigma = rateMatrix(rate);
  return {
    view: 'pruning', tree: treeOut(tree), tips: r.tips, vcv: r.vcv,
    steps: r.pruned.steps, root: r.pruned.root,
    reml: r.pruned.reml, ml: r.pruned.ml, direct: { reml: r.direct.reml, ml: r.direct.ml, rootEstimate: r.direct.rootEstimate, rootVariance: r.direct.rootVariance },
    // drawingSimple3TipTrees.R's matrices: the tips' covariance P (times σ² for one trait)
    // becomes the contrasts' diagonal Q.
    P: sigma.length === 1 ? r.vcv.map((row) => row.map((c) => c * sigma[0][0])) : null,
    Q: r.pruned.steps.map((s) => s.variance * (sigma.length === 1 ? sigma[0][0] : 1)),
  };
}

// ---------- Entry point ----------

/**
 * The entry's computation. Same params, same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  if (p.view === 'covariance') return covarianceView(p);
  if (p.view === 'reroot') return rerootView(p);
  return pruningView(p);
}
