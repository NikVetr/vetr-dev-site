// Colour adjustment after matching: each placed photo's pixels moved towards its cell's colour
// in OKLab, a channel at a time, without changing the assignment. For a tile with mean OKLab
// colour M, its cell's colour C and, optionally, the target's own colour T(x) at each pixel,
//   pixel' = pixel + s ⊙ [(1 - d) × (C - M) + d × (T(x) - pixel)]
// with s the strengths for L, a and b (0 to 1) and d the target detail (0 to 1). With d = 0 the
// photo's texture is kept and its mean moves the fraction s of the way to C, so s = 1 puts it
// on C exactly (before out-of-gamut values are clipped to sRGB). The page redraws this live from
// prepareAdjust()'s precomputation (or, on the GPU, from tileDeltas() and adjustTerms());
// composeMosaic() and the page's PNG export use the same functions tile by tile.

import { linear } from './color.js';
import { invalid } from './request.js';

/**
 * @typedef {{ L: number, a: number, b: number, detail: number }} Adjust fractions from 0 to 1
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {{ rgba: ArrayLike<number>, width: number, rects: Rect[], lms: Float32Array,
 *   delta: Float64Array, detail: Float32Array | null }} Prepared
 *   lms holds each rect pixel's cube-rooted cone response (OKLab before its last matrix), rect
 *   by rect, row by row; delta each rect's C - M in OKLab; detail the same as lms for the target.
 */

export const ADJUST_FIELDS = /** @type {const} */ (['L', 'a', 'b', 'detail']);
/** @type {Readonly<Adjust>} */
export const NO_ADJUST = Object.freeze({ L: 0, a: 0, b: 0, detail: 0 });

/**
 * Checks an adjustment: an object with any of L, a, b and detail, each a number from 0 to 1;
 * those left out are 0. Throws a PhotomosaicError listing every problem.
 * @param {unknown} adjust @param {string} [path] where it is, for the issues
 * @returns {Adjust}
 */
export function readAdjust(adjust, path = 'adjust') {
  if (adjust === undefined) return NO_ADJUST;
  if (adjust === null || typeof adjust !== 'object' || Array.isArray(adjust)) {
    throw invalid([{ code: 'wrong_type', path, message: 'must be an object {L, a, b, detail}' }]);
  }
  /** @type {import('./request.js').Issue[]} */
  const issues = [];
  const out = { ...NO_ADJUST };
  for (const [key, value] of Object.entries(adjust)) {
    if (!ADJUST_FIELDS.includes(/** @type {any} */ (key))) issues.push({ code: 'unknown_field', path: `${path}.${key}`, message: 'unknown field' });
    else if (typeof value === 'number' && value >= 0 && value <= 1) out[/** @type {keyof Adjust} */ (key)] = value;
    else issues.push({ code: 'out_of_range', path: `${path}.${key}`, message: 'must be a number from 0 to 1' });
  }
  if (issues.length) throw invalid(issues);
  return out;
}

/** Whether an adjustment changes anything: detail only matters with a strength above 0. @param {Adjust} adjust */
export const isAdjusting = (adjust) => adjust.L > 0 || adjust.a > 0 || adjust.b > 0;

// OKLab (Björn Ottosson, 2020): linear sRGB -> cone responses (TO_LMS), cube roots, -> L, a, b
// (TO_LAB). The adjustment is applied to the cube roots, where OKLab is a linear map away.
/** Matrices, row by row (the page's WebGL renderer uses them too). */
export const TO_LMS = [[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]];
export const FROM_LMS = [[4.0767416621, -3.3077115913, 0.2309699292], [-1.2684380046, 2.6097574011, -0.3413193965], [-0.0041960863, -0.7034186147, 1.7076147010]];
const TO_LAB = [[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]];
const FROM_LAB = [[1, 0.3963377774, 0.2158037573], [1, -0.1055613458, -0.0638541728], [1, -0.0894841775, -1.2914855480]];
const [[c00, c01, c02], [c10, c11, c12], [c20, c21, c22]] = TO_LMS;
const [[f00, f01, f02], [f10, f11, f12], [f20, f21, f22]] = FROM_LMS;

/** @param {number[][]} m @param {number} x @param {number} y @param {number} z */
const times = (m, x, y, z) => m.map((row) => row[0] * x + row[1] * y + row[2] * z);

const LINEAR = Float64Array.from({ length: 256 }, (_, i) => linear(i));
/** Linear values from 0 to 1 in this many steps encode to 8-bit sRGB by lookup (0.2 of a level apart at most). */
const STEPS = 16383;
const ENCODE = Uint8Array.from({ length: STEPS + 1 }, (_, i) => {
  const v = i / STEPS;
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
});

/** The OKLab colour [L, a, b] of an 8-bit sRGB colour. @param {number} r @param {number} g @param {number} b */
export function oklab(r, g, b) {
  const [l, m, s] = times(TO_LMS, linear(r), linear(g), linear(b));
  return times(TO_LAB, Math.cbrt(l), Math.cbrt(m), Math.cbrt(s));
}

/**
 * The cube-rooted cone responses summed over each rect, and every pixel's if `keep`.
 * @param {ArrayLike<number>} rgba @param {number} width @param {Rect[]} rects @param {boolean} keep
 */
function scan(rgba, width, rects, keep) {
  const count = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  const lms = keep ? new Float32Array(3 * count) : null;
  const sums = new Float64Array(3 * rects.length);
  let k = 0;
  rects.forEach(({ x: x0, y: y0, width: w, height: h }, t) => {
    let L = 0, M = 0, S = 0;
    for (let y = y0; y < y0 + h; y++) {
      for (let o = 4 * (y * width + x0), end = o + 4 * w; o < end; o += 4, k += 3) {
        const R = LINEAR[rgba[o]];
        const G = LINEAR[rgba[o + 1]];
        const B = LINEAR[rgba[o + 2]];
        const l = Math.cbrt(c00 * R + c01 * G + c02 * B);
        const m = Math.cbrt(c10 * R + c11 * G + c12 * B);
        const s = Math.cbrt(c20 * R + c21 * G + c22 * B);
        L += l; M += m; S += s;
        if (lms) { lms[k] = l; lms[k + 1] = m; lms[k + 2] = s; }
      }
    }
    sums.set([L, M, S], 3 * t);
  });
  return { lms, sums };
}

/**
 * Each rect's C - M: its colour's OKLab minus its pixels' mean OKLab (M2 is linear, so M2 of
 * the mean cube roots).
 * @param {Float64Array} sums @param {Rect[]} rects @param {ArrayLike<number>[]} colors
 */
function deltasOf(sums, rects, colors) {
  const delta = new Float64Array(3 * rects.length);
  rects.forEach((rect, t) => {
    const n = rect.width * rect.height;
    const mean = times(TO_LAB, sums[3 * t] / n, sums[3 * t + 1] / n, sums[3 * t + 2] / n);
    const cell = oklab(colors[t][0], colors[t][1], colors[t][2]);
    for (let c = 0; c < 3; c++) delta[3 * t + c] = cell[c] - mean[c];
  });
  return delta;
}

/**
 * Each rectangle's (tile's) C - M in OKLab, from the pixels of an opaque RGBA picture: all that
 * the adjustment needs besides the pixels themselves.
 * @param {ArrayLike<number>} rgba the picture, row by row @param {number} width its width in pixels
 * @param {Rect[]} rects the tiles, inside the picture
 * @param {ArrayLike<number>[]} colors each tile's cell colour [r, g, b, ...], 0-255
 */
export function tileDeltas(rgba, width, rects, colors) {
  return deltasOf(scan(rgba, width, rects, false).sums, rects, colors);
}

/**
 * Precomputes the adjustment of the tiles of an opaque RGBA picture, each towards its own
 * colour: the slow part (cube roots and each tile's mean), done once so that applyAdjust() can
 * be repeated as the strengths change. Arguments as tileDeltas(); rgba is kept, not copied.
 * @param {ArrayLike<number>} rgba @param {number} width @param {Rect[]} rects @param {ArrayLike<number>[]} colors
 * @returns {Prepared}
 */
export function prepareAdjust(rgba, width, rects, colors) {
  const { lms, sums } = scan(rgba, width, rects, true);
  return { rgba, width, rects, lms: /** @type {Float32Array} */ (lms), delta: deltasOf(sums, rects, colors), detail: null };
}

/**
 * Adds the target's own pixels, laid out as the prepared picture is (each cell's part of the
 * target stretched over its tile), for the detail term. Sets and returns prepared.detail.
 * @param {Prepared} prepared @param {ArrayLike<number>} targetRgba the same size as the picture
 */
export function addDetail(prepared, targetRgba) {
  prepared.detail = /** @type {Float32Array} */ (scan(targetRgba, prepared.width, prepared.rects, true).lms);
  return prepared.detail;
}

/**
 * The adjustment where it is applied, on the cube-rooted cone responses: each tile's shift,
 * TO_LAB⁻¹ (1 - d) s ⊙ (C - M), and the detail matrix K = d TO_LAB⁻¹ diag(s) TO_LAB, which
 * multiplies T - pixel there.
 * @param {Float64Array} delta each tile's C - M (tileDeltas) @param {Adjust} adjust
 * @returns {{ shifts: Float32Array, K: number[][] }} shifts: three per tile; K: row by row
 */
export function adjustTerms(delta, adjust) {
  const d = adjust.detail;
  const s = [adjust.L, adjust.a, adjust.b];
  const shifts = new Float32Array(delta.length);
  for (let t = 0; t < delta.length; t += 3) {
    shifts.set(times(FROM_LAB, (1 - d) * s[0] * delta[t], (1 - d) * s[1] * delta[t + 1], (1 - d) * s[2] * delta[t + 2]), t);
  }
  const K = FROM_LAB.map((row) => [0, 1, 2].map((j) => d * row.reduce((sum, v, c) => sum + v * s[c] * TO_LAB[c][j], 0)));
  return { shifts, K };
}

/**
 * Writes the prepared tiles, adjusted, into `out` (an RGBA picture the size of the prepared
 * one, usually a copy of it); pixels outside the tiles are left as they are. Without any
 * strength above 0 the tiles are copied unchanged.
 * @param {Prepared} prepared @param {Adjust} adjust @param {Uint8ClampedArray} out
 */
export function applyAdjust(prepared, adjust, out) {
  const { rgba, width, rects, lms, delta } = prepared;
  if (!isAdjusting(adjust)) {
    for (const { x, y: y0, width: w, height: h } of rects) {
      for (let y = y0; y < y0 + h; y++) for (let o = 4 * (y * width + x), end = o + 4 * w; o < end; o++) out[o] = rgba[o];
    }
    return out;
  }
  const target = adjust.detail > 0 ? prepared.detail : null;
  if (adjust.detail > 0 && !target) throw new Error('target detail needs addDetail() first');
  const { shifts, K } = adjustTerms(delta, adjust);
  const [[k00, k01, k02], [k10, k11, k12], [k20, k21, k22]] = K;
  let k = 0;
  rects.forEach(({ x: x0, y: y0, width: w, height: h }, t) => {
    const dl = shifts[3 * t];
    const dm = shifts[3 * t + 1];
    const ds = shifts[3 * t + 2];
    for (let y = y0; y < y0 + h; y++) {
      for (let o = 4 * (y * width + x0), end = o + 4 * w; o < end; o += 4, k += 3) {
        let l = lms[k] + dl;
        let m = lms[k + 1] + dm;
        let q = lms[k + 2] + ds;
        if (target) {
          const tl = target[k] - lms[k];
          const tm = target[k + 1] - lms[k + 1];
          const tq = target[k + 2] - lms[k + 2];
          l += k00 * tl + k01 * tm + k02 * tq;
          m += k10 * tl + k11 * tm + k12 * tq;
          q += k20 * tl + k21 * tm + k22 * tq;
        }
        l = l * l * l;
        m = m * m * m;
        q = q * q * q;
        const r = f00 * l + f01 * m + f02 * q;
        const g = f10 * l + f11 * m + f12 * q;
        const b = f20 * l + f21 * m + f22 * q;
        out[o] = ENCODE[r <= 0 ? 0 : r >= 1 ? STEPS : (r * STEPS + 0.5) | 0];
        out[o + 1] = ENCODE[g <= 0 ? 0 : g >= 1 ? STEPS : (g * STEPS + 0.5) | 0];
        out[o + 2] = ENCODE[b <= 0 ? 0 : b >= 1 ? STEPS : (b * STEPS + 0.5) | 0];
        out[o + 3] = 255;
      }
    }
  });
  return out;
}
