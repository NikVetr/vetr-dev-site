// Isolated browser experiments; route substitutions never modify the shipped optimizer.
// Usage: node scripts/profile-optimizer.cjs URL /tmp/output.json
const { chromium } = require('@playwright/test');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

function replaceOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, `Expected one instrumentation target: ${needle}`);
  return source.replace(needle, replacement);
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const variant of ['baseline', 'batch32', 'batch32-cache']) {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        window.__study = { evaluations: 0, palettes: new Set(), coordinateCalls: 0, coordinateMisses: 0, stops: [] };
      });
      await page.route('**/optimizer/nelderMead.js', async (route) => {
        const response = await route.fetch();
        let source = replaceOnce(await response.text(), 'export async function nelderMeadAsync(', 'async function measuredNelderMead(');
        source += `\nexport async function nelderMeadAsync(...args) {
          const result = await measuredNelderMead(...args);
          window.__study.stops.push({ reason: result.reason, iterations: result.trace?.length });
          return result;
        }`;
        await route.fulfill({ response, body: source });
      });
      await page.route('**/optimizer/optimizePalette.js', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        await route.fulfill({ response, body: variant === 'baseline' ? source : replaceOnce(source, 'yieldEvery: 5', 'yieldEvery: 32') });
      });
      await page.route('**/optimizer/objective.js', async (route) => {
        const response = await route.fetch();
        let source = await response.text();
        source = replaceOnce(source, 'const newHex = rawHex;', `const newHex = rawHex;
          window.__study.evaluations++; window.__study.palettes.add(newHex.join(','));`);
        await route.fulfill({ response, body: source });
      });
      await page.route('**/core/distance.js', async (route) => {
        const response = await route.fetch();
        let source = await response.text();
        source = replaceOnce(source, 'export function coordsFromHexForDistanceMetric(', 'function uncachedCoords(');
        source += `
          const coordinateCache = new Map();
          window.__clearCoordinateCache = () => coordinateCache.clear();
          export function coordsFromHexForDistanceMetric(...args) {
            window.__study.coordinateCalls++;
            const key = args.join('|');
            ${variant === 'batch32-cache' ? 'if (coordinateCache.has(key)) return coordinateCache.get(key);' : ''}
            window.__study.coordinateMisses++;
            const value = uncachedCoords(...args);
            ${variant === 'batch32-cache' ? 'if (coordinateCache.size >= 20000) coordinateCache.clear(); coordinateCache.set(key, value);' : ''}
            return value;
          }`;
        await route.fulfill({ response, body: source });
      });
      await page.goto(process.argv[2] || 'http://localhost:18081');
      await page.waitForSelector('#panels canvas');
      const rows = await page.evaluate(async (variant) => {
        const { optimizePalette } = await import('./optimizer/optimizePalette.js');
        const config = { colorSpace: 'oklab', gamutPreset: 'srgb', clipToGamutOpt: true,
          cvdModel: 'machado2009', distanceMetric: 'de2000', meanType: 'harmonic', nColsToAdd: 3,
          nOptimRuns: 12, nmIterations: 260, trajectorySteps: 48, constrain: true,
          constraintTopology: 'contiguous', constraintMode: { l: 'hard', a: 'hard', b: 'hard' },
          widths: [0.65, 0, 0], colorblindSafe: true,
          colorblindWeights: { none: 0.25, deutan: 0.25, protan: 0.25, tritan: 0.25 } };
        const rows = [];
        // Warm-up reduces the influence of first-use compilation on the measured trials.
        await optimizePalette(['#4477AA', '#CC6677'], { ...config, nOptimRuns: 1, nmIterations: 30, seed: 1 });
        for (const seed of [45, 2026, 910]) {
          window.__clearCoordinateCache();
          const study = window.__study;
          Object.assign(study, { evaluations: 0, palettes: new Set(), coordinateCalls: 0, coordinateMisses: 0, stops: [] });
          const restarts = [];
          const start = performance.now();
          const best = await optimizePalette(['#4477AA', '#CC6677'], { ...config, seed }, {
            onVerbose: (event) => { if (event.stage === 'end') restarts.push(event.score); },
          });
          rows.push({ variant, seed, elapsedMs: performance.now() - start, score: -best.value, hex: best.newHex,
            evaluations: study.evaluations, distinctPalettes: study.palettes.size,
            coordinateCalls: study.coordinateCalls, coordinateMisses: study.coordinateMisses, restarts, stops: study.stops });
        }
        return rows;
      }, variant);
      results.push(...rows);
      console.log(JSON.stringify(rows));
      await page.close();
    }
    for (const row of results.filter((row) => row.variant !== 'baseline')) {
      const baseline = results.find((base) => base.variant === 'baseline' && base.seed === row.seed);
      for (const key of ['score', 'hex', 'evaluations', 'restarts', 'stops']) assert.deepEqual(row[key], baseline[key]);
    }
    writeFileSync(process.argv[3] || resolve('/tmp/color-optimizer-profile.json'), JSON.stringify({
      browser: browser.version(), note: 'Headless Chromium, engine calls without app rendering; same seeds and evaluation path. Route instrumentation adds overhead.', results,
    }, null, 2) + '\n');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
