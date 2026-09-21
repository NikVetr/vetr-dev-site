// Which conversation boards a language pair can actually hold.
//
//   node scripts/build_board_index.mjs           write data/boards/index.json
//   node scripts/build_board_index.mjs --check   fail if it is stale
//
// **A board is not authored per pair, and this is what makes that true.** Every
// button on every board is an existing concept referenced by id, so whether a board
// works for (listener, owner) is a question about the corpus, not about the board:
// does each of those concepts have a row on both sides. Answering it here, once,
// turns "make Converse work for the other languages" from 2,756 pieces of authoring
// into a computation — the same O(N) trick the sheet uses, applied to boards.
//
// Two lists per board rather than a list of pairs, for the same reason the corpus is
// O(N) and not O(N²): 53 languages are 2,756 ordered pairs, and the pairs that work
// are exactly the product of the two lists. They are not the same list, because the
// two sides are asked different questions —
//
//   **listeners** must have the row *and* be in the concept's `applies_to` scope.
//   That is what `resolvePhrase` checks, and it is why the massage board is Mandarin
//   only: its reply concepts are scoped to `zh-Hans`.
//   **owners** need only the row, because the owner side is a gloss. A concept
//   scoped away from a language can still be glossed into it.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTable } from '../core/csv.js';
import { appliesTo } from '../core/pack.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (/** @type {string} */ rel) => parseTable(readFileSync(`${ROOT}/${rel}`, 'utf8'), rel);
const json = (/** @type {string} */ rel) => JSON.parse(readFileSync(`${ROOT}/${rel}`, 'utf8'));

/** @type {Record<string,Record<string,string>>} Every concept, by id. */
const concepts = {};
for (const file of readdirSync(`${ROOT}/data/concepts`).filter((f) => f.endsWith('.csv'))) {
  for (const row of read(`data/concepts/${file}`)) concepts[row.concept_id] = row;
}
const groups = readdirSync(`${ROOT}/data/concepts`)
  .filter((f) => f.endsWith('.csv')).map((f) => f.slice(0, -4));

/** Which concepts each ready language has a non-empty row for. */
function packs() {
  const ready = read('data/registry/languages.csv')
    .filter((r) => r.status === 'ready').map((r) => r.bcp47);
  /** @type {Record<string, Set<string>>} */ const have = {};
  for (const code of ready) {
    const held = new Set();
    for (const group of groups) {
      const rel = `data/lang/${code}/${group}.csv`;
      if (!existsSync(`${ROOT}/${rel}`)) continue;
      for (const row of read(rel)) if ((row.text ?? '').trim()) held.add(row.concept_id);
    }
    have[code] = held;
  }
  return have;
}

/** Every corpus concept a board asks for, across its nodes and its reply sets.
 * @param {any} board */
function needs(board) {
  /** @type {Set<string>} */ const ids = new Set();
  const sets = Object.values(board.replySets ?? {});
  for (const node of [...Object.values(board.nodes), ...sets]) {
    for (const button of node.buttons) {
      if (button.phraseRef?.kind === 'corpus') ids.add(button.phraseRef.id);
    }
  }
  return [...ids];
}

/**
 * How many of a board's phrases a language may be short and still be offered it.
 *
 * **One, and the reason is Yoruba and a sesame seed.** All-or-nothing cost Yoruba the
 * whole Eating-out board because `dietary-needs.no-sesame` has no Yoruba gloss — and
 * it has none because the sources disagree about which word means the seed rather
 * than the confection or the Igbo term, with no tone marks, on an allergen row. That
 * is a correct refusal to guess, and it should not also cost a reader eleven working
 * buttons.
 *
 * The app already draws an unresolvable button **in place and disabled**, and says
 * how many there are under the grid, because a grid that closes a gap is a grid whose
 * buttons have moved. So one dim button out of a dozen is a board someone can use and
 * has been told about. Two starts to read as broken, which is why this is not higher:
 * the threshold exists to absorb a single sourcing gap, not to ship a half-empty board.
 */
const SLACK = 1;

const have = packs();
const codes = Object.keys(have).sort();
const index = json('data/boards/index.json');

/** @type {{id:string, gaps:Record<string,number>}[]} */ const report = [];
for (const entry of index.boards) {
  const board = json(`data/boards/${entry.id}.json`);
  const ids = needs(board);
  const short = (/** @type {string} */ code, /** @type {(id:string)=>boolean} */ ok) => (
    ids.filter((id) => !ok(id)).length);
  entry.listeners = codes.filter((code) => short(
    code, (id) => have[code].has(id) && appliesTo(concepts[id], code)) <= SLACK);
  entry.owners = codes.filter((code) => short(code, (id) => have[code].has(id)) <= SLACK);
  delete entry.pairs;
  // What stands between this board and a language, so a gap is a work list rather
  // than a silence. Counted per language, since one missing concept is one row to
  // write and thirty is a translation project.
  /** @type {Record<string, number>} */ const gaps = {};
  for (const code of codes) {
    const missing = ids.filter((id) => !have[code].has(id)).length;
    if (missing) gaps[code] = missing;
  }
  report.push({ id: entry.id, gaps });
}

const next = `${JSON.stringify(index, null, 2)}\n`;
const current = readFileSync(`${ROOT}/data/boards/index.json`, 'utf8');

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('data/boards/index.json is stale -- run `npm run boards` and commit the result');
    process.exit(1);
  }
  console.log(`board index current  ${index.boards.length} boards, ${codes.length} languages`);
} else {
  writeFileSync(`${ROOT}/data/boards/index.json`, next);
  for (const entry of index.boards) {
    const pairs = entry.listeners.length * entry.owners.length - (
      entry.listeners.filter((/** @type {string} */ c) => entry.owners.includes(c)).length);
    console.log(`${entry.id.padEnd(11)} ${String(entry.listeners.length).padStart(3)} listeners `
      + `${String(entry.owners.length).padStart(3)} owners  ${String(pairs).padStart(5)} pairs`);
  }
  const worst = report.map((r) => `${r.id}: ${Object.keys(r.gaps).length} languages short`);
  console.log(`\n${worst.join('\n')}`);
}
