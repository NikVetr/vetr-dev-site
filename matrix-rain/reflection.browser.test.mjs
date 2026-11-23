import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../scripts/landing-art/browser.mjs';

test('the early portrait reaches the bezel and disappears before the rain reaches its footprint', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('matrix-rain/', { engine });
  try {
    const { samples, black } = await app.page.evaluate(async () => {
      const { makeScene, frame, paint } = await import(new URL('core.mjs', location.href).href);
      const portrait = new Image();
      portrait.src = 'nik-reflection.webp';
      await portrait.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scene = makeScene({crt: 0});
      const samples = [0, .9, 1.5, 2.4, 2.8, 4.75, 14.75].map((time) => {
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
        const topBound = Math.floor(canvas.height * (1 - shot.imageZoom));
        const rainOnPortrait = rain.some((channel, i) => i % 4 === 1 && i >= topBound * canvas.width * 4 && channel > 9);
        return { top, bottomPixels, rainOnPortrait };
      });
      paint(ctx, frame(scene, 16), portrait);
      const pixels = ctx.getImageData(0, 0, 960, 540).data;
      return {
        samples,
        black: pixels.every((v, i) => v === (i % 4 === 3 ? 255 : 0)),
      };
    });
    assert.equal(samples[0].top, 540);
    assert.ok(samples[1].top > 100 && samples[1].top < 160);
    assert.ok(samples.slice(1,4).every(s => s.bottomPixels > 5));
    assert.ok(samples.slice(4).every(s => s.top === 540 && s.bottomPixels === 0));
    assert.ok(samples.slice(0,4).every(s => !s.rainOnPortrait));
    assert.ok(samples[5].rainOnPortrait);
    assert.ok(black);
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

test('an uploaded image fades into and out of the early rain', async () => {
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
      const color = (time) => {
        const image = inspect(time);
        return [...image.slice(4 * (300 * 960 + 480), 4 * (300 * 960 + 480) + 3)];
      };
      return { entrance: color('0.875'), bright: color('1.5'), exit: color('2.4'), late: color('13.49') };
    });
    assert.ok(pixels.bright[0] > 200 && pixels.bright[1] < 55, 'uploaded red square visible during the opening');
    assert.ok(pixels.entrance[0] < pixels.bright[0] && pixels.exit[0] < pixels.bright[0] && pixels.exit[0] > 20);
    assert.ok(pixels.late[0] < 40);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
