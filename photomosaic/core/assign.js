// The linear sum assignment problem, which the R script solves with clue::solve_LSAP(): give
// each of n rows its own column, of m >= n, at the least total cost. clue pads the matrix to
// m × m with rows of a constant and runs a covering Hungarian method; this is the Hungarian
// method in its shortest-augmenting-path form with row and column potentials, which takes
// the rectangular matrix as it is, in O(n² m). Both find a minimum; when several assignments
// tie for it, they may return different ones.

/**
 * @param {number} n rows @param {number} m columns, m >= n
 * @param {(i: number, row: Float64Array) => void} fillRow writes row i's m costs into `row`
 * @param {(rowsDone: number) => void} [onRow] called after each row is placed
 * @returns {Int32Array} the column of each row
 */
export function solveAssignment(n, m, fillRow, onRow) {
  // 1-based: column 0 and row 0 are the search's virtual start
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const owner = new Int32Array(m + 1); // the row holding column j, 0 if none
  const way = new Int32Array(m + 1);
  const minv = new Float64Array(m + 1);
  const used = new Uint8Array(m + 1);
  const row = new Float64Array(m);
  for (let i = 1; i <= n; i++) {
    owner[0] = i;
    let j0 = 0;
    minv.fill(Infinity);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = owner[j0];
      const ui = u[i0];
      fillRow(i0 - 1, row);
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const reduced = row[j - 1] - ui - v[j];
        if (reduced < minv[j]) {
          minv[j] = reduced;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[owner[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (owner[j0] !== 0);
    do { // augment along the path found
      const j1 = way[j0];
      owner[j0] = owner[j1];
      j0 = j1;
    } while (j0 !== 0);
    onRow?.(i);
  }
  const columnOf = new Int32Array(n);
  for (let j = 1; j <= m; j++) if (owner[j]) columnOf[owner[j] - 1] = j - 1;
  return columnOf;
}
