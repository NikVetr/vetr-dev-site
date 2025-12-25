import { deltaE2000 } from "./metrics.js";
import { xyzToLab, xyzToOklab } from "./colorSpaces.js";
import { xyzToCam02Ucs, xyzToCam16Ucs } from "./camUcs.js";
import { xyzToICtCp } from "./ictcp.js";

export function coordsFromXyzForDistanceMetric(xyz, metric) {
  const m = (metric || "de2000").toLowerCase();
  if (m === "oklab76") return xyzToOklab(xyz);
  if (m === "cam02ucs") return xyzToCam02Ucs(xyz);
  if (m === "cam16ucs") return xyzToCam16Ucs(xyz);
  if (m === "deitp") {
    const { i, t, p } = xyzToICtCp(xyz);
    return { l: i, a: t, b: p };
  }
  // de2000 + lab76 default
  return xyzToLab(xyz);
}

export function distanceBetweenCoords(a, b, metric) {
  const m = (metric || "de2000").toLowerCase();
  if (m === "de2000") return deltaE2000(a, b);
  if (m === "deitp") {
    const dI = (a.l || 0) - (b.l || 0);
    const dT = ((a.a || 0) - (b.a || 0)) * 0.5;
    const dP = (a.b || 0) - (b.b || 0);
    return 720 * Math.hypot(dI, dT, dP);
  }
  const dl = (a.l || 0) - (b.l || 0);
  const da = (a.a || 0) - (b.a || 0);
  const db = (a.b || 0) - (b.b || 0);
  return Math.hypot(dl, da, db);
}

