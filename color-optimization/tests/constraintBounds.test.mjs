import test from "node:test";
import { strict as assert } from "node:assert";

import {
  setHueBoundEdge,
  setLinearBoundEdge,
  widthFromBounds,
} from "../core/constraintBounds.js";

function approxEqual(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-12, msg || `${actual} != ${expected}`);
}

function approxBounds(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, idx) => approxEqual(v, expected[idx]));
}

test("linear explicit bound edges follow pointer targets", () => {
  assert.deepEqual(setLinearBoundEdge([0.2, 0.8], "min", 0.35), [0.35, 0.8]);
  assert.deepEqual(setLinearBoundEdge([0.2, 0.8], "max", 0.65), [0.2, 0.65]);
  approxEqual(widthFromBounds([0.35, 0.8], "c"), 0.55);
});

test("hue explicit bound edges follow wrapped pointer targets", () => {
  const minMoved = setHueBoundEdge([0.9, 1.1], "min", 0.95);
  approxBounds(minMoved, [0.95, 1.1]);
  approxEqual(widthFromBounds(minMoved, "h"), 0.85);

  const maxMoved = setHueBoundEdge([0.9, 1.1], "max", 0.05);
  approxBounds(maxMoved, [0.9, 1.05]);
  approxEqual(widthFromBounds(maxMoved, "h"), 0.85);
});
