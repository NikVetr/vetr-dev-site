// Priors on transformed parameters: the closed forms against a direct numerical
// marginalisation of each model's target, the mass levels against draws, and the scripts'
// Stan models (tests/fixtures/r-jacobian.json, see its "source") within Monte Carlo error.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dnorm, standardNormal } from '../lib/normal.js';
import { IntuitionsError } from '../lib/params.js';
import { mulberry32 } from '../../shared/rng.js';
import { compute as computeJacobian, density, isProper, jointLogDensity, massLevels, moments, quantile, resolveParams, TRANSFORMS } from '../jacobian-adjustment/compute.js';

/** @param {unknown} params @returns {any} */
const compute = (params) => computeJacobian(params);
const ref = JSON.parse(readFileSync(new URL('fixtures/r-jacobian.json', import.meta.url), 'utf8'));
const logChi2 = (/** @type {number} */ y, /** @type {number} */ k) => (k / 2 - 1) * Math.log(y) - y / 2 - (k / 2) * Math.LN2 - lgammaHalf(k);
/** log Γ(k/2) for integer k. @param {number} k */
function lgammaHalf(k) {
  let v = k % 2 ? 0.5 * Math.log(Math.PI) : 0;
  for (let x = k % 2 ? 0.5 : 1; x < k / 2 - 1e-9; x += 1) v += Math.log(x);
  return v;
}
const logLn = (/** @type {number} */ x, /** @type {number} */ sd) => Math.log(dnorm(Math.log(x), 0, sd)) - Math.log(x);

/**
 * The target over the raw parameters as each script's model block writes it, with the
 * Jacobian term or without: written out here independently of compute.js.
 * @param {string} transform @param {boolean} jacobian @param {number} [k]
 */
function target(transform, jacobian, k = 1) {
  const ln = Math.log;
  if (transform === 'sum') return (/** @type {number} */ a, /** @type {number} */ b) => ln(dnorm(a)) + ln(dnorm(a + b, 0, Math.SQRT2));
  if (transform === 'sum-difference') return (/** @type {number} */ a, /** @type {number} */ b) => ln(dnorm(a + b)) + ln(dnorm(a - b)) + (jacobian ? ln(2) : 0);
  if (transform === 'product-lognormal') return (/** @type {number} */ a, /** @type {number} */ b) => logLn(a, 1) + logLn(a * b, Math.SQRT2) + (jacobian ? ln(a) : 0);
  if (transform === 'product-normal') return (/** @type {number} */ a, /** @type {number} */ b) => ln(dnorm(a)) + ln(dnorm(a * b)) + (jacobian ? ln(Math.abs(a)) : 0);
  return (/** @type {number} */ a) => logChi2(a * a, k) + (jacobian ? ln(2 * a) : 0);
}

/**
 * Moments of the plotted coordinates by the midpoint rule over a box: E[x], E[x²], E[y],
 * E[y²], E[xy], with x, y = log a, log b for the log-normal product (the density then
 * carries the factor ab).
 * @param {(a: number, b: number) => number} logp @param {[number, number]} xs @param {[number, number]} ys @param {boolean} log @param {number} n
 */
function gridMoments(logp, xs, ys, log, n = 1200) {
  const hx = (xs[1] - xs[0]) / n;
  const hy = (ys[1] - ys[0]) / n;
  let z = 0; let mx = 0; let my = 0; let mxx = 0; let myy = 0; let mxy = 0;
  for (let i = 0; i < n; i++) {
    const u = xs[0] + (i + 0.5) * hx;
    for (let j = 0; j < n; j++) {
      const v = ys[0] + (j + 0.5) * hy;
      const w = log ? Math.exp(logp(Math.exp(u), Math.exp(v)) + u + v) : Math.exp(logp(u, v));
      z += w; mx += w * u; my += w * v; mxx += w * u * u; myy += w * v * v; mxy += w * u * v;
    }
  }
  return { x: mx / z, y: my / z, xx: mxx / z, yy: myy / z, xy: mxy / z };
}

test('jacobian: each closed-form marginal matches the model block, marginalised numerically', () => {
  for (const transform of ['sum', 'sum-difference', 'product-lognormal']) {
    for (const jacobian of [true, false]) {
      const r = compute({ transform, jacobian });
      const [a, b] = r.quantities;
      const log = transform === 'product-lognormal';
      const g = gridMoments(target(transform, jacobian), log ? [-9, 7] : [-8, 8], log ? [-11, 13] : [-11, 11], log);
      const ma = /** @type {any} */ (moments(a.implied));
      const mb = /** @type {any} */ (moments(b.implied));
      const cov = r.joint.covariance[0][1] + r.joint.mean[0] * r.joint.mean[1];
      for (const [got, want, what] of [[g.x, ma.mean, 'E a'], [g.xx, ma.sd ** 2 + ma.mean ** 2, 'E a²'], [g.y, mb.mean, 'E b'], [g.yy, mb.sd ** 2 + mb.mean ** 2, 'E b²'], [g.xy, cov, 'E ab']]) {
        assert.ok(Math.abs(got - want) < 2e-4, `${transform}, Jacobian ${jacobian}: ${what} ${got} vs ${want}`);
      }
    }
  }
});

test('jacobian: the square makes a a χ(k) with the term and a χ(k − 1) without it', () => {
  for (const k of [2, 3, 5]) {
    for (const jacobian of [true, false]) {
      const r = compute({ transform: 'square', jacobian, df: k });
      const logp = target('square', jacobian, k);
      const n = 200000;
      const h = 12 / n;
      let z = 0; let m1 = 0; let m2 = 0;
      for (let i = 0; i < n; i++) {
        const a = (i + 0.5) * h;
        const w = Math.exp(logp(a, 0));
        z += w; m1 += w * a; m2 += w * a * a;
      }
      const m = /** @type {any} */ (moments(r.quantities[0].implied));
      assert.equal(r.quantities[0].implied.df, jacobian ? k : k - 1);
      assert.ok(Math.abs(m1 / z - m.mean) < 1e-6 && Math.abs(m2 / z - (m.sd ** 2 + m.mean ** 2)) < 1e-6, `k = ${k}, Jacobian ${jacobian}`);
    }
  }
  assert.equal(compute({ transform: 'square', jacobian: false, df: 1 }).proper, false);
  assert.equal(compute({ transform: 'square', jacobian: false, df: 1 }).quantities[0].implied, null);
});

test('jacobian: the normal product has a Cauchy b with the term and infinite mass without it', () => {
  const r = compute({ transform: 'product-normal', jacobian: true });
  assert.deepEqual(r.quantities[1].implied, { family: 'cauchy', location: 0, scale: 1 });
  // P(|b| < 1) from the model block: ∫ φ(a) ∫_{|b|<1} φ(ab)|a| db da = ∫ φ(a) (2Φ(|a|) − 1) da = 1/2.
  const logp = target('product-normal', true);
  let inside = 0;
  const n = 1500;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) inside += Math.exp(logp(-8 + (16 * (i + 0.5)) / n, -1 + (2 * (j + 0.5)) / n));
  assert.ok(Math.abs(inside * (16 / n) * (2 / n) - 0.5) < 1e-5);
  // Without |a|, the mass of |a| < ε, |b| < B grows like log B without bound.
  const off = target('product-normal', false);
  const mass = (/** @type {number} */ B) => {
    let s = 0;
    const m = 4000;
    for (let i = 0; i < m; i++) { const a = -0.5 + (i + 0.5) / m; for (let j = 0; j < 400; j++) s += Math.exp(off(a, -B + (2 * B * (j + 0.5)) / 400)); }
    return s * (1 / m) * ((2 * B) / 400);
  };
  assert.ok(mass(1000) - mass(100) > 0.3 && mass(10000) - mass(1000) > 0.3);
  assert.equal(isProper(/** @type {any} */ (resolveParams({ transform: 'product-normal', jacobian: false }))), false);
});

test('jacobian: the contours hold 50% and 90% of the mass', () => {
  const rng = mulberry32(3);
  for (const transform of TRANSFORMS) {
    if (transform === 'square') continue;
    for (const jacobian of [true, false]) {
      const p = /** @type {any} */ (resolveParams({ transform, jacobian }));
      const levels = massLevels(p, [0.5, 0.9]);
      if (!isProper(p)) { assert.equal(levels, null); continue; }
      const logp = /** @type {(q: [number, number]) => number} */ (jointLogDensity(p));
      const r = compute(p);
      const n = 40000;
      const above = [0, 0];
      for (let i = 0; i < n; i++) {
        let point;
        if (r.joint.kind === 'normal') {
          const [[s11, s12], [, s22]] = r.joint.covariance;
          const z1 = standardNormal(rng);
          const z2 = standardNormal(rng);
          const l11 = Math.sqrt(s11);
          const l21 = s12 / l11;
          point = /** @type {[number, number]} */ ([r.joint.mean[0] + l11 * z1, r.joint.mean[1] + l21 * z1 + Math.sqrt(s22 - l21 * l21) * z2]);
        } else {
          const a = standardNormal(rng);
          point = /** @type {[number, number]} */ ([a, standardNormal(rng) / a]);
        }
        const v = logp(point);
        levels?.forEach((l, k) => { if (v > l) above[k]++; });
      }
      assert.ok(Math.abs(above[0] / n - 0.5) < 0.01 && Math.abs(above[1] / n - 0.9) < 0.006, `${transform} ${jacobian}: ${above.map((v) => v / n)}`);
    }
  }
});

test('jacobian: densities integrate to 1 and quantiles invert them', () => {
  for (const d of /** @type {any[]} */ ([{ family: 'normal', mean: -1, sd: 1.7 }, { family: 'chi', df: 1 }, { family: 'chi', df: 4 }, { family: 'chi-squared', df: 3 }, { family: 'cauchy', location: 0, scale: 1 }])) {
    for (const q of [0.05, 0.5, 0.9]) {
      const x = quantile(d, q);
      const lo = d.family === 'normal' ? x - 15 * d.sd : d.family === 'cauchy' ? x - 2000 : 0;
      const n = d.family === 'cauchy' ? 400000 : 20000;
      let s = 0;
      for (let i = 0; i < n; i++) s += density(d, lo + ((x - lo) * (i + 0.5)) / n);
      const tail = d.family === 'cauchy' ? 1 / (Math.PI * 2000) : 0;
      assert.ok(Math.abs(s * ((x - lo) / n) + tail - q) < 2e-6, `${d.family} ${q}`);
    }
  }
});

/** The moments a closed form predicts for one Stan model's draws. @param {any} r compute()'s result */
function predicted(r) {
  /** @type {Record<string, { mean: number, sd: number }>} */
  const m = {};
  for (const q of r.quantities) if (q.implied && q.implied.family !== 'cauchy') m[q.quantity] = /** @type {any} */ (moments(q.implied));
  return m;
}

test("jacobian: the scripts' Stan models agree with the closed forms within Monte Carlo error", () => {
  const cases = [
    ['sum', { transform: 'sum', jacobian: true }], ['sum_difference', { transform: 'sum-difference', jacobian: true }],
    ['square', { transform: 'square', jacobian: true, df: 1 }], ['square_df3', { transform: 'square', jacobian: true, df: 3 }],
    ['square_df3_nojac', { transform: 'square', jacobian: false, df: 3 }],
    ['product_lognormal', { transform: 'product-lognormal', jacobian: true }], ['product_lognormal_nojac', { transform: 'product-lognormal', jacobian: false }],
    ['product_normal', { transform: 'product-normal', jacobian: true }],
  ];
  let worst = 0;
  for (const [name, params] of /** @type {[string, any][]} */ (cases)) {
    const stan = ref[name];
    const r = compute(params);
    const m = predicted(r);
    for (const [v, s] of Object.entries(m)) {
      const got = stan.vars[v];
      const z1 = Math.abs(got.mean.value - s.mean) / got.mean.mcse;
      const z2 = Math.abs(got.second.value - (s.sd ** 2 + s.mean ** 2)) / got.second.mcse;
      worst = Math.max(worst, z1, z2);
      assert.ok(z1 < 4 && z2 < 4, `${name} ${v}: mean ${got.mean.value} vs ${s.mean}, E² ${got.second.value} vs ${s.sd ** 2 + s.mean ** 2}`);
      for (const q of got.quantiles) {
        const want = quantile(r.quantities.find((/** @type {any} */ x) => x.quantity === v).implied, q.p);
        assert.ok(Math.abs(q.value - want) < 4 * q.mcse + 1e-3, `${name} ${v} q${q.p}: ${q.value} vs ${want}`);
      }
    }
    if (r.joint?.kind === 'normal') {
      const want = r.joint.covariance[0][1] + r.joint.mean[0] * r.joint.mean[1];
      const got = stan.products['a b'];
      assert.ok(Math.abs(got.value - want) < 4 * got.mcse, `${name} E[ab]: ${got.value} vs ${want}`);
    }
  }
  // b of the normal product, a Cauchy: its quartiles are ±1.
  const b = ref.product_normal.vars.b.quantiles;
  for (const q of b) assert.ok(Math.abs(q.value - Math.tan(Math.PI * (q.p - 0.5))) < 4 * q.mcse, `Cauchy q${q.p}`);
  assert.ok(worst < 4);
});

test('jacobian: Stan cannot sample the targets that are not distributions', () => {
  // χ²(1) without 2a: most transitions diverge and the draws pile up at 0.
  assert.ok(ref.square_nojac.divergences > 0.8 * ref.square_nojac.draws);
  assert.ok(ref.square_nojac.vars.a.quantiles[2].value < 1e-3);
  // The normal product without |a|: b runs off to the hundreds while a sits at 0.
  assert.ok(Math.abs(ref.product_normal_nojac.vars.b.quantiles[2].value) > 50);
  assert.ok(ref.product_normal_nojac.vars.a.second.value < 0.2);
});

test('jacobian marginals: two statements make a and c independent; one joint statement gives what was meant', () => {
  const sep = compute({ view: 'marginals', statement: 'separate' });
  const joint = compute({ view: 'marginals', statement: 'joint' });
  assert.deepEqual(sep.stated.covariance, [[1, -1, 0], [-1, 3, 2], [0, 2, 2]]);
  assert.deepEqual(joint.stated.covariance, joint.meant.covariance);
  assert.deepEqual([sep.conditional.slope, sep.conditional.sd ** 2], [-1, 2.0000000000000004]);
  assert.deepEqual([joint.conditional.slope, joint.conditional.sd], [0, 1]);
  // The same seed gives the same a, and the b's move with the statement.
  assert.deepEqual(sep.data.a, joint.data.a);
  assert.notDeepEqual(sep.data.b, joint.data.b);
  // The Stan models: separate (the sum model) and joint (the MVN model) moments.
  for (const [name, cov] of /** @type {[string, number[][]][]} */ ([['sum', sep.stated.covariance], ['mvn', joint.stated.covariance]])) {
    const s = ref[name];
    for (const [k, v] of ['a', 'b', 'c'].entries()) assert.ok(Math.abs(s.vars[v].second.value - cov[k][k]) < 4 * s.vars[v].second.mcse, `${name} ${v}`);
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      const got = s.products[`${'abc'[i]} ${'abc'[j]}`];
      assert.ok(Math.abs(got.value - cov[i][j]) < 4 * got.mcse, `${name} ${'abc'[i]}${'abc'[j]}`);
    }
  }
  // With a as data: b's posterior means are −a (separate) or 0 (joint, and non-centred), with variance 2 or 1.
  for (const [name, slope, variance] of /** @type {[string, number, number][]} */ ([['fixed_separate', -1, 2], ['fixed_mvn', 0, 1], ['fixed_noncentred', 0, 1]])) {
    const f = ref[name];
    const z = f.mean.map((/** @type {number} */ m, /** @type {number} */ i) => Math.abs(m - slope * f.a[i]) / f.mcse[i]);
    assert.ok(Math.max(...z) < 4.5, `${name}: worst ${Math.max(...z)}`);
    const v = f.var.reduce((/** @type {number} */ s, /** @type {number} */ x) => s + x, 0) / f.var.length;
    assert.ok(Math.abs(v - variance) < 0.03 * variance, `${name}: variance ${v}`);
  }
});

test('jacobian: requests are checked in full', () => {
  /** @param {unknown} params */
  const issues = (params) => {
    try { resolveParams(params); } catch (error) { assert.ok(error instanceof IntuitionsError); return error.issues.map((i) => `${i.code} ${i.path}`); }
    return [];
  };
  assert.deepEqual(issues({ transform: 'sum', df: 3, jacobian: 'yes' }), ['wrong_type params.jacobian', 'not_applicable params.df']);
  assert.deepEqual(issues({ transform: 'square', df: 0 }), ['out_of_range params.df']);
  assert.deepEqual(issues({ view: 'marginals', sdB: 9, n: 0, transform: 'sum' }), ['unknown_field params.transform', 'out_of_range params.sdB', 'out_of_range params.n']);
  assert.deepEqual(issues({ view: 'shape' }), ['out_of_range params.view']);
  assert.deepEqual(resolveParams({}), { view: 'transform', transform: 'product-lognormal', jacobian: false });
  assert.deepEqual(resolveParams({ transform: 'square' }), { view: 'transform', transform: 'square', jacobian: false, df: 1 });
});
