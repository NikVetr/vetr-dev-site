import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import { bbp, compute as computeMp, covarianceEigenvalues, mpDensity, mpDistribution, mpLaw, principalComponents } from '../marchenko-pastur/compute.js';

/** Results are a union over views; tests read them untyped. @param {unknown} params @returns {any} */
const mp = (params) => computeMp(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
/** @param {unknown} params */
function issues(params) {
  try {
    mp(params);
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    return error.issues.map((i) => `${i.code} ${i.path}`);
  }
  return assert.fail('accepted');
}

test('the law: edges, a density that integrates to its continuous share, and its distribution function', () => {
  for (const [n, p, v] of [[201, 20, 1], [101, 100, 1], [51, 100, 2.5], [1000, 900, 0.4]]) {
    const law = mpLaw(n, p, v);
    close(law.gamma, p / (n - 1), 0);
    close(law.upper, v * (1 + Math.sqrt(law.gamma)) ** 2, 1e-15);
    // Midpoint rule in x = c − h cos ϑ.
    const c = (law.lower + law.upper) / 2;
    const h = (law.upper - law.lower) / 2;
    let mass = 0;
    let mean = 0;
    for (let i = 0; i < 20000; i++) {
      const t = (Math.PI * (i + 0.5)) / 20000;
      const x = c - h * Math.cos(t);
      const w = mpDensity(x, law.gamma, v) * h * Math.sin(t) * (Math.PI / 20000);
      mass += w;
      mean += w * x;
    }
    close(mass, 1 - law.zeroShare, 1e-6);
    close(mean, v, 1e-5); // the eigenvalues average to the variance (zeros included)
    const dist = mpDistribution(law.gamma, v);
    close(dist.cdf(law.lower), law.zeroShare, 1e-15);
    close(dist.cdf(law.upper), 1, 1e-15);
    for (const q of [0.6, 0.75, 0.9]) close(dist.cdf(dist.quantile(q)), q, 1e-9);
  }
});

test('BBP: a spike separates beyond √γ, continuously, and its eigenvector aligns', () => {
  const gamma = 0.25;
  assert.equal(bbp(0.4, gamma).detectable, false);
  close(bbp(0.4, gamma).eigenvalue, 2.25, 1e-15);
  close(bbp(0.5 + 1e-9, gamma).eigenvalue, 2.25, 1e-8); // meets the edge at the threshold
  close(bbp(3, gamma).eigenvalue, 4 * (1 + 0.25 / 3), 1e-15);
  close(bbp(0.5 + 1e-9, gamma).overlap, 0, 1e-8);
  assert.ok(bbp(100, gamma).overlap > 0.99);
});

test('sample eigenvalues: centred, through the smaller Gram matrix, with structural zeros', () => {
  const X = [[1, 2, 0], [3, 1, 1], [0, 0, 4], [2, 5, 1]].map((r) => Float64Array.from(r));
  const values = covarianceEigenvalues(X.map((r) => Float64Array.from(r)));
  const trace = [0, 1, 2].reduce((s, j) => { const col = X.map((r) => r[j]); const m = col.reduce((a, b) => a + b) / 4; return s + col.reduce((a, b) => a + (b - m) ** 2, 0) / 3; }, 0);
  close(values.reduce((a, b) => a + b, 0), trace, 1e-12);
  const wide = covarianceEigenvalues([[1, 2, 3, 4], [0, 1, 0, 2], [5, 1, 1, 0]].map((r) => Float64Array.from(r)));
  assert.deepEqual([...wide.slice(2)], [0, 0]); // rank n − 1 = 2
  const pc = principalComponents([[1, 0], [0, 1], [2, 2], [3, 1]].map((r) => Float64Array.from(r)), 2);
  pc.scores.forEach((s) => close(s.reduce((a, b) => a + b * b, 0) / 3, 1, 1e-12)); // unit variance
});

test('noise: the pooled histogram follows the law and each index has its own place in it', () => {
  const r = mp({ view: 'noise', replicates: 200 });
  close(r.gamma, 20 / 199, 1e-15);
  const { edges, density } = r.sample.histogram;
  close(density.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) * (edges[1] - edges[0]), 1, 1e-12);
  assert.equal(r.sample.byIndex.length, 20);
  for (const b of r.sample.byIndex) assert.ok(Math.abs(b.mean - b.law) < 0.05, `index ${b.index}`);
  assert.ok(r.sample.largest.aboveEdge > 0.05 && r.sample.largest.aboveEdge < 0.3);
  assert.equal(r.sample.first.length, 20);
  assert.deepEqual(r.sample, mp({ view: 'noise', replicates: 200 }).sample);
  const wide = mp({ view: 'noise', n: 30, p: 60, replicates: 20 });
  close(wide.zeroShare, 1 - 29 / 60, 1e-15);
  assert.equal(wide.sample.smallestBelowEdge, null);
  assert.equal(wide.sample.first.filter((/** @type {number} */ v) => v === 0).length, 31);
});

test('spikes: strong spikes leave the bulk where BBP says, weak ones stay at its edge', () => {
  const r = mp({ view: 'spikes', replicates: 60 });
  assert.deepEqual(r.spikes.map((/** @type {any} */ s) => s.strength), [4, 1, 0.5]);
  assert.deepEqual(r.spikes.map((/** @type {any} */ s) => s.detectable), [true, true, false]);
  assert.ok(Math.abs(r.spikes[0].sample.mean - r.spikes[0].eigenvalue) < 0.2);
  assert.ok(r.spikes[2].sample.mean < r.edges.upper);
  assert.ok(r.spikes[0].sample.overlap > 0.8 && r.spikes[2].sample.overlap < 0.15);
  const unsorted = mp({ view: 'spikes', spikes: [0.2, 6], replicates: 5 });
  assert.deepEqual(unsorted.spikes.map((/** @type {any} */ s) => s.strength), [6, 0.2]);
  // More variables than observations: overlaps through the n × n Gram matrix.
  const wide = mp({ view: 'spikes', n: 40, p: 80, spikes: [20], replicates: 30 });
  assert.ok(wide.spikes[0].sample.overlap > 0.8, `${wide.spikes[0].sample.overlap}`);
  assert.equal(mp({ view: 'spikes', spikes: [], replicates: 3 }).spikes.length, 0);
});

test('pcs: the batch is PC1 before it is regressed out, and every axis is balanced after', () => {
  const r = mp({ view: 'pcs' });
  assert.ok(Math.abs(r.uncorrected.batchDifference[0]) > 1.5);
  for (const d of r.corrected.batchDifference) assert.ok(Math.abs(d) < 1e-9);
  assert.equal(r.uncorrected.scores.pc1.length, 200);
  assert.equal(r.batch.filter((/** @type {number} */ b) => b === 1).length, 100);
  assert.ok(r.uncorrected.aboveEdge >= 50);
  // Two factors, no batch: two eigenvalues far beyond the noise edge, the rest at most a
  // little past it (the largest noise eigenvalue fluctuates around the edge).
  const plain = mp({ view: 'pcs', n: 60, p: 80, factors: 2, interactions: false, batchVariance: 0, noiseVariance: 1 });
  assert.ok(plain.uncorrected.eigenvalues[1] > 5 * plain.upper);
  assert.ok(plain.uncorrected.eigenvalues[2] < 1.15 * plain.upper);
});

test('marchenko-pastur params are checked in full', () => {
  assert.deepEqual(issues({ view: 'noise', n: 2, p: 0, extra: 1 }), ['unknown_field params.extra', 'out_of_range params.n', 'out_of_range params.p']);
  assert.deepEqual(issues({ view: 'spikes', spikes: [1, -1, 'a'] }), ['out_of_range params.spikes[1]', 'wrong_type params.spikes[2]']);
  assert.deepEqual(issues({ view: 'spikes', spikes: [1, 2, 3, 4, 5, 6] }), ['wrong_type params.spikes']);
  assert.deepEqual(issues({ view: 'pcs', interactions: 'yes' }), ['wrong_type params.interactions']);
  assert.deepEqual(issues({ view: 'noise', n: 1000, p: 500, replicates: 5000 }), ['too_much_work params.replicates']);
  assert.deepEqual(issues({ view: 'other' }), ['out_of_range params.view']);
});
