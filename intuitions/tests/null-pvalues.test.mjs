import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import { ptTwoSided, qtTwoSided } from '../lib/special.js';
import { batchDesign, bhAdjust, compute as computeNull, hypergeometric, SCENARIOS } from '../null-pvalues/compute.js';

/** Results are a union over scenarios; tests read them untyped. @param {unknown} params @returns {any} */
const np = (params) => computeNull(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
/** A simulated rate within `k` standard errors of a target. @param {any} analysis @param {number} target */
const near = (analysis, target, k = 4) => assert.ok(Math.abs(analysis.rejectionRate - target) <= k * Math.sqrt((target * (1 - target)) / analysis.count), `${analysis.rejectionRate} vs ${target} (n = ${analysis.count})`);
/** @param {unknown} params */
function issues(params) {
  try {
    np(params);
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    return error.issues.map((i) => `${i.code} ${i.path}`);
  }
  return assert.fail('accepted');
}

test('every scenario runs at its defaults and summarises both analyses the same way', () => {
  for (const scenario of SCENARIOS) {
    const r = np({ scenario, ...(scenario === 'bootstrap' ? { replicates: 100, resamples: 100 } : {}) });
    assert.equal(r.scenario, scenario);
    for (const a of [r.shortcut, r.sound]) {
      assert.equal(a.histogram.edges.length, 21);
      assert.equal(a.histogram.density.length, 20);
      close(a.histogram.density.reduce((/** @type {number} */ s, /** @type {number} */ d) => s + d, 0) / 20, 1, 1e-9);
      for (let i = 1; i < a.curve.rate.length; i++) assert.ok(a.curve.rate[i] >= a.curve.rate[i - 1] - 1e-12);
      assert.ok(a.rejectionRate >= 0 && a.rejectionRate <= 1);
    }
  }
});

test('the uniform reference: flat histogram, the rate equals the threshold', () => {
  const r = np({ scenario: 'batch', alpha: 0.01 });
  r.sound.histogram.density.forEach((/** @type {number} */ d) => close(d, 1, 1e-12));
  r.sound.curve.threshold.forEach((/** @type {number} */ u, /** @type {number} */ i) => close(r.sound.curve.rate[i], u, 1e-15));
  close(r.sound.rejectionRate, 0.01, 0);
});

test('batch: the shortcut is the model t scaled by √((n − 2)/(n − k − 1)) / √(1 − R²)', () => {
  const r = np({ scenario: 'batch' });
  assert.equal(r.n, 20);
  assert.deepEqual(r.treated, [5, 5]);
  close(r.r2, 0, 0);
  close(r.tRatio, Math.sqrt(18 / 17), 1e-15);
  close(r.shortcut.rejectionRate, ptTwoSided(qtTwoSided(0.05, 18) / Math.sqrt(18 / 17), 17), 1e-14);
  assert.ok(r.shortcut.rejectionRate > 0.056 && r.shortcut.rejectionRate < 0.058);
  const skewed = np({ scenario: 'batch', perBatch: 12, batches: 4, treatedShare: 0.75 });
  assert.deepEqual(skewed.treated, [9, 3, 9, 3]);
  close(skewed.r2, 0.25, 1e-14); // between-batch share of the treatment's variance
  assert.ok(skewed.shortcut.rejectionRate > 0.09);
  assert.deepEqual(batchDesign({ perBatch: 4, batches: 2, treatedShare: 1 }).treated, [4, 0]);
  assert.deepEqual(issues({ scenario: 'batch', perBatch: 4, treatedShare: 0.1 }), ['not_estimable params.treatedShare']);
});

test('stepwise: residualising one at a time inflates the rate, and rescaling σ only partly helps', () => {
  const fitted = np({ scenario: 'stepwise', replicates: 1000, seed: 3 });
  const rescaled = np({ scenario: 'stepwise', replicates: 4000, seed: 3, finalDf: 'rescaled' });
  assert.ok(fitted.shortcut.rejectionRate > 0.15);
  assert.ok(rescaled.shortcut.rejectionRate < fitted.shortcut.rejectionRate);
  assert.ok(rescaled.shortcut.rejectionRate > 0.05 + 3 * rescaled.shortcut.se); // still above α
  assert.deepEqual(rescaled.df, { final: 48, joint: 48 });
  assert.deepEqual(fitted.shortcut, np({ scenario: 'stepwise', replicates: 1000, seed: 3 }).shortcut);
  assert.equal(fitted.sound.method, 'exact');
  // One step only scales t by about √((n − 2)/(n − 3)), as regressing out a batch does.
  near(np({ scenario: 'stepwise', steps: 1, replicates: 4000 }).shortcut, 0.0513, 4);
  assert.deepEqual(issues({ scenario: 'stepwise', n: 20, steps: 18 }), ['out_of_range params.steps']);
});

test('bootstrap: the t-test on bootstrap means rejects almost always; the bootstrap difference does not', () => {
  const r = np({ scenario: 'bootstrap', replicates: 300, resamples: 400 });
  assert.ok(r.shortcut.rejectionRate > 0.85);
  near(r.sound, 0.05, 4);
  // More resamples, smaller p-values: t grows like √B.
  const few = np({ scenario: 'bootstrap', replicates: 300, resamples: 10 });
  assert.ok(few.shortcut.rejectionRate < r.shortcut.rejectionRate);
});

test('autocorrelation: independent points are calibrated; φ = 0.7 inflates the naive test, and the fixes recover', () => {
  near(np({ scenario: 'autocorrelation', phi: 0, replicates: 2000 }).shortcut, 0.05);
  const r = np({ scenario: 'autocorrelation', replicates: 1000 });
  assert.ok(r.shortcut.rejectionRate > 0.2);
  close(r.varianceInflation, 1.49 / 0.51, 1e-12);
  near(r.sound, 0.05, 4);
  const fisher = np({ scenario: 'autocorrelation', replicates: 1000, naive: 'fisher' });
  assert.ok(Math.abs(fisher.shortcut.rejectionRate - r.shortcut.rejectionRate) < 0.02);
  for (const fix of ['circular-shift', 'newey-west']) {
    const f = np({ scenario: 'autocorrelation', replicates: 500, fix });
    assert.ok(f.sound.rejectionRate < 0.1, `${fix} ${f.sound.rejectionRate}`);
  }
});

test('two-step: selecting on either group finds interactions that are not there; the pooled filter does not', () => {
  const r = np({ scenario: 'two-step', features: 20000 });
  assert.equal(r.selected.shortcut, r.shortcut.count);
  assert.ok(r.shortcut.rejectionRate > 0.3);
  near(r.sound, 0.05, 4);
  assert.ok(r.selected.sound > r.selected.shortcut);
  const none = np({ scenario: 'two-step', effect: 0, features: 500 });
  assert.ok(none.selected.shortcut <= 5);
});

test('pairing: ignoring the pairing is conservative under the null and loses power under an effect', () => {
  const r = np({ scenario: 'pairing', replicates: 5000 });
  near(r.sound, 0.05);
  assert.ok(r.shortcut.rejectionRate < 0.01);
  close(r.correlation, 4 / Math.sqrt(5 * 5.25), 1e-15);
  const effect = np({ scenario: 'pairing', replicates: 5000, meanChange: 0.25 });
  assert.ok(effect.sound.rejectionRate > 2 * effect.shortcut.rejectionRate);
  assert.ok(effect.bothReject <= effect.shortcut.rejectionRate);
});

test('enrichment: exact hypergeometric tails; all pathways are conservative, those with a hit are not', () => {
  for (const [N, K, s] of [[20000, 50, 27], [30, 10, 25], [100, 99, 3]]) {
    const { pmf, tail } = hypergeometric(N, K, s);
    close(pmf.reduce((a, b) => a + b, 0), 1, 1e-14);
    close(tail[0], 1, 0);
    for (let k = 0; k < pmf.length - 1; k++) close(tail[k] - tail[k + 1], pmf[k], 1e-15);
  }
  const { pmf } = hypergeometric(30, 10, 25); // at least 5 of the 25 must be DE
  assert.equal(pmf[4], 0);
  const r = np({ scenario: 'enrichment' });
  assert.ok(r.sound.rejectionRate <= 0.05);
  assert.ok(r.shortcut.rejectionRate > 0.15);
  let empty = 0;
  for (let s = 5; s <= 50; s++) empty += hypergeometric(20000, 50, s).pmf[0] / 46;
  close(r.nonEmptyShare, 1 - empty, 1e-14);
  assert.equal(r.sample.pathways, 2000);
  assert.ok(Math.abs(r.sample.nonEmpty / 2000 - r.nonEmptyShare) < 4 * Math.sqrt(r.nonEmptyShare / 2000));
  assert.deepEqual(r.sample, np({ scenario: 'enrichment' }).sample);
});

test('Benjamini–Hochberg adjustment is monotone in p and never below it', () => {
  const p = [0.01, 0.04, 0.03, 0.2, 0.0001];
  const q = bhAdjust(p);
  close(q[4], 0.0005, 1e-18);
  close(q[0], 0.025, 1e-17);
  close(q[1], 0.04 * 5 / 4, 1e-17);
  p.forEach((v, i) => assert.ok(q[i] >= v));
});

test('null-pvalues params are checked in full', () => {
  assert.deepEqual(issues({ scenario: 'nope' }), ['out_of_range params.scenario']);
  assert.deepEqual(issues({ scenario: 'batch', replicates: 10, alpha: 0.9 }), ['unknown_field params.replicates', 'out_of_range params.alpha']);
  assert.deepEqual(issues({ scenario: 'autocorrelation', fix: 'hac', naive: 'spearman', n: 10 }), ['out_of_range params.n', 'out_of_range params.naive', 'out_of_range params.fix']);
  assert.deepEqual(issues({ scenario: 'bootstrap', n: 200, resamples: 5000, replicates: 100000 }), ['too_much_work params.replicates']);
  assert.deepEqual(issues({ scenario: 'enrichment', genes: 100, de: 100, minSize: 60, maxSize: 50 }), ['out_of_range params.de', 'out_of_range params.minSize']);
  assert.deepEqual(issues({ scenario: 'pairing', pairs: 2.5, noiseSD: 0 }), ['wrong_type params.pairs', 'out_of_range params.noiseSD']);
});
