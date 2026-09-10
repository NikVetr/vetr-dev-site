import { test, expect } from '@playwright/test';
import { faceCount } from './counts.js';
import { pickReader } from './controls.js';

/**
 * Save one pair for offline, the way the gallery's Offline button used to.
 *
 * The button is hidden: it said "Offline" and did something that needs a sentence
 * to explain, so it read as a state rather than an action beside two buttons that
 * navigate. `saveForOffline` is what the primary use case rests on, though, so it
 * stays under test through the function rather than through a control that is no
 * longer on the page -- and if the button returns, this is still what it calls.
 * These three tests failed silently for exactly as long as they asserted on the
 * control instead.
 * @param {import('@playwright/test').Page} page
 * @param {string} target @param {string} source
 */
async function save(page, target, source) {
  return page.evaluate(async (pair) => {
    const app = await import('./ui/app.js');
    const ctx = await app.browserSheetContext();
    const manifest = await app.fontManifest();
    return app.saveForOffline({ corpus: ctx.corpus, ...pair, manifest });
  }, { target, source });
}

// The primary use case: abroad, no data, still needs to produce a printable file.
test('saves a language for offline, then exports with the network off', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const saved = await save(page, 'zh-Hans', 'en');
  expect(saved.ok, `did not cache: ${JSON.stringify(saved.failed)}`).toBe(true);
  // `ok` is "nothing failed", which an empty list satisfies. A pair is sixteen
  // concept groups times three files plus its fonts, so the count is the part that
  // says work happened.
  expect(saved.total).toBeGreaterThan(40);

  await context.setOffline(true);
  await page.goto('/customize.html?target=zh-Hans&source=en');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });
  await faceCount(page);

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
  await pickReader(page, '日本語');

  // Picking a reading language switches the interface into it. The button this
  // test used to click carried that assertion, and it once asserted the English
  // string and passed for the wrong reason: the picker re-sorted the grid without
  // ever swapping the message catalogue, so a Japanese reader got a Japanese card
  // list under English chrome. The catalogue is the part worth keeping.
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');

  const saved = await save(page, 'zh-Hans', 'ja');
  // Not merely "no error": the whole point is that the file nobody curated is
  // never asked for, so nothing may be reported as failed.
  expect(saved.failed).toEqual([]);
  expect(saved.ok).toBe(true);
  expect(saved.total).toBeGreaterThan(40);

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

test('a saved pack survives a shell change', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const saved = await save(page, 'zh-Hans', 'en');
  expect(saved.ok, `did not cache: ${JSON.stringify(saved.failed)}`).toBe(true);

  // Named URLs really are in the pack cache, not merely reported as cached.
  const cached = await page.evaluate(async () => {
    const cache = await caches.open('plg-packs');
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain('/data/lang/zh-Hans/social.csv');
  expect(cached.some((u) => u.endsWith('.woff2'))).toBe(true);

  // The pack cache is not version-scoped, because `VERSION` is a content hash of
  // the *shell*: a one-character CSS change used to discard every pack every reader
  // had saved, which is the one thing saving exists to prevent.
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain('plg-packs');
  expect(names.some((n) => n.startsWith('plg-') && n.endsWith('-shell'))).toBe(true);

  // And it still works with the network off, which is the point.
  await context.setOffline(true);
  await page.goto('/customize.html?target=zh-Hans&source=en');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });
});
