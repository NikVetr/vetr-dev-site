// Where each cell's photo goes in the mosaic picture (the page draws it on a canvas, the
// command line into a PNG), and the command line's drawing of it.

import { cropImage, scaleImage, scaledHeight } from './image.js';

/** @typedef {'keep' | 'crop'} Fit */
/**
 * @typedef {{ cell: number, photo: number, x: number, y: number, width: number, height: number,
 *   source: [number, number, number, number] }} Tile
 *   source is the part of the photo drawn: [x, y, width, height] in its pixels.
 * @typedef {{ width: number, height: number, tileWidth: number, rowTops: number[], tiles: Tile[] }} Layout
 *   rowTops has rows + 1 entries, the last being the height.
 */

export const FITS = /** @type {const} */ (['keep', 'crop']);

/**
 * fit "keep", the R script's: each photo scaled to tileWidth wide with its shape kept (its
 * height as ImageMagick rounds it), each row of the grid as tall as its tallest photo, photos
 * at the top of their row (image_append) and the rest of the row left white.
 * fit "crop": each photo's centred square, tileWidth on a side.
 * @param {{ rows: number, columns: number }} grid
 * @param {ArrayLike<number>} assignment the photo in each cell, row by row
 * @param {{ width: number, height: number }[]} sizes each photo's size in pixels
 * @param {{ tileWidth: number, fit: Fit }} options
 * @returns {Layout}
 */
export function layoutMosaic(grid, assignment, sizes, { tileWidth, fit }) {
  /** @type {Tile[]} */
  const tiles = [];
  const rowTops = [0];
  let y = 0;
  for (let r = 0; r < grid.rows; r++) {
    let rowHeight = 0;
    for (let c = 0; c < grid.columns; c++) {
      const cell = r * grid.columns + c;
      const photo = assignment[cell];
      const { width: w, height: h } = sizes[photo];
      const side = Math.min(w, h);
      /** @type {Tile['source']} */
      const source = fit === 'crop' ? [Math.floor((w - side) / 2), Math.floor((h - side) / 2), side, side] : [0, 0, w, h];
      const height = fit === 'crop' ? tileWidth : scaledHeight(w, h, tileWidth);
      tiles.push({ cell, photo, x: c * tileWidth, y, width: tileWidth, height, source });
      rowHeight = Math.max(rowHeight, height);
    }
    y += rowHeight;
    rowTops.push(y);
  }
  return { width: grid.columns * tileWidth, height: y, tileWidth, rowTops, tiles };
}

/**
 * Draws a layout as RGBA: white, each photo drawn over it as scaleImage() scales it, then
 * blended towards its cell's target colour by `tint` (0 to 1): (1 - tint) × photo + tint × cell.
 * The page draws the same with a canvas.
 * @param {Layout} layout
 * @param {(photo: number) => import('./image.js').Rgba} pixelsOf a photo's pixels
 * @param {ArrayLike<number>[]} cellColors each cell's [r, g, b, a]
 * @param {number} tint
 */
export function composeMosaic(layout, pixelsOf, cellColors, tint) {
  const out = new Uint8ClampedArray(layout.width * layout.height * 4).fill(255);
  for (const tile of layout.tiles) {
    const photo = pixelsOf(tile.photo);
    const [, , sw, sh] = tile.source;
    const part = sw === photo.width && sh === photo.height ? photo : cropImage(photo, tile.source);
    const scaled = scaleImage(part, tile.width, tile.height).data;
    const cell = cellColors[tile.cell];
    for (let y = 0; y < tile.height; y++) {
      for (let x = 0; x < tile.width; x++) {
        const s = 4 * (y * tile.width + x);
        const o = 4 * ((tile.y + y) * layout.width + tile.x + x);
        const alpha = scaled[s + 3] / 255;
        for (let ch = 0; ch < 3; ch++) {
          const over = alpha * scaled[s + ch] + (1 - alpha) * 255;
          out[o + ch] = Math.round((1 - tint) * over + tint * cell[ch]);
        }
      }
    }
  }
  return out;
}
