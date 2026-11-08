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

test('Palette keeps its native help button and returns focus after closing', async () => {
  const app = await openPage('color-optimization/');
  try {
    const help = app.page.locator('#scientific-summary-btn');
    assert.equal(await app.page.locator('.tool-nav [data-tool-help]').count(), 0);
    await help.focus();
    await app.page.keyboard.press('Enter');
    await app.page.locator('#scientific-summary-dialog').waitFor({ state: 'visible' });
    await app.page.keyboard.press('Escape');
    await app.page.waitForFunction(() => document.activeElement?.id === 'scientific-summary-btn');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('collection links share the existing header without duplicate identity or help controls', async () => {
  const app = await openPage('layout-gui/');
  try {
    const origin = new URL('/', app.page.url()).href;
    for (const path of ['layout-gui/', 'color-optimization/', 'b64/', 'agendamatic/', 'name-tags/', 'intuitions/threshold-model/', 'pocket-language-guide/']) {
      for (const width of [1440, 390]) {
        await app.page.setViewportSize({ width, height: 900 });
        await app.page.goto(origin + path);
        const header = await app.page.locator('.tool-nav').evaluate((nav) => {
          const host = nav.closest('header, .page-title');
          return {
            integrated: !!host,
            names: nav.querySelectorAll('.tool-nav-name').length,
            homes: [...(host?.querySelectorAll('a') ?? [])].filter((a) => a.textContent?.trim() === 'vetr.dev').length,
            clipped: [...nav.querySelectorAll('a')].some((a) => { const r = a.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.height < (innerWidth <= 640 ? 44 : 36); }),
          };
        });
        assert.deepEqual(header, { integrated: true, names: 0, homes: 1, clipped: false }, `${path} at ${width}px`);
        if (path === 'layout-gui/') {
          assert.equal(await app.page.locator('#helpBtn').count(), 1);
          assert.equal(await app.page.locator('.tool-nav [data-tool-help]').count(), 0);
        }
        if (path === 'pocket-language-guide/' && width === 390) {
          const row = await app.page.locator('.gallery-header-controls').evaluate((el) => {
            const brand = el.querySelector('.brand')?.getBoundingClientRect();
            const menu = el.querySelector('#site-menu')?.getBoundingClientRect();
            return !!brand && !!menu && Math.abs(brand.top - menu.top) < 8;
          });
          assert.ok(row, 'Wanderwart keeps its native brand, language picker and menu on one row');
        }
      }
    }
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
