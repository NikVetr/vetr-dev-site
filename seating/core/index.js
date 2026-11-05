// The tool's single entry point, seat_tables() in the R version. The page (through its
// worker), window.Seating and cli.mjs all call submit(); nothing here touches the DOM.

import { buildProblem } from './request.js';
import { formatResponse } from './response.js';
import { runSearch } from './search.js';

export { SeatingError, defaultOptions, fromRRequest } from './request.js';
export { TABLE_OBJECTIVES } from './objective.js';
export { renderSeatingSvg, renderTraceSvg } from './chart.js';

/**
 * @typedef {import('./search.js').Progress} Progress
 * @typedef {import('./search.js').Move} Move
 * @typedef {ReturnType<typeof formatResponse>} Result
 */

/**
 * Validates a request, runs the search and returns the best seating found. The same request
 * (seed included) gives the same result, and the same chain as the R version.
 * @param {unknown} request see api.md
 * @param {{ onProgress?: (progress: Progress) => void }} [hooks] called after every accepted
 *   move (progress.move is then that move, as in trajectory.moves) and every 1% of the iterations
 * @returns {Result}
 */
export function submit(request, hooks = {}) {
  const problem = buildProblem(request);
  return formatResponse(problem, runSearch(problem, hooks));
}
