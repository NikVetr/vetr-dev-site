// Seeded random numbers. The same seed gives the same sequence in Node and in every
// browser, so a request that samples is reproducible.

import { qnorm } from './normal.js';

/**
 * Uniform numbers in [0, 1) from mulberry32.
 * @param {number} seed integer in [0, 2^32 - 1]
 * @returns {() => number}
 */
export function createRng(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A standard normal draw by inversion: the uniform is moved half a step off the
 * grid so it lies strictly inside (0, 1). Inversion keeps a draw tied to its uniform,
 * so changing a mean or a correlation moves each simulated point continuously.
 * @param {() => number} rng from createRng
 */
export function standardNormal(rng) {
  return qnorm(rng() + 2 ** -33);
}
