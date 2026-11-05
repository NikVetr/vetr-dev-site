import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ForecastCalibrationError, formatTable, parseTable, submit } from '../core/index.js';
import { mulberry32 } from '../../shared/rng.js';

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url));
const exampleCsv = readFileSync(here('../examples/synthetic.csv'), 'utf8');

/** Item-level predictions from [probability, count, hits] rows. */
const expand = (/** @type {number[][]} */ rows) => rows.flatMap(([p, n, hits]) => Array.from({ length: n }, (_, k) => ({ probability: p, outcome: k < hits })));

/** Throws and returns the ForecastCalibrationError. */
function rejection(/** @type {unknown} */ request) {
  try {
    submit(request);
  } catch (error) {
    assert.ok(error instanceof ForecastCalibrationError);
    assert.equal(error.code, 'invalid_request');
    return error;
  }
  assert.fail('request was accepted');
}

test('simulated log-loss null matches the closed-form mean and variance', () => {
  // Spread-out probabilities, so every term of both sums matters.
  const rng = mulberry32(7);
  const predictions = Array.from({ length: 200 }, () => ({ probability: 0.02 + 0.96 * rng(), outcome: rng() < 0.5 }));
  const S = 100000;
  const { expected, simulated } = submit({ predictions, simulations: S, plotWorlds: 0, seed: 3 }).logLoss;
  assert.ok(Math.abs(simulated.mean - expected.mean) < 4 * expected.sd / Math.sqrt(S), `mean ${simulated.mean} vs ${expected.mean}`);
  assert.ok(Math.abs(simulated.sd - expected.sd) < 6 * expected.sd / Math.sqrt(2 * S), `sd ${simulated.sd} vs ${expected.sd}`);

  // The closed forms themselves, for one 90% prediction:
  // E = -(0.9 log 0.9 + 0.1 log 0.1), Var = 0.9 * 0.1 * log(9)^2.
  const one = submit({ predictions: [{ probability: 0.9, outcome: true }], simulations: 100, plotWorlds: 0 }).logLoss;
  assert.ok(Math.abs(one.expected.mean - -(0.9 * Math.log(0.9) + 0.1 * Math.log(0.1))) < 1e-15);
  assert.ok(Math.abs(one.expected.sd - Math.sqrt(0.09) * Math.log(9)) < 1e-15);
});

// From tmp/scripts/r-reference/reference.R: the original playingPreds.R and
// 2021-SA-predictions.R code, R 4.6.1, 1e5 simulations, set.seed(2019).
const R_REFERENCE = {
  playingPreds2019: {
    predictions: expand([[0.5, 8, 5], [0.6, 22, 14], [0.7, 13, 8], [0.8, 18, 16], [0.9, 25, 24], [0.95, 9, 8], [0.99, 4, 4]]),
    weighted: 0.00518587035859763, unweighted: 0.00563469711890457, logLoss: 43.967015692082,
    pWeighted: 0.7812, pUnweighted: 0.74123, pLogLoss: 0.75142,
    // qbinom(0.025 and 0.975, n, p), in hits
    low: [1, 9, 6, 11, 19, 7, 3], high: [7, 18, 12, 17, 25, 9, 4],
  },
  synthetic: {
    predictions: parseTable(exampleCsv),
    weighted: 0.053764880952381, unweighted: 0.0526105442176871, logLoss: 26.1453942610862,
    pWeighted: 0.08053, pUnweighted: 0.09853, pLogLoss: 0.4206,
    low: [0, 0, 0, 1, 2, 3, 3, 3, 1], high: [2, 3, 3, 5, 7, 8, 7, 5, 2],
  },
};

for (const [name, ref] of Object.entries(R_REFERENCE)) {
  test(`reproduces the R reference: ${name}`, () => {
    const S = 100000;
    const result = submit({ predictions: ref.predictions, simulations: S, plotWorlds: 0, seed: 1 });
    const relative = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) / Math.abs(b);
    assert.ok(relative(result.calibration.weighted.statistic, ref.weighted) < 1e-12);
    assert.ok(relative(result.calibration.unweighted.statistic, ref.unweighted) < 1e-12);
    assert.ok(relative(result.logLoss.total, ref.logLoss) < 1e-12);
    // Monte Carlo p-values: within 4 standard errors of the R-minus-JS difference.
    for (const [p, rP] of [[result.calibration.weighted.p, ref.pWeighted], [result.calibration.unweighted.p, ref.pUnweighted], [result.logLoss.p, ref.pLogLoss]]) {
      assert.ok(Math.abs(p - rP) < 4 * Math.sqrt(rP * (1 - rP) * 2 / S), `p ${p} vs R ${rP}`);
    }
    assert.deepEqual(result.bins.map((bin) => Math.round(bin.interval[0] * bin.n)), ref.low);
    assert.deepEqual(result.bins.map((bin) => Math.round(bin.interval[1] * bin.n)), ref.high);
  });
}

test('the same seed gives the same result; another seed gives other worlds', () => {
  const request = { table: exampleCsv, simulations: 2000, plotWorlds: 50, seed: 11 };
  assert.deepEqual(submit(request), submit(request));
  assert.notDeepEqual(submit(request).worlds, submit({ ...request, seed: 12 }).worlds);
});

test('equal-width bins put a probability on an edge in the upper bin', () => {
  const predictions = [0.29, 0.3, 0.35, 0.71].map((probability) => ({ probability, outcome: true }));
  const { bins } = submit({ predictions, bins: 100, simulations: 100, plotWorlds: 0 });
  assert.deepEqual(bins.map((bin) => bin.label), ['[29%, 30%)', '[30%, 31%)', '[35%, 36%)', '[71%, 72%)']);
  const coarse = submit({ predictions, bins: 10, simulations: 100, plotWorlds: 0 }).bins;
  assert.deepEqual(coarse.map((bin) => [bin.label, bin.n]), [['[20%, 30%)', 1], ['[30%, 40%)', 2], ['[70%, 80%)', 1]]);
  assert.ok(Math.abs(coarse[1].meanProbability - 0.325) < 1e-15);
});

test('rejects unknown fields, bad values and 0 or 1 probabilities with typed issues', () => {
  const issues = (/** @type {unknown} */ request) => rejection(request).issues.map((issue) => [issue.code, issue.path]);
  assert.deepEqual(issues({ predictions: [{ probability: 0.6, outcome: true, note: 'x' }], colour: 'red' }), [
    ['unknown_field', 'colour'],
    ['unknown_field', 'predictions[0].note'],
  ]);
  assert.deepEqual(issues({ predictions: [{ probability: 0, outcome: false }, { probability: 1, outcome: true }] }), [
    ['out_of_range', 'predictions[0].probability'],
    ['out_of_range', 'predictions[1].probability'],
  ]);
  assert.match(rejection({ predictions: [{ probability: 1, outcome: true }] }).message, /infinite log loss/);
  assert.deepEqual(issues({ predictions: [{ probability: '0.7', outcome: 'yes' }, { outcome: 1 }] }), [
    ['wrong_type', 'predictions[0].probability'],
    ['wrong_type', 'predictions[0].outcome'],
    ['missing_field', 'predictions[1].probability'],
  ]);
  assert.deepEqual(issues({ predictions: [], table: 'probability,outcome\n0.5,1' }), [['conflicting_fields', '']]);
  assert.deepEqual(issues({ simulations: 2000 }), [['missing_field', 'predictions']]);
  assert.deepEqual(issues({ predictions: [{ probability: 0.5, outcome: 1 }], simulations: 1.5, bins: 1, interval: 95, seed: -1 }), [
    ['wrong_type', 'bins'],
    ['wrong_type', 'simulations'],
    ['out_of_range', 'interval'],
    ['out_of_range', 'seed'],
  ]);
  assert.deepEqual(issues({ predictions: [{ probability: 0.5, outcome: 1 }], simulations: 100, plotWorlds: 200 }), [['out_of_range', 'plotWorlds']]);
  assert.deepEqual(issues([]), [['wrong_type', '']]);
});

test('reads CSV and TSV tables and reports problems by line', () => {
  const csv = 'Text,Probability,Outcome\n"Rain, then sun",70%,yes\n\n"She said ""no""",.25,0\n';
  assert.deepEqual(parseTable(csv), [
    { text: 'Rain, then sun', probability: 0.7, outcome: 1 },
    { text: 'She said "no"', probability: 0.25, outcome: 0 },
  ]);
  assert.deepEqual(parseTable('outcome\tprobability\ntrue\t0.9\n'), [{ text: '', probability: 0.9, outcome: 1 }]);
  assert.deepEqual(parseTable(formatTable(parseTable(exampleCsv))), parseTable(exampleCsv));

  const problems = (/** @type {string} */ table) => rejection({ table }).issues.map((issue) => [issue.line, issue.message]);
  assert.deepEqual(problems('prediction,probability,outcome\nx,0.5,1'), [
    [1, 'unknown column "prediction" in the header; the columns are text (optional), probability and outcome'],
  ]);
  assert.deepEqual(problems('probability,outcome\n0.5,1\nabc,1\n100%,0\n0.4,maybe\n0.4'), [
    [3, 'probability "abc" is not a number like 0.7 or a percentage like 70%'],
    [4, 'probability 100% is exactly 1: a 0% or 100% forecast that turns out wrong has infinite log loss, so stated probabilities must lie strictly between 0 and 1 (for example 0.01 or 0.99)'],
    [5, 'outcome "maybe" is not one of 1, 0, true, false, yes, no'],
    [6, 'has 1 cell but the header has 2'],
  ]);
});

test('the CLI prints the result, and a structured error with exit code 1', () => {
  const cli = here('../cli.mjs');
  const ok = spawnSync(process.execPath, [cli], { input: JSON.stringify({ table: exampleCsv, simulations: 500, plotWorlds: 2 }) });
  assert.equal(ok.status, 0, ok.stderr.toString());
  assert.deepEqual(JSON.parse(ok.stdout.toString()), submit({ table: exampleCsv, simulations: 500, plotWorlds: 2 }));

  const bad = spawnSync(process.execPath, [cli, '-'], { input: '{"predictions": [{"probability": 1, "outcome": true}]}' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr.toString()).error.issues[0].path, 'predictions[0].probability');
});
