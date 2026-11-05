// Glyph outlines of the bundled fonts, as the R version gets them from
// showtext: each character's TrueType outline, unhinted and unscaled
// (FreeType's FT_LOAD_NO_SCALE), walked the way FT_Outline_Decompose walks it
// (integer midpoints between consecutive off-curve points) and flattened the
// way showtext flattens it (each quadratic arc as 11 points at accumulated
// steps of 1/10, starting with the arc's first point). Characters sit one
// advance width apart, with no kerning, as showtext places them. Fonts are
// read with fontkit when this module is first imported (a file read in Node,
// a fetch in a browser or worker), so everything after that is synchronous.

import * as fontkit from '../../pocket-language-guide/vendor/fontkit.esm.js';
import { FONTS } from './request.js';

/**
 * The parts of fontkit used here. _getContours() is fontkit's own decoding
 * of the glyf points (composites resolved), before it builds a path.
 * @typedef {{ onCurve: boolean, x: number, y: number }} RawPoint
 * @typedef {{ id: number, advanceWidth: number, _getContours(): RawPoint[][] }} FontkitGlyph
 * @typedef {{ unitsPerEm: number, glyphForCodePoint(codePoint: number): FontkitGlyph, hasGlyphForCodePoint(codePoint: number): boolean }} FontkitFont
 * @typedef {number[]} Ring flat [x0, y0, x1, y1, ...], closed (last point = first)
 * @typedef {{ char: string, rings: Ring[] }} GlyphOutline
 */


/** @param {string} file */
async function load(file) {
  const url = new URL(`../${file}`, import.meta.url);
  const bytes = url.protocol === 'file:'
    ? (await import('node:fs')).readFileSync(url)
    : new Uint8Array(await (await fetch(url)).arrayBuffer());
  return /** @type {FontkitFont} */ (/** @type {unknown} */ (fontkit.create(bytes)));
}

/** @type {Record<string, Record<1 | 2, FontkitFont>>} */
const loaded = {};
for (const [family, faces] of Object.entries(FONTS)) {
  loaded[family] = { 1: await load(faces[1]), 2: await load(faces[2]) };
}

/** @param {string} family @param {1 | 2} face */
export function fontFace(family, face) {
  const font = loaded[family]?.[face];
  if (!font) throw new Error(`no bundled font ${family} face ${face}`);
  return font;
}

/** @param {string} text @param {string} family @returns {string[]} characters the plain face has no glyph for */
export function missingChars(text, family) {
  const font = fontFace(family, 1);
  return [...new Set([...text])].filter((c) => !/\s/.test(c) && !font.hasGlyphForCodePoint(/** @type {number} */ (c.codePointAt(0))));
}

/**
 * One contour as FreeType decomposes it and showtext flattens it, shifted
 * right by `dx` font units.
 * @param {RawPoint[]} pts @param {number} dx
 * @returns {Ring}
 */
function flattenContour(pts, dx) {
  /** @type {number[]} */
  const out = [];
  let cx = 0;
  let cy = 0;
  const lineTo = (/** @type {number} */ x, /** @type {number} */ y) => {
    out.push(x + dx, y);
    cx = x;
    cy = y;
  };
  const conicTo = (/** @type {number} */ kx, /** @type {number} */ ky, /** @type {number} */ x, /** @type {number} */ y) => {
    const delta = 1 / 10;
    for (let l = 0, ol = 1; l < 1; l += delta, ol -= delta) {
      out.push(ol * ol * cx + 2 * l * ol * kx + l * l * x + dx, ol * ol * cy + 2 * l * ol * ky + l * l * y);
    }
    cx = x;
    cy = y;
  };
  const mid = (/** @type {number} */ a, /** @type {number} */ b) => Math.trunc((a + b) / 2); // FT_Pos arithmetic

  let first = 0;
  let limit = pts.length - 1;
  let start = { x: pts[0].x, y: pts[0].y };
  if (!pts[0].onCurve) {
    if (pts[limit].onCurve) {
      start = { x: pts[limit].x, y: pts[limit].y };
      limit--;
    } else {
      start = { x: mid(pts[0].x, pts[limit].x), y: mid(pts[0].y, pts[limit].y) };
    }
    first = -1;
  }
  lineTo(start.x, start.y); // move_to
  let i = first;
  let closedByConic = false;
  while (i < limit) {
    i++;
    if (pts[i].onCurve) {
      lineTo(pts[i].x, pts[i].y);
      continue;
    }
    let kx = pts[i].x;
    let ky = pts[i].y;
    for (;;) {
      if (i < limit) {
        i++;
        const p = pts[i];
        if (p.onCurve) {
          conicTo(kx, ky, p.x, p.y);
          break;
        }
        conicTo(kx, ky, mid(kx, p.x), mid(ky, p.y));
        kx = p.x;
        ky = p.y;
      } else {
        conicTo(kx, ky, start.x, start.y);
        closedByConic = true;
        break;
      }
    }
    if (closedByConic) break;
  }
  if (!closedByConic) lineTo(start.x, start.y);
  else out.push(out[0], out[1]); // the device closes the path back to its start
  return dedupe(out);
}

/** Drops points within 1e-7 font units of the one before (showtext repeats each arc's end). @param {number[]} ring */
function dedupe(ring) {
  const out = [ring[0], ring[1]];
  for (let k = 2; k < ring.length; k += 2) {
    const n = out.length;
    if (Math.abs(ring[k] - out[n - 2]) > 1e-7 || Math.abs(ring[k + 1] - out[n - 1]) > 1e-7) out.push(ring[k], ring[k + 1]);
  }
  out[out.length - 2] = out[0];
  out[out.length - 1] = out[1];
  return out;
}

/**
 * The outlines of a line of text in font units (y up), one entry per
 * character that has ink, each glyph shifted by the advances before it.
 * @param {string} text
 * @param {string} family
 * @param {1 | 2} [face]
 * @returns {{ glyphs: GlyphOutline[], unitsPerEm: number }}
 */
export function lineOutlines(text, family, face = 1) {
  const font = fontFace(family, face);
  /** @type {GlyphOutline[]} */
  const glyphs = [];
  let offset = 0;
  for (const char of text) {
    const glyph = font.glyphForCodePoint(/** @type {number} */ (char.codePointAt(0)));
    const contours = glyph._getContours().filter((c) => c.length > 0);
    if (contours.length) glyphs.push({ char, rings: contours.map((c) => flattenContour(c, offset)) });
    offset += glyph.advanceWidth;
  }
  return { glyphs, unitsPerEm: font.unitsPerEm };
}

/** Sum of the advance widths of a string, in font units. @param {string} text @param {string} family @param {1 | 2} face */
export function advance(text, family, face) {
  const font = fontFace(family, face);
  return [...text].reduce((sum, c) => sum + font.glyphForCodePoint(/** @type {number} */ (c.codePointAt(0))).advanceWidth, 0);
}

/** The ascent of "M" (FreeType's horiBearingY: the top of its control box), in font units. @param {string} family @param {1 | 2} face */
export function capAscent(family, face) {
  return /** @type {{ cbox: { maxY: number } }} */ (/** @type {unknown} */ (fontFace(family, face).glyphForCodePoint(77))).cbox.maxY;
}
