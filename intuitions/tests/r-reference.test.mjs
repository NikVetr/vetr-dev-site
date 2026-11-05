// The JavaScript against values computed in R (4.6) by the original scripts, mvtnorm
// and polycor. See tests/fixtures/r-reference.json, r-correlation.json and the other
// fixtures for the source of the values.
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
import { compute as computeDag } from '../dag-adjustment/compute.js';
import { bbp, compute as computeMp, mpDensity, mpDistribution, mpLaw, principalComponents } from '../marchenko-pastur/compute.js';
import { betaI, gammaP, gammaQ, lgamma, logGammaP, ptTwoSided, qgamma, qtTwoSided } from '../lib/special.js';
import {
  batchDesign, bhAdjust, circularShiftTest, compute as computeNull, effectiveDfTest, fisherTest, hypergeometric, neweyWestTest, oneSampleTest, pearsonTest, twoStepTests, welchTest,
} from '../null-pvalues/compute.js';
import { chiLogDensity, compute as computeTypical, CUBE_DIMENSIONS, PRESETS, sphereMarginal } from '../typical-set/compute.js';

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

// ---------- typical-set, against the original scripts and base R (fixtures/r-typical-set.json) ----------

const tsRef = JSON.parse(readFileSync(new URL('fixtures/r-typical-set.json', import.meta.url), 'utf8'));
/** @param {unknown} params @returns {any} */
const typical = (params) => computeTypical(params);
const within = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ rel, abs = 0) => Math.abs(a - b) <= abs + rel * Math.abs(b);

test('gamma and beta functions match lgamma, pchisq, qchisq and pbeta', () => {
  tsRef.lgamma.x.forEach((/** @type {number} */ x, /** @type {number} */ i) => assert.ok(within(lgamma(x), tsRef.lgamma.value[i], 1e-14, 1e-15), `lgamma(${x})`));
  const c = tsRef.pchisq;
  c.q.forEach((/** @type {number} */ q, /** @type {number} */ i) => {
    const a = c.df[i] / 2;
    assert.ok(within(gammaP(a, q / 2), c.lower[i], 1e-11), `pchisq(${q}, ${c.df[i]})`);
    assert.ok(within(gammaQ(a, q / 2), c.upper[i], 1e-11), `upper(${q}, ${c.df[i]})`);
    assert.ok(within(logGammaP(a, q / 2), c.logLower[i], 1e-11), `log(${q}, ${c.df[i]})`);
  });
  tsRef.qchisq.p.forEach((/** @type {number} */ p, /** @type {number} */ i) => assert.ok(within(2 * qgamma(p, tsRef.qchisq.df[i] / 2), tsRef.qchisq.value[i], 1e-12), `qchisq(${p})`));
  const b = tsRef.pbeta;
  b.x.forEach((/** @type {number} */ x, /** @type {number} */ i) => assert.ok(within(betaI(x, b.a[i], b.b[i]), b.value[i], 2e-12, 1e-15), `pbeta(${x}, ${b.a[i]}, ${b.b[i]})`));
});

test('typical-set shell: the chi distribution matches dchisq, pchisq, qchisq and a simulation', () => {
  for (const c of tsRef.shell) {
    const r = typical({ view: 'shell', k: c.k, coverage: 0.9, radius: 1 });
    for (const key of ['mode', 'mean', 'median', 'hdrRadius']) assert.ok(within(r[key], c[key], 1e-12, 1e-15), `${key} at k = ${c.k}`);
    assert.ok(within(r.sd, c.sd, 1e-9), `sd at k = ${c.k}`);
    assert.ok(within(r.shell.lo, c.lo, 1e-12) && within(r.shell.hi, c.hi, 1e-12));
    assert.ok(within(r.ball.mass, c.ballMass, 1e-11) && within(r.ball.log10Mass, c.ballLog10, 1e-11));
    c.r.forEach((/** @type {number} */ x, /** @type {number} */ i) => assert.ok(within(Math.exp(chiLogDensity(x, c.k)), c.chiDensity[i], 1e-11, 1e-300), `chi(${x}; ${c.k})`));
  }
  // The radius of simulated normals has the chi quantiles (1e5 draws: about ±0.01).
  const s = tsRef.shellSimulated;
  const r = typical({ view: 'shell', k: s.k, coverage: 0.9 });
  assert.ok(Math.abs(s.quantiles[0] - r.shell.lo) < 0.02 && Math.abs(s.quantiles[1] - r.median) < 0.02 && Math.abs(s.quantiles[2] - r.shell.hi) < 0.02);
});

test('typical-set cube: density_x_volume.R, its off-by-one, and Monte Carlo radii against R draws', () => {
  for (const c of tsRef.cube) {
    const r = typical({ view: 'cube', family: c.family });
    assert.ok(within(r.halfWidth, c.exactHalfWidth, 1e-12), c.family);
    assert.ok(within(r.withinHalfWidth, c.within, 1e-12), `${c.family} cube mass`);
    // The script's maximiser does not depend on k: its distance is one half-width times √k.
    c.ks.forEach((/** @type {number} */ k, /** @type {number} */ i) => assert.ok(within(c.scriptDistance[i], c.scriptHalfWidth * Math.sqrt(k), 1e-12)));
    // Centring its intervals on x = -0.01 adds a grid step to the distance.
    const exactOnGrid = c.family === 'laplace' ? 1 : c.exactHalfWidth; // the script's Laplace has scale 1
    assert.ok(Math.abs(c.centredHalfWidth - exactOnGrid) <= 0.005 + 1e-12, `${c.family} centred grid`);
    // (The uniform's maximum is at the edge of its support, which both grids reach.)
    if (c.family !== 'uniform') assert.ok(c.scriptHalfWidth - c.centredHalfWidth > 0.005, `${c.family} off by one step`);
    if (c.family === 'laplace') assert.ok(Math.abs(c.unitVarianceCentredHalfWidth - r.halfWidth) <= 0.005);
  }
  const k64 = CUBE_DIMENSIONS.indexOf(64);
  for (const c of tsRef.cubeRadii) {
    const s = typical({ view: 'cube', family: c.family, sample: { n: 2000, seed: 11 } }).sample;
    // Each sample quantile must sit between R's quantiles about ±4 standard errors of rank away.
    const [q02, q08, q45, , q55, q92, q98] = c.quantiles;
    assert.ok(s.lo[k64] > q02 && s.lo[k64] < q08, `${c.family} 5%`);
    assert.ok(s.median[k64] > q45 && s.median[k64] < q55, `${c.family} median`);
    assert.ok(s.hi[k64] > q92 && s.hi[k64] < q98, `${c.family} 95%`);
  }
});

test("typical-set modes: the bathtub's coverage exactly, and how the script's first cell skews it", () => {
  const b = tsRef.bathtub;
  const base = typical({ view: 'modes', components: PRESETS.bathtub, level: 0.5 });
  assert.ok(within(base.peak, b.peak, 1e-12) && Math.abs(base.mode - b.mode) < 1e-6);
  b.levels.forEach((/** @type {number} */ level, /** @type {number} */ i) => {
    if (level > base.peak) return;
    const r = typical({ view: 'modes', components: PRESETS.bathtub, level: level / base.peak });
    assert.ok(Math.abs(r.covered - b.exactMass[i]) < 1e-9, `level ${level}`);
    assert.ok(Math.abs(b.fixedMass[i] - b.exactMass[i]) < 1e-3, 'equal-width cells agree to the grid');
  });
  assert.equal(b.firstWeight, -50);
  assert.ok(b.framesDiffering > b.framesDifferingFixed);
  const sp = tsRef.spike;
  sp.levels.forEach((/** @type {number} */ level, /** @type {number} */ i) => {
    const r = typical({ view: 'modes', components: PRESETS.spike, level });
    assert.ok(Math.abs(r.covered - sp.mass[i]) < 1e-9 && within(r.peak, sp.peak, 1e-12) && within(r.mean, sp.mean, 1e-14));
  });
  const bi = tsRef.bimodal;
  bi.levels.forEach((/** @type {number} */ level, /** @type {number} */ i) => {
    const r = typical({ view: 'modes', components: PRESETS.bimodal, level });
    assert.ok(Math.abs(r.covered - bi.mass[i]) < 1e-9 && within(r.peak, bi.peak, 1e-12) && within(r.densityAtMean * r.peak, bi.densityAtMean, 1e-9));
  });
});

test('typical-set sphere: the Beta-type marginal, without the gamma() overflow, and the band mass', () => {
  for (const c of tsRef.sphere) {
    c.x.forEach((/** @type {number} */ x, /** @type {number} */ i) => {
      assert.ok(within(sphereMarginal(x, c.k), c.fixed[i], 1e-12), `k = ${c.k}, x = ${x}`);
      if (c.k <= 343) assert.ok(within(c.script[i], c.fixed[i], 1e-12));
      else assert.equal(c.script[i], null); // gamma(k/2) overflows to Inf, and Inf/Inf is NaN
    });
    assert.ok(within(typical({ view: 'sphere', k: c.k, band: 0.1 }).bandMass, c.bandMass, 2e-12));
  }
  const s = tsRef.sphereSimulated;
  const exact = typical({ view: 'sphere', k: s.k, band: 0.1 }).bandMass;
  assert.ok(Math.abs(s.bandShare - exact) < 4 * Math.sqrt((exact * (1 - exact)) / s.n), "the script's sampler");
  const ours = typical({ view: 'sphere', k: s.k, band: 0.1, sample: { n: 20000, seed: 1 } }).sample;
  assert.ok(Math.abs(ours.bandShare - exact) < 4 * Math.sqrt((exact * (1 - exact)) / 20000), 'the page sampler');
});

// ---------- dag-adjustment, against dagitty and the original scripts (fixtures/r-dag.json) ----------

const dagRef = JSON.parse(readFileSync(new URL('fixtures/r-dag.json', import.meta.url), 'utf8'));
/** @param {unknown} params @returns {any} */
const dagEntry = (params) => computeDag(params);
/** Rows and columns of `nodes` from a covariance over `all`. @param {number[][]} m @param {string[]} all @param {string[]} nodes */
const pick = (m, all, nodes) => nodes.map((a) => nodes.map((b) => m[all.indexOf(a)][all.indexOf(b)]));

test('dag-adjustment presets: implied covariances and adjustment sets match dagitty', () => {
  for (const ref of dagRef.presets) {
    for (const noise of ['unit', 'standardized']) {
      const expected = noise === 'unit' ? ref.unitCovariance : ref.standardizedCovariance;
      if (!expected) continue;
      const r = dagEntry({ graph: ref.graph, noise });
      assert.ok(maxDiff(pick(r.covariance, r.nodes, ref.nodes).flat(), expected.flat()) < 1e-12, `${ref.graph} ${noise} covariance`);
      for (const s of ref.sets) {
        const adjust = [s.adjust].flat();
        const ours = r.sets.find((/** @type {any} */ t) => t.adjust.length === adjust.length && adjust.every((a) => t.adjust.includes(a)));
        assert.equal(ours.valid, s.valid, `${ref.graph} {${adjust}} validity`);
        assert.ok(Math.abs(ours.coefficient - s[noise]) < 1e-12, `${ref.graph} {${adjust}} ${noise} coefficient`);
      }
    }
  }
});

test("dag-adjustment: happiness_numeracy.R's graph, simulated as the script does, and its broken dagitty calls", () => {
  const h = dagRef.happiness;
  assert.match(h.scriptAdjustmentSetsError, /USD is not a variable/);
  assert.equal(h.scriptHelperExists, false);
  assert.deepEqual(Object.values(h.fixedAdjustmentSets).flat(), ['Illness']);
  for (const fit of dagRef.happinessSimulated.fits) {
    const r = dagEntry({ graph: 'happiness', exposure: fit.exposure, adjust: [fit.adjust].flat() });
    assert.ok(Math.abs(r.estimate.coefficient - fit.estimate) < 4 * fit.se, `${fit.exposure} | ${fit.adjust}: ${r.estimate.coefficient} vs ${fit.estimate} ± ${fit.se}`);
  }
  // The fitted interaction in a graph with none is zero within its error.
  const [, interaction] = dagRef.happinessSimulated.scriptModel;
  assert.ok(Math.abs(interaction[0]) < 4 * interaction[1]);
});

test('dag-adjustment: the front door of backdoor_frontdoor.R, and age_causal.R through a given graph', () => {
  const fd = dagRef.frontDoor;
  const r = dagEntry({ graph: 'front-door' });
  assert.equal(Object.keys(fd.adjustmentSets).length, 0); // no observed set works
  assert.ok(Math.abs(r.frontDoor.estimate - fd.frontDoorEstimate) < 1e-12 && Math.abs(r.effect - fd.effect) < 1e-12);
  assert.ok(Math.abs(r.estimate.coefficient - fd.backdoorEstimate) < 1e-12);
  const a = dagRef.age;
  const graph = {
    nodes: a.nodes.map((/** @type {string} */ id, /** @type {number} */ i) => ({ id, x: a.positions[i][0], y: -a.positions[i][1] })),
    edges: a.edges.map((/** @type {{ from: string, to: string }} */ e) => ({ ...e, coefficient: 0.5 })),
  };
  const xs = a.nodes.filter((/** @type {string} */ n) => n.startsWith('X'));
  const marginal = dagEntry({ graph, exposure: 'Age', outcome: 'Dis_2', noise: 'standardized' });
  const conditional = dagEntry({ graph, exposure: 'Age', outcome: 'Dis_2', adjust: xs, noise: 'standardized' });
  assert.ok(maxDiff(pick(marginal.covariance, marginal.nodes, a.covarianceNodes).flat(), a.covariance.flat()) < 1e-12);
  assert.ok(Math.abs(marginal.estimate.coefficient - a.exact[0]) < 1e-12 && Math.abs(conditional.estimate.coefficient - a.exact[1]) < 1e-12);
  assert.ok(maxDiff(a.script, a.exact) < 1e-12, 'rounding the covariance to 4 decimals changes nothing here');
  assert.equal(conditional.estimate.valid, false); // the biomarkers descend from Dis_2
  const alt = dagRef.ageAlternate;
  const g2 = {
    nodes: ['Age', 'Org', 'Dis', 'U', 'X_1', 'X_2', 'X_3'].map((id) => ({ id })),
    edges: [['Age', 'Dis', 0.5], ['Age', 'Org', -0.25], ['U', 'Dis', 0.5], ['Dis', 'Org', -0.5], ...alt.b.map((/** @type {number} */ b, /** @type {number} */ i) => ['Org', `X_${i + 1}`, b])]
      .map(([from, to, coefficient]) => ({ from, to, coefficient })),
  };
  const bio = ['X_1', 'X_2', 'X_3'];
  assert.ok(Math.abs(dagEntry({ graph: g2, exposure: 'Age', outcome: 'U', adjust: bio, noise: 'standardized' }).estimate.partialCorrelation - alt.partialAgeU) < 1e-12);
  assert.ok(Math.abs(dagEntry({ graph: g2, exposure: 'Age', outcome: 'Dis', noise: 'standardized' }).estimate.coefficient - alt.marginal) < 1e-12);
  assert.ok(Math.abs(dagEntry({ graph: g2, exposure: 'Age', outcome: 'Dis', adjust: bio, noise: 'standardized' }).estimate.coefficient - alt.conditional) < 1e-12);
});

test("dag-adjustment colliders: R2_from_Cov(), both ways, and its diag2() failure at p = 1", () => {
  for (const c of dagRef.colliders) {
    const r = dagEntry({ view: 'colliders', colliders: c.p, rYX: c.rYX, share: c.share });
    // R subtracts B C⁻¹ Bᵀ from 1, which loses digits when the colliders explain almost
    // all of Y or U (many colliders, or a share near 1); there the agreement is to R's rounding.
    const tol = c.p > 64 || c.share > 0.9 ? 1e-4 : 1e-10;
    for (const way of [c.fast, c.long]) {
      if (!way) continue;
      const pairs = [[r.r2, way.R2], [r.semipartialCorrelation, way.semipr_yu], [r.covariance, way.cov_yu], [r.partialCorrelation, way.pr_yu]];
      for (const [ours, theirs] of pairs) assert.ok(Math.abs(ours - theirs) < tol, `p = ${c.p}, r = ${c.rYX}, share = ${c.share}: ${ours} vs ${theirs}`);
    }
    assert.ok(Math.abs(r.partialCorrelation) <= 1);
  }
  // R's fast path is 4e-5 off here; the cancellation-free form agrees with a 50-digit evaluation.
  assert.ok(Math.abs(dagEntry({ view: 'colliders', colliders: 1024, rYX: 0.01, share: 0.999 }).partialCorrelation + 0.99515265652850086) < 1e-15);
  // Where R's rounding shows: its partial correlation falls below -1.
  const edge = dagRef.colliders.find((/** @type {any} */ c) => c.p === 1024 && c.rYX === 0.95 && c.share === 0.999);
  assert.ok(edge.fast.pr_yu < -1);
  const bug = dagRef.diag2Bug;
  assert.equal(bug.script, 'non-conformable arguments');
  assert.equal(bug.scriptGridHits, 0); // the script's own grid never meets it
  const r = dagEntry({ view: 'colliders', colliders: 1, rYX: 0.5, share: 1 / 3 });
  assert.ok(Math.abs(r.r2 - bug.long.R2) < 1e-12 && Math.abs(r.partialCorrelation - bug.long.pr_yu) < 1e-12);
});

// ---------- null-pvalues, against the original scripts and base R (fixtures/r-null-pvalues.json) ----------

const pvRef = JSON.parse(readFileSync(new URL('fixtures/r-null-pvalues.json', import.meta.url), 'utf8'));
/** Results are a union over scenarios; tests read them untyped. @param {unknown} params @returns {any} */
const nullEntry = (params) => computeNull(params);
/**
 * Two simulated rates agree within `k` standard errors of their difference.
 * @param {number} a @param {number} na @param {number} b @param {number} nb @param {string} what
 */
function sameRate(a, na, b, nb, what, k = 4) {
  const p = (a * na + b * nb) / (na + nb);
  const se = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  assert.ok(Math.abs(a - b) <= k * se + 1e-12, `${what}: ${a} (n = ${na}) vs R ${b} (n = ${nb})`);
}
/** A simulated rate against an exact one. @param {number} exact @param {{ rate: number, n: number }} r @param {string} what */
function nearExact(exact, r, what, k = 4) {
  assert.ok(Math.abs(r.rate - exact) <= k * Math.sqrt((exact * (1 - exact)) / r.n), `${what}: exact ${exact} vs R ${r.rate} (n = ${r.n})`);
}

test('Student t tails and quantiles match pt and qt', () => {
  pvRef.t.t.forEach((/** @type {number} */ t, /** @type {number} */ i) => assert.ok(relative(ptTwoSided(t, pvRef.t.df[i]), pvRef.t.twoSided[i]) < 1e-12, `t = ${t}, df = ${pvRef.t.df[i]}`));
  pvRef.qt.tail.forEach((/** @type {number} */ a, /** @type {number} */ i) => assert.ok(relative(qtTwoSided(a, pvRef.qt.df[i]), pvRef.qt.value[i]) < 1e-11, `tail ${a}, df ${pvRef.qt.df[i]}`));
});

test('null-pvalues batch: the exact rate, the t identity on R fits, and the script simulated', () => {
  for (const d of pvRef.batchDesigns) {
    const design = batchDesign(d);
    assert.deepEqual(design.treated, d.treated);
    assert.ok(Math.abs(design.r2 - d.r2) < 1e-12);
    const r = nullEntry({ scenario: 'batch', perBatch: d.perBatch, batches: d.batches, treatedShare: d.treatedShare });
    assert.ok(relative(r.tRatio, d.ratio) < 1e-14);
    // lm() on both steps: the shortcut's t is the model's times the ratio.
    assert.ok(relative(d.t2 / d.t1, d.ratio) < 1e-10, `${d.t2 / d.t1} vs ${d.ratio}`);
    d.u.forEach((/** @type {number} */ u, /** @type {number} */ i) => {
      if (u > 0.5) return;
      const at = nullEntry({ scenario: 'batch', perBatch: d.perBatch, batches: d.batches, treatedShare: d.treatedShare, alpha: u });
      assert.ok(relative(at.shortcut.rejectionRate, d.cdf[i]) < 1e-10, `cdf(${u})`);
    });
  }
  const script = pvRef.batchScript;
  const exact = nullEntry({ scenario: 'batch' });
  nearExact(exact.shortcut.rejectionRate, script.shortcut, 'batch regressed out');
  nearExact(0.05, script.model, 'batch in the model');
  for (const ratio of script.tRatio) assert.ok(relative(ratio, exact.tRatio) < 1e-9);
  script.histogram.forEach((/** @type {number} */ share, /** @type {number} */ i) => {
    const p = exact.shortcut.histogram.density[i] / 20;
    assert.ok(Math.abs(share - p) < 4.5 * Math.sqrt((p * (1 - p)) / script.replicates), `bin ${i}`);
  });
});

test("null-pvalues stepwise: the script's simulation, its one-sided 'correction', and σ rescaled", () => {
  for (const ref of [pvRef.stepwise, pvRef.stepwiseSmall]) {
    for (const finalDf of /** @type {const} */ (['fitted', 'rescaled'])) {
      const r = nullEntry({ scenario: 'stepwise', n: ref.n, steps: ref.steps, finalDf, replicates: 4000, seed: 11 });
      sameRate(r.shortcut.rejectionRate, 4000, ref[finalDf].rate, ref.replicates, `n = ${ref.n}, ${finalDf}`);
    }
  }
  // (1 − pt(t, df)) × 2 with a signed t: half the p-values exceed 1, so the script counts one side only.
  assert.ok(Math.abs(pvRef.stepwise.scriptAbove1 - 0.5) < 0.03);
  assert.ok(pvRef.stepwise.script.rate < 0.6 * pvRef.stepwise.fitted.rate);
});

test('null-pvalues bootstrap: the t-test on bootstrap means and the bootstrap difference, against the script', () => {
  for (const ref of [pvRef.bootstrap, pvRef.bootstrapSmall]) {
    const r = nullEntry({ scenario: 'bootstrap', n: ref.n, resamples: ref.resamples, replicates: ref.replicates, seed: 2 });
    sameRate(r.shortcut.rejectionRate, ref.replicates, ref.ttest.rate, ref.replicates, `t-test, B = ${ref.resamples}`);
    sameRate(r.sound.rejectionRate, ref.replicates, ref.allPairs.rate, ref.replicates, `difference, B = ${ref.resamples}`);
  }
  // The script's 5,000 sampled pairings estimate the all-pairs share, with noise of its own.
  sameRate(pvRef.bootstrap.diff.rate, 1000, pvRef.bootstrap.allPairs.rate, 1000, 'sampled vs all pairs');
});

test("null-pvalues autocorrelation: cor.test, Fisher's z and the script's three remedies on R's series, exactly", () => {
  for (const f of pvRef.autocorrelationFixed) {
    assert.ok(relative(pearsonTest(f.x, f.y), f.pearson) < 1e-11, `pearson n = ${f.n}`);
    assert.ok(relative(fisherTest(f.x, f.y), f.fisher) < 1e-11, `fisher n = ${f.n}`);
    const eff = effectiveDfTest(f.x, f.y);
    assert.ok(relative(eff.neff, f.neff) < 1e-11 && relative(eff.p, f.effdf) < 1e-11, `effdf n = ${f.n}`);
    assert.ok(relative(circularShiftTest(f.x, f.y), f.tts) < 1e-14, `tts n = ${f.n}`);
    assert.ok(relative(neweyWestTest(f.x, f.y), f.hac) < 1e-10, `hac n = ${f.n}: ${neweyWestTest(f.x, f.y)} vs ${f.hac}`);
  }
  const ref = pvRef.autocorrelation;
  const naive = nullEntry({ scenario: 'autocorrelation', replicates: 2000, seed: 4 });
  sameRate(naive.shortcut.rejectionRate, 2000, ref.pearson.rate, ref.replicates, 'naive');
  sameRate(naive.sound.rejectionRate, 2000, ref.effdf.rate, ref.replicates, 'effective df');
  for (const [fix, key] of [['circular-shift', 'tts'], ['newey-west', 'hac']]) {
    const r = nullEntry({ scenario: 'autocorrelation', fix, replicates: 1000, seed: 4 });
    sameRate(r.sound.rejectionRate, 1000, ref[key].rate, ref.replicates, fix);
  }
});

test('null-pvalues two-step: lm() p-values, p.adjust, the script simulated, and its second part', () => {
  const f = pvRef.twoStepFixed;
  const t = twoStepTests(f.x.slice(0, 100), f.y.slice(0, 100), f.x.slice(100), f.y.slice(100));
  for (const [ours, theirs] of [[t.a, f.A], [t.b, f.B], [t.pooled, f.pooled], [t.interaction, f.interaction]]) assert.ok(relative(ours, theirs) < 1e-10, `${ours} vs ${theirs}`);
  bhAdjust(pvRef.bh.p).forEach((q, i) => assert.ok(relative(q, pvRef.bh.adjusted[i]) < 1e-14));
  const ref = pvRef.twoStep;
  const r = nullEntry({ scenario: 'two-step', features: ref.features, seed: 3 });
  sameRate(r.sound.rejectionRate, r.sound.count, ref.pooled.rate, ref.pooled.n, 'pooled filter');
  sameRate(r.shortcut.rejectionRate, r.shortcut.count, ref.either.rate, ref.either.n, 'either-group filter');
  sameRate(r.selected.sound / ref.features, ref.features, ref.selectedPooled / ref.features, ref.features, 'kept by the pooled effect', 6);
  // As written, the second part selects with the first part's A and B columns, not its own.
  assert.deepEqual(pvRef.twoStepPart2.selectionColumns, ['A', 'B']);
  assert.deepEqual(pvRef.twoStepPart2.columnsAsWritten, ['x', 'f']);
});

test('null-pvalues pairing: Welch and paired t-tests exactly, and the script simulated with and without an effect', () => {
  assert.ok(relative(welchTest(pvRef.welchFixed.a, pvRef.welchFixed.b), pvRef.welchFixed.welch) < 1e-12);
  assert.ok(relative(oneSampleTest(pvRef.welchFixed.a), pvRef.welchFixed.one) < 1e-12);
  const ref = pvRef.pairing;
  for (const [meanChange, block] of [[0, ref.null], [0.25, ref.effect]]) {
    const r = nullEntry({ scenario: 'pairing', meanChange, replicates: 20000, seed: 5 });
    sameRate(r.shortcut.rejectionRate, 20000, block.twoSample.rate, ref.replicates, `two-sample, change ${meanChange}`);
    sameRate(r.sound.rejectionRate, 20000, block.oneSample.rate, ref.replicates, `paired, change ${meanChange}`);
  }
});

test('null-pvalues enrichment: dhyper, phyper and fisher.test exactly; the exact rates; the script simulated', () => {
  for (const c of pvRef.hypergeometric) {
    const { pmf, tail } = hypergeometric(c.genes, c.de, c.size);
    c.pmf.forEach((/** @type {number} */ p, /** @type {number} */ k) => assert.ok(relative(pmf[k], p) < 1e-12, `pmf ${k} of ${JSON.stringify(c)}`));
    c.tail.forEach((/** @type {number} */ p, /** @type {number} */ k) => assert.ok(relative(tail[k], p) < 1e-12 && relative(tail[k], c.fisher[k]) < 1e-10, `tail ${k}`));
  }
  const ref = pvRef.enrichmentExact;
  ref.u.forEach((/** @type {number} */ u, /** @type {number} */ i) => {
    if (u > 0.5) return;
    const r = nullEntry({ scenario: 'enrichment', alpha: u });
    assert.ok(relative(r.sound.rejectionRate, ref.all[i]) < 1e-12, `all at ${u}`);
    assert.ok(relative(r.shortcut.rejectionRate, ref.nonEmpty[i]) < 1e-12, `with a hit at ${u}`);
    assert.ok(relative(r.nonEmptyShare, ref.nonEmptyShare) < 1e-12);
  });
  const script = pvRef.enrichmentScript;
  const exact = nullEntry({ scenario: 'enrichment' });
  script.all.forEach((/** @type {number} */ rate, /** @type {number} */ i) => {
    nearExact(exact.sound.rejectionRate, { rate, n: 2000 }, `script run ${i}, all`);
    nearExact(exact.shortcut.rejectionRate, { rate: script.nonEmpty[i], n: Math.round(2000 * script.nonEmptyShare[i]) }, `script run ${i}, with a hit`);
    assert.ok(script.duplicateShare[i] < 0.002); // genes drawn with replacement: about 0.1% repeats
  });
});

// ---------- marchenko-pastur, against RMTstat and the original scripts (fixtures/r-marchenko-pastur.json) ----------

const mpRef = JSON.parse(readFileSync(new URL('fixtures/r-marchenko-pastur.json', import.meta.url), 'utf8'));
/** Results are a union over views; tests read them untyped. @param {unknown} params @returns {any} */
const mpEntry = (params) => computeMp(params);
/** A simulated mean within k standard errors (of the two means' difference) of R's. @param {number} a @param {number} sa @param {number} na @param {number} b @param {number} sb @param {number} nb @param {string} what */
function sameMean(a, sa, na, b, sb, nb, what, k = 4) {
  assert.ok(Math.abs(a - b) <= k * Math.sqrt((sa * sa) / na + (sb * sb) / nb), `${what}: ${a} vs R ${b}`);
}

test('marchenko-pastur: the density, edges, distribution function and quantiles match RMTstat (ndf = n − 1)', () => {
  for (const c of mpRef.density) {
    const law = mpLaw(c.n, c.p, c.variance);
    const dist = mpDistribution(law.gamma, c.variance);
    // With p > n − 1, qmp(0) is the point mass at 0; otherwise the lower edge.
    assert.ok(Math.abs((law.zeroShare > 0 ? 0 : law.lower) - c.edges[0]) < 1e-15 * c.variance, `lower ${c.n}, ${c.p}`);
    if (law.zeroShare > 0) assert.equal(dist.quantile(law.zeroShare / 2), 0);
    assert.ok(relative(law.upper, c.edges[1]) < 1e-13);
    // The fixture's edges carry 15 digits, so its first and last x can fall a hair inside the support.
    c.x.forEach((/** @type {number} */ x, /** @type {number} */ i) => {
      if (i > 0 && i < c.x.length - 1) assert.ok(Math.abs(mpDensity(x, law.gamma, c.variance) - c.density[i]) < 1e-12 * (1 + c.density[i]), `dmp(${x})`);
    });
    // The closed form against R's integrate() of dmp from the edge, and against pmp, which
    // is itself approximate (to about 1e-6 near γ = 1).
    c.cdfAt.forEach((/** @type {number} */ x, /** @type {number} */ i) => {
      assert.ok(Math.abs(dist.cdf(x) - c.cdfIntegrated[i]) < 1e-11, `integrate(${x}): ${dist.cdf(x)} vs ${c.cdfIntegrated[i]}`);
      assert.ok(Math.abs(dist.cdf(x) - c.cdf[i]) < 2e-6, `pmp(${x})`);
    });
    // qmp is coarser still: the exact distribution function puts its quantiles within
    // 1e-4 of their probabilities (pmp(qmp(0.25)) is 0.250014 at n = 200, p = 20), while
    // this entry's are exact to rounding.
    c.probs.forEach((/** @type {number} */ q, /** @type {number} */ i) => {
      if (q <= law.zeroShare) return;
      assert.ok(Math.abs(dist.cdf(c.quantiles[i]) - q) < 1e-4, `qmp(${q}): F(${c.quantiles[i]}) = ${dist.cdf(c.quantiles[i])}`);
      assert.ok(Math.abs(dist.cdf(dist.quantile(q)) - q) < 1e-9);
    });
    // The script's edges take ndf = n.
    const script = mpEntry({ view: 'noise', n: c.n, p: Math.min(c.p, 500), variance: c.variance, replicates: 1 }).scriptEdges;
    assert.ok(relative(script.upper, c.scriptEdges[1]) < 1e-13);
  }
});

test("marchenko-pastur noise: marchenko–pastur_intuitions.R's simulation, index by index, and a wide matrix", () => {
  const ref = mpRef.script;
  const r = mpEntry({ view: 'noise', n: ref.n, p: ref.p, variance: ref.variance, replicates: ref.replicates, seed: 3 });
  // Each index's mean, against R's with its own spread.
  r.sample.byIndex.forEach((/** @type {any} */ b, /** @type {number} */ k) => {
    sameMean(b.mean, ref.indexSd[k], ref.replicates, ref.indexMean[k], ref.indexSd[k], ref.replicates, `index ${k + 1}`);
  });
  const se = (/** @type {number} */ p) => Math.sqrt((p * (1 - p)) * (2 / ref.replicates));
  assert.ok(Math.abs(r.sample.largest.aboveEdge - ref.largestAboveEdge) < 4 * se(ref.largestAboveEdge));
  assert.ok(Math.abs(r.sample.smallestBelowEdge - ref.smallestBelowEdge) < 4 * se(ref.smallestBelowEdge));
  assert.ok(relative(r.edges.upper, ref.threshold) < 1e-13 && relative(r.scriptEdges.upper, ref.scriptThreshold) < 1e-13);
  const wide = mpRef.wide;
  const w = mpEntry({ view: 'noise', n: wide.n, p: wide.p, variance: wide.variance, replicates: wide.replicates, seed: 3 });
  assert.ok(Math.abs(w.zeroShare - wide.zeroShare) < 1e-12);
  assert.ok(Math.abs(w.sample.largest.mean - wide.largestMean) < 0.15, `${w.sample.largest.mean} vs ${wide.largestMean}`);
});

test('marchenko-pastur spikes: eigenvalues and eigenvector overlaps against an R simulation and the BBP limits', () => {
  const ref = mpRef.spiked;
  const r = mpEntry({ view: 'spikes', n: ref.n, p: ref.p, spikes: ref.spikes, replicates: 300, seed: 5 });
  r.spikes.forEach((/** @type {any} */ s, /** @type {number} */ k) => {
    sameMean(s.sample.mean, ref.eigenSd[k], 300, ref.eigenMean[k], ref.eigenSd[k], ref.replicates, `eigenvalue ${k + 1}`);
    sameMean(s.sample.overlap, ref.overlapSd[k], 300, ref.overlapMean[k], ref.overlapSd[k], ref.replicates, `overlap ${k + 1}`);
  });
  sameMean(r.nextLargest.mean, ref.eigenSd[3], 300, ref.eigenMean[3], ref.eigenSd[3], ref.replicates, 'the largest bulk eigenvalue');
  // At n = 200 the strong spike is already at its limit.
  const limit = bbp(4, 100 / 199);
  assert.ok(Math.abs(ref.eigenMean[0] - limit.eigenvalue) < 0.05 && Math.abs(ref.overlapMean[0] - limit.overlap) < 0.01);
});

test("marchenko-pastur pcs: prcomp() exactly, before and after batch centring, and 1st_two_pc_axes.R over seeds", () => {
  const ref = mpRef.pca;
  const rows = () => /** @type {Float64Array[]} */ (ref.Y.map((/** @type {number[]} */ row) => Float64Array.from(row)));
  const before = principalComponents(rows(), 10);
  before.eigenvalues.forEach((v, i) => assert.ok(Math.abs(v - ref.eigenvalues[i]) < 1e-10 * ref.eigenvalues[0], `eigenvalue ${i}`));
  for (const k of [0, 1]) {
    // Scores agree up to the sign of each axis.
    const sign = Math.sign(before.scores[k][0] * ref.scores[0][k]);
    before.scores[k].forEach((v, i) => assert.ok(Math.abs(sign * v - ref.scores[i][k]) < 1e-9, `score ${i}, PC${k + 1}`));
  }
  const centred = rows();
  for (const b of [0, 1]) {
    const members = centred.filter((_, i) => ref.batch[i] === b);
    const means = members[0].map((_, j) => members.reduce((s, row) => s + row[j], 0) / members.length);
    for (const row of members) for (let j = 0; j < row.length; j++) row[j] -= means[j];
  }
  const after = principalComponents(centred, 10);
  ref.corrected.eigenvalues.forEach((/** @type {number} */ v, /** @type {number} */ i) => assert.ok(Math.abs(after.eigenvalues[i] - v) < 1e-10 * ref.corrected.eigenvalues[0], `corrected ${i}`));
  ref.corrected.batchDifference.forEach((/** @type {number} */ d) => assert.ok(Math.abs(d) < 1e-12));
  // The script's own model (interactions included) over 12 seeds, against this entry's.
  const s = mpRef.batchScript;
  const r = mpEntry({ view: 'pcs', n: s.n, p: s.p, factors: s.factors, batchVariance: s.batchVariance, noiseVariance: s.noiseVariance, interactions: s.interactions, seed: 9 });
  assert.ok(Math.abs(Math.abs(r.uncorrected.batchDifference[0]) - s.pc1Difference.mean) < 4 * s.pc1Difference.sd);
  assert.ok(Math.abs(r.uncorrected.eigenvalues[0] - s.top.mean) < 4 * s.top.sd);
  assert.ok(Math.abs(r.uncorrected.aboveEdge - s.above.mean) <= 4 * s.above.sd + 1);
  assert.ok(Math.abs(r.corrected.eigenvalues[0] - s.topCentred.mean) < 4 * s.topCentred.sd);
});
