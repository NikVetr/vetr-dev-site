import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

test('Stretch Snack holds all three trainers and animates the selected movement with the app renderer', async () => {
  const { page, close, errors } = await openPage('#stretch-snack-title', { engine });
  try {
    const art = page.locator('[data-art="stretch-snack"]');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await art.locator('img').first().waitFor();
    for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await art.scrollIntoViewIfNeeded();
      const panels = await art.evaluate(async el => {
        const all = [...el.querySelectorAll('.pose img')];
        await Promise.all(all.map(img => img.decode()));
        return [...el.querySelectorAll('.movement')].map(panel => {
          const pose = panel.querySelector('.pose').getBoundingClientRect();
          const bounds = panel.getBoundingClientRect();
          const pictures = [...panel.querySelectorAll('img')].filter(img => getComputedStyle(img).display !== 'none');
          return pictures.length === 1 && pose.height > 18 && pose.width > 15 &&
            pose.top >= bounds.top - 1 && pose.bottom <= bounds.bottom + 1 && pose.right <= bounds.right + 1;
        });
      });
      assert.deepEqual(panels, [true, true, true], `all three held poses fit at ${width}×${height}`);
      assert.equal(await art.locator('canvas').count(), 0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await art.hover();
    await art.locator('canvas').waitFor();
    const proof = await art.evaluate(async el => {
      const { renderMovement } = await import(new URL('stretch-snack/demo.js', location.href).href);
      const { prepare, heldPose, secondsPerSample } = await import(new URL('assets/players/stretch-snack.js', location.href).href);
      const clock = el.querySelector('.progress').getAnimations()[0];
      clock.pause(); await clock.ready;
      const next = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const steps = prepare();
      const results = [];
      for (const [i, time] of [700, 5400, 9200].entries()) {
        document.documentElement.dataset.theme = i === 1 ? 'dark' : 'light';
        document.dispatchEvent(new Event('themechange'));
        clock.currentTime = time;
        await next();
        const panel = el.querySelector('.movement[data-current]');
        const live = panel.querySelector('canvas');
        const ref = document.createElement('canvas');
        ref.style.cssText = `position:fixed;width:${live.clientWidth}px;height:${live.clientHeight}px`;
        document.body.append(ref);
        const local = (time / 1000) % secondsPerSample;
        renderMovement(ref, steps[i].move, (local + heldPose) % secondsPerSample, {
          location: 'roomy-seat', dark: document.documentElement.dataset.theme === 'dark', preview: true,
        });
        results.push({ same: ref.toDataURL() === live.toDataURL(), label: panel.querySelector('.caption').textContent });
        ref.remove();
      }
      clock.play();
      return results;
    });
    assert.deepEqual(proof, ['Arm reach', 'Knee extension', 'Elbow bend'].map(label => ({ same: true, label })));
    // Move both pointer and keyboard focus away. A focused card keeps playing.
    const header = page.locator('#preview-motion');
    await header.focus();
    await header.hover();
    await page.waitForFunction(() => !document.querySelector('[data-art="stretch-snack"][data-playing]'));
    const paused = await art.evaluate(async el => {
      const clock = el.querySelector('.progress').getAnimations()[0];
      await clock.ready;
      return Number(clock.currentTime);
    });
    await page.waitForTimeout(125);
    assert.equal(await art.evaluate(el => Number(el.querySelector('.progress').getAnimations()[0].currentTime)), paused);
    await art.hover();
    await page.waitForFunction(t => Number(document.querySelector('[data-art="stretch-snack"] .progress').getAnimations()[0].currentTime) > t + 60, paused);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('[data-art="stretch-snack"] canvas'));
    assert.equal(await art.locator('.routine-time').textContent(), '1:00');
    assert.equal(await art.locator('[data-current] .caption').textContent(), 'Arm reach');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    assert.equal(await art.locator('.dark-pose:visible').count(), 3);
    assert.equal(await art.locator('.light-pose:visible').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
