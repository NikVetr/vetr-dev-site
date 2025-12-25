import { clamp } from "./util.js";

// CAM02-UCS (Luo et al. 2006) and CAM16-UCS (Li et al. 2017).
//
// Implementation notes:
// - We implement the forward appearance model to obtain J (lightness), M (colourfulness), and h (hue angle),
//   then apply the Luo 2006 UCS mapping (J', a', b') with coefficients for "CAM02-UCS".
// - Viewing conditions are fixed to a reasonable sRGB-like default to keep this fast and dependency-free.
//
// References (see `citations.txt`):
// - Luo, Cui, Li (2006) CAM02-UCS
// - Li et al. (2017) CAM16-UCS / CAT16
// - Fairchild (CIECAM02 / CAM16 structure)

const D65_XYZ_1 = { x: 0.95047, y: 1, z: 1.08883 };
const D65_XYZ_100 = { x: 95.047, y: 100, z: 108.883 };

// Fixed viewing conditions: "Average" surround, ~sRGB-like.
const SURROUND_AVG = { F: 1.0, c: 0.69, Nc: 1.0 };
const DEFAULT_LA = 64; // cd/m^2 (approximate)
const DEFAULT_YB = 20; // relative (Y_b, 0..100)

// CAT matrices (from colour-science/colour datasets).
const CAT02 = [
  [0.7328, 0.4296, -0.1624],
  [-0.7036, 1.6975, 0.0061],
  [0.0030, 0.0136, 0.9834],
];

const CAT16 = [
  [0.401288, 0.650173, -0.051461],
  [-0.250268, 1.204414, 0.045854],
  [-0.002079, 0.048952, 0.953127],
];

const CAT02_INV = [
  [1.096123820835514, -0.2788690002182872, 0.182745179382773],
  [0.454369041975359, 0.473533154307412, 0.0720978037172291],
  [-0.00962760873842935, -0.00569803121611342, 1.015325639954543],
];

const CAT16_INV = [
  [1.8620678550872327, -1.0112546305316843, 0.14918677544445165],
  [0.3875265432361372, 0.6214474419314753, -0.008973985167612518],
  [-0.015841498849282322, -0.03412293802851557, 1.0499644368777978],
];

// Hunt-Pointer-Estevez matrix used for post-adaptation response compression.
const HPE = [
  [0.38971, 0.68898, -0.07868],
  [-0.22981, 1.1834, 0.04641],
  [0, 0, 1],
];

function mul3(m, x, y, z) {
  return {
    x: m[0][0] * x + m[0][1] * y + m[0][2] * z,
    y: m[1][0] * x + m[1][1] * y + m[1][2] * z,
    z: m[2][0] * x + m[2][1] * y + m[2][2] * z,
  };
}

function signPow(x, p) {
  const ax = Math.abs(x);
  if (ax === 0) return 0;
  return Math.sign(x) * Math.pow(ax, p);
}

function degreeOfAdaptation(F, LA) {
  // CIECAM02 / CAM16 common formula.
  const d = F * (1 - (1 / 3.6) * Math.exp(-(LA + 42) / 92));
  return clamp(d, 0, 1);
}

function viewingDependentParams(Yb, Yw, LA) {
  const n = (Yb || 0) / Math.max(Yw || 1, 1e-9);
  const k = 1 / (5 * LA + 1);
  const k4 = k * k * k * k;
  const FL =
    0.2 * k4 * (5 * LA) +
    0.1 * (1 - k4) * (1 - k4) * Math.pow(5 * LA, 1 / 3);
  const Nbb = 0.725 * Math.pow(1 / Math.max(n, 1e-9), 0.2);
  const Ncb = Nbb;
  const z = 1.48 + Math.sqrt(Math.max(n, 0));
  return { n, FL, Nbb, Ncb, z };
}

function postAdaptResponse(RGBp, FL) {
  // Post-adaptation non-linear response compression forward.
  // Fairchild / CIECAM02: Eq. 11.
  const f = (v) => {
    const t = signPow((FL * v) / 100, 0.42);
    const num = 400 * t;
    const den = Math.abs(t) + 27.13;
    const out = den !== 0 ? num / den : 0;
    return out + 0.1;
  };
  return { r: f(RGBp.x), g: f(RGBp.y), b: f(RGBp.z) };
}

function opponentAB(Ra, Ga, Ba) {
  // Eq. 12
  const a = Ra - (12 * Ga) / 11 + Ba / 11;
  const b = (Ra + Ga - 2 * Ba) / 9;
  return { a, b };
}

function hueAngleDeg(a, b) {
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

function eccentricityFactor(hDeg) {
  const hr = (hDeg * Math.PI) / 180;
  return 0.25 * (Math.cos(hr + 2) + 3.8);
}

function xyz100ToJmh(xyz100, variant = "cam02", conditions = null) {
  const vc = conditions || {
    XYZ_w: D65_XYZ_100,
    LA: DEFAULT_LA,
    Yb: DEFAULT_YB,
    surround: SURROUND_AVG,
    discountIlluminant: false,
  };
  const { XYZ_w, LA, Yb, surround, discountIlluminant } = vc;
  const cat = variant === "cam16" ? CAT16 : CAT02;
  const catInv = variant === "cam16" ? CAT16_INV : CAT02_INV;
  const D = discountIlluminant ? 1 : degreeOfAdaptation(surround.F, LA);
  const { n, FL, Nbb, Ncb, z } = viewingDependentParams(Yb, XYZ_w.y, LA);

  // Cone responses.
  const RGB = mul3(cat, xyz100.x, xyz100.y, xyz100.z);
  const RGBw = mul3(cat, XYZ_w.x, XYZ_w.y, XYZ_w.z);

  const scale = {
    r: D * (XYZ_w.y / Math.max(RGBw.x, 1e-9)) + 1 - D,
    g: D * (XYZ_w.y / Math.max(RGBw.y, 1e-9)) + 1 - D,
    b: D * (XYZ_w.y / Math.max(RGBw.z, 1e-9)) + 1 - D,
  };
  const RGBc = { x: scale.r * RGB.x, y: scale.g * RGB.y, z: scale.b * RGB.z };
  const RGBcw = { x: scale.r * RGBw.x, y: scale.g * RGBw.y, z: scale.b * RGBw.z };

  // Convert to Hunt-Pointer-Estevez space using HPE * CAT^-1.
  const tmp1 = mul3(catInv, RGBc.x, RGBc.y, RGBc.z);
  const tmp2 = mul3(catInv, RGBcw.x, RGBcw.y, RGBcw.z);
  const HPE_RGBc = mul3(HPE, tmp1.x, tmp1.y, tmp1.z);
  const HPE_RGBcw = mul3(HPE, tmp2.x, tmp2.y, tmp2.z);

  const RGBa = postAdaptResponse(HPE_RGBc, FL);
  const RGBaw = postAdaptResponse(HPE_RGBcw, FL);

  const Aw = (2 * RGBaw.r + RGBaw.g + 0.05 * RGBaw.b - 0.305) * Nbb;
  const A = (2 * RGBa.r + RGBa.g + 0.05 * RGBa.b - 0.305) * Nbb;

  const J = 100 * Math.pow(Math.max(A / Math.max(Aw, 1e-9), 0), surround.c * z);

  const { a, b } = opponentAB(RGBa.r, RGBa.g, RGBa.b);
  const h = hueAngleDeg(a, b);
  const et = eccentricityFactor(h);

  const tDen = RGBa.r + RGBa.g + (21 / 20) * RGBa.b;
  const t =
    (50000 / 13) *
    surround.Nc *
    Ncb *
    et *
    (Math.hypot(a, b) / Math.max(tDen, 1e-9));

  const C =
    Math.pow(Math.max(t, 0), 0.9) *
    Math.sqrt(J / 100) *
    Math.pow(1.64 - Math.pow(0.29, n), 0.73);

  const M = C * Math.pow(FL, 0.25);

  return { J, M, h };
}

function jmhToUcs({ J, M, h }) {
  const c1 = 0.007;
  const c2 = 0.0228;
  const Jp = ((1 + 100 * c1) * J) / (1 + c1 * J);
  const Mp = (1 / c2) * Math.log1p(c2 * M);
  const hr = (h * Math.PI) / 180;
  return { l: Jp, a: Mp * Math.cos(hr), b: Mp * Math.sin(hr) };
}

export function xyzToCam02Ucs(xyz, conditions = null) {
  const xyz100 = { x: xyz.x * 100, y: xyz.y * 100, z: xyz.z * 100 };
  const jmh = xyz100ToJmh(xyz100, "cam02", conditions);
  return jmhToUcs(jmh);
}

export function xyzToCam16Ucs(xyz, conditions = null) {
  const xyz100 = { x: xyz.x * 100, y: xyz.y * 100, z: xyz.z * 100 };
  const jmh = xyz100ToJmh(xyz100, "cam16", conditions);
  return jmhToUcs(jmh);
}
