import test from "node:test";
import { strict as assert } from "node:assert";
import {
  convertColorValues,
  GAMUTS,
  hslToRgb,
  labToXyz,
  oklabToSrgb,
  rgbToHex,
  rgbToXyz,
  srgbToOklab,
  xyzToRgb,
} from "../core/colorSpaces.js";

const EPSILON = 1e-4;

function assertColorClose(actual, expected, epsilon = EPSILON) {
  Object.keys(expected).forEach((channel) => {
    const diff = Math.abs(actual[channel] - expected[channel]);
    assert.ok(
      diff <= epsilon,
      `Expected ${channel} within ${epsilon} (got ${actual[channel]}, expected ${expected[channel]})`
    );
  });
}

test("oklab round-trips through XYZ via existing sRGB bridge", () => {
  const original = { l: 0.6, a: 0.1, b: -0.05 };

  // Use the current OKLab <-> sRGB converters and the XYZ bridge.
  const xyz = rgbToXyz(oklabToSrgb(original));
  const roundTripped = srgbToOklab(xyzToRgb(xyz));

  assertColorClose(roundTripped, original, EPSILON);
});

test("lab -> xyz -> rgb produces a valid hex string", () => {
  const lab = { l: 50, a: 0, b: 0 };
  const xyz = labToXyz(lab);
  const rgb = xyzToRgb(xyz);
  const hex = rgbToHex(rgb);

  Object.values(rgb).forEach((component) => {
    assert.ok(
      component >= 0 && component <= 1,
      `RGB component out of range: ${component}`
    );
  });

  assert.match(hex, /^#[0-9A-F]{6}$/);
  assert.equal(hex, "#777777");
});

test("hslToRgb handles boundary HSL values", () => {
  const cases = [
    {
      label: "hue 0 stays red",
      input: { h: 0, s: 100, l: 50 },
      expected: { r: 1, g: 0, b: 0 },
    },
    {
      label: "hue 360 wraps to hue 0",
      input: { h: 360, s: 100, l: 50 },
      expected: { r: 1, g: 0, b: 0 },
    },
    {
      label: "saturation 0 flattens to grey",
      input: { h: 120, s: 0, l: 50 },
      expected: { r: 0.5, g: 0.5, b: 0.5 },
    },
    {
      label: "lightness 100 yields white",
      input: { h: 40, s: 100, l: 100 },
      expected: { r: 1, g: 1, b: 1 },
    },
    {
      label: "lightness 0 yields black",
      input: { h: 200, s: 100, l: 0 },
      expected: { r: 0, g: 0, b: 0 },
    },
  ];

  cases.forEach(({ label, input, expected }) => {
    const result = hslToRgb(input);
    assertColorClose(result, expected, 1e-6);
  });
});

test("convertColorValues preserves out-of-sRGB OKLab via Lab round-trip", () => {
  const original = { l: 0.5, a: 0.5, b: 0.5 }; // intentionally wide-gamut

  const asLab = convertColorValues(original, "oklab", "lab");
  const backToOklab = convertColorValues(asLab, "lab", "oklab");

  assertColorClose(backToOklab, original, 1e-6);
});

test("Display P3 pure red converts to finite XYZ via GAMUTS matrix", () => {
  const xyz = GAMUTS["display-p3"].toXYZ(1, 0, 0);

  Object.values(xyz).forEach((v) => {
    assert.ok(Number.isFinite(v), `Expected finite value, got ${v}`);
  });
});
