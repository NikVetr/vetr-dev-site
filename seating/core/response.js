// Search result -> response (format_response in R/seat_tables.R): guest ids instead of seat
// indices, the best seating's tables and terms, broken constraints, and the trajectory.

import { scoreAssignment, violations } from './objective.js';
import { rsum } from './rmath.js';

/**
 * @typedef {import('./request.js').Problem} Problem
 * @typedef {ReturnType<typeof import('./search.js').runSearch>} SearchResult
 */

/** @param {Problem} problem @param {SearchResult} result */
export function formatResponse(problem, result) {
  const ids = problem.ids;
  const seatsOf = (/** @type {number[][]} */ tables) => tables.map((t) => t.map((s) => ids[s]));
  const idPairs = (/** @type {[number, number][]} */ pairs) => pairs.map(([a, b]) => [ids[a], ids[b]]);
  const { best } = result;
  const broken = violations(problem, result.bestTables);
  let trajectory = null;
  if (result.moves) {
    const initial = scoreAssignment(problem, problem.initial);
    trajectory = { record: /** @type {const} */ ('moves'), initial: { tables: seatsOf(problem.initial), score: initial.score, terms: initial.terms }, moves: result.moves };
  } else if (result.states) {
    trajectory = {
      record: /** @type {const} */ ('states'),
      every: problem.options.recordEvery,
      states: result.states.map((s) => ({ ...s, tables: seatsOf(s.tables) })),
    };
  }
  return {
    score: best.score,
    terms: best.terms,
    tables: result.bestTables.map((seats, t) => {
      const { table, pairs, geography } = best.byTable[t];
      return {
        id: problem.tableIds[t],
        capacity: problem.capacity[t],
        x: problem.xy[t][0],
        y: problem.xy[t][1],
        seats: seats.map((s) => ids[s]),
        score: rsum([table, pairs, geography]),
        terms: { table, pairs, geography },
      };
    }),
    violations: { together: idPairs(broken.together), apart: idPairs(broken.apart) },
    search: { iterations: problem.options.iterations, accepted: result.accepted, bestIteration: result.bestIteration },
    settings: { ...problem.options, geography: { enabled: problem.C !== null, tablemates: problem.tablemates } },
    trace: result.trace,
    trajectory,
  };
}
