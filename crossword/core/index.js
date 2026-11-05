// The tool's single entry point. The page (through its worker), window.Crossword and
// cli.mjs all call submit(); nothing here touches the DOM.

import { cloneState, numberWords, trimState } from './grid.js';
import { CrosswordError, normalizeRequest } from './input.js';
import { createRng } from './rng.js';
import { scoreTerms, totalScore } from './score.js';
import { generateXword, hardestWords, runMCMC } from './search.js';

export { CrosswordError, DEFAULTS, formatEntries, gridWord, issueLocation, parseEntries } from './input.js';
export { maskFromRgba, TERMS } from './score.js';
export { renderPuzzleSvg, renderSvg } from './render.js';

/**
 * @typedef {import('./input.js').Entry} Entry
 * @typedef {import('./grid.js').State} State
 * @typedef {import('./score.js').Objective} Objective
 * @typedef {{ crossword: number, iteration: number, nIter: number, score: number, grid: string[][] }} Progress
 */

/**
 * Validates a request, generates `search.nXwords` crosswords (or takes `init`) and
 * refines each with `search.nIter` MCMC iterations. Same request (seed included),
 * same result.
 * @param {unknown} request see api.md
 * @param {{ onProgress?: (progress: Progress) => void }} [options] onProgress is
 *   called once a crossword is laid out (iteration 0) and after every iteration
 */
export function submit(request, { onProgress } = {}) {
  const { entries, objective, search, target, init } = normalizeRequest(request);
  const rng = createRng(search.seed);
  const crosswords = [];
  for (let i = 0; i < search.nXwords; i++) {
    const orig = init ? cloneState(init) : generateXword(entries, search.maxAttemptsWord, search.maxAttemptsXword, objective, rng);
    if (!orig) throw unplaceable(entries, search.maxAttemptsXword);
    /** @param {number} iteration @param {State} state @param {number} score */
    const report = (iteration, state, score) => onProgress?.({ crossword: i, iteration, nIter: search.nIter, score, grid: gridRows(trimState(state)) });
    if (onProgress) report(0, orig, totalScore(scoreTerms(orig, objective)));
    const refined = runMCMC(orig, entries, search.nIter, objective, rng, onProgress && report);
    crosswords.push({ orig: describe(orig, entries, objective), refined: describe(refined, entries, objective) });
  }
  const { picture, ...objectiveSettings } = objective;
  return { settings: { objective: objectiveSettings, search, target }, crosswords };
}

/**
 * A layout as the result reports it: the trimmed grid, the entries numbered in
 * reading order (across, then down), and the weighted penalty terms and their sum.
 * @param {State} state @param {Entry[]} entries @param {Objective} objective
 */
function describe(state, entries, objective) {
  const trimmed = trimState(state);
  const numbered = numberWords(trimmed.locs);
  const terms = scoreTerms(state, objective);
  return {
    rows: trimmed.rows,
    cols: trimmed.cols,
    grid: gridRows(trimmed),
    entries: [...numbered.filter((n) => n.dir === 'across'), ...numbered.filter((n) => n.dir === 'down')].map((n) => ({
      number: n.number, dir: n.dir, row: n.row, col: n.col,
      length: entries[n.word].cells.length, answer: entries[n.word].answer, clue: entries[n.word].clue,
    })),
    terms,
    score: totalScore(terms),
  };
}

/** @param {State} state */
function gridRows({ rows, cols, cells }) {
  return Array.from({ length: rows }, (_, r) => cells.slice(r * cols, (r + 1) * cols));
}

/** @param {Entry[]} entries @param {number} attempts */
function unplaceable(entries, attempts) {
  const hardest = hardestWords(entries).slice(0, 3);
  const names = hardest.map((w) => `"${entries[w].answer}"`).join(', ');
  return new CrosswordError(
    'unplaceable',
    `Could not place every word in ${attempts} attempt${attempts === 1 ? '' : 's'}; raise search.maxAttemptsXword or change the words. The hardest to cross are likely ${names}.`,
    hardest.map((w) => ({ code: 'hard_to_cross', path: `entries[${w}].answer`, message: `"${entries[w].answer}" shares few letters with the other answers` })),
  );
}
