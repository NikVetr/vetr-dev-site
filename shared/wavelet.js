// MODWT wavelet smoothing, as raster-to-vector's R/wavelet.R: the maximal
// overlap discrete wavelet transform (Percival & Walden 2000, ch. 5) by the
// pyramid algorithm, its inverse, and soft thresholding of the detail
// coefficients. Checked against waveslim's output in tests/fixtures/wavelet
// (tests/wavelet.test.mjs). Used by raster-to-vector and signature.

import { mean, sum } from './rstats.js';

/** Scaling (low-pass) filters, as waveslim::wave.filter gives them. */
export const WAVELET_LOWPASS = Object.freeze({
  haar: [0.70710678118654746, 0.70710678118654746],
  d4: [0.4829629131445341, 0.83651630373780772, 0.22414386804201339, -0.12940952255126029],
  mb4: [0.48017549999999998, 0.83725450000000001, 0.2269312, -0.13014770000000001],
  d6: [0.33267055295008269, 0.80689150931109277, 0.45987750211849149, -0.13501102001025461,
    -0.0854412738820267, 0.035226291885709603],
  la8: [-0.075765714789356675, -0.029635527645960391, 0.49761866763256291, 0.80373875180538601,
    0.29785779560560505, -0.099219543576956365, -0.012603967262263829, 0.032223100604078153],
});

/**
 * @typedef {keyof typeof WAVELET_LOWPASS} Filter
 * @typedef {{ d: Float64Array[], s: Float64Array, filter: Filter, boundary: 'periodic' | 'reflection' }} Modwt
 */

/**
 * The low-pass filter g and its quadrature mirror h[l] = (-1)^l g[L - 1 - l].
 * @param {Filter} filter
 */
export function waveletFilter(filter) {
  const g = WAVELET_LOWPASS[filter];
  const L = g.length;
  return { g, h: g.map((_, l) => (l % 2 ? -1 : 1) * g[L - 1 - l]) };
}

/** The original's number of levels for a series of n points: half the dyadic length, at least 1. @param {number} n */
export function defaultLevels(n) {
  return Math.max(1, Math.floor(Math.log2(n) / 2));
}

/**
 * MODWT of x. "periodic" treats x as circular (closed contours); "reflection"
 * transforms x followed by its reverse (open curves).
 * @param {ArrayLike<number>} x @param {Filter} filter @param {number} nLevels
 * @param {'periodic' | 'reflection'} [boundary]
 * @returns {Modwt}
 */
export function modwt(x, filter, nLevels, boundary = 'periodic') {
  const v0 = boundary === 'reflection' ? [...Array.from(x), ...Array.from(x).reverse()] : Array.from(x);
  const N = v0.length;
  if (2 ** nLevels > N) throw new Error(`2^nLevels (${2 ** nLevels}) exceeds the series length (${N})`);
  const { g, h } = waveletFilter(filter);
  const ht = h.map((c) => c / Math.SQRT2);
  const gt = g.map((c) => c / Math.SQRT2);
  let v = Float64Array.from(v0);
  /** @type {Float64Array[]} */
  const d = [];
  for (let j = 1; j <= nLevels; j++) {
    // W[t] = sum_l ht[l] V[(t - 2^(j-1) l) mod N], likewise V with gt
    const w = new Float64Array(N);
    const vNew = new Float64Array(N);
    const step = 2 ** (j - 1);
    for (let l = 0; l < ht.length; l++) {
      const shift = (step * l) % N;
      for (let t = 0; t < N; t++) {
        const k = (t - shift + N) % N;
        w[t] += ht[l] * v[k];
        vNew[t] += gt[l] * v[k];
      }
    }
    d.push(w);
    v = vNew;
  }
  return { d, s: v, filter, boundary };
}

/** Inverse MODWT of a modwt() result. @param {Modwt} w @returns {Float64Array} */
export function imodwt(w) {
  const { g, h } = waveletFilter(w.filter);
  const ht = h.map((c) => c / Math.SQRT2);
  const gt = g.map((c) => c / Math.SQRT2);
  let v = w.s;
  const N = v.length;
  for (let j = w.d.length; j >= 1; j--) {
    // V[j-1][t] = sum_l ht[l] W[j][(t + 2^(j-1) l) mod N] + gt[l] V[j][...]
    const vNew = new Float64Array(N);
    const dj = w.d[j - 1];
    const step = 2 ** (j - 1);
    for (let l = 0; l < ht.length; l++) {
      const shift = (step * l) % N;
      for (let t = 0; t < N; t++) {
        const k = (t + shift) % N;
        vNew[t] = vNew[t] + ht[l] * dj[k] + gt[l] * v[k];
      }
    }
    v = vNew;
  }
  return w.boundary === 'reflection' ? v.slice(0, N / 2) : v;
}

/** @param {Float64Array} x @param {number} threshold */
export function softThreshold(x, threshold) {
  return x.map((v) => (Math.abs(v) > threshold ? Math.sign(v) * (Math.abs(v) - threshold) : 0));
}

/**
 * Noise level from the level-1 details: "sd" is their sample standard deviation
 * (the original vectorizer); "mad" is median(|d1|) / 0.6745.
 * @param {Float64Array} d1 @param {'sd' | 'mad'} noise
 */
export function waveletNoise(d1, noise) {
  if (noise === 'mad') return median(Array.from(d1, Math.abs)) / 0.6745;
  const m = mean(d1);
  return Math.sqrt(sum(Array.from(d1, (v) => (v - m) * (v - m))) / (d1.length - 1));
}

/**
 * Smooths x by soft-thresholding every detail level d1..dJ at multiplier × noise(d1).
 * The level-J smooth is not thresholded.
 * @param {ArrayLike<number>} x @param {Filter} filter @param {number} nLevels
 * @param {number} multiplier @param {'sd' | 'mad'} noise @param {'periodic' | 'reflection'} [boundary]
 */
export function waveletSmooth(x, filter, nLevels, multiplier, noise, boundary = 'periodic') {
  const w = modwt(x, filter, nLevels, boundary);
  const threshold = multiplier * waveletNoise(w.d[0], noise);
  return imodwt({ ...w, d: w.d.map((dj) => softThreshold(dj, threshold)) });
}

/** @param {number[]} values */
export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
