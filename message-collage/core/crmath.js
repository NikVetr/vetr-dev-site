// Correctly rounded exp() and pow(), for the parts of the colouring where R's results hinge on
// the last bit. The kernel-density mode that places each message's label has exact ties, which R
// breaks by its floating-point values. R takes exp and pow from the C library, and glibc's are
// correctly rounded in all but about 0.1% of cases; JavaScript engines' Math.exp and Math.pow
// differ from correct rounding in about 10%. Computing them in double-double arithmetic (about
// 100 bits) and rounding once gives glibc's results, and R's ties, nearly always.

const SPLIT = 134217729; // 2^27 + 1, Veltkamp's splitter
const LN2 = [0.6931471805599453, 2.3190468138462996e-17, 5.707708438416212e-34];
const TABLE_BITS = 8; // exp(x) = 2^(k/256) * exp(r), |r| <= ln(2)/512
const TAYLOR_TERMS = 11; // the 11th term of exp(r) is below 2^-120

/** @typedef {[number, number]} DD a double-double: hi + lo, |lo| <= ulp(hi) / 2 */

/** @param {number} a @param {number} b @returns {DD} */
function twoSum(a, b) {
  const s = a + b;
  const bb = s - a;
  return [s, (a - (s - bb)) + (b - bb)];
}

/** @param {number} a @param {number} b @returns {DD} |a| >= |b| */
function quickTwoSum(a, b) {
  const s = a + b;
  return [s, b - (s - a)];
}

/** @param {number} a @param {number} b @returns {DD} */
function twoProd(a, b) {
  const p = a * b;
  const ta = SPLIT * a;
  const ah = ta - (ta - a);
  const al = a - ah;
  const tb = SPLIT * b;
  const bh = tb - (tb - b);
  const bl = b - bh;
  return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
}

/** @param {DD} a @param {DD} b @returns {DD} */
function add(a, b) {
  let [s, e] = twoSum(a[0], b[0]);
  const [t, f] = twoSum(a[1], b[1]);
  e += t;
  [s, e] = quickTwoSum(s, e);
  e += f;
  return quickTwoSum(s, e);
}

/** @param {DD} a @param {DD} b @returns {DD} */
function mul(a, b) {
  const [p, e] = twoProd(a[0], b[0]);
  return quickTwoSum(p, e + (a[0] * b[1] + a[1] * b[0]));
}

/** 1/n! as double-doubles, from exact integer division. @type {DD[]} */
const INV_FACTORIAL = Array.from({ length: 31 }, (_, n) => {
  let f = 1n;
  for (let k = 2; k <= n; k++) f *= BigInt(k);
  const q = (1n << 200n) / f;
  const hi = Number(q) / 2 ** 200;
  return /** @type {DD} */ ([hi, Number(q - BigInt(hi * 2 ** 200)) / 2 ** 200]);
});

/** exp(r) for small |r| by its Taylor series, to `terms` terms. @param {DD} r @param {number} terms */
function taylor(r, terms) {
  let p = INV_FACTORIAL[terms];
  for (let n = terms - 1; n >= 0; n--) p = add(mul(p, r), INV_FACTORIAL[n]);
  return p;
}

/** x - k ln(2) / 2^bits, to double-double precision. @param {DD} x @param {number} k @param {number} bits */
function reduce(x, k, bits) {
  const s = 2 ** -bits;
  let r = add(x, twoProd(-k, LN2[0] * s));
  r = add(r, twoProd(-k, LN2[1] * s));
  return add(r, [-k * LN2[2] * s, 0]);
}

/** 2^(j/256) for j = 0..255: exp((j/256 - k) ln 2) * 2^k, with |j/256 - k| <= 1/2. @type {DD[]} */
const TABLE = Array.from({ length: 1 << TABLE_BITS }, (_, j) => {
  const k = j < 1 << (TABLE_BITS - 1) ? 0 : 1;
  const f = j / (1 << TABLE_BITS) - k; // exact
  const r = add(add(twoProd(f, LN2[0]), twoProd(f, LN2[1])), [f * LN2[2], 0]);
  return mul(taylor(r, 30), [2 ** k, 0]);
});

/** exp(x) = m * 2^k, m a double-double. @param {DD} x */
function expDD(x) {
  const n = 1 << TABLE_BITS;
  const kk = Math.round((x[0] / LN2[0]) * n);
  const j = ((kk % n) + n) % n;
  const m = mul(TABLE[j], taylor(reduce(x, kk, TABLE_BITS), TAYLOR_TERMS));
  return { m, k: (kk - j) / n };
}

/** 2^k * (hi + lo), rounded once (k within the normal range). @param {DD} m @param {number} k */
function scale(m, k) {
  const v = m[0] + m[1];
  // 2^k in two steps when k is near the ends of the exponent range
  return k > 1000 ? v * 2 ** 1000 * 2 ** (k - 1000) : k < -1000 ? v * 2 ** -1000 * 2 ** (k + 1000) : v * 2 ** k;
}

/** Correctly rounded e^x (to nearest, apart from results below 2^-1022). @param {number} x */
export function exp(x) {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.8) return Infinity;
  if (x < -745.2) return 0;
  if (x === 0) return 1;
  const { m, k } = expDD([x, 0]);
  return scale(m, k);
}

/** Correctly rounded x^y for x > 0. @param {number} x @param {number} y */
export function pow(x, y) {
  if (!(x > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return x ** y;
  if (y === 0 || x === 1) return 1;
  // ln x to double-double precision: one Newton step from Math.log, ln x = l + (x - e^l) / e^l
  const l0 = Math.log(x);
  const { m, k } = expDD([l0, 0]);
  const e = mul(m, [2 ** k, 0]);
  const d = add([x, 0], [-e[0], -e[1]]);
  const ln = twoSum(l0, (d[0] + d[1]) / e[0]);
  const t = mul(ln, [y, 0]);
  if (t[0] > 709.8) return Infinity;
  if (t[0] < -745.2) return 0;
  const r = expDD(t);
  return scale(r.m, r.k);
}
