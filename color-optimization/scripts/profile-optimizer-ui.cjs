// Isolated UI experiment; substitutions affect only this browser session.
// Usage: node scripts/profile-optimizer-ui.cjs URL /tmp/output.json
const assert = require('node:assert/strict');

function replaceOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, `Expected one instrumentation target: ${needle}`);
  return source.replace(needle, replacement);
}
const { chromium } = require('@playwright/test');
const { writeFileSync } = require('node:fs');
(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [variant, runs] of [['baseline', 12], ['batch32', 12], ['baseline', 48], ['batch32', 48]]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.addInitScript(() => { window.__uiStudy = { drawCalls: 0, drawMs: 0, verboseCalls: 0, verboseMs: 0 }; });
      await page.route('**/optimizer/optimizePalette.js', async route => {
        const response = await route.fetch(); const text = await response.text();
        await route.fulfill({ response, body: variant === 'baseline' ? text : replaceOnce(text, 'yieldEvery: 5', 'yieldEvery: 32') });
      });
      await page.route('**/ui/statusGraph.js', async route => {
        const response = await route.fetch(); let text = await response.text();
        text = replaceOnce(text, 'export function drawStatusMini(', 'function timedDrawStatusMini(');
        text += `\nexport function drawStatusMini(...args) { const t=performance.now(); try { return timedDrawStatusMini(...args); } finally { window.__uiStudy.drawCalls++; window.__uiStudy.drawMs+=performance.now()-t; } }`;
        await route.fulfill({ response, body: text });
      });
      await page.route('**/main.js', async route => {
        const response = await route.fetch(); let text = await response.text();
        text = replaceOnce(text, 'function renderVerboseTable(', 'function timedRenderVerboseTable(');
        text += `\nfunction renderVerboseTable(...args) { const t=performance.now(); try {return timedRenderVerboseTable(...args);} finally {window.__uiStudy.verboseCalls++;window.__uiStudy.verboseMs+=performance.now()-t;} }
          window.__uiHooks = { state, equalWeights: () => { [ui.wNone,ui.wDeutan,ui.wProtan,ui.wTritan].forEach(el=>el.value='25');normalizeAndUpdateWeights(); } };`;
        await route.fulfill({ response, body: text });
      });
      await page.goto(process.argv[2] || 'http://localhost:18081');
      await page.waitForFunction(() => window.__uiHooks && document.querySelector('#panels canvas'));
      await page.fill('#palette-input', '#4477AA, #CC6677');
      await page.uncheck('#bg-enabled');
      await page.fill('#seed-input', '2026'); await page.fill('#optim-runs', String(runs));
      await page.fill('#nm-iters', '260');
      await page.evaluate(() => {
        window.__uiHooks.equalWeights();
        window.__uiStudy = { drawCalls: 0, drawMs: 0, verboseCalls: 0, verboseMs: 0, start: performance.now() };
        document.querySelector('#run-btn').click();
      });
      await page.waitForFunction(() => document.querySelector('#status-state').textContent === 'Finished', null, { timeout: 90000 });
      const data = await page.evaluate(() => ({ ...window.__uiStudy, elapsedMs: performance.now()-window.__uiStudy.start,
        score: window.__uiHooks.state.runRanking[0].score }));
      delete data.start;
      results.push({ variant, runs, ...data }); console.log(JSON.stringify(results.at(-1))); await page.close();
    }
    for (const row of results) assert.equal(row.score, results[0].score);
    writeFileSync(process.argv[3] || '/tmp/color-optimizer-ui-profile.json', JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
