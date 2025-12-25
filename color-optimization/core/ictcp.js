import { clamp } from "./util.js";
import { GAMUTS } from "./colorSpaces.js";

// ICtCp encoding (Dolby 2016 / ITU-R BT.2100 PQ matrix variant).
// Used for ΔE_ITP (ITU-R BT.2124).
//
// References (see `citations.txt`):
// - Dolby (2016) ICtCp white paper
// - ITU-R BT.2100 (ICtCp definition)
// - ITU-R BT.2124 (ΔE_ITP definition)
// - colour-science/colour matrices for ICTCP

const M_RGB_TO_LMS = [
  [1688 / 4096, 2146 / 4096, 262 / 4096],
  [683 / 4096, 2951 / 4096, 462 / 4096],
  [99 / 4096, 309 / 4096, 3688 / 4096],
];

const M_LMS_P_TO_ICTCP = [
  [2048 / 4096, 2048 / 4096, 0],
  [6610 / 4096, -13613 / 4096, 7003 / 4096],
  [17933 / 4096, -17390 / 4096, -543 / 4096],
];

// SMPTE ST 2084 (PQ) inverse EOTF: absolute luminance -> non-linear code.
// We treat 1.0 in linear RGB as the peak luminance Lp.
const PQ_M1 = 2610 / 16384;
const PQ_M2 = 2523 / 32;
const PQ_C1 = 3424 / 4096;
const PQ_C2 = 2413 / 128;
const PQ_C3 = 2392 / 128;

function mul3(m, x, y, z) {
  return {
    x: m[0][0] * x + m[0][1] * y + m[0][2] * z,
    y: m[1][0] * x + m[1][1] * y + m[1][2] * z,
    z: m[2][0] * x + m[2][1] * y + m[2][2] * z,
  };
}

function pqEncodeRelative(v, Lp = 10000) {
  // v is relative [0..1] mapping to [0..Lp] cd/m^2.
  const x = clamp(v, 0, 1);
  const p = Math.pow(x, PQ_M1);
  const num = PQ_C1 + PQ_C2 * p;
  const den = 1 + PQ_C3 * p;
  const frac = den !== 0 ? num / den : 0;
  return Math.pow(frac, PQ_M2);
}

export function linearRec2020ToICtCp({ r, g, b }, Lp = 10000) {
  // Clamp for stability: ICtCp is defined for display-referred signals.
  const rr = clamp(r, 0, 1);
  const gg = clamp(g, 0, 1);
  const bb = clamp(b, 0, 1);

  const lms = mul3(M_RGB_TO_LMS, rr, gg, bb);
  const lmsP = {
    x: pqEncodeRelative(lms.x, Lp),
    y: pqEncodeRelative(lms.y, Lp),
    z: pqEncodeRelative(lms.z, Lp),
  };
  const ictcp = mul3(M_LMS_P_TO_ICTCP, lmsP.x, lmsP.y, lmsP.z);
  return { i: ictcp.x, t: ictcp.y, p: ictcp.z };
}

export function xyzToICtCp(xyz, Lp = 10000) {
  const gamut = GAMUTS["rec2020"] || GAMUTS["srgb"];
  const lin = gamut.fromXYZ(xyz.x, xyz.y, xyz.z);
  return linearRec2020ToICtCp(lin, Lp);
}

