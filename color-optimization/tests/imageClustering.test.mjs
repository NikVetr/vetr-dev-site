import test from "node:test";
import assert from "node:assert/strict";
import { adaptiveClusterCount, refineCandidates } from "../ui/imageInput.js";

const candidate = (l, count) => ({ count, lab: { l, a: 0, b: 0 }, r: l * 255, g: l * 255, b: l * 255, x: 0.5, y: 0.5 });
test("auto clustering retains a rare distinct color after common near-duplicates", () => {
  const candidates = [candidate(0.4, 10000), candidate(0.47, 10000), candidate(0.6, 1)];
  const result = adaptiveClusterCount(candidates);
  assert.equal(result.count, 2);
  assert.deepEqual(result.selected, [candidates[0], candidates[2]]);
  assert.equal(refineCandidates(candidates, result.selected, 3)[1].lab.l, 0.6);
});
test("image centroids minimize the same weighted OKLab distance used for assignment", () => {
  const candidates = [candidate(0.2, 1), candidate(0.8, 3)];
  const [center] = refineCandidates(candidates, [candidates[0]], 1);
  assert.ok(Math.abs(center.lab.l - 0.65) < 1e-12);
  assert.equal(center.lab.a, 0);
  assert.equal(center.lab.b, 0);
  assert.equal(center.count, 4);
});
