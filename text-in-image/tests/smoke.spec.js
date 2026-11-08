import { expect, test } from '@playwright/test';

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
  await page.getByLabel('Rotation, degrees counterclockwise').fill('20');
  await page.getByRole('button', { name: 'Render' }).click();
  await expect(page.locator('#status')).toHaveText(/^Done in /);
  expect(await overflow()).toBe(0);
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
