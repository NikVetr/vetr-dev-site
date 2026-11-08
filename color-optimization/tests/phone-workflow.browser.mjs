// node --test color-optimization/tests/phone-workflow.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const path = process.env.COLOR_WORKFLOW_PATH || 'color-optimization/';
const palette = '#4477AA, #EE6677, #228833, #CCBB44, #66CCEE, #AA3377, #BBBBBB, #332288, #88CCEE, #44AA99, #117733, #999933';

test('phone disclosures preserve settings across resizing and reveal invalid controls', async () => {
  const app = await openPage(path, { width: 390, height: 844 });
  const { page } = app;
  try {
    const details = page.locator('.settings-section');
    assert.equal(await details.count(), 4);
    assert.deepEqual(await details.evaluateAll((els) => els.map((el) => /** @type {HTMLDetailsElement} */ (el).open)), [false, false, false, false]);
    assert.ok((await page.locator('.hero').boundingBox()).height < 400);
    assert.ok((await page.locator('#palette-input').boundingBox()).y < 844);
    assert.ok((await page.locator('#result-nav').boundingBox()).y < 1400);
    await details.first().locator('summary').focus();
    await page.keyboard.press('Enter');
    await page.locator('#seed-input').fill('2026');
    await page.locator('#nm-iters').fill('75');
    const values = () => page.locator('.controls input, .controls select, .controls textarea').evaluateAll((els) => els.map((el) => {
      const field = /** @type {HTMLInputElement} */ (el);
      return { id: field.id, value: field.value, checked: field.checked };
    }));
    const before = await values();
    await details.first().locator('summary').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => [...document.querySelectorAll('.settings-section')].every((el) => /** @type {HTMLDetailsElement} */ (el).open));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !/** @type {HTMLDetailsElement} */ (document.querySelector('.settings-section')).open);
    assert.deepEqual(await values(), before);
    await page.locator('#nm-iters').evaluate((/** @type {HTMLInputElement} */ el) => { el.setCustomValidity('Choose a valid iteration count'); el.reportValidity(); });
    assert.equal(await details.first().evaluate((/** @type {HTMLDetailsElement} */ el) => el.open), true);
    await page.locator('#nm-iters').evaluate((/** @type {HTMLInputElement} */ el) => el.setCustomValidity(''));
    assert.deepEqual(await values(), before);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('phone navigation reaches native Run, preview, copied hex codes, and scientific help', async () => {
  const app = await openPage(path, { width: 390, height: 844 });
  const { page } = app;
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#palette-input').fill(palette);
    await page.locator('#palette-input').press('Tab');
    await page.locator('#colors-to-add').fill('2');
    await page.locator('#optim-runs').fill('5');
    await page.locator('.settings-section').first().locator('summary').click();
    await page.locator('#seed-input').fill('45');
    await page.locator('#nm-iters').fill('50');
    await page.locator('#search-strategy').selectOption('random');
    await page.locator('.settings-section').first().locator('summary').click();
    const url = page.url();
    await page.locator('.workspace-nav a[href="#run-btn"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'run-btn');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#status-state')?.textContent === 'Finished', undefined, { timeout: 60000 });
    assert.equal(await page.locator('#error-text').textContent(), '');
    await page.locator('.workspace-nav a[href="#result-nav"]').click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'result-nav');
    const nav = await page.locator('.workspace-nav').boundingBox();
    const preview = await page.locator('#result-nav').boundingBox();
    assert.ok(preview.y >= nav.y + nav.height, 'sticky links do not hide the target');
    await page.locator('.workspace-nav a[href="#results-box"]').click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'results-box');
    assert.equal(page.url(), url);
    assert.equal((await page.locator('#results-box').inputValue()).match(/#[0-9a-f]{6}/gi)?.length, 2);
    await page.locator('#format-quotes').check();
    const output = await page.locator('#results-box').inputValue();
    assert.match(output, /['"]/);
    await page.locator('#copy-btn').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), output);
    await page.locator('#scientific-summary-btn').click();
    await page.locator('#scientific-summary-dialog .research-note').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'scientific-summary-btn');
    assert.equal(await page.locator('#results-box').inputValue(), output);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('expanded palettes and settings remain reachable in portrait, landscape and desktop', async () => {
  const app = await openPage(path, { width: 390, height: 844 });
  const { page } = app;
  try {
    await page.locator('#palette-input').fill(palette);
    await page.locator('#palette-input').press('Tab');
    await page.locator('#palette-more').click();
    for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.locator('.settings-section').evaluateAll((els) => els.forEach((el) => { /** @type {HTMLDetailsElement} */ (el).open = true; }));
      const lastPreset = page.locator('.palette-group .palette-btn:visible').last();
      await lastPreset.scrollIntoViewIfNeeded();
      const box = await lastPreset.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#colorwheel-space').scrollIntoViewIfNeeded();
      const settings = await page.locator('#colorwheel-space').boundingBox();
      assert.ok(settings.height > 0 && settings.y >= 0 && settings.y + settings.height <= height);
      assert.equal(await page.locator('#palette-input').inputValue(), palette);
    }
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
