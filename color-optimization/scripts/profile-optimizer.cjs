// Usage: node scripts/profile-optimizer.cjs URL /tmp/output.json [BASELINE_APP_ROOT]
const { chromium } = require('@playwright/test');
const { writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { profileModules, replaceOnce } = require('./profile-modules.cjs');

(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const variant of process.argv[4] ? ['baseline', 'current'] : ['current']) {
      const page = await browser.newPage();
      await page.addInitScript(() => { window.__solverCalls = 0; });
      await profileModules(page, variant === 'baseline' ? process.argv[4] : null, (path, source) => {
        if (!path.endsWith('/nelderMead.js')) return source;
        return replaceOnce(source, 'export async function nelderMeadAsync(', 'async function measuredNelderMead(') + `
          export function nelderMeadAsync(fn, start, opts) {
            return measuredNelderMead(p => { window.__solverCalls++; return fn(p); }, start, opts);
          }`;
      });
      await page.goto(process.argv[2] || 'http://localhost:18081');
      await page.waitForSelector('#panels canvas');
      const rows = await page.evaluate(async (variant) => {
        const { optimizePalette } = await import('./optimizer/optimizePalette.js');
        const config = { colorSpace: 'oklab', gamutPreset: 'srgb', clipToGamutOpt: true,
          cvdModel: 'machado2009', distanceMetric: 'de2000', meanType: 'harmonic', nColsToAdd: 3,
          nOptimRuns: 12, nmIterations: 260, trajectorySteps: 48, searchStrategy: 'random',
          constrain: true, constraintTopology: 'contiguous', constraintMode: { l: 'hard', a: 'hard', b: 'hard' },
          widths: [0.65, 0, 0], colorblindSafe: true,
          colorblindWeights: { none: 0.25, deutan: 0.25, protan: 0.25, tritan: 0.25 } };
        await optimizePalette(['#4477AA', '#CC6677'], { ...config, nOptimRuns: 1, nmIterations: 30, seed: 1 });
        const rows = [];
        for (const seed of [45, 2026, 910]) {
          window.__solverCalls = 0;
          const restarts = [];
          const start = performance.now();
          const best = await optimizePalette(['#4477AA', '#CC6677'], { ...config, seed }, {
            onVerbose: event => { if (event.stage === 'end') restarts.push(event.score); },
            onProgress: () => {},
          });
          rows.push({ variant, seed, elapsedMs: performance.now() - start, score: -best.value,
            hex: best.newHex, evaluations: window.__solverCalls, restarts });
        }
        return rows;
      }, variant);
      results.push(...rows);
      console.log(JSON.stringify(rows));
      await page.close();
    }
    if (process.argv[4]) for (const row of results.filter(r => r.variant === 'current')) {
      const baseline = results.find(r => r.variant === 'baseline' && r.seed === row.seed);
      for (const key of ['score', 'hex', 'evaluations', 'restarts']) assert.deepEqual(row[key], baseline[key]);
    }
    writeFileSync(process.argv[3] || '/tmp/color-optimizer-profile.json', JSON.stringify({
      browser: browser.version(), note: 'Engine with trajectories and diagnostics; classic random starts. Optional archived baseline modules.', results,
    }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
