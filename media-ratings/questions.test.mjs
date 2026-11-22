import test from 'node:test';
import assert from 'node:assert/strict';
import { familiarityRanks } from './questions.mjs';
import { questionScores } from './taste.mjs';

test('the slider blends tied percentile ranks, using the endpoints independently', () => {
  const information = new Map([
    ['a', 0.4],
    ['b', 0.01],
    ['c', 0.01],
    ['d', 0.2],
  ]);
  const familiarity = new Map([
    ['a', 0],
    ['b', 0.5],
    ['c', 0.5],
    ['d', 1],
  ]);
  const profile = { information, familiarity };
  const pure = questionScores(profile, 0);
  assert.equal(pure.get('a'), 1);
  assert.equal(pure.get('b'), 1 / 6);
  assert.equal(pure.get('c'), 1 / 6);
  assert.equal(pure.get('d'), 2 / 3);
  assert.deepEqual(questionScores(profile, 1), familiarity);
  const midpoint = questionScores(profile);
  assert.deepEqual(midpoint, questionScores(profile, 0.5));
  for (const [id, value] of midpoint) assert.equal(value, (pure.get(id) + familiarity.get(id)) / 2);
  assert.deepEqual(questionScores({ ...profile, familiarity: null }, 1), pure);
  assert.equal(questionScores({ information: new Map([['only', 0]]), familiarity: null }).get('only'), 0.5);
  assert.throws(() => questionScores(profile, -1), RangeError);
  assert.throws(() => questionScores(profile, NaN), RangeError);
});

test('rated identities promote related candidates regardless of stars and support editing or removing anchors', () => {
  const catalog = {
    scale: [1, 5],
    models: {},
    items: [
      { itemId: 'first', annotations: { ratingCount: 40, collection: 'Shared series' } },
      { itemId: 'second', annotations: { ratingCount: 40, authors: ['J. Smith'] } },
      { itemId: 'related', annotations: { ratingCount: 60, collection: 'Shared Series' } },
      { itemId: 'writer', annotations: { ratingCount: 60, author: 'J. Smith' } },
      { itemId: 'famous', annotations: { ratingCount: 210 } },
      { itemId: 'other', annotations: { ratingCount: 90 } },
    ],
  };
  const cold = familiarityRanks(catalog, {});
  assert.ok(cold.get('other') > cold.get('related'));
  const warm = familiarityRanks(catalog, { first: 1 });
  assert.ok(!warm.has('first'));
  assert.ok(warm.get('related') > warm.get('other'));
  assert.ok(warm.get('related') < warm.get('famous'));
  assert.deepEqual(warm, familiarityRanks(catalog, { first: 5 }));
  const both = familiarityRanks(catalog, { first: 1, second: 5 });
  assert.equal(both.get('related'), both.get('writer'));
  const justWriter = familiarityRanks(catalog, { second: 5 });
  assert.ok(justWriter.get('writer') > justWriter.get('other'));
  assert.ok(justWriter.get('related') < justWriter.get('other'));
  assert.deepEqual(familiarityRanks(catalog, {}), cold);
  assert.deepEqual(familiarityRanks(catalog, { first: 5 }), warm);
  assert.equal(familiarityRanks({ models: {}, items: [{ itemId: 'missing' }] }, {}), null);
});

test('item vectors personalize familiarity when titles have no shared metadata', () => {
  const catalog = {
    items: ['a', 'near', 'far'].map((itemId, i) => ({
      itemId,
      annotations: { ratingCount: [100, 50, 80][i] },
    })),
    scale: [1, 5],
    defaultModel: 'combined',
    models: {
      combined: { kind: 'class-similarity', similarityFrom: 'hybrid' },
      hybrid: {
        kind: 'class-similarity',
        features: [
          [2, 0],
          [5, 0],
          [-3, 0],
        ],
      },
    },
  };
  assert.ok(familiarityRanks(catalog, {}).get('near') < familiarityRanks(catalog, {}).get('far'));
  const warm = familiarityRanks(catalog, { a: 1 });
  assert.ok(warm.get('near') > warm.get('far'));
});

test('an absent action supplies no familiarity clue in activity-only catalogs', () => {
  const catalog = {
    items: ['a', 'near', 'far'].map((itemId, i) => ({
      itemId,
      annotations: { ratingCount: [40, 55, 80][i] },
    })),
    scale: [0, 1],
    activityCountLabel: 'Accounts that replied',
    models: {
      classes: {
        kind: 'latent-class',
        components: [
          {
            weight: 0.5,
            probabilities: [
              [0.8, 0.2],
              [0.7, 0.3],
              [0.3, 0.7],
            ],
          },
          {
            weight: 0.5,
            probabilities: [
              [0.2, 0.8],
              [0.3, 0.7],
              [0.7, 0.3],
            ],
          },
        ],
      },
    },
  };
  const absent = familiarityRanks(catalog, { a: 0 });
  assert.ok(absent.get('near') < absent.get('far'));
  const positive = familiarityRanks(catalog, { a: 1 });
  assert.ok(positive.get('near') > positive.get('far'));
});

test('a shared rating-tendency intercept leaves item-specific familiarity intact', () => {
  const items = [
    { itemId: 'rated', annotations: { ratingCount: 100, genres: ['Drama'] } },
    { itemId: 'related', annotations: { ratingCount: 50, genres: ['Drama'] } },
    { itemId: 'popular', annotations: { ratingCount: 80 } },
  ];
  for (const features of [[[1], [1], [1]], [[0.7, 0], [0.7, 0], [0.7, 0.7]]]) {
    const catalog = { items, scale: [1, 5], defaultModel: 'personal', models: {
      personal: { kind: 'class-similarity', features, ratingStyleIntercept: true },
    } };
    const warm = familiarityRanks(catalog, { rated: 3 });
    assert.ok(warm.get('related') > warm.get('popular'));
  }
});
