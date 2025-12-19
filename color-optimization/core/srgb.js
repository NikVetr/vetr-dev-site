import { clamp, toLinear, toSrgb } from "./util.js";

// Explicit sRGB transfer helpers (IEC 61966-2-1).
export function srgbToLinear01(x) {
  return toLinear(clamp(x, 0, 1));
}

export function linearToSrgb01(x) {
  // Clamp before EOTF inverse to avoid NaNs on negative numbers.
  return toSrgb(clamp(x, 0, 1));
}

export function srgb8ToLinear01(u8) {
  const x = clamp((u8 || 0) / 255, 0, 1);
  return toLinear(x);
}

export function linear01ToSrgb8(x) {
  const y = toSrgb(clamp(x, 0, 1));
  return Math.max(0, Math.min(255, Math.round(y * 255)));
}

