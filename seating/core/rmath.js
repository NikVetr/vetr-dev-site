// R arithmetic that plain doubles do not reproduce. sum(), rowSums() and colSums() add in
// x87 long double (64-bit significand) and round once to double at the end, so the same
// numbers in a different order can give different doubles in plain JS but one in R. The
// search compares table scores (ties decide R's weighted draws) and keeps the best seating
// only on a strict improvement, so its sums have to come out exactly as R's do.

/**
 * R's sum() of doubles: each addition rounded to 64 significant bits, ties to even, and the
 * total rounded to double. The accumulator is kept exactly as hi + lo.
 * @param {Iterable<number>} values
 */
export function rsum(values) {
  let hi = 0;
  let lo = 0;
  for (const x of values) {
    const s = hi + x;
    const v = s - hi;
    const e = (hi - (s - v)) + (x - v); // hi + x = s + e exactly
    const t = e + lo;
    if (t === 0) {
      hi = s;
      lo = 0;
      continue;
    }
    // the exact value s + t, renormalized to a + b with |b| <= ulp(a) / 2
    const a = s + t;
    const w = a - s;
    const b = (s - (a - w)) + (t - w);
    if (b === 0 || a === 0) {
      hi = a;
      lo = b;
      continue;
    }
    // round b to the 64-bit grid of the value's binade; a lies on it with an even last bit
    let exp = exponentOf(a);
    if (Math.abs(a) === 2 ** exp && Math.sign(b) !== Math.sign(a)) exp--;
    const q = 2 ** (exp - 63);
    const r = roundHalfEven(b / q) * q;
    hi = a + r;
    lo = r - (hi - a);
  }
  return hi + lo;
}

/** floor(log2 |x|) for a finite non-zero double. @param {number} x */
function exponentOf(x) {
  const ax = Math.abs(x);
  let e = Math.floor(Math.log2(ax));
  if (2 ** e > ax) e--;
  else if (2 ** (e + 1) <= ax) e++;
  return e;
}

/** @param {number} x */
function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d !== 0.5) return d < 0.5 ? f : f + 1;
  return f % 2 === 0 ? f : f + 1;
}
