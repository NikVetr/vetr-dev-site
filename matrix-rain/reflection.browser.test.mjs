import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../scripts/landing-art/browser.mjs';

test('the reflected figure reaches the bezel from its first outline through the final close-up', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('matrix-rain/', { engine });
  try {
    const { samples, lenses } = await app.page.evaluate(async () => {
      const { makeScene, frame, paint } = await import(new URL('core.mjs', location.href).href);
      const portrait = new Image();
      portrait.src = 'nik-reflection.webp';
      await portrait.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scene = makeScene();
      const samples = [11.25, 13.16, 13.79, 14.5, 15.1, 16].map((time) => {
        const shot = frame(scene, time);
        // Compare with the same rain to measure only the visible person.
        const read = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        paint(ctx, shot, null);
        const rain = read();
        paint(ctx, shot, portrait);
        const composed = read();
        let top = canvas.height;
        let bottomPixels = 0;
        for (let y = 0; y < canvas.height; y++) {
          let changed = 0;
          for (let x = 0; x < canvas.width; x++) {
            const green = 4 * (y * canvas.width + x) + 1;
            if (Math.abs(composed[green] - rain[green]) > 2) changed++;
          }
          if (changed >= 5) top = Math.min(top, y);
          if (y >= canvas.height - 4) bottomPixels += changed;
        }
        return { top, bottomPixels };
      });
      // Put a bright glyph directly behind each lens in the final shot.
      const lensCenters = [394, 538];
      const y = 238;
      const closeup = {
        ...frame(scene, 16), crt: 0, rainBlur: 0, size: 90,
        glyphs: lensCenters.map((x) => ({ x, y, char: '█', alpha: 1, hot: true })),
      };
      const greenAtLenses = () => lensCenters.map((x) => ctx.getImageData(x, y, 1, 1).data[1]);
      paint(ctx, closeup, null);
      const background = greenAtLenses();
      paint(ctx, closeup, portrait);
      const composed = greenAtLenses();
      paint(ctx, { ...closeup, glyphs: [] }, portrait);
      return { samples, lenses: { background, composed, tint: greenAtLenses() } };
    });
    assert.equal(samples[0].top, 540, 'the title lock precedes the reflection');
    assert.ok(samples[1].top > 100 && samples[1].top < 160, 'the outline fills about 3/4 of the screen');
    assert.ok(samples.slice(1).every((s) => s.bottomPixels > 5), 'a visible reflection meets the lower edge');
    assert.ok(lenses.background.every((green) => green > 200));
    assert.deepEqual(lenses.composed, lenses.tint, 'rain behind the lenses preserves their photographed tint');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('the studio fills a wide viewport and keeps the whole film and transport visible', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('matrix-rain/', { engine });
  try {
    const viewports = [[2543, 1209], [1440, 900], [1024, 600], [390, 844], [320, 665]];
    for (const [width, height] of viewports) {
      await app.page.setViewportSize({ width, height });
      const layout = await app.page.evaluate(() => {
        const bounds = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          header: bounds('.header-row'),
          sidebar: bounds('.controls'),
          preview: bounds('.preview'),
          stage: bounds('.monitor'),
          film: bounds('#screen'),
          playback: bounds('#video'),
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
        };
      });
      assert.equal(layout.pageWidth, width);
      assert.equal(layout.header.width, width);
      assert.ok(layout.playback.bottom <= height);
      assert.ok(Math.abs(layout.film.width - layout.film.height * 16 / 9) < 1);
      const fittedWidth = Math.min(layout.stage.width, layout.stage.height * 16 / 9);
      assert.ok(Math.abs(layout.film.width - fittedWidth) < 1);
      if (width > 760) {
        assert.equal(layout.pageHeight, height);
        assert.equal(layout.sidebar.left, 0);
        assert.equal(layout.preview.left, layout.sidebar.right);
        assert.equal(layout.preview.right, width);
        assert.equal(layout.sidebar.bottom, height);
        assert.equal(layout.preview.bottom, height);
        assert.ok(layout.stage.height > height * 0.65);
      } else {
        assert.equal(layout.preview.bottom, layout.sidebar.top);
        assert.ok(layout.film.width > width * 0.9);
      }
    }
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
