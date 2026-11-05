// The pieces of R's arithmetic, nmath library and base functions the layout
// uses, written as R computes them so results match R's to the last bit or
// two: dnorm and pnorm (src/nmath/dnorm.c, pnorm.c), %% on doubles (myfmod in
// src/main/arithmetic.c), sum() of doubles, which R accumulates in long double,
// median() and round(). R's normal draws, with their qnorm, are in
// shared/rng.js; cumsum() and seq() in shared/rstats.js.

const M_1_SQRT_2PI = 0.398942280401432677939946059934;
const M_LN_SQRT_2PI = 0.918938533204672741780329736406;
const M_SQRT_32 = 5.656854249492380195206754896838;
const DBL_EPSILON = 2.220446049250313e-16;

/** C's nearbyint in the default rounding mode, and R's round(x): halves to even. @param {number} x */
export function roundHalfEven(x) {
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * Normal density, as R's dnorm(x, mean, sd, log).
 * @param {number} x @param {number} mu @param {number} sigma @param {boolean} [giveLog]
 */
export function dnorm(x, mu, sigma, giveLog = false) {
  let z = Math.abs((x - mu) / sigma);
  if (!Number.isFinite(z)) return giveLog ? -Infinity : 0;
  if (giveLog) return -(M_LN_SQRT_2PI + 0.5 * z * z + Math.log(sigma));
  if (z < 5) return M_1_SQRT_2PI * Math.exp(-0.5 * z * z) / sigma;
  if (z > Math.sqrt(-2 * Math.LN2 * (-1021 + 1 - 53))) return 0;
  const z1 = roundHalfEven(z * 65536) / 65536;
  const z2 = z - z1;
  return M_1_SQRT_2PI / sigma * (Math.exp(-0.5 * z1 * z1) * Math.exp((-0.5 * z2 - z1) * z2));
}

const A = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582, 18154.981253343561249, 0.065682337918207449113];
const B = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205, 45507.789335026729956];
const C = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979, 597.27027639480026226, 2494.5375852903726711,
  6848.1904505362823326, 11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
const D = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805, 6485.558298266760755, 18615.571640885098091,
  34900.952721145977266, 38912.003286093271411, 19685.429676859990727];
const P = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807, 0.001421619193227893466, 2.9112874951168792e-5,
  0.02307344176494017303];
const Q = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515, 0.00378239633202758244, 7.29751555083966205e-5];

/**
 * Lower-tail normal probability, as R's pnorm(x, mean, sd) (Cody's algorithm).
 * @param {number} x @param {number} mu @param {number} sigma
 */
export function pnorm(x, mu, sigma) {
  const z = (x - mu) / sigma;
  if (!Number.isFinite(z)) return x < mu ? 0 : 1;
  const y = Math.abs(z);
  let cum;
  let ccum;
  /** @param {number} X @param {number} temp */
  const del = (X, temp) => {
    const xsq = Math.trunc(X * 16) / 16;
    const d = (X - xsq) * (X + xsq);
    cum = Math.exp(-xsq * (xsq / 2)) * Math.exp(-(d / 2)) * temp;
    ccum = 1 - cum;
    if (z > 0) [cum, ccum] = [ccum, cum];
  };
  if (y <= 0.67448975) {
    let xnum = 0;
    let xden = 0;
    if (y > DBL_EPSILON * 0.5) {
      const xsq = z * z;
      xnum = A[4] * xsq;
      xden = xsq;
      for (let i = 0; i < 3; i++) {
        xnum = (xnum + A[i]) * xsq;
        xden = (xden + B[i]) * xsq;
      }
    }
    cum = 0.5 + z * (xnum + A[3]) / (xden + B[3]);
  } else if (y <= M_SQRT_32) {
    let xnum = C[8] * y;
    let xden = y;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + C[i]) * y;
      xden = (xden + D[i]) * y;
    }
    del(y, (xnum + C[7]) / (xden + D[7]));
  } else if (-38.4674 < z && z < 8.2924) {
    const xsq = 1 / (z * z);
    let xnum = P[5] * xsq;
    let xden = xsq;
    for (let i = 0; i < 4; i++) {
      xnum = (xnum + P[i]) * xsq;
      xden = (xden + Q[i]) * xsq;
    }
    const temp = xsq * (xnum + P[4]) / (xden + Q[4]);
    del(z, (M_1_SQRT_2PI - temp) / y);
  } else {
    cum = z > 0 ? 1 : 0;
  }
  return /** @type {number} */ (cum);
}

/** Splits a double into two halves whose products are exact (Veltkamp). @param {number} a */
function split(a) {
  const c = 134217729 * a; // 2^27 + 1
  const hi = c - (c - a);
  return [hi, a - hi];
}

/** The rounding error of a * b, so that a * b = fl(a * b) + error exactly. @param {number} a @param {number} b */
function productError(a, b) {
  const p = a * b;
  const [ah, al] = split(a);
  const [bh, bl] = split(b);
  return ((ah * bh - p) + ah * bl + al * bh) + al * bl;
}

/**
 * x1 %% x2 for positive finite doubles. R computes x1 - floor(x1/x2) * x2 in
 * long double, which is exact here, and rounds once; so does this.
 * @param {number} x1 @param {number} x2
 */
export function rmod(x1, x2) {
  const k = Math.floor(x1 / x2);
  const p = k * x2;
  const r = (x1 - p) - productError(k, x2); // x1 - p is exact (Sterbenz)
  return r < 0 ? r + x2 : r;
}

/**
 * sum() of doubles. R adds in long double; a compensated sum rounded once
 * gives the same double except in rare double-rounding ties.
 * @param {number[]} values
 */
export function rsum(values) {
  let s = 0;
  let c = 0;
  for (const v of values) {
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
  }
  return s + c;
}

/** median() of numbers. @param {number[]} values */
export function median(values) {
  const v = values.slice().sort((a, b) => a - b);
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}

/** mean() of doubles. @param {number[]} values */
export function mean(values) {
  return rsum(values) / values.length;
}
