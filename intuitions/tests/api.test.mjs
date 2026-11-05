import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ENTRIES, IntuitionsError, submit } from '../api.js';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

/** The IntuitionsError a request raises. @param {unknown} request */
function rejection(request) {
  try {
    submit(request);
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    assert.equal(error.code, 'invalid_request');
    return error;
  }
  assert.fail('request was accepted');
}

const paths = (/** @type {IntuitionsError} */ error) => error.issues.map((i) => `${i.code} ${i.path}`);

test('submit returns the entry, the resolved params and the result', () => {
  const out = submit({ entry: 'zscore-outliers', params: { z: 3 } });
  assert.deepEqual(out.params, { meanDifference: 2, sdRatio: 1, proportionA: 0.8, z: 3, sweep: 'meanDifference' });
  assert.equal(out.entry, 'zscore-outliers');
  assert.ok('overall' in out.result);
  assert.deepEqual(submit({ entry: 'threshold-model' }).params, { means: [0.75, 0.85], thresholds: [[0, 1, 2], [0, 0.8, 1.9]], rho: 0.4, sample: null });
  assert.deepEqual(submit({ entry: 'threshold-model', params: { means: [1] } }).params, { means: [1], thresholds: [[0, 1, 2]] });
  assert.deepEqual(Object.keys(ENTRIES), ['zscore-outliers', 'threshold-model', 'correlation-geometry', 'typical-set', 'dag-adjustment']);
  const dag = /** @type {any} */ (submit({ entry: 'dag-adjustment' }).params);
  assert.deepEqual([dag.view, dag.exposure, dag.outcome, dag.adjust, dag.mediator, dag.noise, dag.sample, dag.graph.name], ['adjust', 'X', 'Y', [], null, 'unit', null, 'confounder']);
  assert.deepEqual(submit({ entry: 'typical-set' }).params, { view: 'shell', k: 10, coverage: 0.9, radius: 1 });
  assert.deepEqual(submit({ entry: 'correlation-geometry' }).params, { view: 'arrows', a: [1, 2, 4], b: [1, 3, 2] });
  assert.deepEqual(submit({ entry: 'correlation-geometry', params: { view: 'entry-range', matrix: [[1, 0.2], [0.2, 1]] } }).params, { view: 'entry-range', matrix: [[1, 0.2], [0.2, 1]], cell: [0, 1], observations: 6 });
});

test('unknown entries and fields are rejected, every issue listed', () => {
  assert.deepEqual(paths(rejection({ entry: 'nope', extra: 1 })), ['unknown_field extra', 'unknown_entry entry']);
  assert.deepEqual(paths(rejection({})), ['missing_field entry']);
  assert.deepEqual(paths(rejection([])), ['wrong_type ']);
  assert.deepEqual(paths(rejection({ entry: 'zscore-outliers', params: { z: '3', sdRatio: 9, foo: 1, sweep: 'mu' } })),
    ['unknown_field params.foo', 'out_of_range params.sdRatio', 'wrong_type params.z', 'out_of_range params.sweep']);
  assert.deepEqual(paths(rejection({ entry: 'zscore-outliers', params: [] })), ['wrong_type params']);
});

test('threshold-model params are checked in full', () => {
  assert.deepEqual(paths(rejection({ entry: 'threshold-model', params: { means: [0], rho: 0.2, sample: { n: 10 } } })),
    ['not_applicable params.rho', 'not_applicable params.sample']);
  assert.deepEqual(paths(rejection({ entry: 'threshold-model', params: { thresholds: [[0, 0.005], [5]], rho: 1.2 } })),
    ['out_of_range params.thresholds[0][1]', 'out_of_range params.thresholds[1][0]', 'out_of_range params.rho']);
  assert.deepEqual(paths(rejection({ entry: 'threshold-model', params: { means: [0, 0], thresholds: [[0]] } })), ['wrong_type params.thresholds']);
  assert.deepEqual(paths(rejection({ entry: 'threshold-model', params: { sample: { n: 0, seed: -1, k: 2 } } })),
    ['unknown_field params.sample.k', 'out_of_range params.sample.n', 'out_of_range params.sample.seed']);
  assert.deepEqual(paths(rejection({ entry: 'threshold-model', params: { table: [[1, 2.5], [0, 0]], rho: 0 } })),
    ['conflicting_fields params', 'wrong_type params.table[0][1]']);
  assert.deepEqual(paths(rejection({ entry: 'threshold-model', params: { table: [[1, 0], [3, 0]] } })), ['empty_category params.table[*][1]']);
  assert.deepEqual(paths(rejection({ entry: 'threshold-model', params: { table: [[1, 2], [3]] } })), ['wrong_type params.table[1]']);
});

test('correlation-geometry params are checked in full', () => {
  assert.deepEqual(paths(rejection({ entry: 'correlation-geometry', params: { view: 'cone', b: [1, 1, 1], a: [1, '2', 3], r: 0.5 } })),
    ['unknown_field params.r', 'no_spread params.b', 'wrong_type params.a[1]']);
  assert.deepEqual(paths(rejection({ entry: 'correlation-geometry', params: { view: 'equicorrelation', k: 1.5, zeroPair: 'yes' } })),
    ['wrong_type params.zeroPair', 'wrong_type params.k']);
  assert.deepEqual(paths(rejection({ entry: 'correlation-geometry', params: { view: 'entry-range', matrix: [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]] } })),
    ['not_positive_semidefinite params.matrix']);
  assert.deepEqual(paths(rejection({ entry: 'correlation-geometry', params: { view: 3 } })), ['wrong_type params.view']);
});

test('the error message names the first three issues and serialises as {error}', () => {
  const error = rejection({ entry: 'zscore-outliers', params: { a: 1, b: 2, c: 3, d: 4 } });
  assert.match(error.message, /^Invalid request: params\.a: unknown field.*; and 1 more$/);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(error)).error), ['code', 'message', 'issues']);
});

test('the CLI prints the same result and reports errors with exit codes', () => {
  const request = { entry: 'threshold-model', params: { table: [[40, 10], [15, 35]] } };
  const ok = spawnSync(process.execPath, [cli], { input: JSON.stringify(request), encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.deepEqual(JSON.parse(ok.stdout), JSON.parse(JSON.stringify(submit(request))));
  const bad = spawnSync(process.execPath, [cli], { input: '{"entry": "x"}', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.issues[0].code, 'unknown_entry');
  const json = spawnSync(process.execPath, [cli], { input: '{', encoding: 'utf8' });
  assert.equal(json.status, 1);
  assert.equal(JSON.parse(json.stderr).error.code, 'invalid_json');
  const usage = spawnSync(process.execPath, [cli, 'a.json', 'b.json'], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  const missing = spawnSync(process.execPath, [cli, '/nonexistent/request.json'], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stderr).error.code, 'unreadable_input');
});
