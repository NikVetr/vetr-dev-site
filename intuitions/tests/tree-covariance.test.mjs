// tree-covariance: the pruning likelihood against BMpruneLL and the direct REML in R
// (tests/fixtures/r-trees.json), the pulley principle, the arrows, and the params.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import { compute as computeCov, resolveParams, SCRIPT_TREE } from '../tree-covariance/compute.js';

const ref = JSON.parse(readFileSync(new URL('fixtures/r-trees.json', import.meta.url), 'utf8'));
/** Results are a union over views; tests read them untyped. @param {unknown} params @returns {any} */
const run = (params) => computeCov(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
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

test("pruning reproduces BMpruneLL, the direct REML and the ML for two and three traits, on R's trees", () => {
  for (const c of ref.pruning) {
    const t = ref.trees.find((/** @type {any} */ x) => x.name === c.tree);
    const values = Object.fromEntries(c.tips.map((/** @type {string} */ tip, /** @type {number} */ i) => [tip, c.X[i]]));
    const r = run({ view: 'pruning', newick: t.newick, values, rate: c.rate });
    // ape writes 10 significant digits, so the read tree differs from R's in the 10th.
    close(r.reml, c.bmpruneLL, 1e-8);
    close(r.reml, c.reml, 1e-8);
    close(r.direct.reml, c.remlMvtnorm, 1e-8);
    close(r.ml, c.ml, 1e-8);
    close(r.direct.ml, c.ml, 1e-8);
    // BMpruneLL gives the same on the unrooted tree and rooted on another tip, in R.
    close(c.unrooted, c.bmpruneLL, 1e-10);
    close(c.rerooted, c.bmpruneLL, 1e-10);
  }
  assert.equal(ref.oneTraitError, 'incorrect number of dimensions'); // the script needs two traits or more
});

test("the 3-tip pruning: drawingSimple3TipTrees.R's contrasts, extension and Q", () => {
  const r = run({ view: 'pruning' });
  const [first, second] = r.steps;
  assert.deepEqual([first.node, first.children], ['D', ['B', 'C']]);
  close(first.contrast[0], -2 - 1);
  close(first.variance, 30 + 35);
  close(first.extension, (30 * 35) / 65);
  close(first.estimate[0], (35 * -2 + 30 * 1) / 65); // (v₃ x_B + v₂ x_C)/(v₂ + v₃)
  assert.deepEqual([second.node, second.children], ['E', ['A', 'D']]);
  close(second.lengths[1], 40 + (30 * 35) / 65); // v₄ + v₂v₃/(v₂ + v₃)
  close(second.variance, 50 + 40 + (30 * 35) / 65);
  assert.deepEqual(r.Q, [65 * 0.1, second.variance * 0.1]);
  close(second.total, r.reml);
  close(r.reml, r.direct.reml);
  close(r.ml, r.direct.ml);
  close(r.root.estimate[0], r.direct.rootEstimate[0]);
  close(r.root.variance, r.direct.rootVariance);
  close(r.P[1][2], 40 * 0.1);
});

test('the pulley principle: every root gives the same restricted likelihood, and not the same ordinary one', () => {
  const base = run({ view: 'reroot' });
  const roots = [{ node: 'A', fraction: 0 }, { node: 'B', fraction: 0 }, { node: 'D', fraction: 0.5 }, { node: 'C', fraction: 0.5 }, { node: 'A', fraction: 0.3 }, { node: 'D', fraction: 0 }];
  const mls = new Set();
  for (const root of roots) {
    const r = run({ view: 'reroot', root });
    close(r.reml, base.reml, 1e-12);
    close(r.direct.reml, base.reml, 1e-12);
    close(r.ml, r.direct.ml, 1e-12);
    mls.add(r.ml.toFixed(6));
  }
  assert.equal(mls.size, roots.length - 2 + 1); // A and B at the tip: ML = REML there
  const atA = run({ view: 'reroot', root: { node: 'A', fraction: 0 } });
  assert.equal(atA.observedRoot, 'A');
  assert.deepEqual(atA.tips, ['B', 'C']);
  close(atA.ml, atA.reml);
  // Along A → C the restricted likelihood is flat; the ordinary one rises towards the tips.
  const { sweep } = base;
  assert.deepEqual(sweep.marks.map((/** @type {any} */ m) => [m.label, m.at]), [['A', 0], ['E', 50], ['D', 90], ['C', 125]]);
  for (const v of sweep.reml) close(v, base.reml, 1e-12);
  assert.ok(sweep.ml[0] > sweep.ml[30] && sweep.ml.at(-1) > sweep.ml[30]);
  assert.equal(sweep.current, 50);
  // Two traits and a rate matrix: the same invariance.
  const values = { A: [1, 2], B: [0, -1], C: [2, 0.5] };
  const rate = [[1, 0.3], [0.3, 2]];
  const two = [{ node: 'E', fraction: 0 }, { node: 'C', fraction: 0.2 }, { node: 'B', fraction: 0 }].map((root) => run({ view: 'reroot', values, rate, root }).reml);
  two.forEach((v) => close(v, two[0], 1e-12));
});

test('covariance: shared paths, the arrows, and simulated tips', () => {
  const r = run({});
  assert.deepEqual(r.vcv, [[50, 0, 0], [0, 70, 40], [0, 40, 75]]);
  assert.deepEqual(r.paths, [['A'], ['D', 'B'], ['D', 'C']]);
  const v = r.arrows.vectors;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(v[i].reduce((/** @type {number} */ s, /** @type {number} */ x, /** @type {number} */ k) => s + x * v[j][k], 0), r.vcv[i][j], 1e-12);
  close(r.arrows.angles[2].degrees, (Math.acos(40 / Math.sqrt(70 * 75)) * 180) / Math.PI, 1e-12);
  const big = run({ sample: { n: 5000, seed: 3 } });
  const rho = 40 / Math.sqrt(70 * 75);
  assert.ok(Math.abs(big.sample.correlation - rho) < 4 * (1 - rho * rho) / Math.sqrt(5000));
  const stem = run({ newick: '(x1:1.5,x2:0.5):1;', sample: null });
  assert.deepEqual(stem.vcv, [[2.5, 1], [1, 1.5]]); // demonstratingUVBMonTree.R's matrix
  assert.deepEqual(stem.paths, [['N1', 'x1'], ['N1', 'x2']]);
  assert.equal(stem.arrows.vectors[1][2], 0);
});

test('params: trees, values, rates and roots are checked', () => {
  assert.deepEqual(resolveParams({ view: 'pruning' }), { view: 'pruning', newick: SCRIPT_TREE, values: { A: 3, B: -2, C: 1 }, rate: 0.1 });
  const star = run({ view: 'pruning', newick: '(A:1,B:2,C:3);', values: { A: 1, B: 0, C: -1 }, rate: 1 });
  assert.deepEqual(star.steps.map((/** @type {any} */ s) => s.children), [['A', 'B'], ['A+B', 'C']]);
  close(star.reml, star.direct.reml, 1e-12);
  assert.deepEqual(issues({ newick: '(A:1,B);' }), ['missing_length params.newick']);
  assert.deepEqual(issues({ newick: '(A:1,(B:1,C:1):1' }), ['invalid_newick params.newick']);
  assert.deepEqual(issues({ view: 'pruning', values: { A: 1, B: 2 } }), ['missing_field params.values.C']);
  assert.deepEqual(issues({ view: 'pruning', values: { A: 1, B: 2, C: 3, Z: 0 } }), ['unknown_field params.values.Z']);
  assert.deepEqual(issues({ view: 'pruning', values: { A: [1, 2], B: [2, 1], C: [0, 0] }, rate: [[1, 2], [2, 1]] }), ['not_positive_definite params.rate']);
  assert.deepEqual(issues({ view: 'reroot', root: { node: 'E', fraction: 0.5 } }), ['out_of_range params.root.fraction']);
  assert.deepEqual(issues({ view: 'reroot', root: { node: 'Q' } }), ['unknown_node params.root.node']);
  assert.deepEqual(issues({ arrows: ['A', 'A'] }), ['duplicate_tip params.arrows']);
  assert.deepEqual(issues({ view: 'covariance', rate: 1 }), ['unknown_field params.rate']);
});
