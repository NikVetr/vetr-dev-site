// Sums and means as close as doubles allow to R's, which accumulates in long
// double: compensated (Neumaier) summation, and mean() with R's refinement pass.

/** @param {ArrayLike<number>} values */
export function sum(values) {
  let s = 0;
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
  }
  return s + c;
}

/** @param {ArrayLike<number>} values */
export function mean(values) {
  const n = values.length;
  const m = sum(values) / n;
  if (!Number.isFinite(m)) return m;
  let s = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i] - m;
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
  }
  return m + (s + c) / n;
}

/**
 * R's round(x, digits) (R >= 4.0): the nearer of the two decimal candidates
 * either side of x, ties to the even last digit.
 * @param {number} x @param {number} digits a whole number
 */
export function roundR(x, digits) {
  if (!Number.isFinite(x) || x === 0) return x;
  if (digits === 0) return roundHalfEven(x);
  const sgn = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (digits + (Math.floor(Math.log2(ax)) + 0.5) * Math.LOG10E * Math.LN2 > 15) return x;
  const p10 = 10 ** digits;
  const x10 = p10 * ax;
  const i10 = Math.floor(x10);
  const xd = i10 / p10;
  const xu = Math.ceil(x10) / p10;
  const du = xu - ax;
  const dd = ax - xd;
  return sgn * (du < dd || (du === dd && i10 % 2 === 1) ? xu : xd);
}

/** @param {number} x */
function roundHalfEven(x) {
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
