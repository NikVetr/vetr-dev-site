import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pnorm, qnorm } from '../lib/normal.js';
import { compute as computeThreshold, cosPiApproximation, fitTable, cellProbabilities } from '../threshold-model/compute.js';
import { compute as zscore, SWEEP_POINTS } from '../zscore-outliers/compute.js';

/** Results are a union over modes; tests read them untyped. @param {unknown} params @returns {any} */
const thresholdModel = (params) => computeThreshold(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('zscore: identical groups make pooling and stratifying agree', () => {
  const r = zscore({ meanDifference: 0, sdRatio: 1, proportionA: 0.3, z: 3 });
  close(r.pooled.sd, 1);
  close(r.overall.pooledRemoved, 2 * pnorm(-3));
  close(r.overall.onlyPooled, 0, 1e-15);
  close(r.overall.onlyStratified, 0, 1e-15);
  close(/** @type {number} */ (r.groups[0].shareOfPooledRemovals), 0.3);
});

test('zscore: shares decompose and the pooled SD is the mixture SD', () => {
  for (const params of [{ meanDifference: 2, sdRatio: 1.5, proportionA: 0.2, z: 2 }, { meanDifference: 0.4, sdRatio: 0.3, proportionA: 0.7, z: 3.5 }]) {
    const r = zscore(params);
    const [A, B] = r.groups;
    close(A.proportion * A.mean + B.proportion * B.mean, 0, 1e-15);
    close(B.mean - A.mean, params.meanDifference, 1e-15);
    close(r.pooled.sd ** 2, A.proportion * (1 + A.mean ** 2) + B.proportion * (B.sd ** 2 + B.mean ** 2));
    for (const g of r.groups) {
      close(g.removedByBoth + g.onlyPooled, g.pooledRemoved, 1e-15);
      close(g.removedByBoth + g.onlyStratified, g.stratifiedRemoved, 1e-15);
      close(g.pooledRemovedBelow + g.pooledRemovedAbove, g.pooledRemoved, 1e-15);
    }
    close(/** @type {number} */ (A.shareOfPooledRemovals) + /** @type {number} */ (B.shareOfPooledRemovals), 1);
  }
});

test('zscore: a shifted minority group is over-removed by pooling', () => {
  const r = zscore({ meanDifference: 3, proportionA: 0.9, z: 3 });
  const [A, B] = r.groups;
  assert.ok(B.pooledRemoved > 10 * B.stratifiedRemoved);
  assert.ok(A.pooledRemoved < A.stratifiedRemoved);
  assert.ok(/** @type {number} */ (B.shareOfPooledRemovals) > 0.5);
});

test('zscore: the sweep covers the swept range and passes through the current value', () => {
  for (const sweep of /** @type {const} */ (['meanDifference', 'sdRatio', 'proportionA', 'z'])) {
    const params = { meanDifference: 1.5, sdRatio: 2, proportionA: 0.4, z: 2.5, sweep };
    const r = /** @type {any} */ (zscore(params));
    assert.equal(r.sweep.values.length, SWEEP_POINTS);
    assert.equal(r.sweep.pooledA.length, SWEEP_POINTS);
    const i = r.sweep.values.findIndex((v) => Math.abs(v - params[sweep]) < 1e-9);
    if (i >= 0) close(r.sweep.pooledOverall[i], r.overall.pooledRemoved, 1e-12);
  }
  const s = /** @type {any} */ (zscore({ sweep: 'sdRatio' })).sweep.values;
  close(s[0], 0.2);
  close(s[s.length - 1], 5);
  close(s[60], 1, 1e-12); // log-spaced: the middle of 0.2..5 is 1
});

test('threshold: one trait gives category frequencies that sum to 1', () => {
  const r = thresholdModel({ means: [0.5], thresholds: [[-1, 0, 1.5]] });
  assert.equal(r.mode, 'model');
  const probs = r.traits[0].categories.map((c) => c.probability);
  close(probs.reduce((a, b) => a + b, 0), 1, 1e-15);
  close(probs[0], pnorm(-1.5));
  assert.equal(r.traits[0].categories[0].lower, null);
  assert.equal(r.traits[0].categories[3].upper, null);
});

test('threshold: two traits, margins match the one-trait frequencies, and rho = 0 factorises', () => {
  const r = thresholdModel({ means: [0.3, -0.2], thresholds: [[0, 1], [-0.5, 0.4, 1.2]], rho: 0.6 });
  const one = thresholdModel({ means: [0.3], thresholds: [[0, 1]] }).traits[0].categories;
  r.cells.forEach((row, i) => close(row.reduce((a, b) => a + b, 0), one[i].probability, 1e-14));
  const independent = thresholdModel({ means: [0.3, -0.2], thresholds: [[0, 1], [-0.5, 0.4, 1.2]], rho: 0 });
  independent.cells.forEach((row, i) => row.forEach((p, j) => close(p, independent.traits[0].categories[i].probability * independent.traits[1].categories[j].probability, 1e-15)));
  assert.ok(Math.abs(r.codeCorrelation) < 0.6); // attenuated
  assert.equal(r.cosPiApproximation, null);
  assert.equal(r.sample, null);
});

test('threshold: cos-π is exact for median splits only', () => {
  for (const rho of [-0.8, 0.2, 0.7]) close(/** @type {number} */ (cosPiApproximation(cellProbabilities([0], [0], rho))), rho, 1e-14);
  const off = /** @type {number} */ (cosPiApproximation(cellProbabilities([qnorm(0.7)], [qnorm(0.8)], 0.5)));
  assert.ok(off - 0.5 > 0.03);
});

test('threshold: fitting the exact cells of a model recovers it', () => {
  const means = [0.4, -0.3];
  const thresholds = [[-0.5, 0.6], [0, 0.8, 1.5]];
  const model = thresholdModel({ means, thresholds, rho: -0.45 });
  const table = model.cells.map((row) => row.map((p) => Math.round(p * 1e7)));
  const fit = fitTable(table);
  close(fit.rho, -0.45, 1e-5);
  fit.thresholds.forEach((t, k) => t.forEach((x, j) => close(x, thresholds[k][j] - means[k], 1e-5)));
});

test('threshold: a perfectly concordant 2×2 table puts rho on the boundary', () => {
  const fit = fitTable([[30, 0], [0, 20]]);
  assert.equal(fit.rho, 1);
  assert.equal(fit.atBoundary, true);
  assert.equal(fit.se, null);
  assert.equal(thresholdModel({ table: [[0, 30], [20, 0]] }).fit.rho, -1);
});

test('threshold: samples are seeded, tabulated and fitted', () => {
  const params = { means: [0.75, 0.85], thresholds: [[0, 1, 2], [0, 0.8, 1.9]], rho: 0.4, sample: { n: 20000, seed: 9 } };
  const a = thresholdModel(params);
  const b = thresholdModel(params);
  assert.deepEqual(a.sample, b.sample);
  assert.equal(a.sample.counts.flat().reduce((x, y) => x + y, 0), 20000);
  // Within Monte Carlo error of the exact cells and of rho.
  a.cells.forEach((row, i) => row.forEach((p, j) => assert.ok(Math.abs(a.sample.counts[i][j] - 20000 * p) < 4.5 * Math.sqrt(20000 * p * (1 - p)))));
  assert.ok(Math.abs(a.sample.fit.rho - 0.4) < 4 * a.sample.fit.se);
  const small = thresholdModel({ ...params, thresholds: [[0, 1, 2.9], [0, 0.8, 1.9]], sample: { n: 5, seed: 1 } });
  assert.equal(small.sample.fit, null);
  assert.match(small.sample.unfittable, /no one in the sample falls in trait 1 category/);
});

test('zscore: sweep null skips the sweep and the rest is unchanged', () => {
  const full = zscore({ z: 3 });
  const lean = zscore({ z: 3, sweep: null });
  assert.equal(lean.sweep, null);
  assert.deepEqual({ ...lean, sweep: full.sweep }, full);
});
