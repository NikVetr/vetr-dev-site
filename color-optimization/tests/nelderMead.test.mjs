import test from "node:test";
import assert from "node:assert/strict";
import { nelderMead, nelderMeadAsync } from "../optimizer/nelderMead.js";

for (const solve of [nelderMead, nelderMeadAsync]) {
  test(`${solve.name}: return final accepted improvement`, async () => {
    const result = await solve(([x]) => (x - 2) ** 2, [0], { step: 1, maxIterations: 1 });
    assert.deepEqual(result.x, [2]);
    assert.equal(result.fx, 0);
  });
  test(`${solve.name}: reject outside contraction worse than reflection`, async () => {
    const points = [];
    const values = new Map([[0, 0], [1, 10], [-1, 5], [-0.5, 7], [0.5, -1]]);
    const result = await solve(([x]) => { points.push(x); return values.get(x); }, [0], { step: 1, maxIterations: 1 });
    assert.deepEqual(points, [0, 1, -1, -0.5, 0.5]);
    assert.deepEqual(result.x, [0.5]);
  });
  test(`${solve.name}: equal losses at distant vertices do not imply convergence`, async () => {
    const result = await solve(([x]) => (x - 0.5) ** 2, [0], { maxIterations: 80 });
    assert.ok(Math.abs(result.x[0] - 0.5) < 1e-5);
    assert.ok(result.fx < 1e-10);
  });
}

test("async cancellation returns the current best simplex vertex", async () => {
  let cancelled = false;
  const result = await nelderMeadAsync(([x]) => (x - 2) ** 2, [0], {
    maxIterations: 10, yieldEvery: 1,
    yieldFn: async () => { cancelled = true; }, shouldStop: () => cancelled,
  });
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.x, [2]);
  assert.equal(result.fx, 0);
});

test("optimizer checkpoints do not depend on animation frames in a hidden tab", async () => {
  const previous = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => { throw new Error("Animation frames are suspended"); };
  try {
    const result = await nelderMeadAsync(([x]) => (x - 2) ** 2, [0], { maxIterations: 3, yieldEvery: 1 });
    assert.equal(result.fx, 0);
  } finally {
    if (previous) globalThis.requestAnimationFrame = previous;
    else delete globalThis.requestAnimationFrame;
  }
});
