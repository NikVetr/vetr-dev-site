import test from "node:test";
import { strict as assert } from "node:assert";

import { toLinear, toSrgb } from "../core/util.js";
import { getMachadoMatrix } from "../core/cvdMachado.js";
import { applyCvdLinear, simulateCvdHex, simulateCvdRgb } from "../core/cvd.js";
import { applyCvdLinear as applyCvdLinearOld } from "../core/cvd_old.js";

function assertClose(actual, expected, eps = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= eps, `Expected ${actual} ≈ ${expected}`);
}

test("sRGB transfer functions round-trip on key values", () => {
  const xs = [0, 0.04045, 0.5, 1];
  xs.forEach((x) => {
    const lin = toLinear(x);
    const back = toSrgb(lin);
    assert.ok(Number.isFinite(lin));
    assert.ok(Number.isFinite(back));
    assertClose(back, x, 2e-7);
  });

  // Edge thresholds
  assertClose(toLinear(0.04045), 0.04045 / 12.92, 1e-12);
  assertClose(toSrgb(0.0031308), 12.92 * 0.0031308, 1e-12);
});

test("getMachadoMatrix endpoints", () => {
  const m0 = getMachadoMatrix("protan", 0);
  assert.ok(m0);
  assertClose(m0[0], 1);
  assertClose(m0[4], 1);
  assertClose(m0[8], 1);

  const m1 = getMachadoMatrix("protan", 1);
  assert.ok(m1);
  assertClose(m1[0], 0.152286, 1e-6);
});

test("simulateCvdRgb returns finite uint8 channels", () => {
  const out = simulateCvdRgb({ r: 12, g: 34, b: 56 }, { type: "deutan", severity: 0.7 });
  ["r", "g", "b"].forEach((k) => {
    assert.ok(Number.isFinite(out[k]));
    assert.ok(out[k] >= 0 && out[k] <= 255);
  });
});

test("legacy mode matches historical outputs for a small fixture", () => {
  const cases = [
    { hex: "#FF0000", type: "deutan", out: "#9FB300" },
    { hex: "#00FF00", type: "deutan", out: "#604D4D" },
    { hex: "#0000FF", type: "deutan", out: "#0000B3" },
    { hex: "#FF0000", type: "protan", out: "#918E00" },
    { hex: "#00FF00", type: "protan", out: "#6E713E" },
    { hex: "#0000FF", type: "protan", out: "#0000C1" },
    { hex: "#FF0000", type: "tritan", out: "#F20000" },
    { hex: "#00FF00", type: "tritan", out: "#0D6E79" },
    { hex: "#0000FF", type: "tritan", out: "#009186" },
    { hex: "#123456", type: "deutan", out: "#1F1C4C" },
    { hex: "#123456", type: "protan", out: "#21214E" },
    { hex: "#123456", type: "tritan", out: "#144746" },
  ];
  cases.forEach(({ hex, type, out }) => {
    assert.equal(simulateCvdHex(hex, { type, model: "legacy", severity: 1 }), out);
  });
});

test("legacy applyCvdLinear matches old direct-matrix behavior", () => {
  const samples = [
    { r: 0.1, g: 0.2, b: 0.3 },
    { r: -0.2, g: 1.5, b: 0.0 },
    { r: 0.0, g: 0.0, b: 0.0 },
    { r: 1.0, g: 1.0, b: 1.0 },
  ];
  const types = ["deutan", "protan", "tritan"];
  for (const t of types) {
    for (const s of samples) {
      const a = applyCvdLinear(s, t, 1, "legacy");
      const b = applyCvdLinearOld(s, t);
      assertClose(a.r, b.r, 1e-10);
      assertClose(a.g, b.g, 1e-10);
      assertClose(a.b, b.b, 1e-10);
    }
  }
});
