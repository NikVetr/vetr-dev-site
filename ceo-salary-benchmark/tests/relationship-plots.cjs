const test = require("node:test");
const assert = require("node:assert/strict");
const { correlations, subsample } = require("../relationship-plots.js");
const math = require("../model-analysis.js");

test("correlations use complete positive-weight pairs and weighted midranks for ties", () => {
  const points = [{ x: 1, y: 1, weight: 2 }, { x: 1, y: 3, weight: 1 }, { x: 3, y: 2, weight: 1 }];
  const expanded = [{ x: 1, y: 1, weight: 1 }, ...points.map((p) => ({ ...p, weight: 1 }))];
  assert.ok(Math.abs(correlations(points).spearman - correlations(expanded).spearman) < 1e-12);
  assert.ok(Math.abs(correlations(points).pearson - correlations(expanded).pearson) < 1e-12);
  const result = correlations([...points, { x: null, y: 2, weight: 1 }, { x: 100, y: -100, weight: 0 }]);
  assert.equal(result.n, 3);
  assert.equal(result.effectiveN, 16 / 6);
  assert.equal(result.pearson, correlations(points).pearson);
  assert.ok(Number.isNaN(correlations([{ x: 1, y: 2, weight: 1 }, { x: 1, y: 3, weight: 1 }]).pearson));
  assert.ok(Number.isNaN(correlations([]).spearman));
});

test("subsampling preserves complete joint rows across the draw sequence", () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: -i, weight: 1 }));
  const sampled = subsample(rows);
  assert.equal(sampled.length, 250);
  assert.ok(sampled.every((row) => row.y === -row.x && rows.includes(row)));
  assert.equal(correlations(sampled).pearson, -1);
  assert.deepEqual(subsample(rows), sampled);
});

test("GP joint Shapley covariance sums to the variance of the full contrast", () => {
  const kernel = { trainingX: [[0, 0, 0, 0]], alpha: [.5], cholesky: [[1.5]],
    priorMean: 12.5, priorInterceptVariance: 1, lengthScale: 1, amplitude: 1, noise: .5 };
  const x = [1, 2, 0, 0];
  const terms = math.kernelContributions(kernel, x, "gp");
  const at = math.kernelPrediction(kernel, x, "gp");
  const baseline = math.kernelPrediction(kernel, x.map(() => 0), "gp");
  const cross = 1 + Math.exp(-2.5) - math.dot(at.projected, baseline.projected);
  const expected = at.variance + baseline.variance - 2 * cross;
  assert.ok(Math.abs(terms.flatMap((term) => term.covariance).reduce((a, b) => a + b, 0) - expected) < 1e-12);
  terms.forEach((term, j) => assert.ok(Math.abs(term.normal.sd ** 2 - term.covariance[j]) < 1e-12));
  assert.equal(terms[0].covariance[1], terms[1].covariance[0]);
});

test("joint Gaussian simulation preserves covariance and deterministic zero effects", () => {
  const draws = math.jointNormalDraws([1, 2, 0], [[1, -.7, 0], [-.7, 1, 0], [0, 0, 0]], 20000);
  assert.ok(draws.every((row) => row[2] === 0));
  const r = correlations(draws.map(([x, y]) => ({ x, y, weight: 1 }))).pearson;
  assert.ok(Math.abs(r + .7) < .015);
  assert.deepEqual(math.jointNormalDraws([0], [[0]], 2), [[0], [0]]);
  assert.throws(() => math.jointNormalDraws([0, 0], [[1, 2], [2, 1]]), /positive semidefinite/);
});
