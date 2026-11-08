// Optional drawing aid only: the fitted glyphs and stored image-derived colours remain
// unchanged. Use the actual export background, including a renderSvg override.
import { parseColor } from './request.js';

export const CONTRAST_OUTLINE_EM = 0.06;
export const CONTRAST_ADJUST_TARGET = 1.6;
export const CONTRAST_ADJUST_MAX_BLEND = .2;

/** @param {number[]} rgb */
const luminance = (rgb) => rgb.map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

/** Choose an outline for a low-contrast glyph, or null if its fill is clear.
 * @param {string} fill validated glyph colour, optionally with an alpha byte
 * @param {string} background validated opaque background colour
 * @returns {'#000000' | '#ffffff' | null}
 */
export function contrastOutline(fill, background) {
  const ink = parseColor(fill.length === 9 ? fill.slice(0, 7) : fill);
  const paper = parseColor(background);
  if (!ink || !paper) throw new Error('contrastOutline requires valid glyph and background colours');
  const alpha = fill.length === 9 ? parseInt(fill.slice(7), 16) / 255 : 1;
  const bg = luminance(paper);
  const fg = luminance(ink.map((c, i) => c * alpha + paper[i] * (1 - alpha)));
  if ((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) >= 3) return null;
  return (bg + 0.05) / 0.05 >= 1.05 / (bg + 0.05) ? '#000000' : '#ffffff';
}

/** Gentle alternative to an outline: make the smallest neutral blend toward
 * black/white that reaches the modest target, capped to preserve pale colours.
 * The original result/palette and alpha remain unchanged; this is drawing only.
 * @param {string} fill validated glyph colour, optionally with an alpha byte
 * @param {string} background validated opaque background
 */
export function adjustedContrastColour(fill, background) {
  const ink = parseColor(fill.length === 9 ? fill.slice(0, 7) : fill), paper = parseColor(background);
  if (!ink || !paper) throw new Error('Colour adjustment requires valid glyph and background colours');
  const alpha = fill.length === 9 ? parseInt(fill.slice(7), 16) / 255 : 1;
  const bg = luminance(paper);
  const blended = (/** @type {number} */ amount, /** @type {number} */ target) => ink.map(c => c + (target - c) * amount);
  const contrast = (/** @type {number} */ amount, /** @type {number} */ target) => {
    const fg = luminance(blended(amount, target).map((c, i) => c * alpha + paper[i] * (1 - alpha)));
    return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
  };
  const initial = contrast(0, 0);
  if (initial >= CONTRAST_ADJUST_TARGET) return fill;
  const candidates = [0, 255].map(target => {
    let lo = 0, hi = CONTRAST_ADJUST_MAX_BLEND;
    const reaches = contrast(hi, target) >= CONTRAST_ADJUST_TARGET;
    if (reaches) for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (contrast(mid, target) >= CONTRAST_ADJUST_TARGET) hi = mid; else lo = mid;
    }
    return { target, amount: hi, reaches, contrast: contrast(hi, target) };
  }).sort((a, b) => Number(b.reaches) - Number(a.reaches) || (a.reaches ? a.amount - b.amount : b.contrast - a.contrast));
  const best = candidates[0];
  if (best.contrast <= initial) return fill;
  return `#${blended(best.amount, best.target).map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}${fill.length === 9 ? fill.slice(7) : ''}`;
}
