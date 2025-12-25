import test from "node:test";
import { strict as assert } from "node:assert";

import { rgbToXyz, hexToRgb } from "../core/colorSpaces.js";
import { coordsFromXyzForDistanceMetric, distanceBetweenCoords } from "../core/distance.js";

test("New distance metrics produce finite distances", () => {
  const xyz1 = rgbToXyz(hexToRgb("#FF0000"));
  const xyz2 = rgbToXyz(hexToRgb("#00FF00"));

  const metrics = ["cam02ucs", "cam16ucs", "deitp"];
  metrics.forEach((m) => {
    const a = coordsFromXyzForDistanceMetric(xyz1, m);
    const b = coordsFromXyzForDistanceMetric(xyz2, m);
    const d = distanceBetweenCoords(a, b, m);
    assert.ok(Number.isFinite(d), `Expected finite distance for ${m}, got ${d}`);
    assert.ok(d >= 0, `Expected non-negative distance for ${m}, got ${d}`);
  });
});

