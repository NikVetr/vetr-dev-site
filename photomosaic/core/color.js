// The colour features that the cost compares: the cost between a cell and a photo is the
// squared Euclidean distance between their four features.

/**
 * "hsl-r", the R script's: plotwidgets::rgb2hsl() on the values magick's as.numeric() gives.
 * as.numeric() scales the 8-bit channels to 0-1 and rgb2hsl() divides by 255 again, after
 * setting alpha aside, so the features are hue in degrees (0 for a grey), the saturation
 * (max - min) / (max + min), lightness on 0 to 1/255 and alpha on 0-1. Hue's spread of
 * degrees makes it the main term.
 * "lab": CIELAB (sRGB, D65) lightness L*, a* and b*, with alpha as a fourth term on 0-100.
 */
export const METRICS = /** @type {const} */ (['hsl-r', 'lab']);

/** @typedef {typeof METRICS[number]} Metric */

/**
 * @param {number} r @param {number} g @param {number} b @param {number} a 0-255
 * @param {Float64Array} out @param {number} o
 */
function hslR(r, g, b, a, out, o) {
  // as R computes it: (as.numeric's x / 255) / 255, alpha left at as.numeric's x / 255
  const R = r / 255 / 255;
  const G = g / 255 / 255;
  const B = b / 255 / 255;
  const mins = Math.min(R, G, B);
  const maxs = Math.max(R, G, B);
  const d = maxs - mins;
  const L = (maxs + mins) / 2;
  const S = d === 0 ? 0 : d / (1 - Math.abs(2 * L - 1));
  let H;
  if (R >= G && R >= B) H = (G - B) / (maxs - mins); // which.max: the first largest channel
  else if (G >= B) H = 2 + (B - R) / (maxs - mins);
  else H = 4 + (R - G) / (maxs - mins);
  H *= 60;
  H -= Math.floor(H / 360) * 360; // R's %% 360
  if (mins === maxs) H = 0;
  out[o] = H;
  out[o + 1] = S;
  out[o + 2] = L;
  out[o + 3] = a / 255;
}

/** @param {number} c 0-255 sRGB */
const linear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** @param {number} t */
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);

/**
 * @param {number} r @param {number} g @param {number} b @param {number} a 0-255
 * @param {Float64Array} out @param {number} o
 */
function lab(r, g, b, a, out, o) {
  const R = linear(r);
  const G = linear(g);
  const B = linear(b);
  const fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
  const fy = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
  const fz = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
  out[o + 3] = (100 * a) / 255;
}

/**
 * Four features per colour.
 * @param {ArrayLike<number>} rgba r, g, b, a of each colour in turn, 0-255
 * @param {Metric} metric
 */
export function features(rgba, metric) {
  const n = rgba.length / 4;
  const out = new Float64Array(4 * n);
  const fn = metric === 'lab' ? lab : hslR;
  for (let i = 0; i < n; i++) fn(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2], rgba[4 * i + 3], out, 4 * i);
  return out;
}

/**
 * The squared distance between feature i of `a` and feature j of `b`.
 * @param {Float64Array} a @param {number} i @param {Float64Array} b @param {number} j
 */
export function cost(a, i, b, j) {
  const d0 = a[4 * i] - b[4 * j];
  const d1 = a[4 * i + 1] - b[4 * j + 1];
  const d2 = a[4 * i + 2] - b[4 * j + 2];
  const d3 = a[4 * i + 3] - b[4 * j + 3];
  return d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
}
