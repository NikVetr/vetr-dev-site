import test from "node:test";
import { strict as assert } from "node:assert";

import { setRandomSeed } from "../core/random.js";
import { normalizeWithRange } from "../core/colorSpaces.js";
import { hardConstraintRegionIndex } from "../core/hardConstraints.js";
import { nelderMead } from "../optimizer/nelderMead.js";
import { optimizePalette } from "../optimizer/optimizePalette.js";
import { prepareData } from "../optimizer/objective.js";

test("nelderMead can return best-point trace samples", () => {
  const res = nelderMead(
    ([x, y]) => Math.pow(x - 1, 2) + Math.pow(y + 2, 2),
    [4, 4],
    { maxIterations: 8, trace: true }
  );

  assert.ok(Array.isArray(res.trace));
  assert.ok(res.trace.length > 1);
  res.trace.forEach((row) => assert.equal(row.length, 2));
});

test("optimizePalette reports sampled restart trajectories", async () => {
  setRandomSeed(2026);
  const progress = [];
  await optimizePalette(["#680B00", "#003B48", "#1BB600"], {
    colorSpace: "oklab",
    constrain: true,
    widths: [0.65, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 2,
    nOptimRuns: 1,
    nmIterations: 8,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  }, {
    onProgress: (info) => progress.push(info),
  });

  assert.equal(progress.length, 1);
  const trajectory = progress[0].trajectory;
  assert.ok(Array.isArray(trajectory));
  assert.ok(trajectory.length > 2);
  trajectory.forEach((step) => {
    assert.equal(step.hex.length, 2);
    assert.equal(step.raw.length, 2);
  });
});

test("optimizePalette caps restart trajectory samples from config", async () => {
  setRandomSeed(2027);
  const progress = [];
  await optimizePalette(["#680B00", "#003B48", "#1BB600"], {
    colorSpace: "oklab",
    constrain: true,
    widths: [0.65, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 2,
    nOptimRuns: 1,
    nmIterations: 8,
    trajectorySteps: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  }, {
    onProgress: (info) => progress.push(info),
  });

  assert.equal(progress.length, 1);
  assert.ok(progress[0].trajectory.length <= 3);
});

test("optimizePalette preserves optimizer-space raw coordinates for diagnostics", async () => {
  const config = {
    colorSpace: "oklab",
    constrain: true,
    widths: [0.65, 0.65, 0.65],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 3,
    nOptimRuns: 1,
    nmIterations: 8,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };
  const palette = ["#680B00", "#003B48", "#1BB600"];
  const prep = prepareData(palette, "oklab", config);
  const progress = [];

  setRandomSeed(2028);
  const best = await optimizePalette(palette, config, {
    onProgress: (info) => progress.push(info),
  });

  assert.equal(progress.length, 1);
  assert.equal(best.optimizerRaw.length, config.nColsToAdd);
  assert.equal(progress[0].endRaw.length, config.nColsToAdd);
  assert.ok(progress[0].trajectory.length >= 2);

  best.optimizerRaw.forEach((row) => {
    const norm = normalizeWithRange(row, prep.ranges, "oklab");
    for (const ch of ["l", "a", "b"]) {
      const [lo, hi] = prep.bounds.boundsByName[ch];
      assert.ok(norm[ch] >= lo - 1e-8, `expected ${ch} >= ${lo}, got ${norm[ch]}`);
      assert.ok(norm[ch] <= hi + 1e-8, `expected ${ch} <= ${hi}, got ${norm[ch]}`);
    }
  });
});

test("custom hard constraint trajectories stay inside displayed point windows", async () => {
  const config = {
    colorSpace: "oklab",
    constrain: true,
    widths: [0, 0, 0],
    constraintTopology: "custom",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    customConstraintPoints: [{ l: 0.55, a: 0, b: 0 }],
    perInputWidths: { l: [0], a: [0.7], b: [0.7] },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 2,
    nOptimRuns: 1,
    nmIterations: 10,
    trajectorySteps: 10,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };
  const prep = prepareData([], "oklab", config);
  const progress = [];

  setRandomSeed(2029);
  await optimizePalette([], config, {
    onProgress: (info) => progress.push(info),
  });

  assert.equal(progress.length, 1);
  const sets = prep.bounds.constraintSets;
  progress[0].trajectory.forEach((step, stepIdx) => {
    step.raw.forEach((row, rowIdx) => {
      const norm = normalizeWithRange(row, prep.ranges, "oklab");
      assert.notEqual(
        hardConstraintRegionIndex(norm, sets, sets.topology),
        null,
        `expected trajectory step ${stepIdx}, row ${rowIdx} inside displayed custom hard window`
      );
    });
  });
});

test("optimizePalette stops after cancellation predicate is set", async () => {
  setRandomSeed(2030);
  const progress = [];
  let cancelled = false;
  const best = await optimizePalette(["#680B00", "#003B48", "#1BB600"], {
    colorSpace: "oklab",
    constrain: true,
    widths: [0.65, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 2,
    nOptimRuns: 4,
    nmIterations: 20,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  }, {
    shouldStop: () => cancelled,
    onProgress: (info) => {
      progress.push(info);
      cancelled = true;
    },
  });

  assert.equal(progress.length, 1);
  assert.equal(best.cancelled, true);
  assert.equal(best.meta.reason, "cancelled");
});
