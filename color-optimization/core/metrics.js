import { hexToRgb } from "./colorSpaces.js";

export function deltaE2000(lab1, lab2) {
  const L1 = lab1.l;
  const a1 = lab1.a;
  const b1 = lab1.b;
  const L2 = lab2.l;
  const a2 = lab2.a;
  const b2 = lab2.b;

  const kL = 1;
  const kC = 1;
  const kH = 1;
  const rad = (deg) => (deg * Math.PI) / 180;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const Cbarp = (C1p + C2p) / 2;

  const h1pDeg = (Math.atan2(b1, a1p) * 180) / Math.PI + 360;
  const h2pDeg = (Math.atan2(b2, a2p) * 180) / Math.PI + 360;
  const h1 = h1pDeg % 360;
  const h2 = h2pDeg % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let hDiff = 0;
  if (C1p * C2p !== 0) {
    if (Math.abs(h2 - h1) <= 180) {
      hDiff = h2 - h1;
    } else if (h2 <= h1) {
      hDiff = h2 - h1 + 360;
    } else {
      hDiff = h2 - h1 - 360;
    }
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(hDiff) / 2);

  let hbarp = 0;
  if (C1p * C2p === 0) {
    hbarp = h1 + h2;
  } else if (Math.abs(h1 - h2) <= 180) {
    hbarp = (h1 + h2) / 2;
  } else if (h1 + h2 < 360) {
    hbarp = (h1 + h2 + 360) / 2;
  } else {
    hbarp = (h1 + h2 - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));
  const Lbarp = (L1 + L2) / 2;
  const Sl =
    1 +
    (0.015 * Math.pow(Lbarp - 50, 2)) /
      Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const deltaTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
  const Rt = -Rc * Math.sin(rad(deltaTheta));

  const termL = dLp / (kL * Sl);
  const termC = dCp / (kC * Sc);
  const termH = dHp / (kH * Sh);
  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH);
}

export function relativeLuminance(rgb) {
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastColor(hex) {
  const lum = relativeLuminance(hexToRgb(hex));
  return lum > 0.5 ? "#111827" : "#f8fafc";
}
