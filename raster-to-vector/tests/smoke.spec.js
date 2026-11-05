import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { submit } from '../core/index.js';
import { decodePng } from '../../shared/decode-png.mjs';

const here = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
/** The core's SVG for an example with the page's defaults, computed in Node. @param {string} name @param {object} [options] */
const expectedSvg = (name, options = {}) => {
  const png = decodePng(readFileSync(here(`../examples/${name}`)));
  return submit({ image: { width: png.width, height: png.height, data: png.data }, preprocess: { maxDim: 600 }, ...options }).svg;
};

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Option labels wider than their select (less room for the arrow), which the browser would cut off. @param {import('@playwright/test').Page} page */
const cutOptions = (page) => page.evaluate(() => {
  const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
  return [...document.querySelectorAll('select')].flatMap((select) => {
    ctx.font = getComputedStyle(select).font;
    return [...select.options].filter((o) => ctx.measureText(o.text).width > select.clientWidth - 36).map((o) => o.text);
  });
});
const svgText = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => /** @type {any} */ (window).RasterToVector.exportSvgText());

test('converts the example on load, runs options and uploads, and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#status')).toContainText('Done in');
  await expect(page.locator('#palette li')).toHaveCount(6);
  await expect(page.locator('#output-preview')).toBeVisible();
  expect(await svgText(page)).toBe(expectedSvg('cartoon_flat.png'));
  expect(await cutOptions(page)).toEqual([]);

  // the progress readout names the stages, with each k tried
  await page.evaluate(() => {
    const seen = /** @type {string[]} */ ((/** @type {any} */ (window)).seenStatus = []);
    new MutationObserver(() => seen.push(document.getElementById('status')?.textContent ?? '')).observe(document.getElementById('status') ?? document.body, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('[data-path="trace.method"]').selectOption('original');
  await page.locator('[data-path="smooth.method"]').selectOption('fourier');
  await page.getByRole('button', { name: 'Convert' }).click();
  await expect(page.locator('#status')).toContainText('Done in');
  expect(await svgText(page)).toBe(expectedSvg('cartoon_flat.png', { trace: { method: 'original' }, smooth: { method: 'fourier' } }));
  const seen = await page.evaluate(() => /** @type {any} */ (window).seenStatus);
  expect(seen.some((/** @type {string} */ s) => /^Choosing colours: k = \d+ \(\d+ of 4\)/.test(s))).toBe(true);
  expect(seen).toContain('Tracing outlines…');

  // an invalid option is reported at its field
  await page.getByLabel('Number of colours, k').fill('two');
  await page.getByRole('button', { name: 'Convert' }).click();
  await expect(page.locator('#issues')).toContainText('Number of colours, k: must be');
  await expect(page.getByLabel('Number of colours, k')).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Reset options' }).click();

  // an uploaded PNG with transparency gives the command line's SVG
  await page.locator('#image-file').setInputFiles(here('../examples/logo_holes.png'));
  await expect(page.locator('#image-info')).toContainText('logo_holes.png: 300 × 200 px');
  await expect(page.locator('#status')).toContainText('Done in');
  expect(await svgText(page)).toBe(expectedSvg('logo_holes.png'));
  await expect(page.locator('#palette')).toContainText('transparent, not painted');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('logo_holes.svg');

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).RasterToVector;
    const data = [];
    for (let r = 0; r < 24; r++) for (let c = 0; c < 24; c++) data.push(...(r > 5 && r < 18 && c > 5 && c < 18 ? [200, 30, 30, 255] : [255, 255, 255, 255]));
    const result = await app.submit({ image: { width: 24, height: 24, data }, quantize: { k: 2 }, smooth: { method: 'none' } });
    let error = null;
    try {
      await app.submit({ image: { width: 24, height: 24, data }, quantize: { cores: 2 } });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, issue: e.issues[0].code, path: e.issues[0].path };
    }
    return {
      k: result.k,
      same: result.svg === app.exportSvgText() && result === app.getResult(),
      method: app.getRequest().smooth.method,
      width: app.getRequest().image.width,
      error,
    };
  });
  expect(api).toEqual({ k: 2, same: true, method: 'none', width: 24, error: { name: 'RasterToVectorError', code: 'INVALID_REQUEST', issue: 'NOT_PORTED', path: 'quantize.cores' } });
  await expect(page.locator('#image-info')).toContainText('Given by the API: 24 × 24 px');
  expect(errors).toEqual([]);
});

test('fits a 390 px wide screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator('#status')).toContainText('Done in');
  expect(await overflow(page)).toBe(0);
  expect(await cutOptions(page)).toEqual([]);
  await page.locator('.method-card summary').click();
  await page.getByLabel('Number of colours, k').fill('two');
  await page.getByRole('button', { name: 'Convert' }).click();
  await expect(page.locator('#issues')).toBeVisible();
  expect(await overflow(page)).toBe(0);
  const box = await page.locator('#output-preview').boundingBox();
  expect(box && box.width <= 390).toBe(true);
});
