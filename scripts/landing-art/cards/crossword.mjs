// Crossword Generator: the page's default example (the weather answers, pushed towards the
// heart picture; three crosswords, seed 1), crossword 1 after refinement, as the filled grid.
// The loop clears the answers word by word in clue order and fills them back in the same
// order, ending filled as it began: every letter runs one shared fade, delayed to the moment
// its first word comes up.
import { readFileSync } from 'node:fs';
import { submit } from '../../../crossword/core/index.js';
import { WIDE, art, esc, num } from '../svg.mjs';

const { width: W, height: H } = WIDE;   // a 2x3 tile

const PERIOD = 7;
const START = 0.5;   // seconds filled before the first word clears
const SWEEP = 2.4;   // seconds to clear (and later to fill) every word
const FADE = 0.15;

export function build() {
  const read = (/** @type {string} */ f) => readFileSync(new URL(`../../../crossword/examples/${f}`, import.meta.url), 'utf8');
  const result = submit({
    entriesText: read('weather.txt'),
    target: { mask: read('heart.txt').trim().split('\n') },
    search: { seed: 1, nXwords: 3, nIter: 50 },
  });
  const xw = result.crosswords[0].refined;
  const cell = Math.min((W - 16) / xw.cols, (H - 12) / xw.rows);
  const x0 = (W - cell * xw.cols) / 2;
  const y0 = (H - cell * xw.rows) / 2;

  // When each cell's letter first comes up, words taken in clue order (across before down).
  const order = [...xw.entries].sort((a, b) => a.number - b.number || (a.dir === 'across' ? -1 : 1));
  const first = new Map();
  for (const [i, e] of order.entries()) {
    for (let j = 0; j < e.length; j++) {
      const [r, c] = e.dir === 'across' ? [e.row, e.col + j] : [e.row + j, e.col];
      if (!first.has(`${r},${c}`)) first.set(`${r},${c}`, START + (i * SWEEP) / order.length);
    }
  }

  let cells = '';
  let letters = '';
  for (let r = 0; r < xw.rows; r++) {
    for (let c = 0; c < xw.cols; c++) {
      const letter = xw.grid[r][c];
      if (!letter) continue;
      const [x, y] = [x0 + c * cell, y0 + r * cell];
      cells += `M${num(x)} ${num(y)}h${num(cell)}v${num(cell)}h${num(-cell)}Z`;
      letters += `<text x="${num(x + cell / 2)}" y="${num(y + cell / 2)}" style="animation-delay:${num(first.get(`${r},${c}`), 3)}s">${esc(letter)}</text>`;
    }
  }
  // The shared fade: out at once, back in half a period later. Every delay is under
  // PERIOD / 2 - FADE, so the letters are all shown again before any comes up a second time.
  const latest = Math.max(...first.values());
  if (latest > PERIOD / 2 - FADE) throw new Error('crossword: the sweep is too long for the period');
  const p = (/** @type {number} */ t) => num((100 * t) / PERIOD, 3);
  return art({
    name: 'crossword',
    period: PERIOD,
    width: W,
    height: H,
    body: `<path class="cells" d="${cells}"/>\n<g class="letters">${letters}</g>`,
    css: `& .cells { fill: var(--surface); stroke: var(--art-ink); stroke-width: 0.8; stroke-linejoin: round; }
& .letters text { will-change: opacity; }
& .letters { fill: var(--art-ink); font: 500 ${num(cell * 0.62)}px ui-sans-serif, system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }`,
    loop: `& .letters text { animation: crossword-fill ${PERIOD}s linear infinite; }
@keyframes crossword-fill { 0% { opacity: 1; } ${p(FADE)}% { opacity: 0; } 50% { opacity: 0; } ${p(PERIOD / 2 + FADE)}% { opacity: 1; } 100% { opacity: 1; } }`,
  });
}
