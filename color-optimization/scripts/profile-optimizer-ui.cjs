// Usage: node scripts/profile-optimizer-ui.cjs URL /tmp/output.json [BASELINE_APP_ROOT]
const { chromium } = require('@playwright/test');
const { writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { profileModules, replaceOnce } = require('./profile-modules.cjs');

(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const variant of process.argv[4] ? ['baseline', 'current'] : ['current']) {
      for (const runs of [12, 48]) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.addInitScript(() => { window.__uiStudy = { drawCalls: 0, drawMs: 0 }; });
        await profileModules(page, variant === 'baseline' ? process.argv[4] : null, (path, source) => {
          if (path.endsWith('/statusGraph.js')) {
            return replaceOnce(source, 'export function drawStatusMini(', 'function timedDrawStatusMini(') + `
              export function drawStatusMini(...args) { const start = performance.now();
                try { return timedDrawStatusMini(...args); }
                finally { window.__uiStudy.drawCalls++; window.__uiStudy.drawMs += performance.now() - start; } }`;
          }
          if (path === '/main.js') source += `
            window.__uiHooks = { state, equalWeights: () => {
              [ui.wNone,ui.wDeutan,ui.wProtan,ui.wTritan].forEach(el=>el.value='25'); normalizeAndUpdateWeights();
            } };`;
          return source;
        });
        await page.goto(process.argv[2] || 'http://localhost:18081');
        await page.waitForFunction(() => window.__uiHooks && document.querySelector('#panels canvas'));
        await page.fill('#palette-input', '#4477AA, #CC6677');
        await page.uncheck('#bg-enabled');
        await page.fill('#seed-input', '2026');
        await page.fill('#optim-runs', String(runs));
        await page.fill('#nm-iters', '260');
        if (await page.locator('#search-strategy').count()) await page.selectOption('#search-strategy', 'random');
        await page.evaluate(() => {
          window.__uiHooks.equalWeights();
          window.__uiStudy = { drawCalls: 0, drawMs: 0, start: performance.now() };
          document.querySelector('#run-btn').click();
        });
        await page.waitForFunction(() => document.querySelector('#status-state').textContent === 'Finished', null, { timeout: 90000 });
        const data = await page.evaluate(() => ({ drawCalls: window.__uiStudy.drawCalls, drawMs: window.__uiStudy.drawMs,
          elapsedMs: performance.now() - window.__uiStudy.start, score: window.__uiHooks.state.runRanking[0].score,
          hex: window.__uiHooks.state.newColors }));
        results.push({ variant, runs, ...data });
        console.log(JSON.stringify(results.at(-1)));
        await page.close();
      }
    }
    if (process.argv[4]) for (const row of results.filter(r => r.variant === 'current')) {
      const baseline = results.find(r => r.variant === 'baseline' && r.runs === row.runs);
      assert.equal(row.score, baseline.score);
      assert.deepEqual(row.hex, baseline.hex);
    }
    writeFileSync(process.argv[3] || '/tmp/color-optimizer-ui-profile.json', JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
