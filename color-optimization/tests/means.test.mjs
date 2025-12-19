import test from "node:test";
import { strict as assert } from "node:assert";

import { aggregateDistances } from "../core/means.js";

function close(actual, expected, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `Expected ${actual} ≈ ${expected}`);
}

test("aggregateDistances matches common means", () => {
  const vals = [1, 2, 4];
  close(aggregateDistances(vals, "minimum"), 1);
  close(aggregateDistances(vals, "arithmetic"), (1 + 2 + 4) / 3);
  close(aggregateDistances(vals, "geometric"), 2);
  close(aggregateDistances(vals, "harmonic"), 3 / (1 + 1 / 2 + 1 / 4));
  close(aggregateDistances(vals, "quadratic"), Math.sqrt((1 * 1 + 2 * 2 + 4 * 4) / 3));
  close(aggregateDistances(vals, "power", 0), 2); // p=0 -> geometric
  close(aggregateDistances(vals, "power", -1), 3 / (1 + 1 / 2 + 1 / 4)); // p=-1 -> harmonic
  close(aggregateDistances(vals, "lehmer", 0), (1 + 2 + 4) / 3); // p=0 -> arithmetic
  close(aggregateDistances(vals, "lehmer", 1), (1 + 4 + 16) / (1 + 2 + 4)); // p=1 -> contraharmonic
});

