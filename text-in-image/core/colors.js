// Glyph colours, as R's assign_char_colors: each placed glyph takes the modal
// colour of the pixels of its line's nearest pixel row, between the midpoints
// to its neighbours. With ink compensation, colours are boosted so a glyph
// covering only part of its box blends with the background to the pixel colour.

import { countAtMost } from './layout.js';
import { nearestRow } from './region.js';

/**
 * @param {{ txt: string[], x: (number | null)[], y: (number | null)[], line: (number | null)[] }} glyphs
 * @param {Map<string, number>} widths advance widths in unit-square x
 * @param {import('./quantize.js').Raster} raster the (rotated) processed image
 * @param {import('./region.js').Region} region
 * @param {Map<string, number> | null} inkCoverage per character, or null for no compensation
 * @param {import('./request.js').Rgb} background 0-255, the colour compensation targets
 * @returns {(string | null)[]} "#rrggbb" ("#rrggbbaa" for a partly transparent pixel), null when unplaced or blank
 */
export function glyphColors({ txt, x, y, line }, widths, raster, region, inkCoverage, background) {
  /** @type {(string | null)[]} */
  const colors = txt.map(() => null);
  /** @type {Map<number, number[]>} */
  const lines = new Map();
  txt.forEach((_, i) => {
    const l = line[i];
    if (x[i] === null || l === null || txt[i] === '\n') return; // explicit line breaks carry no ink or colour sample
    if (!lines.has(l)) lines.set(l, []);
    /** @type {number[]} */ (lines.get(l)).push(i);
  });

  for (const idx of lines.values()) {
    const r = nearestRow(region, /** @type {number} */ (y[idx[0]]));
    const cols = [];
    for (let c = 0; c < region.width; c++) if (region.hits[r * region.width + c]) cols.push(c);
    const subX = cols.map((c) => (c + 1) / region.width);
    const subCol = cols.map((c) => pixelHex(raster.rgba, 4 * (r * region.width + c)));
    // nearest pixel (1-based) to each glyph's centre, then the pixels between
    // the midpoints to the neighbouring glyphs' nearest pixels
    const breaks = [-Infinity, ...subX.slice(1).map((v, j) => v - (v - subX[j]) / 2), Infinity];
    const nearestPixel = idx.map((i) => countAtMost(breaks, /** @type {number} */ (x[i]) + /** @type {number} */ (widths.get(txt[i])) / 2));
    const bounds = [0, ...nearestPixel.slice(0, -1).map((v, j) => v + Math.floor((nearestPixel[j + 1] - v) / 2)), subX.length];
    idx.forEach((i, j) => {
      // R's a:b, which counts down when a > b
      const a = bounds[j] + 1;
      const b = bounds[j + 1];
      const native = modalColor(subCol.slice(Math.min(a, b) - 1, Math.max(a, b)));
      colors[i] = inkCoverage ? compensate(native, /** @type {number} */ (inkCoverage.get(txt[i])), background) : native;
    });
  }
  return colors;
}

/**
 * The most frequent colour; on ties the first in sorted order, as R's
 * names(table(x))[which.max(table(x))].
 * @param {string[]} colors
 */
function modalColor(colors) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = '';
  let bestN = 0;
  for (const [c, k] of counts) {
    if (k > bestN || (k === bestN && c < best)) { best = c; bestN = k; }
  }
  return best;
}

/**
 * The colour that, covering a fraction p = coverage^0.5 of its box over the
 * background, averages to `native`; scaled down to stay in gamut. A blank
 * glyph (no ink) gets no colour.
 * @param {string} native @param {number} coverage @param {import('./request.js').Rgb} background
 */
function compensate(native, coverage, background) {
  const p = Math.sqrt(coverage);
  const needed = [1, 3, 5].map((k, ch) => (parseInt(native.slice(k, k + 2), 16) - background[ch] * (1 - p)) / p / 255);
  if (!needed.every(Number.isFinite)) return null;
  const top = Math.max(...needed, 1);
  return rgbHex(needed.map((v) => Math.max(v, 0) / top));
}

/** @param {Float64Array} rgba @param {number} k index of the pixel's red value */
function pixelHex(rgba, k) {
  const hex = rgbHex([rgba[k], rgba[k + 1], rgba[k + 2]]);
  const alpha = Math.round(rgba[k + 3] * 255);
  return alpha === 255 ? hex : hex + alpha.toString(16).padStart(2, '0');
}

/** "#rrggbb" of a [0, 1] RGB colour, rounded as R's rgb(). @param {number[]} rgb */
export function rgbHex(rgb) {
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}
