import { modelEvidence } from './evidence.mjs';
import { latestRatingDate, populationModel, validRatingDate } from './calendar.mjs';
import { checkRequestKeys, invalidRequest } from '../shared/request.js';
import { cholesky, dot, symmetricEigen } from '../intuitions/lib/linalg.js';
import { pnorm, pnormInterval, qnorm } from '../intuitions/lib/normal.js';
import { mulberry32 } from '../shared/rng.js';

/** @typedef {{itemId:string,title:string}} Item */
/** @typedef {{weight:number,mean?:number[],covariance?:number[][],probabilities?:number[][]}} Component */
/** @typedef {{weight:number,items:number[][][]}} CreatorSimilarity */
/** @typedef {{kind:string,cuts?:number[],endpoint?:number,components?:Component[],base?:string,features?:number[][],ridge?:number,strength?:number,similarityFrom?:string,creatorSimilarity?:CreatorSimilarity,titleChoice?:string|{strength:number,logRatios:number[][]},ratingYear?:string|{strength:number,firstYear:number,lastYear:number,counts:number[][]}}} Model */
/** @typedef {{name:string,defaultModel?:string,items:Item[],scale:number[],scaleLabels?:string[],models:Record<string,Model>}} Catalog */
/** @typedef {{model?:string,ratings?:Record<string,number>,threshold?:number,samples?:number,volunteered?:string[],ratedOn?:Record<string,string>,targetId?:string}} Request */
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
  if (catalog.defaultModel !== undefined)
    requireValue(
      typeof catalog.defaultModel === 'string' && Object.hasOwn(models, catalog.defaultModel),
      'The catalog default must name a fitted model.',
    );
  const d = items.length;
  for (const model of Object.values(models)) {
    requireValue(model && typeof model === 'object', 'Expected model parameters.');
    const { kind, components, cuts } = model;
    if (kind === 'class-similarity') {
      const { base, features, ridge, strength } = model;
      requireValue(
        typeof base === 'string' && Object.hasOwn(models, base) && models[base]?.kind === 'latent-class',
        'The similarity model must reference a fitted latent-class model.',
      );
      if (model.creatorSimilarity !== undefined) {
        const credits = model.creatorSimilarity;
        const source = model.similarityFrom === undefined ? model : models[model.similarityFrom];
        requireValue(
          credits &&
            Number.isFinite(credits.weight) &&
            credits.weight > 0 &&
            credits.weight < (source?.ridge ?? 0) &&
            Array.isArray(credits.items) &&
            credits.items.length === d &&
            credits.items.every(
              (roles) =>
                Array.isArray(roles) &&
                roles.length === 3 &&
                roles.every(
                  (ids) =>
                    Array.isArray(ids) &&
                    new Set(ids).size === ids.length &&
                    ids.every((id) => Number.isSafeInteger(id) && id >= 0),
                ) &&
                roles.some((ids) => ids.length),
            ),
          'Creator similarity requires three credit lists per item and a weight below the similarity ridge.',
        );
      }
      if (model.titleChoice !== undefined) {
        const choice = modelEvidence(catalog, model, 'titleChoice');
        requireValue(
          choice &&
            Number.isFinite(choice.strength) &&
            choice.strength > 0 &&
            Array.isArray(choice.logRatios) &&
            choice.logRatios.length === models[base].components?.length &&
            choice.logRatios.every(
              (row) => Array.isArray(row) && row.length === d && row.every(Number.isFinite),
            ),
          'Title-choice evidence requires a positive strength and a finite class-by-item table.',
        );
      }
      if (model.ratingYear !== undefined) {
        const calendar = modelEvidence(catalog, model, 'ratingYear');
        requireValue(
          calendar &&
            Number.isSafeInteger(calendar.firstYear) &&
            calendar.firstYear >= 1 &&
            Number.isSafeInteger(calendar.lastYear) &&
            calendar.lastYear <= 9999 &&
            calendar.lastYear >= calendar.firstYear &&
            Number.isFinite(calendar.strength) &&
            calendar.strength > 0 &&
            calendar.strength <= 1 &&
            Array.isArray(calendar.counts) &&
            calendar.counts.length === calendar.lastYear - calendar.firstYear + 1 &&
            calendar.counts.every(
              (row) =>
                Array.isArray(row) &&
                row.length === d * scale.length &&
                row.every((n) => Number.isSafeInteger(n) && n >= 0),
            ),
          'Rating-year calibration requires ordered years, a strength in (0, 1] and a complete table of nonnegative category counts.',
        );
      }
      if (model.similarityFrom !== undefined) {
        const source =
          typeof model.similarityFrom === 'string' &&
          Object.hasOwn(models, model.similarityFrom) &&
          models[model.similarityFrom];
        requireValue(
          source &&
            source.kind === kind &&
            source.base === base &&
            source.similarityFrom === undefined &&
            model.features === undefined &&
            ridge === undefined &&
            strength === undefined,
          'Inherited film similarities must reference a direct similarity fit with the same classes.',
        );
        continue;
      }
      requireValue(
        Number.isFinite(ridge) && ridge > 0 && Number.isFinite(strength) && strength >= 0,
        'Invalid similarity ridge penalty or tilt strength.',
      );
      requireValue(
        Array.isArray(features) &&
          features.length === d &&
          Array.isArray(features[0]) &&
          features[0].length > 0 &&
          features.every(
            (row) =>
              Array.isArray(row) &&
              row.length === features[0].length &&
              row.every(Number.isFinite) &&
              dot(row, row) <= 1 + 1e-8,
          ),
        'Expected one bounded, equal-length similarity vector per item.',
      );
      continue;
    }
    requireValue(
      Array.isArray(components) &&
        components.length &&
        components.every((c) => c && typeof c === 'object') &&
        Math.abs(components.reduce((s, c) => s + c.weight, 0) - 1) < 1e-7,
      'Component weights must sum to one.',
    );
    if (kind === 'latent-class') {
      for (const { weight, probabilities } of components) {
        requireValue(
          Number.isFinite(weight) &&
            weight > 0 &&
            Array.isArray(probabilities) &&
            probabilities.length === d &&
            probabilities.every(
              (row) =>
                Array.isArray(row) &&
                row.length === scale.length &&
                row.every((p) => Number.isFinite(p) && p >= 0 && p <= 1) &&
                Math.abs(row.reduce((sum, p) => sum + p, 0) - 1) < 1e-8,
            ),
          'Each latent-class item needs a probability distribution on the rating scale.',
        );
      }
      continue;
    }
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

// Rank the same set of unrated items on both sides. Tied means share a place.
export function rankChanges(predictions) {
  const ranks = (key) => {
    const sorted = [...predictions].sort((a, b) => b[key] - a[key]);
    let place = 0;
    return new Map(
      sorted.map((p, i) => {
        if (!i || Math.abs(p[key] - sorted[place - 1][key]) > 1e-10) place = i + 1;
        return [p.itemId, place];
      }),
    );
  };
  const before = ranks('prior'),
    after = ranks('expected');
  return new Map(
    predictions.map(({ itemId }) => {
      const from = before.get(itemId),
        to = after.get(itemId);
      return [itemId, { from, to, change: from - to }];
    }),
  );
}

function summarize(item, probs, prior, personalized, scale, threshold) {
  const expected = dot(probs, scale);
  const variance = probs.reduce((v, p, j) => v + p * (scale[j] - expected) ** 2, 0);
  const chance = probs.slice(scale.indexOf(threshold)).reduce((a, b) => a + b, 0);
  return {
    ...item,
    expected,
    prior: personalized ? prior : expected,
    shift: personalized ? expected - prior : 0,
    sd: Math.sqrt(variance),
    chance,
    probabilities: probs,
  };
}

function classMasses(logWeights) {
  const max = Math.max(...logWeights);
  requireValue(Number.isFinite(max), 'All classes assign zero probability to these observations.');
  const masses = logWeights.map((v) => Math.exp(v - max));
  const total = masses.reduce((a, b) => a + b, 0);
  return masses.map((v) => v / total);
}

function solveTransposedFactor(L, coef) {
  for (let j = coef.length - 1; j >= 0; j--) {
    for (let i = j + 1; i < coef.length; i++) coef[j] -= L[i][j] * coef[i];
    coef[j] /= L[j][j];
  }
  return coef;
}

// Sparse director, cast and studio membership. Build just the observed rows
// of the credit matrix. Distinct roles have independent ID namespaces.
/** @param {CreatorSimilarity} credits @param {number[]} obs */
function creditSimilarities(credits, obs) {
  const postings = [new Map(), new Map(), new Map()];
  const normalized = credits.items.map((roles, i) => {
    const active = roles.filter((ids) => ids.length).length;
    return roles.map((ids, k) => {
      const scale = ids.length ? 1 / Math.sqrt(active * ids.length) : 0;
      for (const id of ids) {
        if (!postings[k].has(id)) postings[k].set(id, []);
        postings[k].get(id).push([i, scale]);
      }
      return scale;
    });
  });
  return obs.map((i) => {
    const row = new Float64Array(credits.items.length);
    for (const [k, ids] of credits.items[i].entries()) {
      for (const id of ids) {
        for (const [j, scale] of postings[k].get(id)) row[j] += credits.weight * normalized[i][k] * scale;
      }
    }
    row[i] = 0; // Preserve the existing self-similarity and ridge on the diagonal.
    return row;
  });
}

// Use the smaller feature or observation system. A separate shared-credit
// kernel requires observation space, including its original diagonal convention.
function similarityFactor({ features, ridge }, credits, obs) {
  const rows = obs.map(i => features[i]);
  const extra = credits ? creditSimilarities(credits, obs) : null;
  const dual = extra !== null || rows.length <= rows[0].length;
  const basis = dual ? rows : rows[0].map((_, j) => rows.map(row => row[j]));
  const factor = cholesky(basis.map((a, i) => basis.map((b, j) =>
    dot(a, b) + (i === j ? ridge : 0) + (extra?.[i][obs[j]] ?? 0))));
  requireValue(factor, 'Could not factor the similarity ridge system.');
  return { rows, basis, extra, dual, factor };
}

function similarityTransfer(similarity, credits, obs, residuals) {
  const { features } = similarity;
  const { rows, basis, extra, dual, factor } = similarityFactor(similarity, credits, obs);
  const right = dual ? residuals : basis.map(col => dot(col, residuals));
  const solved = solveTransposedFactor(factor, forward(factor, right));
  const beta = dual ? rows[0].map((_, j) => rows.reduce((s, row, i) => s + solved[i] * row[j], 0)) : solved;
  return (i) =>
    dot(features[i], beta) + (extra ? extra.reduce((sum, row, h) => sum + row[i] * solved[h], 0) : 0);
}

// Summing finite evidence separately lets a held-out structural zero restore a class.
function classEvidence(model, items, obs, values, inputModels, choice, volunteered) {
  const logs = model.components.map((component, k) =>
    obs.map((i, j) => {
      const distribution = (inputModels?.[j]?.components[k] ?? component).probabilities[i];
      const title =
        choice && volunteered.has(items[i].itemId) ? choice.strength * choice.logRatios[k][i] : 0;
      return Math.log(distribution[values[j]]) + title;
    }),
  );
  const sums = logs.map((row, k) =>
    row.reduce((s, x) => (x === -Infinity ? s : s + x), Math.log(model.components[k].weight)),
  );
  const zeros = logs.map((row) => row.filter((x) => x === -Infinity).length);
  return (first = -1, second = -1) =>
    classMasses(
      sums.map((sum, k) => {
        let count = zeros[k];
        for (const j of [first, second]) {
          if (j < 0) continue;
          if (logs[k][j] === -Infinity) count--;
          else sum -= logs[k][j];
        }
        return count ? -Infinity : sum;
      }),
    );
}

function classForecast(model, weights, i, scale, tilt) {
  const probs = scale.map((_, j) =>
    weights.reduce((sum, w, k) => sum + w * model.components[k].probabilities[i][j], 0),
  );
  if (tilt) {
    const center = (scale[0] + scale.at(-1)) / 2;
    const tilted = probs.map(
      (p, j) => p * Math.exp(Math.min(50, Math.max(-50, tilt * (scale[j] - center)))),
    );
    const sum = tilted.reduce((a, b) => a + b, 0);
    return tilted.map((p) => p / sum);
  }
  return probs;
}

function predictLatentClass(
  model,
  items,
  scale,
  obs,
  values,
  threshold,
  targets,
  similarity = null,
  choice = null,
  volunteered = new Set(),
  inputModels = null,
  credits = null,
) {
  const posterior = classEvidence(model, items, obs, values, inputModels, choice, volunteered);
  const post = posterior();
  const weights = model.components.map((c, k) => ({
    prior: c.weight,
    posterior: post[k],
    effectiveSamples: null,
  }));
  let transfer;
  if (similarity && obs.length && obs.length < items.length) {
    const residuals = obs.map((i, j) => {
      const leaveOneOut = posterior(j);
      const mean = model.components.reduce(
        (sum, c, k) =>
          sum + leaveOneOut[k] * dot((inputModels?.[j]?.components[k] ?? c).probabilities[i], scale),
        0,
      );
      return scale[values[j]] - mean;
    });
    transfer = similarityTransfer(similarity, credits, obs, residuals);
  }
  const observed = new Set(obs);
  const predictions = [];
  for (const i of targets) {
    if (observed.has(i)) continue;
    const item = items[i];
    const probs = classForecast(model, post, i, scale, transfer ? similarity.strength * transfer(i) : 0);
    const prior = model.components.reduce((sum, c) => sum + c.weight * dot(c.probabilities[i], scale), 0);
    predictions.push(summarize(item, probs, prior, obs.length > 0, scale, threshold));
  }
  return { scale, threshold, weights, predictions: predictions.sort((a, b) => b.expected - a.expected) };
}

// Evaluate each shared category boundary once, using the smaller normal tail.
function accumulateNormal(probs, cuts, mean, sd, weight) {
  let previousTail = 0,
    previousRight = false;
  for (let j = 0; j < cuts.length; j++) {
    const z = (cuts[j] - mean) / sd,
      right = z > 0,
      tail = pnorm(-Math.abs(z));
    const mass = previousRight ? previousTail - tail : right ? 1 - previousTail - tail : tail - previousTail;
    probs[j] += weight * mass;
    previousTail = tail;
    previousRight = right;
  }
  probs[cuts.length] += weight * (previousRight ? previousTail : 1 - previousTail);
}

/** Predict with a previously validated catalog. Each observation is an itemId → rating pair.
 * @param {Catalog} catalog @param {Request} request */
function predictionInputs(
  catalog,
  {
    model: key = catalog.defaultModel,
    ratings = {},
    volunteered = [],
    ratedOn = {},
    threshold = defaultCutoff(catalog.scale),
    samples = 256,
    targetId,
  },
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
  requireValue(
    Array.isArray(volunteered) &&
      volunteered.every((id) => typeof id === 'string' && Object.hasOwn(ratings, id)) &&
      new Set(volunteered).size === volunteered.length,
    'Volunteered titles must be unique IDs with supplied ratings.',
  );
  requireValue(
    ratedOn &&
      typeof ratedOn === 'object' &&
      !Array.isArray(ratedOn) &&
      Object.entries(ratedOn).every(([id, date]) => Object.hasOwn(ratings, id) && validRatingDate(date)),
    'Rating dates must be valid YYYY-MM-DD dates for supplied item IDs.',
  );
  const obs = items.flatMap((it, i) => (Object.hasOwn(ratings, it.itemId) ? [i] : []));
  const values = obs.map((i) => scale.indexOf(ratings[items[i].itemId]));
  requireValue(
    targetId === undefined || (indices.has(targetId) && !Object.hasOwn(ratings, targetId)),
    'The forecast target must be an unrated catalog item.',
  );
  return {
    items,
    scale,
    model,
    obs,
    values,
    ratedOn,
    volunteered,
    threshold,
    samples,
    ratings,
    targets: targetId === undefined ? items.keys() : [indices.get(targetId)],
  };
}

/** @param {Catalog} catalog @param {Request} request */
export function predict(catalog, request) {
  const {items, scale, model, obs, values, ratedOn, volunteered, threshold, samples, ratings, targets} =
    predictionInputs(catalog, request);
  if (model.kind === 'class-similarity') {
    const date = model.ratingYear ? latestRatingDate(ratedOn) : '';
    return predictLatentClass(
      populationModel(catalog, model, date),
      items,
      scale,
      obs,
      values,
      threshold,
      targets,
      model.similarityFrom !== undefined ? catalog.models[model.similarityFrom] : model,
      modelEvidence(catalog, model, 'titleChoice'),
      new Set(volunteered),
      date ? obs.map((i) => populationModel(catalog, model, ratedOn[items[i].itemId])) : null,
      model.creatorSimilarity,
    );
  }
  if (model.kind === 'latent-class') return predictLatentClass(model, items, scale, obs, values, threshold, targets);
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
  for (const i of targets) {
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
        accumulateNormal(probs, model.cuts, m, condSD, w);
      }
    }
    predictions.push(summarize(items[i], probs, prior, obs.length > 0, scale, threshold));
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

// Kernel ridge regression after omitting row i. The cross-weights are
// -P[i,j]/P[i,i] in the dual system, or H[i,j]/(1-H[i,i]) in feature space.
function heldOutKernel(similarity, credits, obs) {
  const {rows, dual, factor} = similarityFactor(similarity, credits, obs);
  if (!dual) {
    const whitened = rows.map(row => forward(factor, row));
    return i => {
      const denom = 1 - dot(whitened[i], whitened[i]);
      requireValue(denom > 0, 'Unresolved held-out ridge leverage.');
      return j => dot(whitened[i], whitened[j]) / denom;
    };
  }
  return (i) => {
    const unit = obs.map((_, j) => Number(i === j));
    const column = solveTransposedFactor(factor, forward(factor, unit));
    return (j) => -column[j] / column[i];
  };
}

/** Score applied ratings from their remaining answers. The reported gap is observed minus predicted.
 * @param {Catalog} catalog @param {Request} request */
export function heldOutRatings(catalog, request = {}) {
  const { items, scale, model, obs, values, ratings, ratedOn, volunteered } = predictionInputs(
    catalog,
    request,
  );
  if (!obs.length) return [];
  const makeRow = (j, probs) => {
    const { itemId, title } = items[obs[j]],
      observed = scale[values[j]],
      expected = dot(probs, scale);
    return { itemId, title, observed, expected, gap: observed - expected, probability: probs[values[j]] };
  };
  if (!['latent-class', 'class-similarity'].includes(model.kind)) {
    return obs.map((i, j) => {
      const targetId = items[i].itemId,
        remaining = { ...ratings },
        dates = { ...ratedOn };
      delete remaining[targetId];
      delete dates[targetId];
      const p = predict(catalog, {
        ...request,
        targetId,
        ratings: remaining,
        ratedOn: dates,
        volunteered: volunteered.filter((id) => id !== targetId),
      }).predictions[0];
      return makeRow(j, p.probabilities);
    });
  }
  const base = populationModel(catalog, model);
  const dates = model.ratingYear ? obs.map((i) => ratedOn[items[i].itemId] ?? '') : [];
  const latest = [...dates].sort().reverse().slice(0, 2);
  const inputModels = dates.length ? dates.map((date) => populationModel(catalog, model, date)) : null;
  const posterior = classEvidence(
    base,
    items,
    obs,
    values,
    inputModels,
    modelEvidence(catalog, model, 'titleChoice'),
    new Set(volunteered),
  );
  const similarity =
    model.kind === 'class-similarity' ? (catalog.models[model.similarityFrom] ?? model) : null;
  const kernel =
    similarity && obs.length > 1 ? heldOutKernel(similarity, model.creatorSimilarity, obs) : null;
  const means = kernel
    ? obs.map((i, j) => (inputModels?.[j] ?? base).components.map((c) => dot(c.probabilities[i], scale)))
    : null;
  return obs.map((i, j) => {
    let transfer = 0;
    if (kernel) {
      const weight = kernel(j);
      for (let h = 0; h < obs.length; h++) {
        if (h === j) continue;
        // The residual at h must itself be predicted without either h or j.
        const forecast = dot(posterior(j, h), means[h]);
        transfer += weight(h) * (scale[values[h]] - forecast);
      }
    }
    const date = dates[j] === latest[0] ? latest[1] : latest[0];
    const targetModel = populationModel(catalog, model, date);
    return makeRow(
      j,
      classForecast(targetModel, posterior(j), i, scale, similarity ? similarity.strength * transfer : 0),
    );
  });
}

/** @param {Request & {catalog:Catalog}} input */
export function submit(input) {
  checkRequestKeys(input, ['catalog', 'model', 'ratings', 'volunteered', 'ratedOn', 'threshold', 'samples', 'targetId']);
  const { catalog, ...request } = input;
  return predict(validateCatalog(catalog), request);
}

// Population PCs stay fixed when ratings change. Conditioning only requires
// the two projected-to-observed covariance rows and the observed Cholesky block.
const gaussianAxes = new WeakMap();
export function gaussianProjection(
  catalog,
  { model: key, ratings = {}, samples = 256, axisIndices = undefined, centerClassMeans = false, overview = false, minimumMapShare = 0 },
) {
  const { components, kind } = catalog.models[key],
    model = catalog.models[key];
  requireValue(
    kind === 'logit-point' || kind === 'ordinal-probit',
    'Projection requires Gaussian liabilities.',
  );
  if (!gaussianAxes.has(model)) gaussianAxes.set(model, new Map());
  const cached = gaussianAxes.get(model);
  let basis = cached.get(centerClassMeans);
  if (!basis) {
    const ids = catalog.items.map((_, i) => i),
      center = ids.map((i) => components.reduce((s, c) => s + c.weight * c.mean[i], 0));
    const total = ids.map((i) =>
      ids.map((j) =>
        components.reduce(
          (s, c) => s + c.weight * (c.covariance[i][j] + (c.mean[i] - center[i]) * (c.mean[j] - center[j])),
          0,
        ),
      ),
    );
    // Remove the all-items direction from the display covariance (H C H).
    // The original components still condition on the supplied scores.
    if (centerClassMeans) {
      const rowMeans = total.map(row => row.reduce((a, b) => a + b, 0) / ids.length);
      const grand = rowMeans.reduce((a, b) => a + b, 0) / ids.length;
      total.forEach((row, i) => row.forEach((v, j) => { row[j] = v - rowMeans[i] - rowMeans[j] + grand; }));
    }
    const eig = symmetricEigen(total);
    const values = centerClassMeans ? eig.values.filter(v => v > Math.max(1e-12, eig.values[0] * 1e-10)) : eig.values;
    const trace = values.reduce((a, v) => a + Math.max(0, v), 0);
    const spectrum = values.map(v => Math.max(0, v) / trace);
    const all = values.map((variance, index) => {
      const loadings = eig.vectors[index];
      return { index, fraction: spectrum[index], loadings, variance,
        high: loadings.indexOf(Math.max(...loadings)), low: loadings.indexOf(Math.min(...loadings)) };
    });
    basis = { center, all, spectrum, calculated: new Map() };
    cached.set(centerClassMeans, basis);
  }
  // Only the chosen map axes need full conditional covariance products.
  const indices = axisIndices ?? basis.all.slice(0, 2)
    .filter(axis => axis.index === 0 || axis.fraction >= minimumMapShare).map(axis => axis.index);
  requireValue(
    Array.isArray(indices) &&
      (indices.length >= 1 || !basis.all.length) &&
      indices.length <= 2 &&
      new Set(indices).size === indices.length &&
      indices.every((i) => Number.isInteger(i) && i >= 0 && i < basis.spectrum.length),
    'Choose one or two distinct principal component indices within this catalog.',
  );
  const axes = indices.map((index) => {
    if (!basis.calculated.has(index)) {
      const axis = basis.all[index], v = axis.loadings;
      basis.calculated.set(index, {
        ...axis,
        scores: components.map((c) => dot(v, c.mean) - dot(v, basis.center)),
        cross: components.map((c) => c.covariance.map((row) => dot(row, v))),
      });
    }
    return basis.calculated.get(index);
  });
  const obs = catalog.items.flatMap((it, i) => (Object.hasOwn(ratings, it.itemId) ? [i] : []));
  const values = obs.map((i) => catalog.scale.indexOf(ratings[catalog.items[i].itemId]));
  requireValue(
    Object.keys(ratings).length === obs.length &&
      values.every((v) => v >= 0) &&
      Number.isInteger(samples) &&
      samples >= 16 &&
      samples <= 8192,
    'Invalid projection ratings or sample count.',
  );
  const uniform = kind === 'ordinal-probit' ? uniforms(samples, obs.length) : [];
  const blocks = components.map((c, k) => {
    const L = cholesky(obs.map((i) => obs.map((j) => c.covariance[i][j])));
    const states = draws(c, model, obs, values, catalog.scale, L, uniform);
    const beta = axes.map((a) =>
      forward(
        L,
        obs.map((i) => a.cross[k][i]),
      ),
    );
    const covariance = axes.map((a) => axes.map((b) => dot(a.loadings, b.cross[k])));
    const residual = covariance.map((row, i) => row.map((n, j) => n - dot(beta[i], beta[j])));
    return { states, beta, covariance, residual, L };
  });
  const max = Math.max(...blocks.map((b) => b.states.reduce((m, s) => Math.max(m, s.logWeight), -Infinity)));
  requireValue(Number.isFinite(max), 'Projection likelihood below numerical precision.');
  const mean = axes.map(() => 0),
    second = axes.map(() => axes.map(() => 0));
  const itemShift = overview ? catalog.items.map(() => 0) : null;
  let totalMass = 0;
  const weights = blocks.map((b, k) => {
    let mass = 0;
    const observedMean = overview ? obs.map(() => 0) : null;
    for (const s of b.states) {
      const w = Math.exp(s.logWeight - max);
      if (!w) continue;
      const m = axes.map((a, i) => a.scores[k] + dot(b.beta[i], s.z));
      mass += w;
      if (observedMean) s.z.forEach((z, j) => { observedMean[j] += w * z; });
      m.forEach((x, i) => {
        mean[i] += w * x;
        m.forEach((y, j) => (second[i][j] += w * (b.residual[i][j] + x * y)));
      });
    }
    if (itemShift && observedMean) {
      const coef = solveTransposedFactor(b.L, observedMean), c = components[k];
      for (let i = 0; i < itemShift.length; i++) {
        itemShift[i] += mass * (c.mean[i] - basis.center[i]);
        for (let j = 0; j < obs.length; j++) itemShift[i] += c.covariance[i][obs[j]] * coef[j];
      }
    }
    totalMass += mass;
    return mass;
  });
  mean.forEach((x, i) => (mean[i] = x / totalMass));
  const covariance = second.map((row, i) => row.map((x, j) => x / totalMass - mean[i] * mean[j]));
  return {
    projection: axes,
    ...(itemShift ? { allAxes: basis.all, allScores: basis.all.map(a => dot(a.loadings, itemShift) / totalMass) } : {}),
    spectrum: basis.spectrum,
    weights: weights.map((w) => w / totalMass),
    mean,
    covariance,
    classCovariance: blocks.map((b) => b.covariance),
    kind,
  };
}
