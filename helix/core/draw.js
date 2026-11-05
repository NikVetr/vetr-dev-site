// A drawing (filled shapes and centrelines in true units, y up, in painting order) as
// SVG: filled as painted, as the outlines of what can be seen (for a laser cutter or a
// plotter), or as centrelines. All three share one canvas, the drawing's bounds plus
// the margin, so they line up when layered.

import { bounds, difference, union } from '../../shared/polygon.js';

/**
 * @typedef {import('../../shared/polygon.js').Polygon} Polygon
 * @typedef {import('./request.js').OutputSettings} OutputSettings
 * @typedef {{ id: string, label: string, color: string, shapes: Polygon[][] }} FillGroup  shapes in painting order
 * @typedef {{ id: string, label: string, color: string, lines: number[][] }} LineGroup  polylines [x0, y0, x1, y1, ...]
 * @typedef {{
 *   fills: FillGroup[], lines: LineGroup[], strokeWidth: number, flatten: boolean,
 *   geometry: (at: (x: number, y: number) => number[]) => object,
 * }} Drawing  `flatten`: whether later shapes hide earlier ones of other colours (else the shapes do not overlap)
 */

const PER_MM = /** @type {const} */ ({ mm: 1, in: 1 / 25.4, px: 96 / 25.4 });

/** A hairline for cutting: 0.1 mm in the output unit. @param {OutputSettings['unit']} unit */
export const hairline = (unit) => 0.1 * PER_MM[unit];

/**
 * The regions of each colour that can be seen once every shape is painted in order:
 * consecutive groups of one colour are merged, later colours cut away earlier ones.
 * @param {FillGroup[]} fills
 * @returns {{ id: string, color: string, polygons: Polygon[] }[]}
 */
export function flatten(fills) {
  /** @type {{ id: string, color: string, polygons: Polygon[] }[]} */
  const regions = [];
  for (const g of fills) {
    const rings = g.shapes.flat(2);
    if (!rings.length) continue;
    const top = union(rings, 'nonzero');
    for (const r of regions) {
      if (r.color !== g.color) r.polygons = difference(r.polygons.flat(), 'nonzero', top.flat(), 'nonzero');
    }
    const same = regions.find((r) => r.color === g.color);
    if (same) {
      same.polygons = union([...same.polygons.flat(), ...top.flat()], 'nonzero');
      same.id += `-and-${g.id}`;
    } else regions.push({ id: g.id, color: g.color, polygons: top });
  }
  // Clipper can leave a cut region in pieces that share an edge; a union joins them
  return regions.map((r) => ({ ...r, polygons: union(r.polygons.flat(), 'nonzero') })).filter((r) => r.polygons.length);
}

/**
 * The canvas and the SVG of one style.
 * @param {Drawing} drawing @param {OutputSettings} out
 */
export function renderSvg(drawing, out) {
  const strokeWidth = out.strokeWidth ?? drawing.strokeWidth;
  const outlineWidth = out.outlineWidth ?? hairline(out.unit);
  const fb = bounds(drawing.fills.flatMap((g) => g.shapes.flat(2)));
  const lb = bounds(drawing.lines.flatMap((g) => g.lines));
  const x0 = Math.min(fb[0] - outlineWidth / 2, lb[0] - strokeWidth / 2);
  const y0 = Math.min(fb[1] - outlineWidth / 2, lb[1] - strokeWidth / 2);
  const x1 = Math.max(fb[2] + outlineWidth / 2, lb[2] + strokeWidth / 2);
  const y1 = Math.max(fb[3] + outlineWidth / 2, lb[3] + strokeWidth / 2);
  const m = out.margin;
  const width = x1 - x0 + 2 * m;
  const height = y1 - y0 + 2 * m;
  /** SVG coordinates (y down, from the canvas's top-left corner). @param {number} x @param {number} y */
  const at = (x, y) => [x - x0 + m, y1 - y + m];
  const digits = out.unit === 'in' ? 4 : 3;
  const num = (/** @type {number} */ v) => {
    const s = v.toFixed(digits).replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  };
  /** @param {number[]} r @param {boolean} close */
  const pathOf = (r, close) => {
    let d = '';
    const end = close ? r.length - 2 : r.length; // a closed ring repeats its first point
    for (let k = 0; k < end; k += 2) {
      const [X, Y] = at(r[k], r[k + 1]);
      d += `${k ? 'L' : 'M'}${num(X)} ${num(Y)}`;
    }
    return close ? `${d}Z` : d;
  };
  const unitSuffix = out.unit === 'px' ? '' : out.unit;
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}${unitSuffix}" height="${num(height)}${unitSuffix}" viewBox="0 0 ${num(width)} ${num(height)}">`,
  ];
  if (out.background) svg.push(`<rect width="${num(width)}" height="${num(height)}" fill="${out.background}"/>`);
  if (out.style === 'filled') {
    for (const g of drawing.fills) {
      const paths = g.shapes.filter((s) => s.length).map((s) => `<path d="${s.flat().map((r) => pathOf(r, true)).join('')}"/>`);
      if (paths.length) svg.push(`<g id="${g.id}" fill="${g.color}" fill-rule="evenodd">`, ...paths, '</g>');
    }
  } else if (out.style === 'outline') {
    const regions = drawing.flatten ? flatten(drawing.fills)
      : drawing.fills.map((g) => ({ id: g.id, color: g.color, polygons: g.shapes.flat() })).filter((r) => r.polygons.length);
    for (const r of regions) {
      svg.push(`<path id="${r.id}" fill="none" stroke="${r.color}" stroke-width="${num(outlineWidth)}" stroke-linejoin="round" d="${r.polygons.flat().map((ring) => pathOf(ring, true)).join('')}"/>`);
    }
  } else {
    for (const g of drawing.lines) {
      if (!g.lines.length) continue;
      svg.push(`<path id="${g.id}" fill="none" stroke="${g.color}" stroke-width="${num(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" d="${g.lines.map((l) => pathOf(l, false)).join('')}"/>`);
    }
  }
  svg.push('</svg>', '');
  return { svg: svg.join('\n'), width, height, strokeWidth, outlineWidth, at };
}
