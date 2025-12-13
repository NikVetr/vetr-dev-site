import { clamp, toLinear, toSrgb } from "./util.js";

export const channelOrder = {
  hsl: ["h", "s", "l"],
  lab: ["l", "a", "b"],
  lch: ["l", "c", "h"],
  oklab: ["l", "a", "b"],
  oklch: ["l", "c", "h"],
};

export const csRanges = {
  hsl: { min: { h: 0, s: 0, l: 0 }, max: { h: 360, s: 100, l: 100 } },
  lab: { min: { l: 0, a: -128, b: -128 }, max: { l: 100, a: 128, b: 128 } },
  lch: { min: { l: 0, c: 0, h: 0 }, max: { l: 100, c: 150, h: 360 } },
  oklab: { min: { l: 0, a: -0.5, b: -0.5 }, max: { l: 1, a: 0.5, b: 0.5 } },
  oklch: { min: { l: 0, c: 0, h: 0 }, max: { l: 1, c: 0.5, h: 360 } },
};

export const gamutPresets = {
  srgb: { label: "sRGB", scale: 1 },
  "display-p3": { label: "Display P3", scale: 1.1 },
  p3: { label: "Display P3", scale: 1.1 }, // alias
  rec2020: { label: "Rec. 2020", scale: 1.2 },
  ntsc: { label: "NTSC-ish", scale: 1.2 },
};

// Linear RGB <-> XYZ matrices for standard D65 spaces.
export const GAMUTS = {
  "srgb": {
    toXYZ(r, g, b) {
      return linearRgbToXyz({ r, g, b });
    },
    fromXYZ(x, y, z) {
      return xyzToLinearRgb({ x, y, z });
    },
  },
  "display-p3": {
    // CSS Color 4 Display P3 (D65)
    toXYZ(r, g, b) {
      return {
        x: r * 0.4865709486482162 + g * 0.26566769316909306 + b * 0.1982172852343625,
        y: r * 0.2289745640697488 + g * 0.6917385218365064 + b * 0.079286914093745,
        z: r * 0 + g * 0.04511338185890264 + b * 1.043944368900976,
      };
    },
    fromXYZ(x, y, z) {
      return {
        r: x * 2.493496911941425 + y * -0.9313836179191239 + z * -0.402710784450717,
        g: x * -0.8294889695615749 + y * 1.7626640603183463 + z * 0.02362468584194358,
        b: x * 0.03584583024378447 + y * -0.07617238926804182 + z * 0.9568845240076872,
      };
    },
  },
  "rec2020": {
    // ITU-R BT.2020 (D65)
    toXYZ(r, g, b) {
      return {
        x: r * 0.6369580483012914 + g * 0.14461690358620832 + b * 0.1688809751641721,
        y: r * 0.2627002120112671 + g * 0.6779980715188708 + b * 0.05930171646986196,
        z: r * 0 + g * 0.028072693049087428 + b * 1.060985057710791,
      };
    },
    fromXYZ(x, y, z) {
      return {
        r: x * 1.7166511879712674 + y * -0.35567078377639233 + z * -0.25336628137365974,
        g: x * -0.6666843518324892 + y * 1.6164812366349395 + z * 0.01576854581391113,
        b: x * 0.017639857445310783 + y * -0.042770613257808524 + z * 0.9421031212354738,
      };
    },
  },
};

export function rangeFromPreset(space, preset = "srgb") {
  const base = csRanges[space];
  if (!base) return null;
  const scale = gamutPresets[preset]?.scale ?? 1;
  if (!Number.isFinite(scale) || scale === 1) {
    return {
      min: { ...base.min },
      max: { ...base.max },
    };
  }
  const min = {};
  const max = {};
  Object.keys(base.min).forEach((key) => {
    if (key === "h") {
      min[key] = base.min[key];
      max[key] = base.max[key];
      return;
    }
    const center = (base.max[key] + base.min[key]) / 2;
    const half = ((base.max[key] - base.min[key]) / 2) * scale;
    min[key] = center - half;
    max[key] = center + half;
  });
  return { min, max };
}

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export function rgbToHex({ r, g, b }) {
  const toHex = (v) => {
    const clamped = Math.round(clamp(v) * 255).toString(16).padStart(2, "0");
    return clamped;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }) {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) return { r: ll, g: ll, b: ll };
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const tc = [hh + 1 / 3, hh, hh - 1 / 3];
  const rgb = tc.map((t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  });
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

export function rgbToXyz({ r, g, b }) {
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  return linearRgbToXyz({ r: rl, g: gl, b: bl });
}

export function linearRgbToXyz({ r, g, b }) {
  return {
    x: r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    y: r * 0.2126729 + g * 0.7151522 + b * 0.072175,
    z: r * 0.0193339 + g * 0.119192 + b * 0.9503041,
  };
}

export function xyzToRgb({ x, y, z }) {
  const { r, g, b } = xyzToLinearRgb({ x, y, z });
  return {
    r: toSrgb(r),
    g: toSrgb(g),
    b: toSrgb(b),
  };
}

export function xyzToLinearRgb({ x, y, z }) {
  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return {
    r: rl,
    g: gl,
    b: bl,
  };
}

export function xyzToLab({ x, y, z }) {
  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const fx = labFn(x / xn);
  const fy = labFn(y / yn);
  const fz = labFn(z / zn);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToXyz({ l, a, b }) {
  const yn = 1;
  const xn = 0.95047;
  const zn = 1.08883;
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const xr = labInvFn(fx);
  const yr = labInvFn(fy);
  const zr = labInvFn(fz);
  return { x: xr * xn, y: yr * yn, z: zr * zn };
}

export function labToLch({ l, a, b }) {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { l, c, h };
}

export function lchToLab({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(hr), b: c * Math.sin(hr) };
}

export function srgbToOklab({ r, g, b }) {
  return xyzToOklab(rgbToXyz({ r, g, b }));
}

export function oklabToSrgb({ l, a, b }) {
  const srgb = xyzToRgb(oklabToXyz({ l, a, b }));
  return {
    r: srgb.r,
    g: srgb.g,
    b: srgb.b,
  };
}

export function xyzToOklab({ x, y, z }) {
  const l = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
  const m = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
  const s = 0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToXyz({ l, a, b }) {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;
  return {
    x: 1.2270138511035211 * l3 - 0.5577999806518222 * m3 + 0.28125614896646783 * s3,
    y: -0.04058017842328059 * l3 + 1.11225686961683 * m3 - 0.07167667866560119 * s3,
    z: -0.0763812845057069 * l3 - 0.4214819784180127 * m3 + 1.586163220440795 * s3,
  };
}

export function oklabToOklch({ l, a, b }) {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { l, c, h };
}

export function oklchToOklab({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(hr), b: c * Math.sin(hr) };
}

export function convertColorValues(values, fromSpace, toSpace) {
  const src = (fromSpace || "").toLowerCase();
  const dst = (toSpace || "").toLowerCase();
  if (src === dst) return { ...values };

  const toXyz = {
    xyz: (v) => v,
    lab: (v) => labToXyz(v),
    lch: (v) => labToXyz(lchToLab(v)),
    oklab: (v) => oklabToXyz(v),
    oklch: (v) => oklabToXyz(oklchToOklab(v)),
    hsl: (v) => rgbToXyz(hslToRgb(v)),
    rgb: (v) => linearRgbToXyz(v),
  };

  const fromXyz = {
    xyz: (v) => v,
    lab: (v) => xyzToLab(v),
    lch: (v) => labToLch(xyzToLab(v)),
    oklab: (v) => xyzToOklab(v),
    oklch: (v) => oklabToOklch(xyzToOklab(v)),
    hsl: (v) => rgbToHsl(xyzToRgb(v)),
    rgb: (v) => xyzToLinearRgb(v),
  };

  const toXyzFn = toXyz[src];
  const fromXyzFn = fromXyz[dst];

  if (!toXyzFn) {
    throw new Error(`Unsupported source color space: ${fromSpace}`);
  }
  if (!fromXyzFn) {
    throw new Error(`Unsupported target color space: ${toSpace}`);
  }

  const xyz = toXyzFn(values);
  return fromXyzFn(xyz);
}

export function decodeColor(hex, space) {
  const rgb = hexToRgb(hex);
  switch (space) {
    case "hsl":
      return rgbToHsl(rgb);
    case "lab": {
      const xyz = rgbToXyz(rgb);
      return xyzToLab(xyz);
    }
    case "lch": {
      const lab = xyzToLab(rgbToXyz(rgb));
      return labToLch(lab);
    }
    case "oklab":
      return srgbToOklab(rgb);
    case "oklch": {
      const lab = srgbToOklab(rgb);
      const hRaw = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
      const h = (hRaw + 360) % 360;
      return { l: lab.l, c: Math.sqrt(lab.a * lab.a + lab.b * lab.b), h };
    }
    default:
      return rgbToHsl(rgb);
  }
}

export function encodeColor(vals, space) {
  switch (space) {
    case "hsl":
      return rgbToHex(hslToRgb(vals));
    case "lab":
      return rgbToHex(xyzToRgb(labToXyz(vals)));
    case "lch":
      return rgbToHex(xyzToRgb(labToXyz(lchToLab(vals))));
    case "oklab":
      return rgbToHex(oklabToSrgb(vals));
    case "oklch": {
      const hRad = (((vals.h % 360) + 360) % 360) * (Math.PI / 180);
      const a = vals.c * Math.cos(hRad);
      const b = vals.c * Math.sin(hRad);
      return rgbToHex(oklabToSrgb({ l: vals.l, a, b }));
    }
    default:
      return rgbToHex(hslToRgb(vals));
  }
}

export function normalizeSpace(vals, space) {
  return normalizeWithRange(vals, csRanges[space], space);
}

export function unscaleSpace(vals, space) {
  return unscaleWithRange(vals, csRanges[space], space);
}

export function normalizeWithRange(vals, range, space) {
  const min = range.min;
  const max = range.max;
  const out = {};
  channelOrder[space].forEach((ch) => {
    const denom = max[ch] - min[ch] || 1;
    out[ch] = (vals[ch] - min[ch]) / denom;
  });
  return out;
}

export function unscaleWithRange(vals, range, space) {
  const min = range.min;
  const max = range.max;
  const out = {};
  channelOrder[space].forEach((ch) => {
    out[ch] = vals[ch] * (max[ch] - min[ch]) + min[ch];
  });
  return out;
}

export function clampToRange(vals, range, space) {
  const out = {};
  channelOrder[space].forEach((ch) => {
    if (!(ch in vals)) return;
    if (ch === "h") {
      const span = (range.max.h - range.min.h) || 360;
      let h = vals.h;
      if (Number.isFinite(h)) {
        h = ((h - range.min.h) % span + span) % span + range.min.h;
        if (h < range.min.h) h = range.min.h;
        if (h > range.max.h) h = range.max.h;
      }
      out.h = h;
    } else {
      const v = vals[ch];
      out[ch] = Math.max(range.min[ch], Math.min(range.max[ch], v));
    }
  });
  return { ...vals, ...out };
}

export function effectiveRangeFromValues(values, space) {
  const base = csRanges[space];
  const min = { ...base.min };
  const max = { ...base.max };
  values.forEach((v) => {
    channelOrder[space].forEach((ch) => {
      if (v[ch] < min[ch]) min[ch] = v[ch];
      if (v[ch] > max[ch]) max[ch] = v[ch];
    });
  });
  return { min, max };
}

export function effectiveRangeFromColors(colors, space) {
  const decoded = (colors || []).map((c) => decodeColor(c, space));
  return effectiveRangeFromValues(decoded, space);
}

function labFn(t) {
  const delta = 6 / 29;
  return t > Math.pow(delta, 3) ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

function labInvFn(t) {
  const delta = 6 / 29;
  const delta3 = delta * delta * delta;
  return t > delta ? t * t * t : 3 * delta * delta * (t - 4 / 29);
}
