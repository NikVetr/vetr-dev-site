import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colliderConditioning, compute as computeDag, PRESETS } from '../dag-adjustment/compute.js';
import { IntuitionsError } from '../lib/params.js';

/** Results are a union over views; tests read them untyped. @param {unknown} params @returns {any} */
const dag = (params) => computeDag(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
/** @param {unknown} params */
function issues(params) {
  try {
    dag(params);
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    return error.issues.map((i) => `${i.code} ${i.path}`);
  }
  return assert.fail('accepted');
}
/** The verdict of each set, as "Z: valid unbiased". @param {any} r */
const verdicts = (r) => r.sets.map((/** @type {any} */ s) => `${s.adjust.join('+') || '∅'}: ${s.valid ? 'valid' : 'invalid'} ${s.unbiased ? 'unbiased' : 'biased'}`);

test('adjust: each preset has the classic verdicts, and valid sets are exactly the unbiased ones', () => {
  assert.deepEqual(verdicts(dag({ graph: 'confounder' })), ['∅: invalid biased', 'Z: valid unbiased']);
  assert.deepEqual(verdicts(dag({ graph: 'mediator' })), ['∅: valid unbiased', 'M: invalid biased']);
  assert.deepEqual(verdicts(dag({ graph: 'collider' })), ['∅: valid unbiased', 'C: invalid biased']);
  assert.deepEqual(verdicts(dag({ graph: 'm-bias' })), ['∅: valid unbiased', 'M: invalid biased']);
  assert.deepEqual(verdicts(dag({ graph: 'front-door' })), ['∅: invalid biased', 'Tar: invalid biased']);
  assert.deepEqual(verdicts(dag({ graph: 'happiness' })), ['∅: invalid biased', 'Numeracy: invalid biased', 'Illness: valid unbiased', 'Numeracy+Illness: valid unbiased']);
  for (const graph of Object.keys(PRESETS)) {
    for (const noise of ['unit', 'standardized']) {
      if (graph === 'happiness' && noise === 'standardized') continue;
      for (const s of dag({ graph, noise }).sets) if (s.valid) assert.ok(s.unbiased, `${graph} ${s.adjust}`);
    }
  }
});

test('adjust: the effect is the sum over directed paths, and the coefficients are the closed forms', () => {
  const med = dag({ graph: 'mediator' });
  close(med.effect, 0.3 + 0.7 * 0.6);
  close(dag({ graph: 'mediator', adjust: ['M'] }).estimate.coefficient, 0.3); // the direct effect only
  // Confounder, unit noise: Cov(X, Y) / Var(X) with Var(X) = 1 + 0.6².
  const conf = dag({ graph: 'confounder' });
  close(conf.estimate.coefficient, (0.4 * 1.36 + 0.6 * 0.5) / 1.36);
  close(conf.covariance[1][1], 1.36);
  // Happiness: Income's coefficient is confounded by Illness, Numeracy's is reversed by adjusting for Income.
  close(dag({ graph: 'happiness' }).estimate.coefficient, 14 / 6);
  const num = dag({ graph: 'happiness', exposure: 'Numeracy', adjust: ['Income'] });
  close(num.effect, 4);
  close(num.estimate.coefficient, -2, 1e-12);
  assert.equal(num.estimate.valid, false);
  // Standardized noise makes every variance 1.
  dag({ graph: 'm-bias', noise: 'standardized' }).covariance.forEach((/** @type {number[]} */ row, /** @type {number} */ i) => close(row[i], 1, 1e-14));
});

test('adjust: paths say which are open, the front door recovers the effect, and samples are seeded', () => {
  const c = dag({ graph: 'collider', adjust: ['C'] });
  const through = c.paths.find((/** @type {any} */ p) => p.nodes.includes('C'));
  assert.equal(through.open, true);
  assert.deepEqual(through.openedBy, ['C']);
  assert.equal(dag({ graph: 'collider' }).paths.find((/** @type {any} */ p) => p.nodes.includes('C')).open, false);
  const conf = dag({ graph: 'confounder', adjust: ['Z'] });
  assert.deepEqual(conf.paths.map((/** @type {any} */ p) => [p.causal, p.open, p.blockedBy]), [[true, true, []], [false, false, ['Z']]]);
  const fd = dag({ graph: 'front-door' }).frontDoor;
  assert.equal(fd.criterion, true);
  close(fd.estimate, 0.35);
  // Without the latent confounder's edge into the outcome, the front door still works; with an edge Smoking → Cancer it does not.
  const g = structuredClone(PRESETS['front-door'].graph);
  g.edges.push({ from: 'Smoking', to: 'Cancer', coefficient: 0.3 });
  const broken = dag({ graph: g, exposure: 'Smoking', outcome: 'Cancer', mediator: 'Tar' }).frontDoor;
  assert.equal(broken.criterion, false);
  assert.equal(broken.conditions.intercepts, false);
  const a = dag({ graph: 'confounder', adjust: ['Z'], sample: { n: 4000, seed: 3 } });
  assert.deepEqual(a.sample, dag({ graph: 'confounder', adjust: ['Z'], sample: { n: 4000, seed: 3 } }).sample);
  assert.ok(Math.abs(a.sample.coefficient - 0.4) < 4 / Math.sqrt(4000), `${a.sample.coefficient}`);
  assert.equal(a.sample.points.length, 4000);
});

test('adjust: a zero coefficient is no edge, for the verdicts as well as the numbers', () => {
  const g = structuredClone(PRESETS.confounder.graph);
  g.edges[1].coefficient = 0; // Z → Y
  const r = dag({ graph: g, exposure: 'X', outcome: 'Y' });
  assert.deepEqual(verdicts(r), ['∅: valid unbiased', 'Z: valid unbiased']);
  assert.equal(r.paths.length, 1);
});

test('colliders: the closed form matches the general graph, and many weak colliders couple Y and U', () => {
  for (const [p, rYX, share] of [[1, 0.15, 0.5], [3, 0.4, 0.2], [8, 0.15, 0.9]]) {
    const c = colliderConditioning(p, rYX, share);
    const xs = Array.from({ length: p }, (_, i) => `X${i + 1}`);
    const graph = {
      nodes: [{ id: 'Y' }, { id: 'U' }, ...xs.map((id) => ({ id }))],
      edges: xs.flatMap((id) => [{ from: 'Y', to: id, coefficient: rYX }, { from: 'U', to: id, coefficient: c.rUX }]),
    };
    const r = dag({ graph, exposure: 'U', outcome: 'Y', adjust: xs, noise: 'standardized' });
    close(r.estimate.partialCorrelation, c.partialCorrelation, 1e-12);
    close(r.estimate.conditionalCovariance[0][1], c.covariance, 1e-12);
    close(1 - r.estimate.conditionalCovariance[1][1], c.r2, 1e-12);
    close(r.effect, 0, 0);
  }
  const weak = dag({ view: 'colliders', colliders: 1024, rYX: 0.15, share: 0.5 });
  assert.ok(weak.partialCorrelation < -0.9);
  close(dag({ view: 'colliders', share: 0 }).partialCorrelation, 0, 0);
  const curves = dag({ view: 'colliders', colliders: 10 }).curves;
  assert.deepEqual(curves.byCount.map((/** @type {any} */ c) => c.colliders), [1, 4, 10, 16, 64, 256, 1024]);
  assert.equal(curves.shares.length, 101);
});

test('dag-adjustment params are checked in full', () => {
  assert.deepEqual(issues({ graph: 'nope' }), ['out_of_range params.graph']);
  assert.deepEqual(issues({ graph: 'm-bias', adjust: ['U1', 'X', 'Q'], extra: 1 }), ['unknown_field params.extra', 'not_observed params.adjust[0]', 'out_of_range params.adjust[1]', 'unknown_node params.adjust[2]']);
  assert.deepEqual(issues({ graph: 'confounder', exposure: 'Y' }), ['out_of_range params.outcome']);
  assert.deepEqual(issues({ graph: { nodes: [{ id: 'A' }, { id: 'B' }], edges: [{ from: 'A', to: 'B', coefficient: 1 }, { from: 'B', to: 'A', coefficient: 1 }] } }), ['duplicate_edge params.graph.edges[1]']);
  assert.deepEqual(issues({ graph: { nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], edges: [{ from: 'A', to: 'B', coefficient: 1 }, { from: 'B', to: 'C', coefficient: 1 }, { from: 'C', to: 'A', coefficient: 1 }] } }), ['cyclic params.graph.edges']);
  assert.deepEqual(issues({ graph: { nodes: [{ id: 'A' }, { id: 'A' }], edges: [] } }), ['duplicate_node params.graph.nodes[1].id']);
  assert.deepEqual(issues({ graph: { nodes: [{ id: 'A' }, { id: 'B' }], edges: [] } }), ['missing_field params.exposure', 'missing_field params.outcome']);
  assert.deepEqual(issues({ graph: 'happiness', noise: 'standardized' }), ['not_standardizable params.graph', 'not_standardizable params.graph']);
  assert.deepEqual(issues({ view: 'colliders', colliders: 0, rYX: 1 }), ['out_of_range params.colliders', 'out_of_range params.rYX']);
});
