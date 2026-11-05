// Search: greedy generation, swap proposals and the MCMC refinement. Ported from
// R/search.R of the R generator, with the same moves and acceptance rule; only the
// random-number generator differs.

import { cloneState, emptyState, findNExtra, placeWord, removableWords } from './grid.js';
import { randomIndex, weightedIndex } from './rng.js';
import { scoreTerms, totalScore } from './score.js';

/**
 * @typedef {import('./grid.js').State} State
 * @typedef {import('./grid.js').Cell} Cell
 * @typedef {import('./grid.js').Word} Word
 * @typedef {import('./score.js').Objective} Objective
 */

/** Placement attempts when a swap proposal re-places its removed words (R's default). */
export const SWAP_MAX_ATTEMPTS = 20;

/** Side of the square canvas a crossword is generated on. @param {Word[]} words */
export function canvasSize(words) {
  const total = words.reduce((sum, w) => sum + w.cells.length, 0);
  return Math.ceil(Math.max(Math.sqrt(total * 10), ...words.map((w) => w.cells.length)));
}

/** @param {State} state @param {Objective} objective */
export function stateScore(state, objective) {
  return totalScore(scoreTerms(state, objective));
}

/**
 * Places a random word across the middle of an empty canvas (`init_xword`).
 * @param {State} state @param {Word[]} words @param {boolean[]} used @param {() => number} rng
 */
function initXword(state, words, used, rng) {
  const unused = used.flatMap((u, w) => (u ? [] : [w]));
  const w = unused[randomIndex(rng, unused.length)];
  const n = words[w].cells.length;
  // 1-based as in R, then shifted left if the word would run off the canvas; never left
  // of the first column (R fails there, for a word nearly as long as the canvas)
  let start = Math.floor(state.cols / 2) - Math.floor(n / 2);
  start -= Math.max(0, start + n - 1 - state.cols);
  start = Math.max(start, 1);
  const row = Math.floor(state.rows / 2) - 1;
  placeWord(state, w, words[w], Array.from({ length: n }, (_, k) => /** @type {Cell} */ ([row, start - 1 + k])));
  used[w] = true;
}

/**
 * The cells a word would occupy with its letter k on cell (r, c), and how many of
 * them already hold the same letter; -1 if it would leave the canvas or contradict a
 * letter (`check_compatibility_horiz` and `_vert`).
 * @param {State} state @param {string[]} chars @param {number} r @param {number} c @param {number} k @param {boolean} across
 */
function compatibility(state, chars, r, c, k, across) {
  const r0 = across ? r : r - k;
  const c0 = across ? c - k : c;
  if (r0 < 0 || c0 < 0 || (across ? c0 + chars.length > state.cols : r0 + chars.length > state.rows)) return -1;
  let same = 0;
  for (let i = 0; i < chars.length; i++) {
    const v = state.cells[(across ? r0 : r0 + i) * state.cols + (across ? c0 + i : c0)];
    if (v === chars[i]) same++;
    else if (v !== '') return -1;
  }
  return same;
}

/**
 * Tries to add one random unplaced word through a matching letter (`add_xword`).
 * Every placement through a matching letter that creates no stray words is scored,
 * and one is drawn with probability proportional to exp(-score). A cell that allows
 * both directions is tried across only, as in R.
 * @param {State} state changed in place on success
 * @param {Word[]} words @param {boolean[]} used @param {Objective} objective @param {() => number} rng
 * @returns {boolean} whether a word was placed
 */
function addXword(state, words, used, objective, rng) {
  const unused = used.flatMap((u, w) => (u ? [] : [w]));
  const w = unused.length === 1 ? unused[0] : unused[randomIndex(rng, unused.length)];
  const chars = words[w].cells;

  /** @type {{ cells: Cell[], score: number }[]} */
  const candidates = [];
  for (let k = 0; k < chars.length; k++) {
    for (let c = 0; c < state.cols; c++) {
      for (let r = 0; r < state.rows; r++) {
        if (state.cells[r * state.cols + c] !== chars[k]) continue;
        const across = compatibility(state, chars, r, c, k, true) !== -1;
        if (!across && compatibility(state, chars, r, c, k, false) === -1) continue;
        const cells = chars.map((_, i) => /** @type {Cell} */ (across ? [r, c - k + i] : [r - k + i, c]));
        const trial = cloneState(state);
        placeWord(trial, w, words[w], cells);
        if (findNExtra(trial, words).reduce((a, b) => a + b, 0) !== 0) continue;
        candidates.push({ cells, score: stateScore(trial, objective) });
      }
    }
  }
  if (!candidates.length) return false;

  const best = Math.min(...candidates.map((x) => x.score));
  const chosen = candidates[weightedIndex(rng, candidates.map((x) => Math.exp(-(x.score - best))))];
  placeWord(state, w, words[w], chosen.cells);
  used[w] = true;
  return true;
}

/**
 * Adds words until all are placed or `maxAttempts` additions have failed in total
 * (`finish_xword`).
 * @param {State} state @param {Word[]} words @param {boolean[]} used @param {number} maxAttempts @param {Objective} objective @param {() => number} rng
 * @returns {boolean} false if it ran out of attempts
 */
function finishXword(state, words, used, maxAttempts, objective, rng) {
  let attempt = 1;
  while (attempt <= maxAttempts && used.includes(false)) {
    if (!addXword(state, words, used, objective, rng)) attempt++;
  }
  return attempt <= maxAttempts;
}

/**
 * A greedy initial layout (`generate_xword`), or null if no attempt placed every word.
 * @param {Word[]} words @param {number} maxAttemptsWord @param {number} maxAttemptsXword @param {Objective} objective @param {() => number} rng
 * @returns {State | null}
 */
export function generateXword(words, maxAttemptsWord, maxAttemptsXword, objective, rng) {
  const size = canvasSize(words);
  for (let attempt = 1; attempt <= maxAttemptsXword; attempt++) {
    const state = emptyState(size, words.length);
    const used = new Array(words.length).fill(false);
    initXword(state, words, used, rng);
    finishXword(state, words, used, maxAttemptsWord, objective, rng);
    if (!used.includes(false)) return state;
  }
  return null;
}

/**
 * A proposal (`swap_word`): removes 1 to n words, one at a time and never an
 * articulation word, with small numbers most likely (weight exp((n - m + 1) / 5) for
 * m words), then re-places them greedily. Returns the current state unchanged if
 * re-placing fails.
 * @param {State} state @param {Word[]} words @param {Objective} objective @param {() => number} rng
 * @returns {State}
 */
export function swapWord(state, words, objective, rng) {
  const n = words.length;
  const nRemove = n - weightedIndex(rng, Array.from({ length: n }, (_, i) => Math.exp((i + 1) / 5)));
  const prop = cloneState(state);
  const used = new Array(n).fill(true);
  for (let i = 0; i < nRemove; i++) {
    if (prop.locs.filter((word) => word !== null).length <= 1) break;
    const candidates = removableWords(prop.locs);
    const w = candidates[randomIndex(rng, candidates.length)];
    /** @type {Set<number>} */
    const kept = new Set();
    prop.locs.forEach((word, v) => {
      if (word && v !== w) for (const [r, c] of word) kept.add(r * prop.cols + c);
    });
    for (const [r, c] of /** @type {Cell[]} */ (prop.locs[w])) {
      if (!kept.has(r * prop.cols + c)) prop.cells[r * prop.cols + c] = '';
    }
    prop.locs[w] = null;
    used[w] = false;
  }
  return finishXword(prop, words, used, SWAP_MAX_ATTEMPTS, objective, rng) ? prop : state;
}

/**
 * MCMC refinement (`run_MCMC`): each iteration proposes a swap and accepts it with
 * probability plogis(current - proposed), so lower penalties are favoured.
 * @param {State} state @param {Word[]} words @param {number} nIter @param {Objective} objective @param {() => number} rng
 * @param {(iteration: number, state: State, score: number, accepted: boolean) => void} [onIteration]
 * @returns {State}
 */
export function runMCMC(state, words, nIter, objective, rng, onIteration) {
  let current = state;
  let currentScore = stateScore(current, objective);
  for (let i = 1; i <= nIter; i++) {
    const prop = swapWord(current, words, objective, rng);
    const propScore = stateScore(prop, objective);
    const accepted = rng() < 1 / (1 + Math.exp(propScore - currentScore));
    if (accepted) {
      current = prop;
      currentScore = propScore;
    }
    onIteration?.(i, current, currentScore, accepted);
  }
  return current;
}

/**
 * The words likely hardest to cross, hardest first (from `generate_xword`'s failure
 * message): each word's letter overlap with every other word, Σ_j overlap_ij /
 * (len_i len_j), where overlap_ij sums count_i(x) count_j(x) over shared letters x.
 * @param {Word[]} words
 * @returns {number[]} word indices, ascending overlap
 */
export function hardestWords(words) {
  const counts = words.map((w) => {
    /** @type {Map<string, number>} */
    const m = new Map();
    for (const ch of w.cells) m.set(ch, (m.get(ch) ?? 0) + 1);
    return m;
  });
  const overlap = words.map((wi, i) => {
    let sum = 0;
    words.forEach((wj, j) => {
      if (i === j) return;
      let shared = 0;
      for (const [ch, n] of counts[i]) shared += n * (counts[j].get(ch) ?? 0);
      sum += shared / (wi.cells.length * wj.cells.length);
    });
    return sum;
  });
  return words.map((_, i) => i).sort((a, b) => overlap[a] - overlap[b]);
}
