import assert from 'node:assert/strict';
import test from 'node:test';
import { predict, validateCatalog } from './core.mjs';

test('shared role-specific credits agree with a direct two-observation ridge solve', () => {
  const items = ['A', 'B', 'C', 'D'].map((id) => ({ itemId: id, title: id }));
  const components = [{ weight: 1, probabilities: items.map(() => [0.5, 0.5]) }];
  const features = [
    [0.8, 0.3],
    [0.6, -0.5],
    [0.4, 0.2],
    [0.7, 0.1],
  ];
  const credits = {
    weight: 0.3,
    items: [
      [[7], [1, 2], [3]],
      [[4], [2], [4]],
      [[7], [9], [4]],
      [[1], [4], [7]],
    ],
  };
  const catalog = validateCatalog({
    name: 'Film credits',
    items,
    scale: [1, 5],
    defaultModel: 'withCredits',
    models: {
      classes: { kind: 'latent-class', components },
      ordinary: { kind: 'class-similarity', base: 'classes', features, ridge: 0.5, strength: 0.5 },
      withCredits: {
        kind: 'class-similarity',
        base: 'classes',
        similarityFrom: 'ordinary',
        creatorSimilarity: credits,
      },
    },
  });
  const observed = { ratings: { A: 5, B: 1 } };
  const estimates = predict(catalog, observed).predictions;
  const dense = (i, j) => features[i][0] * features[j][0] + features[i][1] * features[j][1];
  const a = dense(0, 0) + 0.5,
    b = dense(1, 1) + 0.5;
  // A and B share one of A's two cast members. A/C share a director; B/C a studio.
  const c = dense(0, 1) + 0.3 / (3 * Math.sqrt(2));
  const det = a * b - c * c;
  const dual = [(2 * (b + c)) / det, (-2 * (a + c)) / det];
  for (const [i, shared] of [
    [2, 0.1],
    [3, 0],
  ]) {
    const signal = (dense(i, 0) + shared) * dual[0] + (dense(i, 1) + shared) * dual[1];
    const topProbability = 1 / (1 + Math.exp(-2 * signal));
    const actual = estimates.find((p) => p.itemId === items[i].itemId);
    assert.ok(Math.abs(actual.probabilities[1] - topProbability) < 1e-12);
  }
  assert.deepEqual(predict(catalog, {}).predictions, predict(catalog, { model: 'ordinary' }).predictions);
  assert.equal(predict(catalog, { ratings: { A: 5, B: 1, C: 1, D: 5 } }).predictions.length, 0);
  credits.weight = 0.5;
  assert.throws(() => validateCatalog(catalog), /below the similarity ridge/);
});
