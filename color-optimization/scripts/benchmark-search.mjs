// Equal evaluation-cap comparison; use an output path outside the repository.
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { optimizePalette } from '../optimizer/optimizePalette.js';
import { prepareData } from '../optimizer/objective.js';
import { isInGamut, normalizeWithRange } from '../core/colorSpaces.js';
import { normSatisfiesHardConstraints } from '../core/hardConstraints.js';
import { coordsFromHexForDistanceMetric, distanceBetweenCoords } from '../core/distance.js';

const base = { colorSpace: 'oklab', gamutPreset: 'srgb', clipToGamutOpt: true,
  cvdModel: 'machado2009', distanceMetric: 'de2000', meanType: 'harmonic', nColsToAdd: 3,
  nOptimRuns: 8, nmIterations: 1000, maxEvaluationsPerRun: 500, trajectorySteps: 2,
  constrain: true, constraintTopology: 'contiguous', constraintMode: { l: 'hard', a: 'hard', b: 'hard' },
  widths: [0.65, 0, 0], colorblindSafe: true,
  colorblindWeights: { none: 0.25, deutan: 0.25, protan: 0.25, tritan: 0.25 } };
const cases = [
  ['extension', ['#4477AA', '#CC6677'], {}],
  ['empty', [], { nColsToAdd: 4 }],
  ['soft', ['#4477AA', '#CC6677'], { widths: [0.65, 0.25, 0.25], constraintMode: { l: 'soft', a: 'soft', b: 'soft' } }],
  ['tweak', ['#4477AA', '#CC6677'], { tweakInputIndices: [0], nColsToAdd: 2,
    constraintTopology: 'discontiguous', perInputWidths: { l: [0.85, 0], a: [0.85, 0], b: [0.85, 0] },
    perInputModes: ['soft', 'hard'], globalConstraintExcludeInputIndices: [0] }],
  ['disconnected', [], { constraintTopology: 'custom', widths: [0.85, 0.8, 0.8],
    customConstraintPoints: [{ l: 0.55, a: 0.1, b: 0.05 }, { l: 0.7, a: -0.08, b: 0.08 }] }],
  ['polar', ['#4477AA', '#CC6677'], { colorSpace: 'oklch', constraintMode: { l: 'hard', c: 'hard', h: 'hard' }, distanceMetric: 'cam16ucs' }],
];
const rows = [];
const firstSeed = Number(process.argv[3] || 101);
const wallMs = Number(process.argv[4] || 0);
assert.ok(Number.isInteger(firstSeed) && firstSeed >= 0);
assert.ok(Number.isFinite(wallMs) && wallMs >= 0);
for (const [name, palette, overrides] of cases) {
  for (let seed = firstSeed; seed < firstSeed + 20; seed++) {
    // Alternate ordering to reduce systematic warm-up bias.
    for (const searchStrategy of seed % 2 ? ['random', 'adaptive', 'hybrid'] : ['hybrid', 'adaptive', 'random']) {
      const config = { ...base, ...overrides, seed, searchStrategy };
      if (wallMs) config.nOptimRuns = 1000;
      const prep = prepareData(palette, config.colorSpace, config);
      const stops = [];
      const started = performance.now();
      const best = await optimizePalette(palette, config, {
        shouldStop: () => wallMs > 0 && performance.now() - started >= wallMs,
        onVerbose: (event) => {
        if (event.stage === 'end') stops.push(event.reason);
      } });
      const elapsedMs = performance.now() - started;
      assert.ok(best.evaluations <= config.nOptimRuns * config.maxEvaluationsPerRun);
      assert.ok(Number.isFinite(best.value));
      best.newRaw.forEach((raw, i) => {
        assert.ok(isInGamut(raw, config.colorSpace, config.gamutPreset));
        const norm = normalizeWithRange(raw, prep.ranges, config.colorSpace);
        for (const sets of prep.constraintContext.rowConstraintSets[i]) {
          assert.ok(normSatisfiesHardConstraints(norm, sets, sets.topology));
        }
      });
      const paletteHex = [...prep.currHex, ...best.newHex];
      const weakest = Object.fromEntries(prep.cvdStates.map((vision) => {
        const coords = paletteHex.map((hex) => coordsFromHexForDistanceMetric(hex, config.distanceMetric, vision, config.cvdModel));
        let min = Infinity;
        for (let i = 0; i < coords.length; i++) for (let j = i + 1; j < coords.length; j++) {
          min = Math.min(min, distanceBetweenCoords(coords[i], coords[j], config.distanceMetric));
        }
        return [vision, min];
      }));
      rows.push({ name, seed, searchStrategy, score: -best.value, evaluations: best.evaluations,
        elapsedMs, hex: best.newHex, duplicates: paletteHex.length - new Set(paletteHex).size, weakest, stops });
    }
  }
  console.log(`${name}: 20 paired seeds complete`);
}
writeFileSync(process.argv[2] || '/tmp/color-search-benchmark.json', JSON.stringify({
  base, cases, firstSeed, wallMs, node: process.version, rows,
}, null, 2) + '\n');
