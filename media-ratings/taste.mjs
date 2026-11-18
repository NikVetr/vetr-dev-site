import { dot, symmetricEigen } from '../intuitions/lib/linalg.js';
import { predict } from './core.mjs';

// A separate diagnostic of the categorical mixture. Its classes have a fitted
// distribution over possible answers, even before the next item is rated.
export function tasteProfile(
  catalog,
  ratings,
  key = Object.keys(catalog.models).find((k) => catalog.models[k].kind === 'latent-class'),
  existing = null,
) {
  if (!key) return null;
  const model = catalog.models[key];
  if (model.kind !== 'latent-class') throw new Error('Taste profiles require a categorical mixture.');
  const result = existing ?? predict(catalog, { model: key, ratings });
  const weights = result.weights.map((w) => w.posterior);
  const information = new Map();
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
  });
  return { weights, information, projection: projectClasses(model, catalog.scale) };
}
const projections = new WeakMap();
function projectClasses(model, scale) {
  if (projections.has(model)) return projections.get(model);
  const groups = model.components;
  const profiles = groups.map((c) => c.probabilities.map((p) => dot(p, scale)));
  const mean = profiles[0].map((_, i) => groups.reduce((s, c, k) => s + c.weight * profiles[k][i], 0));
  const centered = profiles.map((p, k) => p.map((x, i) => (x - mean[i]) * Math.sqrt(groups[k].weight)));
  const gram = centered.map((x) => centered.map((y) => dot(x, y)));
  const eig = symmetricEigen(gram),
    sum = eig.values.reduce((s, v) => s + Math.max(0, v), 0);
  const axes = [];
  for (let a = 0; a < Math.min(groups.length - 1, 2); a++) {
    const value = eig.values[a];
    if (value < Math.max(1e-12, sum * 1e-10)) break;
    const u = eig.vectors[a],
      root = Math.sqrt(value);
    const loadings = mean.map((_, i) => u.reduce((s, v, k) => s + v * centered[k][i], 0) / root);
    const ordered = loadings.map((_, i) => i).sort((x, y) => loadings[y] - loadings[x]);
    axes.push({
      fraction: value / sum,
      scores: u.map((v, k) => (root * v) / Math.sqrt(groups[k].weight)),
      low: ordered.at(-1),
      high: ordered[0],
      loadings,
    });
  }
  projections.set(model, axes);
  return axes;
}
