import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

test('loads the example, plots it and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#rows tr')).toHaveCount(48);
  await expect(page.locator('#plot svg polyline')).toHaveCount(2001); // 2,000 worlds + observed
  await expect(page.locator('#bins tr')).toHaveCount(9);
  await expect(page.locator('#scores > div')).toHaveCount(3);
  await expect(page.locator('#bins .position.above')).toContainText('▲\u00a0above');

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).ForecastCalibration;
    const result = app.submit({
      predictions: [{ text: 'A', probability: 0.8, outcome: true }, { probability: 0.8, outcome: false }, { probability: 0.3, outcome: false }],
      simulations: 5000, plotWorlds: 100, seed: 4,
    });
    const png = await app.exportPngBlob();
    let error = null;
    try {
      app.submit({ predictions: [{ probability: 1, outcome: true }] });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, path: e.issues[0].path };
    }
    return {
      bins: result.bins.length,
      same: JSON.stringify(result) === JSON.stringify(app.getResult()),
      svg: app.exportSvgText().slice(0, 4),
      png: [png.type, png.size > 10000],
      error,
    };
  });
  expect(api).toEqual({ bins: 2, same: true, svg: '<svg', png: ['image/png', true], error: { name: 'ForecastCalibrationError', code: 'invalid_request', path: 'predictions[0].probability' } });
  // The rejected request left the page showing the accepted one.
  await expect(page.locator('#rows tr')).toHaveCount(3);
  await expect(page.locator('#plot svg polyline')).toHaveCount(101);
  expect(errors).toEqual([]);
});

test('flags a bad row with a glyph and a message, and recovers', async ({ page }) => {
  await open(page);
  const probability = page.getByLabel('Probability 2', { exact: true });
  await probability.fill('100%');
  await expect(page.locator('#issues')).toContainText('Row 2: probability is exactly 1');
  await expect(page.locator('#rows tr').nth(1)).toHaveClass(/has-issue/);
  await expect(probability).toHaveAttribute('aria-invalid', 'true');
  // The last complete result stays on view, marked out of date.
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result')).toHaveAttribute('data-stale', '');
  await expect(page.locator('#stale')).toContainText('Out of date: a problem in the table or settings');
  await probability.fill('95%');
  await expect(page.locator('#issues')).toBeHidden();
  await expect(page.locator('#stale')).toBeHidden();
  await expect(page.locator('#result')).not.toHaveAttribute('data-stale');
});

test('Clear and Load example offer the replaced table back', async ({ page }) => {
  await open(page);
  await page.getByLabel('Prediction 1', { exact: true }).fill('My own prediction');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#undo-note')).toContainText('Cleared 48 predictions.');
  await expect(page.locator('#issues')).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Prediction 1', { exact: true })).toHaveValue('My own prediction');
  await expect(page.locator('#undo-note')).toBeHidden();
});

test('fits a 390 px phone without horizontal scrolling, dialog included', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBe(0);
  await page.getByRole('button', { name: 'Paste or edit as CSV/TSV…' }).click();
  const dialog = page.locator('#table-dialog');
  await expect(dialog.getByRole('heading', { name: 'Paste or edit as CSV/TSV' })).toBeVisible();
  await expect(page.locator('#table-text')).toHaveValue(/^text,probability,outcome\n/);
  await page.locator('#table-text').fill('probability\toutcome\n0.6\tyes\n0.6\tno\n0.9\tyes\n');
  await page.getByRole('button', { name: 'Replace table' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#rows tr')).toHaveCount(3);
  expect(await overflow()).toBe(0);
});
