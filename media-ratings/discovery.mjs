import { familiarityRanks, questionScores } from './questions.mjs';

const indices = new WeakMap();

function steamIndex(catalog, data) {
  if (!indices.has(data)) {
    if (
      data.kind !== 'steam-co-review' ||
      !Number.isSafeInteger(data.units) ||
      data.units <= 0 ||
      !Array.isArray(data.ids) ||
      data.ids.length !== catalog.items.length ||
      data.counts?.length !== data.ids.length ||
      data.excess?.length !== data.ids.length ||
      data.ids.some((id, i) => id !== catalog.items[i].itemId) ||
      data.counts.some((n) => !Number.isSafeInteger(n) || n <= 0)
    )
      throw new Error('Review-choice data must match the Steam catalog in item order.');
    for (const [i, row] of data.excess.entries()) {
      if (!Array.isArray(row) || row.length % 2) throw new Error('Invalid review-choice neighbors.');
      const seen = new Set();
      for (let j = 0; j < row.length; j += 2) {
        const id = row[j],
          bump = row[j + 1];
        if (
          !Number.isSafeInteger(id) ||
          id < 0 ||
          id >= data.ids.length ||
          id === i ||
          seen.has(id) ||
          !Number.isSafeInteger(bump) ||
          bump <= 0 ||
          bump > data.units
        )
          throw new Error('Invalid review-choice association.');
        seen.add(id);
      }
    }
    const total = data.counts.reduce((a, b) => a + b, 0);
    indices.set(data, {
      catalog,
      positions: new Map(data.ids.map((id, i) => [id, i])),
      prior: data.counts.map((v) => v / total),
    });
  }
  const index = indices.get(data);
  if (
    index.catalog !== catalog &&
    (data.ids.length !== catalog.items.length || data.ids.some((id, i) => id !== catalog.items[i]?.itemId))
  )
    throw new Error('Review-choice data and catalog disagree.');
  return index;
}

function reviewAffinity(catalog, discovery, anchors, predictions) {
  const index = steamIndex(catalog, discovery);
  const values = index.prior.slice();
  let linked = false;
  const eligible = new Set(predictions.map((p) => p.itemId));
  for (const id of anchors) {
    const row = discovery.excess[index.positions.get(id)];
    for (let j = 0; j < row.length; j += 2) {
      values[row[j]] += row[j + 1] / (discovery.units * anchors.length);
      if (eligible.has(discovery.ids[row[j]])) linked = true;
    }
  }
  if (!linked) return null;
  return new Map(predictions.map((p) => [p.itemId, values[index.positions.get(p.itemId)]]));
}

/**
 * Re-rank an existing forecast with evidence about the choice to review a title.
 * Returned probabilities and expected ratings are always copied from the model.
 * Weight 0 preserves its order; 1 ranks solely by relative review affinity.
 * Other explicit-review catalogs use their existing metadata/fitted-feature proximity.
 */
export function discoveryRanking(
  catalog,
  { ratings = {}, volunteered = [], predictions, weight = 0, discovery },
) {
  if (!Number.isFinite(weight) || weight < 0 || weight > 1)
    throw new RangeError('Review context weight must be between 0 and 1.');
  const relevance = questionScores(
    { information: new Map(predictions.map((p) => [p.itemId, p.expected])) },
    0,
  );
  const selectable =
    !catalog.activityCountLabel && catalog.domain !== 'cities' && !catalog.name?.startsWith('Stravl');
  const inventory = new Set(catalog.items.map((it) => it.itemId));
  const anchors = selectable
    ? [...new Set(volunteered)].filter(
        (id) => inventory.has(id) && Object.hasOwn(ratings, id) && catalog.scale.includes(ratings[id]),
      )
    : [];
  let affinity = null;
  if (weight && anchors.length && predictions.length) {
    if (discovery) {
      const scores = reviewAffinity(catalog, discovery, anchors, predictions);
      if (scores) affinity = questionScores({ information: scores }, 0);
    } else {
      const selected = Object.fromEntries(anchors.map((id) => [id, ratings[id]]));
      const near = familiarityRanks(catalog, selected);
      const popular = near && familiarityRanks(catalog, selected, 0);
      if (near && predictions.some((p) => near.get(p.itemId) !== popular.get(p.itemId))) {
        affinity = questionScores(
          { information: new Map(predictions.map((p) => [p.itemId, near.get(p.itemId)])) },
          0,
        );
      }
    }
  }
  const rows = predictions.map((p) => {
    const r = relevance.get(p.itemId),
      a = affinity?.get(p.itemId) ?? null;
    return { ...p, relevance: r, affinity: a, score: a === null ? r : (1 - weight) * r + weight * a };
  });
  if (affinity) rows.sort((a, b) => b.score - a.score);
  return {
    rows,
    mode: affinity ? 'context' : weight === 0 ? 'raw' : 'unavailable',
    anchors: anchors.length,
    source: affinity ? (discovery ? 'coReview' : 'metadata') : null,
  };
}
