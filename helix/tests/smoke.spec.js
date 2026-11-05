import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('draws the helix on load, follows the controls and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#preview svg g')).toHaveCount(3); // strand 1, strand 2, base pairs
  await expect(page.locator('#summary')).toHaveText('Helix, 2.5 turns, 26 base pairs, 13.73 × 101 mm.');

  // a slider and its number box move together, and the drawing follows
  await page.locator('input[type="number"][data-path="helix.turns"]').fill('4');
  await expect(page.locator('input[type="range"][data-path="helix.turns"]')).toHaveValue('4');
  await expect(page.locator('#summary')).toContainText('Helix, 4 turns, 41 base pairs');
  await page.locator('label:has(input[name="style"][value="outline"])').click();
  await expect(page.locator('#preview svg path')).toHaveCount(1);
  await expect(page.locator('#preview svg path')).toHaveAttribute('fill', 'none');

  // a preset sets the helix settings
  await page.getByRole('button', { name: 'Ladder end' }).click();
  await expect(page.locator('select[data-path="helix.extension.strands"]')).toHaveValue('both');
  await expect(page.locator('input[type="number"][data-path="helix.rotation"]')).toHaveValue('135');

  for (const [button, name] of [['SVG', 'helix.svg'], ['Outline SVG (laser)', 'helix-outline.svg'], ['Strokes SVG (plotter)', 'helix-strokes.svg'], ['PNG', 'helix.png'], ['Request JSON', 'helix-request.json']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    expect((await download).suggestedFilename()).toBe(name);
  }

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).Helix;
    const shown = app.load({ mode: 'braid', braid: { colors: ['#000', '#f00'], twists: 3 } });
    let error = null;
    try {
      app.load({ mode: 'braid', braid: { twists: 'many', colour: 1 } });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, paths: e.issues.map((/** @type {any} */ i) => i.path) };
    }
    const png = await app.exportPngBlob({ width: 300, background: '#ffffff' });
    return {
      crossings: shown.geometry.crossings.length,
      same: JSON.stringify(shown) === JSON.stringify(app.getResult()),
      request: app.getRequest().braid.colors,
      svg: app.exportSvgText('strokes').includes('stroke-linecap="round"'),
      png: [png.type, png.size > 1000],
      error,
    };
  });
  expect(api).toEqual({
    crossings: 5, same: true, request: ['#000000', '#ff0000'], svg: true, png: ['image/png', true],
    error: { name: 'HelixError', code: 'invalid_request', paths: ['braid.colour', 'braid.twists'] },
  });
  // the rejected request left the page showing the braid it loaded
  await expect(page.locator('#braid-colours input')).toHaveCount(2);
  await expect(page.locator('section[data-mode="helix"]').first()).toBeHidden();
  expect(errors).toEqual([]);
});

test('braid: strands and colours, and a problem marks its field and keeps the last drawing', async ({ page }) => {
  await open(page);
  await page.locator('label:has(input[name="mode"][value="braid"])').click();
  await expect(page.locator('#summary')).toHaveText('Braid of 3 strands, 2 twists, 12 crossings, 101.7 × 10.1 mm.');
  await page.locator('#strand-count').fill('5');
  await expect(page.locator('#braid-colours input')).toHaveCount(5);
  await expect(page.locator('#preview svg g')).toHaveCount(5);

  await page.locator('input[type="number"][data-path="braid.width"]').fill('0');
  await expect(page.locator('#issues li')).toHaveText(['Width: must be more than 0 and at most 1000000']);
  await expect(page.locator('input[type="number"][data-path="braid.width"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#stale')).toBeVisible();
  await expect(page.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled();
  await expect(page.locator('#preview svg g')).toHaveCount(5);

  await page.locator('input[type="number"][data-path="braid.width"]').fill('20');
  await expect(page.locator('#issues')).toBeHidden();
  await expect(page.locator('#stale')).toBeHidden();
  await expect(page.locator('input[type="number"][data-path="braid.width"]')).not.toHaveAttribute('aria-invalid', 'true');
});

test('fits a phone screen without sideways scrolling, the drawing before the settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.locator('.method-card summary').click();
  await page.locator('label:has(input[name="mode"][value="braid"])').click();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const drawing = await page.locator('#preview').boundingBox();
  const settings = await page.locator('#braid-heading').boundingBox();
  expect(drawing && settings && drawing.width <= 390 && drawing.y < settings.y).toBe(true);
});
