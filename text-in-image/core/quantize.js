// Colour quantization: reduce an RGBA image to a few flat colours by weighted
// k-means in OKLab, as R's quantize_oklab. Images are Float64Array RGBA in
// [0, 1], row-major, which is what the later stages read.

import { rgbHex } from './colors.js';
import { parseColor, unusable } from './request.js';

/**
 * @typedef {{ width: number, height: number, rgba: Float64Array }} Raster  RGBA in [0, 1], row-major
 * @typedef {{ colors: string[], proportions: number[], error: { mean: number, p99: number } }} Palette
 * @typedef {NonNullable<import('./request.js').Settings['quantize']>} QuantizeSettings
 */

/**
 * Pixels as [0, 1] RGBA. An image with no transparent pixel is treated as having
 * no alpha channel, as R treats an RGB image: pixels within sqrt(3)/3 (in 0-1
 * RGB) of `transparentColor` become transparent and the rest opaque.
 * @param {import('./request.js').Image} image
 * @param {string} transparentColor
 * @returns {Raster}
 */
export function toRaster(image, transparentColor) {
  const { width, height, data } = image;
  const n = width * height;
  const rgba = new Float64Array(n * 4);
  for (let i = 0; i < n * 4; i++) rgba[i] = data[i] / 255;
  let opaque = true;
  for (let i = 3; i < n * 4 && opaque; i += 4) opaque = data[i] === 255;
  if (opaque) {
    const tc = /** @type {number[]} */ (parseColor(transparentColor)).map((v) => v / 255);
    for (let p = 0; p < n; p++) {
      const d = Math.hypot(rgba[4 * p] - tc[0], rgba[4 * p + 1] - tc[1], rgba[4 * p + 2] - tc[2]);
      rgba[4 * p + 3] = d > Math.sqrt(3) / 3 ? 1 : 0;
    }
  }
  return { width, height, rgba };
}

/**
 * OKLab of an sRGB colour in [0, 1].
 * @param {number} r @param {number} g @param {number} b
 * @returns {[number, number, number]}
 */
export function srgbToOklab(r, g, b) {
  const lin = (/** @type {number} */ v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/**
 * Quantize to k flat colours. Clustering runs on the distinct opaque colours
 * (OKLab rounded to `grid`), each weighted by its pixel count ^ weight_pow;
 * every opaque pixel then takes its nearest centre, and each palette colour is
 * the mean sRGB of its pixels. Opaque means alpha^0.5 >= transparency_thresh;
 * the rest become transparent black.
 * @param {Raster} raster
 * @param {QuantizeSettings} q
 * @param {() => number} rng
 * @returns {{ raster: Raster, palette: Palette }}
 */
export function quantizeOklab(raster, q, rng) {
  const { width, height, rgba } = raster;
  const n = width * height;
  const opaque = new Uint8Array(n);
  const lab = new Float64Array(n * 3);
  // distinct colours, found in R's column-major order so the same pixel
  // represents each one
  /** @type {Map<string, number>} */
  const keyIndex = new Map();
  /** @type {number[]} */
  const first = [];
  /** @type {number[]} */
  const counts = [];
  let nOpaque = 0;
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) {
      const p = r * width + c;
      if (Math.sqrt(rgba[4 * p + 3]) < q.transparency_thresh) continue;
      opaque[p] = 1;
      nOpaque++;
      const [L, A, B] = srgbToOklab(rgba[4 * p], rgba[4 * p + 1], rgba[4 * p + 2]);
      lab[3 * p] = L; lab[3 * p + 1] = A; lab[3 * p + 2] = B;
      const key = `${Math.round(L / q.grid)},${Math.round(A / q.grid)},${Math.round(B / q.grid)}`;
      const j = keyIndex.get(key);
      if (j === undefined) {
        keyIndex.set(key, first.length);
        first.push(p);
        counts.push(1);
      } else {
        counts[j]++;
      }
    }
  }
  if (!first.length) throw unusable('image', 'has no opaque pixels (alpha^0.5 at least quantize.transparency_thresh)');
  if (first.length < q.k) {
    throw unusable('quantize.k', `is ${q.k}, but the image has only ${first.length} distinct colour${first.length === 1 ? '' : 's'} (OKLab rounded to quantize.grid); use at most ${first.length}, or quantize: null to keep the colours as they are`);
  }

  const points = new Float64Array(first.length * 3);
  first.forEach((p, j) => points.set(lab.subarray(3 * p, 3 * p + 3), 3 * j));
  const centers = kmeansPP(points, q.k, counts.map((v) => v ** q.weight_pow), q.restarts, rng);

  // every opaque pixel takes its nearest centre; palette entries in centre order
  const cluster = new Int32Array(n).fill(-1);
  const sums = new Float64Array(q.k * 4);
  for (let p = 0; p < n; p++) {
    if (!opaque[p]) continue;
    const j = nearest(lab, p, centers, q.k);
    cluster[p] = j;
    for (let ch = 0; ch < 3; ch++) sums[4 * j + ch] += rgba[4 * p + ch];
    sums[4 * j + 3]++;
  }
  const present = [...Array(q.k).keys()].filter((j) => sums[4 * j + 3] > 0);
  const colors = present.map((j) => [0, 1, 2].map((ch) => sums[4 * j + ch] / sums[4 * j + 3]));
  const slot = new Int32Array(q.k).fill(-1);
  present.forEach((j, i) => { slot[j] = i; });

  const out = new Float64Array(n * 4);
  const colorLab = colors.map(([r, g, b]) => srgbToOklab(r, g, b));
  const errors = new Float64Array(nOpaque);
  let e = 0;
  for (let p = 0; p < n; p++) {
    if (cluster[p] < 0) continue;
    const i = slot[cluster[p]];
    out.set(colors[i], 4 * p);
    out[4 * p + 3] = 1;
    errors[e++] = Math.hypot(lab[3 * p] - colorLab[i][0], lab[3 * p + 1] - colorLab[i][1], lab[3 * p + 2] - colorLab[i][2]);
  }
  errors.sort();
  return {
    raster: { width, height, rgba: out },
    palette: {
      colors: colors.map(rgbHex),
      proportions: present.map((j) => sums[4 * j + 3] / nOpaque),
      error: { mean: errors.reduce((a, b) => a + b, 0) / nOpaque, p99: quantile(errors, 0.99) },
    },
  };
}

/**
 * Weighted k-means (Lloyd) with weighted k-means++ starts; the best of
 * `restarts` by weighted within-cluster sum of squares.
 * @param {Float64Array} x points, 3 values each
 * @param {number} k
 * @param {number[]} w
 * @param {number} restarts
 * @param {() => number} rng
 */
function kmeansPP(x, k, w, restarts, rng) {
  const n = w.length;
  let best = { centers: new Float64Array(0), ss: Infinity };
  for (let s = 0; s < restarts; s++) {
    let centers = new Float64Array(k * 3);
    const d = new Float64Array(n).fill(Infinity);
    const start = sample(w, rng);
    centers.set(x.subarray(3 * start, 3 * start + 3), 0);
    for (let j = 1; j < k; j++) {
      for (let i = 0; i < n; i++) d[i] = Math.min(d[i], sqdist(x, i, centers, j - 1));
      const pick = sample(w.map((wi, i) => d[i] * wi), rng);
      centers.set(x.subarray(3 * pick, 3 * pick + 3), 3 * j);
    }
    const cl = new Int32Array(n);
    for (let it = 0; it < 100; it++) {
      for (let i = 0; i < n; i++) cl[i] = nearest(x, i, centers, k);
      const next = new Float64Array(k * 3);
      const total = new Float64Array(k);
      for (let i = 0; i < n; i++) {
        for (let ch = 0; ch < 3; ch++) next[3 * cl[i] + ch] += x[3 * i + ch] * w[i];
        total[cl[i]] += w[i];
      }
      let change = 0;
      for (let j = 0; j < k; j++) {
        for (let ch = 0; ch < 3; ch++) {
          const v = total[j] > 0 ? next[3 * j + ch] / total[j] : centers[3 * j + ch]; // an empty cluster keeps its centre
          change = Math.max(change, Math.abs(v - centers[3 * j + ch]));
          next[3 * j + ch] = v;
        }
      }
      centers = next;
      if (change < 1e-6) break;
    }
    let ss = 0;
    for (let i = 0; i < n; i++) ss += w[i] * sqdist(x, i, centers, nearest(x, i, centers, k));
    if (ss < best.ss) best = { centers, ss };
  }
  return best.centers;
}

/** Index of the centre nearest to point i (the first on ties). @param {Float64Array} x @param {number} i @param {Float64Array} centers @param {number} k */
function nearest(x, i, centers, k) {
  let bestJ = 0;
  let bestD = Infinity;
  for (let j = 0; j < k; j++) {
    const dist = sqdist(x, i, centers, j);
    if (dist < bestD) { bestD = dist; bestJ = j; }
  }
  return bestJ;
}

/** @param {Float64Array} x @param {number} i @param {Float64Array} centers @param {number} j */
function sqdist(x, i, centers, j) {
  const a = x[3 * i] - centers[3 * j];
  const b = x[3 * i + 1] - centers[3 * j + 1];
  const c = x[3 * i + 2] - centers[3 * j + 2];
  return a * a + b * b + c * c;
}

/** An index drawn with probability proportional to its weight. @param {ArrayLike<number>} weights @param {() => number} rng */
function sample(weights, rng) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let u = rng() * total;
  let last = 0;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    last = i;
    u -= weights[i];
    if (u < 0) return i;
  }
  return last;
}

/** Sample quantile of sorted values, as R's default quantile(type = 7). @param {Float64Array} sorted @param {number} p */
export function quantile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return lo + 1 < sorted.length ? sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
}
