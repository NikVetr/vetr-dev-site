// R's default random numbers: the Mersenne-Twister seeded as set.seed() seeds
// it, uniforms as unif_rand() returns them, and normals by inversion (R's
// default normal.kind). A seed therefore draws the same optimizer restarts and
// stroke jitter as the R version with set.seed(seed) (src/main/RNG.c,
// src/nmath/snorm.c).

import { qnorm } from './rmath.js';

const N = 624;
const M = 397;
const I2_32M1 = 2.328306437080797e-10; // 1 / (2^32 - 1)

/** @param {number} seed R's 69069 linear congruential step, mod 2^32 */
const lcg = (seed) => (Math.imul(69069, seed) + 1) >>> 0;

/**
 * @param {number} seed an integer, as given to set.seed()
 * @returns {{ unif: () => number, norm: () => number }}
 */
export function createRng(seed) {
  let s = seed >>> 0;
  for (let j = 0; j < 50; j++) s = lcg(s); // set.seed's initial scrambling
  // i_seed[0] is mti (reset to 624 by FixupSeeds), i_seed[1..624] the state
  s = lcg(s);
  const mt = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    s = lcg(s);
    mt[i] = s;
  }
  let mti = N;

  function genrand() {
    if (mti >= N) {
      let kk = 0;
      let y = 0;
      for (; kk < N - M; kk++) {
        y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      for (; kk < N - 1; kk++) {
        y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      mti = 0;
    }
    let y = mt[mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return (y >>> 0) * 2.3283064365386963e-10;
  }

  function unif() {
    const x = genrand();
    if (x <= 0) return 0.5 * I2_32M1;
    if (1 - x <= 0) return 1 - 0.5 * I2_32M1;
    return x;
  }

  function norm() {
    const BIG = 134217728; // 2^27
    let u = unif();
    u = Math.trunc(BIG * u) + unif();
    return qnorm(u / BIG);
  }

  return { unif, norm };
}
