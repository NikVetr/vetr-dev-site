// The normal distribution, computed the way R computes it so that results match R to
// floating-point accuracy: pnorm is Cody's rational Chebyshev algorithm (R's
// pnorm_both), qnorm is Wichura's AS 241 (R's qnorm), dnorm follows R's dnorm4.
// Upper tails are computed directly rather than as 1 - p, so they stay accurate far out.
// standardNormal draws by inversion from a seeded uniform generator.

const SQRT_32 = 5.656854249492380195206754896838;
const ONE_OVER_SQRT_2PI = 0.398942280401432677939946059934;
const HALF_EPS = Number.EPSILON * 0.5;

const A = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582, 18154.981253343561249, 0.065682337918207449113];
const B = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205, 45507.789335026729956];
const C = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979, 597.27027639480026226,
  2494.5375852903726711, 6848.1904505362823326, 11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
const D = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805, 6485.558298266760755,
  18615.571640885098091, 34900.952721145977266, 38912.003286093271411, 19685.429676859990727];
const P = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807, 0.001421619193227893466,
  2.9112874951168792e-5, 0.02307344176494017303];
const Q = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515, 0.00378239633202758244, 7.29751555083966205e-5];

/**
 * exp(-x^2 / 2) * factor, with x split so the square loses no precision (R's do_del).
 * @param {number} x
 * @param {number} factor
 */
function gaussianTail(x, factor) {
  const xsq = Math.trunc(x * 16) / 16;
  const del = (x - xsq) * (x + xsq);
  return Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * factor;
}

/**
 * Standard normal lower-tail probability P(Z <= x).
 * @param {number} x
 */
function standardCdf(x) {
  if (Number.isNaN(x)) return NaN;
  const y = Math.abs(x);
  if (y <= 0.67448975) {
    let xnum = 0;
    let xden = 0;
    if (y > HALF_EPS) {
      const xsq = x * x;
      xnum = A[4] * xsq;
      xden = xsq;
      for (let i = 0; i < 3; i++) {
        xnum = (xnum + A[i]) * xsq;
        xden = (xden + B[i]) * xsq;
      }
    }
    return 0.5 + (x * (xnum + A[3])) / (xden + B[3]);
  }
  if (y <= SQRT_32) {
    let xnum = C[8] * y;
    let xden = y;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + C[i]) * y;
      xden = (xden + D[i]) * y;
    }
    const tail = gaussianTail(y, (xnum + C[7]) / (xden + D[7]));
    return x > 0 ? 1 - tail : tail;
  }
  // R 4.6 computes the lower tail down to the end of the subnormal range.
  if (x > -38.4674 && x < 8.2924) {
    const xsq = 1 / (x * x);
    let xnum = P[5] * xsq;
    let xden = xsq;
    for (let i = 0; i < 4; i++) {
      xnum = (xnum + P[i]) * xsq;
      xden = (xden + Q[i]) * xsq;
    }
    let temp = (xsq * (xnum + P[4])) / (xden + Q[4]);
    temp = (ONE_OVER_SQRT_2PI - temp) / y;
    const tail = gaussianTail(x, temp);
    return x > 0 ? 1 - tail : tail;
  }
  return x > 0 ? 1 : 0;
}

/**
 * Normal cumulative distribution function, P(X <= x) for X ~ N(mean, sd^2).
 * @param {number} x
 * @param {number} [mean]
 * @param {number} [sd]
 */
export function pnorm(x, mean = 0, sd = 1) {
  return standardCdf((x - mean) / sd);
}

/**
 * Upper tail P(X > x), computed directly (not as 1 - pnorm) so it keeps its
 * precision when it is tiny.
 * @param {number} x
 * @param {number} [mean]
 * @param {number} [sd]
 */
export function pnormUpper(x, mean = 0, sd = 1) {
  return standardCdf(-(x - mean) / sd);
}

/**
 * P(lower < X < upper). Either bound may be infinite. Whichever tail form keeps the
 * difference away from cancellation is used.
 * @param {number} lower
 * @param {number} upper
 * @param {number} [mean]
 * @param {number} [sd]
 */
export function pnormInterval(lower, upper, mean = 0, sd = 1) {
  if (!(upper > lower)) return 0;
  const a = (lower - mean) / sd;
  const b = (upper - mean) / sd;
  if (a >= 0) return standardCdf(-a) - standardCdf(-b);
  if (b <= 0) return standardCdf(b) - standardCdf(a);
  return 1 - standardCdf(a) - standardCdf(-b);
}

/**
 * Normal density.
 * @param {number} x
 * @param {number} [mean]
 * @param {number} [sd]
 */
export function dnorm(x, mean = 0, sd = 1) {
  const z = Math.abs((x - mean) / sd);
  if (z < 5) return (ONE_OVER_SQRT_2PI * Math.exp(-0.5 * z * z)) / sd;
  if (z > 38.6) return 0;
  // Split z so that z^2 / 2 is exact in its leading part (R's dnorm4).
  const z1 = Math.round(z * 65536) / 65536;
  const z2 = z - z1;
  return (ONE_OVER_SQRT_2PI / sd) * (Math.exp(-0.5 * z1 * z1) * Math.exp((-0.5 * z2 - z1) * z2));
}

/**
 * Normal quantile function (Wichura's AS 241, as in R).
 * @param {number} p probability in [0, 1]
 * @param {number} [mean]
 * @param {number} [sd]
 */
export function qnorm(p, mean = 0, sd = 1) {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const q = p - 0.5;
  let value;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    value = (q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r
      + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r
      + 3.387132872796366608))
      / (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r
        + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
  } else {
    let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
    if (r <= 5) {
      r -= 1.6;
      value = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r
        + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r
        + 1.42343711074968357734)
        / (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r
          + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      value = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r
        + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r
        + 6.6579046435011037772)
        / (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r
          + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
    }
    if (q < 0) value = -value;
  }
  return mean + sd * value;
}

/**
 * A standard normal draw by inversion: the uniform is moved half a step off the
 * grid so it lies strictly inside (0, 1). Inversion keeps a draw tied to its uniform,
 * so changing a mean or a correlation moves each simulated point continuously.
 * @param {() => number} rng uniform on [0, 1), as shared/rng.js's mulberry32
 */
export function standardNormal(rng) {
  return qnorm(rng() + 2 ** -33);
}
