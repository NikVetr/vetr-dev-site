// node --test shared/tests/tool-nav.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

test('cross-page Help opens and focuses the destination explanation', async () => {
  const app = await openPage('intuitions/threshold-model/');
  try {
    await app.page.locator('.tool-nav [data-tool-help]').click();
    await app.page.waitForLoadState('load');
    await app.page.waitForFunction(() => document.activeElement?.tagName === 'SUMMARY');
    assert.equal(await app.page.locator('#tool-help').evaluate((/** @type {HTMLDetailsElement} */ el) => el.open), true);
    await app.page.keyboard.press('Enter');
    assert.equal(await app.page.locator('#tool-help').evaluate((/** @type {HTMLDetailsElement} */ el) => el.open), false);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('forwarded dialog Help returns focus to the collection navigation', async () => {
  const app = await openPage('color-optimization/');
  try {
    const help = app.page.locator('.tool-nav [data-tool-help]');
    await help.click();
    await app.page.locator('#scientific-summary-dialog').waitFor({ state: 'visible' });
    await app.page.keyboard.press('Escape');
    await app.page.waitForFunction(() => document.activeElement?.matches('.tool-nav [data-tool-help]'));
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('b64 Enter preserves navigation when decoded links are available', async () => {
  const app = await openPage('b64/');
  try {
    await app.page.locator('#source').fill('aHR0cHM6Ly9leGFtcGxlLmNvbS8=');
    await app.page.locator('#links a').first().waitFor();
    await app.page.locator('.tool-nav [data-tool-help]').focus();
    await app.page.keyboard.press('Enter');
    assert.equal(await app.page.locator('#tool-help').evaluate((/** @type {HTMLDetailsElement} */ el) => el.open), true);
    assert.equal(app.page.context().pages().length, 1);
    await app.page.locator('.tool-nav-home').focus();
    await app.page.keyboard.press('Enter');
    await app.page.waitForURL((/** @type {URL} */ url) => url.pathname === '/');
    assert.equal(app.page.context().pages().length, 1);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
