// The bundled font families and what the layout and the renderers read from them. Faces are
// read with fontkit (a file read in Node, a fetch in a browser or worker), only when a request
// uses them, and kept for later requests.
//
// Measurement follows the R version's showtext engine: each character's advance width from the
// font's hmtx table, unhinted and unscaled (FreeType's FT_LOAD_NO_SCALE), with no kerning or
// ligatures, and the cap height as the top of the control box of "M" (FreeType's horiBearingY).

import * as fontkit from '../../shared/vendor/fontkit.esm.js';

/**
 * The parts of fontkit used here. _getContours() is fontkit's decoding of the glyf points.
 * @typedef {{ command: string, args: number[] }} PathCommand
 * @typedef {{ id: number, advanceWidth: number, path: { commands: PathCommand[] }, _getContours(): { x: number, y: number }[][] }} Glyph
 * @typedef {{ unitsPerEm: number, glyphForCodePoint(codePoint: number): Glyph, hasGlyphForCodePoint(codePoint: number): boolean }} FontkitFont
 * @typedef {import('./request.js').StyleName} StyleName
 * @typedef {{ family: string, style: StyleName, file: string, font: FontkitFont, bytes: Uint8Array, unitsPerEm: number, capAscent: number }} Face
 */

/**
 * Face files, relative to message-collage/. Inter's and Source Serif Pro's upright faces are
 * name-tags' copies, read from there. Licences and sources: fonts/LICENSES.md.
 */
export const FAMILIES = Object.freeze({
  'Source Serif Pro': {
    category: 'serif',
    faces: { plain: '../name-tags/fonts/SourceSerifPro-Regular.ttf', bold: '../name-tags/fonts/SourceSerifPro-Bold.ttf', italic: 'fonts/SourceSerifPro-It.woff2', 'bold-italic': 'fonts/SourceSerifPro-BoldIt.woff2' },
  },
  Inter: {
    category: 'sans-serif',
    faces: { plain: '../name-tags/fonts/Inter-Regular.ttf', bold: '../name-tags/fonts/Inter-Bold.ttf', italic: 'fonts/Inter-Italic.woff2', 'bold-italic': 'fonts/Inter-BoldItalic.woff2' },
  },
  'Courier Prime': {
    category: 'monospace',
    faces: { plain: 'fonts/CourierPrime-Regular.woff2', bold: 'fonts/CourierPrime-Bold.woff2', italic: 'fonts/CourierPrime-Italic.woff2', 'bold-italic': 'fonts/CourierPrime-BoldItalic.woff2' },
  },
  'Lobster Two': {
    category: 'script',
    faces: { plain: 'fonts/LobsterTwo-Regular.woff2', bold: 'fonts/LobsterTwo-Bold.woff2', italic: 'fonts/LobsterTwo-Italic.woff2', 'bold-italic': 'fonts/LobsterTwo-BoldItalic.woff2' },
  },
  'Playfair Display': {
    category: 'display',
    faces: { plain: 'fonts/PlayfairDisplay-Regular.woff2', bold: 'fonts/PlayfairDisplay-Bold.woff2', italic: 'fonts/PlayfairDisplay-Italic.woff2', 'bold-italic': 'fonts/PlayfairDisplay-BoldItalic.woff2' },
  },
});

/** @type {Map<string, Promise<Face>>} */
const cache = new Map();

/** @param {string} family @param {StyleName} style */
export const faceKey = (family, style) => `${family}|${style}`;

/** The URL of a face file (file: in Node, http(s): in a browser). @param {string} file */
export const fontUrl = (file) => new URL(`../${file}`, import.meta.url);

/**
 * Reads every face of the given families in the given styles (each once per process).
 * @param {string[]} families names from FAMILIES
 * @param {StyleName[]} styles
 * @returns {Promise<Map<string, Face>>} by faceKey
 */
export async function loadFaces(families, styles) {
  const keys = families.flatMap((family) => styles.map((style) => /** @type {const} */ ([family, style])));
  const faces = await Promise.all(keys.map(([family, style]) => {
    const key = faceKey(family, style);
    let face = cache.get(key);
    if (!face) {
      face = readFace(family, style);
      face.catch(() => cache.delete(key));
      cache.set(key, face);
    }
    return face;
  }));
  return new Map(faces.map((face) => [faceKey(face.family, face.style), face]));
}

/** @param {string} family @param {StyleName} style @returns {Promise<Face>} */
async function readFace(family, style) {
  const file = FAMILIES[/** @type {keyof typeof FAMILIES} */ (family)].faces[style];
  const url = fontUrl(file);
  const bytes = url.protocol === 'file:'
    ? new Uint8Array((await import('node:fs')).readFileSync(url))
    : new Uint8Array(await (await fetchOk(url)).arrayBuffer());
  const font = /** @type {FontkitFont} */ (fontkit.create(bytes));
  const contours = font.glyphForCodePoint(77)._getContours(); // "M"
  const capAscent = Math.max(...contours.flat().map((p) => p.y));
  return { family, style, file, font, bytes, unitsPerEm: font.unitsPerEm, capAscent };
}

/** @param {URL} url */
async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load the font ${url.pathname} (HTTP ${response.status})`);
  return response;
}

/**
 * Advance width of each character of `text` in font units, with no kerning.
 * @param {Face} face @param {string} text
 */
export function advances(face, text) {
  return Array.from(text, (ch) => face.font.glyphForCodePoint(/** @type {number} */ (ch.codePointAt(0))).advanceWidth);
}

/**
 * The characters of `text` (other than spaces) the face has no glyph for, in order of appearance.
 * @param {Face} face @param {string} text
 */
export function missingCharacters(face, text) {
  return [...new Set(text)].filter((ch) => ch !== ' ' && !face.font.hasGlyphForCodePoint(/** @type {number} */ (ch.codePointAt(0))));
}
