import { hexToRgb, rgbToHex } from "./colorSpaces.js";
import { clamp } from "./util.js";
import { srgb8ToLinear01, linear01ToSrgb8, srgbToLinear01, linearToSrgb01 } from "./srgb.js";
import { getMachadoMatrix } from "./cvdMachado.js";

// Legacy (gamma-encoded) RGB mixing matrices (HCIRN / Vischeck-style).
// Kept for comparison/testing, and exposed via model: "legacy".
export const legacyMatrices = {
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

let debugCvd = false;
export function setCvdDebug(flag) {
  debugCvd = Boolean(flag);
}

function clamp01(x) {
  return clamp(x, 0, 1);
}

function clampSeverity01(severity) {
  if (!Number.isFinite(severity)) return 1;
  return clamp(severity, 0, 1);
}

function normalizeType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "none") return "none";
  if (t === "protan" || t === "protanomaly" || t === "protanopia") return "protan";
  if (t === "deutan" || t === "deuteranomaly" || t === "deuteranopia") return "deutan";
  if (t === "tritan" || t === "tritanomaly" || t === "tritanopia") return "tritan";
  return t;
}

function defaultModelForType(type) {
  const t = normalizeType(type);
  if (t === "tritan") return "machado2009"; // placeholder for future brettel1997
  return "machado2009";
}

function mul3x3(m, r, g, b) {
  const r2 = m[0] * r + m[1] * g + m[2] * b;
  const g2 = m[3] * r + m[4] * g + m[5] * b;
  const b2 = m[6] * r + m[7] * g + m[8] * b;
  return [r2, g2, b2];
}

function mulLegacy(m, r, g, b) {
  const r2 = m[0][0] * r + m[0][1] * g + m[0][2] * b;
  const g2 = m[1][0] * r + m[1][1] * g + m[1][2] * b;
  const b2 = m[2][0] * r + m[2][1] * g + m[2][2] * b;
  return [r2, g2, b2];
}

function applyMachadoLinearRgb(rLin, gLin, bLin, type, severity01) {
  const m = getMachadoMatrix(type, severity01);
  if (!m) return [rLin, gLin, bLin];
  return mul3x3(m, rLin, gLin, bLin);
}

function applyLegacySrgb01(r, g, b, type, severity01) {
  const m = legacyMatrices[type];
  if (!m) return [r, g, b];
  const sev = clampSeverity01(severity01);
  if (sev <= 0) return [r, g, b];
  if (sev >= 1) return mulLegacy(m, r, g, b);
  const [r2, g2, b2] = mulLegacy(m, r, g, b);
  return [r * (1 - sev) + r2 * sev, g * (1 - sev) + g2 * sev, b * (1 - sev) + b2 * sev];
}

function applyLinearModel(rLin, gLin, bLin, type, severity01, model) {
  const t = normalizeType(type);
  if (t === "none") return [rLin, gLin, bLin];
  const m = model || defaultModelForType(t);
  if (m === "legacy") {
    // Legacy operates in gamma space; caller should avoid using this in linear pipeline.
    return [rLin, gLin, bLin];
  }
  if (m === "machado2009") {
    return applyMachadoLinearRgb(rLin, gLin, bLin, t, severity01);
  }
  // Placeholder for brettel1997 tritan in the future.
  return applyMachadoLinearRgb(rLin, gLin, bLin, t, severity01);
}

// Public API (hex + rgb + ImageData)
export function simulateCvdHex(hex, { type, severity = 1, model } = {}) {
  const t = normalizeType(type);
  if (t === "none") {
    if (typeof hex !== "string") return "#000000";
    const m = hex.match(/#?[0-9a-fA-F]{6}/);
    if (!m) return "#000000";
    const clean = m[0].startsWith("#") ? m[0].toUpperCase() : `#${m[0].toUpperCase()}`;
    return clean;
  }
  if (typeof hex !== "string") return "#000000";
  const rgb01 = hexToRgb(hex);
  const out01 = simulateCvdRgb01(rgb01, { type: t, severity, model });
  return rgbToHex(out01);
}

// Accepts {r,g,b} in either 0..255 or 0..1; returns uint8 0..255.
export function simulateCvdRgb(rgb, { type, severity = 1, model } = {}) {
  const t = normalizeType(type);
  if (!rgb || typeof rgb !== "object") return { r: 0, g: 0, b: 0 };
  const rIn = Number(rgb.r);
  const gIn = Number(rgb.g);
  const bIn = Number(rgb.b);
  const maxIn = Math.max(rIn, gIn, bIn);
  const is01 = maxIn <= 1.00001;
  const r01 = clamp01(is01 ? rIn : rIn / 255);
  const g01 = clamp01(is01 ? gIn : gIn / 255);
  const b01 = clamp01(is01 ? bIn : bIn / 255);
  const out01 = simulateCvdRgb01({ r: r01, g: g01, b: b01 }, { type: t, severity, model });
  return {
    r: Math.max(0, Math.min(255, Math.round(out01.r * 255))),
    g: Math.max(0, Math.min(255, Math.round(out01.g * 255))),
    b: Math.max(0, Math.min(255, Math.round(out01.b * 255))),
  };
}

export function simulateCvdImageData(imageData, { type, severity = 1, model } = {}) {
  const t = normalizeType(type);
  if (!imageData || !imageData.data) return imageData;
  const data = imageData.data;
  const sev = clampSeverity01(severity);
  const m = model || defaultModelForType(t);

  if (t === "none" || sev <= 0) return imageData;

  if (m === "legacy") {
    const mat = legacyMatrices[t];
    if (!mat) return imageData;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const [r2, g2, b2] = applyLegacySrgb01(r, g, b, t, sev);
      data[i] = Math.max(0, Math.min(255, Math.round(clamp01(r2) * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(clamp01(g2) * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(clamp01(b2) * 255)));
    }
    return imageData;
  }

  const mat = getMachadoMatrix(t, sev);
  if (!mat) return imageData;
  for (let i = 0; i < data.length; i += 4) {
    const rLin = srgb8ToLinear01(data[i]);
    const gLin = srgb8ToLinear01(data[i + 1]);
    const bLin = srgb8ToLinear01(data[i + 2]);
    const r2 = mat[0] * rLin + mat[1] * gLin + mat[2] * bLin;
    const g2 = mat[3] * rLin + mat[4] * gLin + mat[5] * bLin;
    const b2 = mat[6] * rLin + mat[7] * gLin + mat[8] * bLin;
    data[i] = linear01ToSrgb8(r2);
    data[i + 1] = linear01ToSrgb8(g2);
    data[i + 2] = linear01ToSrgb8(b2);
  }
  return imageData;
}

function simulateCvdRgb01(rgb01, { type, severity, model } = {}) {
  const t = normalizeType(type);
  const sev = clampSeverity01(severity);
  if (t === "none" || sev <= 0) return rgb01;
  const m = model || defaultModelForType(t);

  if (m === "legacy") {
    const [r2, g2, b2] = applyLegacySrgb01(rgb01.r, rgb01.g, rgb01.b, t, sev);
    return { r: clamp01(r2), g: clamp01(g2), b: clamp01(b2) };
  }

  const rLin = srgbToLinear01(rgb01.r);
  const gLin = srgbToLinear01(rgb01.g);
  const bLin = srgbToLinear01(rgb01.b);
  const [r2Lin, g2Lin, b2Lin] = applyLinearModel(rLin, gLin, bLin, t, sev, m);
  const out = {
    r: clamp01(linearToSrgb01(r2Lin)),
    g: clamp01(linearToSrgb01(g2Lin)),
    b: clamp01(linearToSrgb01(b2Lin)),
  };
  if (debugCvd) {
    // eslint-disable-next-line no-console
    console.debug("CVD", { type: t, severity: sev, model: m, in: rgb01, out });
  }
  return out;
}

// Back-compat wrappers (existing call sites)
export function applyCvdRgb(rgb, type, severity = 1, model) {
  const t = normalizeType(type);
  if (t === "none") return rgb;
  const r = clamp01(rgb?.r);
  const g = clamp01(rgb?.g);
  const b = clamp01(rgb?.b);
  const out = simulateCvdRgb01({ r, g, b }, { type: t, severity, model });
  return out;
}

export function applyCvdHex(hex, type, severity = 1, model) {
  // Preserve old "none" behavior: return sanitized uppercase hex string.
  if (type === "none") {
    if (typeof hex !== "string") return "#000000";
    const m = hex.match(/#?[0-9a-fA-F]{6}/);
    if (!m) return "#000000";
    const clean = m[0].startsWith("#") ? m[0].toUpperCase() : `#${m[0].toUpperCase()}`;
    return clean;
  }
  if (typeof hex !== "string") return "#000000";
  return simulateCvdHex(hex, { type, severity, model });
}

// Applies the selected model in *linear* RGB space.
// Used by the optimizer (values may be out of [0,1]; we intentionally do not clamp).
export function applyCvdLinear(rgb, type, severity = 1, model) {
  const t = normalizeType(type);
  if (t === "none") return rgb;
  const sev = clampSeverity01(severity);
  const r = Number(rgb?.r);
  const g = Number(rgb?.g);
  const b = Number(rgb?.b);
  if ((model || defaultModelForType(t)) === "legacy") {
    // Back-compat: the historical code applied the 3×3 "legacy" matrices directly to the input
    // numbers (even when callers passed linear RGB). Keep that exact behavior for optimizer parity.
    const mat = legacyMatrices[t];
    if (!mat) return rgb;
    const [r2, g2, b2] = mulLegacy(mat, r, g, b);
    if (sev >= 1) return { r: r2, g: g2, b: b2 };
    if (sev <= 0) return { r, g, b };
    return { r: r * (1 - sev) + r2 * sev, g: g * (1 - sev) + g2 * sev, b: b * (1 - sev) + b2 * sev };
  }
  const [r2, g2, b2] = applyLinearModel(r, g, b, t, sev, model);
  return { r: r2, g: g2, b: b2 };
}
