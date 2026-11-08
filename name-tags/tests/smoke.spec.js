import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const logo = new URL('./fixtures/test_logo.svg', import.meta.url).pathname;

test('fits the example on load and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#name-count')).toHaveText('12 names');
  await expect(page.locator('#status')).toContainText('Done in');
  await expect(page.locator('#preview svg path')).toHaveCount(12 + 146 + 39); // balanced preset: cell outlines, glyphs, helix pieces
  await expect(page.locator('#downloads button')).toHaveText(['Sheet SVG']);
  const download = page.waitForEvent('download');
  await page.locator('#downloads button').click();
  expect((await download).suggestedFilename()).toBe('nametags_names_grid_1.svg');

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).NameTags;
    const result = await app.submit({ names: ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'], decoration: 'none', tray: { page_in: [6, 3], grid: [2, 1], cell_in: [2.19, 1.22], spacing_in: [0.3, 0], first_center_in: [1.5, 1.5] } });
    let error = null;
    try {
      await app.submit({ names: ['a|b|c'], colour: 1 });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, paths: e.issues.map((/** @type {any} */ i) => i.path) };
    }
    return {
      sheets: result.sheets.map((/** @type {any} */ s) => s.file),
      same: JSON.stringify(result) === JSON.stringify(app.getResult()),
      svg: app.exportSvgText(2).slice(0, 5),
      request: app.getRequest().tray.grid,
      error,
    };
  });
  expect(api).toEqual({
    sheets: ['nametags_names_grid_1.svg', 'nametags_names_grid_2.svg'], same: true, svg: '<?xml', request: [2, 1],
    error: { name: 'NameTagsError', code: 'invalid_request', paths: ['colour', 'names[0]'] },
  });
  // The rejected request left the page showing the accepted one, with a choice of sheets.
  await expect(page.locator('#sheet-options input')).toHaveCount(2);
  await expect(page.locator('#downloads button')).toHaveText(['Sheet 1 SVG', 'Sheet 2 SVG']);
  await expect(page.locator('#tray-choice')).toHaveValue('custom');
  expect(errors).toEqual([]);
});

test('runs the other decorations and reports invalid input', async ({ page }) => {
  await open(page);
  await page.locator('#names').fill('Ada Lovelace\nAlan Turing');
  await page.locator('#decoration').selectOption('hershey_ekg');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('Done in');
  await expect(page.locator('#preview svg path')).not.toHaveCount(2);

  await page.locator('#decoration').selectOption('logo');
  await page.locator('#logo-file').setInputFiles(logo);
  await expect(page.locator('#logo-status')).toHaveText('Logo loaded: test_logo.svg (image/svg+xml).');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('Done in');
  await expect(page.locator('#preview svg path')).toHaveCount(2 + 4);
  await expect(page.locator('#downloads button')).toHaveText(['Sheet SVG']);

  await page.locator('#decoration').selectOption('none');
  await page.locator('#tray-choice').selectOption('custom');
  await page.locator('#tray-file').setInputFiles(new URL('../examples/tray-4x3.json', import.meta.url).pathname);
  await expect(page.locator('#tray-summary')).toContainText('tray-4x3.json: 12 cells');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('Done in');
  await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', '0 0 1152 576');

  await page.locator('#decoration').selectOption('dna');
  await page.locator('#names').fill('Ada Lovelace\nMary|Ann|Evans');
  await page.locator('#generate').click();
  await expect(page.locator('#issues li')).toHaveText(['Name 2 (line 2): use exactly one "|" between two non-empty lines: "Mary|Ann|Evans"']);
  await expect(page.locator('#names')).toHaveAttribute('aria-invalid', 'true');
});

test('marks the sheets out of date after an edit or a failed run, and their downloads too', async ({ page }) => {
  await open(page);
  await expect(page.locator('#stale')).toBeHidden();
  await page.locator('#names').fill('Changed Name');
  await expect(page.locator('#stale')).toHaveText('Out of date: the names changed since these sheets were made; press Generate to update them.');
  await expect(page.locator('#result')).toHaveAttribute('data-stale', '');
  await expect(page.locator('#downloads button')).toHaveText(['⚠ Out-of-date sheet SVG']);
  await page.locator('#restarts').fill('0');
  await expect(page.locator('#stale')).toContainText('the names and design changed');
  await page.locator('#generate').click();
  await expect(page.locator('#stale')).toContainText('the last run failed');
  await expect(page.locator('#issues li')).toHaveText(['Optimizer restarts per tag: must be an integer from 1 to 1000']);
  await expect(page.locator('#restarts')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#restarts')).toHaveAttribute('aria-describedby', 'issues');
  await page.locator('#restarts').fill('20');
  await page.locator('#generate').click();
  await expect(page.locator('#stale')).toBeHidden();
  await expect(page.locator('#restarts')).not.toHaveAttribute('aria-invalid');
  await expect(page.locator('#downloads button')).toHaveText(['Sheet SVG']);
  await expect(page.locator('#export-request')).toHaveText('Request JSON');
});

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.locator('.overlay summary').click();
  await page.locator('.method-card summary').click();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const preview = await page.locator('#preview').boundingBox();
  expect(preview && preview.width <= 390).toBe(true);
});

test('Clear and Load example offer the names back', async ({ page }) => {
  await open(page);
  await page.locator('#names').fill('My own\nnames here');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#undo-note')).toContainText('Cleared 2 names.');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#names')).toHaveValue('My own\nnames here');
  await expect(page.locator('#undo-note')).toBeHidden();
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#undo-note')).toContainText('Replaced your 2 names with the example.');
  await page.locator('#names').fill('An edit');
  await expect(page.locator('#undo-note')).toBeHidden();
});


test('balanced default and original proportions round-trip through the request and preset control', async ({ page }) => {
  await open(page);
  await expect(page.locator('#line-layout')).toHaveValue('balanced');
  const first = await page.evaluate(() => /** @type {any} */ (window).NameTags.getRequest());
  expect(first.style.degree_name_overlap).toBe(0.8);
  await page.locator('#line-layout').selectOption('original');
  await expect(page.locator('#stale')).toBeVisible();
  await page.locator('#generate').click();
  await expect(page.locator('#stale')).toBeHidden();
  await expect(page.locator('#preview svg path')).toHaveCount(203);
  const original = await page.evaluate(() => /** @type {any} */ (window).NameTags.exportSvgText());
  await page.evaluate(async request => { await /** @type {any} */ (window).NameTags.submit(request); }, first);
  await expect(page.locator('#line-layout')).toHaveValue('balanced');
  expect(await page.evaluate(() => /** @type {any} */ (window).NameTags.exportSvgText())).not.toBe(original);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
