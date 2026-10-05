// The landing page's footer on the web: Donate, with a badge for each app store beside
// it and a smaller button that shows both stores' QR codes. The apps are not listed yet,
// so the badges link nowhere and say so, and the dialog holds a labelled place for each
// code. Inside the native apps none of it is offered.
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
const ready = (page) => expect(page.locator('#gallery')).toHaveAttribute('aria-busy', 'false');

test('beside Donate, a placeholder badge per store and a smaller button for their codes', async ({ page }) => {
  /** @type {string[]} */ const away = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) away.push(r.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);

  const footer = page.locator('.site-footer');
  expect(await footer.locator(':scope > *').evaluateAll((nodes) => nodes.map((n) => (
    /** @type {HTMLElement} */ (n).dataset.store ?? n.className)))).toEqual(['google-play', 'app-store', 'store-codes-open', 'donate']);
  for (const [id, name] of [['google-play', 'Google Play'], ['app-store', 'App Store']]) {
    const badge = footer.locator(`.store-badge[data-store="${id}"]`);
    await expect(badge).toHaveText(`Coming soon${name}`);
    // Not a link to a page that does not exist yet -- and "not yet" is said twice: in
    // words, and by a dashed edge.
    await expect(badge).not.toHaveAttribute('href');
    expect(await badge.evaluate((n) => getComputedStyle(n).borderStyle)).toBe('dashed');
    await expect(badge.locator('svg')).toHaveCount(1);
  }
  const open = footer.getByRole('button', { name: 'QR codes for the apps' });
  const button = /** @type {{width:number, height:number}} */ (await open.boundingBox());
  const badge = /** @type {{width:number, height:number}} */ (await footer.locator('.store-badge').first().boundingBox());
  expect(button.width).toBeLessThan(badge.width);
  expect(button.height).toBeLessThanOrEqual(badge.height);
  // One row on a phone, and nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);

  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Get the app' });
  await expect(dialog).toBeVisible();
  // Every modal's header: its name and its cross, held at the top as the body scrolls.
  const head = dialog.locator('.dialog-head');
  await expect(head.locator('h2')).toHaveText('Get the app');
  expect(await head.evaluate((n) => getComputedStyle(n).position)).toBe('sticky');
  for (const [id, name, note] of [['google-play', 'Google Play', 'For Android phones and tablets'],
    ['app-store', 'App Store', 'For iPhone and iPad']]) {
    const code = dialog.locator(`.store-code[data-store="${id}"]`);
    await expect(code.locator('figcaption')).toHaveText(`${name}${note}`);
    await expect(code.locator('.store-code-soon')).toHaveText('QR code coming soon');
    await expect(code.locator('img')).toHaveCount(0);
  }
  await head.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  // The marks are drawn in the page: nothing was fetched from anywhere else.
  expect(away).toEqual([]);
});

test('on a desktop the footer holds the corner Donate held, and the last row clears it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const seen = await page.evaluate(() => {
    const footer = /** @type {HTMLElement} */ (document.querySelector('.site-footer'));
    const box = footer.getBoundingClientRect();
    const cards = [...document.querySelectorAll('#gallery .card')];
    return {
      position: getComputedStyle(footer).position,
      right: innerWidth - box.right,
      bottom: innerHeight - box.bottom,
      top: box.top,
      lastRow: Math.max(...cards.map((c) => c.getBoundingClientRect().bottom)),
    };
  });
  expect(seen.position).toBe('fixed');
  expect(seen.right).toBeLessThan(20);
  expect(seen.bottom).toBeLessThan(20);
  expect(seen.lastRow).toBeLessThanOrEqual(seen.top);
});

test('inside the app, the footer is Donate alone', async ({ page }) => {
  await page.addInitScript(() => {
    /** @type {any} */ (globalThis).Capacitor = { isNativePlatform: () => true, Plugins: {} };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await expect(page.locator('.site-footer > *')).toHaveCount(1);
  await expect(page.locator('.site-footer .donate')).toBeVisible();
  await expect(page.locator('.store-badge, .store-codes-open')).toHaveCount(0);
});
