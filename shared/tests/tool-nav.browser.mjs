// node --test shared/tests/tool-nav.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

test('direct help links open and focus the destination explanation', async () => {
  const app = await openPage('intuitions/#tool-help');
  try {
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

test('native headers keep their controls without an extra collection row', async () => {
  const app = await openPage('layout-gui/');
  try {
    const origin = new URL('/', app.page.url()).href;
    for (const path of ['layout-gui/', 'color-optimization/', 'b64/', 'agendamatic/', 'name-tags/', 'intuitions/threshold-model/', 'pocket-language-guide/']) {
      for (const width of [1440, 390]) {
        await app.page.setViewportSize({ width, height: 900 });
        await app.page.goto(origin + path);
        assert.equal(await app.page.locator('.tool-nav').count(), 0, `${path} at ${width}px has no added link row`);
        const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, `${path} at ${width}px fits the viewport`);
        if (path === 'layout-gui/') {
          assert.equal(await app.page.locator('#helpBtn').count(), 1);
          assert.equal(await app.page.locator('.tool-nav [data-tool-help]').count(), 0);
        }
        if (path === 'pocket-language-guide/' && width === 390) {
          const row = await app.page.locator('.gallery-header-controls').evaluate((/** @type {HTMLElement} */ el) => {
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

test('b64 Enter on help preserves native keyboard behavior when decoded links are available', async () => {
  const app = await openPage('b64/');
  try {
    await app.page.locator('#source').fill('aHR0cHM6Ly9leGFtcGxlLmNvbS8=');
    await app.page.locator('#links a').first().waitFor();
    await app.page.locator('#tool-help summary').focus();
    await app.page.keyboard.press('Enter');
    assert.equal(await app.page.locator('#tool-help').evaluate((/** @type {HTMLDetailsElement} */ el) => el.open), true);
    assert.equal(app.page.context().pages().length, 1);
    await app.page.keyboard.press('Enter');
    assert.equal(await app.page.locator('#tool-help').evaluate((/** @type {HTMLDetailsElement} */ el) => el.open), false);
    assert.equal(app.page.context().pages().length, 1);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('travel tools keep the directory link, title and theme on one line on a small phone', async () => {
  const app = await openPage('stretch-snack/', {width: 320, height: 720, touch: true});
  try {
    const directory = new URL('/', app.page.url()).href;
    for (const path of ['stretch-snack/', 'travel-prompt/']) {
      await app.page.goto(new URL(path, directory).href);
      const back = app.page.getByRole('link', {name: 'Back to vetr.dev'});
      const fits = await app.page.locator('header').evaluate(el => {
        const h1 = el.querySelector('h1'), title = h1.getBoundingClientRect();
        const link = el.querySelector('.directory-back').getBoundingClientRect();
        const theme = el.querySelector('#theme-toggle').getBoundingClientRect();
        return title.height < 1.6 * parseFloat(getComputedStyle(h1).lineHeight)
          && link.right <= title.left && title.right <= theme.left && theme.right <= innerWidth;
      });
      assert.ok(fits, path);
      await back.focus();
      await app.page.keyboard.press('Enter');
      await app.page.waitForURL(directory);
    }
  } finally {await app.close();}
});
