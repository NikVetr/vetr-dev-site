// The bundled font, Liberation Sans Bold, read with fontkit so Node and every
// browser measure and draw exactly the same outlines. The R version's default
// face; it has the advance widths of Arial Bold. Loaded once, when this module
// is first imported (a file read in Node, a fetch in a browser or worker), so
// everything after that is synchronous.

import * as fontkit from '../../pocket-language-guide/vendor/fontkit.esm.js';

/**
 * The parts of a fontkit glyph used here.
 * @typedef {{ command: string, args: number[] }} PathCommand
 * @typedef {{ id: number, advanceWidth: number, bbox: { maxY: number }, path: { commands: PathCommand[] } }} Glyph
 * @typedef {{ unitsPerEm: number, fullName: string, glyphForCodePoint(codePoint: number): Glyph, hasGlyphForCodePoint(codePoint: number): boolean }} Font
 */

export const FONT = { family: 'Liberation Sans', face: 2, file: 'fonts/LiberationSans-Bold.ttf' };

const url = new URL(`../${FONT.file}`, import.meta.url);
const bytes = url.protocol === 'file:'
  ? (await import('node:fs')).readFileSync(url)
  : new Uint8Array(await (await fetch(url)).arrayBuffer());
const font = /** @type {Font} */ (/** @type {unknown} */ (fontkit.create(bytes)));
const upem = font.unitsPerEm;

/** @param {string} char one code point */
const glyph = (char) => font.glyphForCodePoint(/** @type {number} */ (char.codePointAt(0)));

/**
 * Advance width of each character and the height of "M" (R's strheight: the
 * ink ascent of "M", the cap height here), in ems. Unhinted and per character:
 * no kerning, as in the R version.
 * @param {string[]} chars
 */
export function measureChars(chars) {
  return {
    width: new Map(chars.map((c) => [c, glyph(c).advanceWidth / upem])),
    height: glyph('M').bbox.maxY / upem,
  };
}

/** @param {string[]} chars @returns {string[]} the characters the font has no glyph for */
export function missingChars(chars) {
  return chars.filter((c) => !/\s/.test(c) && !font.hasGlyphForCodePoint(/** @type {number} */ (c.codePointAt(0))));
}

/**
 * Ink coverage of a character: its outline area over its box, advance width x
 * the height of "M", as R's char_ink_coverage. R estimates the area by drawing
 * the glyph at about 116 px and counting pixels; here it is the exact area of
 * the quadratic outline (TrueType contours wind clockwise for ink and
 * counterclockwise for holes, so the signed areas add up).
 * @param {string} char
 */
export function inkCoverage(char) {
  const g = glyph(char);
  if (g.advanceWidth === 0) return 0;
  let area = 0;
  let start = [0, 0];
  let p = [0, 0];
  /** @param {number[]} a @param {number[]} b */
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  for (const { command, args } of g.path.commands) {
    if (command === 'moveTo') {
      start = p = args;
    } else if (command === 'lineTo') {
      area += cross(p, args) / 2;
      p = args;
    } else if (command === 'quadraticCurveTo') {
      const c = args.slice(0, 2);
      const q = args.slice(2);
      area += (2 * cross(p, c) + 2 * cross(c, q) + cross(p, q)) / 6;
      p = q;
    } else if (command === 'closePath') {
      area += cross(p, start) / 2;
      p = start;
    } else {
      throw new Error(`unexpected outline command ${command}`);
    }
  }
  return Math.abs(area) / (g.advanceWidth * glyph('M').bbox.maxY);
}

/**
 * SVG path data of a character drawn at `size` px, with its origin on the
 * baseline and y pointing down. Empty for blank characters.
 * @param {string} char
 * @param {number} size font size in px
 */
export function glyphPath(char, size) {
  const s = size / upem;
  const n = (/** @type {number} */ v) => String(Math.round(v * 100) / 100);
  const letters = /** @type {Record<string, string>} */ ({ moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', closePath: 'Z' });
  return glyph(char).path.commands.map(({ command, args }) => {
    const letter = letters[command];
    if (!letter) throw new Error(`unexpected outline command ${command}`);
    return letter + args.map((v, i) => n(i % 2 ? -v * s : v * s)).join(' ');
  }).join('');
}
