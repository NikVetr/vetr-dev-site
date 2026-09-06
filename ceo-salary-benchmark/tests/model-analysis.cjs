const test = require("node:test");
const assert = require("node:assert/strict");
const math = require("../model-analysis.js");

test("normal percentiles match known values and symmetry", () => {
  assert.ok(Math.abs(math.normalQuantile(.975) - 1.95996398454) < 1e-7);
  assert.equal(math.normalQuantile(.5), 0);
  assert.ok(Math.abs(math.normalQuantile(.001) + math.normalQuantile(.999)) < 1e-10);
});

test("natural cubic basis is linear outside its boundary knots and smooth at knots", () => {
  const definition = { knots: [-2, -.5, .5, 2], adjustment: [[0, 0, 1], [0, 0, 1]] };
  for (const center of [-4, 4]) {
    const before = math.curvature(center - .1, definition);
    const at = math.curvature(center, definition);
    const after = math.curvature(center + .1, definition);
    assert.ok(at.every((value, j) => Math.abs(after[j] - 2 * value + before[j]) < 1e-12));
  }
  for (const knot of definition.knots) {
    const h = 1e-5;
    const left = math.curvature(knot - h, definition);
    const at = math.curvature(knot, definition);
    const right = math.curvature(knot + h, definition);
    assert.ok(at.every((value, j) => Math.abs((right[j] - value) / h - (value - left[j]) / h) < 1e-3));
  }
});

test("exact Shapley allocations sum to the complete profile contrast", () => {
  const kernel = { trainingX: [[0, 0, 0, 0], [1, -1, 0, 0]], weights: [1, -.4], intercept: 12, gamma: .4 };
  const x = [1, 2, 0, 0];
  const contributions = math.kernelContributions(kernel, x, "svr", [kernel]);
  const contrast = math.kernelPrediction(kernel, x, "svr").mean - math.kernelPrediction(kernel, [0, 0, 0, 0], "svr").mean;
  assert.ok(Math.abs(contributions.reduce((sum, item) => sum + item.value, 0) - contrast) < 1e-12);
  assert.ok(contributions.every((item) => Math.abs(item.value - item.draws[0]) < 1e-12));
});

test("GP variance uses a triangular solve and retains latent uncertainty", () => {
  const kernel = { trainingX: [[0, 0]], alpha: [.5], cholesky: [[Math.sqrt(2.25)]],
    priorMean: 12.5, priorInterceptVariance: 1, lengthScale: 1, amplitude: 1, noise: .5 };
  const prediction = math.kernelPrediction(kernel, [0, 0], "gp");
  assert.equal(prediction.mean, 13.5);
  assert.ok(Math.abs(prediction.variance - (2 - 4 / 2.25)) < 1e-12);
  assert.ok(math.kernelPrediction(kernel, [5, 0], "gp").variance > prediction.variance);
});
