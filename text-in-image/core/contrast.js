// Optional drawing aid only: the fitted glyphs and image-derived fills remain
// unchanged. Use the actual export background, including a renderSvg override.
import { parseColor } from './request.js';

export const CONTRAST_OUTLINE_EM = 0.06;

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
