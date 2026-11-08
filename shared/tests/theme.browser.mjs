// node --test shared/tests/theme.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

for (const route of ['crossword', 'raster-to-vector', 'forecast-calibration']) {
  test(`${route} carries its old theme choice into the collection`, async () => {
    const app = await openPage('');
    try {
      const root = new URL('/', app.page.url()).href;
      await app.page.evaluate((/** @type {string} */ key) => {
        localStorage.clear();
        localStorage.setItem(key, 'dark');
      }, `${route}:theme`);
      await app.page.goto(`${root}${route}/`);
      assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'dark');
      assert.equal(await app.page.evaluate(() => localStorage.getItem('vetr:theme')), 'dark');
      await app.page.locator('#theme-toggle').click();
      assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'light');
      // The new shared choice wins over the old page choice on another visit.
      await app.page.reload();
      assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'light');
      await app.page.goto(root);
      assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'light');
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

test('invalid stored themes follow the system, which remains live until a choice is saved', async () => {
  const app = await openPage('');
  try {
    await app.page.evaluate(() => localStorage.setItem('vetr:theme', 'invalid'));
    await app.page.reload();
    assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'light');
    await app.page.emulateMedia({ colorScheme: 'dark' });
    await app.page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await app.page.evaluate(() => localStorage.setItem('vetr:theme', 'light'));
    await app.page.reload();
    assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'light');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('unavailable storage still permits the page theme toggle', async () => {
  const app = await openPage('forecast-calibration/');
  try {
    await app.page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('Unavailable', 'SecurityError'); }});
    });
    await app.page.reload();
    assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'light');
    await app.page.locator('#theme-toggle').click();
    assert.equal(await app.page.locator('html').getAttribute('data-theme'), 'dark');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
