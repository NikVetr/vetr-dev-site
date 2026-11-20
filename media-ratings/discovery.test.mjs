import assert from 'node:assert/strict';
import test from 'node:test';
import { discoveryRanking } from './discovery.mjs';

const titles = ['A', 'B', 'C', 'D'];
const items = titles.map((itemId, i) => ({
  itemId,
  annotations: { ratingCount: 10, genres: i < 2 ? ['Puzzle'] : ['Racing'] },
}));
const catalog = { items, scale: [0, 1], models: {}, domain: 'games' };
const discovery = {
  kind: 'steam-co-review',
  units: 1000,
  ids: titles,
  counts: [10, 10, 10, 10],
  excess: [[1, 250], [0, 250], [], []],
};
const predictions = ['C', 'D', 'B'].map((itemId, i) => ({
  itemId,
  expected: i === 2 ? 0.9 : 1,
  probabilities: [i === 2 ? 0.1 : 0, i === 2 ? 0.9 : 1],
}));
const ids = (rows) => rows.map((r) => r.itemId);

test('voluntary selection changes rank, keeps source model probabilities, and respects raw tie ordering', () => {
  const values = { ratings: { A: 1 }, volunteered: ['A'], predictions, discovery };
  const raw = discoveryRanking(catalog, values);
  assert.deepEqual(ids(raw.rows), ['C', 'D', 'B']);
  assert.equal(raw.mode, 'raw');
  assert.equal(raw.anchors, 1);
  const selected = discoveryRanking(catalog, { ...values, weight: 1 });
  assert.equal(selected.mode, 'context');
  assert.equal(selected.source, 'coReview');
  assert.deepEqual(ids(selected.rows), ['B', 'C', 'D']);
  assert.equal(selected.rows[0].expected, 0.9);
  assert.deepEqual(selected.rows[0].probabilities, [0.1, 0.9]);
  assert.equal(selected.rows[0].affinity, 1);
  const down = discoveryRanking(catalog, { ...values, ratings: { A: 0 }, weight: 1 });
  assert.deepEqual(ids(down.rows), ids(selected.rows));
});

test('unmarked imports, prompts, surveys and binary activity preserve the supplied forecast order', () => {
  for (const { source, volunteered } of [
    { source: catalog, volunteered: [] },
    { source: { ...catalog, activityCountLabel: 'Kudos' }, volunteered: ['A'] },
    { source: { ...catalog, domain: 'cities' }, volunteered: ['A'] },
    { source: catalog, volunteered: ['unknown'] },
  ]) {
    const result = discoveryRanking(source, {
      ratings: { A: 0 },
      volunteered,
      predictions,
      discovery,
      weight: 1,
    });
    assert.equal(result.mode, 'unavailable');
    assert.equal(result.anchors, 0);
    assert.deepEqual(ids(result.rows), ids(predictions));
    assert.ok(result.rows.every((r) => r.affinity === null));
  }
});

test('metadata fallback requires informative proximity and malformed Steam joins fail explicitly', () => {
  const values = { ratings: { A: 1 }, volunteered: ['A'], predictions, weight: 1 };
  const metadata = discoveryRanking(catalog, values);
  assert.equal(metadata.source, 'metadata');
  assert.deepEqual(ids(metadata.rows), ['B', 'C', 'D']);
  const flat = {
    ...catalog,
    items: items.map(({ itemId }) => ({ itemId, annotations: { ratingCount: 10 } })),
  };
  assert.equal(discoveryRanking(flat, values).mode, 'unavailable');
  assert.throws(() => discoveryRanking(catalog, { ...values, weight: -1 }), /between 0 and 1/);
  assert.throws(
    () => discoveryRanking(catalog, { ...values, discovery: { ...discovery, ids: ['B', 'A', 'C', 'D'] } }),
    /match/,
  );
  assert.throws(
    () =>
      discoveryRanking(catalog, {
        ...values,
        discovery: { ...discovery, excess: [[1, 20, 1, 5], [], [], []] },
      }),
    /association/,
  );
});

test('Steam uses popularity matching after four choices and protects all-top-decile selections', () => {
  const counts = [
    1005,
    1004,
    1003,
    1002,
    1001,
    1000,
    ...Array(30).fill(200),
    ...Array(5).fill(50),
    ...Array(9).fill(1),
  ];
  const ids = counts.map((_, i) => String(i));
  const catalog = { items: ids.map((itemId) => ({ itemId })), scale: [0, 1] };
  const discovery = {
    kind: 'steam-co-review',
    units: 1000,
    ids,
    counts,
    excess: ids.map((_, i) => (i === 36 ? [] : [36, 14])),
  };
  const predictions = ['6', '36'].map((itemId) => ({ itemId, expected: 0.9 }));
  const best = (volunteered) =>
    discoveryRanking(catalog, {
      discovery,
      predictions,
      volunteered,
      ratings: Object.fromEntries(volunteered.map((id) => [id, 0])),
      weight: 1,
    }).rows[0].itemId;
  // The extra co-reviews narrowly favor smaller game 36 in the original ranking.
  assert.equal(best(['0', '1', '5']), '36');
  assert.equal(best(['0', '1', '2', '3']), '36');
  assert.equal(best(['0', '1', '2', '3', '4']), '36');
  // Game 5 is sixth by count, just outside this inventory's most-reviewed tenth.
  assert.equal(best(['0', '1', '2', '5']), '6');
  assert.equal(best(['0', '1', '2', '3', '4', '5']), '6');
  assert.equal(best(['46', '47', '48', '49']), '36');
});
