// The objective (R/objective.R), maximized. Per table: a table term on the guests'
// categories, the sum of pair scores over guests seated together, and the constraint matrix
// summed the same way. Across tables: the geography term, -cost[i, j] * closeness(table_i,
// table_j) summed over ordered pairs of guests and attributed to guest i's table. Sums run in
// R's order with R's long-double rounding (rsum), so scores match R's to the last bit.

import { rsum } from './rmath.js';

/** @typedef {import('./request.js').Problem} Problem */
/** @typedef {{ table: number, pairs: number, constraints: number, geography: number }} Terms */

/**
 * The original script's three table objectives (it defined all three in turn; the last,
 * sqrt_distance, is the one that ran). sqrt_distance and geometric favour tables of alike
 * categories, variance favours spread-out ones.
 * @type {Record<'sqrt_distance' | 'geometric' | 'variance' | 'none', (v: number[]) => number>}
 */
export const TABLE_OBJECTIVES = {
  // -sum(dist(v)^0.5): pairs in dist()'s order, |difference| as sqrt((a - b)^2) gives it
  sqrt_distance(v) {
    const d = [];
    for (let j = 0; j < v.length; j++) for (let i = j + 1; i < v.length; i++) d.push(Math.sqrt(Math.abs(v[i] - v[j])));
    return -rsum(d);
  },
  // -sum(1 - 1 / 2^table(v))
  geometric(v) {
    /** @type {Map<number, number>} */
    const counts = new Map();
    for (const x of [...v].sort((a, b) => a - b)) counts.set(x, (counts.get(x) ?? 0) + 1);
    return -rsum([...counts.values()].map((c) => 1 - 1 / 2 ** c));
  },
  // var(v), two-pass as R's cov.c
  variance(v) {
    if (v.length < 2) return 0;
    let mean = rsum(v) / v.length;
    mean += rsum(v.map((x) => x - mean)) / v.length;
    return rsum(v.map((x) => (x - mean) * (x - mean))) / (v.length - 1);
  },
  none: () => 0,
};

/**
 * Sum of M over the pairs of members, each pair once, in R's upper.tri order.
 * @param {Float64Array} M @param {number} n @param {number[]} members
 */
export function pairSum(M, n, members) {
  const values = [];
  for (let j = 1; j < members.length; j++) {
    const row = members[j];
    for (let i = 0; i < j; i++) values.push(M[members[i] * n + row]);
  }
  return rsum(values);
}

/**
 * Weighted table, pairs and constraints terms of one table (empty seats have no category).
 * @param {Problem} problem @param {number[]} members seat indices in seat order
 */
export function tableTerms(problem, members) {
  const v = [];
  for (const s of members) if (!Number.isNaN(problem.category[s])) v.push(problem.category[s]);
  return {
    table: problem.weights.table * problem.objective(v),
    pairs: problem.weights.pairs * pairSum(problem.W, problem.nSeats, members),
    constraints: pairSum(problem.K, problem.nSeats, members),
  };
}

/**
 * The table of every seat, from a seating (one seat-index array per table).
 * @param {number[][]} tables @param {number} nSeats
 */
export function tableOfSeats(tables, nSeats) {
  const tableOf = new Int32Array(nSeats);
  tables.forEach((members, t) => { for (const s of members) tableOf[s] = t; });
  return tableOf;
}

/**
 * Unweighted geography term of every seat from scratch.
 * @param {Problem} problem @param {Int32Array} tableOf
 */
export function geographyBySeat(problem, tableOf) {
  const { nSeats: n, closeness: Q, tablemates } = problem;
  const C = /** @type {Float64Array} */ (problem.C);
  const T = problem.tableIds.length;
  const g = new Float64Array(n);
  const row = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ti = tableOf[i];
    for (let j = 0; j < n; j++) {
      const tj = tableOf[j];
      row[j] = C[i * n + j] * (!tablemates && ti === tj ? 0 : Q[ti * T + tj]);
    }
    g[i] = -rsum(row);
  }
  return g;
}

/** Sums of x by group, in index order (R's rowsum()). @param {ArrayLike<number>} x @param {Int32Array} group @param {number} nGroups */
export function groupSums(x, group, nGroups) {
  const out = new Float64Array(nGroups);
  for (let i = 0; i < x.length; i++) out[group[i]] += x[i];
  return out;
}

/**
 * The constraint matrix gives +penalty per together pair seated together; subtracting this
 * offset makes the reported constraints term -penalty per violated pair (0 when satisfied).
 * @param {Problem} problem
 */
export const constraintOffset = (problem) => problem.options.constraintPenalty * problem.together.length;

/**
 * Full evaluation of a seating: the score, its four weighted terms, and each table's terms.
 * @param {Problem} problem @param {number[][]} tables one seat-index array per table, in seat order
 * @returns {{ score: number, terms: Terms, byTable: Terms[] }}
 */
export function scoreAssignment(problem, tables) {
  const byTable = tables.map((members) => ({ ...tableTerms(problem, members), geography: 0 }));
  if (problem.C) {
    const tableOf = tableOfSeats(tables, problem.nSeats);
    const G = groupSums(geographyBySeat(problem, tableOf), tableOf, tables.length);
    byTable.forEach((t, i) => { t.geography = problem.weights.geography * G[i]; });
  }
  /** @type {Terms} */
  const terms = {
    table: rsum(byTable.map((t) => t.table)),
    pairs: rsum(byTable.map((t) => t.pairs)),
    constraints: rsum(byTable.map((t) => t.constraints)) - constraintOffset(problem),
    geography: rsum(byTable.map((t) => t.geography)),
  };
  return { score: rsum([terms.table, terms.pairs, terms.constraints, terms.geography]), terms, byTable };
}

/**
 * Constraint pairs a seating breaks, as seat-index pairs.
 * @param {Problem} problem @param {number[][]} tables
 */
export function violations(problem, tables) {
  const tableOf = tableOfSeats(tables, problem.nSeats);
  return {
    together: problem.together.filter(([a, b]) => tableOf[a] !== tableOf[b]),
    apart: problem.apart.filter(([a, b]) => tableOf[a] === tableOf[b]),
  };
}
