// The JavaScript against values computed in R (4.6) by the original scripts, mvtnorm
// and polycor. See tests/fixtures/r-reference.json for the source of the values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bvnRectangle, pbvnorm } from '../lib/bvn.js';
import { dnorm, pnorm, pnormUpper, qnorm } from '../lib/normal.js';
import { compute as computeThreshold, cosPiApproximation, fitTable } from '../threshold-model/compute.js';
import { compute as zscore } from '../zscore-outliers/compute.js';

/** Results are a union over modes; tests read them untyped. @param {unknown} params @returns {any} */
const thresholdModel = (params) => computeThreshold(params);
const ref = JSON.parse(readFileSync(new URL('fixtures/r-reference.json', import.meta.url), 'utf8'));
const num = (/** @type {number | string} */ v) => (v === 'Inf' ? Infinity : v === '-Inf' ? -Infinity : Number(v));
const relative = (/** @type {number} */ a, /** @type {number} */ b) => (a === b ? 0 : Math.abs(a - b) / Math.abs(b));

test('pnorm, its upper tail, dnorm and qnorm match R to rounding', () => {
  ref.normal.x.forEach((/** @type {number} */ x, /** @type {number} */ i) => {
    assert.ok(relative(pnorm(x), ref.normal.pnorm[i]) < 1e-14, `pnorm(${x})`);
    assert.ok(relative(pnormUpper(x), ref.normal.pnormUpper[i]) < 1e-14, `upper(${x})`);
    assert.ok(relative(dnorm(x), ref.normal.dnorm[i]) < 1e-14, `dnorm(${x})`);
  });
  ref.normal.p.forEach((/** @type {number} */ p, /** @type {number} */ i) => assert.ok(relative(qnorm(p), ref.normal.qnorm[i]) < 1e-14, `qnorm(${p})`));
});

test('bivariate CDF and rectangles match mvtnorm::pmvnorm for rho up to ±0.99999', () => {
  for (const c of ref.bvn.cdf) {
    const [h, k, r, p] = c.map(num);
    assert.ok(Math.abs(pbvnorm(h, k, r) - p) < 1e-14, `cdf(${h}, ${k}, ${r})`);
  }
  for (const c of ref.bvn.rectangle) {
    const [a1, a2, b1, b2, r, p] = c.map(num);
    assert.ok(Math.abs(bvnRectangle([a1, a2], [b1, b2], r) - p) < 1e-14, `rect(${c})`);
  }
});

test('zscore-outliers reproduces prop_outliers_zscores_redux.R', () => {
  for (const c of ref.zscore) {
    const r = zscore(c.params);
    const o = r.overall;
    // The redux, stratify_direction = TRUE: lost = removed only by pooling, gained =
    // removed only by stratifying, net = stratified - pooled, all shares of all data.
    const ours = { lost: o.onlyPooled, gained: o.onlyStratified, net: o.stratifiedRemoved - o.pooledRemoved };
    for (const [key, value] of Object.entries(ours)) {
      const expected = c.redux[key];
      assert.ok(Math.abs(value - expected) < 1e-15 + 1e-9 * Math.abs(expected), `${key} at ${JSON.stringify(c.params)}`);
    }
    assert.ok(Math.abs(r.pooled.sd - c.internals.sd_3) < 1e-14);
    const w = [c.params.proportionA, 1 - c.params.proportionA];
    r.groups.forEach((g, i) => {
      assert.ok(Math.abs(w[i] * g.pooledRemoved - c.internals.integ_mix[i]) < 1e-14);
      assert.ok(Math.abs(w[i] * g.removedByBoth - c.internals.integ_shared[i]) < 1e-14);
    });
  }
});

test('threshold-model reproduces the univariate script and pmvnorm cells', () => {
  for (const c of ref.threshold.univariate) {
    const cats = thresholdModel({ means: [c.mean], thresholds: [c.thresholds] }).traits[0].categories;
    cats.forEach((cat, i) => assert.ok(Math.abs(cat.probability - c.probabilities[i]) < 1e-15));
  }
  const g = ref.threshold.grid;
  const cells = thresholdModel({ means: g.means, thresholds: g.thresholds, rho: g.rho }).cells;
  cells.forEach((row, i) => row.forEach((p, j) => assert.ok(Math.abs(p - g.pmvnorm[i][j]) < 1e-14)));
});

test("the mvBM script's grid sum is the transposed model, within grid error", () => {
  const g = ref.threshold.grid;
  const swapped = thresholdModel({ means: [g.means[1], g.means[0]], thresholds: g.thresholds, rho: g.rho }).cells;
  const intended = thresholdModel({ means: g.means, thresholds: g.thresholds, rho: g.rho }).cells;
  let toSwapped = 0;
  let toIntended = 0;
  swapped.forEach((row, i) => row.forEach((p, j) => {
    toSwapped = Math.max(toSwapped, Math.abs(g.scriptGridSum[i][j] - p));
    toIntended = Math.max(toIntended, Math.abs(g.scriptGridSum[i][j] - intended[i][j]));
  }));
  assert.ok(toSwapped < 3e-3, `grid vs swapped ${toSwapped}`);
  assert.ok(toIntended > 1e-2, `grid vs intended ${toIntended}`);
});

test('polychoric fits match the two-step likelihood maximised in R, and cos-π matches rtet', () => {
  for (const c of ref.threshold.polychoric) {
    const fit = fitTable(c.table);
    assert.ok(Math.abs(fit.rho - c.rho) < 1e-7, `rho for ${JSON.stringify(c.table)}`);
    assert.ok(relative(/** @type {number} */ (fit.se), c.se) < 1e-5, `se for ${JSON.stringify(c.table)}`);
    fit.thresholds.forEach((t, k) => t.forEach((x, j) => assert.ok(Math.abs(x - c.thresholds[k][j]) < 1e-14)));
  }
  for (const c of ref.threshold.cosPi) assert.ok(Math.abs(/** @type {number} */ (cosPiApproximation(c.table)) - c.rtet) < 1e-14);
});
