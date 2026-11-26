// Records the landing preview's suit sequence with the ordinary core: starting from the
// saved heart (heart-example.json), the target morphs to a diamond, a spade, a club and
// back to the heart. During each morph the grid stays put and its penalty is scored
// against the changing target; then the crossword is refined from that grid against the
// new suit (the request's `init`, as the page's Refine does) and every iteration is kept.
// Run from the repository root: node crossword/examples/build-suits.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { submit } from '../core/index.js';
import { fieldMask, morphField } from './suits.mjs';

/** Morph samples per transition, the last being the new suit itself. */
export const MORPH_STEPS = 24;

/** @typedef {import('./suits.mjs').Suit} Suit */
/** @typedef {ReturnType<typeof submit>['crosswords'][number]['refined']} Crossword */
/** @typedef {{ iteration: number, score: number, accepted: boolean | null, grid?: string[] }} Frame */
/** @typedef {{ from: Suit, to: Suit, seed: number, nIter: number, morph: { t: number, score: number }[], frames: Frame[], result: Crossword }} Segment */

/** Grid rows as strings, "." for an empty cell. @param {string[][]} grid */
export const packGrid = (grid) => grid.map((row) => row.map((ch) => ch || '.').join(''));

/**
 * One transition: the penalty of `start` while the target morphs from `from` to `to`,
 * then `nIter` refinement iterations from `start` against `to`, each recorded. A frame
 * keeps its grid only when the iteration was accepted; a rejected one leaves it as it was.
 * @param {string} entriesText @param {Crossword} start @param {Suit} from @param {Suit} to @param {number} seed @param {number} nIter
 * @returns {Segment}
 */
export function runSegment(entriesText, start, from, to, seed, nIter) {
  const morph = Array.from({ length: MORPH_STEPS }, (_, i) => {
    const t = (i + 1) / MORPH_STEPS;
    const mask = fieldMask(morphField(from, to, t));
    return { t, score: submit({ entriesText, target: { mask }, init: start, search: { nIter: 0 } }).crosswords[0].orig.score };
  });
  /** @type {Frame[]} */
  const frames = [];
  const result = submit({ entriesText, target: { mask: fieldMask(morphField(to, to, 0)) }, init: start, search: { seed, nIter } }, {
    onProgress: ({ iteration, score, accepted, grid }) => {
      frames.push(accepted === false ? { iteration, score, accepted } : { iteration, score, accepted, grid: packGrid(grid) });
    },
  }).crosswords[0].refined;
  return { from, to, seed, nIter, morph, frames, result };
}

/** The recorded transitions. Each seed was picked from a few candidates, as PROVENANCE says. */
export const SEGMENTS = /** @type {const} */ ([
  { from: 'heart', to: 'diamond', seed: 1, nIter: 60 },
  { from: 'diamond', to: 'spade', seed: 2, nIter: 60 },
  { from: 'spade', to: 'club', seed: 3, nIter: 60 },
  { from: 'club', to: 'heart', seed: 2, nIter: 60 },
]);
export const PROVENANCE = 'Seeds chosen on 2026-11-25: for diamond, spade and club, the lowest final penalty among seeds 1-3 (each started from the previously chosen grid); for the return to the heart, among seeds 1-4, the final heart sharing the most entries with the saved heart (43 of 94), which also had the lowest final penalty.';

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const { request, result } = JSON.parse(readFileSync(new URL('heart-example.json', import.meta.url), 'utf8'));
  let start = result.crosswords[0].refined;
  /** @type {Segment[]} */
  const segments = [];
  for (const { from, to, seed, nIter } of SEGMENTS) {
    const t0 = Date.now();
    const segment = runSegment(request.entriesText, start, from, to, seed, nIter);
    console.log(`${from} → ${to}: ${Math.round(segment.morph.at(-1)?.score ?? NaN)} → ${Math.round(segment.result.score)} in ${Math.round((Date.now() - t0) / 1000)} s`);
    segments.push(segment);
    start = segment.result;
  }
  writeFileSync(new URL('suits-history.json', import.meta.url), `${JSON.stringify({ source: 'heart-example.json', provenance: PROVENANCE, morphSteps: MORPH_STEPS, segments })}\n`);
}
