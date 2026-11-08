import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openPage } from '../landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE || 'chromium');
/** @param {any} art @returns {Promise<number[]>} */
const times = (art) => art.evaluate((/** @type {HTMLElement} */ el) => el.getAnimations({ subtree: true }).map(a => Number(a.currentTime)));
/** @param {any} art */
const waitPaused = (art) => art.evaluate(async (/** @type {HTMLElement} */ el) => {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const animations = el.getAnimations({ subtree: true });
  return animations.length > 0 && animations.every(a => a.playState === 'paused');
});

test('CSS previews keep their frame on exit and resume their original clocks', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    // Both continuously interpolated and stacked-frame animations are covered.
    for (const name of ['b64', 'seating', 'raster-to-vector', 'text-in-image', 'message-collage']) {
      const art = page.locator(`[data-art="${name}"]`);
      await art.scrollIntoViewIfNeeded(); await art.locator('svg').waitFor();
      assert.equal((await times(art)).length, 0, `${name}: starts still`);
      await art.hover(); await page.waitForTimeout(350);
      const started = await times(art); assert.ok(started.length, `${name}: has CSS animations`);
      await page.mouse.move(0, 0); assert.ok(await waitPaused(art), `${name}: pauses`);
      const paused = await times(art);
      const picture = await art.screenshot();
      await page.waitForTimeout(200);
      assert.deepEqual(await times(art), paused, `${name}: clock stays frozen`);
      assert.deepEqual(await art.screenshot(), picture, `${name}: visible frame stays frozen`);
      await art.hover(); await page.waitForTimeout(140);
      const resumed = await times(art);
      assert.ok(resumed.every((time, i) => time > paused[i] + 60), `${name}: resumes instead of restarting`);
      await page.mouse.move(0, 0);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('canvas previews retain their image on exit, resize and resume', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    for (const name of ['intuitions']) {
      const art = page.locator(`[data-art="${name}"]`);
      await art.hover(); const canvas = art.locator('canvas'); await canvas.waitFor();
      await page.waitForTimeout(350); await page.mouse.move(0, 0);
      await page.waitForTimeout(50);
      const picture = await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => { el.dataset.retained = 'yes'; return el.toDataURL(); });
      const paused = await times(art);
      await page.waitForTimeout(200);
      assert.equal(await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.toDataURL()), picture, `${name}: canvas does not reset or keep running`);
      assert.deepEqual(await times(art), paused, `${name}: companion CSS stays paused`);
      await art.hover(); await page.waitForTimeout(160);
      assert.equal(await canvas.getAttribute('data-retained'), 'yes', `${name}: reuses the canvas`);
      assert.notEqual(await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.toDataURL()), picture, `${name}: canvas resumes`);
      await page.mouse.move(0, 0);
      await page.setViewportSize({ width: 1280, height: 840 });
      await page.waitForTimeout(80);
      assert.ok(await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.width === Math.round((el.parentElement?.clientWidth ?? 0) * devicePixelRatio)), `${name}: paused canvas follows resize`);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('keyboard blur pauses; reduced motion resets; touch does not start previews', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    const art = page.locator('[data-art="b64"]');
    const card = page.locator('.project-card').filter({ has: art });
    for (let i = 0; i < 30 && !(await card.evaluate((/** @type {HTMLElement} */ el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    assert.ok(await card.evaluate((/** @type {HTMLElement} */ el) => el === document.activeElement), 'Tab reaches the card');
    await art.locator('svg').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-art="b64"]')?.hasAttribute('data-playing'));
    await page.waitForTimeout(180);
    assert.equal(await art.getAttribute('data-playing'), '');
    await page.keyboard.press('Tab'); assert.ok(await waitPaused(art));
    const paused = await times(art);
    await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(120);
    assert.ok((await times(art))[0] > paused[0] + 50);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('[data-started]'));
    assert.equal(await art.getAttribute('data-started'), null);
    assert.equal((await times(art)).length, 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await card.dispatchEvent('pointerenter', { pointerType: 'touch' });
    assert.equal(await art.getAttribute('data-playing'), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
