// Adjusting for the right variables in a linear-Gaussian causal graph. Every node is
// a weighted sum of its parents plus its own normal noise, so the graph fixes the
// covariance of all the variables, and from it, exactly, the coefficient of the
// outcome on the exposure in a regression that adjusts for any set of other
// variables. That coefficient is compared with the causal effect (the sum over
// directed paths of the products of their coefficients), and each set is checked
// against the adjustment criterion by d-separation. Two views:
//   adjust     a preset or given graph, exposure, outcome and adjustment set: the
//              regression coefficient, the effect, every path and every set, the
//              front-door estimate through a mediator, and an optional seeded sample
//   colliders  Y and U independent, each of p exchangeable variables caused by both:
//              what regressing Y on them explains and how it couples Y and U
// The R scripts are happiness_numeracy.R, backdoor_frontdoor.R and age_causal.R in
// ~/repos/minor_scripts/postdoc/ and collider_effects_on_R2.R in ~/repos/montgomery_lab/.

import { solve } from '../lib/linalg.js';
import { standardNormal } from '../lib/normal.js';
import { checkChoice, checkInteger, checkNumber, checkSample, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {import('../lib/params.js').SampleSpec} SampleSpec */
/** @typedef {{ id: string, latent: boolean, x: number | null, y: number | null }} GraphNode */
/** @typedef {{ from: string, to: string, coefficient: number }} GraphEdge */
/** @typedef {{ name?: string, nodes: GraphNode[], edges: GraphEdge[] }} Graph */
/** @typedef {'unit' | 'standardized'} Noise */
/**
 * @typedef {{ view: 'adjust', graph: Graph, exposure: string, outcome: string, adjust: string[], mediator: string | null, noise: Noise, sample: SampleSpec | null }} AdjustParams
 * @typedef {{ view: 'colliders', colliders: number, rYX: number, share: number }} CollidersParams
 * @typedef {AdjustParams | CollidersParams} Params
 */

export const ENTRY = 'dag-adjustment';
export const VIEWS = /** @type {const} */ (['adjust', 'colliders']);
const NOISES = /** @type {const} */ (['unit', 'standardized']);

export const LIMITS = Object.freeze({
  maxNodes: 12,
  maxEdges: 40,
  coefficient: 10,
  maxSample: 5000,
  maxSets: 6, // every adjustment set is listed when there are at most this many candidates
  maxPaths: 100,
  maxColliders: 1024,
});

/**
 * @param {string} name
 * @param {[string, number, number, boolean?][]} nodes id, x, y, latent
 * @param {[string, string, number][]} edges
 * @returns {Graph}
 */
const graph = (name, nodes, edges) => ({
  name,
  nodes: nodes.map(([id, x, y, latent = false]) => ({ id, latent, x, y })),
  edges: edges.map(([from, to, coefficient]) => ({ from, to, coefficient })),
});

/**
 * The preset graphs, each with the exposure, outcome and front-door mediator it opens
 * with. Their coefficients also work standardized (each explains less than all of a
 * node's variance), except the happiness graph's. "front-door" is backdoor_frontdoor.R's smoking graph and "happiness" the graph
 * and simulated coefficients of happiness_numeracy.R.
 */
export const PRESETS = Object.freeze({
  confounder: { graph: graph('confounder', [['Z', 1, 0], ['X', 0, 1], ['Y', 2, 1]], [['Z', 'X', 0.6], ['Z', 'Y', 0.5], ['X', 'Y', 0.4]]), exposure: 'X', outcome: 'Y', mediator: null },
  mediator: { graph: graph('mediator', [['X', 0, 1], ['M', 1, 0], ['Y', 2, 1]], [['X', 'M', 0.7], ['M', 'Y', 0.6], ['X', 'Y', 0.3]]), exposure: 'X', outcome: 'Y', mediator: null },
  collider: { graph: graph('collider', [['X', 0, 0], ['Y', 2, 0], ['C', 1, 1]], [['X', 'Y', 0.5], ['X', 'C', 0.5], ['Y', 'C', 0.5]]), exposure: 'X', outcome: 'Y', mediator: null },
  'm-bias': {
    graph: graph('m-bias', [['U1', 0, 0, true], ['U2', 2, 0, true], ['M', 1, 1], ['X', 0, 2], ['Y', 2, 2]],
      [['U1', 'X', 0.8], ['U1', 'M', 0.6], ['U2', 'M', 0.6], ['U2', 'Y', 0.8], ['X', 'Y', 0.5]]),
    exposure: 'X', outcome: 'Y', mediator: null,
  },
  'front-door': {
    graph: graph('front-door', [['Genotype', 1, 0, true], ['Smoking', 0, 1], ['Tar', 1, 1], ['Cancer', 2, 1]],
      [['Genotype', 'Smoking', 0.6], ['Genotype', 'Cancer', 0.5], ['Smoking', 'Tar', 0.7], ['Tar', 'Cancer', 0.5]]),
    exposure: 'Smoking', outcome: 'Cancer', mediator: 'Tar',
  },
  happiness: {
    graph: graph('happiness', [['Numeracy', 0, 0], ['Satisfaction', 2, 0], ['Income', 1, 1], ['Illness', 1, 2]],
      [['Illness', 'Income', -1], ['Numeracy', 'Income', 2], ['Illness', 'Satisfaction', -2], ['Income', 'Satisfaction', 2], ['Numeracy', 'Satisfaction', 0]]),
    exposure: 'Income', outcome: 'Satisfaction', mediator: null,
  },
});
/** @typedef {keyof typeof PRESETS} PresetName */
const PRESET_NAMES = /** @type {PresetName[]} */ (Object.keys(PRESETS));

/** @type {Readonly<{ adjust: Readonly<{ graph: PresetName, adjust: readonly string[], noise: Noise, sample: null }>, colliders: Readonly<Omit<CollidersParams, 'view'>> }>} */
export const DEFAULTS = Object.freeze({
  adjust: Object.freeze({ graph: /** @type {PresetName} */ ('confounder'), adjust: Object.freeze([]), noise: /** @type {Noise} */ ('unit'), sample: null }),
  // collider_effects_on_R2.R's example: Cor(Y, X_i) = 0.15.
  colliders: Object.freeze({ colliders: 8, rYX: 0.15, share: 0.5 }),
});

const FIELDS = {
  adjust: ['view', 'graph', 'exposure', 'outcome', 'adjust', 'mediator', 'noise', 'sample'],
  colliders: ['view', 'colliders', 'rYX', 'share'],
};
const ID = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;

// ---------- Parameters ----------

/**
 * Validates params and fills in defaults for the chosen view (default "adjust").
 * Throws one IntuitionsError listing every problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'adjust';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {any} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  const v = /** @type {'adjust' | 'colliders'} */ (view);
  rejectUnknown(params, FIELDS[v], 'params', issues);
  const has = (/** @type {string} */ key) => Object.hasOwn(params, key);
  if (v === 'colliders') {
    const d = DEFAULTS.colliders;
    const resolved = {
      view: v,
      colliders: has('colliders') ? checkInteger(params.colliders, 'params.colliders', 1, LIMITS.maxColliders, d.colliders, issues) : d.colliders,
      rYX: has('rYX') ? checkNumber(params.rYX, 'params.rYX', 0, 0.99, d.rYX, issues) : d.rYX,
      share: has('share') ? checkNumber(params.share, 'params.share', 0, 0.999, d.share, issues) : d.share,
    };
    if (issues.length) throw invalidRequest(issues);
    return /** @type {CollidersParams} */ (resolved);
  }

  const given = has('graph') ? params.graph : DEFAULTS.adjust.graph;
  const before = issues.length;
  /** @type {{ graph: Graph, exposure: string | null, outcome: string | null, mediator: string | null }} */
  let base;
  if (typeof given === 'string') {
    const name = /** @type {PresetName} */ (checkChoice(given, 'params.graph', PRESET_NAMES, 'confounder', issues));
    const preset = PRESETS[name];
    base = { graph: copyGraph(preset.graph), exposure: preset.exposure, outcome: preset.outcome, mediator: preset.mediator };
  } else {
    base = { graph: checkGraph(given, issues), exposure: null, outcome: null, mediator: null };
  }
  // The other fields name nodes, so they are checked only against a valid graph.
  if (issues.length > before) throw invalidRequest(issues);
  const ids = base.graph.nodes.map((n) => n.id);
  const latent = new Set(base.graph.nodes.filter((n) => n.latent).map((n) => n.id));
  /** @param {string} key @param {string | null} fallback @returns {string} */
  const node = (key, fallback) => {
    const value = has(key) ? params[key] : fallback;
    if (value === null) {
      issues.push({ code: 'missing_field', path: `params.${key}`, message: 'is missing; give a node of the graph' });
      return '';
    }
    if (typeof value !== 'string' || !ids.includes(value)) {
      issues.push({ code: 'unknown_node', path: `params.${key}`, message: `${JSON.stringify(value)} is not a node; the nodes are ${ids.join(', ')}` });
      return '';
    }
    if (latent.has(value)) issues.push({ code: 'not_observed', path: `params.${key}`, message: `${value} is unobserved` });
    return value;
  };
  const exposure = node('exposure', base.exposure);
  const outcome = node('outcome', base.outcome);
  if (exposure && exposure === outcome) issues.push({ code: 'out_of_range', path: 'params.outcome', message: 'must differ from the exposure' });
  /** @type {string[]} */
  let adjust = [];
  if (has('adjust')) {
    if (!Array.isArray(params.adjust)) issues.push({ code: 'wrong_type', path: 'params.adjust', message: 'must be an array of node names' });
    else {
      params.adjust.forEach((/** @type {unknown} */ a, /** @type {number} */ i) => {
        const path = `params.adjust[${i}]`;
        if (typeof a !== 'string' || !ids.includes(a)) issues.push({ code: 'unknown_node', path, message: `${JSON.stringify(a)} is not a node; the nodes are ${ids.join(', ')}` });
        else if (a === exposure || a === outcome) issues.push({ code: 'out_of_range', path, message: `${a} is the ${a === exposure ? 'exposure' : 'outcome'}; adjust for other variables` });
        else if (latent.has(a)) issues.push({ code: 'not_observed', path, message: `${a} is unobserved, so it cannot be adjusted for` });
        else if (adjust.includes(a)) issues.push({ code: 'out_of_range', path, message: `${a} is listed twice` });
        else adjust.push(a);
      });
      adjust = ids.filter((id) => adjust.includes(id)); // graph order
    }
  }
  let mediator = has('mediator') ? params.mediator : base.mediator;
  if (mediator !== null) {
    if (typeof mediator !== 'string' || !ids.includes(mediator)) {
      issues.push({ code: 'unknown_node', path: 'params.mediator', message: `${JSON.stringify(mediator)} is not a node; give null or one of ${ids.join(', ')}` });
      mediator = null;
    } else if (mediator === exposure || mediator === outcome) {
      issues.push({ code: 'out_of_range', path: 'params.mediator', message: 'must differ from the exposure and the outcome' });
    } else if (latent.has(mediator)) issues.push({ code: 'not_observed', path: 'params.mediator', message: `${mediator} is unobserved` });
  }
  const noise = has('noise') ? checkChoice(params.noise, 'params.noise', NOISES, 'unit', issues) : DEFAULTS.adjust.noise;
  const sample = has('sample') ? checkSample(params.sample, LIMITS.maxSample, 'points', issues) : null;
  if (!issues.length && noise === 'standardized') noiseVariances(base.graph, 'standardized', issues);
  if (issues.length) throw invalidRequest(issues);
  return { view: 'adjust', graph: base.graph, exposure, outcome, adjust, mediator: /** @type {string | null} */ (mediator), noise, sample };
}

/** @param {Graph} g @returns {Graph} */
const copyGraph = (g) => ({ ...(g.name ? { name: g.name } : {}), nodes: g.nodes.map((n) => ({ ...n })), edges: g.edges.map((e) => ({ ...e })) });

/**
 * A graph object: 2–12 nodes {id, latent?, x?, y?} with distinct ids, and edges
 * {from, to, coefficient} between them, at most one per pair, with no cycle.
 * @param {unknown} value @param {Issue[]} issues
 * @returns {Graph}
 */
function checkGraph(value, issues) {
  const path = 'params.graph';
  const fallback = copyGraph(PRESETS.confounder.graph);
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path, message: `must be a preset name (${PRESET_NAMES.map((n) => `"${n}"`).join(', ')}) or an object {nodes, edges}` });
    return fallback;
  }
  rejectUnknown(value, ['name', 'nodes', 'edges'], path, issues);
  if (Object.hasOwn(value, 'name') && typeof value.name !== 'string') issues.push({ code: 'wrong_type', path: `${path}.name`, message: 'must be a string' });
  if (!Array.isArray(value.nodes) || value.nodes.length < 2 || value.nodes.length > LIMITS.maxNodes) {
    issues.push({ code: 'wrong_type', path: `${path}.nodes`, message: `must be an array of 2 to ${LIMITS.maxNodes} nodes {id, latent, x, y}` });
    return fallback;
  }
  /** @type {GraphNode[]} */
  const nodes = value.nodes.map((/** @type {unknown} */ n, /** @type {number} */ i) => {
    const p = `${path}.nodes[${i}]`;
    if (!isObject(n)) {
      issues.push({ code: 'wrong_type', path: p, message: 'must be an object {id, latent, x, y}' });
      return { id: `?${i}`, latent: false, x: null, y: null };
    }
    rejectUnknown(n, ['id', 'latent', 'x', 'y'], p, issues);
    if (typeof n.id !== 'string' || !ID.test(n.id)) issues.push({ code: 'wrong_type', path: `${p}.id`, message: 'must be a name of up to 24 letters, digits and underscores, starting with a letter' });
    if (Object.hasOwn(n, 'latent') && typeof n.latent !== 'boolean') issues.push({ code: 'wrong_type', path: `${p}.latent`, message: 'must be true or false' });
    const coordinate = (/** @type {'x' | 'y'} */ key) => (Object.hasOwn(n, key) && n[key] !== null ? checkNumber(n[key], `${p}.${key}`, -100, 100, 0, issues) : null);
    return { id: String(n.id), latent: n.latent === true, x: coordinate('x'), y: coordinate('y') };
  });
  const ids = nodes.map((n) => n.id);
  ids.forEach((id, i) => { if (ids.indexOf(id) !== i) issues.push({ code: 'duplicate_node', path: `${path}.nodes[${i}].id`, message: `${id} is used by an earlier node` }); });
  if (!Array.isArray(value.edges) || value.edges.length > LIMITS.maxEdges) {
    issues.push({ code: 'wrong_type', path: `${path}.edges`, message: `must be an array of up to ${LIMITS.maxEdges} edges {from, to, coefficient}` });
    return { nodes, edges: [] };
  }
  /** @type {GraphEdge[]} */
  const edges = [];
  value.edges.forEach((/** @type {unknown} */ e, /** @type {number} */ i) => {
    const p = `${path}.edges[${i}]`;
    if (!isObject(e)) {
      issues.push({ code: 'wrong_type', path: p, message: 'must be an object {from, to, coefficient}' });
      return;
    }
    rejectUnknown(e, ['from', 'to', 'coefficient'], p, issues);
    const ends = /** @type {const} */ (['from', 'to']).map((key) => {
      if (typeof e[key] !== 'string' || !ids.includes(e[key])) {
        issues.push({ code: 'unknown_node', path: `${p}.${key}`, message: `${JSON.stringify(e[key])} is not a node` });
        return null;
      }
      return /** @type {string} */ (e[key]);
    });
    const coefficient = checkNumber(e.coefficient, `${p}.coefficient`, -LIMITS.coefficient, LIMITS.coefficient, 0, issues);
    const [from, to] = ends;
    if (!from || !to) return;
    if (from === to) issues.push({ code: 'cyclic', path: p, message: `${from} cannot cause itself` });
    else if (edges.some((x) => (x.from === from && x.to === to) || (x.from === to && x.to === from))) issues.push({ code: 'duplicate_edge', path: p, message: `${from} and ${to} are already joined` });
    else edges.push({ from, to, coefficient });
  });
  const name = typeof value.name === 'string' ? { name: value.name } : {};
  const g = { ...name, nodes, edges };
  if (!issues.length && topologicalOrder(g) === null) issues.push({ code: 'cyclic', path: `${path}.edges`, message: 'contain a directed cycle; a causal graph must be acyclic' });
  return g;
}

// ---------- Graph structure ----------

/** Node indices in an order where every parent comes first, or null for a cycle. @param {Graph} g */
function topologicalOrder(g) {
  const index = new Map(g.nodes.map((n, i) => [n.id, i]));
  const indegree = g.nodes.map(() => 0);
  for (const e of g.edges) indegree[/** @type {number} */ (index.get(e.to))] += 1;
  const queue = indegree.flatMap((d, i) => (d === 0 ? [i] : []));
  const order = [];
  while (queue.length) {
    const i = /** @type {number} */ (queue.shift());
    order.push(i);
    for (const e of g.edges) {
      if (index.get(e.from) !== i) continue;
      const j = /** @type {number} */ (index.get(e.to));
      if (--indegree[j] === 0) queue.push(j);
    }
  }
  return order.length === g.nodes.length ? order : null;
}

/**
 * The structure the analysis uses: an edge with coefficient 0 is no edge.
 * @param {Graph} g
 */
function structure(g) {
  const n = g.nodes.length;
  const index = new Map(g.nodes.map((node, i) => [node.id, i]));
  /** @type {number[][]} */
  const parents = Array.from({ length: n }, () => []);
  /** @type {number[][]} */
  const children = Array.from({ length: n }, () => []);
  /** @type {number[][]} */
  const B = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of g.edges) {
    const i = /** @type {number} */ (index.get(e.from));
    const j = /** @type {number} */ (index.get(e.to));
    B[i][j] = e.coefficient;
    if (e.coefficient !== 0) {
      parents[j].push(i);
      children[i].push(j);
    }
  }
  return { n, index, parents, children, B, order: /** @type {number[]} */ (topologicalOrder(g)) };
}
/** @typedef {ReturnType<typeof structure>} Structure */

/** Nodes reachable from `start` along `next` (start included). @param {number[]} start @param {number[][]} next */
function closure(start, next) {
  const seen = new Set(start);
  const stack = [...start];
  while (stack.length) for (const j of next[/** @type {number} */ (stack.pop())]) if (!seen.has(j)) { seen.add(j); stack.push(j); }
  return seen;
}

/**
 * Whether x and y are d-separated given z, by the reachability ("Bayes ball")
 * algorithm on the given parent and child lists.
 * @param {number[][]} parents @param {number[][]} children @param {number} x @param {number} y @param {Set<number>} z
 */
function dSeparated(parents, children, x, y, z) {
  const ancestorsOfZ = closure([...z], parents);
  const visited = new Set();
  /** @type {[number, 'up' | 'down'][]} */
  const queue = [[x, 'up']];
  while (queue.length) {
    const [v, dir] = /** @type {[number, 'up' | 'down']} */ (queue.pop());
    const key = `${v}${dir}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (v === y && !z.has(v)) return false;
    if (dir === 'up' && !z.has(v)) {
      for (const p of parents[v]) queue.push([p, 'up']);
      for (const c of children[v]) queue.push([c, 'down']);
    } else if (dir === 'down') {
      if (!z.has(v)) for (const c of children[v]) queue.push([c, 'down']);
      if (ancestorsOfZ.has(v)) for (const p of parents[v]) queue.push([p, 'up']);
    }
  }
  return true;
}

/**
 * The adjustment criterion (Shpitser, VanderWeele and Robins 2010; Perković and
 * others 2018) for one exposure x and outcome y: z holds no descendant of a node on
 * a causal path from x to y, and blocks every non-causal path, which is d-separation
 * of x and y in the graph without the first edges of the causal paths.
 * @param {Structure} s @param {number} x @param {number} y @param {Set<number>} z
 * @returns {{ valid: boolean, forbidden: number[] }}
 */
function adjustmentCriterion(s, x, y, z) {
  const fromX = closure([x], s.children);
  const toY = closure([y], s.parents);
  const onCausal = [...fromX].filter((v) => v !== x && toY.has(v));
  const forbiddenSet = closure(onCausal, s.children);
  const forbidden = [...z].filter((v) => forbiddenSet.has(v));
  const children = s.children.map((list, i) => (i === x ? list.filter((c) => !onCausal.includes(c)) : list));
  const parents = s.parents.map((list, j) => (onCausal.includes(j) ? list.filter((p) => p !== x) : list));
  return { valid: forbidden.length === 0 && dSeparated(parents, children, x, y, z), forbidden };
}

/**
 * Every path between x and y in the graph (ignoring direction), up to LIMITS.maxPaths,
 * with whether it is causal and whether z leaves it open.
 * @param {Structure} s @param {string[]} ids @param {number} x @param {number} y @param {Set<number>} z
 */
function paths(s, ids, x, y, z) {
  const ancestorsOfZ = closure([...z], s.parents);
  /** @type {{ nodes: string[], arrows: ('→' | '←')[], causal: boolean, open: boolean, blockedBy: string[], openedBy: string[] }[]} */
  const found = [];
  let truncated = false;
  /** @param {number[]} trail */
  const walk = (trail) => {
    if (found.length >= LIMITS.maxPaths) { truncated = true; return; }
    const v = trail[trail.length - 1];
    if (v === y) {
      const arrows = trail.slice(1).map((w, i) => (s.children[trail[i]].includes(w) ? '→' : '←'));
      const blockedBy = [];
      const openedBy = [];
      for (let i = 1; i < trail.length - 1; i++) {
        const collider = arrows[i - 1] === '→' && arrows[i] === '←';
        if (collider) {
          if (ancestorsOfZ.has(trail[i])) openedBy.push(ids[trail[i]]);
          else blockedBy.push(ids[trail[i]]);
        } else if (z.has(trail[i])) blockedBy.push(ids[trail[i]]);
      }
      found.push({ nodes: trail.map((i) => ids[i]), arrows, causal: arrows.every((a) => a === '→'), open: blockedBy.length === 0, blockedBy, openedBy });
      return;
    }
    for (const w of [...s.children[v], ...s.parents[v]]) if (!trail.includes(w)) walk([...trail, w]);
  };
  walk([x]);
  return { list: found, truncated };
}

// ---------- The linear-Gaussian model ----------

/**
 * Each node's own noise variance: 1 ("unit"), or whatever makes the node's variance 1
 * ("standardized", the coefficients then being standardized path coefficients, as in
 * dagitty's impliedCovarianceMatrix and collider_effects_on_R2.R). A standardized
 * graph whose coefficients explain all of a node's variance is reported in `issues`.
 * @param {Graph} g @param {Noise} noise @param {Issue[]} [issues]
 */
function noiseVariances(g, noise, issues = []) {
  const s = structure(g);
  const sigma = Array.from({ length: s.n }, () => new Array(s.n).fill(0));
  const omega = new Array(s.n).fill(1);
  for (const j of s.order) {
    const ps = s.parents[j];
    for (const k of s.order) {
      if (k === j) break;
      let c = 0;
      for (const p of ps) c += s.B[p][j] * sigma[p][k];
      sigma[j][k] = sigma[k][j] = c;
    }
    let explained = 0;
    for (const p of ps) for (const q of ps) explained += s.B[p][j] * s.B[q][j] * sigma[p][q];
    if (noise === 'standardized') {
      omega[j] = 1 - explained;
      if (omega[j] <= 1e-9) {
        issues.push({ code: 'not_standardizable', path: 'params.graph', message: `the coefficients into ${g.nodes[j].id} explain ${Number((explained * 100).toPrecision(4))}% of its variance; standardized, they must explain less than all of it` });
        omega[j] = 1e-9;
      }
    }
    sigma[j][j] = explained + omega[j];
  }
  return { structure: s, covariance: sigma, noise: omega };
}

/**
 * The regression of `outcome` on `predictors` in the model's covariance: the
 * coefficients, the residual variance and R².
 * @param {number[][]} sigma @param {number} outcome @param {number[]} predictors
 */
function regression(sigma, outcome, predictors) {
  if (!predictors.length) return { coefficients: [], residual: sigma[outcome][outcome], r2: 0 };
  const A = predictors.map((i) => predictors.map((j) => sigma[i][j]));
  const b = predictors.map((i) => sigma[i][outcome]);
  const beta = /** @type {number[]} */ (solve(A, b)); // the covariance is positive definite
  const explained = beta.reduce((sum, bi, i) => sum + bi * b[i], 0);
  return { coefficients: beta, residual: sigma[outcome][outcome] - explained, r2: explained / sigma[outcome][outcome] };
}

/**
 * The 2 × 2 covariance of (x, y) given z (the Schur complement).
 * @param {number[][]} sigma @param {number} x @param {number} y @param {number[]} z
 */
function conditionalCovariance(sigma, x, y, z) {
  if (!z.length) return [[sigma[x][x], sigma[x][y]], [sigma[y][x], sigma[y][y]]];
  const A = z.map((i) => z.map((j) => sigma[i][j]));
  const bx = /** @type {number[]} */ (solve(A, z.map((i) => sigma[i][x])));
  const by = /** @type {number[]} */ (solve(A, z.map((i) => sigma[i][y])));
  const dot = (/** @type {number[]} */ w, /** @type {number} */ k) => w.reduce((sum, wi, i) => sum + wi * sigma[z[i]][k], 0);
  const cxy = sigma[x][y] - dot(bx, y);
  return [[sigma[x][x] - dot(bx, x), cxy], [cxy, sigma[y][y] - dot(by, y)]];
}

/** The total causal effect of x on y: the sum over directed paths of coefficient products. @param {Structure} s @param {number} x @param {number} y */
function totalEffect(s, x, y) {
  const effect = new Array(s.n).fill(0);
  effect[x] = 1;
  for (const j of s.order) for (const p of s.parents[j]) if (j !== x) effect[j] += s.B[p][j] * effect[p];
  return effect[y];
}

/** @param {number} bias @param {number} effect */
const isUnbiased = (bias, effect) => Math.abs(bias) <= 1e-9 * (1 + Math.abs(effect));

/**
 * Draws n points from the model in topological order and returns, for the plot, the
 * exposure and outcome with the adjustment set regressed out of each (so the slope
 * of the cloud is the adjusted coefficient), and that sample coefficient.
 * @param {Structure} s @param {number[]} omega @param {SampleSpec} spec @param {number} x @param {number} y @param {number[]} z
 */
function drawSample(s, omega, { n, seed }, x, y, z) {
  const rng = mulberry32(seed);
  const sd = omega.map(Math.sqrt);
  const data = Array.from({ length: n }, () => {
    const row = new Array(s.n).fill(0);
    for (const j of s.order) {
      let v = sd[j] * standardNormal(rng);
      for (const p of s.parents[j]) v += s.B[p][j] * row[p];
      row[j] = v;
    }
    return row;
  });
  const cols = [x, y, ...z];
  const means = cols.map((c) => data.reduce((sum, row) => sum + row[c], 0) / n);
  const centred = data.map((row) => cols.map((c, i) => row[c] - means[i]));
  const k = z.length;
  /** @param {number} col */
  const residual = (col) => {
    if (!k) return centred.map((row) => row[col]);
    const A = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (__, b) => centred.reduce((sum, row) => sum + row[2 + a] * row[2 + b], 0)));
    const rhs = Array.from({ length: k }, (_, a) => centred.reduce((sum, row) => sum + row[2 + a] * row[col], 0));
    const beta = solve(A, rhs) ?? new Array(k).fill(0);
    return centred.map((row) => row[col] - beta.reduce((sum, bi, a) => sum + bi * row[2 + a], 0));
  };
  const xr = residual(0);
  const yr = residual(1);
  const sxx = xr.reduce((sum, v) => sum + v * v, 0);
  const sxy = xr.reduce((sum, v, i) => sum + v * yr[i], 0);
  return { n, seed, coefficient: sxx > 0 ? sxy / sxx : null, points: xr.map((v, i) => [v, yr[i]]) };
}

/** @param {AdjustParams} p */
function adjust(p) {
  const { structure: s, covariance, noise } = noiseVariances(p.graph, p.noise);
  const ids = p.graph.nodes.map((n) => n.id);
  const at = (/** @type {string} */ id) => /** @type {number} */ (s.index.get(id));
  const x = at(p.exposure);
  const y = at(p.outcome);
  const effect = totalEffect(s, x, y);
  /** @param {string[]} set */
  const estimate = (set) => {
    const z = set.map(at);
    const fit = regression(covariance, y, [x, ...z]);
    const coefficient = fit.coefficients[0];
    const bias = coefficient - effect;
    const criterion = adjustmentCriterion(s, x, y, new Set(z));
    return { adjust: set, coefficient, bias, unbiased: isUnbiased(bias, effect), valid: criterion.valid, forbidden: criterion.forbidden.map((i) => ids[i]), r2: fit.r2 };
  };
  const here = estimate(p.adjust);
  const cond = conditionalCovariance(covariance, x, y, p.adjust.map(at));
  const candidates = p.graph.nodes.filter((n) => !n.latent && n.id !== p.exposure && n.id !== p.outcome).map((n) => n.id);
  const sets = candidates.length > LIMITS.maxSets ? null
    : Array.from({ length: 2 ** candidates.length }, (_, mask) => candidates.filter((__, i) => mask & (1 << i)))
      .sort((a, b) => a.length - b.length)
      .map((set) => { const e = estimate(set); return { adjust: e.adjust, coefficient: e.coefficient, bias: e.bias, unbiased: e.unbiased, valid: e.valid }; });
  const trails = paths(s, ids, x, y, new Set(p.adjust.map(at)));

  let frontDoor = null;
  if (p.mediator) {
    const m = at(p.mediator);
    const stage1 = regression(covariance, m, [x]).coefficients[0];
    const stage2 = regression(covariance, y, [m, x]).coefficients[0];
    const value = stage1 * stage2;
    // Pearl's front-door criterion for one mediator.
    const withoutM = s.children.map((list, i) => (i === m ? [] : list.filter((c) => c !== m)));
    const intercepts = !closure([x], withoutM).has(y);
    const noBackdoorToM = dSeparated(s.parents.map((list) => list.filter((q) => q !== x)), s.children.map((list, i) => (i === x ? [] : list)), x, m, new Set());
    const backdoorsBlocked = dSeparated(s.parents.map((list) => list.filter((q) => q !== m)), s.children.map((list, i) => (i === m ? [] : list)), m, y, new Set([x]));
    frontDoor = {
      mediator: p.mediator,
      exposureToMediator: stage1,
      mediatorToOutcome: stage2,
      estimate: value,
      bias: value - effect,
      unbiased: isUnbiased(value - effect, effect),
      criterion: intercepts && noBackdoorToM && backdoorsBlocked,
      conditions: { intercepts, noBackdoorToMediator: noBackdoorToM, backdoorsBlockedByExposure: backdoorsBlocked },
    };
  }

  return {
    view: 'adjust',
    nodes: ids,
    covariance,
    noiseVariances: noise,
    effect,
    estimate: {
      ...here,
      partialCorrelation: cond[0][1] / Math.sqrt(cond[0][0] * cond[1][1]),
      conditionalCovariance: cond,
    },
    paths: trails.list,
    pathsTruncated: trails.truncated,
    sets,
    frontDoor,
    sample: p.sample ? drawSample(s, noise, p.sample, x, y, p.adjust.map(at)) : null,
  };
}

// ---------- Many colliders: collider_effects_on_R2.R ----------

/** The script's grid of shares, 0 to 0.99 by 0.01 and 0.999. */
export const COLLIDER_SHARES = Object.freeze([...Array.from({ length: 100 }, (_, i) => i / 100), 0.999]);
/** The collider counts drawn as curves: 1 to 1,024 in powers of 4. */
export const COLLIDER_COUNTS = Object.freeze([1, 4, 16, 64, 256, 1024]);

/**
 * Y and U independent with unit variance; X₁…X_p each Cor rYX with Y and rUX with U,
 * so Cor(X_i, X_j) = rXX = rYX² + rUX², with rUX² = share × (1 − rYX²). Conditioning
 * on all p by the Schur complement, with the exchangeable block inverted in closed
 * form (the script's Sherman–Morrison step).
 * @param {number} p @param {number} rYX @param {number} share
 */
export function colliderConditioning(p, rYX, share) {
  const rXX = rYX * rYX + share * (1 - rYX * rYX);
  const rUX = Math.sqrt(rXX - rYX * rYX);
  // 1ᵀC⁻¹1 = p / d for C = (1 − rXX)I + rXX 11ᵀ, d = 1 + (p − 1) rXX. The conditional
  // variances are written without the cancellation in 1 − (p/d) r², which loses
  // digits when the colliders explain nearly all of Y or U.
  const d = 1 + (p - 1) * rXX;
  const varY = (1 - rXX + p * rUX * rUX) / d;
  const varU = (1 - rXX + p * rYX * rYX) / d;
  const covYU = (-p * rYX * rUX) / d;
  return { rXX, rUX, r2: 1 - varY, partialCorrelation: covYU / Math.sqrt(varY * varU), semipartialCorrelation: covYU / Math.sqrt(varY), covariance: covYU };
}

/** @param {CollidersParams} p */
function colliders({ colliders: count, rYX, share }) {
  const here = colliderConditioning(count, rYX, share);
  const counts = [...new Set([...COLLIDER_COUNTS, count])].sort((a, b) => a - b);
  return {
    view: 'colliders',
    colliders: count,
    rYX,
    share,
    ...here,
    curves: {
      shares: [...COLLIDER_SHARES],
      byCount: counts.map((c) => {
        const points = COLLIDER_SHARES.map((sh) => colliderConditioning(c, rYX, sh));
        return { colliders: c, r2: points.map((pt) => pt.r2), partialCorrelation: points.map((pt) => pt.partialCorrelation) };
      }),
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
  return p.view === 'adjust' ? adjust(p) : colliders(p);
}
