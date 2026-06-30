import test from "node:test";
import assert from "node:assert/strict";

import { channelOrder, decodeColor, normalizeWithRange } from "../core/colorSpaces.js";
import { normSatisfiesHardConstraints } from "../core/hardConstraints.js";
import { objectiveInfo, prepareData } from "../optimizer/objective.js";
import { optimizePalette } from "../optimizer/optimizePalette.js";

function baseConfig(overrides = {}) {
  return {
    colorSpace: "oklab",
    gamutPreset: "srgb",
    clipToGamutOpt: false,
    cvdModel: "machado2009",
    distanceMetric: "de2000",
    meanType: "harmonic",
    nColsToAdd: 0,
    nOptimRuns: 1,
    nmIterations: 10,
    trajectorySteps: 4,
    constraintTopology: "discontiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    widths: [0.92, 0.92, 0.92],
    constrain: true,
    colorblindSafe: true,
    colorblindWeights: { none: 1, deutan: 0, protan: 0, tritan: 0 },
    ...overrides,
  };
}

const hardOklabTweaks = { l: "hard", a: "hard", b: "hard" };

function assertInsideLinearWindow(norm, window, label) {
  assert.ok(window, `${label} window exists`);
  assert.ok(norm >= window.min - 1e-9, `${label} ${norm} >= ${window.min}`);
  assert.ok(norm <= window.max + 1e-9, `${label} ${norm} <= ${window.max}`);
}

function logit01(p) {
  const t = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return Math.log(t / (1 - t));
}

function paramsForSingleHex(hex, prep) {
  const raw = decodeColor(hex, prep.colorSpace);
  const norm = normalizeWithRange(raw, prep.ranges, prep.colorSpace);
  return (channelOrder[prep.colorSpace] || []).map((ch) => {
    if (ch === "h") return ((norm.h || 0) * Math.PI * 2) - (prep.hueAnchorRad || 0);
    return logit01(norm[ch]);
  });
}

function paramsForHexes(hexes, prep) {
  return hexes.flatMap((hex) => paramsForSingleHex(hex, prep));
}

function assertRawNearHex(raw, hex, prep, label) {
  const expected = decodeColor(hex, prep.colorSpace);
  for (const ch of channelOrder[prep.colorSpace] || []) {
    assert.ok(
      Math.abs((raw[ch] ?? 0) - (expected[ch] ?? 0)) < 1e-6,
      `${label} ${ch}: expected ${expected[ch]}, got ${raw[ch]}`
    );
  }
}

test("tweaked inputs are optimized rows and do not count as colors to add", () => {
  const palette = ["#992C95", "#213F00", "#0004A2"];
  const prep = prepareData(palette, "oklab", baseConfig({ tweakInputIndices: [0, 2] }));
  assert.equal(prep.nColsToAdd, 0);
  assert.equal(prep.nOptimized, 2);
  assert.deepEqual(
    prep.optimizedRows.map((row) => ({ kind: row.kind, inputIndex: row.inputIndex, pointIndex: row.pointIndex })),
    [
      { kind: "tweak", inputIndex: 0, pointIndex: 0 },
      { kind: "tweak", inputIndex: 2, pointIndex: 2 },
    ]
  );
  assert.equal(prep.currRaw.length, 1);
});

test("tweak hard constraints clamp to the source input window", () => {
  const palette = ["#992C95", "#213F00", "#0004A2"];
  const prep = prepareData(palette, "oklab", baseConfig({ tweakInputIndices: [1], tweakConstraintMode: hardOklabTweaks }));
  const info = objectiveInfo([20, 20, 20], prep);
  assert.equal(info.newRaw.length, 1);
  assert.equal(info.optimizedRows[0].kind, "tweak");
  assert.equal(info.optimizedRows[0].inputIndex, 1);

  const norm = normalizeWithRange(info.optimizerRaw[0], prep.ranges, "oklab");
  const sets = prep.bounds.constraintSets.channels;
  const pointIndex = info.optimizedRows[0].pointIndex;
  assertInsideLinearWindow(norm.l, sets.l.pointWindows[pointIndex], "L");
  assertInsideLinearWindow(norm.a, sets.a.pointWindows[pointIndex], "a");
  assertInsideLinearWindow(norm.b, sets.b.pointWindows[pointIndex], "b");
});

test("hard tweak constraints do not constrain added output rows", () => {
  const palette = ["#992C95", "#213F00", "#0004A2"];
  const prep = prepareData(palette, "oklab", baseConfig({
    tweakInputIndices: [1],
    nColsToAdd: 1,
    perInputWidths: {
      l: [0.45, 1, 0.45],
      a: [0.45, 1, 0.45],
      b: [0.45, 1, 0.45],
    },
    perInputModes: ["soft", "hard", "soft"],
  }));
  const info = objectiveInfo([20, 20, 20, 20, 20, 20], prep);
  const tweakedNorm = normalizeWithRange(info.optimizerRaw[0], prep.ranges, "oklab");
  const addedNorm = normalizeWithRange(info.optimizerRaw[1], prep.ranges, "oklab");
  const sets = prep.bounds.constraintSets.channels;
  const pointIndex = info.optimizedRows[0].pointIndex;

  assertInsideLinearWindow(tweakedNorm.l, sets.l.pointWindows[pointIndex], "tweaked L");
  assertInsideLinearWindow(tweakedNorm.a, sets.a.pointWindows[pointIndex], "tweaked a");
  assertInsideLinearWindow(tweakedNorm.b, sets.b.pointWindows[pointIndex], "tweaked b");

  const distanceFromTweakWindowCenter = Math.hypot(
    addedNorm.l - sets.l.pointWindows[pointIndex].center,
    addedNorm.a - sets.a.pointWindows[pointIndex].center,
    addedNorm.b - sets.b.pointWindows[pointIndex].center
  );
  assert.ok(
    distanceFromTweakWindowCenter > 0.02,
    `added output should not be clamped to tweak-local hard window; distance=${distanceFromTweakWindowCenter}`
  );
});

test("hard tweak constraints clamp without adding center pressure inside the source window", () => {
  const palette = ["#992C95", "#213F00", "#0004A2"];
  const prep = prepareData(palette, "oklab", baseConfig({ tweakInputIndices: [1], tweakConstraintMode: hardOklabTweaks }));
  const centered = objectiveInfo(paramsForSingleHex(palette[1], prep), prep);
  const displaced = objectiveInfo([20, 20, 20], prep);
  assert.equal(centered.constraintPenalty, 0);
  assert.equal(displaced.constraintPenalty, 0);
});

test("tweak constraints default to soft center-seeking penalties", () => {
  const palette = ["#992C95", "#213F00", "#0004A2"];
  const prep = prepareData(palette, "oklab", baseConfig({ tweakInputIndices: [1] }));
  assert.deepEqual(prep.tweakConstraintMode, { l: "soft", a: "soft", b: "soft" });
  const centered = objectiveInfo(paramsForSingleHex(palette[1], prep), prep);
  const displaced = objectiveInfo([20, 20, 20], prep);
  assert.ok(displaced.constraintPenalty > centered.constraintPenalty + 0.1);
});

test("global hard constraints still apply to soft tweaked outputs", () => {
  const palette = ["#992C95", "#213F00", "#0004A2"];
  const prep = prepareData(palette, "oklab", baseConfig({
    tweakInputIndices: [1],
    perInputWidths: {
      l: [0.45, 0.45, 0.45],
      a: [0.45, 0.45, 0.45],
      b: [0.45, 0.45, 0.45],
    },
    perInputModes: ["hard", "soft", "hard"],
  }));
  const info = objectiveInfo([20, 20, 20], prep);
  const norm = normalizeWithRange(info.optimizerRaw[0], prep.ranges, "oklab");

  assert.equal(prep.bounds.globalConstraintSets.channels.l.mode, "hard");
  assert.equal(prep.bounds.constraintSets.channels.l.pointModes[1], "soft");
  assert.equal(
    normSatisfiesHardConstraints(norm, prep.bounds.globalConstraintSets, prep.bounds.globalConstraintSets.topology),
    true
  );
});

test("multiple tweak rows preserve source row identities instead of lightness sorting", () => {
  const palette = ["#FF5400", "#0000AD", "#214000"];
  const prep = prepareData(palette, "oklab", baseConfig({ tweakInputIndices: [0, 1, 2] }));
  const info = objectiveInfo(paramsForHexes(palette, prep), prep);
  assert.equal(info.optimizerRaw.length, palette.length);
  palette.forEach((hex, idx) => assertRawNearHex(info.optimizerRaw[idx], hex, prep, `row ${idx}`));
});

test("first tweak restart is anchored at source input colors", async () => {
  const palette = ["#FF5400", "#0000AD", "#214000"];
  let startInfo = null;
  await optimizePalette(
    palette,
    baseConfig({
      tweakInputIndices: [0, 1, 2],
      nOptimRuns: 1,
      nmIterations: 1,
      colorblindSafe: false,
      colorblindWeights: { none: 1, deutan: 0, protan: 0, tritan: 0 },
    }),
    {
      onVerbose: (info) => {
        if (info.stage === "start") startInfo = info;
      },
    }
  );
  assert.ok(startInfo, "start info was emitted");
  assert.deepEqual(startInfo.hex, palette);
});

test("default soft tweak constraints let near-duplicate tweaks separate", async () => {
  const palette = ["#725978", "#725B6A"];
  const distance = (a, b) => {
    const rawA = decodeColor(a, "oklab");
    const rawB = decodeColor(b, "oklab");
    return Math.hypot(rawA.l - rawB.l, rawA.a - rawB.a, rawA.b - rawB.b);
  };
  const best = await optimizePalette(
    palette,
    baseConfig({
      tweakInputIndices: [0, 1],
      widths: [0.5, 0.5, 0.5],
      nOptimRuns: 5,
      nmIterations: 40,
      seed: 123,
      colorblindWeights: { none: 0.5, deutan: 0.4, protan: 0.08, tritan: 0.02 },
    })
  );
  assert.ok(distance(best.newHex[0], best.newHex[1]) > distance(palette[0], palette[1]) * 1.5);
});
