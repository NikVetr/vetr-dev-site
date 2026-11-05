// The samplers against exact targets: long seeded chains, thinned to about one draw per
// effective sample, pass a Kolmogorov–Smirnov test against every exact marginal (the wrong
// multiplier chains against the targets they actually have); and the bulk ESS, the exact
// marginals and the smiley's density against R (tests/fixtures/r-samplers.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import {
  compute as computeSamplers, essBulk, funnelSpace, funnelXCdf, ksDistance, marginals, resolveParams, runChain, smileySpace, smileyXCdf, smileyYCdf, spaceOf,
} from '../samplers/compute.js';

/** @param {unknown} params @returns {any} */
const compute = (params) => computeSamplers(params);
const ref = JSON.parse(readFileSync(new URL('fixtures/r-samplers.json', import.meta.url), 'utf8'));

/**
 * Runs a view's chain without storing proposals, maps it to (x, y), thins it to about one
 * draw per effective sample and returns the KS distances and the critical value at 0.1%.
 * @param {any} params @param {'target' | 'settled'} [against]
 */
function check(params, against = 'target') {
  const p = /** @type {any} */ (resolveParams({ ...params, iterations: 10 }));
  p.iterations = params.iterations;
  const space = spaceOf(p);
  const chain = runChain(space, {
    sampler: p.view === 'hastings' ? 'multiplier' : p.sampler, step: p.step, leapfrog: p.leapfrog ?? 1, iterations: p.iterations,
    start: space.fromTarget(p.start), seed: p.seed, correction: p.correction, store: false,
  });
  const x = new Float64Array(p.iterations);
  const y = new Float64Array(p.iterations);
  for (let i = 0; i < p.iterations; i++) [x[i], y[i]] = space.toTarget([chain.a[i + 1], chain.b[i + 1]]);
  const m = marginals(p);
  const cdf = against === 'settled' ? /** @type {NonNullable<typeof m.settled>} */ (m.settled) : m;
  const ess = Math.min(/** @type {number} */ (essBulk(x)), /** @type {number} */ (essBulk(y)), p.iterations);
  const every = Math.max(1, Math.ceil(p.iterations / ess));
  const thin = (/** @type {Float64Array} */ v) => v.filter((_, i) => i % every === 0);
  const n = Math.ceil(p.iterations / every);
  return { x: ksDistance(thin(x), cdf.x), y: ksDistance(thin(y), cdf.y), critical: 1.95 / Math.sqrt(n), ess, divergent: chain.divergent.length, accepted: chain.accepted.reduce((s, v) => s + v, 0) / p.iterations };
}

const passes = (/** @type {ReturnType<typeof check>} */ r, /** @type {string} */ what) => {
  assert.ok(r.x < r.critical && r.y < r.critical, `${what}: KS ${r.x.toFixed(4)}, ${r.y.toFixed(4)} against ${r.critical.toFixed(4)} (ESS ${r.ess.toFixed(0)})`);
};

test('samplers: random-walk Metropolis, HMC and Gibbs reach the exact normal', () => {
  passes(check({ view: 'target', target: 'normal', sampler: 'rwm', step: 1.5, iterations: 200000, seed: 3 }), 'RWM');
  passes(check({ view: 'target', target: 'normal', sampler: 'hmc', step: 0.3, leapfrog: 10, iterations: 40000, seed: 4 }), 'HMC');
  const r = compute({ view: 'target', target: 'normal', sampler: 'gibbs', iterations: 100000, seed: 5 });
  const m = marginals(resolveParams({ view: 'target', target: 'normal' }));
  const ess = Math.min(r.stats.ess.x, r.stats.ess.y);
  const every = Math.ceil(100000 / ess);
  const thin = (/** @type {number[]} */ v) => v.slice(1).filter((_, i) => i % every === 0);
  assert.ok(ksDistance(thin(r.draws.x), m.x) < 1.95 / Math.sqrt(100000 / every));
  assert.ok(ksDistance(thin(r.draws.y), m.y) < 1.95 / Math.sqrt(100000 / every));
});

test('samplers: the non-centred and quantile funnels reach the exact marginals of x and y', () => {
  passes(check({ view: 'funnel', coordinates: 'non-centred', sampler: 'hmc', iterations: 30000, seed: 6 }), 'non-centred HMC');
  passes(check({ view: 'funnel', coordinates: 'quantile', sampler: 'hmc', iterations: 30000, seed: 7 }), 'quantile HMC');
  passes(check({ view: 'funnel', coordinates: 'non-centred', sampler: 'rwm', iterations: 200000, seed: 8 }), 'non-centred RWM');
  passes(check({ view: 'funnel', coordinates: 'centred', sampler: 'rwm', sdY: 0.5, step: 0.5, iterations: 400000, seed: 9 }), 'a mild centred funnel, RWM');
});

test('samplers: the centred funnel diverges and misses its neck; the non-centred one does not', () => {
  const centred = compute({ view: 'funnel', iterations: 4000, seed: 2 });
  const non = compute({ view: 'funnel', coordinates: 'non-centred', iterations: 4000, seed: 2 });
  assert.ok(centred.stats.divergences > 40);
  assert.equal(non.stats.divergences, 0);
  assert.ok(centred.stats.tails.below05 < 0.035);
  assert.ok(Math.abs(non.stats.tails.below05 - 0.05) < 0.015);
});

test('samplers: the evil smiley, by random-walk Metropolis and by HMC', () => {
  passes(check({ view: 'target', target: 'smiley', sampler: 'rwm', step: 1, iterations: 400000, seed: 10 }), 'RWM');
  passes(check({ view: 'target', target: 'smiley', sampler: 'hmc', step: 0.2, leapfrog: 20, iterations: 40000, seed: 11 }), 'HMC');
});

test('samplers: the multiplier reaches the log-normal with its Hastings ratio, and the shifted targets without it or with it reversed', () => {
  const base = { view: 'hastings', step: 0.5, sd: 0.5, correlation: 0.6, iterations: 200000 };
  passes(check({ ...base, correction: 'correct', seed: 12 }), 'correct');
  for (const correction of ['missing', 'reversed']) {
    const own = check({ ...base, correction, seed: 13 }, 'settled');
    passes(own, `${correction}, against the target it settles on`);
    const wrong = check({ ...base, correction, seed: 13 });
    assert.ok(wrong.x > 10 * wrong.critical, `${correction} against the log-normal`);
  }
  const r = compute({ view: 'hastings', correction: 'missing', sd: 0.4, correlation: 0 });
  assert.ok(Math.abs(r.exact.settled.shift + 0.16) < 1e-12);
  assert.ok(Math.abs(r.exact.settled.median - Math.exp(-0.16)) < 1e-12);
});

test('samplers: each coordinate system is the same funnel', () => {
  // log density in the sampler's coordinates = the funnel's at the mapped point + log |Jacobian| + constant
  const sd = 1.5;
  const centred = funnelSpace('centred', sd);
  for (const coordinates of /** @type {const} */ (['non-centred', 'quantile'])) {
    const space = funnelSpace(coordinates, sd);
    const offsets = [];
    for (const q of /** @type {[number, number][]} */ ([[0.3, -0.4], [-1.2, 1.1], [2, 0.5], [0.1, -2]])) {
      const t = space.toTarget(q);
      const back = space.fromTarget(t);
      assert.ok(Math.abs(back[0] - q[0]) < 1e-9 && Math.abs(back[1] - q[1]) < 1e-9);
      const h = 1e-6;
      const dx = [space.toTarget([q[0] + h, q[1]]), space.toTarget([q[0], q[1] + h])].map((v) => [(v[0] - t[0]) / h, (v[1] - t[1]) / h]);
      const jacobian = Math.abs(dx[0][0] * dx[1][1] - dx[0][1] * dx[1][0]);
      offsets.push(space.logDensity(q) - centred.logDensity(t) - Math.log(jacobian));
    }
    for (const o of offsets) assert.ok(Math.abs(o - offsets[0]) < 1e-4, coordinates);
  }
  // HMC's gradients are the log density's.
  for (const space of [centred, funnelSpace('quantile', sd), smileySpace()]) {
    const q = /** @type {[number, number]} */ ([0.4, 0.9]);
    const g = space.gradient(q);
    const h = 1e-6;
    assert.ok(Math.abs(g[0] - (space.logDensity([q[0] + h, q[1]]) - space.logDensity([q[0] - h, q[1]])) / (2 * h)) < 1e-5);
    assert.ok(Math.abs(g[1] - (space.logDensity([q[0], q[1] + h]) - space.logDensity([q[0], q[1] - h])) / (2 * h)) < 1e-5);
  }
});

test('samplers: results carry the chain, its proposals or trajectories, and its diagnostics', () => {
  const hmc = compute({ view: 'funnel', iterations: 50, leapfrog: 7 });
  assert.equal(hmc.draws.x.length, 51);
  assert.equal(hmc.trajectories.length, 50);
  assert.ok(hmc.trajectories.every((/** @type {number[]} */ t, /** @type {number} */ i) => t.length <= 16 && (hmc.divergent.includes(i) || t.length === 16)));
  assert.equal(hmc.proposals, null);
  assert.equal(hmc.stats.gradients, 50 * 8);
  const rwm = compute({ view: 'target', sampler: 'rwm', iterations: 30 });
  assert.equal(rwm.proposals.a.length, 30);
  assert.equal(rwm.trajectories, null);
  const same = compute({ view: 'target', sampler: 'rwm', iterations: 30 });
  assert.deepEqual(same.draws, rwm.draws);
  const quantile = compute({ view: 'funnel', coordinates: 'quantile', iterations: 10 });
  assert.equal(quantile.space.a.length, 11);
  assert.ok(Math.abs(quantile.draws.x[0] - 1) < 1e-9 && Math.abs(quantile.draws.y[0]) < 1e-12);
});

test('samplers: invalid requests list every problem', () => {
  try {
    resolveParams({ view: 'target', target: 'smiley', sampler: 'gibbs', step: 0, start: [1], bogus: true });
    assert.fail('expected an error');
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    assert.deepEqual(error.issues.map((i) => i.path).sort(), ['params.bogus', 'params.sampler', 'params.start', 'params.step']);
  }
  assert.throws(() => resolveParams({ view: 'hastings', start: [1, -1] }), /must be positive/);
  assert.throws(() => resolveParams({ view: 'funnel', iterations: 100000, leapfrog: 500 }), /too_much_work|stores/);
  assert.throws(() => resolveParams({ view: 'funnel', correction: 'correct' }), /unknown field/);
});

test('samplers: bulk ESS matches posterior::ess_bulk', () => {
  for (const s of ref.ess) assert.ok(Math.abs(/** @type {number} */ (essBulk(s.x)) / s.ess_bulk - 1) < 1e-9, `${s.name}: ${essBulk(s.x)} vs ${s.ess_bulk}`);
});

test('samplers: the exact marginals match R\'s integrate(), and the smiley\'s density evil_smiley_functions.R\'s', () => {
  for (const c of ref.funnel_x) assert.ok(Math.abs(funnelXCdf(c.x, c.sd) - c.cdf) < 1e-9, `funnel x = ${c.x}, σ = ${c.sd}`);
  // x's marginal is exactly a normal mixture here; R's nested integrate() is within 6e-7 of it.
  for (const c of ref.smiley_x) assert.ok(Math.abs(smileyXCdf(c.at) - c.cdf) < 1e-6, `smiley x = ${c.at}`);
  for (const c of ref.smiley_y) assert.ok(Math.abs(smileyYCdf(c.at) - c.cdf) < 1e-8, `smiley y = ${c.at}`);
  const smiley = smileySpace();
  for (const c of ref.smiley_density) assert.ok(Math.abs(smiley.logDensity([c.x, c.y]) - c.log) < 1e-12, `smiley (${c.x}, ${c.y})`);
});
