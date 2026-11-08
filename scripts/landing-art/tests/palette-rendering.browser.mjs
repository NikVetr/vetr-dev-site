// Render the shipped SVG with the landing stylesheet, including <use> shadow trees.
// Numeric PNG tests cannot catch an opaque outline covering a correct color field.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodePng } from '../../../shared/decode-png.mjs';
import { openPage } from '../browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
const svg = readFileSync(new URL('../../../assets/cards/color-optimization.svg', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../style.css', import.meta.url), 'utf8');

test(`Palette's field remains visible through optimization and CVD views in ${engine}`, async () => {
  const browser = await openPage('about:blank', { engine });
  const { page } = browser;
  try {
    await page.setContent(`<style>${css}</style><div class="card-art" data-art="color-optimization" style="width:100%;height:360px;max-width:640px">${svg}</div>`);
    const art = page.locator('[data-art="color-optimization"]');
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 500 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((/** @type {string} */ value) => { document.documentElement.dataset.theme = value; }, theme);
        /** @type {string[]} */ const fields = [];
        for (const time of [0, 3000, 8000, 11500, 12700, 13900]) {
          await art.evaluate((/** @type {Element} */ el, /** @type {number} */ at) => {
            el.toggleAttribute('data-started', at > 0);
            for (const animation of el.getAnimations({ subtree: true })) animation.currentTime = at;
          }, time);
          const clip = await art.locator(':scope > svg').evaluate((/** @type {SVGSVGElement} */ el) => {
            const matrix = el.getScreenCTM();
            if (!matrix) throw new Error('Missing SVG screen transform');
            const a = new DOMPoint(232, 74).matrixTransform(matrix), b = new DOMPoint(284, 111).matrixTransform(matrix);
            return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
          });
          const png = await page.screenshot({ clip });
          const { data, width: w, height: h } = decodePng(png);
          let colored = 0;
          for (let i = 0; i < data.length; i += 4) {
            const rgb = [data[i], data[i + 1], data[i + 2]];
            if (Math.max(...rgb) > 80 && Math.max(...rgb) - Math.min(...rgb) > 25) colored++;
          }
          assert.ok(colored / (w * h) > .65, `${engine} ${theme} ${width}px at ${time}ms: color field is covered or missing (${colored}/${w*h} colored pixels)`);
          if (time >= 11500) fields.push(png.toString('base64'));
        }
        assert.equal(new Set(fields).size, 3, 'each CVD mode changes the rendered colorspace');
      }
    }
    assert.deepEqual(browser.errors, []);
  } finally { await browser.close(); }
});
