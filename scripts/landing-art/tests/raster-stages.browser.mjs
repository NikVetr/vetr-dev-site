// node --test scripts/landing-art/tests/raster-stages.browser.mjs
// Select another installed browser with PLAYWRIGHT and BROWSER_ENGINE.
import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

test(`raster preview visits four actual stages, pauses and respects reduced motion in ${engine}`, async () => {
  const session = await openPage('', { engine });
  const { page } = session;
  try {
    const art = page.locator('[data-art="raster-to-vector"]');
    const card = page.locator('.project-card').filter({ has: art });
    await art.scrollIntoViewIfNeeded();
    await art.locator('svg').waitFor();
    assert.equal(await art.locator('.finished').evaluate((/** @type {Element} */ el) => getComputedStyle(el).display), 'inline');
    assert.equal(await art.locator('.process').evaluate((/** @type {Element} */ el) => getComputedStyle(el).display), 'none');
    assert.equal(await art.locator('.finished .active .label').textContent(), 'Smooth');
    const renderedText = await art.locator('.finished .label').first().evaluate((/** @type {Element} */ el) => {
      const matrix = /** @type {SVGGraphicsElement} */ (el).getScreenCTM();
      return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(matrix?.a ?? 0, matrix?.b ?? 0);
    });
    assert.ok(renderedText >= 10, 'stage labels must remain readable in the native card');
    await card.hover();
    await page.waitForFunction(() => document.querySelector('[data-art="raster-to-vector"]')?.hasAttribute('data-playing'));
    for (const [i, label] of ['Raster', 'Colours', 'Trace', 'Smooth'].entries()) {
      const active = await art.evaluate((/** @type {Element} */ el, /** @type {number} */ at) => {
        // Seek without overriding CSS ownership of animation-play-state.
        for (const animation of el.getAnimations({ subtree: true })) animation.currentTime = at;
        return [...el.querySelectorAll('.frame')].filter(frame => Number(getComputedStyle(frame).opacity) > .99).map(frame => frame.querySelector('.active .label')?.textContent);
      }, i * 2500 + 200);
      assert.deepEqual(active, [label]);
    }
    const sweep = await art.evaluate((/** @type {Element} */ el) => {
      for (const animation of el.getAnimations({ subtree: true })) animation.currentTime = 1250;
      const reveal = el.querySelector('.reveal'), scan = el.querySelector('.scan');
      if (!reveal || !scan) throw new Error('Missing processing sweep');
      return { reveal: new DOMMatrix(getComputedStyle(reveal).transform).a, scan: new DOMMatrix(getComputedStyle(scan).transform).e, opacity: Number(getComputedStyle(scan).opacity) };
    });
    assert.ok(sweep.reveal > .2 && sweep.reveal < .8, 'the next actual stage is partially revealed');
    assert.ok(sweep.scan > 0 && sweep.scan < 128 && sweep.opacity > 0, 'the neutral pass crosses the picture');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(80);
    assert.equal(await art.getAttribute('data-playing'), null);
    const times = () => art.evaluate((/** @type {Element} */ el) => el.getAnimations({ subtree: true }).map(animation => animation.currentTime));
    const stopped = await times();
    await page.waitForTimeout(180);
    assert.deepEqual(await times(), stopped, 'leaving the card pauses the process');
    await page.keyboard.press('Tab');
    await card.focus();
    await page.waitForTimeout(180);
    assert.notDeepEqual(await times(), stopped, 'keyboard focus resumes the process');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('[data-art="raster-to-vector"]')?.hasAttribute('data-started'));
    assert.equal(await art.locator('.process').evaluate((/** @type {Element} */ el) => getComputedStyle(el).display), 'none');
    assert.equal(await art.locator('.finished .active .label').textContent(), 'Smooth');
    assert.deepEqual(session.errors, []);
  } finally { await session.close(); }
});
