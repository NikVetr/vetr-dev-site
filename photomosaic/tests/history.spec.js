import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const result = (page) => page.evaluate(() => JSON.stringify(/** @type {any} */ (window).Photomosaic.getResult()));
const open = async (page) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
};

test('matches, display gestures and selected cells support both keyboard undo/redo variants', async ({ page }) => {
  await open(page);
  const original = await result(page);
  await page.locator('#metric').selectOption('lab');
  await page.locator('#generate').click();
  await expect(page.locator('#stale')).toBeHidden();
  const matched = await result(page);
  expect(matched).not.toBe(original);
  await page.locator('#generate').focus();
  await page.keyboard.press('Control+z');
  expect(await result(page)).toBe(original);
  await expect(page.locator('#metric')).toHaveValue('lab');
  await page.keyboard.press('Meta+Shift+z');
  expect(await result(page)).toBe(matched);
  await page.locator('#tint').fill('40');
  await page.locator('#generate').focus();
  await page.keyboard.press('Meta+z');
  await expect(page.locator('#tint-value')).toHaveText('0%');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#tint-value')).toHaveText('40%');
  const beforeCell = await page.locator('#detail-caption').textContent();
  await page.locator('#mosaic').focus();
  await page.keyboard.press('ArrowRight');
  const nextCell = await page.locator('#detail-caption').textContent();
  expect(nextCell).not.toBe(beforeCell);
  await page.keyboard.press('Control+z');
  await expect(page.locator('#detail-caption')).toHaveText(beforeCell);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#detail-caption')).toHaveText(nextCell);
  await page.keyboard.press('Meta+z');
  await page.locator('#tint').fill('60');
  await expect(page.locator('#redo')).toBeDisabled();
  expect(await result(page)).toBe(matched);
});

test('uploaded photo assets and targets remain exportable through Undo and Redo', async ({ page }) => {
  await open(page);
  const original = await result(page);
  await page.locator('#photo-files').setInputFiles(['t01.png', 't02.png', 't03.png'].map(name => fileURLToPath(new URL(`fixtures/photos/${name}`, import.meta.url))));
  await expect(page.locator('#photo-count')).toHaveText('3 photos');
  await page.locator('#undo').click();
  await expect(page.locator('#photo-count')).toHaveText('442 photos');
  await page.locator('#redo').click();
  await expect(page.locator('#photo-count')).toHaveText('3 photos');
  await page.locator('#generate').click();
  await expect(page.locator('#stale')).toBeHidden();
  const uploaded = await result(page);
  await page.locator('#undo').click();
  expect(await result(page)).toBe(original);
  expect(await page.evaluate(async () => (await /** @type {any} */ (window).Photomosaic.exportPngBlob({ tileWidth: 8 })).size)).toBeGreaterThan(10000);
  await page.locator('#redo').click();
  expect(await result(page)).toBe(uploaded);
  expect(await page.evaluate(async () => (await /** @type {any} */ (window).Photomosaic.exportPngBlob({ tileWidth: 8 })).size)).toBeGreaterThan(50);
  expect(await page.evaluate(async () => {
    const api = /** @type {any} */ (window).Photomosaic;
    // Wider than the retained thumbnails: the export must await full-size image decoding.
    const expected = new Uint8Array(await (await api.exportPngBlob({ tileWidth: 256 })).arrayBuffer());
    const pending = api.exportPngBlob({ tileWidth: 256 });
    api.undo();
    const actual = new Uint8Array(await (await pending).arrayBuffer());
    api.redo();
    return expected.length === actual.length && expected.every((value, i) => value === actual[i]);
  })).toBe(true);
  await page.locator('#target-file').setInputFiles(fileURLToPath(new URL('fixtures/target-wide.png', import.meta.url)));
  await expect(page.locator('#target-status')).toContainText('target-wide.png');
  await page.locator('#undo').click();
  await expect(page.locator('#target-status')).toContainText('Red Fuji');
  await page.locator('#redo').click();
  await expect(page.locator('#target-status')).toContainText('target-wide.png');
});

test('a late matching worker cannot overwrite Undo, and failed requests keep Redo', async ({ page }) => {
  await page.route('**/photomosaic/worker.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `const deliver = self.postMessage.bind(self); self.postMessage = (...args) => setTimeout(() => deliver(...args), 350);\n${await response.text()}` });
  });
  await open(page);
  const original = await result(page);
  await page.locator('#metric').selectOption('lab');
  await page.locator('#generate').click();
  await expect(page.locator('#stop')).toBeEnabled();
  await page.locator('#undo').click();
  await page.waitForTimeout(500);
  expect(await result(page)).toBe(original);
  await expect(page.locator('#metric')).toHaveValue('hsl-r');
  await page.evaluate(async () => { try { await /** @type {any} */ (window).Photomosaic.submit({}); } catch {} });
  await expect(page.locator('#redo')).toBeEnabled();
  await page.locator('#redo').click();
  await expect(page.locator('#metric')).toHaveValue('lab');
  expect(await result(page)).toBe(original);
});
