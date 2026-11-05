// lib/tree.js against ape and phytools (R 4.6): vcv(), pic(), Newick written by write.tree(),
// and pbtree()'s branch lengths, distributionally. tests/fixtures/r-trees.json is written by
// tmp/intuitions-b5/scripts/r_trees.R.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mulberry32 } from '../../shared/rng.js';
import {
  contrasts, fanLayout, heights, NewickError, parseNewick, postorder, preorder, rectangularLayout, reroot, tipLabel, tipNodes, tipsBelow, vcv, writeNewick, yule,
} from '../lib/tree.js';

const ref = JSON.parse(readFileSync(new URL('fixtures/r-trees.json', import.meta.url), 'utf8'));
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

/** The tree's VCV in the order of `labels`. @param {import('../lib/tree.js').Tree} tree @param {string[]} labels */
function vcvBy(tree, labels) {
  const { tips, matrix } = vcv(tree);
  const at = labels.map((label) => tips.findIndex((node) => tree.label[node] === label));
  return at.map((i) => at.map((j) => matrix[i][j]));
}

test('vcv matches ape::vcv, and a root edge adds its length to every entry', () => {
  for (const t of ref.trees) {
    const tree = parseNewick(t.newick);
    const C = vcvBy(tree, t.tips);
    C.forEach((row, i) => row.forEach((v, j) => close(v - t.rootEdge, t.vcv[i][j], 1e-9)));
  }
  assert.deepEqual(vcvBy(parseNewick('(x1:1.5,x2:0.5):1;'), ['x1', 'x2']), [[2.5, 1], [1, 1.5]]);
  const demo = ref.demo.sampleCov; // demonstratingUVBMonTree.R's 400,000 draws
  [[2.5, 1], [1, 1.5]].forEach((row, i) => row.forEach((v, j) => assert.ok(Math.abs(demo[i][j] - v) < 0.02)));
});

test('contrasts match ape::pic: scaled contrasts and their variances, node by node', () => {
  for (const t of ref.trees) {
    const tree = parseNewick(t.newick);
    const values = tree.label.map((label) => (t.tips.includes(label) ? [t.x[t.tips.indexOf(label)]] : null));
    const { steps } = contrasts(tree, values);
    assert.equal(steps.length, t.pic.length);
    const below = tipsBelow(tree);
    for (const p of t.pic) {
      const step = steps.find((s) => below[s.node].map((n) => tree.label[n]).sort().join() === p.tips.join());
      assert.ok(step, `node over ${p.tips}`);
      close(step.variance, p.variance, 1e-9);
      close(step.contrast[0] / Math.sqrt(step.variance), p.contrast, 1e-9);
    }
  }
});

test('Newick: ape write.tree() text reads and writes back unchanged; our text reads back the same', () => {
  for (const t of ref.trees) {
    const tree = parseNewick(t.newick);
    assert.equal(writeNewick(tree), t.newick);
    assert.deepEqual(parseNewick(writeNewick(tree)), tree);
  }
  const quoted = parseNewick("('a b':1,[comment] 'it''s':2.5e-1)root:0.5;");
  assert.deepEqual(quoted.label, ['root', 'a b', "it's"]);
  assert.deepEqual(quoted.length, [0.5, 1, 0.25]);
  assert.equal(writeNewick(quoted), "('a b':1,'it''s':0.25)root:0.5;");
  assert.ok(Number.isNaN(parseNewick('(A,B:1);').length[1]));
  for (const [text, position] of /** @type {const} */ ([['(A,B', 4], ['(A:x,B);', 3], ['(A,B);x', 6], ['', 0], ["('A,B);", 7], ['(A,B)C D;', 7]])) {
    assert.throws(() => parseNewick(text), (error) => error instanceof NewickError && error.position === position, text);
  }
});

test('Yule trees have pbtree(n = 10)\'s heights and branch lengths, decile by decile', () => {
  const { n, replicates, means, sds, deciles } = ref.yule;
  const rng = mulberry32(11);
  /** @type {Record<string, number[]>} */
  const stats = { height: [], total: [], external: [], firstSplit: [] };
  for (let r = 0; r < replicates; r++) {
    const tree = yule(n, rng);
    const h = heights(tree);
    const tips = tipNodes(tree);
    stats.height.push(Math.max(...tips.map((i) => h[i])));
    stats.total.push(tree.length.reduce((a, b) => a + b, 0));
    stats.external.push(tips.reduce((a, i) => a + tree.length[i], 0));
    stats.firstSplit.push(Math.min(...tree.children.map((kids, i) => (kids.length && i > 0 ? h[i] : Infinity))));
  }
  for (const key of Object.keys(stats)) {
    const v = stats[key];
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    assert.ok(Math.abs(mean - means[key]) < 4 * sds[key] * Math.sqrt(2 / replicates), `${key} mean ${mean} vs ${means[key]}`);
    // Counts in R's deciles: a chi-square on 9 df beyond 27.9 has p < 0.001.
    const bins = new Array(10).fill(0);
    for (const x of v) bins[deciles[key].filter((/** @type {number} */ d) => x > d).length] += 1;
    const chi = bins.reduce((a, c) => a + (c - replicates / 10) ** 2 / (replicates / 10), 0);
    assert.ok(chi < 27.9, `${key} chi-square ${chi}`);
  }
  // E[height] = Σ 1/(k b) for k = 2..n.
  const expected = Array.from({ length: n - 1 }, (_, k) => 1 / (k + 2)).reduce((a, b) => a + b, 0);
  const mean = stats.height.reduce((a, b) => a + b, 0) / replicates;
  assert.ok(Math.abs(mean - expected) < 4 * sds.height / Math.sqrt(replicates));
});

test('yule: seeded, binary, n tips labelled in drawing order', () => {
  const a = yule(7, mulberry32(3));
  assert.deepEqual(a, yule(7, mulberry32(3)));
  assert.deepEqual(tipNodes(a).map((i) => a.label[i]), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.ok(a.children.every((kids) => kids.length === 0 || kids.length === 2));
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(tipLabel), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  const h = heights(a);
  const tips = tipNodes(a).map((i) => h[i]);
  tips.forEach((t) => close(t, tips[0], 1e-12)); // ultrametric
});

test('traversals, layouts and re-rooting', () => {
  const tree = parseNewick('(A:5,(B:3,C:3.5)D:4)E;');
  assert.deepEqual(preorder(tree), [0, 1, 2, 3, 4]);
  assert.deepEqual(postorder(tree), [1, 3, 4, 2, 0]);
  const rect = rectangularLayout(tree);
  assert.deepEqual(rect.y, [0.75, 0, 1.5, 1, 2]);
  assert.deepEqual(rect.x, [0, 5, 4, 7, 7.5]);
  const fan = fanLayout(tree);
  close(fan.angle[4], (4 * Math.PI) / 3);
  // On D's branch, 1 from D: the new root joins D (1) and the old root E (3), which is now a bend above A.
  const on = reroot(tree, 2, 1);
  assert.equal(writeNewick(on.tree), '((B:3,C:3.5)D:1,(A:5)E:3);');
  // At tip A: A becomes the root, with one child.
  assert.equal(writeNewick(reroot(tree, 1, 0).tree), '(((B:3,C:3.5)D:4)E:5)A;');
  // Rooting is a choice of where to hang the same unrooted tree: path lengths between tips do not change.
  const tipDistance = (/** @type {import('../lib/tree.js').Tree} */ t) => {
    const { tips, matrix } = vcv(t);
    const names = tips.map((i) => t.label[i]);
    return ['A,B', 'A,C', 'B,C'].map((pair) => {
      const [i, j] = pair.split(',').map((l) => names.indexOf(l));
      return i < 0 || j < 0 ? null : matrix[i][i] + matrix[j][j] - 2 * matrix[i][j];
    });
  };
  assert.deepEqual(tipDistance(on.tree), tipDistance(tree));
});
