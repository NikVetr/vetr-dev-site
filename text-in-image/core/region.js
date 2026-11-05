// Paintable-region detection: which pixels may hold text, and the pixel
// columns open to a line of text. As R's regions.R.
//
// Coordinates: pixel (r, c) of a height x width image (0-based here) sits at
// x = (c + 1) / width, y = 1 - (r + 1) / height in the unit square, as R's
// 1-based (r, c) at x = c / ncol, y = 1 - r / nrow.

import { unusable } from './request.js';

/**
 * @typedef {import('./quantize.js').Raster} Raster
 * @typedef {{
 *   width: number, height: number, hits: Uint8Array, rowY: Float64Array,
 *   nonempty: number[], nonemptyY: number[], pxlw: number, pxlh: number,
 *   px: Float64Array, py: Float64Array, paintableFraction: number,
 * }} Region
 */

/**
 * Rotates an image by theta degrees (nearest neighbour), as R's rotate_grid:
 * the grid grows to hold the turned picture, and cells that fall outside it
 * are -2 in every channel (so never paintable). theta = 0 returns the image.
 * @param {Raster} raster
 * @param {number} theta
 * @returns {Raster}
 */
export function rotateRaster(raster, theta) {
  if (theta === 0) return raster;
  const t = theta * Math.PI / 180;
  const { width: m, height: n, rgba } = raster;
  const cx = (m + 1) / 2;
  const cy = (n + 1) / 2;
  const xs = [];
  const ys = [];
  for (const [x, y] of [[1, 1], [m, 1], [1, n], [m, n]]) {
    xs.push(Math.cos(t) * (x - cx) - Math.sin(t) * (y - cy) + cx);
    ys.push(Math.sin(t) * (x - cx) + Math.cos(t) * (y - cy) + cy);
  }
  // a span of s between the first and last pixel centre holds s + 1 pixels
  const newM = Math.ceil(Math.max(...xs) - Math.min(...xs) - 1e-9) + 1;
  const newN = Math.ceil(Math.max(...ys) - Math.min(...ys) - 1e-9) + 1;
  const ncx = (newM + 1) / 2;
  const ncy = (newN + 1) / 2;
  const out = new Float64Array(newM * newN * 4).fill(-2);
  for (let y = 1; y <= newN; y++) {
    for (let x = 1; x <= newM; x++) {
      const xi = Math.round(Math.cos(-t) * (x - ncx) - Math.sin(-t) * (y - ncy) + cx);
      const yi = Math.round(Math.sin(-t) * (x - ncx) + Math.cos(-t) * (y - ncy) + cy);
      if (xi < 1 || xi > m || yi < 1 || yi > n) continue;
      out.set(rgba.subarray(4 * ((yi - 1) * m + xi - 1), 4 * ((yi - 1) * m + xi)), 4 * ((y - 1) * newM + x - 1));
    }
  }
  return { width: newM, height: newN, rgba: out };
}

/**
 * Text at theta degrees counterclockwise is laid out horizontally on the
 * picture turned clockwise by theta (rotateRaster). This turns unit-square
 * positions back counterclockwise by theta about the centre, in pixel units so
 * a non-square canvas stays rigid, as R's unrotate_positions.
 * @param {number} x @param {number} y @param {number} theta
 * @param {number} width @param {number} height  of the rotated image
 */
export function unrotatePosition(x, y, theta, width, height) {
  if (theta === 0) return { x, y };
  const r = theta * Math.PI / 180;
  const px = (x - 0.5) * width;
  const py = (y - 0.5) * height;
  return {
    x: (Math.cos(r) * px - Math.sin(r) * py) / width + 0.5,
    y: (Math.sin(r) * px + Math.cos(r) * py) / height + 0.5,
  };
}

/**
 * Paintable pixels (opaque, alpha > alphaThresh, and not pure white) and the
 * row geometry the layout reads. px, py list the paintable pixels top to
 * bottom, left to right: the fill order.
 * @param {Raster} raster
 * @param {number} alphaThresh
 * @returns {Region}
 */
export function regionRows(raster, alphaThresh) {
  const { width, height, rgba } = raster;
  const hits = new Uint8Array(width * height);
  const rowY = new Float64Array(height);
  /** @type {number[]} */
  const nonempty = [];
  /** @type {number[]} */
  const px = [];
  /** @type {number[]} */
  const py = [];
  for (let r = 0; r < height; r++) {
    rowY[r] = 1 - (r + 1) / height;
    const before = px.length;
    for (let c = 0; c < width; c++) {
      const p = r * width + c;
      if (Math.abs(rgba[4 * p] + rgba[4 * p + 1] + rgba[4 * p + 2] - 3) > 1e-9 && rgba[4 * p + 3] > alphaThresh) {
        hits[p] = 1;
        px.push((c + 1) / width);
        py.push(rowY[r]);
      }
    }
    if (px.length > before) nonempty.push(r);
  }
  if (!px.length) throw unusable('image', `has no paintable pixels: every pixel is transparent (alpha at most region.alpha_thresh = ${alphaThresh}) or pure white`);
  return {
    width, height, hits, rowY, nonempty, nonemptyY: nonempty.map((r) => rowY[r]),
    pxlw: 1 / width, pxlh: 1 / height,
    px: Float64Array.from(px), py: Float64Array.from(py), paintableFraction: px.length / (width * height),
  };
}

/**
 * Index of the non-empty pixel row nearest to y (the upper one on ties).
 * @param {Region} region @param {number} y
 */
export function nearestRow(region, y) {
  let best = 0;
  for (let i = 1; i < region.nonempty.length; i++) {
    if (Math.abs(region.nonemptyY[i] - y) < Math.abs(region.nonemptyY[best] - y)) best = i;
  }
  return region.nonempty[best];
}

/**
 * Paintable pixel columns (0-based) open to a text line whose reference y is y.
 *   "row":  the nearest non-empty pixel row.
 *   "band": columns paintable in every pixel row the glyphs cover, taken as
 *           [y - height/3, y + 2 height/3] for text drawn as R's text(pos = 4);
 *           a band between pixel rows falls back to "row".
 * With skipGaps, a "row" line more than half a pixel from any paintable row
 * gets no columns.
 * @param {Region} region @param {number} y
 * @param {'band' | 'row'} mode @param {number} height @param {boolean} skipGaps
 * @returns {number[]}
 */
export function lineColumns(region, y, mode, height, skipGaps) {
  const { width, hits, rowY } = region;
  if (mode === 'band') {
    const band = [];
    for (let r = 0; r < rowY.length; r++) if (rowY[r] >= y - height / 3 && rowY[r] <= y + 2 * height / 3) band.push(r);
    if (band.length) {
      const cols = [];
      for (let c = 0; c < width; c++) if (band.every((r) => hits[r * width + c])) cols.push(c);
      return cols;
    }
  }
  const r = nearestRow(region, y);
  if (skipGaps && Math.abs(rowY[r] - y) > region.pxlh / 2 + 1e-9) return [];
  const cols = [];
  for (let c = 0; c < width; c++) if (hits[r * width + c]) cols.push(c);
  return cols;
}

/**
 * Horizontal runs of a set of pixel columns: each pixel's x and the width of
 * the run it belongs to (the layout's "sub-blocks"), and the total width.
 * @param {number[]} cols 0-based, ascending
 * @param {number} width image width in pixels
 */
export function columnRuns(cols, width) {
  const x = cols.map((c) => (c + 1) / width);
  const tsw = new Array(cols.length);
  for (let start = 0; start < cols.length;) {
    let end = start + 1;
    while (end < cols.length && cols[end] === cols[end - 1] + 1) end++;
    tsw.fill((end - start) / width, start, end);
    start = end;
  }
  return { x, tsw: /** @type {number[]} */ (tsw), tw: cols.length / width };
}
