// Presentation diagnostics for comparing layouts. These sample glyph bounding boxes,
// not literal ink, and never change the generator's established selection criterion.
import { CollageError } from './request.js';
import { applyMatrix, glyphGeometry } from './warp.js';

/**
 * Measure total blank cells and the largest axis-aligned blank rectangle.
 * Thin channels do not join otherwise separate pockets as they would in a connected-
 * component count. Fractions use the full sampled canvas, including outer margins.
 * @param {ArrayLike<number>} mask row-major, 1 occupied / 0 empty
 * @param {number} cols @param {number} rows
 */
export function scoreOccupancy(mask, cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols * rows > 1048576 || mask.length !== cols * rows) {
    throw new CollageError('invalid_scoring_input', 'Occupancy dimensions must be positive integers matching the mask, with at most 1,048,576 cells.');
  }
  let empty = 0, largest = 0;
  let rectangle = { col: 0, row: 0, width: 0, height: 0 };
  const heights = new Uint32Array(cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = mask[row * cols + col];
      if (value !== 0 && value !== 1) throw new CollageError('invalid_scoring_input', 'Occupancy cells must be 0 or 1.');
      if (value === 0) { empty++; heights[col]++; } else heights[col] = 0;
    }
    // Largest rectangle under the histogram of consecutive empty cells. O(rows*cols).
    /** @type {{start:number,height:number}[]} */
    const stack = [];
    for (let col = 0; col <= cols; col++) {
      const height = col === cols ? 0 : heights[col];
      let start = col;
      while (stack.length && stack[stack.length - 1].height > height) {
        const prior = /** @type {{start:number,height:number}} */ (stack.pop());
        start = prior.start;
        const area = prior.height * (col - start);
        if (area > largest) {
          largest = area;
          rectangle = { col: start, row: row - prior.height + 1, width: col - start, height: prior.height };
        }
      }
      if (height > 0 && (!stack.length || stack[stack.length - 1].height < height)) stack.push({ start, height });
    }
  }
  return {
    empty_fraction: empty / mask.length,
    largest_empty_rectangle_fraction: largest / mask.length,
    largest_empty_rectangle: rectangle,
  };
}

/**
 * Sample transformed glyph-box footprints at grid-cell centres. `resolution` is
 * the longest grid side; approximately square cells preserve the canvas aspect ratio.
 * Space glyphs remain empty; letter interiors count as occupied within their boxes.
 * This measures typographic occupied regions, not literal ink. The largest empty
 * rectangle identifies broad visual gaps.
 * Post-warp matrices are in points, unlike the base geometry's inches.
 * @param {import('./index.js').Result} result
 * @param {Map<string,import('./fonts.js').Face>} faces
 * @param {{resolution?:number}} [options]
 */
export function measureWhitespace(result, faces, { resolution = 160 } = {}) {
  const { width_in: width, height_in: height } = result.card;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !Number.isInteger(resolution) || resolution < 16 || resolution > 1024) {
    throw new CollageError('invalid_scoring_input', 'Canvas sides must be positive and finite; whitespace resolution must be an integer from 16 to 1024.');
  }
  const longest = Math.max(width, height);
  const cols = Math.max(1, Math.round(resolution * width / longest)), rows = Math.max(1, Math.round(resolution * height / longest));
  const mask = new Uint8Array(cols * rows);
  for (const glyph of glyphGeometry(result, faces)) {
    if (!glyph.corners.length) continue;
    const saved = result.lines[glyph.line].glyph_transforms;
    const raw = saved ? saved[glyph.char] : glyph.matrix;
    if (!raw || raw.length !== 6 || !raw.every(Number.isFinite)) throw new CollageError('invalid_scoring_input', 'Each visible glyph needs a finite six-component transform.');
    const matrix = /** @type {import('./warp.js').Matrix} */ (saved ? raw.map(value => value / 72) : raw);
    const points = glyph.corners.map(point => {
      const [x, y] = applyMatrix(matrix, point);
      return [x / width * cols, y / height * rows];
    });
    const left = Math.max(0, Math.floor(Math.min(...points.map(p => p[0]))));
    const right = Math.min(cols - 1, Math.floor(Math.max(...points.map(p => p[0]))));
    const top = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
    const bottom = Math.min(rows - 1, Math.floor(Math.max(...points.map(p => p[1]))));
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      if (mask[row * cols + col]) continue;
      let positive = false, negative = false;
      for (let i = 0; i < 4; i++) {
        const a = points[i], b = points[(i + 1) % 4];
        const cross = (b[0] - a[0]) * (row + .5 - a[1]) - (b[1] - a[1]) * (col + .5 - a[0]);
        if (cross > 1e-10) positive = true;
        if (cross < -1e-10) negative = true;
      }
      if (!(positive && negative)) mask[row * cols + col] = 1;
    }
  }
  return { basis: 'glyph-box cell-centre sampling', cols, rows, ...scoreOccupancy(mask, cols, rows) };
}
