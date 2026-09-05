import test from "node:test";
import assert from "node:assert/strict";
import { decodeColor, normalizeWithRange, isInGamut } from "../core/colorSpaces.js";
import { GamutProjectionError, normSatisfiesHardConstraints } from "../core/hardConstraints.js";
import { constraintSetForRole } from "../core/constraintRoles.js";
import { objectiveInfo, objectiveValue, prepareData } from "../optimizer/objective.js";
import { optimizePalette, buildGamutUniformParams } from "../optimizer/optimizePalette.js";
import { setRandomSeed } from "../core/random.js";

const base = { colorSpace: "oklab", constrain: true, constraintTopology: "discontiguous",
  constraintMode: { l: "hard", a: "hard", b: "hard" }, widths: [0, 0, 0],
  nColsToAdd: 1, colorblindSafe: false, colorblindWeights: { none: 1 }, gamutPreset: "srgb" };
const perWidths = { l: [0.9], a: [0.9], b: [0.9] };
const normFor = (raw, prep) => normalizeWithRange(raw, prep.ranges, "oklab");
function paramsFor(hex, prep) {
  const norm = normFor(decodeColor(hex, "oklab"), prep);
  return ["l", "a", "b"].map((ch) => Math.log(norm[ch] / (1 - norm[ch])));
}

for (const clipToGamutOpt of [false, true]) {
  for (const globalMode of ["hard", "soft"]) {
    for (const localMode of ["hard", "soft"]) {
      test(`per-input ${localMode} overrides global ${globalMode}, clipping=${clipToGamutOpt}`, () => {
        const prep = prepareData(["#808080"], "oklab", { ...base, clipToGamutOpt,
          constraintMode: { l: globalMode, a: globalMode, b: globalMode },
          perInputWidths: perWidths, perInputModes: [localMode], individualConstraintsReplaceGlobal: true });
        for (const ch of ["l", "a", "b"]) assert.equal(prep.bounds.constraintSets.channels[ch].pointModes[0], localMode);
        const info = objectiveInfo(paramsFor("#00FF00", prep), prep);
        if (localMode === "soft") {
          assert.equal(info.newHex[0], "#00FF00");
          assert.deepEqual(info.newRaw, info.optimizerRaw);
          assert.ok(info.constraintPenalty > 0);
        } else {
          assert.ok(normSatisfiesHardConstraints(normFor(info.newRaw[0], prep), prep.bounds.constraintSets, "discontiguous"));
          assert.equal(info.constraintPenalty, 0);
        }
      });
    }
  }
  test(`tweak hard windows stay local when incompatible global windows are skipped, clipping=${clipToGamutOpt}`, () => {
    const prep = prepareData(["#FF0000", "#0000FF"], "oklab", { ...base, clipToGamutOpt,
      widths: [0.95, 0.95, 0.95], tweakInputIndices: [0], globalConstraintExcludeInputIndices: [0],
      perInputWidths: { l: [1, 0], a: [1, 0], b: [1, 0] }, perInputModes: ["hard", "hard"] });
    const info = objectiveInfo([...paramsFor("#808080", prep), ...paramsFor("#808080", prep)], prep);
    assert.equal(info.newHex[0], "#FF0000");
    assert.notEqual(info.newHex[1], "#FF0000");
    const local = constraintSetForRole(prep.bounds.constraintSets, prep.optimizedRows[0], prep.tweakConstraintMode);
    assert.ok(normSatisfiesHardConstraints(normFor(info.newRaw[0], prep), local, "discontiguous"));
    assert.ok(normSatisfiesHardConstraints(normFor(info.newRaw[1], prep), prep.bounds.globalConstraintSets, "discontiguous"));
  });
}

test("soft per-input starts can span outside the soft window", () => {
  const prep = prepareData(["#808080"], "oklab", { ...base, clipToGamutOpt: true,
    perInputWidths: perWidths, perInputModes: ["soft"], individualConstraintsReplaceGlobal: true });
  setRandomSeed(910);
  let outside = false;
  const w = prep.bounds.constraintSets.channels.l.pointWindows[0];
  for (let i = 0; i < 20; i++) {
    const params = buildGamutUniformParams(1, "oklab", "srgb", prep.ranges, prep);
    const info = objectiveInfo(params, prep);
    assert.ok(isInGamut(info.newRaw[0], "oklab", "srgb"));
    outside ||= info.newRaw[0].l < w.min || info.newRaw[0].l > w.max;
  }
  assert.ok(outside);
});

test("infeasible hard/gamut intersections are rejected explicitly", async () => {
  const config = { ...base, constraintTopology: "custom", widths: [1, 1, 1], clipToGamutOpt: true,
    customConstraintPoints: [{ l: 0.5, a: 0.5, b: 0.5 }], nOptimRuns: 1, nmIterations: 10 };
  const prep = prepareData([], "oklab", config);
  assert.throws(() => objectiveInfo([0, 0, 0], prep), GamutProjectionError);
  assert.equal(objectiveValue([0, 0, 0], prep), Infinity);
  await assert.rejects(optimizePalette([], config), /Unable to sample|hard constraints/);
});

test("best-result metadata retains final distance and penalty diagnostics", async () => {
  const events = [];
  const best = await optimizePalette(["#4477AA"], { ...base, clipToGamutOpt: true,
    seed: 45, nOptimRuns: 1, nmIterations: 10 }, { onVerbose: (event) => events.push(event) });
  const final = events.find((event) => event.stage === "final-best");
  assert.ok(final);
  for (const key of ["distance", "penalty", "paramPenalty", "gamutPenalty"]) {
    assert.ok(Number.isFinite(final[key]));
    assert.equal(final[key], best.meta[key]);
  }
});
