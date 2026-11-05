// The backpack fallacy's integrals: closed forms, internal consistency, and agreement with
// R (tests/fixtures/r-backpack.json: R's integrate() of the noncentral t, and
// backpack_fallacy.R rerun with ten million draws and its two-sided p-value fixed; see
// the fixture's "source").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lgamma, ptTwoSided, qtTwoSided } from '../lib/special.js';
import { IntuitionsError } from '../lib/params.js';
import { chanceLarger, compute as computeBackpack, logAbsT, logKernelDirect, posterior, resolveParams, STEP, tQuantile } from '../backpack-fallacy/compute.js';

/** @param {unknown} params @returns {any} */
const compute = (params) => computeBackpack(params);
const ref = JSON.parse(readFileSync(new URL('fixtures/r-backpack.json', import.meta.url), 'utf8'));
const logT = (/** @type {number} */ t, /** @type {number} */ nu) => lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - ((nu + 1) / 2) * Math.log1p((t * t) / nu);

test('backpack: with no true difference |T| has twice the central t density', () => {
  for (const nu of [2, 5, 30, 254, 16382]) {
    for (const t of [0, 0.3, 2, 9, 40]) {
      const expected = Math.log(2) + logT(t, nu);
      assert.ok(Math.abs(logAbsT(nu, t, 0) - expected) < 1e-8, `ν = ${nu}, t = ${t}`);
    }
  }
});

test('backpack: the tabulated kernel matches its direct quadrature', () => {
  // log density of |T| rebuilt from logKernelDirect, against logAbsT's table.
  const direct = (/** @type {number} */ nu, /** @type {number} */ t, /** @type {number} */ delta) => {
    const A = nu + t * t;
    const mu = (t * delta) / Math.sqrt(A);
    const base = Math.log(2) + (nu / 2) * Math.log(nu / 2) - lgamma(nu / 2) - 0.5 * Math.log(2 * Math.PI) - ((nu + 1) / 2) * Math.log(A) - (delta * delta * nu) / (2 * A);
    const plus = logKernelDirect(nu, mu);
    return base + plus + Math.log1p(Math.exp(logKernelDirect(nu, -mu) - plus));
  };
  for (const nu of [2, 30, 2046]) {
    for (const [t, delta] of [[0, 0], [0.5, 0.2], [3, 1.7], [3, 40], [12, 11], [1e6, 3e6], [1e15, 2e15]]) {
      assert.ok(Math.abs(logAbsT(nu, t, delta) - direct(nu, t, delta)) < 1e-9, `ν = ${nu}, t = ${t}, δ = ${delta}`);
    }
  }
  // The kernel at μ = 0 is ∫ yᵛ e^{−y²/2} dy = 2^((ν − 1)/2) Γ((ν + 1)/2).
  for (const nu of [2, 3, 30, 254]) assert.ok(Math.abs(logKernelDirect(nu, 0) - (((nu - 1) / 2) * Math.LN2 + lgamma((nu + 1) / 2))) < 1e-8, `ν = ${nu}`);
});

test('backpack: t quantiles invert the two-sided tail, down to p = 10⁻³¹', () => {
  for (const nu of [2, 3, 30, 254, 16382]) {
    for (const x of [0.01, 0.5, 1.3, 3, 8, 15, 31]) {
      const p = 10 ** -x;
      const t = tQuantile(p, nu);
      assert.ok(Math.abs(ptTwoSided(t, nu) / p - 1) < 1e-10, `ν = ${nu}, p = 1e-${x}`);
      if (x < 15) assert.ok(Math.abs(t / qtTwoSided(p, nu) - 1) < 1e-9);
    }
  }
  assert.equal(tQuantile(1, 30), 0);
});

test('backpack: each distribution integrates to 1 and the two chances are complementary', () => {
  const p = resolveParams({});
  const a = posterior(p, 2, 9.92);
  const b = posterior(p, 128, 2.6);
  assert.ok(Math.abs(a.cdf[a.cdf.length - 1] - 1) < 1e-15);
  assert.ok(Math.abs(chanceLarger(a, b) + chanceLarger(b, a) - 1) < 1e-6);
  assert.ok(Math.abs(chanceLarger(b, b) - 0.5) < 1e-6);
});

test('backpack: the result covers every pair, and the window average is the matched curve when flat', () => {
  const r = compute({ sizes: [16, 2, 128], upTo: 3, window: 0.5, at: 1.3 });
  assert.deepEqual(r.studies.map((/** @type {any} */ s) => s.n), [2, 16, 128]);
  assert.equal(r.x.length, Math.round(3 / STEP) + 1);
  assert.deepEqual(r.pairs.map((/** @type {any} */ p) => [p.smaller, p.larger]), [[2, 16], [2, 128], [16, 128]]);
  for (const p of r.pairs) {
    assert.equal(p.matched.length, r.x.length);
    assert.equal(p.windowed.length, r.x.length);
    for (const v of [...p.matched, ...p.windowed]) assert.ok(v >= 0 && v <= 1);
  }
  // With almost no true differences, −log10 p has the null's density, ln 10 × 10^−x; for
  // 2 per group the departure is about the variance of δ, 2 × 10⁻⁴ here.
  const near = compute({ prior: 'normal', scale: 0.01, sizes: [2, 16], upTo: 5, window: 0 });
  near.studies[0].density.forEach((/** @type {number} */ d, /** @type {number} */ k) => assert.ok(Math.abs(d / (Math.LN10 * 10 ** -near.x[k]) - 1) < 5e-4, `x = ${near.x[k]}`));
  assert.equal(compute({ window: 0 }).pairs[0].windowed, null);
  // Under the script's Cauchy the smaller study is the likelier to have the larger effect
  // at every p-value; with small normal effects the 2-per-group study is not.
  assert.ok(compute({}).pairs.every((/** @type {any} */ p) => p.matched.every((/** @type {number} */ v) => v > 0.5)));
  const normal = compute({ prior: 'normal', scale: 0.25, sizes: [2, 16], window: 0 });
  assert.ok(normal.pairs[0].matched[Math.round(3 / STEP)] < 0.25);
});

test('backpack: invalid requests list every problem', () => {
  try {
    resolveParams({ prior: 'laplace', scale: 0, sizes: [2, 2], upTo: 40, bogus: 1 });
    assert.fail('expected an error');
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    assert.deepEqual(error.issues.map((i) => i.path).sort(), ['params.bogus', 'params.prior', 'params.scale', 'params.sizes', 'params.upTo']);
  }
  assert.throws(() => resolveParams({ sizes: [2] }), /2 to 6 group sizes/);
  assert.throws(() => resolveParams({ sizes: [2, 1.5] }), /sizes\[1\]/);
});

test('backpack: the noncentral t density matches R\'s integral over the t statistic\'s mixture', () => {
  for (const c of ref.density) {
    const ours = Math.exp(logAbsT(c.nu, c.t, c.d));
    assert.ok(Math.abs(ours / c.direct - 1) < 1e-5, `ν = ${c.nu}, t = ${c.t}, δ = ${c.d}: ${ours} vs ${c.direct}`);
  }
});

test('backpack: quartiles of |Δ| and the chance of a larger effect match R\'s integrate()', () => {
  for (const c of ref.posteriors) {
    const r = compute({ ...c.params, window: 0, upTo: 1 });
    c.studies.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
      const ours = r.at.studies[i];
      assert.ok(Math.abs(ours.t / s.t - 1) < 1e-12);
      for (const q of ['q25', 'q50', 'q75']) assert.ok(Math.abs(ours.quantiles[q] / s[q] - 1) < 1e-5, `${JSON.stringify(c.params)} n = ${s.n} ${q}`);
    });
    for (const p of c.pairs) {
      const ours = r.at.pairs.find((/** @type {any} */ q) => q.smaller === p.smaller && q.larger === p.larger);
      assert.ok(Math.abs(ours.matched - p.matched) < 1e-5, `${p.smaller} vs ${p.larger}`);
    }
  }
});

test('backpack: the script\'s window averages, ten million draws, agree within Monte Carlo error', () => {
  const sim = ref.simulation;
  const r = compute({ upTo: 10, window: sim.window });
  let checked = 0;
  for (const pair of r.pairs) {
    const mc = sim.pairs.find((/** @type {any} */ p) => p.name === `${pair.smaller} vs. ${pair.larger}`);
    sim.windows.forEach((/** @type {number} */ w, /** @type {number} */ k) => {
      const count = mc.count[k];
      if (count < 100) return;
      const exact = pair.windowed[Math.round(w / STEP)];
      const se = Math.sqrt(Math.max(exact * (1 - exact), 1 / count) / count);
      assert.ok(Math.abs(mc.prop[k] - exact) < 4 * se, `${mc.name} at ${w}: ${mc.prop[k]} vs ${exact} (${count} pairs)`);
      checked++;
    });
  }
  assert.ok(checked > 100);
});
