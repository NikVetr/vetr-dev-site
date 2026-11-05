// Number formatting for labels and tables. Minus signs are typographic (U+2212).

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** @param {string} text */
const minus = (text) => text.replace(/^-/, '−');

/**
 * A share as a percentage with three significant figures ("1.24%", "50.0%"); below
 * 0.01% in scientific form ("3.1 × 10⁻⁵%").
 * @param {number} share in [0, 1]
 */
export function formatShare(share) {
  if (share === 0) return '0%';
  const percent = share * 100;
  if (percent >= 0.01) return `${trimPrecision(percent, 3)}%`;
  const [mantissa, exponent] = percent.toExponential(1).split('e');
  const power = String(Number(exponent)).split('').map((ch) => SUPERSCRIPT[/** @type {keyof typeof SUPERSCRIPT} */ (ch)]).join('');
  return `${mantissa} × 10${power}%`;
}

/**
 * toPrecision without exponent notation for values from 0.01 up.
 * @param {number} value
 * @param {number} digits
 */
function trimPrecision(value, digits) {
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(value)));
  return value.toFixed(Math.min(decimals, 6));
}

/**
 * A plain number with fixed decimals and a typographic minus.
 * @param {number} value
 * @param {number} [decimals]
 */
export function formatNumber(value, decimals = 2) {
  const text = value.toFixed(decimals);
  return minus(Number(text) === 0 ? (0).toFixed(decimals) : text);
}

/**
 * A ratio such as "×1.92" (three significant figures).
 * @param {number} value
 */
export function formatRatio(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '×0';
  return `×${value >= 0.01 ? trimPrecision(value, 3) : value.toExponential(1)}`;
}
