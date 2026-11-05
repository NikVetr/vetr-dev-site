// Core tests: node --test tests/ (from seating/). The R reference values come from
// tests/fixtures/r-parity.json (see make-r-parity.R).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SeatingError, fromRRequest, submit } from '../core/index.js';
import { gridLayout, spiralLayout, tableCloseness } from '../core/layout.js';
import { scoreAssignment } from '../core/objective.js';
import { buildProblem } from '../core/request.js';
import { rsum } from '../core/rmath.js';

const here = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
/** @type {any} */
const R = JSON.parse(readFileSync(here('fixtures/r-parity.json'), 'utf8'));
const TERMS = /** @type {const} */ (['table', 'pairs', 'constraints', 'geography']);
const example = JSON.parse(readFileSync(here('../examples/party.json'), 'utf8'));

/** @param {string} name @param {object} [options] */
const rRequest = (name, options) => {
  const req = fromRRequest(R.requests[name]);
  return options ? { ...req, options: fromRRequest({ options }).options } : req;
};

/** @param {() => unknown} fn @returns {SeatingError} */
function seatingError(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof SeatingError, String(error));
    return error;
  }
  throw new Error('expected a SeatingError');
}

// ---------- R arithmetic and layouts ----------

test("rsum is R's long-double sum() to the last bit", () => {
  for (const { x, sum } of R.sums) assert.equal(rsum(x), sum, JSON.stringify(x));
  // plain double addition would miss most of them
  assert.ok(R.sums.filter((/** @type {any} */ s) => s.x.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) !== s.sum).length > R.sums.length / 2);
});

test('spiral and grid layouts and closeness match R (spiral exact up to 23 tables)', () => {
  for (const L of R.layouts) {
    const spiral = spiralLayout(L.n);
    assert.deepEqual(gridLayout(L.n), L.grid);
    const close = tableCloseness(spiral);
    for (let i = 0; i < L.n; i++) {
      for (let k = 0; k < 2; k++) {
        if (L.n <= 23) assert.equal(spiral[i][k], L.spiral[i][k]);
        else assert.ok(Math.abs(spiral[i][k] - L.spiral[i][k]) <= 1e-15, 'cos/sin may differ from glibc by an ulp');
      }
      for (let j = 0; j < L.n; j++) {
        if (L.n <= 23) assert.equal(close[i * L.n + j], L.closeness[i][j]);
        else assert.ok(Math.abs(close[i * L.n + j] - L.closeness[i][j]) <= 1e-15);
      }
    }
  }
  assert.equal(spiralLayout(400).length, 297);
});

// ---------- objective ----------

test('fixed seatings score exactly as R scores them, term by term and table by table', () => {
  for (const S of R.scores) {
    const problem = buildProblem(rRequest(S.name));
    S.seatings.forEach((/** @type {number[][]} */ seating, /** @type {number} */ k) => {
      const ours = scoreAssignment(problem, seating);
      const theirs = S.results[k];
      const where = `${S.name}, seating ${k}`;
      assert.equal(ours.score, theirs.score, where);
      for (const t of TERMS) assert.equal(ours.terms[t], theirs.terms[t], `${where}, ${t}`);
      ours.byTable.forEach((row, i) => { for (const t of TERMS) assert.equal(row[t], theirs.by_table[i][t], `${where}, table ${i}, ${t}`); });
    });
  }
});

test('the score is the sum of the terms, and weights scale their terms', () => {
  const req = rRequest('party');
  const problem = buildProblem(req);
  const weighted = buildProblem({ ...req, options: { weights: { table: 2, pairs: 0.5, geography: 3 } } });
  const a = scoreAssignment(problem, problem.initial);
  const b = scoreAssignment(weighted, problem.initial);
  assert.ok(Math.abs(a.score - TERMS.reduce((s, t) => s + a.terms[t], 0)) < 1e-9);
  assert.ok(Math.abs(b.terms.table - 2 * a.terms.table) < 1e-9);
  assert.ok(Math.abs(b.terms.pairs - 0.5 * a.terms.pairs) < 1e-9);
  assert.ok(Math.abs(b.terms.geography - 3 * a.terms.geography) < 1e-9);
  assert.equal(b.terms.constraints, a.terms.constraints);
});

// ---------- search ----------

test('whole runs are R\'s chains, bit for bit: moves, best seating, scores and trace', () => {
  for (const run of R.runs) {
    const r = submit(rRequest(run.name, run.options));
    const want = run.response;
    const where = `${run.name}, seed ${run.options.seed}`;
    assert.deepEqual(/** @type {any} */ (r.trajectory).moves.map((/** @type {any} */ m) => ({ iteration: m.iteration, tables: m.tables, swaps: m.swaps, positions: m.positions })), want.moves, where);
    assert.deepEqual(r.tables.map((t) => t.seats), want.seats, where);
    assert.deepEqual(r.search, { iterations: want.search.iterations, accepted: want.search.accepted, bestIteration: want.search.best_iteration }, where);
    assert.equal(r.score, want.score, where);
    for (const t of TERMS) assert.equal(r.terms[t], want.terms[t], `${where}, ${t}`);
    assert.deepEqual(r.trace, want.trace, where);
    assert.deepEqual(r.violations, want.violations, where);
  }
});

test('incremental scores equal a full rescore at every state of long chains', () => {
  for (const tablemates of [true, false]) {
    const req = { ...rRequest('cat_geo_false'), geography: { cost: 'category', tablemates }, options: { iterations: 3000, record: 'states', seed: 7, logitScale: 0.02 } };
    const problem = buildProblem(req);
    assert.ok(problem.nSeats > problem.nGuests, 'empty seats in play');
    const r = submit(req);
    const states = /** @type {any} */ (r.trajectory).states;
    assert.equal(states.length, 3001);
    const index = new Map(problem.ids.map((id, i) => [id, i]));
    let emptyMoves = 0;
    for (const s of states) {
      // empty seats are null; any empty seat index stands for them all
      const free = problem.ids.flatMap((id, i) => (id === null ? [i] : []));
      const seating = s.tables.map((/** @type {(string | null)[]} */ t) => t.map((id) => (id === null ? /** @type {number} */ (free.pop()) : /** @type {number} */ (index.get(id)))));
      const full = scoreAssignment(problem, seating);
      assert.ok(Math.abs(full.score - s.score) <= 1e-9 * Math.max(1, Math.abs(full.score)), `iteration ${s.iteration}`);
      for (const t of TERMS) assert.ok(Math.abs(full.terms[t] - s.terms[t]) <= 1e-9 * Math.max(1, Math.abs(full.terms[t])), `iteration ${s.iteration}, ${t}`);
      if (s.tables.some((/** @type {(string | null)[]} */ t, /** @type {number} */ i) => t.filter((x) => x === null).length !== states[0].tables[i].filter((/** @type {unknown} */ x) => x === null).length)) emptyMoves++;
    }
    assert.ok(emptyMoves > 0, 'guests moved into empty seats');
    assert.ok(r.search.accepted > 500, `a long chain (${r.search.accepted} accepted)`);
  }
});

test('replaying the recorded moves gives every state, ending at the best seating', () => {
  const r = submit({ ...rRequest('single_seats'), options: { record: 'moves', iterations: 500, seed: 2 } });
  const traj = /** @type {any} */ (r.trajectory);
  const tables = Object.fromEntries(r.tables.map((t, i) => [t.id, [...traj.initial.tables[i]]]));
  const problem = buildProblem(rRequest('single_seats'));
  let atBest = null;
  for (const m of traj.moves) {
    m.positions.forEach((/** @type {[number, number]} */ [pa, pb], /** @type {number} */ k) => {
      assert.deepEqual([tables[m.tables[0]][pa], tables[m.tables[1]][pb]], m.swaps[k]);
      tables[m.tables[0]][pa] = m.swaps[k][1];
      tables[m.tables[1]][pb] = m.swaps[k][0];
    });
    if (m.iteration === r.search.bestIteration) atBest = structuredClone(tables);
  }
  assert.deepEqual(Object.values(/** @type {object} */ (atBest)), r.tables.map((t) => t.seats));
  // incremental totals and a full rescore agree to rounding
  assert.ok(Math.abs(traj.moves.at(-1).best - r.score) < 1e-9);
  assert.ok(Math.abs(traj.initial.score - r.trace.score[0]) < 1e-9);
  assert.ok(problem.nSeats > problem.nGuests);
});

test('the same seed gives the same result, and recording does not change it', () => {
  const req = rRequest('party', { seed: 9, iterations: 500 });
  const plain = submit(req);
  const recorded = submit({ ...req, options: { ...req.options, record: 'moves' } });
  assert.equal(plain.trajectory, null);
  assert.deepEqual(plain.tables, recorded.tables);
  assert.deepEqual(plain.trace, recorded.trace);
  const other = submit({ ...req, options: { ...req.options, seed: 10 } });
  assert.notDeepEqual(other.tables.map((t) => t.seats), plain.tables.map((t) => t.seats));
});

test("the brute-force optimum, and R's seeds reaching it, on validation/brute_force.R's party", () => {
  const bf = R.brute_force;
  const req = fromRRequest(bf.request);
  const problem = buildProblem(req);
  // every way to seat 12 guests at 3 tables of 4 (tables unordered within capacity groups as R enumerates them)
  const scores = [];
  const seats = [...Array(12).keys()];
  const combos = (/** @type {number[]} */ pool, /** @type {number} */ k) => {
    /** @type {number[][]} */
    const out = [];
    const rec = (/** @type {number} */ start, /** @type {number[]} */ pick) => {
      if (pick.length === k) return void out.push(pick);
      for (let i = start; i < pool.length; i++) rec(i + 1, [...pick, pool[i]]);
    };
    rec(0, []);
    return out;
  };
  for (const a of combos(seats, 4)) {
    const rest = seats.filter((s) => !a.includes(s));
    for (const b of combos(rest, 4)) scores.push(scoreAssignment(problem, [a, b, rest.filter((s) => !b.includes(s))]).score);
  }
  assert.equal(scores.length, bf.n_seatings);
  const optimum = Math.max(...scores);
  assert.ok(Math.abs(optimum - bf.optimum) < 1e-9);
  for (const { iterations, best, optimal } of bf.results) {
    for (let seed = 1; seed <= 20; seed++) {
      const r = submit({ ...req, options: { seed, iterations } });
      assert.ok(Math.abs(r.score - best[seed - 1]) < 1e-9, `${iterations} iterations, seed ${seed}`);
      assert.equal(r.score >= optimum - 1e-9, optimal[seed - 1]);
    }
  }
});

// ---------- requests ----------

test('the example request runs, and its R spelling is accepted only through fromRRequest', () => {
  const r = submit(example);
  assert.equal(r.trajectory?.record, 'moves');
  assert.ok(r.search.bestIteration > 0);
  assert.deepEqual(r.violations, { together: [], apart: [] });
  const e = seatingError(() => submit({ ...example, options: { logit_scale: 2 } }));
  assert.equal(e.issues[0].message, "unknown field (R's logit_scale is logitScale here)");
  assert.deepEqual(fromRRequest({ guests: [], options: { logit_scale: 2, seed: 3 } }).options, { logitScale: 2, seed: 3 });
  assert.deepEqual(fromRRequest({ guests: [], options: [] }).options, {});
});

test('tables follow the original rule: floor(n / seats) tables, leftovers one each from the first', () => {
  const guests = Array.from({ length: 100 }, (_, i) => ({ id: `g${i}`, category: i % 4 }));
  const p = buildProblem({ guests, tables: { seats: 6 } });
  assert.deepEqual(p.capacity, [7, 7, 7, 7, ...new Array(12).fill(6)]);
  assert.deepEqual(p.initial[0], [0, 1, 2, 3, 4, 5, 96]);
  const q = buildProblem({ guests: guests.slice(0, 11), tables: { seats: 4 } });
  assert.deepEqual(q.capacity, [6, 5]); // 11 guests: 2 tables, 3 leftovers round-robin
  const r = submit({ guests: guests.slice(0, 10), tables: [{ id: 'A', capacity: 4 }, { id: 'B', capacity: 4 }, { id: 'C', capacity: 4 }], options: { iterations: 200 } });
  assert.deepEqual(r.tables.map((t) => t.seats.length), [4, 4, 4]);
  assert.equal(r.tables.flatMap((t) => t.seats).filter((s) => s === null).length, 2);
});

test('violations are reported when constraints cannot all hold', () => {
  const line = { guests: ['g1', 'g2', 'g3', 'g4'].map((id) => ({ id, category: 1 })), tables: [{ id: 'T1', capacity: 2, x: 0, y: 0 }, { id: 'T2', capacity: 2, x: 1, y: 0 }] };
  const r = submit({ ...line, together: [['g1', 'g2'], ['g2', 'g3']], options: { iterations: 200 } });
  assert.equal(r.violations.together.length, 1);
  assert.equal(r.terms.constraints, -1000);
});

test('an invalid request lists every issue, with R\'s codes and 0-based paths', () => {
  const line = { guests: ['g1', 'g2', 'g3', 'g4'].map((id) => ({ id, category: 1 })), tables: [{ id: 'T1', capacity: 2 }, { id: 'T2', capacity: 2 }] };
  const codes = (/** @type {unknown} */ req) => seatingError(() => buildProblem(req)).issues.map((i) => `${i.code} ${i.path}`);
  assert.deepEqual(codes({ guests: [{ id: 'a', category: 1 }, { id: 'a', category: 'x' }], tables: { seats: 1 }, colour: 1 }), ['unknown_field colour']);
  assert.deepEqual(codes({ guests: [{ id: 'a', category: 1 }, { id: 'a', category: 'x' }], tables: { seats: 1 } }), ['wrong_type guests[1].category', 'duplicate_id guests[1].id']);
  assert.deepEqual(codes({ ...line, together: [['g1', 'g2', 'g3']] }), ['infeasible_group together[0]']);
  assert.deepEqual(codes({ ...line, together: [['g1', 'zz']] }), ['unknown_guest together[0][1]']);
  assert.deepEqual(codes({ ...line, together: [['g1', 'g2']], apart: [['g2', 'g1']] }), ['conflicting_constraints apart[0]']);
  assert.deepEqual(codes({ ...line, tables: [{ id: 'T1', capacity: 1 }, { id: 'T2', capacity: 2 }] }), ['insufficient_capacity tables']);
  assert.deepEqual(codes({ ...line, options: { iterations: -1, record: 'all' } }), ['out_of_range options.iterations', 'out_of_range options.record']);
  assert.deepEqual(codes({ ...line, pairs: [{ a: 'g1', b: 'g1', score: 1 }, { a: 'g1', b: 'g2', score: 0 }, { a: 'g2', b: 'g1', score: 2 }] }), ['self_pair pairs[0]', 'duplicate_pair pairs[2]']);
  assert.deepEqual(codes({ ...line, tables: [{ id: 'T1', capacity: 2, x: 0 }, { id: 'T2', capacity: 2 }] }), ['missing_field tables[0].y', 'missing_field tables[1].x', 'missing_field tables[1].y']);
  assert.deepEqual(codes({ guests: [{ id: 'a' }, { id: 'b', category: 2 }], tables: { seats: 1 } }), ['missing_field guests[0].category']);
  assert.equal(buildProblem({ guests: [{ id: 'a' }, { id: 'b' }], tables: { seats: 1 }, options: { tableObjective: 'none' } }).nGuests, 2);
  const many = Array.from({ length: 300 }, (_, i) => ({ id: `g${i}` }));
  assert.deepEqual(codes({ guests: many, tables: { seats: 1 }, options: { tableObjective: 'none' } }), ['too_many_tables tables']);
  const e = seatingError(() => buildProblem({ ...line, options: { iterations: -1, record: 'all' } }));
  assert.equal(e.code, 'invalid_request');
  assert.equal(e.message, 'Invalid request: options.iterations: must be a whole number >= 0 (and 1 more issue)');
  assert.deepEqual(JSON.parse(JSON.stringify(e)).error.issues.length, 2);
});

// ---------- command line ----------

test('the CLI prints the result, and errors as JSON with exit status 1 or 2', () => {
  const cli = here('../cli.mjs');
  const out = JSON.parse(execFileSync(process.execPath, [cli, here('../examples/party.json')], { encoding: 'utf8' }));
  assert.equal(out.score, submit(example).score);
  const bad = spawnSync(process.execPath, [cli], { input: JSON.stringify({ guests: [] }), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.code, 'invalid_request');
  const usage = spawnSync(process.execPath, [cli, 'a.json', 'b.json'], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.equal(JSON.parse(usage.stderr).error.code, 'usage');
  const fromR = spawnSync(process.execPath, [cli], { input: JSON.stringify(R.requests.geometric), encoding: 'utf8' });
  assert.equal(fromR.status, 0, fromR.stderr);
  assert.equal(JSON.parse(fromR.stdout).settings.logitScale, 4);
});
