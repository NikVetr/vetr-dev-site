import test from "node:test";
import { strict as assert } from "node:assert";

import { hardConstraintRegionIndex } from "../core/hardConstraints.js";

test("hard constraint region checks can accept display-tolerance boundary drift", () => {
  const sets = {
    topology: "contiguous",
    channels: {
      a: { type: "linear", mode: "hard", intervals: [[0.2, 0.6]] },
    },
  };

  assert.equal(hardConstraintRegionIndex({ a: 0.60005 }, sets, "contiguous", 1e-4), 0);
  assert.equal(hardConstraintRegionIndex({ a: 0.601 }, sets, "contiguous", 1e-4), null);
});

test("point-window region checks can accept display-tolerance boundary drift", () => {
  const sets = {
    topology: "custom",
    channels: {
      a: {
        type: "linear",
        mode: "hard",
        pointWindows: [{ center: 0.4, radius: 0.2, min: 0.2, max: 0.6 }],
      },
    },
  };

  assert.equal(hardConstraintRegionIndex({ a: 0.60005 }, sets, "custom", 1e-4), 0);
  assert.equal(hardConstraintRegionIndex({ a: 0.601 }, sets, "custom", 1e-4), null);
});
