// The tool's single entry point. The page (through its worker), window.Photomosaic and
// cli.mjs all call submit(); nothing here touches the DOM.

import { rMersenneTwister } from '../../shared/rng.js';
import { solveAssignment } from './assign.js';
import { cost, features } from './color.js';
import { autoGrid, scaleImage } from './image.js';
import { PhotomosaicError, invalid, readRequest } from './request.js';

export { DEFAULTS, PhotomosaicError } from './request.js';
export { METRICS } from './color.js';
export { SUMMARY_WIDTH, autoGrid, cropImage, scaleImage, scaledHeight, summarisePhoto } from './image.js';
export { FITS, composeMosaic, layoutMosaic } from './layout.js';
export { solveAssignment } from './assign.js';

/**
 * @typedef {{ rowsDone: number, rows: number }} Progress
 * @typedef {ReturnType<typeof submit>} Result
 */

/**
 * The grid a request asks for: the R script's rule for count × maxUses photo uses, or
 * `columns` columns with as many rows as keep the target's shape. Throws a PhotomosaicError
 * if it has no cells or more than the photos can fill.
 * @param {{ count: number, width: number, height: number, columns: number | null, maxUses: number }} options
 */
export function gridFor({ count, width, height, columns, maxUses }) {
  const uses = count * maxUses;
  if (columns === null) {
    const grid = autoGrid(uses, width, height);
    if (grid.rows >= 1 && grid.columns >= 1) return { ...grid, rule: /** @type {const} */ ('auto') };
    let need = uses + 1;
    while (Math.min(...Object.values(autoGrid(need, width, height))) < 1) need++;
    throw invalid([{
      code: 'too_few_photos', path: 'photos',
      message: `${uses} photo uses are too few for a grid of this target's shape (${width} × ${height}); it needs at least ${need}, or set columns`,
    }]);
  }
  const grid = { rows: Math.max(1, Math.round((columns * height) / width)), columns, rule: /** @type {const} */ ('columns') };
  const cells = grid.rows * grid.columns;
  if (cells > uses) {
    throw invalid([{
      code: 'too_few_photos', path: 'columns',
      message: `a ${grid.columns} × ${grid.rows} grid has ${cells} cells, more than ${count} photos used at most ${maxUses} time${maxUses > 1 ? 's' : ''} each can fill; use fewer columns, or maxUses ${Math.ceil(cells / count)} or more`,
    }]);
  }
  return grid;
}

/**
 * Validates a request and returns the mosaic: the photo for each cell, chosen so that the
 * cells' total cost is least, each photo used at most maxUses times.
 * @param {unknown} request see api.md
 * @param {{ onProgress?: (progress: Progress) => void }} [hooks] called after each cell is placed
 */
export function submit(request, hooks = {}) {
  const started = performance.now();
  const p = readRequest(request);
  const n = p.means.length / 4;
  const grid = gridFor({ count: n, width: p.target.width, height: p.target.height, columns: p.columns, maxUses: p.maxUses });
  const cellCount = grid.rows * grid.columns;

  // the target averaged over each cell, as image_scale() to columns x rows
  const cells = scaleImage(p.target, grid.columns, grid.rows).data;
  const cellsDone = performance.now();

  // R's sample(imgs) after set.seed(seed): the order the photos are matched in, which
  // decides only between equal costs
  const order = rMersenneTwister(p.seed).uniform(n, n);
  const shuffled = new Float64Array(4 * n);
  order.forEach((photo, k) => shuffled.set(p.means.subarray(4 * photo, 4 * photo + 4), 4 * k));
  const cellF = features(cells, p.metric);
  const photoF = features(shuffled, p.metric);
  const slots = n * p.maxUses; // slot j is the shuffled photo j mod n
  const slotsOf = solveAssignment(cellCount, slots, (i, row) => {
    for (let j = 0; j < slots; j++) row[j] = cost(cellF, i, photoF, j % n);
  }, (rowsDone) => hooks.onProgress?.({ rowsDone, rows: cellCount }));
  const assignmentDone = performance.now();

  const assignment = new Array(cellCount);
  const perCell = new Array(cellCount);
  const uses = new Array(n).fill(0);
  let total = 0;
  for (let i = 0; i < cellCount; i++) {
    const k = slotsOf[i] % n;
    assignment[i] = order[k];
    uses[order[k]]++;
    perCell[i] = cost(cellF, i, photoF, k);
    total += perCell[i];
  }
  if (uses.some((u) => u > p.maxUses)) throw new PhotomosaicError('internal_error', 'a photo was used more often than maxUses');

  return {
    grid: { rows: grid.rows, columns: grid.columns, cells: cellCount, rule: grid.rule },
    assignment,
    cost: { total, mean: total / cellCount, perCell },
    cells: Array.from({ length: cellCount }, (_, i) => Array.from(cells.subarray(4 * i, 4 * i + 4))),
    uses,
    photos: { count: n, used: uses.filter((u) => u > 0).length, names: p.names },
    settings: { columns: p.columns, maxUses: p.maxUses, metric: p.metric, seed: p.seed },
    timings: {
      prepareMs: round1(cellsDone - started),
      assignmentMs: round1(assignmentDone - cellsDone),
      totalMs: round1(performance.now() - started),
    },
  };
}

/** @param {number} x */
const round1 = (x) => Math.round(x * 10) / 10;
