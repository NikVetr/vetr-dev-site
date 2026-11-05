// Seeded random numbers for the tools' DOM-free cores. Two generators, each giving the same
// stream in Node and in every browser:
//
// - mulberry32(seed): a small uniform generator, for tools that only need reproducible draws.
// - rMersenneTwister(seed): R's default generator, for ports of R code that must draw what R
//   draws after set.seed(seed): the Mersenne-Twister seeded as set.seed() seeds it, unif_rand(),
//   normals by inversion (R's default normal.kind), and sample()'s uniform and weighted draws
//   (R >= 3.6 "Rejection" sampling). See R's src/main/RNG.c, src/main/random.c and
//   src/nmath/snorm.c.
//
// The two give different streams from the same seed, so a tool keeps the one it was built on.

/**
 * Uniform numbers in [0, 1) from mulberry32.
 * @param {number} seed integer in [0, 2^32 - 1]
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 624;
const M = 397;
const I2_32M1 = 2.328306437080797e-10; // 1 / (2^32 - 1)

/**
 * R's default random number generator, seeded as set.seed(seed) seeds it.
 * @param {number} seed an integer, as set.seed() takes (negative values wrap as in C)
 */
export function rMersenneTwister(seed) {
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

  /** norm_rand() by inversion: two uniforms, for enough bits, through qnorm. */
  function norm() {
    const BIG = 134217728; // 2^27
    let u = unif();
    u = Math.trunc(BIG * u) + unif();
    return qnorm(u / BIG);
  }

  /** R_unif_index(n), sample(n, 1) - 1: a uniform index in [0, n), by rejection sampling. @param {number} n */
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
   * the weights checked and normalized as R's FixupProb does, heap-sorted into descending
   * order, then for each draw a walk along the remaining mass. One draw (k = 1) is also what
   * sampling with replacement gives.
   * @param {ArrayLike<number>} weights non-negative and finite, at least k positive
   * @param {number} [k]
   * @returns {number[]} k indices
   */
  function weighted(weights, k = 1) {
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
    if (npos < k) throw new Error('too few positive probabilities');
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

  return { unif, norm, index, uniform, weighted };
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

/**
 * Standard normal quantile for 0 < p < 1 (Wichura's AS 241, as R's qnorm), for norm().
 * @param {number} p
 */
function qnorm(p) {
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r
      + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r
      + 3.387132872796366608)
      / (((((((r * 5226.495278852854561 + 28729.085735721942674) * r + 39307.89580009271061) * r
        + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
  }
  let r = Math.sqrt(-Math.log(q > 0 ? 1 - p : p));
  let val;
  if (r <= 5) {
    r += -1.6;
    val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r
      + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r
      + 1.42343711074968357734)
      / (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r
        + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
  } else {
    r += -5;
    val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r
      + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r
      + 6.6579046435011037772)
      / (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r
        + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
  }
  return q < 0 ? -val : val;
}
