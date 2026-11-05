// Occupancy-grid flow layout (R/layout.R): find_compatible_start, place_line, place_message,
// layout_messages and snap_lines_right, with the same constants, scans and tie rules. Rows and
// columns are 1-based, as in R. A cell holds 0 (free), i (message i) or -1 (forbidden while
// message i restarts). The grid is virtually extended by free rows below its bottom edge, and
// grows when a line is placed there.

import { CollageError } from './request.js';
import { cumsum } from './rmath.js';

/**
 * @typedef {import('./measure.js').Dims} Dims
 * @typedef {'left' | 'right' | 'more_left' | 'more_right' | null} Just
 * @typedef {{ string: string, ci: number, ri: number, width: number, height: number, buffered_height: number,
 *   v_adj: number, v_adj_s: number, just: Just, end_ci: number, end_ri: number }} Line
 *   one placed line: its words, layout column and row, width and heights in cells, and last cell
 */

export class Grid {
  /** @param {number} rows @param {number} cols */
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.cells = new Int32Array(rows * cols);
  }

  /** @param {number} r @param {number} c */
  at(r, c) {
    return this.cells[(r - 1) * this.cols + c - 1];
  }

  /** Appends free rows so the grid has at least `rows`. @param {number} rows */
  growTo(rows) {
    if (rows <= this.rows) return;
    const cells = new Int32Array(rows * this.cols);
    cells.set(this.cells);
    this.cells = cells;
    this.rows = rows;
  }

  /** Replaces every cell holding `from` with `to`. @param {number} from @param {number} to */
  replace(from, to) {
    const { cells } = this;
    for (let k = 0; k < cells.length; k++) if (cells[k] === from) cells[k] = to;
  }
}

/**
 * The top-left-most start (row-major) of a p x q block of cells free or already message `id`'s.
 * Candidate rows are those whose own row has at least q such cells; the p rows past the bottom
 * count as free. `target` restricts the search to one row and a column range, for a message's
 * next line. maxWidth is the free width from the start across the block's rows.
 * @param {Grid} grid @param {number} id @param {number} p @param {number} q
 * @param {{ row: number, colFrom: number, colTo: number } | null} [target]
 * @returns {{ row: number, col: number, maxWidth: number } | null}
 */
export function findCompatibleStart(grid, id, p, q, target = null) {
  const { rows: n, cols: m, cells } = grid;
  const c0 = target ? Math.max(1, target.colFrom) : 1;
  const c1 = Math.min(m - q + 1, target ? target.colTo : m);
  if (c0 > c1) return null;
  const free = new Uint8Array(m + 2);
  const run = new Int32Array(m + 2);
  const rFrom = target ? target.row : 1;
  const rTo = target ? target.row : n + 1;
  for (let r = rFrom; r <= rTo; r++) {
    if (r > n + 1) break;
    if (r <= n) {
      let usable = 0;
      for (let k = (r - 1) * m, end = k + m; k < end; k++) if (cells[k] === 0 || cells[k] === id) usable++;
      if (usable < q) continue;
    }
    free.fill(1);
    for (let rr = r; rr <= Math.min(r + p - 1, n); rr++) {
      const base = (rr - 1) * m - 1;
      for (let c = 1; c <= m; c++) {
        const v = cells[base + c];
        if (v !== 0 && v !== id) free[c] = 0;
      }
    }
    run[m + 1] = 0;
    for (let c = m; c >= 1; c--) run[c] = free[c] ? run[c + 1] + 1 : 0;
    for (let c = c0; c <= c1; c++) if (run[c] >= q) return { row: r, col: c, maxWidth: run[c] };
  }
  return null;
}

/**
 * Places all lines of message `id` (place_message / place_line). Each line takes as many of the
 * unplaced words as fit the free run found for it: the first line anywhere, the next ones on the
 * row below the previous line and within its span, aligned with it when the cells allow. When no
 * next line fits, the message's cells are forbidden and it restarts from its first word.
 * @param {number} id @param {Dims} d @param {Grid} grid
 * @param {number} cexScale @param {number} lineGap @param {number} messageGap
 * @returns {{ lines: Line[], restarts: number }}
 */
export function placeMessage(id, d, grid, cexScale, lineGap, messageGap) {
  const w = d.w.map((x) => x * cexScale);
  const ws = d.ws * cexScale;
  const vAdj = d.h * cexScale * lineGap;
  const vAdjS = d.h * cexScale * messageGap;
  const wordH = d.h * cexScale + vAdj;
  const wordHB = wordH + vAdjS;
  const p = Math.ceil(wordHB);
  /** @type {Line[]} */
  let lines = [];
  let next = 0; // words are placed in order: the first unplaced one
  let restarts = 0;
  while (next < w.length) {
    const prev = lines.at(-1);
    const first = w[next];
    const half = Math.ceil(first / 2);
    const start = findCompatibleStart(grid, id, p, Math.ceil(first + ws), prev && {
      row: prev.ri + Math.ceil(wordH), colFrom: prev.ci - half, colTo: prev.ci + Math.ceil(prev.width) - half,
    });
    if (!start) {
      if (!prev) throw new CollageError('internal_error', `message ${id}: no room for its first word on an empty row`);
      grid.replace(id, -1);
      lines = [];
      next = 0;
      restarts++;
      continue;
    }

    const todo = w.length - next;
    const cumW = cumsum(w.slice(next));
    const cumS = cumsum(new Float64Array(todo).fill(ws));
    let fits = 0;
    for (let k = 0; k < todo; k++) if (cumW[k] + cumS[k] < start.maxWidth) fits++;
    const nFit = Math.max(1, fits); // >= 1: only an exact tie leaves none, as q <= maxWidth
    const width = cumW[nFit - 1] + cumS[nFit - 1];
    let ci = start.col;
    const ri = start.row;
    /** @type {Just} */
    let just = null;
    if (prev) ({ ci, just } = align(id, grid, prev, ci, ri, width, wordHB));

    const endCi = Math.min(Math.ceil(ci + width - 1), grid.cols);
    const endRi = Math.ceil(ri + wordHB - 1);
    grid.growTo(endRi);
    for (let r = ri; r <= endRi; r++) {
      for (let c = Math.floor(ci); c <= endCi; c++) {
        const v = grid.at(r, c);
        if (v !== 0 && v !== id) throw new CollageError('internal_error', `line ${lines.length + 1} of message ${id} overlaps occupied cells`);
        grid.cells[(r - 1) * grid.cols + c - 1] = id;
      }
    }
    lines.push({
      string: d.words.slice(next, next + nFit).join(' '), ci, ri, width, height: wordH, buffered_height: wordHB,
      v_adj: vAdj, v_adj_s: vAdjS, just, end_ci: endCi, end_ri: endRi,
    });
    next += nFit;
  }
  grid.replace(-1, 0);
  return { lines, restarts };
}

/**
 * Aligns a continuation line with the previous line: left or right if its cells are free (right
 * when both are and the previous line's centre is in the right half), otherwise as close as the
 * free run allows, preferring the side with clearly more overlap (by more than 0.25).
 * @param {number} id @param {Grid} grid @param {Line} prev
 * @param {number} ci the found start column @param {number} ri its row @param {number} width @param {number} wordHB
 * @returns {{ ci: number, just: Just }}
 */
function align(id, grid, prev, ci, ri, width, wordHB) {
  const m = grid.cols;
  const sw = Math.ceil(width);
  const prevRight = prev.ci + prev.width / 2 > m / 2;
  const lj = [prev.ci, prev.ci + sw - 1];
  const rj = [prev.ci + Math.ceil(prev.width) - sw, prev.ci + Math.ceil(prev.width) - 1];
  const inGrid = ri <= grid.rows;
  const lastRow = Math.min(Math.ceil(ri + wordHB - 1), grid.rows);
  const colFree = new Uint8Array(m + 1); // column c usable on every row of the line (within the grid)
  let bounds = [1, m];
  if (inGrid) {
    for (let c = 1; c <= m; c++) {
      colFree[c] = 1;
      for (let r = ri; r <= lastRow; r++) {
        const v = grid.at(r, c);
        if (v !== 0 && v !== id) { colFree[c] = 0; break; }
      }
    }
    let lo = ci;
    let hi = ci;
    while (lo > 1 && colFree[lo - 1]) lo--;
    while (hi < m && colFree[hi + 1]) hi++;
    bounds = [lo, hi];
  }
  const possible = (/** @type {number[]} */ [a, b]) => {
    if (a < 1 || a > m || b < 1 || b > m) return false;
    if (inGrid) for (let c = a; c <= b; c++) if (!colFree[c]) return false;
    return true;
  };
  const closest = (/** @type {number[]} */ [a, b]) => {
    const ov0 = Math.max(bounds[0], a);
    const ov1 = Math.min(bounds[1], b);
    let lc = ov0;
    if (lc + sw - 1 > bounds[1]) lc = bounds[1] - sw + 1;
    return { p: (ov1 - ov0) / sw, lc };
  };
  const leftOk = possible(lj);
  const rightOk = possible(rj);
  if (leftOk && rightOk) return prevRight ? { ci: rj[0], just: 'right' } : { ci: lj[0], just: 'left' };
  if (leftOk) return { ci: lj[0], just: 'left' };
  if (rightOk) return { ci: rj[0], just: 'right' };
  const l = closest(lj);
  const r = closest(rj);
  const goRight = Math.abs(r.p - l.p) > 0.25 ? r.p > l.p : prevRight;
  return goRight ? { ci: r.lc, just: 'more_right' } : { ci: l.lc, just: 'more_left' };
}

/**
 * Places messages in order on an nRows x nCols grid that grows downward as needed. A word wider
 * than the card at this scale is an error, which R's original looped on forever.
 * @param {Dims[]} dims @param {number} nCols @param {number} nRows
 * @param {number} cexScale @param {number} lineGap @param {number} messageGap
 * @param {(i: number) => string} pathOf the request path of the message at layout index i
 */
export function layoutMessages(dims, nCols, nRows, cexScale, lineGap, messageGap, pathOf) {
  /** @type {import('./request.js').Issue[]} */
  const issues = [];
  for (let i = 0; i < dims.length; i++) {
    const widest = Math.max(...dims[i].w.map((x) => Math.ceil((x + dims[i].ws) * cexScale)));
    if (widest > nCols) {
      issues.push({ code: 'word_too_wide', path: pathOf(i), message: `a word is wider than the card at this scale (${widest} > ${nCols} cells); lower fill or the spread of size_range, or widen the card` });
    }
  }
  if (issues.length) {
    throw new CollageError('word_too_wide', `${issues.length === 1 ? 'A word is' : 'Words are'} wider than the card at this scale; lower fill or the spread of size_range, or widen the card`, issues);
  }
  const grid = new Grid(nRows, nCols);
  const lines = [];
  const restarts = [];
  for (let i = 0; i < dims.length; i++) {
    const out = placeMessage(i + 1, dims[i], grid, cexScale, lineGap, messageGap);
    lines.push(out.lines);
    restarts.push(out.restarts);
  }
  return { grid, lines, restarts };
}

/**
 * A line ending within 5% of the right edge moves flush right when the cells beside it (on its
 * rows down to one past its height) are free or its own message's. The grid is left as laid out.
 * @param {Line[][]} lines by message @param {Grid} grid
 * @returns {{ col: number, snapped: boolean }[][]}
 */
export function snapLinesRight(lines, grid) {
  const m = grid.cols;
  return lines.map((ls, i) => ls.map((l) => {
    if ((m - (l.ci + Math.ceil(l.width))) / m < 0.05) {
      const lastRow = Math.min(l.ri + Math.ceil(l.height), grid.rows);
      let clear = true;
      for (let r = l.ri; r <= lastRow && clear; r++) {
        for (let c = l.ci; c <= m; c++) {
          const v = grid.at(r, c);
          if (v !== 0 && v !== i + 1) { clear = false; break; }
        }
      }
      if (clear) {
        const col = m - Math.ceil(l.width) + 1;
        return { col, snapped: col !== l.ci };
      }
    }
    return { col: l.ci, snapped: false };
  }));
}
