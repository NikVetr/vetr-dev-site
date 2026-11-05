// R's sum() and mean() of doubles, as close as doubles allow: R accumulates in
// long double, so these use compensated (Neumaier) summation, and mean() adds
// R's refinement pass.

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
