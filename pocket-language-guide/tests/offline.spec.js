import { test, expect } from '@playwright/test';

// The primary use case: abroad, no data, still needs to produce a printable file.
test('saves a language for offline, then exports with the network off', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const save = page.locator('[data-offline="zh-Hans"]');
  await save.click();
  await expect(save).toHaveText('Saved', { timeout: 180_000 });

  await context.setOffline(true);
  await page.goto('/customize.html?target=zh-Hans&source=en');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#status')).toContainText('4 faces');

  const download = page.waitForEvent('download', { timeout: 180_000 });
  await page.locator('#pdf').click();
  expect((await download).suggestedFilename()).toContain('.pdf');
});
