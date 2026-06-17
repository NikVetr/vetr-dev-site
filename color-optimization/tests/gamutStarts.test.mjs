import test from "node:test";
import { strict as assert } from "node:assert";

import { setRandomSeed } from "../core/random.js";
import {
  channelOrder,
  csRanges,
  effectiveRangeFromValues,
  isInGamut,
  normalizeWithRange,
  rangeFromPreset,
} from "../core/colorSpaces.js";
import { objectiveInfo, prepareData } from "../optimizer/objective.js";
import { buildGamutUniformParams } from "../optimizer/optimizePalette.js";
import {
  buildGamutOuterBoundary,
  buildGamutProjectionBoundary,
  computeGamutExtent,
  hardContiguousHiddenConstraintRange,
  hardContiguousVisibleConstraintGuides,
  smoothBoundary,
} from "../ui/gamutHull.js";

test("gamut-clipped empty-palette starts respect default L bounds", () => {
  const config = {
    constrain: true,
    widths: [0.65, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 3,
    colorblindSafe: true,
    colorblindWeights: { none: 1, deutan: 0, protan: 0, tritan: 0 },
  };

  setRandomSeed(2468);
  const prep = prepareData([], "oklab", config);
  assert.deepEqual(prep.bounds.boundsByName.l, [0.325, 0.675]);

  let minL = Infinity;
  let maxL = -Infinity;
  for (let i = 0; i < 120; i++) {
    const params = buildGamutUniformParams(config.nColsToAdd, "oklab", "srgb", prep.ranges, prep);
    const info = objectiveInfo(params, prep);
    info.newRaw.forEach((row) => {
      assert.equal(isInGamut(row, "oklab", "srgb"), true, `expected displayed start raw in gamut: ${JSON.stringify(row)}`);
      minL = Math.min(minL, row.l);
      maxL = Math.max(maxL, row.l);
    });
  }

  assert.ok(minL >= 0.325 - 1e-6, `expected starts to respect lower L bound, got ${minL}`);
  assert.ok(maxL <= 0.675 + 1e-6, `expected starts to respect upper L bound, got ${maxL}`);
});

test("gamut-clipped starts span L when L is unconstrained", () => {
  const config = {
    constrain: true,
    widths: [0, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 3,
    colorblindSafe: true,
    colorblindWeights: { none: 1, deutan: 0, protan: 0, tritan: 0 },
  };

  setRandomSeed(1357);
  const prep = prepareData([], "oklab", config);
  assert.deepEqual(prep.bounds.boundsByName.l, [0, 1]);

  let minL = Infinity;
  let maxL = -Infinity;
  for (let i = 0; i < 120; i++) {
    const params = buildGamutUniformParams(config.nColsToAdd, "oklab", "srgb", prep.ranges, prep);
    const info = objectiveInfo(params, prep);
    info.newRaw.forEach((row) => {
      assert.equal(isInGamut(row, "oklab", "srgb"), true, `expected displayed start raw in gamut: ${JSON.stringify(row)}`);
      minL = Math.min(minL, row.l);
      maxL = Math.max(maxL, row.l);
    });
  }

  assert.ok(minL < 0.25, `expected unconstrained starts below L=0.25, got ${minL}`);
  assert.ok(maxL > 0.75, `expected unconstrained starts above L=0.75, got ${maxL}`);
});

test("gamut-clipped objective exposes projected raw coordinates for display", () => {
  const config = {
    constrain: true,
    widths: [0, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 1,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };

  const prep = prepareData([], "oklab", config);
  const info = objectiveInfo([0, 20, 20], prep);

  assert.equal(isInGamut(info.newRaw[0], "oklab", "srgb"), true);
  assert.equal(isInGamut(info.optimizerRaw[0], "oklab", "srgb"), false);
});

test("optimizer-space coordinates respect hard rectangular constraints when display is clipped", () => {
  const palette = ["#680B00", "#003B48", "#1BB600"];
  const config = {
    constrain: true,
    widths: [0.65, 0.65, 0.65],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 3,
    colorSpace: "oklab",
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };

  const prep = prepareData(palette, "oklab", config);
  const params = [0, -2, 2, 0.5, 2, -2, -0.5, 0, 1];
  const info = objectiveInfo(params, prep);
  assert.equal(info.optimizerRaw.length, config.nColsToAdd);

  info.optimizerRaw.forEach((row) => {
    const norm = normalizeWithRange(row, prep.ranges, "oklab");
    for (const ch of ["l", "a", "b"]) {
      const [lo, hi] = prep.bounds.boundsByName[ch];
      assert.ok(norm[ch] >= lo - 1e-8, `expected ${ch} >= ${lo}, got ${norm[ch]}`);
      assert.ok(norm[ch] <= hi + 1e-8, `expected ${ch} <= ${hi}, got ${norm[ch]}`);
    }
  });
});

test("gamut-clipped custom starts sample inside hard point windows", () => {
  const space = "oklab";
  const config = {
    constrain: true,
    widths: [0, 0.9, 0.9],
    constraintTopology: "custom",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    customConstraintPoints: [
      { l: 0.62, a: -0.10, b: 0.08 },
      { l: 0.66, a: 0.12, b: -0.06 },
    ],
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 2,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };
  const prep = prepareData([], space, config);
  const sets = prep.bounds.constraintSets.channels;
  const windows = ["a", "b"].map((ch) => sets[ch].pointWindows);
  const seen = new Set();

  setRandomSeed(8765);
  for (let i = 0; i < 80; i++) {
    const params = buildGamutUniformParams(config.nColsToAdd, space, config.gamutPreset, prep.ranges, prep);
    const info = objectiveInfo(params, prep);
    info.optimizerRaw.forEach((row) => {
      const norm = normalizeWithRange(row, prep.ranges, space);
      const idx = windows[0].findIndex((w, j) =>
        norm.a >= w.min - 1e-8 &&
        norm.a <= w.max + 1e-8 &&
        norm.b >= windows[1][j].min - 1e-8 &&
        norm.b <= windows[1][j].max + 1e-8
      );
      assert.notEqual(idx, -1, `expected start inside a custom hard window: ${JSON.stringify(norm)}`);
      seen.add(idx);
    });
  }

  assert.ok(seen.size > 1, "expected custom starts to sample multiple allowed windows");
});

test("status mini gamut boundary encloses generated OKLab starts", () => {
  const space = "oklab";
  const gamutPreset = "srgb";
  const config = {
    constrain: true,
    widths: [0.65, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset,
    clipToGamutOpt: true,
    nColsToAdd: 3,
    colorblindSafe: true,
    colorblindWeights: { none: 0.5, deutan: 0.4, protan: 0.08, tritan: 0.02 },
  };

  setRandomSeed(1234);
  const prep = prepareData([], space, config);
  const starts = [];
  for (let i = 0; i < 200; i++) {
    const params = buildGamutUniformParams(config.nColsToAdd, space, gamutPreset, prep.ranges, prep);
    starts.push(...objectiveInfo(params, prep).newRaw);
  }

  const constraintDomain = hardConstraintDomain(prep.bounds, space);
  const gamutExtent =
    computeGamutExtent(space, gamutPreset, 1.1, constraintDomain.range) ||
    rangeFromPreset(space, gamutPreset);
  const scaleRange = unionRanges(effectiveRangeFromValues(starts, space), gamutExtent, space);
  const boundaryRange = applyConstrainedChannels(
    scaleRange,
    constraintDomain.range,
    constraintDomain.channels
  );
  const boundary = buildGamutProjectionBoundary(
    space,
    gamutPreset,
    boundaryRange,
    true,
    { x: "a", y: "b" }
  ).map((vals) => toMiniPoint(vals, scaleRange));
  const expanded = buildGamutOuterBoundary(smoothBoundary(boundary, 1), 0, 0, 3);

  starts.forEach((vals) => {
    assert.equal(
      pointInPolygon(toMiniPoint(vals, scaleRange), expanded),
      true,
      `expected start inside drawn mini gamut boundary: ${JSON.stringify(vals)}`
    );
  });
});

test("rectangular gamut projection boundaries stay inside their drawing ranges", () => {
  const gamutPreset = "srgb";
  ["oklab", "luv", "jzazbz"].forEach((space) => {
    const range = computeGamutExtent(space, gamutPreset, 1.1) || rangeFromPreset(space, gamutPreset);
    const channels = channelOrder[space];
    const rectKeys = { x: channels[1], y: channels[2] };
    const maxX = Math.max(Math.abs(range.min[rectKeys.x] || 0), Math.abs(range.max[rectKeys.x] || 0)) || 1;
    const maxY = Math.max(Math.abs(range.min[rectKeys.y] || 0), Math.abs(range.max[rectKeys.y] || 0)) || 1;
    const boundary = buildGamutProjectionBoundary(space, gamutPreset, range, true, rectKeys);

    assert.ok(boundary.length > 100, `expected a dense ${space} boundary`);
    boundary.forEach((vals) => {
      assert.ok(
        Math.abs(vals[rectKeys.x] || 0) <= maxX + 1e-9,
        `${space} boundary x outside drawing range: ${vals[rectKeys.x]} > ${maxX}`
      );
      assert.ok(
        Math.abs(vals[rectKeys.y] || 0) <= maxY + 1e-9,
        `${space} boundary y outside drawing range: ${vals[rectKeys.y]} > ${maxY}`
      );
    });
  });
});

test("HSL gamut extent uses native saturation and lightness bounds", () => {
  const extent = computeGamutExtent("hsl", "srgb", 1.1);
  assert.deepEqual(extent, csRanges.hsl);

  const boundary = buildGamutProjectionBoundary("hsl", "srgb", extent, false, null);
  const minS = Math.min(...boundary.map((vals) => vals.s));
  const maxS = Math.max(...boundary.map((vals) => vals.s));
  assert.ok(minS >= 99.9, `expected HSL boundary near full saturation, got ${minS}`);
  assert.ok(maxS <= 100.1, `expected HSL boundary near full saturation, got ${maxS}`);
});

test("Luv gamut boundary is not inflated by the L=0 singularity", () => {
  assert.equal(isInGamut({ l: 0, u: 80, v: 80 }, "luv", "srgb"), false);
  assert.equal(isInGamut({ l: 0, u: 0, v: 0 }, "luv", "srgb"), true);

  const extent = computeGamutExtent("luv", "srgb", 1.1);
  const boundary = buildGamutProjectionBoundary("luv", "srgb", extent, true, { x: "u", y: "v" });
  const maxX = Math.max(Math.abs(extent.min.u || 0), Math.abs(extent.max.u || 0)) || 1;
  const maxY = Math.max(Math.abs(extent.min.v || 0), Math.abs(extent.max.v || 0)) || 1;
  const fillsPlotBox = boundary.every((vals) => {
    const xRatio = Math.abs(vals.u || 0) / maxX;
    const yRatio = Math.abs(vals.v || 0) / maxY;
    return xRatio > 0.98 || yRatio > 0.98;
  });

  assert.equal(fillsPlotBox, false, "expected Luv projection boundary to be an actual gamut silhouette, not the plot rectangle");
});

test("visible hard constraints are exposed as guide lines", () => {
  const config = {
    constrain: true,
    widths: [0.55, 0.55, 0.65],
    constraintTopology: "contiguous",
    constraintMode: { h: "hard", c: "hard", l: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 3,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };
  const prep = prepareData(["#2D5800", "#0100FF", "#FF8500"], "oklch", config);
  const guides = hardContiguousVisibleConstraintGuides(prep.bounds, "oklch", ["h", "c"]);

  assert.equal(guides.some((g) => g.channel === "h" && g.type === "hue"), true);
  assert.equal(guides.some((g) => g.channel === "c" && g.type === "linear" && g.raw.length === 2), true);
  assert.equal(guides.some((g) => g.channel === "l"), false);
});

test("visible constraints do not alter hidden-axis gamut slices", () => {
  const baseConfig = {
    constrain: true,
    widths: [0.65, 0, 0],
    constraintTopology: "contiguous",
    constraintMode: { l: "hard", a: "hard", b: "hard" },
    gamutPreset: "srgb",
    clipToGamutOpt: true,
    nColsToAdd: 3,
    colorblindSafe: false,
    colorblindWeights: { none: 1 },
  };
  const visibleConfig = { ...baseConfig, widths: [0.65, 0.65, 0.65] };
  const palette = ["#680B00", "#003B48", "#1BB600"];
  const hiddenOnly = hardContiguousHiddenConstraintRange(
    prepareData(palette, "oklab", baseConfig).bounds,
    "oklab",
    ["a", "b"]
  );
  const withVisible = hardContiguousHiddenConstraintRange(
    prepareData(palette, "oklab", visibleConfig).bounds,
    "oklab",
    ["a", "b"]
  );

  assert.deepEqual(withVisible.channels, ["l"]);
  assert.deepEqual(withVisible.range.min.l, hiddenOnly.range.min.l);
  assert.deepEqual(withVisible.range.max.l, hiddenOnly.range.max.l);
  assert.deepEqual(withVisible.range.min.a, csRanges.oklab.min.a);
  assert.deepEqual(withVisible.range.max.a, csRanges.oklab.max.a);
  assert.deepEqual(withVisible.range.min.b, csRanges.oklab.min.b);
  assert.deepEqual(withVisible.range.max.b, csRanges.oklab.max.b);
});

function hardConstraintDomain(bounds, space) {
  const base = bounds.ranges || csRanges[space];
  const min = { ...base.min };
  const max = { ...base.max };
  const constrained = [];
  channelOrder[space].forEach((ch) => {
    if (ch === "h") return;
    const c = bounds.constraintSets.channels[ch];
    if (!c || c.mode !== "hard" || c.type !== "linear") return;
    if (!Array.isArray(c.intervals) || c.intervals.length !== 1) return;
    const [lo, hi] = c.intervals[0];
    if (lo <= 1e-6 && hi >= 1 - 1e-6) return;
    min[ch] = base.min[ch] + lo * (base.max[ch] - base.min[ch]);
    max[ch] = base.min[ch] + hi * (base.max[ch] - base.min[ch]);
    constrained.push(ch);
  });
  return { range: { min, max }, channels: constrained };
}

function unionRanges(a, b, space) {
  const min = {};
  const max = {};
  channelOrder[space].forEach((ch) => {
    min[ch] = Math.min(a?.min?.[ch] ?? Infinity, b?.min?.[ch] ?? Infinity);
    max[ch] = Math.max(a?.max?.[ch] ?? -Infinity, b?.max?.[ch] ?? -Infinity);
  });
  return { min, max };
}

function applyConstrainedChannels(range, constraintRange, channels) {
  const min = { ...range.min };
  const max = { ...range.max };
  channels.forEach((ch) => {
    min[ch] = constraintRange.min[ch];
    max[ch] = constraintRange.max[ch];
  });
  return { min, max };
}

function toMiniPoint(vals, range) {
  const maxX = Math.max(Math.abs(range.min.a || 0), Math.abs(range.max.a || 0)) || 1;
  const maxY = Math.max(Math.abs(range.min.b || 0), Math.abs(range.max.b || 0)) || 1;
  return {
    x: ((vals.a || 0) / maxX) * 100,
    y: -((vals.b || 0) / maxY) * 100,
  };
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
