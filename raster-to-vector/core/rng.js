// R's default random number generator, so that a seed gives the same k-means
// starts as the R version: Mersenne-Twister seeded as set.seed() seeds it,
// unif_rand(), and the two kinds of sample(x, 1) the quantizer makes
// (uniform, by rejection sampling, and weighted, as ProbSampleNoReplace in
// R's src/main/random.c). Validated against R 4.6 draws in tests.

const N = 624;
const M = 397;
const I2_32M1 = 2.328306437080797e-10; // 1 / (2^32 - 1)

/**
 * @param {number} seed an integer, as set.seed() takes (negative values wrap as in C)
 */
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

  /** sample(n, 1) - 1: a uniform index in [0, n), by R's rejection sampling. @param {number} n */
  function index(n) {
    if (n <= 0) return 0;
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
   * sample(n, 1, prob = p) - 1: an index drawn with probability proportional to p,
   * exactly as R's ProbSampleNoReplace draws one (heap sort into descending order,
   * then a walk along the cumulative mass).
   * @param {ArrayLike<number>} weights non-negative and finite, at least one positive
   */
  function weighted(weights) {
    const n = weights.length;
    const p = Float64Array.from(weights);
    let sum = 0;
    let npos = 0;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(p[i]) || p[i] < 0) throw new Error('sampling weights must be finite and non-negative');
      if (p[i] > 0) {
        npos++;
        sum += p[i];
      }
    }
    if (npos === 0) throw new Error('too few positive probabilities');
    for (let i = 0; i < n; i++) p[i] /= sum;
    const perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    revsort(p, perm);
    const rT = unif();
    let mass = 0;
    let j = 0;
    for (; j < n - 1; j++) {
      mass += p[j];
      if (rT <= mass) break;
    }
    return perm[j];
  }

  return { unif, index, weighted };
}

/**
 * R's revsort(): sorts a into descending order by heapsort, permuting ib alongside.
 * Ties end up in heap order, which the weighted draw depends on.
 * @param {Float64Array} a @param {Int32Array} ib
 */
function revsort(a, ib) {
  const n = a.length;
  if (n <= 1) return;
  // 1-based indexing, as in R's source
  const A = (/** @type {number} */ i) => a[i - 1];
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
