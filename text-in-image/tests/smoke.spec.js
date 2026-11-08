import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

test('renders the example and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#fit-status')).toHaveText('✓ 11,224 of 11,224 characters placed.');
  await expect(page.locator('#whole-words')).toBeChecked();
  const whole = await page.evaluate(() => {
    const result = /** @type {any} */ (window).TextInImage.getResult();
    let previous = null;
    for (const g of result.glyphs) {
      if (!g.char.trim()) { previous = null; continue; }
      if (previous && (g.line !== previous.line || g.block !== previous.block)) return false;
      previous = g;
    }
    return result.complete && result.settings.layout.wrap === 'word';
  });
  expect(whole).toBe(true);
  await expect(page.locator('#palette li')).toHaveCount(15);
  await expect(page.locator('#output')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#image-info')).toHaveText('alice-drink-me.png, 295 × 540 px');

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).TextInImage;
    const image = await app.decodeImage('examples/alice-drink-me.png');
    const result = await app.submit({ image, text: 'Alice was beginning to get very tired.', layout: { rotation: 10, n_rounds: 3 } });
    const png = await app.exportPngBlob();
    /** @param {unknown} request */
    const rejection = async (request) => {
      try {
        await app.submit(request);
        return null;
      } catch (/** @type {any} */ e) {
        return { name: e.name, code: e.code, issues: e.issues.map((/** @type {any} */ i) => `${i.code} ${i.path}`) };
      }
    };
    return {
      glyphs: result.glyphs.length,
      same: JSON.stringify(result) === JSON.stringify(app.getResult()),
      request: app.getRequest().layout.rotation,
      svg: app.exportSvgText().slice(0, 4),
      png: [png.type, png.size > 10000],
      invalid: await rejection({ image, text: 'a', layout: { rotaton: 5 } }),
      rOnly: await rejection({ image, text: 'a', quantize: { method: 'tsne_kde_kmeans' } }),
    };
  });
  expect(api).toEqual({
    glyphs: 38, same: true, request: 10, svg: '<svg', png: ['image/png', true],
    invalid: { name: 'TextInImageError', code: 'invalid_request', issues: ['unknown_field layout.rotaton'] },
    rOnly: { name: 'TextInImageError', code: 'invalid_request', issues: ['r_only quantize.method'] },
  });
  // The rejected requests left the page showing the accepted one.
  await expect(page.locator('#whole-words')).not.toBeChecked(); // API omission preserves character-mode defaults.
  await expect(page.locator('#rotation')).toHaveValue('10');
  await expect(page.locator('#text')).toHaveValue('Alice was beginning to get very tired.');
  await expect(page.locator('#issues')).toBeHidden();
  expect(errors).toEqual([]);
});

test('shows every problem with a setting, and recovers', async ({ page }) => {
  await open(page);
  await page.locator('#advanced-settings summary').click();
  await page.getByLabel('Number of colours').fill('0');
  await page.getByLabel('Size rounds').fill('');
  await page.getByRole('button', { name: 'Render' }).click();
  await expect(page.locator('#issues li')).toHaveText(['Number of colours: must be an integer from 1 to 256', 'Size rounds: must be an integer from 1 to 50']);
  await expect(page.getByLabel('Number of colours')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Size rounds')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#status')).toHaveText('Not rendered.');
  await page.getByLabel('Number of colours').fill('6');
  await page.getByLabel('Size rounds').fill('4');
  await page.getByRole('button', { name: 'Render' }).click();
  await expect(page.locator('#palette li')).toHaveCount(6);
  await expect(page.locator('#issues')).toBeHidden();
  await expect(page.getByLabel('Number of colours')).not.toHaveAttribute('aria-invalid');
});

test('fits a 390 px phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBe(0);
  await page.getByRole('link', { name: 'Result ↓' }).click();
  await expect(page.locator('#result-heading')).toBeFocused();
  expect((await page.locator('#output').boundingBox())?.height).toBeLessThan(500);
  await page.getByLabel('Rotation, degrees counterclockwise').fill('20');
  await page.getByRole('button', { name: 'Render' }).click();
  await expect(page.locator('#status')).toHaveText(/^Done in /);
  expect(await overflow()).toBe(0);
});

test('example and Clear can restore the previous image, text, settings and rendered result', async ({ page }) => {
  await open(page);
  await page.locator('#max-side').fill('160');
  await page.locator('#image-file').setInputFiles({ name: 'my-picture.png', mimeType: 'image/png', buffer: readFileSync(new URL('../examples/alice-drink-me.png', import.meta.url)) });
  await expect(page.locator('#image-info')).toHaveText('my-picture.png, 87 × 160 px');
  await page.locator('#text').fill('My original whole words.');
  await page.locator('#whole-words').uncheck();
  await page.locator('#rotation').fill('17');
  await page.locator('#render').click();
  await expect(page.locator('#stale')).toBeHidden();
  const before = await page.evaluate(() => {
    const app = /** @type {any} */ (window).TextInImage;
    return { request: JSON.stringify(app.getRequest()), svg: app.exportSvgText() };
  });
  await page.locator('#load-example').click();
  await expect(page.locator('#undo-replace')).toBeEnabled();
  await expect(page.locator('#whole-words')).toBeChecked();
  await page.locator('#undo-replace').click();
  await expect(page.locator('#image-info')).toHaveText('my-picture.png, 87 × 160 px');
  await expect(page.locator('#whole-words')).not.toBeChecked();
  await expect(page.locator('#rotation')).toHaveValue('17');
  await expect(page.locator('#stale')).toBeHidden();
  expect(await page.evaluate(() => {
    const app = /** @type {any} */ (window).TextInImage;
    return { request: JSON.stringify(app.getRequest()), svg: app.exportSvgText() };
  })).toEqual(before);
  await page.locator('#clear-inputs').click();
  await expect(page.locator('#text')).toHaveValue('');
  await expect(page.locator('#image-info')).toHaveText('No image loaded.');
  await expect(page.locator('#stale')).toBeVisible();
  await page.locator('#undo-replace').click();
  await expect(page.locator('#text')).toHaveValue('My original whole words.');
  await expect(page.locator('#stale')).toBeHidden();
  // The original uploaded Blob, not just decoded pixels, is available after Undo.
  await page.locator('#max-side').fill('120');
  await page.locator('#max-side').blur();
  await expect(page.locator('#image-info')).toHaveText('my-picture.png, 66 × 120 px');
  await page.locator('#clear-inputs').click();
  await page.locator('#text').fill('A later edit');
  await expect(page.locator('#undo-note')).toBeHidden();
});

test('a failed example fetch preserves work and a successful API request clears old Undo', async ({ page }) => {
  await open(page);
  await page.locator('#text').fill('Keep this text.');
  await page.locator('#whole-words').uncheck();
  const before = await page.evaluate(() => JSON.stringify(/** @type {any} */ (window).TextInImage.getRequest()));
  await page.route('**/examples/alice-chapter-1.txt', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.locator('#load-example').click();
  await expect(page.locator('#issues')).toContainText('HTTP 503');
  expect(await page.evaluate(() => JSON.stringify(/** @type {any} */ (window).TextInImage.getRequest()))).toBe(before);
  await expect(page.locator('#undo-note')).toBeHidden();
  await page.locator('#clear-inputs').click();
  await expect(page.locator('#undo-note')).toBeVisible();
  await page.evaluate(async () => {
    const app = /** @type {any} */ (window).TextInImage;
    const image = await app.decodeImage('examples/alice-drink-me.png', 120);
    await app.submit({ image, text: 'An API replacement.' });
  });
  await expect(page.locator('#undo-note')).toBeHidden();
});

test('the landscape preview is bounded and fitting errors reveal their collapsed settings', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  const image = await page.locator('#output').boundingBox();
  expect(image?.height).toBeLessThanOrEqual(390);
  await page.evaluate(() => { /** @type {HTMLInputElement} */ (document.querySelector('#n-rounds')).value = ''; });
  await page.locator('#render').click();
  await expect(page.locator('#advanced-settings')).toHaveAttribute('open', '');
  await expect(page.locator('#n-rounds')).toHaveAttribute('aria-invalid', 'true');
});


test('whole-word mode and explicit newlines round-trip through the browser API and example button', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const app = /** @type {any} */ (window).TextInImage;
    const request = app.getRequest();
    await app.submit({ ...request, text: 'first\n\nsecond word', layout: { wrap: 'word' } });
  });
  await expect(page.locator('#whole-words')).toBeChecked();
  const state = await page.evaluate(() => {
    const app = /** @type {any} */ (window).TextInImage;
    const result = app.getResult();
    return { mode: app.getRequest().layout.wrap, complete: result.complete, lineGap: result.glyphs[7].line - result.glyphs[0].line, newlineInk: result.glyphs.filter((/** @type {any} */ g) => g.char === '\n').some((/** @type {any} */ g) => g.col !== null) };
  });
  expect(state).toEqual({ mode: 'word', complete: true, lineGap: 2, newlineInk: false });
  await page.locator('#whole-words').uncheck();
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#whole-words')).toBeChecked();
  await expect(page.locator('#fit-status')).toHaveText('✓ 11,224 of 11,224 characters placed.');
});
