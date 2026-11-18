import { checkRequestKeys, invalidRequest } from '../shared/request.js';
import { cholesky, dot } from '../intuitions/lib/linalg.js';
import { pnorm, pnormInterval, qnorm } from '../intuitions/lib/normal.js';
import { mulberry32 } from '../shared/rng.js';

/** @typedef {{itemId:string,title:string}} Item */
/** @typedef {{weight:number,mean:number[],covariance:number[][]}} Component */
/** @typedef {{kind:string,cuts:number[],endpoint?:number,components:Component[]}} Model */
/** @typedef {{name:string,items:Item[],scale:number[],scaleLabels?:string[],models:Record<string,Model>}} Catalog */
/** @typedef {{model:string,ratings?:Record<string,number>,threshold?:number,samples?:number}} Request */
/** @param {number[]} a */
const increasing = (a) => Array.isArray(a) && a.every((v, i) => Number.isFinite(v) && (!i || v > a[i - 1]));
/** @param {unknown} ok @param {string} message */
function requireValue(ok, message) {
  if (!ok) throw invalidRequest('$', message);
}

/** @param {Catalog} catalog */
export function validateCatalog(catalog) {
  requireValue(catalog && typeof catalog === 'object', 'Expected a fitted catalog.');
  const { name, scale, items, models } = catalog;
  requireValue(
    typeof name === 'string' && name.length && increasing(scale) && scale.length >= 2,
    'Expected a named, increasing rating scale.',
  );
  if (catalog.scaleLabels !== undefined)
    requireValue(
      Array.isArray(catalog.scaleLabels) &&
        catalog.scaleLabels.length === scale.length &&
        catalog.scaleLabels.every((s) => typeof s === 'string' && s.length),
      'Expected one label per rating.',
    );
  requireValue(
    Array.isArray(items) &&
      items.length &&
      items.every((i) => i && typeof i.itemId === 'string' && i.itemId && typeof i.title === 'string') &&
      new Set(items.map((i) => i.itemId)).size === items.length,
    'Expected unique string item IDs and titles.',
  );
  requireValue(
    models && typeof models === 'object' && !Array.isArray(models) && Object.keys(models).length,
    'Expected at least one fitted model.',
  );
  const d = items.length;
  for (const model of Object.values(models)) {
    requireValue(model && typeof model === 'object', 'Expected model parameters.');
    const { kind, components, cuts } = model;
    requireValue(
      ['ordinal-probit', 'logit-point'].includes(kind) &&
        increasing(cuts) &&
        cuts.length === scale.length - 1,
      'Invalid model family or category cutpoints.',
    );
    if (kind === 'logit-point')
      requireValue(
        Number.isFinite(model.endpoint) &&
          scale[0] > 0 &&
          model.endpoint > scale.at(-2) &&
          model.endpoint < scale.at(-1) &&
          components?.length === 1,
        'Invalid logit reference.',
      );
    requireValue(
      Array.isArray(components) &&
        components.length &&
        components.every((c) => c && typeof c === 'object') &&
        Math.abs(components.reduce((s, c) => s + c.weight, 0) - 1) < 1e-7,
      'Component weights must sum to one.',
    );
    for (const { weight, mean, covariance: S } of components) {
      requireValue(
        Number.isFinite(weight) &&
          weight > 0 &&
          Array.isArray(mean) &&
          mean.length === d &&
          mean.every(Number.isFinite) &&
          Array.isArray(S) &&
          S.length === d &&
          S.every((row) => Array.isArray(row) && row.length === d && row.every(Number.isFinite)),
        'Invalid component dimensions or values.',
      );
      requireValue(
        S.every((row, i) => row.every((v, j) => Math.abs(v - S[j][i]) < 1e-9)) && cholesky(S),
        'Covariance must be symmetric positive definite.',
      );
    }
  }
  return catalog;
}

/** @param {number[][]} L @param {number[]} b */
function forward(L, b) {
  const z = [];
  for (let j = 0; j < b.length; j++) {
    let v = b[j];
    for (let i = 0; i < j; i++) v -= L[j][i] * z[i];
    z.push(v / L[j][j]);
  }
  return z;
}

// Stratified uniforms for sequential truncated-normal importance sampling (GHK).
/** @param {number} n @param {number} d */
function uniforms(n, d) {
  const rand = mulberry32(7121);
  return Array.from({ length: d }, () => {
    const p = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  });
}

/** @param {Component} component @param {Model} model @param {number[]} obs @param {number[]} values @param {number[]} scale @param {number[][]} L @param {number[][]} uniform */
function draws(component, model, obs, values, scale, L, uniform) {
  if (!obs.length) return [{ z: [], logWeight: Math.log(component.weight) }];
  if (model.kind === 'logit-point') {
    const centered = obs.map((i, j) => {
      const x = Math.min(scale[values[j]], model.endpoint);
      return Math.log(x / (scale.at(-1) - x)) - component.mean[i];
    });
    return [{ z: forward(L, centered), logWeight: 0 }];
  }
  const cuts = [-Infinity, ...model.cuts, Infinity];
  const n = uniform[0].length;
  return Array.from({ length: n }, (_, s) => {
    const z = [];
    let logWeight = Math.log(component.weight / n);
    for (let j = 0; j < obs.length; j++) {
      let m = component.mean[obs[j]];
      for (let h = 0; h < j; h++) m += L[j][h] * z[h];
      const a = (cuts[values[j]] - m) / L[j][j],
        b = (cuts[values[j] + 1] - m) / L[j][j];
      const mass = pnormInterval(a, b);
      if (!mass) return { z, logWeight: -Infinity };
      logWeight += Math.log(mass);
      const u = uniform[j][s];
      z.push(a > 0 ? -qnorm(pnorm(-b) + u * mass) : qnorm(pnorm(a) + u * mass));
    }
    return { z, logWeight };
  });
}

/** @param {number[]} scale */
export const defaultCutoff = (scale) => scale[Math.round((scale.length - 1) * 0.75)];

/** Predict with a previously validated catalog. Each observation is an itemId → rating pair.
 * @param {Catalog} catalog @param {Request} request */
export function predict(
  catalog,
  { model: key, ratings = {}, threshold = defaultCutoff(catalog.scale), samples = 256 },
) {
  const { items, scale } = catalog;
  const model = Object.hasOwn(catalog.models, key) && catalog.models[key];
  requireValue(model && scale.includes(threshold), 'Choose a fitted model and a cutoff on its scale.');
  requireValue(
    ratings &&
      typeof ratings === 'object' &&
      !Array.isArray(ratings) &&
      Number.isInteger(samples) &&
      samples >= 16 &&
      samples <= 8192,
    'Expected an item-to-rating object and 16–8192 samples.',
  );
  const indices = new Map(items.map((it, i) => [it.itemId, i]));
  for (const [id, v] of Object.entries(ratings))
    requireValue(indices.has(id) && scale.includes(v), 'Unknown item or rating outside the scale.');
  const obs = items.flatMap((it, i) => (Object.hasOwn(ratings, it.itemId) ? [i] : []));
  const values = obs.map((i) => scale.indexOf(ratings[items[i].itemId]));
  const uniform = model.kind === 'ordinal-probit' ? uniforms(samples, obs.length) : [];
  const blocks = model.components.map((c) => {
    const L = cholesky(obs.map((i) => obs.map((j) => c.covariance[i][j])));
    return { c, L, draws: draws(c, model, obs, values, scale, L, uniform) };
  });
  const max = blocks.reduce((m, b) => b.draws.reduce((a, s) => Math.max(a, s.logWeight), m), -Infinity);
  requireValue(Number.isFinite(max), 'Observation likelihood below numerical precision.');
  const weights = blocks.map((b) => b.draws.map((s) => Math.exp(s.logWeight - max)));
  const masses = weights.map((w) => w.reduce((a, b) => a + b, 0));
  const total = masses.reduce((a, b) => a + b, 0);
  const cuts = [-Infinity, ...model.cuts, Infinity];
  const predictions = [];
  for (let i = 0; i < items.length; i++) {
    if (Object.hasOwn(ratings, items[i].itemId)) continue;
    const probs = scale.map(() => 0);
    let prior = 0;
    for (const [g, { c, L, draws: states }] of blocks.entries()) {
      const sd = Math.sqrt(c.covariance[i][i]);
      // If C=LL', beta=L^-1 Cov(observed,target) yields both Schur terms.
      const beta = forward(
        L,
        obs.map((j) => c.covariance[i][j]),
      );
      const condSD = Math.sqrt(c.covariance[i][i] - dot(beta, beta));
      requireValue(condSD > 0, 'Nonpositive conditional variance.');
      for (let t = 0; t < scale.length; t++)
        prior += c.weight * scale[t] * pnormInterval(cuts[t], cuts[t + 1], c.mean[i], sd);
      for (const [s, state] of states.entries()) {
        const w = weights[g][s] / total;
        if (!w) continue;
        const m = c.mean[i] + dot(beta, state.z);
        for (let t = 0; t < scale.length; t++) probs[t] += w * pnormInterval(cuts[t], cuts[t + 1], m, condSD);
      }
    }
    const expected = dot(probs, scale);
    const variance = probs.reduce((v, p, j) => v + p * (scale[j] - expected) ** 2, 0);
    const chance = probs.slice(scale.indexOf(threshold)).reduce((a, b) => a + b, 0);
    predictions.push({
      ...items[i],
      expected,
      prior: obs.length ? prior : expected,
      shift: obs.length ? expected - prior : 0,
      sd: Math.sqrt(variance),
      chance,
      probabilities: probs,
    });
  }
  return {
    threshold,
    scale,
    weights: masses.map((v, g) => ({
      prior: blocks[g].c.weight,
      posterior: v / total,
      effectiveSamples:
        obs.length && model.kind === 'ordinal-probit' && v > 0 ? (v * v) / dot(weights[g], weights[g]) : null,
    })),
    predictions: predictions.sort((a, b) => b.expected - a.expected),
  };
}

/** @param {Request & {catalog:Catalog}} input */
export function submit(input) {
  checkRequestKeys(input, ['catalog', 'model', 'ratings', 'threshold', 'samples']);
  const { catalog, ...request } = input;
  return predict(validateCatalog(catalog), request);
}
