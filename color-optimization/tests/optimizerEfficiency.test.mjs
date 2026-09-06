import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedCache } from '../core/boundedCache.js';
import { prepareData, objectiveInfo, decodePalette } from '../optimizer/objective.js';
import { optimizePalette } from '../optimizer/optimizePalette.js';
import { coordsFromHexForDistanceMetric } from '../core/distance.js';
import { buildGamutProjectionBoundary, computeGamutExtent } from '../ui/gamutHull.js';
import { csRanges } from '../core/colorSpaces.js';

const config = { colorSpace: 'oklab', gamutPreset: 'srgb', clipToGamutOpt: true,
  cvdModel: 'machado2009', distanceMetric: 'de2000', nColsToAdd: 2,
  constrain: true, widths: [0.65, 0, 0], constraintTopology: 'contiguous',
  constraintMode: { l: 'hard', a: 'hard', b: 'hard' }, colorblindSafe: true,
  colorblindWeights: { none: 0.25, deutan: 0.25, protan: 0.25, tritan: 0.25 },
  nOptimRuns: 4, nmIterations: 30, seed: 42 };

test('bounded cache evicts entries without changing computed values', () => {
  const get = boundedCache(2);
  let calls = 0;
  const compute = () => ++calls;
  assert.equal(get('a', compute), 1);
  assert.equal(get('a', compute), 1);
  get('b', compute); get('c', compute);
  assert.equal(get('a', compute), 4);
});

test('coordinate caching and trajectory-only decoding preserve exact outputs across metrics', () => {
  for (const distanceMetric of ['de2000', 'lab76', 'oklab76', 'cam02ucs', 'cam16ucs', 'deitp']) {
    const prep = prepareData(['#4477AA'], 'oklab', { ...config, distanceMetric });
    const params = [0, 0.2, -0.3, 1, -0.5, 0.4];
    const expected = objectiveInfo(params, prep);
    assert.deepEqual(objectiveInfo(params, prep), expected);
    const decoded = decodePalette(params, prep);
    for (const key of ['newHex', 'newRaw', 'optimizerRaw', 'optimizedRows']) assert.deepEqual(decoded[key], expected[key]);
    prep.coordsForHex = (hex, state) => coordsFromHexForDistanceMetric(hex, distanceMetric, state, prep.cvdModel);
    assert.deepEqual(objectiveInfo(params, prep), expected);
  }
});

test('gamut caches distinguish changed lightness constraints and preserve the full boundary', () => {
  const full = csRanges.oklab;
  const narrow = { min: { ...full.min, l: 0.45 }, max: { ...full.max, l: 0.55 } };
  const boundary = range => buildGamutProjectionBoundary('oklab', 'srgb', range, true, { x: 'a', y: 'b' }, 24, 8);
  const expected = structuredClone(boundary(full));
  assert.notDeepEqual(boundary(narrow), expected);
  narrow.max.l = 0.8;
  assert.notDeepEqual(boundary(narrow), expected);
  assert.deepEqual(boundary(full), expected);
  assert.notDeepEqual(computeGamutExtent('oklab', 'srgb', 1.1, narrow), computeGamutExtent('oklab', 'srgb'));
});

test('concurrent seeded searches do not alter one another', async () => {
  const a = { ...config, seed: 42, searchStrategy: 'hybrid' };
  const b = { ...config, seed: 83, searchStrategy: 'adaptive' };
  const serial = [await optimizePalette(['#4477AA'], a), await optimizePalette(['#4477AA'], b)];
  const concurrent = await Promise.all([optimizePalette(['#4477AA'], a), optimizePalette(['#4477AA'], b)]);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(concurrent[i].newHex, serial[i].newHex);
    assert.deepEqual(concurrent[i].par, serial[i].par);
    assert.equal(concurrent[i].evaluations, serial[i].evaluations);
  }
});

test('hybrid keeps source-anchored tweaks and counts candidate screening against the cap', async () => {
  const events = [];
  const result = await optimizePalette(['#4477AA'], { ...config, clipToGamutOpt: false,
    tweakInputIndices: [0], searchStrategy: 'hybrid', maxEvaluationsPerRun: 100 }, {
    onVerbose: event => events.push(event),
  });
  assert.equal(events.find(e => e.stage === 'start').hex[0], '#4477AA');
  assert.equal(result.optimizedRows[0].inputIndex, 0);
  assert.ok(result.evaluations <= 400);
  assert.equal(result.evaluations, events.filter(e => e.stage === 'end').reduce((n, e) => n + e.evaluations, 0));
});
