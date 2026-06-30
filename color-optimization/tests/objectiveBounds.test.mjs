import test from "node:test";
import { strict as assert } from "node:assert";

import { isInGamut, normalizeWithRange } from "../core/colorSpaces.js";
import { normSatisfiesHardConstraints } from "../core/hardConstraints.js";
import { computeBoundsFromCurrent } from "../optimizer/bounds.js";
import { objectiveInfo, prepareData } from "../optimizer/objective.js";

function isFull01(b) {
  return Array.isArray(b) && b.length === 2 && b[0] <= 1e-6 && b[1] >= 1 - 1e-6;
}

function approxBounds(actual, expected, label) {
  assert.equal(Array.isArray(actual), true, `${label} should be a bounds array`);
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((v, idx) => {
    assert.ok(Math.abs(v - expected[idx]) < 1e-12, `${label}[${idx}] expected ${expected[idx]}, got ${v}`);
  });
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

test("prepareData honors explicit dragged slider bounds", () => {
  const prep = prepareData([], "oklch", {
    constrain: true,
    widths: [0, 0, 0],
    explicitBounds: {
      l: [0.2, 0.8],
      c: [0.15, 0.42],
      h: [0.9, 1.1],
    },
    constraintMode: { l: "hard", c: "hard", h: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: false,
    nColsToAdd: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  });

  approxBounds(prep.bounds.boundsByName.l, [0.2, 0.8], "l bounds");
  approxBounds(prep.bounds.boundsByName.c, [0.15, 0.42], "c bounds");
  approxBounds(prep.bounds.boundsH, [0.9, 1.1], "h bounds");
  approxBounds(prep.bounds.constraintSets.channels.l.intervals[0], [0.2, 0.8], "l interval");
  approxBounds(prep.bounds.constraintSets.channels.c.intervals[0], [0.15, 0.42], "c interval");
  assert.ok(prep.bounds.constraintSets.channels.h.arc, "Expected explicit hue arc");
  assert.equal(prep.bounds.constraintSets.channels.h.arc.full, false);
});

test("custom constraints are literal under aesthetic modes", () => {
  const prep = prepareData([], "hsl", {
    constrain: true,
    widths: [0.9, 0.9, 0.9],
    constraintTopology: "custom",
    aestheticMode: "complementary",
    constraintMode: { h: "hard", s: "hard", l: "hard" },
    customConstraintPoints: [{ h: 0, s: 50, l: 50 }],
    gamutPreset: "srgb",
    clipToGamutOpt: false,
    nColsToAdd: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  });

  const center = prep.bounds.constraintSets.channels.h.pointWindows[0].center;
  assert.ok(center < 1e-6 || Math.abs(center - Math.PI * 2) < 1e-6);
});

test("hard custom windows do not penalize colors inside the window", () => {
  const prep = prepareData([], "oklab", {
    constrain: true,
    widths: [0.8, 0.8, 0.8],
    constraintTopology: "custom",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    customConstraintPoints: [{ l: 0.5, a: 0, b: 0 }],
    gamutPreset: "srgb",
    clipToGamutOpt: false,
    nColsToAdd: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  });

  const logit = (p) => Math.log(p / (1 - p));
  const info = objectiveInfo([logit(0.55), logit(0.5), logit(0.5)], prep);
  assert.equal(info.constraintPenalty, 0);
});

test("hard custom windows clamp optimizer raw output inside the window", () => {
  const prep = prepareData([], "oklab", {
    constrain: true,
    widths: [0.65, 0.8, 0.8],
    constraintTopology: "custom",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    customConstraintPoints: [{ l: 0.65, a: 0, b: 0 }],
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  });

  const logit = (p) => Math.log(p / (1 - p));
  const info = objectiveInfo([logit(0.95), logit(0.95), logit(0.95)], prep);
  const row = info.optimizerRaw[0];
  const { ranges, bounds } = prep;
  const norm = {
    l: (row.l - ranges.min.l) / (ranges.max.l - ranges.min.l),
    a: (row.a - ranges.min.a) / (ranges.max.a - ranges.min.a),
    b: (row.b - ranges.min.b) / (ranges.max.b - ranges.min.b),
  };

  ["l", "a", "b"].forEach((ch) => {
    const window = bounds.constraintSets.channels[ch].pointWindows[0];
    assert.ok(norm[ch] >= window.min - 1e-10, `${ch} below custom hard window`);
    assert.ok(norm[ch] <= window.max + 1e-10, `${ch} above custom hard window`);
  });
  assert.equal(info.constraintPenalty, 0);
});

test("gamut-clipped display output respects hard custom windows", () => {
  const prep = prepareData([], "oklab", {
    constrain: true,
    widths: [0, 0, 0],
    constraintTopology: "custom",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    customConstraintPoints: [{ l: 0.55, a: 0, b: 0 }],
    perInputWidths: { l: [0], a: [0.7], b: [0.7] },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  });

  const logit = (p) => Math.log(p / (1 - p));
  const info = objectiveInfo([logit(0.48), logit(0.65), logit(0.65)], prep);
  const displayNorm = normalizeWithRange(info.newRaw[0], prep.ranges, "oklab");
  const optimizerNorm = normalizeWithRange(info.optimizerRaw[0], prep.ranges, "oklab");
  const sets = prep.bounds.constraintSets;

  assert.equal(isInGamut(info.newRaw[0], "oklab", "srgb"), true);
  assert.equal(normSatisfiesHardConstraints(optimizerNorm, sets, sets.topology), true);
  assert.equal(normSatisfiesHardConstraints(displayNorm, sets, sets.topology), true);
});

test("per-input constraint modes are retained for discontiguous point windows", () => {
  const bounds = computeBoundsFromCurrent(["#2255AA", "#AA5522"], "oklab", {
    constrain: true,
    widths: [0.5, 0.5, 0.5],
    constraintTopology: "discontiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    perInputWidths: { l: [0.5, 0.5], a: [0.5, 0.5], b: [0.5, 0.5] },
    perInputModes: ["soft", "hard"],
  });

  ["l", "a", "b"].forEach((ch) => {
    assert.deepEqual(bounds.constraintSets.channels[ch].pointModes, ["soft", "hard"]);
  });
});
