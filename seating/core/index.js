// Shared public entry points. submit retains the R static contract; runRequest dispatches
// explicit event-round requests to planRounds. Nothing here touches the DOM.

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

import {planRounds} from './rounds.js';
import {buildRoundProblem} from './rounds-request.js';
export {planRounds};
export {renderRoundSvg,roundCategoryColours} from './rounds-chart.js';
/** @param {unknown} request */
export function validateRequest(request) {
  return request && typeof request === 'object' && 'mode' in request && request.mode === 'rounds' ? buildRoundProblem(request) : buildProblem(request);
}
/** @param {unknown} request @param {{onProgress?:(progress:Progress)=>void}} [hooks] */
export function runRequest(request,hooks={}) {
  return request && typeof request === 'object' && 'mode' in request && request.mode === 'rounds' ? planRounds(request,hooks) : submit(request,hooks);
}
/** @param {Result | import('./rounds.js').RoundPlan} result @returns {result is import('./rounds.js').RoundPlan} */
export const isRoundPlan=result=>'mode' in result && result.mode==='rounds';
