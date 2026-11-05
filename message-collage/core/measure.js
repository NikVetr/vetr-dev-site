// Text measurement in grid cells (R/measure.R): each message's words, a space and its cap
// height, at R's cex = its relative size, on R's measuring device. That device is a cairo_pdf of
// the card's target size, which R creates in whole points (it passes 72 x width as an integer),
// with zero margins and R's default 4% axis expansion around [0, n_cols] x [0, n_rows]. The
// arithmetic follows showtext and R's unit conversion step by step, so the numbers are R's to the
// last bit.

import { advances, faceKey } from './fonts.js';

/**
 * @typedef {import('./fonts.js').Face} Face
 * @typedef {{ family: string, style: import('./request.js').StyleName, size: number }} FontChoice
 * @typedef {{ words: string[], w: number[], ws: number, h: number, total: number }} Dims
 *   widths of the words and of a space, the cap height (R's strheight), and full width x cap height
 */

const POINTSIZE = 12; // cairo_pdf's default pointsize

/**
 * @param {string[]} messages in layout order
 * @param {FontChoice[]} fonts one per message
 * @param {Map<string, Face>} faces
 * @param {number} nCols @param {number} nRows @param {number} widthIn @param {number} heightIn
 * @returns {Dims[]}
 */
export function measureMessages(messages, fonts, faces, nCols, nRows, widthIn, heightIn) {
  const toCellsX = deviceToUser(nCols, Math.trunc(72 * widthIn));
  const toCellsY = deviceToUser(nRows, Math.trunc(72 * heightIn));
  return messages.map((text, i) => {
    const { family, style, size } = fonts[i];
    const face = /** @type {Face} */ (faces.get(faceKey(family, style)));
    const perUnit = (POINTSIZE * size) / face.unitsPerEm; // points per font unit
    const width = (/** @type {string} */ s) => {
      let w = 0;
      for (const a of advances(face, s)) w += a * perUnit;
      return toCellsX(w);
    };
    const words = text.split(' ');
    if (words.length > 1 && words.at(-1) === '') words.pop(); // as strsplit drops a trailing empty piece
    const h = toCellsY(face.capAscent * perUnit);
    return { words, w: words.map(width), ws: width(' '), h, total: width(text) * h };
  });
}

/**
 * R's conversion of a length in device units (points) to user units along one axis: through the
 * figure region (the whole device) and the window [0 - 4%, n + 4%] (GScale, GMapWin2Fig).
 * @param {number} n cells along the axis @param {number} devicePoints the device's extent
 */
function deviceToUser(n, devicePoints) {
  const expand = 0.04 * (n - 0);
  const usr0 = 0 - expand;
  const usr1 = n + expand;
  const win2fig = ((1 - 0) / (usr1 / 2 - usr0 / 2)) / 2;
  return (/** @type {number} */ d) => (d / devicePoints) / win2fig;
}
