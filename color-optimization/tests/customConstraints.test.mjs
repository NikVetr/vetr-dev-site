import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureCustomConstraintsForSpace,
  resetCustomConstraintsForSpace,
} from "../ui/customConstraints.js";

test("custom constraints are cleared rather than converted across colorspaces", () => {
  const state = {
    customConstraints: {
      space: "oklch",
      values: [{ l: 0.65, c: 0.15, h: 40 }],
      widths: { l: [0.8], c: [0.7], h: [0.6] },
    },
  };

  resetCustomConstraintsForSpace(state, "lab");

  assert.deepEqual(state.customConstraints, { space: "lab", values: [], widths: {} });
});

test("ensuring custom constraint state discards stale-space geometry", () => {
  const state = {
    customConstraints: {
      space: "lab",
      values: [{ l: 70, a: 20, b: 10 }],
      widths: { l: [0.7], a: [0.7], b: [0.7] },
    },
  };

  const custom = ensureCustomConstraintsForSpace(state, "oklab");

  assert.equal(custom, state.customConstraints);
  assert.deepEqual(custom, { space: "oklab", values: [], widths: {} });
});
