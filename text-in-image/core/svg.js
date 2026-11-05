// The text fill as SVG: each distinct character's outline once, in <defs>, and
// one <use> per placed glyph, so the drawing needs no font and looks the same
// in every viewer. Positions follow R's render_text_fill.

import { glyphPath, measureChars } from './font.js';
import { TextInImageError, parseColor } from './request.js';

// R's text(pos = 4) puts the glyph origin half a character height right of x:
// 0.5 x 1.2 x 12 pt on the 72-ppi device, whatever the glyph size.
const POS4_OFFSET_PX = 7.2;

/**
 * @param {import('./index.js').Result} result
 * @param {{ background?: string }} [options] background colour, "#rrggbb", "#rgb", "black" or "white"
 * @returns {string}
 */
export function renderSvg(result, { background = 'black' } = {}) {
  if (typeof background !== 'string' || !parseColor(background)) {
    const issue = { code: 'wrong_type', path: 'background', message: 'must be a colour written #rrggbb or #rgb, or "black" or "white"' };
    throw new TextInImageError('invalid_request', `Invalid options: background: ${issue.message}`, [issue]);
  }
  const { width: W, height: H } = result.canvas;
  const { margin } = result.settings.render;
  const theta = result.settings.layout.rotation;
  const size = result.font_size_px;
  const span = 1 + 2 * margin;
  const baseline = measureChars(['M']).height * size / 3; // below the reference y
  const n = (/** @type {number} */ v) => String(Math.round(v * 100) / 100);

  /** @type {Map<string, string>} */
  const ids = new Map();
  const defs = [];
  const uses = [];
  for (const g of result.glyphs) {
    if (!g.placed || g.col === null || g.x === null || g.y === null) continue;
    if (!ids.has(g.char)) {
      const d = glyphPath(g.char, size);
      ids.set(g.char, d ? `g${ids.size}` : '');
      if (d) defs.push(`<path id="g${ids.size - 1}" d="${d}"/>`);
    }
    const id = ids.get(g.char);
    if (!id) continue; // blank
    const ax = (g.x + margin) / span * W + POS4_OFFSET_PX;
    const ay = (1 + margin - g.y) / span * H;
    const fill = g.col.length === 9 ? `${g.col.slice(0, 7)}" fill-opacity="${n(parseInt(g.col.slice(7), 16) / 255)}` : g.col;
    const turn = theta ? ` transform="rotate(${n(-theta)} ${n(ax)} ${n(ay)})"` : '';
    uses.push(`<use xlink:href="#${id}" x="${n(ax)}" y="${n(ay + baseline)}" fill="${fill}"${turn}/>`);
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${background}"/>`,
    `<defs>${defs.join('')}</defs>`,
    ...uses,
    '</svg>',
    '',
  ].join('\n');
}
