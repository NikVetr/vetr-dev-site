import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page @param {string} path */
async function open(page, path) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return errors;
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the index lists every entry with thumbnails and exposes submit', async ({ page }) => {
  const errors = await open(page, './');
  await expect(page.locator('.entry-card')).toHaveCount(3);
  await expect(page.locator('.entry-card .thumb svg')).toHaveCount(3);
  const out = await page.evaluate(() => /** @type {any} */ (window).Intuitions.submit({ entry: 'zscore-outliers', params: { z: 3 } }).params.z);
  expect(out).toBe(3);
  expect(errors).toEqual([]);
});

test('outlier removal: controls, scrubbing and the API drive the figures and table', async ({ page }) => {
  const errors = await open(page, 'zscore-outliers/');
  await expect(page.locator('#density-plot svg')).toBeVisible();
  await expect(page.locator('#table-body tr')).toHaveCount(5);
  await expect(page.locator('#table-body tr').nth(2)).toContainText('5.46%'); // B under pooling at the defaults
  await page.locator('#z-number').fill('3');
  await expect(page.locator('#z-range')).toHaveValue('3');
  await expect(page.locator('#table-body tr').nth(1)).toContainText('0.270%'); // 2Φ(−3)

  // Dragging across the sweep chart sets the swept parameter (mean difference).
  await page.locator('#sweep-plot').scrollIntoViewIfNeeded();
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#sweep-plot svg').boundingBox());
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height * 0.4, { steps: 4 });
  await page.mouse.up();
  expect(Number(await page.locator('#meanDifference-number').inputValue())).toBeLessThan(1);

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const response = app.submit({ entry: 'zscore-outliers', params: { meanDifference: 3, proportionA: 0.9, sweep: 'z' } });
    let error = null;
    try {
      app.submit({ entry: 'zscore-outliers', params: { z: 9 } });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, path: e.issues[0].path };
    }
    return { b: response.result.groups[1].shareOfPooledRemovals > 0.5, request: app.getRequest(), error };
  });
  expect(api.b).toBe(true);
  expect(api.request).toEqual({ entry: 'zscore-outliers', params: { meanDifference: 3, sdRatio: 1, proportionA: 0.9, z: 2.5, sweep: 'z' } });
  expect(api.error).toEqual({ name: 'IntuitionsError', code: 'invalid_request', path: 'params.z' });
  await expect(page.locator('#meanDifference-number')).toHaveValue('3');
  await expect(page.locator('#sweep')).toHaveValue('z');
  expect(errors).toEqual([]);
});

test('threshold model: drag a threshold, sample two traits, fit the table', async ({ page }) => {
  const errors = await open(page, 'threshold-model/');
  await expect(page.locator('#bars-plot svg rect')).toHaveCount(4);
  const handle = page.locator('#liability-plot circle[data-drag="t0"]');
  await handle.scrollIntoViewIfNeeded();
  const at = /** @type {{ x: number, y: number, width: number, height: number }} */ (await handle.boundingBox());
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x - 80, at.y + at.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(Number(await page.locator('#one-t-0').inputValue())).toBeLessThan(0);

  await page.getByRole('tab', { name: 'Two traits' }).click();
  await expect(page.locator('#panel-two')).toBeVisible();
  await expect(page.locator('#table-plot .cell-text')).toHaveCount(16);
  await expect(page.locator('#two-stats')).toContainText('Fitted from 300 individuals');
  await page.locator('#two-rho-number').fill('-0.6');
  await expect(page.locator('#two-stats')).toContainText('−0.60');
  await page.locator('#two-k0').selectOption('2');
  await page.locator('#two-k1').selectOption('2');
  await expect(page.locator('#two-stats')).toContainText('cos-π shortcut');

  await page.getByRole('button', { name: "Fit the sample's table" }).click();
  await expect(page.locator('#panel-fit')).toBeVisible();
  await expect(page.locator('#count-grid input')).toHaveCount(4);
  await expect(page.locator('#fit-stats')).toContainText('Tetrachoric correlation');

  await page.locator('#count-grid input').nth(0).fill('0');
  await page.locator('#count-grid input').nth(1).fill('0');
  await expect(page.locator('#fit-issues')).toContainText('Row 0');
  await expect(page.locator('#fit-result')).toBeHidden();

  const fitted = await page.evaluate(() => /** @type {any} */ (window).Intuitions.submit({ entry: 'threshold-model', params: { table: [[40, 10], [15, 35]] } }).result.fit.rho);
  expect(fitted).toBeCloseTo(0.7127, 4);
  await expect(page.locator('#fit-issues')).toBeHidden();
  await expect(page.locator('#count-grid input').nth(0)).toHaveValue('40');
  expect(errors).toEqual([]);
});

test('correlation geometry: panels respond to controls, rotation, cell choice and the API', async ({ page }) => {
  const errors = await open(page, 'correlation-geometry/');
  await expect(page.locator('#arrows-readout')).toContainText('0.327');
  await page.locator('input[name="arrows-n"][value="2"]').check();
  await expect(page.locator('#arrows-readout')).toContainText('can only be 1 or −1');
  await page.locator('input[name="arrows-n"][value="3"]').check();

  // Rotation by keyboard and by drag both change the drawing; numbers do not change.
  const scene = page.locator('#cone-scene');
  await scene.scrollIntoViewIfNeeded();
  const before = await scene.innerHTML();
  await scene.focus();
  await page.keyboard.press('ArrowRight');
  const turned = await scene.innerHTML();
  expect(turned).not.toBe(before);
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await scene.boundingBox());
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 4 });
  await page.mouse.up();
  expect(await scene.innerHTML()).not.toBe(turned);
  await page.getByRole('button', { name: 'Reset view' }).nth(1).click();
  expect(await scene.innerHTML()).toBe(before);
  await expect(page.locator('#cone-readout')).toContainText('0.80 or −0.80');

  await page.locator('#cos-ab-number').fill('0.3');
  await expect(page.locator('#cosine-forced')).toContainText('Either sign');

  await page.locator('#equi-k-number').fill('4');
  await page.getByRole('button', { name: /Go to the limit/ }).click();
  await expect(page.locator('#equi-r-number')).toHaveValue('-0.33');
  await page.locator('#equi-r-number').fill('-0.5');
  await expect(page.locator('#equi-issue')).toContainText('No 4 arrows');
  await page.getByRole('tab', { name: 'One pair at 0' }).click();
  await expect(page.locator('#zero-plot svg')).toBeVisible();

  // Choose a cell, then make the matrix invalid and valid again.
  await page.locator('#entry-grid input[data-cell="1,2"]').focus();
  await expect(page.locator('#entry-readout')).toContainText('BC');
  await page.locator('#entry-grid input[data-cell="0,1"]').fill('-0.9');
  await expect(page.locator('#entry-issues')).toContainText('not positive semidefinite');
  await expect(page.locator('#entry-result')).toBeHidden();
  await page.locator('#entry-grid input[data-cell="0,1"]').fill('0.7');
  await expect(page.locator('#entry-issues')).toBeHidden();

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const out = app.submit({ entry: 'correlation-geometry', params: { view: 'cosine-rule', rAB: 0.5, rBC: 0.6, rAC: -0.6 } });
    return { interval: out.result.interval, request: app.getRequest().params.view };
  });
  expect(api.interval[0]).toBeCloseTo(0.3 - Math.sqrt(0.75 * 0.64), 12);
  expect(api.request).toBe('cosine-rule');
  await expect(page.locator('#cos-ab-number')).toHaveValue('0.5');
  await expect(page.locator('#cosine-forced')).toContainText('impossible');
  expect(errors).toEqual([]);
});

test('every page and view fits a 390 px phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['./', 'zscore-outliers/', 'correlation-geometry/']) {
    await open(page, path);
    expect(await overflow(page)).toBe(0);
  }
  await open(page, 'threshold-model/');
  for (const tab of ['One trait', 'Two traits', 'From a table']) {
    await page.getByRole('tab', { name: tab }).click();
    expect(await overflow(page), tab).toBe(0);
  }
  await page.locator('#fit-rows').selectOption('6');
  await page.locator('#fit-cols').selectOption('6');
  expect(await overflow(page)).toBe(0);
  await open(page, 'correlation-geometry/');
  await page.locator('#entry-p').selectOption('8');
  await page.getByRole('tab', { name: 'One pair at 0' }).click();
  expect(await overflow(page)).toBe(0);
});
