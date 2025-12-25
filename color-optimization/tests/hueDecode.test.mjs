import test from "node:test";
import { strict as assert } from "node:assert";

import { encodeColor } from "../core/colorSpaces.js";
import { prepareData, objectiveInfo } from "../optimizer/objective.js";

const TAU = Math.PI * 2;

function circularDiffDeg(a, b) {
  return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
}

function baseConfig() {
  return {
    constrain: false,
    widths: [],
    gamutPreset: "srgb",
    clipToGamutOpt: false,
    nColsToAdd: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };
}

test("unconstrained hue decoding is periodic in 2π", () => {
  const prep = prepareData([], "hsl", baseConfig());
  const par0 = [0, 0, 0];
  const par1 = [TAU, 0, 0];
  const info0 = objectiveInfo(par0, prep);
  const info1 = objectiveInfo(par1, prep);
  const h0 = info0.newRaw[0].h;
  const h1 = info1.newRaw[0].h;
  assert.ok(circularDiffDeg(h0, h1) < 1e-6);
});

test("constrained hue arc decoding is monotone across wrap-around arcs", () => {
  const palette = [
    encodeColor({ h: 350, s: 100, l: 50 }, "hsl"),
    encodeColor({ h: 10, s: 100, l: 50 }, "hsl"),
  ];
  const config = {
    ...baseConfig(),
    constrain: true,
    widths: [0.5, 0, 0],
  };
  const prep = prepareData(palette, "hsl", config);
  assert.ok(prep.bounds?.boundsH, "Expected hue bounds");
  const start = prep.bounds.boundsH[0];
  const span = (prep.bounds.boundsH[1] - prep.bounds.boundsH[0] + 1) % 1 || 1;
  assert.ok(span < 0.999, "Expected a constrained hue span");

  const vals = [-4, 0, 4].map((z) => objectiveInfo([z, 0, 0], prep).newRaw[0].h / 360);
  const deltas = vals.map((v) => ((v - start + 1) % 1));
  assert.ok(deltas[0] <= deltas[1] + 1e-6);
  assert.ok(deltas[1] <= deltas[2] + 1e-6);
});
