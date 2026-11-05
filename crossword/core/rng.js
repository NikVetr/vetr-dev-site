/**
 * Seeded uniform random numbers in [0, 1) (mulberry32). The same seed gives the
 * same sequence in Node and in every browser, so a request always gives the same
 * crosswords.
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
 * A uniformly chosen index in [0, n).
 * @param {() => number} rng
 * @param {number} n
 */
export function randomIndex(rng, n) {
  return Math.floor(rng() * n);
}

/**
 * An index chosen with probability proportional to its weight.
 * @param {() => number} rng
 * @param {number[]} weights non-negative and finite, with a positive sum
 */
export function weightedIndex(rng, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0 && Number.isFinite(total))) throw new Error(`cannot sample from weights summing to ${total}`);
  let u = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    u -= weights[i];
    if (u < 0) return i;
  }
  return weights.length - 1;
}
