import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('makes the example mosaic on load, as R does, and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#photo-count')).toHaveText('442 photos');
  await expect(page.locator('#grid-note')).toHaveText('25 columns × 17 rows = 425 cells for 442 photos (17 left out).');
  await expect(page.locator('#summary')).toContainText('425 of 442, each once');
  await expect(page.locator('#stale')).toBeHidden();
  await expect(page.locator('#contact-key')).toBeVisible();

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).Photomosaic;
    const result = app.getResult();
    const request = app.getRequest();
    const lab = await app.submit({ ...request, metric: 'lab' });
    const png = await app.exportPngBlob({ tileWidth: 8 });
    let error = null;
    try {
      await app.submit({ ...request, columns: 100, colour: 'red' });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, paths: e.issues.map((/** @type {any} */ i) => i.path) };
    }
    return {
      total: result.cost.total, cells: result.assignment.length, unique: new Set(result.assignment).size,
      labMetric: lab.settings.metric, onView: app.getResult() === result,
      png: [png.type, png.size > 10000], error,
    };
  });
  // R's total for this example (imgdir2grid.R, set.seed(1)), whose photos Chromium decodes as R's libjpeg does
  expect(Math.abs(api.total - 638773.948078802)).toBeLessThan(1e-6);
  expect(api).toMatchObject({ cells: 425, unique: 425, labMetric: 'lab', onView: true, png: ['image/png', true] });
  expect(api.error).toEqual({ name: 'PhotomosaicError', code: 'invalid_request', paths: ['colour'] });
  expect(errors).toEqual([]);
});

test('selects cells by pointer and keys, redraws with display options, flags stale and bad settings', async ({ page }) => {
  await open(page);
  const mosaic = page.locator('#mosaic');
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await mosaic.boundingBox());
  await mosaic.click({ position: { x: box.width - 2, y: box.height - 2 } });
  await expect(page.locator('#detail-caption')).toContainText('Row 17, column 25:');
  await mosaic.press('ArrowUp');
  await mosaic.press('ArrowLeft');
  await expect(page.locator('#detail-caption')).toContainText('Row 16, column 24:');

  await page.locator('#tint').fill('40');
  await expect(page.locator('#tint-value')).toHaveText('40%');
  await page.locator('#fit').selectOption('crop');
  await expect(page.locator('#stale')).toBeHidden(); // display options do not change the match

  await page.locator('#metric').selectOption('lab');
  await expect(page.locator('#stale')).toHaveText(/Out of date: the matching settings changed/);
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#stale')).toBeHidden();
  await expect(page.locator('#summary')).toContainText('CIELAB');

  await page.locator('#grid-rule').selectOption('columns');
  await page.locator('#columns').fill('60');
  await expect(page.locator('#grid-note')).toContainText('more than 442 photos');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#run-issues')).toContainText('Columns: a 60 × 40 grid has 2400 cells');
  await expect(page.locator('#columns')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#stale')).toContainText('the last run failed');
  await page.locator('#max-uses').fill('6');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#summary')).toContainText('each at most 6 times');
  await expect(page.locator('#columns')).not.toHaveAttribute('aria-invalid', 'true');
});

test('reads chosen photos and target, and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const photos = readdirSync(`${FIXTURES}photos`).map((f) => `${FIXTURES}photos/${f}`);
  await page.locator('#photo-files').setInputFiles(photos);
  await expect(page.locator('#photo-count')).toHaveText('36 photos');
  await page.locator('#target-file').setInputFiles(`${FIXTURES}target-wide.png`);
  await expect(page.locator('#target-status')).toContainText('target-wide.png: 48 × 38 pixels');
  await expect(page.locator('#stale')).toContainText('the photos and target changed');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#summary')).toContainText('6 columns × 5 rows = 30 cells');
  // the fixture's R total (tests/fixtures/r-parity.json, seed 1): PNGs decode the same everywhere
  const total = await page.evaluate(() => /** @type {any} */ (window).Photomosaic.getResult().cost.total);
  const fromR = JSON.parse(readFileSync(`${FIXTURES}r-parity.json`, 'utf8')).runs[0].total;
  expect(Math.abs(total - fromR)).toBeLessThan(1e-6 * fromR);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
