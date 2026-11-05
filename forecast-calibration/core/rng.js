/**
 * Seeded uniform random numbers in [0, 1) (mulberry32). The same seed gives the
 * same sequence in Node and in every browser, so simulated worlds are reproducible.
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
