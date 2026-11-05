import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CrosswordError, gridWord, parseEntries, renderPuzzleSvg, renderSvg, submit, TERMS } from '../core/index.js';
import { adjacency, articulationPoints, findNExtra, findWords, fillAdjElements, numberWords, removableWords, trimState } from '../core/grid.js';
import { mulberry32 } from '../../shared/rng.js';
import { countInducedCycles, nearestDistances, preparePicture, scoreTerms } from '../core/score.js';
import { generateXword, swapWord } from '../core/search.js';
import { concaveman } from '../vendor/concaveman.js';

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url));
const weatherText = readFileSync(here('../examples/weather.txt'), 'utf8');
const heartRows = readFileSync(here('../examples/heart.txt'), 'utf8').trim().split('\n');
const fixture = JSON.parse(readFileSync(here('fixtures/r-parity.json'), 'utf8'));

/** @param {string[]} rows */
const maskOf = (rows) => ({ width: rows[0].length, height: rows.length, data: Uint8Array.from(rows.join(''), (ch) => (ch === '#' ? 1 : 0)) });

/** @typedef {import('../core/grid.js').State} State */
/** @typedef {import('../core/grid.js').Cell} Cell */

/** A state from words and 1-based R word locations. @param {{ words: string[], rows: number, cols: number, locs: (number[][] | null)[] | Record<string, number[][]> }} s */
function stateOf(s) {
  const words = s.words.map(gridWord);
  const rLocs = /** @type {any} */ (s.locs);
  const locs = s.words.map((name, w) => {
    /** @type {number[][] | null} */
    const l = Array.isArray(rLocs) ? rLocs[w] : rLocs[name];
    return l ? l.map(([r, c]) => /** @type {Cell} */ ([r - 1, c - 1])) : null;
  });
  const cells = new Array(s.rows * s.cols).fill('');
  locs.forEach((l, w) => l?.forEach(([r, c], k) => { cells[r * s.cols + c] = words[w].cells[k]; }));
  return { state: /** @type {State} */ ({ rows: s.rows, cols: s.cols, cells, locs }), words };
}

/** Throws and returns the CrosswordError. @param {unknown} request @param {string} [code] */
function rejection(request, code = 'invalid_request') {
  try {
    submit(request);
  } catch (error) {
    assert.ok(error instanceof CrosswordError);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail('request was accepted');
}

// ---------- parity with the R generator (tests/fixtures/r-parity.json, from tmp/scripts/export_r_parity.R) ----------

const R_TERMS = /** @type {Record<string, import('../core/score.js').Term>} */ ({
  area: 'area', area_ratio: 'areaRatio', hv_ratio: 'hvRatio', n_connections: 'nConnections', n_cycles: 'nCycles', pic_similarity: 'picSimilarity', circularity: 'circularity',
});
const objectives = Object.fromEntries(Object.entries(fixture.objectives).map(([name, /** @type {any} */ spec]) => {
  const weights = /** @type {import('../core/score.js').Terms} */ (Object.fromEntries(TERMS.map((t) => [t, 1])));
  for (const [k, v] of Object.entries(spec.weights ?? {})) weights[R_TERMS[k]] = /** @type {number} */ (v);
  const picture = spec.mask ? preparePicture(maskOf(fixture.masks[spec.mask])) : null;
  return [name, { weights, desiredAreaRatio: spec.desiredAreaRatio ?? 1, desiredHvRatio: spec.desiredHvRatio ?? 1, picture, pictureDistance: /** @type {const} */ ('scan') }];
}));

test('the R parity fixture covers every term, cycles, partial layouts and a Cyrillic list', () => {
  assert.deepEqual(fixture.masks.heart, heartRows, 'the fixture was made with examples/heart.txt');
  const states = /** @type {any[]} */ (fixture.states);
  assert.ok(states.some((s) => s.terms.plain.n_cycles < 0));
  assert.ok(states.some((s) => s.words.some((/** @type {string} */ w) => w.includes('-') && /[а-я]/.test(w))));
  assert.ok(states.some((s) => Object.values(s.locs).some((l) => l === null)));
  assert.ok(Object.keys(fixture.objectives).length === 3);
});

for (const s of fixture.states) {
  test(`scores match R: ${s.label}`, () => {
    const { state, words } = stateOf(s);
    for (const [name, rTerms] of Object.entries(s.terms)) {
      const js = scoreTerms(state, objectives[name]);
      for (const [rName, rv] of Object.entries(/** @type {Record<string, number>} */ (rTerms))) {
        const jv = js[R_TERMS[rName]];
        // R's values went through JSON at 15 significant digits
        assert.ok(Math.abs(jv - rv) <= 1e-12 * Math.max(1, Math.abs(rv)), `${name} ${rName}: R ${rv}, JS ${jv}`);
      }
    }
    assert.equal(findNExtra(state, words).reduce((a, b) => a + b, 0), s.n_extra);
    assert.deepEqual(removableWords(state.locs).map((w) => w + 1), [].concat(s.removable));
    const trimmed = trimState(state);
    const numbers = Object.fromEntries(numberWords(trimmed.locs).map((n) => [s.words[n.word], n.number]));
    for (const [word, number] of Object.entries(s.numbers)) assert.equal(numbers[word], number, word);
    assert.deepEqual(fillAdjElements(trimmed).map(([r, c]) => [r + 1, c + 1]), s.silhouette);
  });
}

test('cycle counts and articulation points match igraph on random graphs', () => {
  for (const g of fixture.graphs) {
    /** @type {number[][]} */
    const neighbours = Array.from({ length: g.n }, () => []);
    for (const [a, b] of g.edges) {
      neighbours[a].push(b);
      neighbours[b].push(a);
    }
    const nodes = [...neighbours.keys()];
    assert.equal(countInducedCycles(nodes, neighbours, 4), g.c4);
    assert.equal(countInducedCycles(nodes, neighbours, 6), g.c6);
    assert.deepEqual([...articulationPoints(nodes, neighbours)].sort((a, b) => a - b), [].concat(g.articulation));
  }
});

test('concave hulls match the R package concaveman, vertex for vertex', () => {
  for (const h of fixture.hulls) assert.deepEqual(concaveman(h.points, 1), h.hull);
});

test('nearest-distance scan matches R, including its overestimate', () => {
  for (const s of fixture.scans) assert.deepEqual(nearestDistances(s.A, s.B, s.max, 'scan'), s.d);
  // from R's tests: nothing within radius 1; within radius 2, (-2,0) is scanned before (1,1)
  assert.deepEqual(nearestDistances([[0, 0]], [[1, 1], [-2, 0]], 10, 'scan'), [2]);
  assert.deepEqual(nearestDistances([[0, 0]], [[1, 1], [-2, 0]], 10, 'exact'), [Math.SQRT2]);
  assert.deepEqual(nearestDistances([[0, 0]], [[2, 0], [0, 1]], 10, 'scan'), [1]);
});

// ---------- grid building blocks ----------

/** @param {number} n @param {number[][]} edges */
function graph(n, edges) {
  /** @type {number[][]} */
  const neighbours = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  return { nodes: [...neighbours.keys()], neighbours };
}

test('articulation points', () => {
  const path = graph(4, [[0, 1], [1, 2], [2, 3]]);
  assert.deepEqual([...articulationPoints(path.nodes, path.neighbours)].sort(), [1, 2]);
  const bowtie = graph(5, [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 2]]);
  assert.deepEqual([...articulationPoints(bowtie.nodes, bowtie.neighbours)], [2]);
  const ring = graph(5, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]]);
  assert.equal(articulationPoints(ring.nodes, ring.neighbours).size, 0);
});

test('cycle counts are of induced 4- and 6-cycles', () => {
  const c4 = graph(4, [[0, 1], [1, 2], [2, 3], [3, 0]]);
  assert.equal(countInducedCycles(c4.nodes, c4.neighbours, 4), 1);
  const k4 = graph(4, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]]);
  assert.equal(countInducedCycles(k4.nodes, k4.neighbours, 4), 0);
  const c6 = graph(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
  assert.equal(countInducedCycles(c6.nodes, c6.neighbours, 6), 1);
  assert.equal(countInducedCycles(c6.nodes, c6.neighbours, 4), 0);
  // a long chord splits the 6-cycle into two 4-cycles
  const chorded = graph(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3]]);
  assert.equal(countInducedCycles(chorded.nodes, chorded.neighbours, 6), 0);
  assert.equal(countInducedCycles(chorded.nodes, chorded.neighbours, 4), 2);
});

/** A canvas holding the given words at 0-based [row, col, dir]. @param {number} size @param {[string, number, number, 'across' | 'down'][]} placed */
function layout(size, placed) {
  const words = placed.map(([text]) => gridWord(text));
  const cells = new Array(size * size).fill('');
  const locs = placed.map(([, r, c, dir], w) => words[w].cells.map((ch, k) => {
    const cell = /** @type {Cell} */ (dir === 'across' ? [r, c + k] : [r + k, c]);
    cells[cell[0] * size + cell[1]] = ch;
    return cell;
  }));
  return { state: /** @type {State} */ ({ rows: size, cols: size, cells, locs }), words };
}

test('clues are numbered in reading order', () => {
  // R's test: across "cab" and down "cot" from (0,2); down "by" from (0,4); across "ate" from (2,1).
  // Numbering by distance from the corner would put "ate" before "by".
  const { state } = layout(5, [['cab', 0, 2, 'across'], ['cot', 0, 2, 'down'], ['ate', 2, 1, 'across'], ['by', 0, 4, 'down']]);
  const numbers = numberWords(state.locs);
  assert.deepEqual(numbers.map((n) => [n.word, n.number, n.dir]), [[0, 1, 'across'], [1, 1, 'down'], [3, 2, 'down'], [2, 3, 'across']]);
});

test('the stray-word check flags runs that are not words', () => {
  const { state, words } = layout(6, [['cats', 0, 0, 'across'], ['cot', 0, 0, 'down']]);
  assert.deepEqual(findNExtra(state, words), [0, 0]);
  // "tops" right under "cats" makes the two-letter down runs "ct", "ao", "tp" and "ss"
  const stacked = layout(6, [['cats', 0, 1, 'across'], ['tops', 1, 1, 'across']]);
  assert.deepEqual(findNExtra(stacked.state, stacked.words), [0, 2, 2, 2, 2]);
  assert.deepEqual(findWords(stacked.state).map((f) => f.text), ['cats', 'tops', 'ct', 'ao', 'tp', 'ss']);
  // a run that extends a word ("cats" + "s") counts its extra letter
  const longer = layout(6, [['cats', 0, 0, 'across'], ['so', 0, 4, 'down']]);
  longer.state.cells[4] = 's';
  assert.ok(findNExtra(longer.state, longer.words).reduce((a, b) => a + b, 0) > 0);
});

test('swap proposals leave a consistent, connected crossword', () => {
  const entries = parseEntries(weatherText).map((e) => gridWord(e.answer));
  const objective = { weights: Object.fromEntries(TERMS.map((t) => [t, 1])), desiredAreaRatio: 1, desiredHvRatio: 1, picture: null, pictureDistance: /** @type {const} */ ('scan') };
  const rng = mulberry32(3);
  let state = /** @type {State} */ (generateXword(entries, 20, 5, /** @type {any} */ (objective), rng));
  for (let i = 0; i < 25; i++) {
    state = swapWord(state, entries, /** @type {any} */ (objective), rng);
    assert.ok(state.locs.every((l) => l !== null));
    state.locs.forEach((l, w) => /** @type {Cell[]} */ (l).forEach(([r, c], k) => assert.equal(state.cells[r * state.cols + c], entries[w].cells[k])));
    const covered = new Set(state.locs.flatMap((l) => /** @type {Cell[]} */ (l).map(([r, c]) => r * state.cols + c)));
    assert.equal(state.cells.filter((v) => v !== '').length, covered.size, 'no orphan letters');
    assert.deepEqual(findWords(state).map((f) => f.text).sort(), entries.map((e) => e.text).sort());
    const neighbours = adjacency(state.locs);
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) for (const v of neighbours[/** @type {number} */ (queue.pop())]) if (!seen.has(v)) { seen.add(v); queue.push(v); }
    assert.equal(seen.size, entries.length, 'connected');
  }
});

// ---------- submit ----------

test('the example lays out every word, and the same seed gives the same result', () => {
  const request = { entriesText: weatherText, target: { mask: heartRows }, search: { nIter: 10, nXwords: 2, seed: 4 } };
  /** @type {number[]} */
  const iterations = [];
  const result = submit(request, { onProgress: (p) => iterations.push(p.iteration) });
  assert.deepEqual(iterations, [...Array(11).keys(), ...Array(11).keys()]);
  assert.deepEqual(result, submit(request));
  assert.notDeepEqual(result.crosswords, submit({ ...request, search: { ...request.search, seed: 5 } }).crosswords);
  assert.deepEqual(result.settings.target, { width: 64, height: 64, cells: heartRows.join('').split('#').length - 1 });
  for (const { orig, refined } of result.crosswords) {
    for (const cw of [orig, refined]) {
      assert.equal(cw.entries.length, 20);
      assert.equal(cw.grid.length, cw.rows);
      for (const e of cw.entries) {
        const cells = Array.from({ length: e.length }, (_, k) => (e.dir === 'across' ? cw.grid[e.row][e.col + k] : cw.grid[e.row + k][e.col]));
        assert.equal(cells.join(''), gridWord(e.answer).text, e.answer);
      }
      const total = TERMS.reduce((sum, t) => sum + cw.terms[t], 0);
      assert.equal(cw.score, total);
    }
  }
  // across entries come first, each direction in number order
  const dirs = result.crosswords[0].refined.entries.map((e) => e.dir);
  assert.deepEqual(dirs, [...dirs].sort());
});

test('refining a result layout starts from that layout', () => {
  const first = submit({ entriesText: weatherText, search: { nIter: 5 } }).crosswords[0].refined;
  const again = submit({ entriesText: weatherText, init: first, search: { nIter: 0, nXwords: 2 } });
  for (const cw of again.crosswords) {
    assert.deepEqual(cw.orig.grid, first.grid);
    assert.deepEqual(cw.refined.grid, first.grid);
    assert.equal(cw.orig.score, first.score);
  }
  const clash = structuredClone(first);
  clash.entries[0].row += 1;
  const error = rejection({ entriesText: weatherText, init: clash });
  assert.ok(error.issues.some((i) => i.code === 'bad_init'));
});

test('answers are split into graphemes; a hyphen takes a cell', () => {
  assert.deepEqual(gridWord('Жар-птица').cells, ['ж', 'а', 'р', '-', 'п', 'т', 'и', 'ц', 'а']);
  assert.deepEqual(gridWord('New York').text, 'newyork');
  // a combining accent stays with its letter
  assert.deepEqual(gridWord('Ёжиќ').cells, ['ё', 'ж', 'и', 'ќ']);
  const result = submit({ entriesText: 'Огненная птица из сказок : Жар-птица\nДомашний кот : Кошка\nДруг человека : Собака\nСерый хищник : Волк\nРыжая хитрица : Лиса\n', search: { nIter: 3 } });
  const cw = result.crosswords[0].refined;
  assert.ok(cw.grid.flat().includes('-'));
  assert.ok(cw.grid.flat().every((ch) => ch === '' || [...ch].length === 1));
});

test('validation lists every problem', () => {
  const error = rejection({
    entries: [{ clue: 'x', answer: 'Hail' }, { answer: 'hail' }, { answer: 'a' }, { clue: 1, answer: 'fog', extra: true }],
    target: { mask: ['#.', '#'] },
    objective: { weights: { area: 'big', nope: 1 }, desiredAreaRatio: 0 },
    search: { nIter: -1, seed: 1.5 },
    bogus: 1,
  });
  const found = error.issues.map((i) => `${i.code} ${i.path}`);
  assert.deepEqual(found.sort(), [
    'bad_target target.mask[1]',
    'duplicate_answer entries[1].answer',
    'out_of_range entries[2].answer',
    'out_of_range objective.desiredAreaRatio',
    'out_of_range search.nIter',
    'unknown_field bogus',
    'unknown_field entries[3].extra',
    'unknown_field objective.weights.nope',
    'wrong_type entries[3].clue',
    'wrong_type objective.weights.area',
    'wrong_type search.seed',
  ].sort());
  assert.match(error.message, /^Invalid request: /);
  // an unreadable entry keeps the others' indices
  const skipped = rejection({ entries: [{ answer: 5 }, 'x', { answer: 'a' }] });
  assert.deepEqual(skipped.issues.map((i) => `${i.code} ${i.path}`), ['wrong_type entries[0].answer', 'wrong_type entries[1]', 'out_of_range entries[2].answer']);
});

test('the text format reports bad lines with their numbers', () => {
  const error = rejection({ entriesText: 'Frozen rain : Hail\n\nno colon here\na : b : c\nclue :\nMist : Fog\nAgain : hail\n' });
  assert.deepEqual(error.issues.map((i) => [i.code, i.line]), [['bad_entry_line', 3], ['bad_entry_line', 4], ['bad_entry_line', 5], ['duplicate_answer', 7]]);
  assert.deepEqual(parseEntries('Frozen rain : Hail\nMist: Fog'), [{ clue: 'Frozen rain', answer: 'Hail' }, { clue: 'Mist', answer: 'Fog' }]);
  rejection({ entries: [], entriesText: 'a : bb' });
  rejection({});
  rejection([]);
});

test('targets: a mask or RGBA pixels, never both, and something to fill', () => {
  rejection({ entriesText: weatherText, target: { mask: heartRows, rgba: { width: 1, height: 1, data: 'AAAA' } } });
  rejection({ entriesText: weatherText, target: { mask: ['...'] } });
  rejection({ entriesText: weatherText, target: { png: 'heart.png' } });
  rejection({ entriesText: weatherText, target: { rgba: { width: 2, height: 1, data: 'AAAA' } } });
  // 2 x 1 RGB: one black pixel (filled with the default threshold), one white
  const rgba = Buffer.from([0, 0, 0, 255, 255, 255, 255, 255]).toString('base64');
  const result = submit({ entries: [{ answer: 'fog' }, { answer: 'frost' }], target: { rgba: { width: 2, height: 1, data: rgba } }, search: { nIter: 0 } });
  assert.deepEqual(result.settings.target, { width: 2, height: 1, cells: 1 });
});

test('words that share no letters are reported as unplaceable, naming the hardest', () => {
  const error = rejection({ entries: [{ answer: 'abc' }, { answer: 'xyz' }, { answer: 'abd' }], search: { maxAttemptsXword: 2 } }, 'unplaceable');
  assert.equal(error.issues[0].path, 'entries[1].answer');
  assert.match(error.message, /"xyz"/);
});

test('the SVG has one cell per letter and every clue number', () => {
  const cw = submit({ entriesText: weatherText, search: { nIter: 0 } }).crosswords[0].orig;
  const filled = renderSvg(cw);
  const blank = renderSvg(cw, { style: 'blank' });
  const letters = cw.grid.flat().filter((ch) => ch !== '').length;
  assert.equal(filled.match(/<rect x=/g)?.length, 2 * letters); // shadow and cell
  assert.equal((filled.match(/<text /g)?.length ?? 0) - (blank.match(/<text /g)?.length ?? 0), letters);
  assert.equal(blank.match(/<text /g)?.length, new Set(cw.entries.map((e) => `${e.row},${e.col}`)).size);
});

test('the puzzle is the blank grid with every clue and its length, and no answer', () => {
  const cw = submit({ entriesText: weatherText, search: { nIter: 0 } }).crosswords[0].orig;
  const puzzle = renderPuzzleSvg(cw);
  const [grid, clues] = puzzle.split('<g font-family="Helvetica, Arial, sans-serif" font-size="0.34"');
  assert.equal(grid.match(/<text /g)?.length, renderSvg(cw, { style: 'blank' }).match(/<text /g)?.length);
  const texts = [...clues.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  const lines = texts.filter((t) => !/^(Across|Down|\d+\.)$/.test(t)).join(' ');
  const expected = ['across', 'down'].flatMap((dir) => cw.entries.filter((e) => e.dir === dir).map((e) => `${e.clue} (${e.length})`)).join(' ');
  assert.equal(lines.replace(/&amp;/g, '&'), expected.replace(/\s+/g, ' '));
  assert.deepEqual(texts.filter((t) => /^\d+\.$/.test(t)).sort(), cw.entries.map((e) => `${e.number}.`).sort());
});

test('the command line prints the result, reads PNG targets and reports errors as JSON', () => {
  const cli = here('../cli.mjs');
  const request = JSON.stringify({ entriesText: weatherText, search: { nIter: 2 } });
  const ok = spawnSync(process.execPath, [cli], { input: request, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), submit(JSON.parse(request)));
  const bad = spawnSync(process.execPath, [cli], { input: '{"entries": 3}', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.issues[0].path, 'entries');
  const missing = spawnSync(process.execPath, [cli], { input: JSON.stringify({ entriesText: weatherText, target: { png: 'no-such.png' } }), encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stderr).error.code, 'unreadable_input');
  assert.equal(spawnSync(process.execPath, [cli, 'a.json', 'b.json'], { encoding: 'utf8' }).status, 2);
});
