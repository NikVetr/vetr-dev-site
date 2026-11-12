// Stroke smoothing, as the R script's wavelet_smooth(), wavelet_smooth_noise_thresh()
// and fourier_smooth(), each run on one coordinate of one stroke mirrored at its
// end, c(v, rev(v)), so that the circular transforms see no jump there.
//
// Wavelet: the MODWT (shared/wavelet.js) is soft-thresholded at one threshold,
// set either by the energy rule (the threshold keeps `keepEnergy` of the
// coefficients' total energy) or by the noise rule (multiplier × sd(d1)). Only
// the detail levels are thresholded unless `thresholdSmooth` is set, as the
// script's energy rule does (:178); thresholding the level-J smooth pulls the
// stroke toward the origin. A strength profile along the stroke scales the
// threshold point by point (local smoothing); each level's coefficients are
// matched to the samples they summarise by the filter's centre.
//
// Fourier: the stroke's frequencies whose magnitude falls under the script's
// threshold (the median magnitude of the upper half of the frequencies / 0.6745,
// times sqrt(2 log(N)^2 / log 2)), scaled by `strength`, are dropped.

import { dft } from '../../shared/fft.js';
import { defaultLevels, imodwt, median, modwt, waveletFilter, waveletNoise } from '../../shared/wavelet.js';

/**
 * @typedef {import('../../shared/wavelet.js').Filter} Filter
 * @typedef {{ filter: Filter, levels: 'auto' | number, rule: 'energy' | 'noise', keepEnergy: number,
 *   noiseMultiplier: number, thresholdSmooth: boolean, strength: number }} WaveletSettings
 */

/** The number of levels for a stroke of n points (mirrored to 2n), as the script's rule. @param {number} n @param {'auto' | number} levels */
export function strokeLevels(n, levels) {
  const most = Math.floor(Math.log2(2 * n));
  return Math.min(levels === 'auto' ? defaultLevels(2 * n) : levels, most);
}

/**
 * The energy rule's threshold (wavelet_smooth, :170-173): the square root of the
 * smallest squared coefficient among the largest ones that together hold at most
 * `keep` of the energy of all coefficients, the level-J smooth's included. When
 * the largest alone holds more, every coefficient counts as kept.
 * @param {Float64Array[]} coefficients @param {number} keep
 */
export function energyThreshold(coefficients, keep) {
  const squares = Float64Array.from(coefficients.flatMap((c) => Array.from(c, (v) => v * v))).sort().reverse();
  let total = 0;
  for (const v of squares) total += v;
  if (total === 0) return 0;
  const limit = Math.max(keep, (squares[0] / total) * 1.01);
  let cum = 0;
  let k = 0;
  while (k < squares.length && (cum + squares[k]) / total <= limit) cum += squares[k++];
  return Math.sqrt(squares[k - 1]);
}

/**
 * Wavelet smoothing of one coordinate of one stroke.
 * @param {ArrayLike<number>} v @param {WaveletSettings} s
 * @param {Float64Array} [profile] threshold scale at each point (local strength); 1 everywhere when absent
 * @returns {Float64Array}
 */
export function waveletSmoothSeries(v, s, profile) {
  const n = v.length;
  const J = strokeLevels(n, s.levels);
  const w = modwt(v, s.filter, J, 'reflection');
  const base = s.strength * (s.rule === 'energy' ? energyThreshold([...w.d, w.s], s.keepEnergy) : s.noiseMultiplier * waveletNoise(w.d[0], 'sd'));
  const N = 2 * n;
  const L = waveletFilter(s.filter).g.length;
  /** The threshold of the coefficient at t of level j, from the sample it is centred on. @param {number} j @param {number} t */
  const at = (j, t) => {
    if (!profile) return base;
    const centre = ((Math.round(t - ((2 ** j - 1) * (L - 1)) / 2) % N) + N) % N;
    return base * profile[centre < n ? centre : N - 1 - centre];
  };
  const shrink = (/** @type {Float64Array} */ c, /** @type {number} */ j) => c.map((x, t) => {
    const thr = at(j, t);
    return Math.abs(x) > thr ? Math.sign(x) * (Math.abs(x) - thr) : 0;
  });
  return imodwt({ ...w, d: w.d.map((dj, j) => shrink(dj, j + 1)), s: s.thresholdSmooth ? shrink(w.s, J) : w.s });
}

/**
 * fourier_smooth() of one mirrored coordinate, its threshold scaled by `strength`
 * (1 is the script's; 0 keeps every frequency). Returns the first half.
 * @param {ArrayLike<number>} v @param {number} strength
 * @returns {Float64Array}
 */
export function fourierSmoothSeries(v, strength) {
  const n = v.length;
  if (strength === 0) return Float64Array.from(v);
  const N = 2 * n;
  const mirrored = Float64Array.from({ length: N }, (_, i) => v[i < n ? i : N - 1 - i]);
  const X = dft(mirrored, new Float64Array(N), false);
  const mag = Array.from(X.re, (re, k) => Math.hypot(re, X.im[k]));
  const sigma = median(mag.slice(Math.floor(N / 2))) / 0.6745;
  const thr = strength * sigma * Math.sqrt((2 * Math.log(N) ** 2) / Math.log(2));
  for (let k = 0; k < N; k++) if (mag[k] < thr) X.re[k] = X.im[k] = 0;
  const back = dft(X.re, X.im, true).re;
  return Float64Array.from({ length: n }, (_, i) => back[i] / N);
}

/**
 * One stroke smoothed: each coordinate about its own mean (as hershey_vec.R
 * centres each stroke, so that the energy rule weighs the stroke's shape and
 * not where it sits), Fourier first, then wavelet with the local strength profile.
 * @param {Float64Array} x @param {Float64Array} y @param {{fourier:{strength:number},wavelet: Parameters<typeof waveletSmoothSeries>[1]}} sm @param {Float64Array | undefined} profile
 */
export function smoothPoints(x, y, sm, profile) {
  const one = (/** @type {Float64Array} */ v) => {
    const c = v.reduce((a, b) => a + b, 0) / v.length;
    let u = fourierSmoothSeries(v.map((q) => q - c), sm.fourier.strength);
    if (sm.wavelet.strength > 0) u = waveletSmoothSeries(u, sm.wavelet, profile);
    return u.map((q) => q + c);
  };
  return { x: one(x), y: one(y) };
}
