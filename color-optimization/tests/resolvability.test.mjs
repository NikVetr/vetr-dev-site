import test from "node:test";
import { strict as assert } from "node:assert";

import {
  computeDistanceMatrix,
  computeNearestNeighbors,
  discriminabilityLabel,
  metricJnd,
} from "../core/resolvability.js";

test("computeDistanceMatrix is symmetric with zero diagonal", () => {
  const coords = [
    { l: 50, a: 0, b: 0 },
    { l: 60, a: 10, b: -5 },
    { l: 70, a: -5, b: 20 },
  ];
  const n = coords.length;
  const d = computeDistanceMatrix(coords, "de2000");
  assert.equal(d.length, n * n);
  for (let i = 0; i < n; i++) {
    assert.equal(d[i * n + i], 0);
    for (let j = i + 1; j < n; j++) {
      assert.equal(d[i * n + j], d[j * n + i]);
      assert.ok(d[i * n + j] >= 0);
    }
  }
});

test("computeNearestNeighbors returns nearest index and distance", () => {
  const n = 3;
  const distances = new Float32Array([
    0, 1, 3,
    1, 0, 2,
    3, 2, 0,
  ]);
  const { minDist, nearest } = computeNearestNeighbors(distances, n);
  assert.equal(nearest[0], 1);
  assert.equal(nearest[1], 0);
  assert.equal(nearest[2], 1);
  assert.equal(minDist[0], 1);
  assert.equal(minDist[1], 1);
  assert.equal(minDist[2], 2);
});

test("discriminabilityLabel respects boundaries", () => {
  assert.equal(metricJnd("de2000"), 1);
  assert.equal(discriminabilityLabel(0.5, "de2000"), "awful");
  assert.equal(discriminabilityLabel(1, "de2000"), "poor");
  assert.equal(discriminabilityLabel(2, "de2000"), "fair");
  assert.equal(discriminabilityLabel(5, "de2000"), "good");
  assert.equal(discriminabilityLabel(10, "de2000"), "great");
});
