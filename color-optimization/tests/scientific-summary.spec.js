const { test, expect } = require('@playwright/test');

test('scientific note opens, navigates citations and closes without editing the palette', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.fill('#palette-input', '#4477AA, #CC6677');
  const trigger = page.getByRole('button', { name: 'Open scientific summary' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Scientific summary' });
  await expect(dialog.getByRole('heading', { name: 'Designing distinguishable color palettes' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close scientific summary' })).toBeFocused();
  await page.locator('#run-btn').evaluate((el) => el.focus());
  await expect(dialog.getByRole('button', { name: 'Close scientific summary' })).toBeFocused();
  await expect(dialog.locator('.research-note img')).toHaveCount(4);
  await expect.poll(() => dialog.locator('.research-note img').evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath('note-desktop.png') });
  await dialog.getByRole('link', { name: 'Reference 1', exact: true }).first().click();
  await expect(dialog.locator('#science-ref-1')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#palette-input')).toHaveValue('#4477AA, #CC6677');
  await trigger.click();
  await dialog.getByRole('button', { name: 'Close scientific summary' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(dialog).not.toBeVisible();
});

test('note remains within the mobile viewport and keyboard focus stays in the dialog', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open scientific summary' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.research-note')).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(await dialog.locator('.science-body').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('dialog')))).toBe(true);
  }
  await dialog.locator('.science-body').evaluate((el) => { el.scrollTop = 0; });
  await dialog.screenshot({ path: testInfo.outputPath('note-mobile.png') });
});

test('standalone note includes complete references and reproducible figures', async ({ page }, testInfo) => {
  await page.goto('/scientific-summary.html');
  await expect(page.getByRole('heading', { name: 'Abstract', exact: true })).toBeVisible();
  await expect(page.locator('.note-bibliography li')).toHaveCount(8);
  expect(await page.locator('a[href^="#"]').evaluateAll((links) => links.every((a) => document.querySelector(a.getAttribute('href'))))).toBe(true);
  await expect.poll(() => page.locator('figure img').evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  for (let i = 0; i < 3; i++) {
    await page.locator('figure').nth(i).screenshot({ path: testInfo.outputPath(`figure-${i + 1}.png`) });
  }
  const response = await page.request.get('/assets/scientific-summary/example.json');
  const example = await response.json();
  expect(example.added).toHaveLength(3);
  expect(Object.values(example.config.colorblindWeights)).toEqual([0.25, 0.25, 0.25, 0.25]);
  expect(example.config.seed).toBe(2026);
  expect(example.matrices).toHaveLength(4);
});

test('failed note loading gives a visible error and can be retried', async ({ page }) => {
  await page.goto('/');
  await page.route('**/scientific-summary.html', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: 'Open scientific summary' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await page.keyboard.press('Escape');
  await page.unroute('**/scientific-summary.html');
  await page.getByRole('button', { name: 'Open scientific summary' }).click();
  await expect(page.getByRole('dialog').locator('.research-note')).toBeVisible();
});
