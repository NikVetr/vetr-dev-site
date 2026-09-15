// Assign atoms to columns.
//
// This is the piece the reference sheet did by hand: its better-looking variant
// abandoned \multicols for explicit \colbox and the author placed each section in
// a column himself. The problem is Knuth-Plass one level up -- choose breakpoints
// in an ordered sequence to minimise total raggedness -- so it is solved the same
// way, with an exact dynamic program rather than a greedy fill.
//
// The one hard constraint is `keepWithNext`, which binds a heading to the rows it
// introduces. It is enforced by refusing those breakpoints rather than by
// penalising them, so a stranded heading cannot be bought at any price.

/** @typedef {import('./atoms.js').Atom} Atom */

// Slack costs (slack/H)^2 * SLACK_WEIGHT, so a completely empty column costs
// SLACK_WEIGHT and the break penalties in atoms.js are on the same scale.
const SLACK_WEIGHT = 1000;

// The last column of a multi-column document is conventionally allowed to run
// short; penalising it fully would distort every column before it.
const LAST_COLUMN_RELIEF = 0.15;

/**
 * @typedef {Object} BreakResult
 * @property {number[][]} columns  atom indices per column, in order
 * @property {number[]} slack      unused height per column, in points
 * @property {number} cost
 * @property {string|null} failure why no assignment exists, if none does
 */

/**
 * @param {Atom[]} atoms
 * @param {number|number[]} height  usable column height in points: one number when
 *   every column is the same, or one per bin when a corner tab makes them differ --
 *   a `left` tab costs its line to the first column only, so the others are taller
 *   by the band's height
 * @param {number} bins     columns x faces
 * @returns {BreakResult}
 */
export function breakColumns(atoms, height, bins) {
  const n = atoms.length;
  // Per-bin capacity. A scalar is the common case and stays one comparison; an array
  // is what a corner tab produces, and every use of a column's height below is the
  // height of the column the DP is filling at that moment, so the substitution is
  // local rather than structural.
  const cap = Array.isArray(height)
    ? (/** @type {number} */ k) => height[k]
    : () => /** @type {number} */ (height);
  const tallest = Array.isArray(height) ? Math.max(...height) : height;
  const empty = { columns: [], slack: [], cost: Infinity, failure: /** @type {string|null} */ (null) };
  // No content is a valid assignment: every column is empty and entirely slack.
  // Returning bare `[]` here instead made the caller read slack[bin] as undefined
  // and report "NaNpt of whitespace" once every section was switched off.
  if (!n) {
    return {
      columns: Array.from({ length: bins }, () => []),
      slack: Array.from({ length: bins }, (_, k) => cap(k)),
      cost: 0,
      failure: null,
    };
  }

  // Against the tallest column: an atom that will not fit the roomiest one cannot
  // fit anywhere, and the DP refuses it per column on the way past.
  const tooTall = atoms.findIndex((a) => a.height > tallest + 0.01);
  if (tooTall >= 0) {
    return {
      ...empty,
      failure: `atom ${tooTall} in section ${atoms[tooTall].sectionId} is `
        + `${atoms[tooTall].height.toFixed(1)}pt tall but a column holds only ${tallest.toFixed(1)}pt`,
    };
  }
  // Fewer blocks than columns: fill the ones that can be filled and leave the rest
  // empty. This used to be a failure, and the failure was worse than the ragged
  // sheet it was avoiding -- `solveFaces` answers a failure by *adding* faces, which
  // adds bins, so the one move it has made the shortage worse at every step until it
  // hit the ceiling and reported "even 24 faces will not hold this" about a sheet
  // holding one row. Two clicks in the studio reach it: add your own term, untick
  // everything else, and the canvas went blank.
  //
  // The DP itself needs no special case -- it is the same search into `n` bins, and
  // the trailing columns are exactly the all-empty shape the no-atoms path above
  // already returns. `loose-columns` then reports the whitespace, which is the true
  // thing to say: the sheet is short of content for this many columns.
  // The bound is not the atom count but the number of atoms that may *open* a
  // column, which is fewer: a heading is bound to the rows it introduces, so the atom
  // after it cannot start one. A sheet of one section is two atoms and exactly one
  // legal start, and asking it to fill even two columns is unsatisfiable however tall
  // they are.
  let starts = 1;
  for (let i = 1; i < n; i += 1) if (!atoms[i - 1].keepWithNext) starts += 1;
  if (bins > starts) {
    const partial = breakColumns(atoms, height, starts);
    if (partial.failure) return partial;
    return {
      ...partial,
      columns: [...partial.columns, ...Array.from({ length: bins - starts }, () => [])],
      slack: [...partial.slack,
        ...Array.from({ length: bins - starts }, (_, t) => cap(starts + t))],
    };
  }

  // cost[k][i]: best cost for placing atoms [0, i) into exactly k columns.
  const cost = Array.from({ length: bins + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const from = Array.from({ length: bins + 1 }, () => new Int32Array(n + 1).fill(-1));
  cost[0][0] = 0;

  for (let k = 0; k < bins; k += 1) {
    const last = k === bins - 1;
    for (let i = 0; i < n; i += 1) {
      const base = cost[k][i];
      if (base === Infinity) continue;
      const opening = i > 0 ? atoms[i].breakCost : 0;
      let used = 0;
      for (let j = i; j < n; j += 1) {
        used += atoms[j].height + (j > i ? atoms[j].gapBefore.natural : 0);
        if (used > cap(k) + 0.01) break;
        // A non-final column must leave enough atoms to fill the columns after it.
        if (!last && n - (j + 1) < bins - (k + 1)) break;
        // A heading is bound to the rows it introduces, so no column may end
        // here -- but taller runs starting at `i` are still worth trying.
        if (atoms[j].keepWithNext) continue;
        const slack = cap(k) - used;
        const ragged = (slack / cap(k)) ** 2 * SLACK_WEIGHT * (last ? LAST_COLUMN_RELIEF : 1);
        const total = base + opening + ragged;
        if (total < cost[k + 1][j + 1]) {
          cost[k + 1][j + 1] = total;
          from[k + 1][j + 1] = i;
        }
      }
    }
  }

  if (cost[bins][n] === Infinity) {
    return {
      ...empty,
      failure: `content does not fit in ${bins} columns of ${tallest.toFixed(1)}pt`,
    };
  }

  /** @type {number[][]} */ const columns = [];
  /** @type {number[]} */ const slack = [];
  let end = n;
  for (let k = bins; k > 0; k -= 1) {
    const start = from[k][end];
    columns.unshift(Array.from({ length: end - start }, (_, t) => start + t));
    let used = 0;
    for (let j = start; j < end; j += 1) {
      used += atoms[j].height + (j > start ? atoms[j].gapBefore.natural : 0);
    }
    slack.unshift(cap(k - 1) - used);
    end = start;
  }
  return { columns, slack, cost: cost[bins][n], failure: null };
}
