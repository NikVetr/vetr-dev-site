import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../scripts/landing-art/browser.mjs';

test('the reflected figure reaches the bezel from its first outline through the final close-up', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('matrix-rain/', { engine });
  try {
    const samples = await app.page.evaluate(async () => {
      const { makeScene, frame, paint } = await import(new URL('core.mjs', location.href).href);
      const portrait = new Image();
      portrait.src = 'nik-reflection.webp';
      await portrait.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scene = makeScene();
      return [11.25, 13.79, 14.5, 15.1, 16].map((time) => {
        const shot = frame(scene, time);
        // Compare the last four scanlines with the same rain and no reflection.
        const strip = () => ctx.getImageData(0, canvas.height - 4, canvas.width, 4).data;
        paint(ctx, shot, null);
        const rain = strip();
        paint(ctx, shot, portrait);
        const composed = strip();
        let pixels = 0;
        for (let green = 1; green < rain.length; green += 4)
          if (composed[green] > rain[green] + 2) pixels++;
        return pixels;
      });
    });
    assert.equal(samples[0], 0, 'the title lock precedes the reflection');
    assert.ok(samples.slice(1).every((pixels) => pixels > 5), 'a visible reflection meets the lower edge');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
