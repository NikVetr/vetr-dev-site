import { hexToRgb, rgbToHex } from "./colorSpaces.js";
import { clamp } from "./util.js";

export const cvdMatrices = {
  deutan: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  protan: [
    [0.56667, 0.43333, 0],
    [0.55833, 0.44167, 0],
    [0, 0.24167, 0.75833],
  ],
  tritan: [
    [0.95, 0.05, 0],
    [0, 0.43333, 0.56667],
    [0, 0.475, 0.525],
  ],
};

export function applyCvdRgb(rgb, type) {
  const m = cvdMatrices[type];
  if (!m) return rgb;
  const r = clamp(rgb.r);
  const g = clamp(rgb.g);
  const b = clamp(rgb.b);
  const sim = applyCvdLinear({ r, g, b }, type);
  return {
    r: clamp(sim.r),
    g: clamp(sim.g),
    b: clamp(sim.b),
  };
}

export function applyCvdHex(hex, type) {
  if (type === "none") return hex;
  const rgb = hexToRgb(hex);
  const sim = applyCvdRgb(rgb, type);
  return rgbToHex(sim);
}

export function applyCvdLinear(rgb, type) {
  const m = cvdMatrices[type];
  if (!m) return rgb;
  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;
  return {
    r: m[0][0] * r + m[0][1] * g + m[0][2] * b,
    g: m[1][0] * r + m[1][1] * g + m[1][2] * b,
    b: m[2][0] * r + m[2][1] * g + m[2][2] * b,
  };
}
