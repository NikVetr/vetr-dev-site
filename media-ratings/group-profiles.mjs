import { checkRequestKeys, invalidRequest } from '../shared/request.js';
import { defaultCutoff, predict, submit, validateCatalog } from './core.mjs';
import { preferenceFingerprint } from './fingerprint.mjs';
import { projectClasses } from './taste.mjs';
import { populationModel } from './calendar.mjs';

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

// Keep every person on the same pooled axes, even when their ratings come from
// different calibration years. Their weights still use their own dates and sources.
function comparableAxes(catalog, model, members) {
  const base = populationModel(catalog, catalog.models[model]);
  if (base.kind === 'latent-class') {
    const axes = projectClasses(base, catalog.scale, true);
    const pooled = preferenceFingerprint(
      catalog,
      { model },
      {
        weights: base.components.map((c) => c.weight),
        projection: axes,
      },
    );
    return pooled.displayAxes.map(({ index, low, high }) => {
      const axis = axes[index];
      const positions = members.map(
        ({ weights }) =>
          axis.scores.reduce((sum, score, k) => sum + score * weights[k].posterior, 0) /
          Math.sqrt(axis.variance),
      );
      return { low, high, positions };
    });
  }
  const views = members.map((m) => preferenceFingerprint(catalog, { model, ...m.request }));
  return views[0].displayAxes.map(({ index, low, high }) => ({
    low,
    high,
    positions: views.map((v) => v.allAxes[index].standardScore),
  }));
}

export function prepareGroup(catalog, { profiles, model = catalog.defaultModel }) {
  if (!Array.isArray(profiles) || profiles.length < 2)
    throw invalidRequest('profiles', 'Choose at least two rating profiles.');
  const members = profiles.map((profile, index) => {
    checkRequestKeys(profile, ['name', 'ratings', 'ratedOn', 'volunteered']);
    const { name, ...request } = profile;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      !request.ratings ||
      typeof request.ratings !== 'object' ||
      Array.isArray(request.ratings) ||
      !Object.keys(request.ratings).length
    )
      throw invalidRequest(
        'profiles[' + index + ']',
        'Each profile needs a name and at least one supplied rating.',
      );
    const result = predict(catalog, { model, ...request });
    return {
      name: name.trim(),
      request,
      weights: result.weights,
      forecasts: new Map(result.predictions.map((p) => [p.itemId, p])),
    };
  });
  const axes = comparableAxes(catalog, model, members)
    .map((axis) => ({
      ...axis,
      range: Math.max(...axis.positions) - Math.min(...axis.positions),
    }))
    .sort((a, b) => b.range - a.range);
  const candidates = [],
    surprises = [],
    shared = [];
  for (const { itemId, title } of catalog.items) {
    const forecasts = members.map((m) => m.forecasts.get(itemId));
    const observed = members.map((m) => m.request.ratings[itemId] ?? null);
    if (forecasts.every(Boolean)) {
      candidates.push({ itemId, title, forecasts });
      continue;
    }
    const scores = observed.filter((v) => v !== null);
    if (scores.length >= 2)
      shared.push({ itemId, title, observed, range: Math.max(...scores) - Math.min(...scores) });
    // A cross-profile residual compares an actual answer with other people's
    // forecasts only when those people did not supply an answer for this title.
    const others = forecasts.filter(Boolean);
    if (!others.length) continue;
    const expected = mean(others.map((p) => p.expected));
    observed.forEach((value, profile) => {
      if (value !== null)
        surprises.push({ itemId, title, profile, observed: value, expected, delta: value - expected });
    });
  }
  surprises.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  shared.sort((a, b) => b.range - a.range);
  return { names: members.map((m) => m.name), scale: catalog.scale, axes, surprises, shared, candidates };
}

export function groupRankings(group, threshold, order = 'joint') {
  const j = group.scale.indexOf(threshold);
  if (j < 0 || !['joint', 'mean'].includes(order))
    throw invalidRequest('group', 'Choose a catalog threshold and joint or mean order.');
  const rows = group.candidates.map(({ itemId, title, forecasts }) => {
    const means = forecasts.map((p) => p.expected);
    const chances = forecasts.map((p) =>
      Math.min(
        1,
        p.probabilities.slice(j).reduce((a, b) => a + b, 0),
      ),
    );
    const logJoint = chances.reduce((sum, p) => sum + Math.log(p), 0);
    return { itemId, title, means, chances, expected: mean(means), joint: Math.exp(logJoint), logJoint };
  });
  const jointOrder = (a, b) => b.logJoint - a.logJoint || b.expected - a.expected;
  return rows.sort((a, b) => (order === 'mean' ? b.expected - a.expected : 0) || jointOrder(a, b));
}

export function submitRatingRequest(input) {
  if (!input || !Object.hasOwn(input, 'profiles')) return submit(input);
  checkRequestKeys(input, ['catalog', 'model', 'profiles', 'threshold', 'order']);
  const catalog = validateCatalog(input.catalog);
  const group = prepareGroup(catalog, input);
  const threshold = input.threshold ?? defaultCutoff(catalog.scale);
  const { candidates, ...summary } = group;
  const predictions = groupRankings(group, threshold, input.order).map(({ logJoint, ...row }) => row);
  return { ...summary, threshold, predictions };
}
