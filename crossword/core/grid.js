// Crossword grid state: stray-word check, trimming, the word-intersection graph,
// numbering and the filled-in silhouette. Ported from R/grid.R of the R generator.
//
// A state is a rows x cols canvas of cells (row-major, "" for empty, otherwise one
// grapheme) plus `locs`: for each word, in entry order, the [row, col] cells it
// occupies (0-based), or null while it is not placed.

/**
 * @typedef {[number, number]} Cell
 * @typedef {{ rows: number, cols: number, cells: string[], locs: (Cell[] | null)[] }} State
 * @typedef {{ text: string, cells: string[] }} Word a grid word: its letters joined, and one grapheme per cell
 */

/** @param {number} size @param {number} nWords @returns {State} */
export function emptyState(size, nWords) {
  return { rows: size, cols: size, cells: new Array(size * size).fill(''), locs: new Array(nWords).fill(null) };
}

/** @param {State} state @returns {State} */
export function cloneState(state) {
  return { rows: state.rows, cols: state.cols, cells: state.cells.slice(), locs: state.locs.slice() };
}

/** Writes a word's letters into the canvas and records its cells. @param {State} state @param {number} w @param {Word} word @param {Cell[]} cells */
export function placeWord(state, w, word, cells) {
  cells.forEach(([r, c], k) => { state.cells[r * state.cols + c] = word.cells[k]; });
  state.locs[w] = cells;
}

/**
 * Every run of two or more filled cells, across (row by row) then down (column by
 * column), as `find_words` reads them.
 * @param {State} state
 * @returns {{ text: string, length: number }[]}
 */
export function findWords({ rows, cols, cells }) {
  /** @type {{ text: string, length: number }[]} */
  const found = [];
  /** @param {number} start @param {number} step @param {number} n */
  const scan = (start, step, n) => {
    /** @type {string[]} */
    let run = [];
    for (let k = 0; k <= n; k++) {
      const v = k < n ? cells[start + k * step] : '';
      if (v !== '') {
        run.push(v);
      } else {
        if (run.length > 1) found.push({ text: run.join(''), length: run.length });
        run = [];
      }
    }
  };
  for (let r = 0; r < rows; r++) scan(r * cols, 1, cols);
  for (let c = 0; c < cols; c++) scan(c, cols, rows);
  return found;
}

/**
 * The stray-word check (`find_n_extra`): for each word missing from the grid, the
 * extra letters of every stray run containing it, then the length of every stray run
 * that contains no missing word. A layout is acceptable when these sum to 0, which
 * happens exactly when every run in the grid is one of the words.
 * @param {State} state
 * @param {Word[]} words
 * @returns {number[]}
 */
export function findNExtra(state, words) {
  const found = findWords(state);
  const wordTexts = new Set(words.map((w) => w.text));
  const foundTexts = new Set(found.map((f) => f.text));
  /** @type {Map<string, number>} */
  const bad = new Map();
  for (const f of found) if (!wordTexts.has(f.text)) bad.set(f.text, f.length);
  const missing = words.filter((w) => !foundTexts.has(w.text));
  if (!bad.size && !missing.length) return [0, 0];

  const badTexts = [...bad.keys()];
  const nExtra = missing.length
    ? missing.flatMap((word) => {
      const extra = badTexts.filter((b) => b.includes(word.text)).map((b) => /** @type {number} */ (bad.get(b)) - word.cells.length);
      return extra.length ? extra : [0];
    })
    : [0];
  const nUnmatched = missing.length
    ? badTexts.map((b) => (missing.some((word) => b.includes(word.text)) ? 0 : /** @type {number} */ (bad.get(b))))
    : badTexts.map((b) => /** @type {number} */ (bad.get(b)));
  return [...nExtra, ...(nUnmatched.length ? nUnmatched : [0])];
}

/** "across" if a placed word's first two cells share a row, else "down". @param {Cell[]} cells @returns {'across' | 'down'} */
export function direction(cells) {
  return cells[0][0] === cells[1][0] ? 'across' : 'down';
}

/**
 * The grid with its empty rows and columns removed, and each word's cells moved to
 * match (`trim_matrix`).
 * @param {State} state
 * @returns {State}
 */
export function trimState({ rows, cols, cells, locs }) {
  const rowUsed = new Array(rows).fill(false);
  const colUsed = new Array(cols).fill(false);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r * cols + c] !== '') rowUsed[r] = colUsed[c] = true;
    }
  }
  /** @param {boolean[]} used */
  const newIndex = (used) => {
    let next = 0;
    return used.map((u) => (u ? next++ : -1));
  };
  const rowTo = newIndex(rowUsed);
  const colTo = newIndex(colUsed);
  const nRows = rowUsed.filter(Boolean).length;
  const nCols = colUsed.filter(Boolean).length;
  const trimmed = new Array(nRows * nCols).fill('');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r * cols + c] !== '') trimmed[rowTo[r] * nCols + colTo[c]] = cells[r * cols + c];
    }
  }
  return {
    rows: nRows,
    cols: nCols,
    cells: trimmed,
    locs: locs.map((word) => (word ? word.map(([r, c]) => /** @type {Cell} */ ([rowTo[r], colTo[c]])) : null)),
  };
}

/**
 * The word-intersection graph: for each word, the other words it shares a cell with
 * (`xword_adjacency_matrix`). Unplaced words have no neighbours.
 * @param {(Cell[] | null)[]} locs
 * @returns {number[][]}
 */
export function adjacency(locs) {
  /** @type {Map<number, number[]>} */
  const byCell = new Map();
  locs.forEach((word, w) => {
    if (!word) return;
    for (const [r, c] of word) {
      const key = r * 65536 + c;
      const list = byCell.get(key);
      if (list) list.push(w);
      else byCell.set(key, [w]);
    }
  });
  /** @type {Set<number>[]} */
  const sets = locs.map(() => new Set());
  for (const list of byCell.values()) {
    for (const a of list) for (const b of list) if (a !== b) sets[a].add(b);
  }
  return sets.map((s) => [...s].sort((a, b) => a - b));
}

/**
 * Articulation points (cut vertices) of the graph on `nodes`: the vertices whose
 * removal disconnects their component.
 * @param {number[]} nodes
 * @param {number[][]} neighbours indexed by vertex
 * @returns {Set<number>}
 */
export function articulationPoints(nodes, neighbours) {
  /** @type {Map<number, number>} */
  const order = new Map();
  /** @type {Map<number, number>} */
  const low = new Map();
  /** @type {Set<number>} */
  const cut = new Set();
  /** @param {number} u @param {number} parent */
  const visit = (u, parent) => {
    order.set(u, order.size);
    low.set(u, /** @type {number} */ (order.get(u)));
    let children = 0;
    for (const v of neighbours[u]) {
      if (!order.has(v)) {
        children++;
        visit(v, u);
        low.set(u, Math.min(/** @type {number} */ (low.get(u)), /** @type {number} */ (low.get(v))));
        if (parent !== -1 && /** @type {number} */ (low.get(v)) >= /** @type {number} */ (order.get(u))) cut.add(u);
      } else if (v !== parent) {
        low.set(u, Math.min(/** @type {number} */ (low.get(u)), /** @type {number} */ (order.get(v))));
      }
    }
    if (parent === -1 && children > 1) cut.add(u);
  };
  for (const u of nodes) if (!order.has(u)) visit(u, -1);
  return cut;
}

/**
 * Placed words that can be taken out without splitting the crossword: those that
 * are not articulation points of the intersection graph (`removable_words`), in
 * entry order.
 * @param {(Cell[] | null)[]} locs
 */
export function removableWords(locs) {
  const placed = locs.flatMap((word, w) => (word ? [w] : []));
  const cut = articulationPoints(placed, adjacency(locs));
  return placed.filter((w) => !cut.has(w));
}

/**
 * Clue numbers in reading order (`number_words`): start cells sorted by row, then
 * column, numbered 1, 2, ...; an across and a down word starting in the same cell
 * share a number.
 * @param {(Cell[] | null)[]} locs
 * @returns {{ word: number, row: number, col: number, dir: 'across' | 'down', number: number }[]} in reading order
 */
export function numberWords(locs) {
  const starts = locs
    .flatMap((word, w) => (word ? [{ word: w, row: word[0][0], col: word[0][1], dir: direction(word) }] : []))
    .sort((a, b) => a.row - b.row || a.col - b.col || a.word - b.word);
  let number = 0;
  return starts.map((s, i) => {
    if (i === 0 || s.row !== starts[i - 1].row || s.col !== starts[i - 1].col) number++;
    return { ...s, number };
  });
}

/**
 * The crossword's silhouette for comparing with a target picture
 * (`fill_adj_elements`): the letter cells (word by word, without repeats) followed by
 * every empty cell of the grid with at least two letter cells among its four
 * neighbours (column by column).
 * @param {State} state usually trimmed
 * @returns {Cell[]}
 */
export function fillAdjElements({ rows, cols, locs }) {
  const filled = new Uint8Array(rows * cols);
  /** @type {Cell[]} */
  const out = [];
  for (const word of locs) {
    if (!word) continue;
    for (const [r, c] of word) {
      if (!filled[r * cols + c]) {
        filled[r * cols + c] = 1;
        out.push([r, c]);
      }
    }
  }
  const letter = filled.slice();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (filled[r * cols + c]) continue;
      const n = (r > 0 ? letter[(r - 1) * cols + c] : 0) + (r < rows - 1 ? letter[(r + 1) * cols + c] : 0)
        + (c > 0 ? letter[r * cols + c - 1] : 0) + (c < cols - 1 ? letter[r * cols + c + 1] : 0);
      if (n >= 2) {
        filled[r * cols + c] = 1;
        out.push([r, c]);
      }
    }
  }
  return out;
}
