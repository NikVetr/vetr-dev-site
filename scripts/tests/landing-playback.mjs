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
    for (const name of ['b64', 'seating', 'raster-to-vector', 'text-in-image', 'message-collage', 'photomosaic']) {
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

test('desktop keyboard blur pauses; reduced motion resets; touch entry does not start previews', async () => {
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


test('mobile centre playback, sticky controls, saved pause and reduced motion', async () => {
  const browser = await openPage('', { engine, width: 390, height: 844, touch: true });
  const { page, errors } = browser;
  try {
    const button = page.locator('#preview-motion');
    const playing = page.locator('[data-playing]');
    await page.waitForFunction(() => document.querySelectorAll('[data-playing]').length === 1);
    const centre = async (/** @type {string} */ name) => {
      await page.locator(`[data-art="${name}"]`).evaluate((/** @type {HTMLElement} */ el) => el.closest('.project-card')?.scrollIntoView({block: 'center'}));
      await page.waitForFunction((/** @type {string} */ n) => document.querySelector(`[data-art="${n}"]`)?.hasAttribute('data-playing'), name);
      assert.equal(await playing.count(), 1, 'only the central panel plays');
    };
    await centre('signature');
    const art = page.locator('[data-art="signature"]');
    await page.waitForTimeout(180);
    const before = await times(art);
    assert.equal(Math.round((await page.locator('.mobile-bar').boundingBox()).y), 0, 'bar stays at viewport top');
    await button.tap(); assert.ok(await waitPaused(art));
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    const paused = await times(art);
    await page.waitForTimeout(120); assert.deepEqual(await times(art), paused);
    await button.tap(); await page.waitForTimeout(120);
    assert.ok((await times(art))[0] > before[0], 'toggle resumes instead of resetting');
    await centre('raster-to-vector'); assert.ok(await waitPaused(art));
    const left = await times(art); await page.waitForTimeout(120); assert.deepEqual(await times(art), left);
    await centre('signature'); await page.waitForTimeout(120); assert.ok((await times(art))[0] > left[0]);
    await button.tap(); await page.reload();
    assert.equal(await button.getAttribute('aria-pressed'), 'false', 'pause persists through reload');
    assert.equal(await playing.count(), 0);
    await button.tap(); await page.waitForFunction(() => document.querySelector('[data-playing]'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('[data-started]'));
    assert.ok(await button.isDisabled()); assert.equal(await button.textContent(), 'Reduced motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelectorAll('[data-playing]').length === 1);
    await page.setViewportSize({width: 844, height: 390});
    await page.waitForTimeout(150);
    assert.equal(await playing.count(), 1, 'touch landscape keeps a single active panel');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('autoCHAIR logo movie pauses, resumes and is released for reduced motion', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    const art = page.locator('[data-art="agendamatic"]');
    await art.hover();
    const video = art.locator('video');
    await video.waitFor();
    await page.waitForFunction(() => (document.querySelector('.autochair-video') instanceof HTMLVideoElement) &&
      /** @type {HTMLVideoElement} */ (document.querySelector('.autochair-video')).currentTime > 0.1);
    await page.mouse.move(0, 0);
    assert.ok(await video.evaluate((/** @type {HTMLVideoElement} */ el) => el.paused));
    const time = await video.evaluate((/** @type {HTMLVideoElement} */ el) => el.currentTime);
    await page.waitForTimeout(150);
    assert.equal(await video.evaluate((/** @type {HTMLVideoElement} */ el) => el.currentTime), time);
    await art.hover();
    await page.waitForFunction((/** @type {number} */ t) => /** @type {HTMLVideoElement} */ (document.querySelector('.autochair-video')).currentTime > t + 0.1, time);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('.autochair-video'));
    assert.equal(await video.count(), 0);
    assert.equal(await art.getAttribute('data-started'), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
