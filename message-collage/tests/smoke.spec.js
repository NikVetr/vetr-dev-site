import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('lays out the example on load and exposes the API and the exports', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#message-count')).toHaveText('34 messages');
  await expect(page.locator('#preview svg use')).not.toHaveCount(0);
  await expect(page.locator('#summary')).toContainText('the best of 20 layouts');
  await expect(page.locator('#status')).toContainText('Done in');
  await expect(page.locator('#stale')).toBeHidden();

  // an uploaded file replaces the example, and a second one adds to it
  const file = (/** @type {string} */ text) => ({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.locator('#upload').setInputFiles(file('Thanks for everything.\n\nGood luck!\n'));
  await expect(page.locator('#message-count')).toHaveText('2 messages');
  await page.locator('#upload').setInputFiles(file('We will miss you.'));
  await expect(page.locator('#message-count')).toHaveText('3 messages');
  await expect(page.locator('#stale')).toContainText('Out of date');

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).MessageCollage;
    const result = await app.submit({ messages: ['Thank you for everything.', 'Good luck out there!', 'We will miss you.'], fill: 0.5, seed: 4, runs: 3 });
    const outlined = await app.exportSvgText();
    const embedded = await app.exportSvgText({ text: 'embedded' });
    const png = await app.exportPngBlob({ width: 400 });
    const pdf = await app.exportPdfBlob();
    const bitmap = await createImageBitmap(png);
    let error = null;
    try {
      await app.submit({ messages: ['ok'], styles: ['heavy'] });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, path: e.issues[0].path };
    }
    return {
      runs: result.runs.length,
      same: JSON.stringify(result) === JSON.stringify(app.getResult()),
      outlined: outlined.includes('<use '),
      embedded: embedded.includes('@font-face') && embedded.includes('>Good luck out there!</text>') || embedded.includes('Good luck'),
      png: [png.type, bitmap.width, bitmap.height],
      pdf: [pdf.type, pdf.size > 1000],
      request: app.getRequest().messages.length,
      error,
    };
  });
  expect(api).toEqual({
    runs: 3, same: true, outlined: true, embedded: true, png: ['image/png', 400, 400], pdf: ['application/pdf', true], request: 3,
    error: { name: 'CollageError', code: 'invalid_request', path: 'styles[0]' },
  });
  await expect(page.locator('#message-count')).toHaveText('3 messages');
  expect(errors).toEqual([]);
});

test('problems are listed by the field they are on, and the card on view is marked out of date', async ({ page }) => {
  await open(page);
  await page.locator('#messages').fill('Thank you\nСпасибо за всё');
  await expect(page.locator('#stale')).toContainText('Out of date');
  for (const style of ['Plain', 'Bold', 'Italic', 'Bold italic']) await page.getByLabel(style, { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#run-issues')).toContainText('Styles: must be a non-empty array');
  await expect(page.locator('#styles')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Plain', { exact: true }).check();
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#message-issues')).toContainText('Message 2 (line 2): Lobster Two has no glyph for "С"');
  await expect(page.locator('#messages')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#stale')).toContainText('the last run failed');
});

test('a phone-width page has no sideways scroll and shows the card after the messages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const messages = await page.locator('#messages').boundingBox();
  const preview = await page.locator('#preview svg').boundingBox();
  expect(preview && messages && preview.y > messages.y).toBe(true);
  expect(preview && preview.width).toBeLessThanOrEqual(390);
});

test('Clear and Load example offer the messages and settings back', async ({ page }) => {
  await open(page);
  await page.locator('#messages').fill('Thank you\nGood luck');
  await page.locator('#fill').fill('0.5');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#undo-note')).toContainText('Cleared 2 messages.');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#messages')).toHaveValue('Thank you\nGood luck');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#undo-note')).toContainText('Replaced your 2 messages and the settings with the example.');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#messages')).toHaveValue('Thank you\nGood luck');
  await expect(page.locator('#fill')).toHaveValue('0.5');
  await expect(page.locator('#undo-note')).toBeHidden();
});
