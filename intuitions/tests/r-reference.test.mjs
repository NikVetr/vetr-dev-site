// The JavaScript against values computed in R (4.6) by the original scripts, mvtnorm
// and polycor. See tests/fixtures/r-reference.json and r-correlation.json for the
// source of the values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bvnRectangle, pbvnorm } from '../lib/bvn.js';
import { dnorm, pnorm, pnormUpper, qnorm } from '../lib/normal.js';
import { compute as computeThreshold, cosPiApproximation, fitTable } from '../threshold-model/compute.js';
import { compute as zscore } from '../zscore-outliers/compute.js';
import {
  compute as computeCorrelation, det3, entryInterval, equicorrelationEigenvalues, expectedWidthSample, expectedWidthUniform, zeroPairRange,
} from '../correlation-geometry/compute.js';

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

// ---------- correlation-geometry, against the original scripts (fixtures/r-correlation.json) ----------

const cgRef = JSON.parse(readFileSync(new URL('fixtures/r-correlation.json', import.meta.url), 'utf8'));
/** @param {unknown} params @returns {any} */
const cg = (params) => computeCorrelation(params);
const maxDiff = (/** @type {number[]} */ a, /** @type {number[]} */ b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

test('correlation-geometry: arrows and the cone match cor(), rotate_vec() and the teaching script', () => {
  for (const c of cgRef.arrows) {
    const out = cg({ view: 'arrows', a: c.a, b: c.b });
    assert.ok(Math.abs(out.r - c.cor) < 1e-14);
    assert.ok(maxDiff(out.vectors.flat(), c.vectors.flat()) < 1e-14);
  }
  for (const c of cgRef.cone) {
    const out = cg({ view: 'cone', b: c.b, a: c.a, rBC: c.rBC });
    assert.ok(maxDiff(out.meets.flat(), c.closed.flat()) < 1e-14, 'closed form');
    assert.ok(maxDiff(out.withA, c.withA) < 1e-14);
    assert.ok(Math.max(...c.closedDistanceToScriptCircle) < 0.05, 'on the script circle, to its sampling');
    for (const s of c.script) assert.ok(Math.min(...out.meets.map((/** @type {number[]} */ m) => Math.hypot(...m.map((v, i) => v - s[i])))) < 0.05, 'script search lands near');
  }
  assert.equal(cgRef.coneThirdCoordinateZero.fails, true);
});

test('correlation-geometry: the cosine rule and det R match the 3-way script and eigenvalues', () => {
  for (const c of cgRef.cosine) {
    const out = cg({ view: 'cosine-rule', rAB: c.rAB, rBC: c.rBC });
    assert.ok(maxDiff(out.interval, c.analytic) < 1e-14);
    assert.ok(maxDiff(out.interval, c.brute) < 1e-9);
    // try_bs() bisects from r_AC = 0.4 with tolerance 1e-3; it needs that start to be feasible.
    if (out.interval[0] <= 0.4 && out.interval[1] >= 0.4) assert.ok(Math.abs(c.tryBs - out.interval[0]) < 2e-3, 'try_bs()');
    // R's named vectors arrive as arrays: [rAC, detr(), det()].
    for (const [rAC, detr, det] of c.det) assert.ok(Math.abs(det3(c.rAB, c.rBC, rAC) - det) < 1e-14 && Math.abs(detr - det) < 1e-14);
  }
});

test('correlation-geometry: equicorrelation eigenvalues and c_max match eigen() and the puzzle script', () => {
  const values = (/** @type {number} */ k, /** @type {number} */ r, /** @type {boolean} */ z) => equicorrelationEigenvalues(k, r, z).flatMap((e) => Array(e.multiplicity).fill(e.value)).sort((a, b) => b - a);
  for (const c of cgRef.equi) assert.ok(maxDiff(values(c.k, c.r, false), c.eigen) < 1e-12);
  for (const c of cgRef.zeroPair) assert.ok(maxDiff(values(c.k, c.c, true), c.eigen) < 1e-12);
  cgRef.cmax.k.forEach((/** @type {number} */ k, /** @type {number} */ i) => {
    const [lo, hi] = zeroPairRange(k);
    assert.ok(Math.abs(hi - cgRef.cmax.bisection[i]) < 1e-10 && Math.abs(lo - cgRef.cmax.cminBisection[i]) < 1e-10, `k = ${k}`);
    assert.ok(cgRef.cmax.grid[i] <= hi + 1e-12 && hi - cgRef.cmax.grid[i] < 1e-3, `grid at k = ${k}`);
  });
  for (const c of cgRef.csBounds) {
    const R = Array.from({ length: c.k }, (_, i) => Array.from({ length: c.k }, (__, j) => (i === j ? 1 : c.r)));
    const e = entryInterval(R, c.k - 2, c.k - 1);
    assert.ok(Math.abs(e.lo - c.bounds[0]) < 1e-12 && Math.abs(e.hi - c.bounds[1]) < 1e-12);
  }
});

test("correlation-geometry: entry intervals match the fixed coef_bounds(); the 3-way script's r.min is the centre", () => {
  for (const c of cgRef.entries) {
    const out = cg({ view: 'entry-range', matrix: c.matrix, cell: c.cell });
    assert.ok(maxDiff(out.interval, c.fixed) < 1e-10, 'fixed coef_bounds');
    assert.ok(maxDiff(out.interval, c.brute) < 1e-8, 'eigenvalue bisection');
    assert.ok(Math.abs(out.centre - c.buggy[0]) < 1e-10 && Math.abs(out.interval[1] - c.buggy[1]) < 1e-10, 'the bug');
  }
  for (const s of cgRef.singular) {
    for (const c of s.cells) {
      const out = cg({ view: 'entry-range', matrix: s.matrix, cell: c.cell });
      assert.ok(maxDiff(out.interval, c.brute) < 1e-6, `n = ${s.n}, p = ${s.p}`);
      if (s.p > s.n) assert.ok(out.width < 1e-6);
    }
    assert.equal(s.rank, Math.min(s.p, s.n - 1));
  }
});

test('correlation-geometry: closed-form expected widths sit within Monte Carlo error of the R simulations', () => {
  for (const c of cgRef.uniformWidths) {
    // valid_range() steps by incr and can under-read by up to two steps.
    assert.ok(Math.abs(expectedWidthUniform(c.p) - c.mean) < 4 * c.se + 2 * c.incr, `p = ${c.p}`);
  }
  for (const c of cgRef.sampleWidths) {
    const ours = expectedWidthSample(c.p, c.n);
    assert.ok(c.se === 0 ? Math.abs(ours - c.mean) < 1e-6 : Math.abs(ours - c.mean) < 4 * c.se, `n = ${c.n}, p = ${c.p}`);
  }
});

test('correlation-geometry: the corrections, numerically', () => {
  const c = cgRef.corrections;
  assert.ok(Math.abs(c.coefBounds.script[0] - c.coefBounds.centre) < 1e-12, "the script's r.min is the centre");
  assert.ok(c.coefBounds['minEigAtScriptMinus0.1'] > 0, 'and values below it are still PSD');
  assert.ok(maxDiff(c.coefBounds.fixed, c.coefBounds.brute) < 1e-8);
  assert.ok(Math.abs(c.volume.volumeGram ** 2 - c.volume.detR) < 1e-10 && Math.abs(c.volume.volumeQR - c.volume.volumeGram) < 1e-10, 'det R is the squared volume');
  assert.ok(c.whitening.scriptMaxError > 1e-3 && c.whitening.correctMaxError < 1e-12, 'the script whitening leaves a non-identity covariance');
  assert.ok(c.missingEntry.script < c.missingEntry.brute[0]);
  const out = cg({ view: 'entry-range', matrix: [[1, 0.8, 0], [0.8, 1, 0.5], [0, 0.5, 1]], cell: [0, 2] });
  assert.ok(Math.abs(out.centre - c.missingEntry.maxDet) < 1e-6 && maxDiff(out.interval, c.missingEntry.brute) < 1e-8);
});
