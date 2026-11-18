import { dot, symmetricEigen } from '../intuitions/lib/linalg.js';
import { predict } from './core.mjs';

// A separate diagnostic of the categorical mixture. Its classes have a fitted
// distribution over possible answers, even before the next item is rated.
export function tasteProfile(
  catalog,
  ratings,
  key = Object.keys(catalog.models).find((k) => catalog.models[k].kind === 'latent-class'),
  existing = null,
  centerClassMeans = false,
) {
  if (!key) return null;
  const selected = catalog.models[key];
  const model = selected.kind === 'class-similarity' ? catalog.models[selected.base] : selected;
  if (model.kind !== 'latent-class') throw new Error('Taste profiles require a categorical mixture.');
  const result =
    existing ??
    predict(catalog, { model: selected.kind === 'class-similarity' ? selected.base : key, ratings });
  const weights = result.weights.map((w) => w.posterior);
  const information = new Map();
  const respondents = catalog.fit?.users;
  const haveCounts =
    Number.isSafeInteger(respondents) &&
    respondents > 0 &&
    catalog.items.every(
      (it) =>
        Number.isSafeInteger(it.annotations?.ratingCount) &&
        it.annotations.ratingCount >= 0 &&
        it.annotations.ratingCount <= respondents,
    );
  const weightedInformation = haveCounts ? new Map() : null;
  catalog.items.forEach(({ itemId }, i) => {
    if (Object.hasOwn(ratings, itemId)) return;
    const mass = catalog.scale.map((_, a) =>
      weights.reduce((sum, w, k) => sum + w * model.components[k].probabilities[i][a], 0),
    );
    let bits = 0;
    for (const [k, w] of weights.entries()) {
      if (!w) continue;
      for (const [a, p] of model.components[k].probabilities[i].entries()) {
        if (p > 0) bits += w * p * Math.log2(p / mass[a]);
      }
    }
    information.set(itemId, Math.max(0, bits));
    if (weightedInformation)
      weightedInformation.set(
        itemId,
        (information.get(itemId) * catalog.items[i].annotations.ratingCount) / respondents,
      );
  });
  return {
    weights,
    information,
    weightedInformation,
    projection: projectClasses(model, catalog.scale, centerClassMeans),
  };
}
const projections = new WeakMap();
export function projectClasses(model, scale, centerClassMeans = false) {
  if (!projections.has(model)) projections.set(model, new Map());
  const cache = projections.get(model);
  if (cache.has(centerClassMeans)) return cache.get(centerClassMeans);
  const groups = model.components;
  const profiles = groups.map((c) => {
    const levels = c.probabilities.map((p) => dot(p, scale));
    if (!centerClassMeans) return levels;
    const overall = levels.reduce((a, b) => a + b, 0) / levels.length;
    return levels.map((level) => level - overall);
  });
  const mean = profiles[0].map((_, i) => groups.reduce((s, c, k) => s + c.weight * profiles[k][i], 0));
  const centered = profiles.map((p, k) => p.map((x, i) => (x - mean[i]) * Math.sqrt(groups[k].weight)));
  const gram = centered.map((x) => centered.map((y) => dot(x, y)));
  const eig = symmetricEigen(gram),
    sum = eig.values.reduce((s, v) => s + Math.max(0, v), 0);
  const axes = [];
  for (let a = 0; a < groups.length - 1; a++) {
    const value = eig.values[a];
    if (value < Math.max(1e-12, sum * 1e-10)) break;
    const u = eig.vectors[a],
      root = Math.sqrt(value);
    const loadings = mean.map((_, i) => u.reduce((s, v, k) => s + v * centered[k][i], 0) / root);
    const ordered = loadings.map((_, i) => i).sort((x, y) => loadings[y] - loadings[x]);
    axes.push({
      index: a,
      fraction: value / sum,
      scores: u.map((v, k) => (root * v) / Math.sqrt(groups[k].weight)),
      low: ordered.at(-1),
      high: ordered[0],
      loadings,
    });
  }
  cache.set(centerClassMeans, axes);
  return axes;
}
