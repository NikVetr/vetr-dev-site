// Reproduce the page/landing example with the ordinary core, without a startup wait.
// Run from the repository root: node crossword/examples/build.mjs (about two minutes).
import { readFileSync, writeFileSync } from 'node:fs';
import { submit } from '../core/index.js';

const read = (/** @type {string} */ name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const request = {
  entriesText: read('weather.txt'),
  target: { mask: read('heart-notched.txt').trim().split('\n') },
  search: { seed: 1, nXwords: 1, nIter: 75 },
};
const result = submit(request, { onProgress: ({ iteration, score }) => {
  if (iteration % 10 === 0) console.log(`Iteration ${iteration}/${request.search.nIter}: ${score}`);
} });
writeFileSync(new URL('heart-example.json', import.meta.url), `${JSON.stringify({ request, result })}\n`);
console.log(`Saved ${result.crosswords[0].refined.entries.length} entries.`);
