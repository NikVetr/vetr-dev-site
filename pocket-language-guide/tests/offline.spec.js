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

// The pair that broke: a reader whose own language is Japanese saving Chinese.
// Nobody has hand-curated zh-Hans respellings for a Japanese reader, and the
// worker used to be asked for that file anyway, 404 on it, and report a partial
// save -- leaving the button stuck on "Partly saved" with no explanation.
test('saves a pair that has no curated respellings', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.selectOption('#reader', 'ja');

  const save = page.locator('[data-offline="zh-Hans"]');
  await save.click();
  await expect(save).toHaveText('Saved', { timeout: 180_000 });

  await context.setOffline(true);
  await page.goto('/customize.html?target=zh-Hans&source=ja');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });
});

// A flaky connection is the same situation as no connection, only worse: the app
// used to carry on and print a sheet quietly missing whole sections, which for a
// safety-critical artifact is worse than refusing.
test('a failed data or font fetch is reported, not printed around', async ({ page }) => {
  for (const pattern of ['**/data/lang/ja/social.csv', '**/data/fonts/cjk-jp-400.woff2']) {
    await page.route(pattern, (route) => route.fulfill({ status: 503, body: 'nope' }));
    await page.goto('/sheet.html?target=ja&source=en');
    await expect(page.locator('body')).toContainText('Something went wrong', { timeout: 60_000 });
    await expect(page.locator('#faces .face')).toHaveCount(0);
    await page.unroute(pattern);
  }

  // And the same page is fine once the network is.
  await page.goto('/sheet.html?target=ja&source=en');
  await expect(page.locator('#faces .face').first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('body')).not.toContainText('Something went wrong');
});
