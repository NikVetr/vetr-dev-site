// Contour smoothing, as R/smooth.R. Each closed contour's x(t) and y(t) are
// smoothed as circular series: MODWT wavelet soft thresholding
// (shared/wavelet.js), Fourier hard thresholding, or Walsh-Hadamard soft
// thresholding.

import { dft } from '../../shared/fft.js';
import { mean, sum } from '../../shared/rstats.js';
import { defaultLevels, median, softThreshold, waveletSmooth } from '../../shared/wavelet.js';

/**
 * @typedef {{ filter: import('../../shared/wavelet.js').Filter, nLevels: 'auto' | number, thresholdMultiplier: number, noise: 'sd' | 'mad' }} WaveletSettings
 * @typedef {{ method: 'wavelet' | 'fourier' | 'hadamard' | 'none', wavelet: WaveletSettings, fourier: { threshold: 'original' | 'universal' } }} SmoothSettings
 * @typedef {{ x: Float64Array, y: Float64Array }} Ring
 */

/**
 * Smooths one closed contour.
 * @param {Ring} ring @param {SmoothSettings} s
 * @returns {Ring}
 */
export function smoothContour(ring, s) {
  const n = ring.x.length;
  if (n === 1 || s.method === 'none') return ring;
  if (s.method === 'wavelet') {
    const wv = s.wavelet;
    const levels = Math.min(wv.nLevels === 'auto' ? defaultLevels(n) : wv.nLevels, Math.floor(Math.log2(n)));
    return {
      x: waveletSmooth(ring.x, wv.filter, levels, wv.thresholdMultiplier, wv.noise),
      y: waveletSmooth(ring.y, wv.filter, levels, wv.thresholdMultiplier, wv.noise),
    };
  }
  if (s.method === 'fourier') return fourierSmooth(ring, s.fourier.threshold);
  return hadamardSmooth(ring);
}

/**
 * Fourier hard thresholding. R takes the 2-D FFT of the n × 2 matrix (x, y), whose
 * columns are X + Y and X − Y for the coordinates' transforms X and Y. A frequency
 * is discarded, for both coordinates, when both |X + Y| and |X − Y| fall below the
 * threshold; the noise is the median of |X − Y| over the upper half of the
 * frequencies, / 0.6745. "original" is the original's multiplier
 * sqrt(2 log(n)^2 / log 2); "universal" is sqrt(2 log n).
 * @param {Ring} ring @param {'original' | 'universal'} threshold
 */
function fourierSmooth(ring, threshold) {
  const n = ring.x.length;
  const X = dft(ring.x, new Float64Array(n), false);
  const Y = dft(ring.y, new Float64Array(n), false);
  const magSum = new Float64Array(n);
  const magDiff = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    magSum[k] = Math.hypot(X.re[k] + Y.re[k], X.im[k] + Y.im[k]);
    magDiff[k] = Math.hypot(X.re[k] - Y.re[k], X.im[k] - Y.im[k]);
  }
  const sigma = median(Array.from(magDiff.subarray(Math.floor(n / 2)))) / 0.6745;
  const thr = threshold === 'original' ? sigma * Math.sqrt((2 * Math.log(n) ** 2) / Math.log(2)) : sigma * Math.sqrt(2 * Math.log(n));
  for (let k = 0; k < n; k++) {
    if (magSum[k] < thr && magDiff[k] < thr) X.re[k] = X.im[k] = Y.re[k] = Y.im[k] = 0;
  }
  const x = dft(X.re, X.im, true).re.map((v) => v / n);
  const y = dft(Y.re, Y.im, true).re.map((v) => v / n);
  return { x, y };
}

/**
 * Walsh-Hadamard soft thresholding, as gsignal's fwht/ifwht in sequency order:
 * each coordinate is zero-padded to a power of two N, transformed (divided by N),
 * soft-thresholded at the sd of its last 20 coefficients, transformed back and
 * cut to n points.
 * @param {Ring} ring
 */
function hadamardSmooth(ring) {
  const n = ring.x.length;
  const N = 2 ** Math.ceil(Math.log2(n));
  // R's coef[(N - 19):N] is an invalid subscript for N < 20; checked when the request is read
  const smooth1 = (/** @type {Float64Array} */ v) => {
    const padded = new Float64Array(N);
    padded.set(v);
    const coef = walsh(padded).map((c) => c / N);
    const tail = coef.subarray(N - 20);
    const m = mean(tail);
    const sigma = Math.sqrt(sum(Array.from(tail, (c) => (c - m) * (c - m))) / 19);
    return walsh(softThreshold(coef, sigma)).slice(0, n);
  };
  return { x: smooth1(ring.x), y: smooth1(ring.y) };
}

/**
 * The sequency-ordered Walsh transform (unnormalized): the natural-order
 * Hadamard butterflies, then output i takes natural index bitreverse(gray(i)).
 * @param {Float64Array} v length a power of two
 */
function walsh(v) {
  const N = v.length;
  const a = Float64Array.from(v);
  for (let len = 1; len < N; len *= 2) {
    for (let i = 0; i < N; i += 2 * len) {
      for (let j = i; j < i + len; j++) {
        const p = a[j];
        const q = a[j + len];
        a[j] = p + q;
        a[j + len] = p - q;
      }
    }
  }
  const bits = Math.log2(N);
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const gray = i ^ (i >> 1);
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((gray >> b) & 1) << (bits - 1 - b);
    out[i] = a[r];
  }
  return out;
}
