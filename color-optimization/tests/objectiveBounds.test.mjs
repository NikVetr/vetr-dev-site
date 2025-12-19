import test from "node:test";
import { strict as assert } from "node:assert";

import { prepareData } from "../optimizer/objective.js";

function isFull01(b) {
  return Array.isArray(b) && b.length === 2 && b[0] <= 1e-6 && b[1] >= 1 - 1e-6;
}

test("prepareData uses UI-consistent bounds for empty palettes (OKLCh hue constraints)", () => {
  const config = {
    constrain: true,
    // widths correspond to channels[0], scChannel, channels[2]
    // OKLCh: [L, C, H]
    widths: [0, 0, 0.25],
    gamutPreset: "srgb",
    clipToGamutOpt: false,
    nColsToAdd: 1,
    colorblindSafe: true,
    colorblindWeights: { none: 1, deutan: 0, protan: 0, tritan: 0 },
  };

  const prep = prepareData([], "oklch", config);

  assert.ok(prep.bounds, "Expected bounds to be present");
  assert.ok(prep.bounds.boundsH, "Expected hue bounds to be present");
  assert.equal(isFull01(prep.bounds.boundsByName?.l), true);
  assert.equal(isFull01(prep.bounds.boundsByName?.c), true);
  assert.equal(isFull01(prep.bounds.boundsH), false);
});

