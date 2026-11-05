import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import { pnorm } from '../lib/normal.js';
import { betaI, gammaP, qgamma } from '../lib/special.js';
import { chiCdf, chiLogDensity, chiMean, compute as computeTypical, CUBE_DIMENSIONS, FAMILIES, PRESETS, sphereMarginal } from '../typical-set/compute.js';

/** Results are a union over views; tests read them untyped. @param {unknown} params @returns {any} */
const ts = (params) => computeTypical(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
/** Trapezoid rule over a grid. @param {number[]} x @param {number[]} y */
const trapezoid = (x, y) => x.slice(1).reduce((sum, xi, i) => sum + ((xi - x[i]) * (y[i] + y[i + 1])) / 2, 0);
/** @param {unknown} params */
function issues(params) {
  try {
    ts(params);
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    return error.issues.map((i) => `${i.code} ${i.path}`);
  }
  return assert.fail('accepted');
}

test('special functions: known values and inverses', () => {
  close(gammaP(1, 2), 1 - Math.exp(-2), 1e-15);
  close(gammaP(0.5, 2), 1 - 2 * pnorm(-2), 1e-14); // chi-square(1) at 4
  for (const a of [0.5, 3, 50, 500]) for (const p of [1e-8, 0.05, 0.5, 0.99]) close(gammaP(a, qgamma(p, a)), p, p * 1e-12);
  close(betaI(0.3, 1, 1), 0.3, 1e-15);
  close(betaI(0.25, 2, 3) + betaI(0.75, 3, 2), 1, 1e-14);
});

test('shell: density × volume is the chi density, which integrates to 1 with the closed-form moments', () => {
  for (const k of [1, 2, 5, 10, 100, 1000]) {
    const r = ts({ view: 'shell', k });
    const { radius, mass, log10Density, log10Surface } = r.curve;
    close(trapezoid(radius, mass), 1, 2e-4);
    close(trapezoid(radius, mass.map((/** @type {number} */ f, /** @type {number} */ i) => f * radius[i])), r.mean, 2e-3);
    for (let i = 1; i < radius.length; i += 17) close(log10Density[i] + log10Surface[i], chiLogDensity(radius[i], k) / Math.LN10, 1e-9);
    close(r.mode, Math.sqrt(k - 1), 0);
    close(chiCdf(r.shell.lo, k), 0.05, 1e-12);
    close(chiCdf(r.shell.hi, k), 0.95, 1e-12);
    close(chiCdf(r.hdrRadius, k), 0.9, 1e-12);
    assert.ok(r.sd < 0.71 && r.sd > 0.6); // the shell's width stays near 1/√2
  }
  close(chiMean(1), Math.sqrt(2 / Math.PI), 1e-15);
  const far = ts({ view: 'shell', k: 1000, radius: 1 });
  assert.equal(far.ball.mass, 0); // underflows, but its log does not
  assert.ok(far.ball.log10Mass < -1000);
  assert.equal(ts({ view: 'shell', k: 10, radius: 0 }).ball.log10Mass, null);
  const sweep = ts({ view: 'shell' }).sweep;
  assert.equal(sweep.k[0], 1);
  assert.equal(sweep.k[sweep.k.length - 1], 1000);
});

test('cube: the criterion a·d(a) peaks at the reported half-width, the same for every k', () => {
  for (const family of FAMILIES) {
    const r = ts({ view: 'cube', family });
    r.distance.forEach((/** @type {number} */ d, /** @type {number} */ i) => close(d, r.halfWidth * Math.sqrt(CUBE_DIMENSIONS[i]), 1e-12));
    r.log10CubeMass.forEach((/** @type {number} */ m, /** @type {number} */ i) => close(m, CUBE_DIMENSIONS[i] * Math.log10(r.withinHalfWidth), 1e-12));
    assert.equal(r.sample, null);
  }
  const normal = ts({ view: 'cube', family: 'normal' });
  close(normal.withinHalfWidth, 1 - 2 * pnorm(-1), 1e-15);
  assert.ok(normal.exact.median[10] > 31.9 && normal.exact.median[10] < 32);
  assert.equal(ts({ view: 'cube', family: 'cauchy' }).exact, null);
});

test('cube: Monte Carlo radii are seeded, and grow like √k for finite variance but like k for the Cauchy', () => {
  const a = ts({ view: 'cube', family: 'laplace', sample: { n: 200, seed: 4 } });
  assert.deepEqual(a.sample, ts({ view: 'cube', family: 'laplace', sample: { n: 200, seed: 4 } }).sample);
  assert.notDeepEqual(a.sample.median, ts({ view: 'cube', family: 'laplace', sample: { n: 200, seed: 5 } }).sample.median);
  const last = CUBE_DIMENSIONS.length - 1;
  close(a.sample.median[last] / Math.sqrt(1024), 1, 0.02);
  const cauchy = ts({ view: 'cube', family: 'cauchy', sample: { n: 200, seed: 4 } }).sample.median;
  const slope = Math.log(cauchy[last] / cauchy[last - 4]) / Math.log(16);
  assert.ok(slope > 0.85 && slope < 1.15, `Cauchy slope ${slope}`);
});

test('modes: highest-density regions, exactly, for a normal and the script mixtures', () => {
  for (const level of [0.05, 0.5, 0.9]) {
    const r = ts({ view: 'modes', components: [{ weight: 1, location: 2, scale: 3, shape: 'normal' }], level });
    const half = 3 * Math.sqrt(-2 * Math.log(level));
    assert.equal(r.regions.length, 1);
    close(r.regions[0].lo, 2 - half, 1e-9);
    close(r.covered, 1 - 2 * pnorm(-half / 3), 1e-12);
  }
  const bath = ts({ view: 'modes' });
  assert.equal(bath.regions.length, 2); // the narrow bump and the broad one, at half the peak
  assert.ok(bath.mode > 9.9 && bath.mode < 10);
  close(ts({ view: 'modes', level: 0 }).covered, 1, 0);
  assert.equal(ts({ view: 'modes', level: 1 }).covered, 0);
  const levels = bath.coverage.covered;
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1e-12);
  const spike = ts({ view: 'modes', components: PRESETS.spike, level: 0.8 });
  close(spike.mode, 0, 1e-9);
  close(spike.weights[0], 2 / 92, 1e-15);
  assert.ok(spike.covered < 0.01); // the tallest point holds almost nothing
  const bimodal = ts({ view: 'modes', components: PRESETS.bimodal });
  close(bimodal.mean, 0, 1e-15);
  assert.equal(bimodal.modes.length, 2);
  assert.ok(bimodal.densityAtMean < 1e-7);
});

test('sphere: the coordinate density integrates to 1, is uniform for k = 3, and the sample agrees', () => {
  for (const k of [2, 3, 10, 200]) {
    const r = ts({ view: 'sphere', k });
    // The grid is cell midpoints, so the midpoint rule applies.
    if (k > 2) close(r.curve.density.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) * (2 / r.curve.x.length), 1, 1e-4);
    close(r.sd, 1 / Math.sqrt(k), 0);
  }
  close(sphereMarginal(0.4, 3), 0.5, 1e-14);
  close(ts({ view: 'sphere', k: 3, band: 0.37 }).bandMass, 0.37, 1e-13); // Archimedes
  const r = ts({ view: 'sphere', k: 10, sample: { n: 5000, seed: 2 } });
  const se = Math.sqrt((r.bandMass * (1 - r.bandMass)) / 5000);
  assert.ok(Math.abs(r.sample.bandShare - r.bandMass) < 4 * se);
  close(r.sample.density.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) * (r.sample.edges[1] - r.sample.edges[0]), 1, 1e-12);
  assert.deepEqual(r.sample, ts({ view: 'sphere', k: 10, sample: { n: 5000, seed: 2 } }).sample);
});

test('typical-set params are checked in full', () => {
  assert.deepEqual(issues({ view: 'shell', k: 0, coverage: 1, extra: 1 }), ['unknown_field params.extra', 'out_of_range params.k', 'out_of_range params.coverage']);
  assert.deepEqual(issues({ view: 'cube', family: 'gamma', sample: { n: 0 } }), ['out_of_range params.family', 'out_of_range params.sample.n']);
  assert.deepEqual(issues({ view: 'modes', components: [{ weight: 1, location: 0, scale: 0, shape: 'cauchy' }, { location: 1, scale: 1 }] }),
    ['out_of_range params.components[0].scale', 'out_of_range params.components[0].shape', 'missing_field params.components[1].weight']);
  assert.deepEqual(issues({ view: 'modes', components: [] }), ['wrong_type params.components']);
  assert.deepEqual(issues({ view: 'sphere', k: 1 }), ['out_of_range params.k']);
  assert.deepEqual(issues({ view: 'nope' }), ['out_of_range params.view']);
});
