// trait-evolution: exact transitions, tip moments against theory and an R simulation
// (tests/fixtures/r-trees.json), middleBurst.R's branch rates, the bridge, and the params.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import { parseNewick, tipNodes, vcv } from '../lib/tree.js';
import { compute as computeTraits, insideRegion, PLOTS_TREE, resolveParams, transition, treeHeight } from '../trait-evolution/compute.js';

const ref = JSON.parse(readFileSync(new URL('fixtures/r-trees.json', import.meta.url), 'utf8'));
/** Results are a union over views; tests read them untyped. @param {unknown} params @returns {any} */
const run = (params) => computeTraits(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
/** @param {unknown} params */
function issues(params) {
  try {
    run(params);
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    return error.issues.map((i) => `${i.code} ${i.path}`);
  }
  return assert.fail('accepted');
}

/** Sample means and covariance of tip values over seeds 1..reps. @param {Record<string, unknown>} params @param {number} reps */
function tipMoments(params, reps) {
  /** @type {number[][]} */
  const rows = [];
  for (let seed = 1; seed <= reps; seed++) rows.push(run({ ...params, seed }).tips.map((/** @type {any} */ t) => t.value));
  const k = rows[0].length;
  const mean = Array.from({ length: k }, (_, j) => rows.reduce((a, r) => a + r[j], 0) / reps);
  const cov = mean.map((mi, i) => mean.map((mj, j) => rows.reduce((a, r) => a + (r[i] - mi) * (r[j] - mj), 0) / (reps - 1)));
  return { mean, cov };
}

/** Asserts sample moments agree with expected ones within z SEs (normal tips). @param {{ mean: number[], cov: number[][] }} sample @param {{ mean: number[], cov: number[][] }} expected @param {number} reps @param {number} [z] */
function agree(sample, expected, reps, z = 4.5) {
  const C = expected.cov;
  sample.mean.forEach((m, i) => assert.ok(Math.abs(m - expected.mean[i]) < z * Math.sqrt(C[i][i] / reps), `mean ${i}: ${m} vs ${expected.mean[i]}`));
  sample.cov.forEach((row, i) => row.forEach((c, j) => {
    const se = Math.sqrt((C[i][i] * C[j][j] + C[i][j] ** 2) / reps);
    assert.ok(Math.abs(c - C[i][j]) < z * se, `cov ${i},${j}: ${c} vs ${C[i][j]}`);
  }));
}

test('Brownian motion and OU tips have the theoretical moments and match an R simulation with rOU', () => {
  const m = ref.moments; // tips A, B, C of ((A:0.5,B:0.5):0.5,C:1):0.25; from 1 at the stem's base
  const reps = 20000;
  const tree = parseNewick(PLOTS_TREE);
  const { matrix: S } = vcv(tree); // shared time, stem included
  const T = S.map((row, i) => row[i]);
  const bm = tipMoments({ tree: { newick: PLOTS_TREE }, model: 'bm', sigma2: 2, root: 1, steps: 10 }, reps);
  const bmTheory = { mean: [1, 1, 1], cov: S.map((row) => row.map((s) => 2 * s)) };
  agree(bm, bmTheory, reps);
  agree({ mean: m.bm.mean, cov: m.bm.cov }, bmTheory, reps); // R's simulation agrees with the same theory
  const { alpha, theta, sigma2 } = m.ou;
  const ou = tipMoments({ tree: { newick: PLOTS_TREE }, model: 'ou', sigma2, alpha, theta, root: 1, steps: 10 }, reps);
  const ouTheory = {
    mean: T.map((t) => theta + (1 - theta) * Math.exp(-alpha * t)),
    cov: S.map((row, i) => row.map((s, j) => (sigma2 / (2 * alpha)) * Math.exp(-alpha * (T[i] + T[j] - 2 * s)) * (1 - Math.exp(-2 * alpha * s)))),
  };
  agree(ou, ouTheory, reps);
  agree({ mean: m.ou.mean, cov: m.ou.cov }, ouTheory, reps);
  // The step count changes the drawing, not the distribution: one step per branch agrees too.
  agree(tipMoments({ tree: { newick: PLOTS_TREE }, model: 'ou', sigma2, alpha, theta, root: 1, steps: 10 }, 4000), ouTheory, 4000);
});

test('a trend adds drift × time to the same Brownian draws; early and late bursts integrate σ² e^(a t)', () => {
  const bm = run({ model: 'bm' });
  const trend = run({ model: 'trend', drift: 2 });
  trend.tips.forEach((/** @type {any} */ t, /** @type {number} */ i) => close(t.value, bm.tips[i].value + 2 * 1, 1e-9));
  const tree = parseNewick(PLOTS_TREE);
  const { matrix: S } = vcv(tree);
  for (const change of [-3, 2]) {
    const p = /** @type {any} */ (resolveParams({ tree: { newick: PLOTS_TREE }, model: 'eb', change, sigma2: 1.5 }));
    const step = transition(p, treeHeight(tree));
    const cov = S.map((row) => row.map((s) => step(0, 0, s).variance));
    close(cov[0][1], (1.5 * (Math.exp(change * 0.75) - 1)) / change);
    agree(tipMoments({ tree: { newick: PLOTS_TREE }, model: 'eb', change, sigma2: 1.5, steps: 10 }, 6000), { mean: [0, 0, 0], cov }, 6000);
  }
});

test("a burst's integrated rate is middleBurst.R's branch-rate rescaling, and the tips follow it", () => {
  const b = ref.burst; // pbtree(12), δ² = 5, λ = 2, the burst at half the height
  const tree = parseNewick(b.newick);
  const height = treeHeight(tree);
  const p = /** @type {any} */ (resolveParams({ tree: { newick: b.newick }, model: 'burst', delta2: b.delta2, lambda: b.lambda, burstAt: 0.5 }));
  const step = transition(p, height);
  const { tips, matrix: S } = vcv(tree);
  const order = b.tips.map((/** @type {string} */ label) => tips.findIndex((n) => tree.label[n] === label));
  const cov = order.map((/** @type {number} */ i) => order.map((/** @type {number} */ j) => step(0, 0, S[i][j]).variance));
  cov.forEach((/** @type {number[]} */ row, /** @type {number} */ i) => row.forEach((c, j) => close(c, b.vcv[i][j], 1e-9)));
  const sample = tipMoments({ tree: { newick: b.newick }, model: 'burst', delta2: b.delta2, lambda: b.lambda, burstAt: 0.5, steps: 40 }, 3000);
  const byTip = tips.map((node) => b.tips.indexOf(tree.label[node]));
  agree(sample, { mean: new Array(12).fill(0), cov: byTip.map((i) => byTip.map((j) => b.vcv[i][j])) }, 3000);
});

test('a clade shift moves the clade to the second optimum from the start of its stem', () => {
  const r = run({ model: 'shift', alpha: 4, theta: 1.5, theta2: -1.5 });
  assert.deepEqual(r.clade.tips, ['A', 'B', 'C', 'D', 'E']); // the root's smaller daughter
  close(r.clade.from, 0);
  const { envelope: e } = r;
  close(e.clade.mean.at(-1), -1.5 + 1.5 * Math.exp(-4), 1e-9);
  close(e.mean.at(-1), 1.5 - 1.5 * Math.exp(-4), 1e-9);
  close(e.sd.at(-1), Math.sqrt((1 - Math.exp(-8)) / 8), 1e-9);
  const inClade = (/** @type {number} */ node) => {
    for (let n = node; n >= 0; n = r.tree.parent[n]) if (n === r.clade.node) return true;
    return false;
  };
  for (const b of r.branches) assert.equal(b.regime, inClade(b.node) ? 2 : 1);
  const inner = run({ model: 'shift', clade: ['F', 'G'] });
  assert.ok(inner.clade.from > 0);
  assert.deepEqual(inner.clade.tips.slice(0, 2), ['F', 'G']);
});

test('the tree view: paths join at every node, the envelope, and units for a pasted tree', () => {
  const r = run({});
  assert.equal(r.tips.length, 12);
  close(r.treeHeight, 1, 1e-12);
  const byNode = new Map(r.branches.map((/** @type {any} */ b) => [b.node, b]));
  for (const b of r.branches) {
    const parent = r.tree.parent[b.node];
    if (parent > 0) close(b.values[0], byNode.get(parent).values.at(-1), 0);
    close(b.values.at(-1), r.nodeValues[b.node], 0);
  }
  close(r.envelope.sd.at(-1), 1, 1e-12);
  const own = run({ tree: { newick: '((A:2,B:2):3,C:5):1;' }, sigma2: 0.5 });
  close(own.treeHeight, 6);
  close(own.envelope.sd.at(-1), Math.sqrt(0.5 * 6), 1e-12);
  assert.equal(own.branches[0].node, 0); // the stem is a branch
});

test('two traits: the tips covary as the shared time times the rate matrix', () => {
  const reps = 4000;
  /** @type {number[][]} */
  const rows = [];
  for (let seed = 1; seed <= reps; seed++) rows.push(run({ view: 'bivariate', seed, steps: 10 }).tips.flatMap((/** @type {any} */ t) => t.value));
  const { matrix: S } = vcv(parseNewick(PLOTS_TREE));
  const R = [[1, 0.5], [0.5, 2]];
  const cov = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, b) => S[Math.floor(a / 2)][Math.floor(b / 2)] * R[a % 2][b % 2]));
  const mean = Array.from({ length: 6 }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / reps);
  const sample = mean.map((mi, i) => mean.map((mj, j) => rows.reduce((s, r) => s + (r[i] - mi) * (r[j] - mj), 0) / (reps - 1)));
  agree({ mean, cov: sample }, { mean: [4, 4, 4, 4, 4, 4], cov }, reps);
});

test('the bridge: fixed ends, the free midpoint law, regions kept, and the stagewise rejection biased', () => {
  const free = run({ view: 'bridge', region: 'none', paths: 1000, levels: 3 });
  assert.equal(free.points, 9);
  for (const path of free.paths) {
    assert.deepEqual(path[0], [-5, -4]);
    assert.deepEqual(path[8], [4, 4.5]);
  }
  const mids = free.paths.map((/** @type {number[][]} */ p) => p[4]);
  const mx = mids.reduce((/** @type {number} */ a, /** @type {number[]} */ q) => a + q[0], 0) / 1000;
  close(mx, -0.5, 4 * Math.sqrt(25 / 1000)); // variance (50/4)·2
  const stage = run({ view: 'bridge', paths: 1000, seed: 2 });
  const whole = run({ view: 'bridge', method: 'whole-path', paths: 1000, seed: 2 });
  for (const r of [stage, whole]) assert.ok(r.paths.every((/** @type {number[][]} */ p) => p.every((q) => insideRegion('disc', q))));
  assert.ok(stage.levels.every((/** @type {any} */ l) => l.rejected > 0));
  assert.ok(whole.attempts > 1000);
  // Rejecting each midpoint alone pushes the paths outward: the middle point sits farther
  // from the centre than when whole paths are rejected, which conditions them exactly.
  const gap = stage.midpoint.sample.distance - whole.midpoint.sample.distance;
  assert.ok(gap > 4 * Math.hypot(stage.midpoint.sample.distanceSE, whole.midpoint.sample.distanceSE), `gap ${gap}`);
});

test('the bridge stops at its draw budget and says so', () => {
  const islands = { view: 'bridge', region: 'dumbbell', start: [-12, -6], end: [14, 4], length: 40, levels: 9, paths: 50 };
  const whole = run({ ...islands, method: 'whole-path' });
  assert.equal(whole.exhausted, true);
  assert.equal(whole.paths.length + whole.failed, 50);
  assert.equal(whole.paths.length ? whole.midpoint.sample !== null : whole.midpoint.sample, whole.paths.length ? true : null);
  const stage = run(islands);
  assert.equal(stage.exhausted, false);
  assert.equal(stage.paths.length, 50);
});

test("qualifyingExam_animations.R's OUsim: its sigma2 scales a standard normal step, so it is an SD", () => {
  const o = ref.ousim;
  const se = o.asSD * Math.sqrt(2 / 4000);
  assert.ok(Math.abs(o.variance - o.asSD) < 4 * se);
  assert.ok(Math.abs(o.variance - o.asVariance) > 20 * se);
});

test('params: defaults, per-model fields, trees, regions and work are checked', () => {
  assert.deepEqual(resolveParams({}), { view: 'tree', tree: { tips: 12, seed: 1 }, model: 'bm', sigma2: 1, root: 0, steps: 300, seed: 1 });
  assert.deepEqual(resolveParams({ model: 'shift' }), { view: 'tree', tree: { tips: 12, seed: 1 }, model: 'shift', sigma2: 1, root: 0, alpha: 4, theta: 1.5, theta2: -1.5, clade: ['A', 'E'], steps: 300, seed: 1 });
  assert.deepEqual(issues({ model: 'bm', alpha: 2 }), ['unknown_field params.alpha']);
  assert.deepEqual(issues({ model: 'shift', clade: ['A', 'Q'] }), ['unknown_tip params.clade']);
  assert.deepEqual(issues({ tree: { newick: '(A:1,B:1' } }), ['invalid_newick params.tree.newick']);
  assert.deepEqual(issues({ tree: { newick: '(A:1,A:1);' } }), ['duplicate_label params.tree.newick']);
  assert.deepEqual(issues({ tree: { tips: 1 } }), ['out_of_range params.tree.tips']);
  assert.deepEqual(issues({ tree: { tips: 4, newick: '(A:1,B:1);' } }), ['wrong_type params.tree']);
  const star = `(${Array.from({ length: 50 }, (_, i) => `t${i}:1`).join(',')});`; // 50 branches each the tree's height
  assert.deepEqual(issues({ tree: { newick: star }, steps: 5000 }), ['too_much_work params.steps']);
  assert.deepEqual(issues({ view: 'bivariate', rate: [[1, 2], [2, 1]] }), ['not_positive_definite params.rate']);
  assert.deepEqual(issues({ view: 'bridge', region: 'dumbbell' }), ['outside_region params.end']);
  assert.deepEqual(issues({ view: 'bridge', levels: 12, paths: 100 }), ['too_much_work params.paths']);
  assert.deepEqual(issues({ view: 'bridge', method: 'exact' }), ['out_of_range params.method']);
  assert.equal(tipNodes(parseNewick(PLOTS_TREE)).length, 3);
});
