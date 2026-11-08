import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = (page) => page.evaluate(() => /** @type {any} */ (window).RasterToVector.exportSvgText());
test('uploaded images, raw options and completed SVGs support keyboard undo/redo and branching', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const original = await svg(page);
  await page.locator('#image-file').setInputFiles({ name: 'uploaded-logo.png', mimeType: 'image/png', buffer: readFileSync(new URL('../examples/logo_holes.png', import.meta.url)) });
  await expect(page.locator('#image-info')).toContainText('uploaded-logo.png');
  await expect(page.locator('html')).not.toHaveAttribute('data-busy');
  const uploaded = await svg(page);
  expect(uploaded).not.toBe(original);
  await page.locator('#convert').focus();
  await page.keyboard.press('Meta+z');
  expect(await svg(page)).toBe(original);
  await expect(page.locator('#image-info')).toContainText('cartoon_flat.png');
  await page.keyboard.press('Control+Shift+z');
  expect(await svg(page)).toBe(uploaded);
  await expect(page.locator('#image-info')).toContainText('uploaded-logo.png');
  const colors = page.locator('[data-path="quantize.k"]');
  await colors.fill('3');
  await colors.blur();
  await page.locator('#convert').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-busy');
  const converted = await svg(page);
  await page.locator('#convert').focus();
  await page.keyboard.press('Control+z');
  expect(await svg(page)).toBe(uploaded);
  await expect(colors).toHaveValue('3');
  await page.keyboard.press('Meta+Shift+z');
  expect(await svg(page)).toBe(converted);
  await page.keyboard.press('Control+z');
  await colors.fill('4');
  await colors.blur();
  await expect(page.locator('#redo')).toBeDisabled();
});

test('Undo cancels conversion and preserves the last complete SVG', async ({ page }) => {
  await page.route('**/raster-to-vector/worker.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `const deliver = self.postMessage.bind(self); self.postMessage = (...args) => setTimeout(() => deliver(...args), 350);\n${await response.text()}` });
  });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const original = await svg(page);
  await page.locator('[data-path="quantize.k"]').fill('3');
  await page.locator('#convert').click();
  await expect(page.locator('html')).toHaveAttribute('data-busy', 'true');
  await page.locator('#undo').click();
  await page.waitForTimeout(500);
  expect(await svg(page)).toBe(original);
  await expect(page.locator('#redo')).toBeEnabled();
  await page.evaluate(async () => { try { await /** @type {any} */ (window).RasterToVector.submit({}); } catch {} });
  await expect(page.locator('#redo')).toBeEnabled();
});
