// R's default random number generator, so that a seed gives the same chain as the R version
// with set.seed(seed): the Mersenne-Twister seeded as set.seed() seeds it, unif_rand(), and
// the three kinds of sample() the search makes (src/main/RNG.c, src/main/random.c, R >= 3.6
// "Rejection" sampling). The generator itself is raster-to-vector's port.

const N = 624;
const M = 397;
const I2_32M1 = 2.328306437080797e-10; // 1 / (2^32 - 1)

/** @param {number} seed a whole number, as set.seed() takes */
export function createRng(seed) {
  const mt = new Uint32Array(N);
  let s = seed >>> 0;
  const step = () => { s = (Math.imul(69069, s) + 1) >>> 0; };
  for (let j = 0; j < 50; j++) step(); // R's initial scrambling
  step(); // the first of the 625 seeds is the position, which R then resets to 624
  for (let j = 0; j < N; j++) {
    step();
    mt[j] = s;
  }
  let mti = N;

  function genrand() {
    if (mti >= N) {
      let kk = 0;
      let y;
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

  /** unif_rand(): uniform on (0, 1). */
  function unif() {
    const x = genrand();
    if (x <= 0) return 0.5 * I2_32M1;
    if (1 - x <= 0) return 1 - 0.5 * I2_32M1;
    return x;
  }

  /** R_unif_index(n): a uniform index in [0, n), by rejection sampling. @param {number} n */
  function index(n) {
    const bits = Math.ceil(Math.log2(n));
    let v;
    do {
      v = 0;
      for (let b = 0; b <= bits; b += 16) v = 65536 * v + Math.floor(unif() * 65536);
      v %= 2 ** bits;
    } while (n <= v);
    return v;
  }

  /**
   * sample(n, k) - 1: k distinct indices in [0, n), each uniform among those left (R's
   * partial Fisher-Yates).
   * @param {number} n @param {number} k
   */
  function uniform(n, k) {
    const x = Array.from({ length: n }, (_, i) => i);
    const out = new Array(k);
    for (let i = 0; i < k; i++) {
      const j = index(n);
      out[i] = x[j];
      x[j] = x[--n];
    }
    return out;
  }

  /**
   * sample(n, k, prob = p) - 1 without replacement, as R's ProbSampleNoReplace draws it:
   * the weights normalized, heap-sorted into descending order, then for each draw a walk
   * along the remaining mass. One draw (k = 1) is also what sampling with replacement gives.
   * @param {ArrayLike<number>} weights non-negative and finite, at least k positive
   * @param {number} [k]
   */
  function weighted(weights, k = 1) {
    const n = weights.length;
    const p = Float64Array.from(weights);
    let sum = 0;
    for (let i = 0; i < n; i++) if (p[i] > 0) sum += p[i];
    for (let i = 0; i < n; i++) p[i] /= sum;
    const perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    revsort(p, perm);
    const out = new Array(k);
    let total = 1;
    for (let i = 0, n1 = n - 1; i < k; i++, n1--) {
      const rT = total * unif();
      let mass = 0;
      let j = 0;
      for (; j < n1; j++) {
        mass += p[j];
        if (rT <= mass) break;
      }
      out[i] = perm[j];
      total -= p[j];
      for (let m = j; m < n1; m++) {
        p[m] = p[m + 1];
        perm[m] = perm[m + 1];
      }
    }
    return out;
  }

  return { unif, index, uniform, weighted };
}

/**
 * R's revsort(): sorts a into descending order by heapsort, permuting ib alongside.
 * Ties end up in heap order, which the weighted draw depends on.
 * @param {Float64Array} a @param {Int32Array} ib
 */
function revsort(a, ib) {
  const n = a.length;
  if (n <= 1) return;
  const A = (/** @type {number} */ i) => a[i - 1]; // 1-based, as in R's source
  let l = (n >> 1) + 1;
  let ir = n;
  for (;;) {
    let ra;
    let ii;
    if (l > 1) {
      l--;
      ra = A(l);
      ii = ib[l - 1];
    } else {
      ra = A(ir);
      ii = ib[ir - 1];
      a[ir - 1] = a[0];
      ib[ir - 1] = ib[0];
      if (--ir === 1) {
        a[0] = ra;
        ib[0] = ii;
        return;
      }
    }
    let i = l;
    let j = l << 1;
    while (j <= ir) {
      if (j < ir && A(j) > A(j + 1)) ++j;
      if (ra > A(j)) {
        a[i - 1] = a[j - 1];
        ib[i - 1] = ib[j - 1];
        i = j;
        j += j;
      } else {
        j = ir + 1;
      }
    }
    a[i - 1] = ra;
    ib[i - 1] = ii;
  }
}
