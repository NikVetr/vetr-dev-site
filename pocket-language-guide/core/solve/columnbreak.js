// Assign atoms to columns.
//
// This is the piece the reference sheet did by hand: its better-looking variant
// abandoned \multicols for explicit \colbox and the author placed each section in
// a column himself. The problem is Knuth-Plass one level up -- choose breakpoints
// in an ordered sequence to minimise total raggedness -- so it is solved the same
// way, with an exact dynamic program rather than a greedy fill.

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
 * @param {number} height   usable column height in points
 * @param {number} bins     columns x faces
 * @returns {BreakResult}
 */
export function breakColumns(atoms, height, bins) {
  const n = atoms.length;
  const empty = { columns: [], slack: [], cost: Infinity, failure: /** @type {string|null} */ (null) };
  if (!n) return { ...empty, cost: 0, columns: [], slack: [] };

  const tooTall = atoms.findIndex((a) => a.height > height + 0.01);
  if (tooTall >= 0) {
    return {
      ...empty,
      failure: `atom ${tooTall} in section ${atoms[tooTall].sectionId} is `
        + `${atoms[tooTall].height.toFixed(1)}pt tall but a column holds only ${height.toFixed(1)}pt`,
    };
  }
  if (bins > n) return { ...empty, failure: `${bins} columns but only ${n} blocks to fill them` };

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
        if (used > height + 0.01) break;
        // A non-final column must leave enough atoms to fill the columns after it.
        if (!last && n - (j + 1) < bins - (k + 1)) break;
        const slack = height - used;
        const ragged = (slack / height) ** 2 * SLACK_WEIGHT * (last ? LAST_COLUMN_RELIEF : 1);
        const total = base + opening + ragged;
        if (total < cost[k + 1][j + 1]) {
          cost[k + 1][j + 1] = total;
          from[k + 1][j + 1] = i;
        }
      }
    }
  }

  if (cost[bins][n] === Infinity) {
    return { ...empty, failure: `content does not fit in ${bins} columns of ${height.toFixed(1)}pt` };
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
    slack.unshift(height - used);
    end = start;
  }
  return { columns, slack, cost: cost[bins][n], failure: null };
}
