import test from "node:test";
import { strict as assert } from "node:assert";

import {
  computeDistanceMatrix,
  computeNearestNeighbors,
  discriminabilityLabel,
  metricJnd,
} from "../core/resolvability.js";
import { buildOutputSwatchEntries, buildResolvabilityColorEntries } from "../ui/panels.js";

test("computeDistanceMatrix is symmetric with zero diagonal", () => {
  const coords = [
    { l: 50, a: 0, b: 0 },
    { l: 60, a: 10, b: -5 },
    { l: 70, a: -5, b: 20 },
  ];
  const n = coords.length;
  const d = computeDistanceMatrix(coords, "de2000");
  assert.equal(d.length, n * n);
  for (let i = 0; i < n; i++) {
    assert.equal(d[i * n + i], 0);
    for (let j = i + 1; j < n; j++) {
      assert.equal(d[i * n + j], d[j * n + i]);
      assert.ok(d[i * n + j] >= 0);
    }
  }
});

test("computeNearestNeighbors returns nearest index and distance", () => {
  const n = 3;
  const distances = new Float32Array([
    0, 1, 3,
    1, 0, 2,
    3, 2, 0,
  ]);
  const { minDist, nearest } = computeNearestNeighbors(distances, n);
  assert.equal(nearest[0], 1);
  assert.equal(nearest[1], 0);
  assert.equal(nearest[2], 1);
  assert.equal(minDist[0], 1);
  assert.equal(minDist[1], 1);
  assert.equal(minDist[2], 2);
});

test("discriminabilityLabel respects boundaries", () => {
  assert.equal(metricJnd("de2000"), 1);
  assert.equal(discriminabilityLabel(0.5, "de2000"), "awful");
  assert.equal(discriminabilityLabel(1, "de2000"), "poor");
  assert.equal(discriminabilityLabel(2, "de2000"), "fair");
  assert.equal(discriminabilityLabel(5, "de2000"), "good");
  assert.equal(discriminabilityLabel(10, "de2000"), "great");
});

test("resolvability colors replace tweaked inputs after tweak outputs exist", () => {
  const result = buildResolvabilityColorEntries(
    ["#0000A8", "#FF5400", "#2C3C30"],
    ["#0000AD", "#FF5900", "#2B3B19"],
    [
      { kind: "tweak", inputIndex: 0, pointIndex: 0 },
      { kind: "tweak", inputIndex: 1, pointIndex: 1 },
      { kind: "add", addIndex: 0 },
    ]
  );

  assert.deepEqual(result.colors, ["#2C3C30", "#0000AD", "#FF5900", "#2B3B19"]);
  assert.equal(result.inputCount, 1);
  assert.deepEqual(
    result.entries.map((entry) => ({
      kind: entry.kind,
      inputIndex: entry.inputIndex ?? null,
      outputIndex: entry.outputIndex ?? null,
      sourceInputIndex: entry.sourceInputIndex ?? null,
    })),
    [
      { kind: "input", inputIndex: 2, outputIndex: null, sourceInputIndex: null },
      { kind: "tweak", inputIndex: null, outputIndex: 0, sourceInputIndex: 0 },
      { kind: "tweak", inputIndex: null, outputIndex: 1, sourceInputIndex: 1 },
      { kind: "output", inputIndex: null, outputIndex: 2, sourceInputIndex: null },
    ]
  );
});

test("resolvability colors keep planned tweaks before outputs exist", () => {
  const result = buildResolvabilityColorEntries(
    ["#0000A8", "#FF5400"],
    [],
    []
  );

  assert.deepEqual(result.colors, ["#0000A8", "#FF5400"]);
  assert.equal(result.inputCount, 2);
});

test("output swatches pin tweaked outputs and fill untweaked rows with added colors", () => {
  const entries = buildOutputSwatchEntries(
    ["#111111", "#222222", "#333333", "#444444"],
    ["#AAAAAA", "#BBBBBB", "#CCCCCC", "#DDDDDD"],
    [
      { kind: "tweak", inputIndex: 1, pointIndex: 1 },
      { kind: "add", addIndex: 0 },
      { kind: "add", addIndex: 1 },
      { kind: "add", addIndex: 2 },
    ],
    [1]
  );

  assert.deepEqual(
    entries.map((entry) => ({
      hex: entry.hex,
      outputIndex: entry.outputIndex ?? null,
      sourceInputIndex: entry.sourceInputIndex ?? null,
      tweakOutput: Boolean(entry.tweakOutput),
    })),
    [
      { hex: "#BBBBBB", outputIndex: 1, sourceInputIndex: null, tweakOutput: false },
      { hex: "#AAAAAA", outputIndex: 0, sourceInputIndex: 1, tweakOutput: true },
      { hex: "#CCCCCC", outputIndex: 2, sourceInputIndex: null, tweakOutput: false },
      { hex: "#DDDDDD", outputIndex: 3, sourceInputIndex: null, tweakOutput: false },
    ]
  );
});
