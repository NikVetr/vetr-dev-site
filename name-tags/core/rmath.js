// The pieces of R's arithmetic, nmath library and base functions the layout
// uses, written as R computes them so results match R's to the last bit or
// two: dnorm and pnorm (src/nmath/dnorm.c, pnorm.c), qnorm for normal draws
// (qnorm.c), %% on doubles (myfmod in src/main/arithmetic.c), sum() and
// cumsum() of doubles, which R accumulates in long double, seq(), median()
// and round().

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

/**
 * Standard normal quantile for 0 < p < 1, as R's qnorm(p) (Wichura's AS 241).
 * @param {number} p
 */
export function qnorm(p) {
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

/** cumsum() of doubles, accumulated with compensation as R does in long double. @param {number[]} values */
export function cumsum(values) {
  const out = new Array(values.length);
  let s = 0;
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
    out[i] = s + c;
  }
  return out;
}

/** seq(from, to, length.out = n), n rounded up as R does. @param {number} from @param {number} to @param {number} n */
export function seqLength(from, to, n) {
  const len = Math.ceil(n);
  if (len === 1) return [from];
  if (len === 2) return [from, to];
  if (from === to) return new Array(len).fill(from);
  const n1 = len - 1;
  const by = (to - from) / n1;
  const out = [from];
  for (let i = 1; i < n1; i++) out.push(from + i * by);
  out.push(to);
  return out;
}

/** seq(from, to, by = by) for by > 0. @param {number} from @param {number} to @param {number} by */
export function seqBy(from, to, by) {
  const del = to - from;
  if (del === 0 && to === 0) return [to];
  if (Math.abs(del) / Math.max(Math.abs(to), Math.abs(from)) < 100 * DBL_EPSILON) return [from];
  const n = Math.trunc(del / by + 1e-10);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(Math.min(from + i * by, to));
  return out;
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
