// Traits evolving on a tree. A trait starts at the root and evolves down every branch;
// at each split the two daughter lineages inherit the value and go on independently, so
// sister species resemble each other for as long as they shared history. Three views:
//   tree       one trait through time on a phylogeny under Brownian motion, a trend,
//              Ornstein–Uhlenbeck pull to an optimum, an early or late burst, a burst of
//              rate partway through, or a clade that shifts to a second optimum
//   bivariate  two correlated traits under Brownian motion, as paths through (trait 1,
//              trait 2, time)
//   bridge     a branch whose start and end are fixed, filled in by midpoints (Lévy's
//              construction of the Brownian bridge), optionally kept inside a region
// Each path is exact at its time steps: every step draws from the model's transition
// distribution over that step, so the step size changes the picture's detail and not
// the distribution of the tips. The R scripts are qualifyingExam_animations.R,
// univariate_brownian_motion_animation.R, prettyUVBMruns.R, 3dPlots.R, 3dPlots_Array.R,
// truncatedBMapprox.R, rateHeterogeneity_DisparityThroughTime.R and middleBurst.R in
// ~/repos/dissertation_work/one-off_scripts/; api.md says what was changed.

import { cholesky } from '../lib/linalg.js';
import { standardNormal } from '../lib/normal.js';
import { checkChoice, checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { heights, NewickError, parseNewick, preorder, scaleTree, tipNodes, tipsBelow, writeNewick, yule } from '../lib/tree.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {import('../lib/tree.js').Tree} Tree */
/** @typedef {'tree' | 'bivariate' | 'bridge'} View */
/** @typedef {'bm' | 'trend' | 'ou' | 'eb' | 'burst' | 'shift'} Model */
/** @typedef {{ tips: number, seed: number } | { newick: string }} TreeSpec */
/**
 * @typedef {{ view: 'tree', tree: TreeSpec, model: Model, sigma2: number, root: number, steps: number, seed: number,
 *   drift?: number, alpha?: number, theta?: number, theta2?: number, clade?: string[], change?: number, burstAt?: number, delta2?: number, lambda?: number }} TreeParams
 * @typedef {{ view: 'bivariate', tree: TreeSpec, rate: number[][], root: number[], steps: number, seed: number }} BivariateParams
 * @typedef {{ view: 'bridge', start: number[], end: number[], rate: number[][], length: number, levels: number, paths: number,
 *   region: Region, method: 'stagewise' | 'whole-path', seed: number }} BridgeParams
 * @typedef {TreeParams | BivariateParams | BridgeParams} Params
 * @typedef {'none' | 'disc' | 'dumbbell'} Region
 */

export const ENTRY = 'trait-evolution';
export const VIEWS = /** @type {const} */ (['tree', 'bivariate', 'bridge']);
export const MODELS = /** @type {const} */ (['bm', 'trend', 'ou', 'eb', 'burst', 'shift']);
export const REGIONS = /** @type {const} */ (['none', 'disc', 'dumbbell']);
export const MAX_TIPS = 64;
const MAX_POINTS = 200000;
const MAX_BRIDGE_POINTS = 120000;
/** A midpoint the region keeps rejecting is given up after this many draws, and so is a whole path. */
const MAX_TRIES = 10000;
/** The most normal draws one bridge request may make; the paths not finished by then are given up. */
export const MAX_DRAWS = 2000000;

/** Parameters each model adds to σ², the root state, the steps and the seed. */
export const MODEL_FIELDS = Object.freeze({
  bm: [], trend: ['drift'], ou: ['alpha', 'theta'], eb: ['change'], burst: ['burstAt', 'delta2', 'lambda'], shift: ['alpha', 'theta', 'theta2', 'clade'],
});
const MODEL_DEFAULTS = { drift: 2, alpha: 4, theta: 1.5, theta2: -1.5, change: -4, burstAt: 0.5, delta2: 5, lambda: 8 };
const RANGES = { sigma2: [0.001, 100], root: [-100, 100], drift: [-50, 50], alpha: [0.001, 100], theta: [-100, 100], theta2: [-100, 100], change: [-20, 20], burstAt: [0, 1], delta2: [0, 1000], lambda: [0.01, 200] };

/** 3dPlots.R's tree: a stem of 0.25, C on 1, and A and B on 0.5 from a node 0.5 above the root. */
export const PLOTS_TREE = '((A:0.5,B:0.5):0.5,C:1):0.25;';
/** truncatedBMapprox.R's two regions. */
export const REGION_SHAPES = Object.freeze({
  disc: Object.freeze({ centre: [0, 0], radius: 10 }),
  dumbbell: Object.freeze({ circles: [{ centre: [-11, 0], radius: 8 }, { centre: [11, 0], radius: 8 }], corridor: { x: [-3.3, 3.3], y: [-1, 1] } }),
});

export const DEFAULTS = Object.freeze({
  tree: Object.freeze({ tree: Object.freeze({ tips: 12, seed: 1 }), model: 'bm', sigma2: 1, root: 0, steps: 300, seed: 1 }),
  bivariate: Object.freeze({ tree: Object.freeze({ newick: PLOTS_TREE }), rate: Object.freeze([[1, 0.5], [0.5, 2]]), root: Object.freeze([4, 4]), steps: 125, seed: 1 }),
  bridge: Object.freeze({ start: Object.freeze([-5, -4]), end: Object.freeze([4, 4.5]), rate: Object.freeze([[2, 1], [1, 3]]), length: 50, levels: 4, paths: 500, region: 'disc', method: 'stagewise', seed: 1 }),
});

// ---------- Trees ----------

/**
 * The tree a spec describes: {tips, seed}, a pure-birth tree scaled to height 1; or
 * {newick}, as written (every branch but the root edge needs a length, and tips unique
 * names).
 * @param {unknown} spec @param {Issue[]} issues
 * @returns {Tree | null}
 */
export function buildTree(spec, issues) {
  const path = 'params.tree';
  if (!isObject(spec) || (Object.hasOwn(spec, 'newick') === (Object.hasOwn(spec, 'tips') || Object.hasOwn(spec, 'seed')))) {
    issues.push({ code: 'wrong_type', path, message: 'must be {tips, seed} for a pure-birth tree or {newick} for a tree of your own' });
    return null;
  }
  if (!Object.hasOwn(spec, 'newick')) {
    rejectUnknown(spec, ['tips', 'seed'], path, issues);
    const before = issues.length;
    const tips = Object.hasOwn(spec, 'tips') ? checkInteger(spec.tips, `${path}.tips`, 2, MAX_TIPS, 12, issues) : 12;
    const seed = Object.hasOwn(spec, 'seed') ? checkInteger(spec.seed, `${path}.seed`, 0, 4294967295, 1, issues) : 1;
    if (issues.length > before) return null;
    const tree = yule(tips, mulberry32(seed));
    return scaleTree(tree, 1 / treeHeight(tree));
  }
  rejectUnknown(spec, ['newick'], path, issues);
  if (typeof spec.newick !== 'string') {
    issues.push({ code: 'wrong_type', path: `${path}.newick`, message: 'must be a Newick string' });
    return null;
  }
  let tree;
  try {
    tree = parseNewick(spec.newick);
  } catch (error) {
    if (!(error instanceof NewickError)) throw error;
    issues.push({ code: 'invalid_newick', path: `${path}.newick`, message: `at character ${error.position + 1}: ${error.message}` });
    return null;
  }
  const before = issues.length;
  const tips = tipNodes(tree);
  if (tips.length < 2 || tips.length > MAX_TIPS) issues.push({ code: 'out_of_range', path: `${path}.newick`, message: `has ${tips.length} tips; give 2 to ${MAX_TIPS}` });
  const names = tips.map((node) => tree.label[node]);
  if (names.some((n) => n === null)) issues.push({ code: 'unnamed_tip', path: `${path}.newick`, message: 'every tip needs a name' });
  else if (new Set(names).size < names.length) issues.push({ code: 'duplicate_label', path: `${path}.newick`, message: 'two tips have the same name' });
  if (tree.length.some((l, node) => node > 0 && !(l >= 0))) issues.push({ code: 'missing_length', path: `${path}.newick`, message: 'every branch needs a length of 0 or more' });
  if (issues.length > before) return null;
  if (!(treeHeight(tree) > 0)) {
    issues.push({ code: 'out_of_range', path: `${path}.newick`, message: 'the tree has no length' });
    return null;
  }
  return tree;
}

/** The tallest tip's height. @param {Tree} tree */
export function treeHeight(tree) {
  const h = heights(tree);
  return Math.max(...tipNodes(tree).map((node) => h[node]));
}

/** The node at the base of a clade: the most recent common ancestor of the named tips. @param {Tree} tree @param {string[]} labels */
export function cladeNode(tree, labels) {
  const below = tipsBelow(tree);
  const wanted = labels.map((label) => tree.label.indexOf(label));
  let node = wanted[0];
  while (!wanted.every((w) => below[node].includes(w))) node = tree.parent[node];
  return node;
}

/** The default clade for a shift: the root's smaller daughter (the second on a tie), by its first and last tip. @param {Tree} tree */
function defaultClade(tree) {
  const below = tipsBelow(tree);
  const kids = tree.children[0];
  const tips = below[kids.reduce((best, c) => (below[c].length <= below[best].length ? c : best), kids[kids.length - 1])];
  return [...new Set([tips[0], tips[tips.length - 1]])].map((node) => /** @type {string} */ (tree.label[node]));
}

// ---------- Parameters ----------

/**
 * A 2 × 2 rate matrix, symmetric and positive definite.
 * @param {unknown} value @param {string} path @param {Issue[]} issues
 */
function checkRate2(value, path, issues) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((row) => !Array.isArray(row) || row.length !== 2)) {
    issues.push({ code: 'wrong_type', path, message: 'must be a 2 × 2 matrix [[σ₁², σ₁₂], [σ₁₂, σ₂²]]' });
    return [[1, 0], [0, 1]];
  }
  const m = value.map((row, i) => row.map((/** @type {unknown} */ x, /** @type {number} */ j) => checkNumber(x, `${path}[${i}][${j}]`, -100, 100, i === j ? 1 : 0, issues)));
  if (m[0][1] !== m[1][0]) issues.push({ code: 'not_symmetric', path, message: 'must be symmetric' });
  else if (!cholesky(m)) issues.push({ code: 'not_positive_definite', path, message: 'must be positive definite: both variances positive and their correlation strictly between −1 and 1' });
  return m;
}

/** A pair of numbers. @param {unknown} value @param {string} path @param {number} limit @param {Issue[]} issues */
function checkPoint(value, path, limit, issues) {
  if (!Array.isArray(value) || value.length !== 2) {
    issues.push({ code: 'wrong_type', path, message: 'must be a pair of numbers [x, y]' });
    return [0, 0];
  }
  return value.map((x, i) => checkNumber(x, `${path}[${i}]`, -limit, limit, 0, issues));
}

/** Whether a point lies inside a region. @param {Region} region @param {number[]} p */
export function insideRegion(region, [x, y]) {
  if (region === 'none') return true;
  if (region === 'disc') {
    const { centre, radius } = REGION_SHAPES.disc;
    return Math.hypot(x - centre[0], y - centre[1]) < radius;
  }
  const { circles, corridor } = REGION_SHAPES.dumbbell;
  return circles.some((c) => Math.hypot(x - c.centre[0], y - c.centre[1]) < c.radius)
    || (x > corridor.x[0] && x < corridor.x[1] && y > corridor.y[0] && y < corridor.y[1]);
}

/**
 * Validates params and fills in defaults for the chosen view (default "tree") and, in
 * the tree view, model (default "bm"). Throws one IntuitionsError listing every problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'tree';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  /** @type {Record<string, any>} */
  const out = { view };
  if (view === 'tree') {
    const model = Object.hasOwn(params, 'model') ? checkChoice(params.model, 'params.model', MODELS, 'bm', issues) : 'bm';
    const fields = /** @type {readonly string[]} */ (MODEL_FIELDS[model]);
    rejectUnknown(params, ['view', ...Object.keys(DEFAULTS.tree), ...fields], 'params', issues);
    const spec = params.tree ?? DEFAULTS.tree.tree;
    const tree = buildTree(spec, issues);
    out.tree = isObject(spec) && Object.hasOwn(spec, 'newick') ? { newick: spec.newick } : { tips: spec?.tips ?? 12, seed: spec?.seed ?? 1 };
    out.model = model;
    for (const key of ['sigma2', 'root', ...fields.filter((f) => f !== 'clade')]) {
      const [min, max] = /** @type {Record<string, number[]>} */ (RANGES)[key];
      const fallback = key in DEFAULTS.tree ? /** @type {Record<string, any>} */ (DEFAULTS.tree)[key] : /** @type {Record<string, number>} */ (MODEL_DEFAULTS)[key];
      out[key] = Object.hasOwn(params, key) ? checkNumber(params[key], `params.${key}`, min, max, fallback, issues) : fallback;
    }
    if (model === 'shift' && tree) out.clade = Object.hasOwn(params, 'clade') ? checkClade(params.clade, tree, issues) : defaultClade(tree);
    out.steps = Object.hasOwn(params, 'steps') ? checkInteger(params.steps, 'params.steps', 10, 5000, 300, issues) : 300;
    out.seed = Object.hasOwn(params, 'seed') ? checkInteger(params.seed, 'params.seed', 0, 4294967295, 1, issues) : 1;
    if (tree && !issues.length) checkPoints(tree, out.steps, issues);
  } else if (view === 'bivariate') {
    rejectUnknown(params, ['view', ...Object.keys(DEFAULTS.bivariate)], 'params', issues);
    const spec = params.tree ?? DEFAULTS.bivariate.tree;
    const tree = buildTree(spec, issues);
    out.tree = isObject(spec) && Object.hasOwn(spec, 'newick') ? { newick: spec.newick } : { tips: spec?.tips ?? 12, seed: spec?.seed ?? 1 };
    out.rate = Object.hasOwn(params, 'rate') ? checkRate2(params.rate, 'params.rate', issues) : DEFAULTS.bivariate.rate.map((r) => [...r]);
    out.root = Object.hasOwn(params, 'root') ? checkPoint(params.root, 'params.root', 100, issues) : [...DEFAULTS.bivariate.root];
    out.steps = Object.hasOwn(params, 'steps') ? checkInteger(params.steps, 'params.steps', 10, 5000, 125, issues) : 125;
    out.seed = Object.hasOwn(params, 'seed') ? checkInteger(params.seed, 'params.seed', 0, 4294967295, 1, issues) : 1;
    if (tree && !issues.length) checkPoints(tree, out.steps, issues);
  } else {
    const d = DEFAULTS.bridge;
    rejectUnknown(params, ['view', ...Object.keys(d)], 'params', issues);
    out.start = Object.hasOwn(params, 'start') ? checkPoint(params.start, 'params.start', 100, issues) : [...d.start];
    out.end = Object.hasOwn(params, 'end') ? checkPoint(params.end, 'params.end', 100, issues) : [...d.end];
    out.rate = Object.hasOwn(params, 'rate') ? checkRate2(params.rate, 'params.rate', issues) : d.rate.map((r) => [...r]);
    out.length = Object.hasOwn(params, 'length') ? checkNumber(params.length, 'params.length', 0.01, 1000, d.length, issues) : d.length;
    out.levels = Object.hasOwn(params, 'levels') ? checkInteger(params.levels, 'params.levels', 1, 12, d.levels, issues) : d.levels;
    out.paths = Object.hasOwn(params, 'paths') ? checkInteger(params.paths, 'params.paths', 1, 1000, d.paths, issues) : d.paths;
    out.region = Object.hasOwn(params, 'region') ? checkChoice(params.region, 'params.region', REGIONS, 'disc', issues) : d.region;
    out.method = Object.hasOwn(params, 'method') ? checkChoice(params.method, 'params.method', /** @type {const} */ (['stagewise', 'whole-path']), 'stagewise', issues) : d.method;
    out.seed = Object.hasOwn(params, 'seed') ? checkInteger(params.seed, 'params.seed', 0, 4294967295, 1, issues) : 1;
    if (!issues.length) {
      for (const key of ['start', 'end']) {
        if (!insideRegion(out.region, out[key])) issues.push({ code: 'outside_region', path: `params.${key}`, message: `is outside the ${out.region}; a path cannot be kept inside a region it starts or ends outside` });
      }
      const points = out.paths * (2 ** out.levels + 1);
      if (points > MAX_BRIDGE_POINTS) issues.push({ code: 'too_much_work', path: 'params.paths', message: `asks for ${points.toLocaleString('en-US')} points, and the most a request may ask for is ${MAX_BRIDGE_POINTS.toLocaleString('en-US')}: lower the paths or the levels` });
    }
  }
  if (issues.length) throw invalidRequest(issues);
  return /** @type {Params} */ (out);
}

/** One or more tip names; the clade is the smallest that holds them all. @param {unknown} value @param {Tree} tree @param {Issue[]} issues */
function checkClade(value, tree, issues) {
  const tips = tipNodes(tree).map((node) => /** @type {string} */ (tree.label[node]));
  if (!Array.isArray(value) || !value.length || value.some((v) => typeof v !== 'string')) {
    issues.push({ code: 'wrong_type', path: 'params.clade', message: 'must be one or more tip names; the clade is the smallest that holds them' });
    return defaultClade(tree);
  }
  const bad = value.filter((v) => !tips.includes(v));
  if (bad.length) {
    issues.push({ code: 'unknown_tip', path: 'params.clade', message: `${bad.map((b) => `"${b}"`).join(', ')} ${bad.length > 1 ? 'are not tips' : 'is not a tip'}; the tips are ${tips.join(', ')}` });
    return defaultClade(tree);
  }
  return value;
}

/** Rejects a request for too many path points. @param {Tree} tree @param {number} steps @param {Issue[]} issues */
function checkPoints(tree, steps, issues) {
  const total = tree.length.reduce((a, b) => a + b, 0) / treeHeight(tree) * steps;
  if (total > MAX_POINTS) issues.push({ code: 'too_much_work', path: 'params.steps', message: `asks for about ${Math.round(total).toLocaleString('en-US')} path points, and the most a request may ask for is ${MAX_POINTS.toLocaleString('en-US')}: lower the steps` });
}

// ---------- Models ----------

/**
 * A model's transition over one step: the mean and variance of the trait at time t1
 * given x at t0, on a branch in `regime` (2 inside a shifted clade). Exact for every
 * model, so paths are exact at their steps.
 * @param {TreeParams} p @param {number} height the tree's height, for the burst's time
 */
export function transition(p, height) {
  const { model, sigma2 } = p;
  if (model === 'bm') return (/** @type {number} */ x, /** @type {number} */ t0, /** @type {number} */ t1) => ({ mean: x, variance: sigma2 * (t1 - t0) });
  if (model === 'trend') return (/** @type {number} */ x, /** @type {number} */ t0, /** @type {number} */ t1) => ({ mean: x + /** @type {number} */ (p.drift) * (t1 - t0), variance: sigma2 * (t1 - t0) });
  if (model === 'eb') {
    const a = /** @type {number} */ (p.change);
    // σ²(t) = σ² e^(a t), integrated over the step.
    return (/** @type {number} */ x, /** @type {number} */ t0, /** @type {number} */ t1) => ({ mean: x, variance: a === 0 ? sigma2 * (t1 - t0) : (sigma2 * (Math.exp(a * t1) - Math.exp(a * t0))) / a });
  }
  if (model === 'burst') {
    const tb = /** @type {number} */ (p.burstAt) * height;
    const d2 = /** @type {number} */ (p.delta2);
    const lambda = /** @type {number} */ (p.lambda);
    // σ²(t) = σ² (1 + δ² e^(−λ (t − t_b))) after the burst time t_b, σ² before it.
    const extra = (/** @type {number} */ t) => (t <= tb ? 0 : (d2 / lambda) * (1 - Math.exp(-lambda * (t - tb))));
    return (/** @type {number} */ x, /** @type {number} */ t0, /** @type {number} */ t1) => ({ mean: x, variance: sigma2 * (t1 - t0 + extra(t1) - extra(t0)) });
  }
  const alpha = /** @type {number} */ (p.alpha);
  return (/** @type {number} */ x, /** @type {number} */ t0, /** @type {number} */ t1, regime = 1) => {
    const theta = regime === 2 ? /** @type {number} */ (p.theta2) : /** @type {number} */ (p.theta);
    const decay = Math.exp(-alpha * (t1 - t0));
    return { mean: theta + (x - theta) * decay, variance: (sigma2 * (1 - decay * decay)) / (2 * alpha) };
  };
}

/**
 * One lineage from the root's start through time: the mean and SD of the trait, and the
 * rate σ²(t); in a shift, also a lineage that enters the clade's regime at `from`.
 * @param {TreeParams} p @param {number} height @param {number} [from]
 */
function envelope(p, height, from) {
  const step = transition(p, height);
  // The clade's switch time is one of the points, so its lineage turns exactly there.
  const grid = Array.from({ length: 201 }, (_, i) => (height * i) / 200);
  const times = from === undefined || grid.some((t) => Math.abs(t - from) < 1e-12) ? grid : [...grid, from].sort((a, b) => a - b);
  /** @param {number} switchAt */
  const run = (switchAt) => {
    let mean = p.root;
    let variance = 0;
    const means = [mean];
    const sds = [0];
    for (let i = 1; i < times.length; i++) {
      // Means and variances carry through each step: m' = E[mean], v' = decay²·v + step variance.
      const t0 = times[i - 1];
      const t1 = times[i];
      const regime = t0 >= switchAt - 1e-12 ? 2 : 1;
      const a = step(mean, t0, t1, regime);
      const b = step(mean + 1, t0, t1, regime);
      const slope = b.mean - a.mean;
      mean = a.mean;
      variance = slope * slope * variance + a.variance;
      means.push(mean);
      sds.push(Math.sqrt(variance));
    }
    return { mean: means, sd: sds };
  };
  const rate = times.map((t) => {
    if (p.model === 'eb') return p.sigma2 * Math.exp(/** @type {number} */ (p.change) * t);
    if (p.model === 'burst') {
      const tb = /** @type {number} */ (p.burstAt) * height;
      return p.sigma2 * (t > tb ? 1 + /** @type {number} */ (p.delta2) * Math.exp(-/** @type {number} */ (p.lambda) * (t - tb)) : 1);
    }
    return p.sigma2;
  });
  return { times, ...run(Infinity), rate, ...(from === undefined ? {} : { clade: { from, ...run(from) } }) };
}

/** Time points along a branch, about `dt` apart, ends included. @param {number} start @param {number} end @param {number} dt */
function stepTimes(start, end, dt) {
  const n = Math.max(1, Math.ceil((end - start) / dt - 1e-9));
  return Array.from({ length: n + 1 }, (_, i) => (i === n ? end : start + ((end - start) * i) / n));
}

// ---------- Views ----------

/** The tree as the result carries it. @param {Tree} tree */
function treeOut(tree) {
  return { newick: writeNewick(tree), parent: tree.parent, children: tree.children, length: tree.length, label: tree.label, height: heights(tree) };
}

/** @param {TreeParams} p */
function treeView(p) {
  const tree = /** @type {Tree} */ (buildTree(p.tree, []));
  const h = heights(tree);
  const height = treeHeight(tree);
  const dt = height / p.steps;
  const step = transition(p, height);
  const rng = mulberry32(p.seed);
  const clade = p.model === 'shift' ? cladeNode(tree, /** @type {string[]} */ (p.clade)) : -1;
  const inClade = new Array(tree.parent.length).fill(false);
  if (clade >= 0) for (const node of preorder(tree)) inClade[node] = node === clade || (node > 0 && inClade[tree.parent[node]]);
  const endValue = new Array(tree.parent.length).fill(p.root);
  const branches = [];
  for (const node of preorder(tree)) {
    const start = node === 0 ? 0 : h[tree.parent[node]];
    let x = node === 0 ? p.root : endValue[tree.parent[node]];
    if (h[node] > start) {
      const times = stepTimes(start, h[node], dt);
      const values = [x];
      const regime = inClade[node] ? 2 : 1;
      for (let i = 1; i < times.length; i++) {
        const { mean, variance } = step(x, times[i - 1], times[i], regime);
        x = mean + Math.sqrt(variance) * standardNormal(rng);
        values.push(x);
      }
      branches.push({ node, regime, times, values });
    }
    endValue[node] = x;
  }
  const tips = tipNodes(tree).map((node) => ({ node, label: tree.label[node], value: endValue[node] }));
  return {
    view: 'tree', model: p.model, tree: treeOut(tree), treeHeight: height,
    clade: clade >= 0 ? { node: clade, from: clade === 0 ? 0 : h[tree.parent[clade]], tips: tipsBelow(tree)[clade].map((n) => tree.label[n]) } : null,
    branches, tips, nodeValues: endValue,
    envelope: envelope(p, height, clade >= 0 ? (clade === 0 ? 0 : h[tree.parent[clade]]) : undefined),
  };
}

/** @param {BivariateParams} p */
function bivariateView(p) {
  const tree = /** @type {Tree} */ (buildTree(p.tree, []));
  const h = heights(tree);
  const height = treeHeight(tree);
  const dt = height / p.steps;
  const L = /** @type {number[][]} */ (cholesky(p.rate));
  const rng = mulberry32(p.seed);
  /** @type {number[][]} */
  const endValue = tree.parent.map(() => [...p.root]);
  const branches = [];
  for (const node of preorder(tree)) {
    const start = node === 0 ? 0 : h[tree.parent[node]];
    let [x, y] = node === 0 ? p.root : endValue[tree.parent[node]];
    if (h[node] > start) {
      const times = stepTimes(start, h[node], dt);
      const xs = [x];
      const ys = [y];
      for (let i = 1; i < times.length; i++) {
        // 3dPlots.R's rmvnorm(sigma = rm / stepsPerBL): normal steps with covariance R·dt.
        const s = Math.sqrt(times[i] - times[i - 1]);
        const z1 = standardNormal(rng);
        const z2 = standardNormal(rng);
        x += s * L[0][0] * z1;
        y += s * (L[1][0] * z1 + L[1][1] * z2);
        xs.push(x);
        ys.push(y);
      }
      branches.push({ node, times, x: xs, y: ys });
    }
    endValue[node] = [x, y];
  }
  const correlation = p.rate[0][1] / Math.sqrt(p.rate[0][0] * p.rate[1][1]);
  return {
    view: 'bivariate', tree: treeOut(tree), treeHeight: height, correlation,
    branches, tips: tipNodes(tree).map((node) => ({ node, label: tree.label[node], value: endValue[node] })),
  };
}

/**
 * Draws a bivariate normal with mean m and covariance k·R. @param {() => number} rng
 * @param {number[]} m @param {number} k @param {number[][]} L R's Cholesky factor
 */
function drawNormal(rng, m, k, L) {
  const s = Math.sqrt(k);
  const z1 = standardNormal(rng);
  const z2 = standardNormal(rng);
  return [m[0] + s * L[0][0] * z1, m[1] + s * (L[1][0] * z1 + L[1][1] * z2)];
}

/** @param {BridgeParams} p */
function bridgeView(p) {
  const L = /** @type {number[][]} */ (cholesky(p.rate));
  const rng = mulberry32(p.seed);
  const N = 2 ** p.levels;
  const dt = p.length / N;
  const draws = new Array(p.levels + 1).fill(0);
  let spent = 0;
  const rejected = new Array(p.levels + 1).fill(0);
  /** Fills one path by midpoints; with `reject`, each midpoint outside the region is drawn again. @param {boolean} reject */
  const fill = (reject) => {
    const points = new Array(N + 1);
    points[0] = p.start;
    points[N] = p.end;
    for (let level = 1; level <= p.levels; level++) {
      const gap = N / 2 ** level;
      for (let i = gap; i < N; i += 2 * gap) {
        // Between fixed points a and b a span apart, the midpoint is normal with mean (a + b)/2
        // and covariance (span/4)·R: truncatedBMapprox.R's condMVN with these times.
        const a = points[i - gap];
        const b = points[i + gap];
        const mean = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let tries = 0;
        let q;
        do {
          if (tries++ >= MAX_TRIES || spent >= MAX_DRAWS) return null;
          q = drawNormal(rng, mean, (gap * dt) / 2, L);
          draws[level] += 1;
          spent += 1;
          if (reject && !insideRegion(p.region, q)) rejected[level] += 1;
          else break;
        } while (true);
        points[i] = q;
      }
    }
    return points;
  };
  const paths = [];
  let failed = 0;
  let attempts = 0;
  for (let k = 0; k < p.paths; k++) {
    if (p.method === 'stagewise' || p.region === 'none') {
      attempts += 1;
      const path = fill(p.region !== 'none');
      if (path) paths.push(path);
      else failed += 1;
    } else {
      // Whole-path rejection: draw the bridge freely and keep it only if every point is
      // inside, which conditions the sampled points on the region exactly.
      let path = null;
      for (let tries = 0; tries < MAX_TRIES && !path && spent < MAX_DRAWS; tries++) {
        attempts += 1;
        const candidate = fill(false);
        if (candidate && candidate.every((q) => insideRegion(p.region, q))) path = candidate;
      }
      if (path) paths.push(path);
      else failed += 1;
    }
  }
  // The free bridge's midpoint, for reference: mean (start + end)/2, covariance (length/4)·R;
  // and the sampled paths' midpoints, with their mean distance from the origin, the
  // centre of both regions.
  const free = { mean: [(p.start[0] + p.end[0]) / 2, (p.start[1] + p.end[1]) / 2], cov: p.rate.map((row) => row.map((v) => (v * p.length) / 4)) };
  const middles = paths.map((path) => path[N / 2]);
  const average = (/** @type {number[]} */ v) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  const distances = middles.map(([x, y]) => Math.hypot(x, y));
  const distance = average(distances);
  return {
    view: 'bridge', region: p.region, shape: p.region === 'none' ? null : REGION_SHAPES[p.region], method: p.method,
    points: N + 1, paths, failed, attempts, exhausted: spent >= MAX_DRAWS,
    levels: Array.from({ length: p.levels }, (_, i) => ({ level: i + 1, added: 2 ** i, draws: draws[i + 1], rejected: rejected[i + 1] })),
    midpoint: {
      free,
      sample: middles.length ? {
        mean: [average(middles.map((q) => q[0])), average(middles.map((q) => q[1]))], distance,
        distanceSE: Math.sqrt(distances.reduce((a, d) => a + (d - distance) ** 2, 0) / Math.max(1, distances.length - 1) / distances.length),
      } : null,
    },
  };
}

// ---------- Entry point ----------

/**
 * The entry's computation. Same params, same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  if (p.view === 'tree') return treeView(p);
  if (p.view === 'bivariate') return bivariateView(p);
  return bridgeView(p);
}
