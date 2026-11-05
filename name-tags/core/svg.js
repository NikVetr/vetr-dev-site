// Laser-cutter SVG sheets (R's render.R). The page is drawn at 96 user units
// per inch (1 unit = 1 px in Inkscape) with its true size in inches; y is
// flipped from the layout's y-up inches. Engraving is filled black paths; each
// occupied cell gets a thin grey outline for registration.

/**
 * @typedef {import('./geometry.js').Polygon} Polygon
 * @typedef {{ kind: 'glyphs' | 'helix' | 'shape', polygons: Polygon[], dx: number, dy: number }} Layer  dx, dy: offset in inches
 * @typedef {{ x: number, y: number, w: number, h: number, href: string }} Image  bottom-left corner and size in inches
 * @typedef {{ origin: number[], layers: Layer[], images?: Image[], fills?: string[] }} CellDrawing
 */

const PX = 96;

/** @param {number} v */
const num = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};

/**
 * Path data of polygons, offset by (dx, dy) inches, on a page `height` inches tall.
 * @param {Polygon[]} polygons @param {number} dx @param {number} dy @param {number} height
 */
export function pathData(polygons, dx, dy, height) {
  const parts = [];
  for (const poly of polygons) {
    for (const ring of poly) {
      let d = '';
      for (let k = 0; k + 2 < ring.length; k += 2) d += `${k ? 'L' : 'M'}${num((ring[k] + dx) * PX)} ${num((height - ring[k + 1] - dy) * PX)}`;
      parts.push(`${d}Z`);
    }
  }
  return parts.join('');
}

/**
 * One sheet: `cells` gives each occupied cell's bottom-left corner and what to draw in it.
 * @param {{ page_in: number[], cell_in: number[] }} tray
 * @param {CellDrawing[]} cells
 */
export function renderSheet(tray, cells) {
  const [W, H] = tray.page_in;
  const [cw, ch] = tray.cell_in;
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(W)}in" height="${num(H)}in" viewBox="0 0 ${num(W * PX)} ${num(H * PX)}">`,
    `<rect x="0" y="0" width="${num(W * PX)}" height="${num(H * PX)}" fill="#ffffff"/>`,
  ];
  for (const cell of cells) {
    const [x, y] = cell.origin;
    const box = [[x, y], [x, y + ch], [x + cw, y + ch], [x + cw, y], [x, y]];
    out.push(`<path fill="none" stroke="#333333" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" d="${box.map(([px, py], i) => `${i ? 'L' : 'M'}${num(px * PX)} ${num((H - py) * PX)}`).join('')}"/>`);
    for (const img of cell.images ?? []) {
      out.push(`<image x="${num(img.x * PX)}" y="${num((H - img.y - img.h) * PX)}" width="${num(img.w * PX)}" height="${num(img.h * PX)}" preserveAspectRatio="none" xlink:href="${img.href}"/>`);
    }
    for (const layer of cell.layers) {
      if (layer.kind === 'helix') {
        // drawn filled and outlined, as R plots the helix polygons with a border
        for (const poly of layer.polygons) {
          out.push(`<path fill="#000000" fill-rule="evenodd" stroke="#000000" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" d="${pathData([poly], x + layer.dx, y + layer.dy, H)}"/>`);
        }
      } else if (layer.kind === 'shape' && cell.fills) {
        layer.polygons.forEach((poly, i) => {
          out.push(`<path fill="${/** @type {string[]} */ (cell.fills)[i]}" fill-rule="evenodd" d="${pathData([poly], x + layer.dx, y + layer.dy, H)}"/>`);
        });
      } else {
        for (const poly of layer.polygons) {
          out.push(`<path fill="#000000" fill-rule="evenodd" d="${pathData([poly], x + layer.dx, y + layer.dy, H)}"/>`);
        }
      }
    }
  }
  out.push('</svg>', '');
  return out.join('\n');
}
