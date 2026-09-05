import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deltaE2000 } from "../core/metrics.js";
import { xyzToCam02Ucs, xyzToCam16Ucs } from "../core/camUcs.js";
import { linearRec2020ToICtCp } from "../core/ictcp.js";
import { coordsFromXyzForDistanceMetric, coordsFromHexForDistanceMetric, distanceBetweenCoords } from "../core/distance.js";
import { GAMUTS, convertColorValues, normalizeWithRange } from "../core/colorSpaces.js";
import { objectiveInfo, prepareData } from "../optimizer/objective.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("CIEDE2000 matches all 34 Sharma/Wu/Dalal reference pairs in both directions", () => {
  // https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
  const rows = readFileSync(new URL("./fixtures/ciede2000.txt", import.meta.url), "utf8").trim().split("\n");
  assert.equal(rows.length, 34);
  for (const row of rows) {
    const [l, a, b, L, A, B, expected] = row.trim().split(/\s+/).map(Number);
    close(deltaE2000({ l, a, b }, { l: L, a: A, b: B }), expected, 0.00005);
    close(deltaE2000({ l: L, a: A, b: B }, { l, a, b }), expected, 0.00005);
  }
});

const conditions = { XYZ_w: { x: 95.05, y: 100, z: 108.88 }, LA: 318.31, Yb: 20,
  surround: { F: 1, c: 0.69, Nc: 1 }, discountIlluminant: false };
function ucs([J, M, h]) {
  const mp = Math.log1p(0.0228 * M) / 0.0228;
  return [1.7 * J / (1 + 0.007 * J), mp * Math.cos(h * Math.PI / 180), mp * Math.sin(h * Math.PI / 180)];
}
test("CAM02 and CAM16 match independent appearance-model fixtures", () => {
  // Colour 0.4.7 appearance tests: CIECAM02 and CAM16; published J/M/h mapped to UCS.
  for (const [convert, xyz, LA, expected] of [
    [xyzToCam02Ucs, { x: 0.1901, y: 0.2, z: 0.2178 }, 318.31, [41.73109113, 0.10884218, 219.04843266]],
    [xyzToCam16Ucs, { x: 0.1901, y: 0.2, z: 0.2178 }, 318.31, [41.73120791, 0.10743677, 217.06795977]],
    [xyzToCam16Ucs, { x: 0.5706, y: 0.4306, z: 0.3196 }, 31.83, [65.42828069, 42.62473321, 17.48659243]],
  ]) {
    const actual = convert(xyz, { ...conditions, LA });
    Object.values(actual).forEach((v, i) => close(v, ucs(expected)[i], 2e-6));
  }
});

test("ICtCp uses absolute PQ luminance; SDR distance assumes 100 cd/m² white", () => {
  for (const [Lp, expected] of [[100, 0.5080784215], [1000, 0.7518270962], [10000, 1]]) {
    const value = linearRec2020ToICtCp({ r: 1, g: 1, b: 1 }, Lp);
    close(value.i, expected, 1e-9);
    close(value.t, 0); close(value.p, 0);
  }
  close(coordsFromXyzForDistanceMetric(GAMUTS.rec2020.toXYZ(1, 1, 1), "deitp").l, 0.5080784215, 1e-9);
  for (const Lp of [0, -1, Infinity, NaN, 10001]) {
    assert.throws(() => linearRec2020ToICtCp({ r: 1, g: 1, b: 1 }, Lp), RangeError);
  }
});

const config = { constrain: true, widths: [0, 0, 0], constraintMode: { l: "hard", a: "hard", b: "hard" },
  nColsToAdd: 1, colorblindSafe: true, colorblindWeights: { none: 1 }, distanceMetric: "lab76", cvdModel: "machado2009" };
test("wide-gamut red cannot claim separation from its identical exported hex", () => {
  for (const clipToGamutOpt of [false, true]) {
    const prep = prepareData(["#FF0000"], "oklab", { ...config, gamutPreset: "display-p3", clipToGamutOpt });
    const raw = convertColorValues(GAMUTS["display-p3"].toXYZ(1, 0, 0), "xyz", "oklab");
    const norm = normalizeWithRange(raw, prep.ranges, "oklab");
    const info = objectiveInfo(["l", "a", "b"].map((ch) => Math.log(norm[ch] / (1 - norm[ch]))), prep);
    assert.equal(info.newHex[0], "#FF0000");
    close(info.distance, 0, 1e-8);
  }
});

test("all metrics score the exported palette in the same CVD basis across gamut presets", () => {
  for (const distanceMetric of ["de2000", "lab76", "oklab76", "cam02ucs", "cam16ucs", "deitp"]) {
    for (const cvdModel of ["legacy", "machado2009"]) {
      for (const state of ["none", "deutan", "protan", "tritan"]) {
        for (const gamutPreset of ["srgb", "display-p3", "rec2020"]) {
          const prep = prepareData(["#FF0000"], "oklab", { ...config, gamutPreset, distanceMetric, cvdModel,
            colorblindWeights: { [state]: 1 }, clipToGamutOpt: true });
          const info = objectiveInfo([0, 0, 0], prep);
          const expected = distanceBetweenCoords(
            coordsFromHexForDistanceMetric("#FF0000", distanceMetric, state, cvdModel),
            coordsFromHexForDistanceMetric(info.newHex[0], distanceMetric, state, cvdModel), distanceMetric);
          close(info.distance, expected);
        }
      }
    }
  }
});

test("soft lightness penalties follow decoded colors, not ordered increments", () => {
  const prep = prepareData([], "oklab", { ...config, nColsToAdd: 2,
    constraintMode: { l: "soft", a: "hard", b: "hard" }, explicitBounds: { l: [0.4, 0.6] } });
  const info = objectiveInfo([0, 0, 0, 0, 0, 0], prep);
  close(info.optimizerRaw[0].l, 0.5);
  close(info.optimizerRaw[1].l, 1 / (1 + Math.exp(-1)));
  close(info.details[0].constraintPenalty, 0);
  assert.ok(info.details[1].constraintPenalty > 1);
  close(info.details[1].total, info.details[1].distance - info.details[1].penalty);
  const single = prepareData([], "oklab", { ...config, constraintMode: { l: "soft", a: "hard", b: "hard" }, explicitBounds: { l: [0.4, 0.6] } });
  close(info.details[1].constraintPenalty, objectiveInfo([1, 0, 0], single).constraintPenalty);
});

test("invalid scoring inputs fail instead of becoming black or zero distance", () => {
  const prep = prepareData([], "oklab", config);
  for (const params of [[0, 0], [0, NaN, 0], [Infinity, 0, 0]]) {
    assert.throws(() => objectiveInfo(params, prep), /parameters/);
  }
  assert.throws(() => coordsFromHexForDistanceMetric("invalid", "de2000"), /hex color/);
  assert.throws(() => distanceBetweenCoords({ l: NaN, a: 0, b: 0 }, { l: 0, a: 0, b: 0 }, "lab76"), /finite/);
});
