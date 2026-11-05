// Table positions and the table-to-table closeness the geography term uses (R/layout.R).

import { rsum, seqLength } from './rmath.js';

/**
 * The original script's spiral: points along an Archimedean spiral, each table the first
 * point more than 2.25 table radii (radius 0.5) past the previous one. Returns fewer points
 * than asked for when the spiral has no room for more.
 * @param {number} nTables
 * @returns {[number, number][]}
 */
export function spiralLayout(nTables, rad = 0.5, nCircles = 10, nGran = 2000) {
  const theta = seqLength(0, nCircles * 2 * Math.PI, nGran);
  const r = seqLength(rad, rad * nCircles * 2.25, nGran);
  const path = theta.map((th, i) => [r[i] * Math.cos(th), r[i] * Math.sin(th)]);
  const idx = [0];
  for (let i = 1; i < nTables; i++) {
    const [x0, y0] = path[idx[i - 1]];
    let next = -1;
    for (let j = idx[i - 1] + 1; j < nGran; j++) {
      const dx = path[j][0] - x0;
      const dy = path[j][1] - y0;
      if (Math.sqrt(rsum([dx * dx, dy * dy])) > rad * 2.25) { // rowSums, as R adds
        next = j;
        break;
      }
    }
    if (next < 0) break;
    idx.push(next);
  }
  return idx.map((i) => /** @type {[number, number]} */ ([path[i][0], path[i][1]]));
}

/**
 * The original script's grid: rows of ceil(sqrt(n)) tables at unit spacing.
 * @param {number} nTables
 * @returns {[number, number][]}
 */
export function gridLayout(nTables) {
  const side = Math.ceil(Math.sqrt(nTables));
  return Array.from({ length: nTables }, (_, k) => {
    const i = k + 1;
    return [Math.floor((i + 1e-6) % side), side - Math.ceil((i + 1e-6) / side)];
  });
}

/**
 * (1 - distance / max distance)^2 between every pair of tables: 1 for a table with itself,
 * 0 for the farthest pair ("sound travels as a shell propto square of distance").
 * @param {[number, number][]} xy
 * @returns {Float64Array} T x T, row-major
 */
export function tableCloseness(xy) {
  const T = xy.length;
  const d = new Float64Array(T * T);
  let max = 0;
  for (let i = 0; i < T; i++) {
    for (let j = 0; j < T; j++) {
      const dx = xy[i][0] - xy[j][0];
      const dy = xy[i][1] - xy[j][1];
      d[i * T + j] = Math.sqrt(dx * dx + dy * dy);
      if (d[i * T + j] > max) max = d[i * T + j];
    }
  }
  return d.map((v) => {
    const c = 1 - (max > 0 ? v / max : v);
    return c * c;
  });
}
