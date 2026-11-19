import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../scripts/landing-art/browser.mjs';

test('the reflected figure reaches the bezel from its first outline through the final close-up', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('matrix-rain/', { engine });
  try {
    const { samples, lenses, black } = await app.page.evaluate(async () => {
      const { makeScene, frame, paint } = await import(new URL('core.mjs', location.href).href);
      const portrait = new Image();
      portrait.src = 'nik-reflection.webp';
      await portrait.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scene = makeScene();
      const samples = [11.25, 13.16, 13.79, 14.5, 15.1, 15.55].map((time) => {
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
      // At full magnification a bright glyph behind the lens must leave its
      // photographed tint intact. Both edges of the frame should sample glass.
      const closeup = {
        ...frame(scene, 15.55),
        crt: 0,
        rainBlur: 0,
        size: 90,
        glyphs: [{ x: 480, y: 270, char: '█', alpha: 1, hot: true }],
      };
      const green = (x) => ctx.getImageData(x, 270, 1, 1).data[1];
      paint(ctx, closeup, null);
      const background = green(480);
      paint(ctx, closeup, portrait);
      const composed = green(480);
      paint(ctx, { ...closeup, glyphs: [] }, portrait);
      const tint = green(480);
      const source = document.createElement('canvas');
      source.width = portrait.width;
      source.height = portrait.height;
      const photo = source.getContext('2d');
      photo.drawImage(portrait, 0, 0);
      const scale = Math.min(960 / portrait.width, 540 / portrait.height) * closeup.imageZoom;
      for (const x of [120, 480, 840]) {
        const srcX = Math.floor(0.557 * portrait.width + (x - 480) / scale);
        const srcY = Math.floor(0.3 * portrait.height);
        const expected = photo.getImageData(srcX, srcY, 1, 1).data[1];
        if (Math.abs(green(x) - expected) > 4) throw new Error('Final crop missed the sunglass lens');
      }
      paint(ctx, frame(scene, 16), portrait);
      const pixels = ctx.getImageData(0, 0, 960, 540).data;
      return {
        samples,
        lenses: { background, composed, tint },
        black: pixels.every((v, i) => v === (i % 4 === 3 ? 255 : 0)),
      };
    });
    assert.equal(samples[0].top, 540, 'the title lock precedes the reflection');
    assert.ok(samples[1].top > 100 && samples[1].top < 160, 'the outline fills about 3/4 of the screen');
    assert.ok(
      samples.slice(1).every((s) => s.bottomPixels > 5),
      'a visible reflection meets the lower edge',
    );
    assert.ok(lenses.background > 200);
    assert.ok(black, 'the opening ends at full black');
    assert.deepEqual(
      lenses.composed,
      lenses.tint,
      'rain behind the lenses preserves their photographed tint',
    );
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('the studio fills a wide viewport and keeps the whole film and transport visible', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('matrix-rain/', { engine });
  try {
    const viewports = [
      [2543, 1209],
      [1440, 900],
      [1024, 600],
      [390, 844],
      [320, 665],
    ];
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
      assert.ok(Math.abs(layout.film.width - (layout.film.height * 16) / 9) < 1);
      const fittedWidth = Math.min(layout.stage.width, (layout.stage.height * 16) / 9);
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

test('an uploaded image supplies its own green edges and then the original color photograph', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('matrix-rain/', { engine });
  try {
    const { page } = app;
    const photo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 160;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 160, 160);
      ctx.fillStyle = '#ff2040'; ctx.fillRect(52, 24, 56, 112);
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#image').setInputFiles({ name: 'custom.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
    await page.locator('#reset-image').waitFor();
    const pixels = await page.evaluate(() => {
      const seek = /** @type {HTMLInputElement} */ (document.getElementById('time'));
      const crt = /** @type {HTMLInputElement} */ (document.getElementById('crt'));
      crt.value = '0'; crt.dispatchEvent(new Event('input'));
      const ctx = document.querySelector('canvas').getContext('2d');
      function inspect(time) {
        seek.value = time; seek.dispatchEvent(new Event('input'));
        return ctx.getImageData(0, 0, 960, 540).data;
      }
      const outline = inspect('13.49');
      const indices = [];
      for (let x = 300; x <= 660; x++)
        if (outline[4 * (300 * 960 + x) + 1] > 30) indices.push(x);
      const face = inspect('15.5');
      return { indices, center: [...face.slice(4 * (270 * 960 + 480), 4 * (270 * 960 + 480) + 3)] };
    });
    assert.ok(pixels.indices.length >= 4 && pixels.indices.length < 22);
    assert.ok(pixels.indices[0] < 415 && pixels.indices.at(-1) > 545);
    assert.ok(pixels.center[0] > 180 && pixels.center[1] < 55);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
