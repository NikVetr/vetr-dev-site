// The native bundle, actually loaded.
//
// `tests/mobile-build.test.mjs` checks what is in `dist/mobile` by reading the
// directory. This checks the thing that matters on a device: that every page opens
// from the bundle alone, with nothing 404ing and nothing reaching the network.
//
// A missing asset here is a white screen on a phone with no address bar and no
// console, which is why it is worth a browser rather than a file listing. The bundle
// is served by the suite's own static server out of `dist/mobile/`, so the relative
// paths in the pages resolve exactly as they do inside a WebView.

import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BUNDLE = '/dist/mobile';

test.beforeAll(() => {
  // `dist/` is gitignored, so a fresh checkout has none. Building here rather than
  // skipping keeps this from being a test that quietly never runs.
  execFileSync('node', ['scripts/build_mobile.mjs', '--quiet'], { cwd: ROOT });
});

/**
 * Open a bundled page with the network cut off, and report what it could not get.
 *
 * Everything outside `dist/mobile` is aborted rather than merely counted: a page
 * that works because it quietly fell back to the website is exactly the failure this
 * is looking for, and on a phone in a basement it would not have that option.
 * @param {import('@playwright/test').Page} page @param {string} path
 */
async function openOffline(page, path) {
  /** @type {string[]} */ const failed = [];
  /** @type {string[]} */ const offsite = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith(`${BUNDLE}/`)) return route.continue();
    offsite.push(url.href);
    return route.abort();
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  /** @type {string[]} */ const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
  await page.goto(BUNDLE + path);
  return { failed, offsite, errors };
}

for (const [name, path, ready] of /** @type {[string,string,string][]} */ ([
  ['the gallery', '/index.html', '.card'],
  ['the quick page', '/sheet.html?target=zh-Hans&source=en', '.sheet-preview svg, .face'],
  ['the studio', '/customize.html?target=zh-Hans&source=en', '.face.focused'],
  ['a conversation board', '/conversation.html?target=zh-Hans&source=en&board=spa', '.board-cell'],
])) {
  test(`${name} opens from the bundle with the network cut`, async ({ page }) => {
    const { failed, offsite, errors } = await openOffline(page, path);
    await expect(page.locator(ready).first()).toBeVisible({ timeout: 120_000 });
    expect(failed, 'the bundle is missing a file the page asked for').toEqual([]);
    expect(offsite, 'the page reached for something outside the bundle').toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the bundle registers no service worker', async ({ page }) => {
  // `sw.js` is not in the bundle, so registering would 404 on every launch. The
  // marker in `data/native.json` is what stops the attempt.
  await openOffline(page, '/index.html');
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  const count = await page.evaluate(
    () => navigator.serviceWorker.getRegistrations().then((r) => r.length),
  );
  expect(count).toBe(0);
});

test('the website still registers one', async ({ page }) => {
  // The other half of the same switch, and the reason the marker ships on both
  // sides rather than being absent on the web: this must not be turned off for
  // everyone by a change meant for the app.
  await page.goto('/index.html');
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => page.evaluate(
    () => navigator.serviceWorker.getRegistrations().then((r) => r.length),
  ), { timeout: 20_000 }).toBeGreaterThan(0);
});
