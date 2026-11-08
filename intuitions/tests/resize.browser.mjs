// From the repository root:
// node --test intuitions/tests/resize.browser.mjs
// PLAYWRIGHT="$PWD/ceo-salary-benchmark/node_modules/playwright" BROWSER_ENGINE=webkit node --test intuitions/tests/resize.browser.mjs
// PLAYWRIGHT selects an installed package matching the available browser build.
import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const selectedEngine = process.env.BROWSER_ENGINE ?? 'chromium';
if (!['chromium', 'webkit', 'firefox'].includes(selectedEngine)) throw new Error(`Unsupported browser engine: ${selectedEngine}`);
const engine = /** @type {'chromium' | 'webkit' | 'firefox'} */ (selectedEngine);

test(`responsive teaching figures settle without observer errors in ${engine}`, async () => {
  const app = await openPage('intuitions/probability-puzzles/', { engine });
  const { page } = app;
  try {
    await page.locator('#kruskal-deal svg').waitFor();
    await page.evaluate(() => {
      const state = { mutations: 0 };
      /** @type {any} */ (window).resizeAudit = state;
      for (const id of ['kruskal-deal', 'secretary-applicants', 'prisoners-boxes', 'coins-trials']) {
        const element = document.getElementById(id);
        if (!element) throw new Error(`Missing figure ${id}`);
        new MutationObserver(() => { state.mutations++; }).observe(element, { childList: true });
      }
    });
    const snapshot = () => page.evaluate(() => ({
      mutations: /** @type {any} */ (window).resizeAudit.mutations,
      overflow: document.documentElement.scrollWidth - innerWidth,
      plots: ['kruskal-deal', 'secretary-applicants', 'prisoners-boxes', 'coins-trials'].map(id => {
        const element = /** @type {HTMLElement} */ (document.getElementById(id));
        const svg = element.querySelector('svg');
        return { id, width: element.clientWidth, height: element.clientHeight, viewBox: svg?.getAttribute('viewBox'), svgWidth: svg?.getBoundingClientRect().width };
      }),
    }));
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      // Allow layout and SVG redraw to settle, then verify no continuing render loop.
      await page.waitForTimeout(300);
      const first = await snapshot();
      await page.waitForTimeout(300);
      assert.deepEqual(await snapshot(), first, `Figures kept changing at ${viewport.width} × ${viewport.height}`);
      assert.equal(first.overflow, 0);
      for (const plot of first.plots) {
        assert.ok(plot.width > 0 && plot.height > 0 && plot.viewBox, `${plot.id} is missing`);
        assert.ok(Math.abs(/** @type {number} */ (plot.svgWidth) - plot.width) <= 1, `${plot.id} does not fit its measured width`);
      }
    }
    // The resize timing fix must leave the existing focus jump usable.
    await page.getByRole('link', { name: 'Figure ↓' }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'kruskal-deal');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'kruskal-play');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
