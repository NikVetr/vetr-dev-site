import test from 'node:test';
import assert from 'node:assert/strict';
import { submit } from './core.mjs';
import { pnorm } from '../intuitions/lib/normal.js';
const close = (x, y, tol = 1e-8) => assert.ok(Math.abs(x - y) < tol, x + ' ≠ ' + y);
const component = (weight, mean, r = 0) => ({
  weight,
  mean,
  covariance: [
    [1, r],
    [r, 1],
  ],
});
function catalog(components) {
  return {
    name: 'Example',
    scale: [1, 5],
    items: [
      { itemId: 'a', title: 'A' },
      { itemId: 'b', title: 'B' },
    ],
    models: { ordinal: { kind: 'ordinal-probit', cuts: [0], components } },
  };
}
test('one ordinal observation integrates over its half-plane', () => {
  const c = catalog([component(1, [0, 0], 0.75)]);
  const r = submit({ catalog: c, model: 'ordinal', ratings: { a: 5 }, threshold: 5, samples: 2048 });
  const p = r.predictions[0];
  close(p.chance, 0.5 + Math.asin(0.75) / Math.PI, 1e-5);
  close(p.expected, 1 + 4 * p.chance);
  close(p.prior, 3);
  close(p.sd, 4 * Math.sqrt(p.chance * (1 - p.chance)));
});
test('posterior class weights use category likelihoods; variance includes between-class spread', () => {
  const c = catalog([component(0.4, [-1, -1]), component(0.6, [1, 1])]);
  const base = submit({ catalog: c, model: 'ordinal', threshold: 5 });
  close(base.weights[0].posterior, 0.4);
  close(base.predictions[0].shift, 0);
  const plus = submit({ catalog: c, model: 'ordinal', ratings: { a: 5 }, threshold: 5 });
  const w = (0.6 * pnorm(1)) / (0.6 * pnorm(1) + 0.4 * pnorm(-1));
  close(plus.weights[1].posterior, w);
  close(plus.predictions[0].chance, w * pnorm(1) + (1 - w) * pnorm(-1));
  const all = submit({ catalog: c, model: 'ordinal', ratings: { a: 1, b: 5 } });
  assert.equal(all.predictions.length, 0);
  close(all.weights[1].posterior, 0.6);
});
test('two observed point ratings agree with an independently evaluated Schur complement', () => {
  const c = {
    name: 'Reference',
    scale: [1, 2, 3, 4, 5],
    items: ['a', 'b', 'c'].map((itemId) => ({ itemId, title: itemId })),
    models: {
      reference: {
        kind: 'logit-point',
        cuts: [-0.8, -0.2, 0.2, 0.8],
        endpoint: 4.875,
        components: [
          {
            weight: 1,
            mean: [0, 0, 0],
            covariance: [
              [1, 0.2, 0.4],
              [0.2, 1, 0.5],
              [0.4, 0.5, 1],
            ],
          },
        ],
      },
    },
  };
  const p = submit({ catalog: c, model: 'reference', ratings: { a: 5, b: 2 }, threshold: 5 }).predictions[0];
  const m = ((0.4 - 0.2 * 0.5) / 0.96) * Math.log(39) + ((0.5 - 0.2 * 0.4) / 0.96) * Math.log(2 / 3);
  const sd = Math.sqrt(1 - (0.16 + 0.25 - 2 * 0.2 * 0.4 * 0.5) / 0.96);
  close(p.chance, pnorm((m - 0.8) / sd));
  close(
    p.probabilities.reduce((a, b) => a + b),
    1,
  );
});
test('reject invalid inputs and singular covariance', () => {
  const c = catalog([component(1, [0, 0])]);
  assert.throws(() => submit({ catalog: c, model: 'ordinal', ratings: { missing: 5 } }));
  assert.throws(() => submit({ catalog: c, model: 'ordinal', ratings: { b: 3 } }));
  assert.throws(() => submit({ catalog: catalog([component(1, [0, 0], 1)]), model: 'ordinal' }));
});

test('two correlated ordinal observations agree with the trivariate normal orthant probability', () => {
  const c = {
    name: 'Three items',
    items: ['a', 'b', 'c'].map((itemId) => ({ itemId, title: itemId })),
    scale: [0, 1],
    models: {
      ordinal: {
        kind: 'ordinal-probit',
        cuts: [0],
        components: [
          {
            weight: 1,
            mean: [0, 0, 0],
            covariance: [
              [1, 0.5, -0.25],
              [0.5, 1, 0.3],
              [-0.25, 0.3, 1],
            ],
          },
        ],
      },
    },
  };
  const joint = 1 / 8 + (Math.asin(0.5) + Math.asin(-0.25) + Math.asin(0.3)) / (4 * Math.PI);
  const evidence = 1 / 4 + Math.asin(0.5) / (2 * Math.PI);
  const r = submit({ catalog: c, model: 'ordinal', ratings: { a: 1, b: 1 }, samples: 8192 });
  close(r.predictions[0].chance, joint / evidence, 0.001);
});

test('a polarizing film can win on expected stars and lose on the chance of four stars', () => {
  const c = {
    name: 'Two films',
    items: ['polarizing', 'consistent'].map((itemId) => ({ itemId, title: itemId })),
    scale: [1, 2, 3, 4, 5],
    models: {
      ordinal: {
        kind: 'ordinal-probit',
        cuts: [1.5, 2.5, 3.5, 4.5],
        components: [
          [0.8, 5],
          [0.2, 2],
        ].map(([weight, mean]) => ({
          weight,
          mean: [mean, 4],
          covariance: [
            [0.01, 0],
            [0, 0.01],
          ],
        })),
      },
    },
  };
  const [polarizing, consistent] = submit({ catalog: c, model: 'ordinal', threshold: 4 }).predictions;
  assert.equal(polarizing.itemId, 'polarizing');
  close(polarizing.expected, 4.4, 1e-6);
  assert.ok(consistent.chance > 0.999);
  close(polarizing.chance, 0.8, 1e-6);
  assert.ok(consistent.sd < polarizing.sd);
});
