import { deltaE2000 } from "./metrics.js";
import { hexToRgb, rgbToXyz, xyzToLab, xyzToOklab } from "./colorSpaces.js";
import { applyCvdHex } from "./cvd.js";
import { xyzToCam02Ucs, xyzToCam16Ucs } from "./camUcs.js";
import { xyzToICtCp } from "./ictcp.js";

export function coordsFromXyzForDistanceMetric(xyz, metric) {
  const m = (metric || "de2000").toLowerCase();
  if (m === "oklab76") return xyzToOklab(xyz);
  if (m === "cam02ucs") return xyzToCam02Ucs(xyz);
  if (m === "cam16ucs") return xyzToCam16Ucs(xyz);
  if (m === "deitp") {
    // Exported palettes are SDR sRGB; use an explicit 100 cd/m² reference white.
    const { i, t, p } = xyzToICtCp(xyz, 100);
    return { l: i, a: t, b: p };
  }
  // de2000 + lab76 default
  return xyzToLab(xyz);
}

// Score the same quantized sRGB colors and CVD previews that users can export/view.
export function coordsFromHexForDistanceMetric(hex, metric, state = "none", cvdModel = "machado2009") {
  if (typeof hex !== "string" || !/^#?[0-9a-f]{6}$/i.test(hex)) {
    throw new Error("Distance input must be a six-digit sRGB hex color.");
  }
  const simulated = applyCvdHex(hex, state, 1, cvdModel);
  return coordsFromXyzForDistanceMetric(rgbToXyz(hexToRgb(simulated)), metric);
}

export function distanceBetweenCoords(a, b, metric) {
  if (![a?.l, a?.a, a?.b, b?.l, b?.a, b?.b].every(Number.isFinite)) {
    throw new Error("Distance coordinates must be finite.");
  }
  const m = (metric || "de2000").toLowerCase();
  if (m === "de2000") return deltaE2000(a, b);
  if (m === "deitp") {
    const dI = a.l - b.l;
    const dT = (a.a - b.a) * 0.5;
    const dP = a.b - b.b;
    return 720 * Math.hypot(dI, dT, dP);
  }
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.hypot(dl, da, db);
}
