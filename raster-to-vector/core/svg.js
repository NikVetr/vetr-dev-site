// Regions and SVG, as R/svg.R. Every painted shape is a region; each impostor
// (a hole boundary of its layer) becomes a hole of the smallest painted shape
// of its own layer that contains it, drawn with the ring of the region filling
// the hole so that hole and filler coincide. Regions are written in paint
// order, one <path fill-rule="evenodd"> each.

import { roundR } from './stats.js';

/**
 * @typedef {{ layer: number, hex: string, alpha: number, share: number, transparent: boolean }} PaletteEntry
 * @typedef {{ layer: number, frame: boolean, outer: number[][], holes: number[][][] }} Region
 * @typedef {import('./order.js').Ring} Ring
 */

/**
 * @param {ReturnType<typeof import('./order.js').plottingOrder>} ord
 * @param {Ring[][]} smoothed per layer, frame included
 * @param {boolean[]} transparent per layer (0-based)
 * @param {number} pad @param {'transparent' | 'all' | 'none'} holes
 * @returns {Region[]} layers 1-based, coordinates on the unpadded image's pixel corners
 */
export function buildRegions(ord, smoothed, transparent, pad, holes) {
  const { inds, cm, nContains, order: painted } = ord;
  /** @type {number[]} */
  const holeOf = inds.map(() => -1);
  ord.impostors.forEach((imp, k) => {
    const partner = ord.partners[k];
    if (holes === 'none' || (holes === 'transparent' && !transparent[inds[partner].layer])) return;
    const parents = painted.filter((i) => cm[imp][i] === -1 && inds[i].layer === inds[imp].layer).sort((a, b) => a - b);
    if (parents.length > 0) holeOf[partner] = parents.reduce((best, i) => (nContains[i] < nContains[best] ? i : best));
  });
  const xy = (/** @type {number} */ i) => {
    const r = smoothed[inds[i].layer][inds[i].shape];
    return Array.from(r.x, (x, k) => [x - pad, r.y[k] - pad]);
  };
  return painted.map((i) => ({
    layer: inds[i].layer + 1,
    frame: i === ord.frame,
    outer: xy(i),
    holes: holeOf.flatMap((h, j) => (h === i ? [xy(j)] : [])),
  }));
}

/** R's format_num(): round, fixed decimals, trailing zeros dropped, no "-0". @param {number} x @param {number} digits */
export function formatNum(x, digits) {
  let s = roundR(x, digits).toFixed(digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

/** @param {number[][]} ring @param {number} digits */
function pathData(ring, digits) {
  const xy = ring.map(([x, y]) => `${formatNum(x, digits)},${formatNum(y, digits)}`);
  return `M${xy[0]}L${xy.slice(1).join(' ')}Z`;
}

/**
 * The SVG document. Transparent layers are not painted; partly transparent ones
 * get a fill-opacity.
 * @param {Region[]} regions @param {PaletteEntry[]} palette @param {number} width @param {number} height
 * @param {number} digits decimals in the path data
 */
export function regionsToSvg(regions, palette, width, height, digits) {
  const paths = regions.flatMap((r) => {
    const pal = palette[r.layer - 1];
    if (pal.transparent) return [];
    const d = [r.outer, ...r.holes].map((ring) => pathData(ring, digits)).join('');
    const opacity = pal.alpha < 1 ? ` fill-opacity="${formatNum(pal.alpha, 3)}"` : '';
    return [`<path d="${d}" fill="${pal.hex}"${opacity} fill-rule="evenodd"/>`];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${paths.join('\n')}\n</svg>\n`;
}
