import { dot } from '../intuitions/lib/linalg.js';

// Midranks preserve ties, including a flat or singleton candidate set.
function percentiles(values) {
  const sorted = [...values].sort((a, b) => a[1] - b[1]);
  const ranks = new Map();
  for (let first = 0; first < sorted.length; ) {
    let end = first + 1;
    while (end < sorted.length && sorted[end][1] === sorted[first][1]) end++;
    const rank = sorted.length === 1 ? 0.5 : (first + end - 1) / (2 * (sorted.length - 1));
    for (let i = first; i < end; i++) ranks.set(sorted[i][0], rank);
    first = end;
  }
  return ranks;
}

const informationRanks = new WeakMap();
export function questionScores(profile, familiarityWeight = 0.5) {
  if (!Number.isFinite(familiarityWeight) || familiarityWeight < 0 || familiarityWeight > 1)
    throw new RangeError('Familiarity weight must be between 0 and 1.');
  const { information, familiarity } = profile;
  if (familiarityWeight === 1 && familiarity) return new Map(familiarity);
  if (!informationRanks.has(information)) informationRanks.set(information, percentiles(information));
  const info = informationRanks.get(information);
  if (!familiarity || familiarityWeight === 0) return new Map(info);
  const scores = new Map();
  for (const [id, rank] of info)
    scores.set(id, (1 - familiarityWeight) * rank + familiarityWeight * familiarity.get(id));
  return scores;
}

const fields = [
  'authors',
  'author',
  'collection',
  'genres',
  'tags',
  'country',
  'region',
  'developers',
  'publishers',
  'directors',
  'cast',
  'studios',
  'creators',
  'editors',
];
const similarities = new WeakMap();

function makeIndex(catalog) {
  const { items, models } = catalog;
  const terms = new Map();
  const memberships = items.map((it, i) => {
    const unique = new Set();
    for (const field of fields) {
      const value = it.annotations?.[field];
      const kind = field === 'authors' ? 'author' : field;
      for (const token of Array.isArray(value) ? value : [value])
        if (typeof token === 'string' && token.trim()) unique.add(kind + '/' + token.trim().toLowerCase());
    }
    return [...unique].map((token) => {
      if (!terms.has(token)) terms.set(token, { members: [], weight: 0 });
      const term = terms.get(token);
      term.members.push(i);
      return term;
    });
  });
  for (const term of terms.values())
    term.weight = Math.log((items.length + 1) / (term.members.length + 1)) ** 2;
  const norms = memberships.map((row) => Math.sqrt(row.reduce((s, t) => s + t.weight, 0)));
  const fits = /** @type {any[]} */ (Object.values(models));
  const selected = models[catalog.defaultModel];
  const shared = selected?.similarityFrom ? models[selected.similarityFrom] : selected;
  const direct =
    shared?.kind === 'class-similarity' && shared.features
      ? shared
      : fits.find((f) => f.kind === 'class-similarity' && f.features);
  let vectors = direct?.features;
  if (!vectors && catalog.activityCountLabel && catalog.scale.length === 2) {
    // On action catalogs, the two outcomes explicitly model occurrence in this cohort.
    // Compare which fitted respondent classes have above-average activity on each item.
    const classes = fits.find((f) => f.kind === 'latent-class')?.components;
    if (classes?.length > 1) {
      vectors = items.map((_, i) => {
        const mean = classes.reduce((sum, c) => sum + c.weight * c.probabilities[i][1], 0);
        return classes.map((c) => Math.sqrt(c.weight) * (c.probabilities[i][1] - mean));
      });
    }
  }
  const vectorNorms = vectors?.map((v) => Math.sqrt(dot(v, v)));
  return {
    memberships,
    norms,
    vectors,
    vectorNorms,
    anchors: new Set(),
    nearest: new Float64Array(items.length),
  };
}

function updateSimilarities(catalog, anchors) {
  if (!similarities.has(catalog)) similarities.set(catalog, makeIndex(catalog));
  const index = similarities.get(catalog);
  // One more rating only introduces one set of comparisons. Recompute when an
  // identity is removed, because it might have been the closest for some items.
  for (const old of index.anchors)
    if (!anchors.has(old)) {
      index.anchors.clear();
      index.nearest.fill(0);
      break;
    }
  for (const anchor of anchors) {
    if (index.anchors.has(anchor)) continue;
    const shared = new Float64Array(catalog.items.length);
    for (const term of index.memberships[anchor]) for (const j of term.members) shared[j] += term.weight;
    for (let j = 0; j < shared.length; j++) {
      const meta = shared[j] > 0 ? shared[j] / (index.norms[anchor] * index.norms[j]) : 0;
      const norm = index.vectorNorms && index.vectorNorms[anchor] * index.vectorNorms[j];
      const feature = norm > 0 ? dot(index.vectors[anchor], index.vectors[j]) / norm : 0;
      index.nearest[j] = Math.max(index.nearest[j], Math.min(1, Math.max(meta, feature)));
    }
    index.anchors.add(anchor);
  }
  return index.nearest;
}

export function familiarityRanks(catalog, ratings, proximityStrength = 1) {
  const anchors = new Set();
  const scores = new Map();
  const activity = catalog.activityCountLabel && catalog.scale.length === 2;
  for (const [j, it] of catalog.items.entries()) {
    const count = it.annotations?.ratingCount;
    if (!Number.isSafeInteger(count) || count < 0) return null;
    if (Object.hasOwn(ratings, it.itemId)) {
      if (!activity || ratings[it.itemId] === catalog.scale[1]) anchors.add(j);
    } else scores.set(it.itemId, Math.log(count + 0.5));
  }
  if (anchors.size && scores.size && proximityStrength > 0) {
    const nearest = updateSimilarities(catalog, anchors);
    for (const [j, it] of catalog.items.entries())
      if (scores.has(it.itemId))
        scores.set(it.itemId, scores.get(it.itemId) + proximityStrength * nearest[j]);
  }
  return percentiles(scores);
}
