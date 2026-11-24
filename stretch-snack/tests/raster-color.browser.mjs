import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

test('triangle colors use the RGBA view supplied by ImageData, including its byte offset', async () => {
  const app = await openPage('stretch-snack/', { engine });
  try {
    const result = await app.page.evaluate(async () => {
      const { drawSurface } = await import(new URL('surface.js', location.href).href);
      const proto = CanvasRenderingContext2D.prototype;
      const original = proto.createImageData;
      // This is a legal ImageData with padding at the beginning and end of its backing store.
      const prefix = 3,
        suffix = 5;
      let backing = new Uint8ClampedArray(0),
        length = 0;
      /** @param {number} width @param {number} height */
      function offsetImage(width, height) {
        length = width * height * 4;
        backing = new Uint8ClampedArray(prefix + length + suffix).fill(61);
        const view = backing.subarray(prefix, prefix + length);
        view.fill(0);
        return new ImageData(view, width, height);
      }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 48;
      const ctx = canvas.getContext('2d');
      proto.createImageData = /** @type {typeof original} */ (offsetImage);
      try {
        const points = [
          [4, 4, 0],
          [44, 4, 0],
          [44, 44, 0],
          [4, 44, 0],
        ];
        drawSurface(
          ctx,
          48,
          48,
          (p) => p,
          (mesh) => {
            mesh.triangles(
              points,
              [
                [0, 1, 2],
                [3, 2, 0],
              ],
              '#00ffff',
            );
          },
          { density: 1, ambient: 1 },
        );
        const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
        return {
          samples: [pixel(32, 12), pixel(12, 32), pixel(1, 1)],
          prefix: [...backing.subarray(0, prefix)],
          suffix: [...backing.subarray(prefix + length)],
        };
      } finally {
        proto.createImageData = original;
      }
    });
    assert.deepEqual(result.samples, [
      [0, 255, 255, 255],
      [0, 255, 255, 255],
      [0, 0, 0, 0],
    ]);
    assert.ok([...result.prefix, ...result.suffix].every((byte) => byte === 61));
  } finally {
    await app.close();
  }
});

test('solid surfaces preserve their material hue on narrow triangles while ring colors blend', async () => {
  const app = await openPage('stretch-snack/', { engine });
  try {
    const samples = await app.page.evaluate(async () => {
      const { drawSurface } = await import(new URL('surface.js', location.href).href);
      const canvas = document.createElement('canvas');
      canvas.width = 108;
      canvas.height = 80;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const rgb = [105, 141, 162];
      const material = [];
      // Two facets share a lit crease. The third runs almost edge-on, through pixel centers.
      const points = [
        [3, 6, -22],
        [53, 6, 20],
        [39, 69, -18],
        [3, 70, 14],
        [80.497, 7, 8],
        [80.503, 7, -8],
        [80.5, 70, 3],
      ];
      for (const reverse of [false, true]) {
        const faces = [
          [0, 1, 2],
          [0, 2, 3],
          [4, 5, 6],
        ];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawSurface(
          ctx,
          108,
          80,
          (p) => p,
          (mesh) => {
            mesh.triangles(points, reverse ? faces.map((face) => face.reverse()) : faces, rgb);
          },
          { density: 1 },
        );
        const data = ctx.getImageData(0, 0, 108, 80).data;
        const brightness = new Set();
        let badHue = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] !== 255) continue;
          brightness.add(data[i]);
          // Each channel rounds independently to the nearest byte.
          if (
            Math.abs(data[i] / rgb[0] - data[i + 1] / rgb[1]) > 0.009 ||
            Math.abs(data[i + 1] / rgb[1] - data[i + 2] / rgb[2]) > 0.007
          )
            badHue++;
        }
        material.push({ levels: brightness.size, badHue, edgeAlpha: data[4 * (25 * 108 + 80) + 3] });
      }
      ctx.clearRect(0, 0, 108, 80);
      const ring = (y) => [
        [10, y, 0],
        [75, y, 0],
        [45, y, -20],
      ];
      drawSurface(
        ctx,
        108,
        80,
        (p) => p,
        (mesh) => {
          mesh.surface([ring(10), ring(70)], '#ff0000', ['#ff0000', '#0000ff']);
        },
        { density: 1, ambient: 1 },
      );
      const pixel = (y) => [...ctx.getImageData(45, y, 1, 1).data];
      return { material, top: pixel(16), middle: pixel(40), bottom: pixel(64) };
    });
    for (const { levels, badHue, edgeAlpha } of samples.material) {
      assert.ok(levels > 5, 'the broad surface has a lighting gradient');
      assert.equal(edgeAlpha, 255, 'the thin triangle passed through the sampled column');
      assert.equal(badHue, 0);
    }
    assert.ok(samples.top[0] > samples.top[2] + 100);
    assert.ok(samples.bottom[2] > samples.bottom[0] + 100);
    assert.ok(Math.abs(samples.middle[0] - samples.middle[2]) < 12);
    assert.equal(samples.middle[1], 0);
    assert.equal(samples.middle[3], 255);
  } finally {
    await app.close();
  }
});

test('seated heel lifts and the magnified hand retain their materials on a dark high-density phone canvas', async () => {
  const app = await openPage('stretch-snack/', { engine });
  try {
    const mobile = await app.page
      .context()
      .browser()
      .newContext({
        viewport: { width: 440, height: 956 },
        deviceScaleFactor: 3,
        colorScheme: 'dark',
        isMobile: engine !== 'firefox',
        hasTouch: true,
      });
    const page = await mobile.newPage();
    await page.goto(app.page.url());
    const frames = await page.evaluate(async () => {
      const { renderMovement } = await import(new URL('demo.js', location.href).href);
      const { movementCamera } = await import(new URL('camera.js', location.href).href);
      const { moves } = await import(new URL('core/catalog.js', location.href).href);
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:440px;height:500px;position:fixed;inset:0';
      document.body.append(canvas);
      const ctx = canvas.getContext('2d');
      const counts = [];
      for (const id of ['seated-heel-lift', 'seated-hand-open']) {
        const move = moves.find((m) => m.id === id);
        // The WebKit artifacts appear after the hot triangle loops have run for several frames.
        for (let frame = 0; frame < 100; frame++) {
          const time = frame / 12;
          renderMovement(canvas, move, time, { dark: true, location: 'plane-seat', camera: movementCamera(move) });
          if (frame % 10 !== 0 && frame !== 99) continue;
          const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let opaque = 0,
            magenta = 0,
            black = 0;
          for (let i = 0; i < rgba.length; i += 4) {
            if (rgba[i + 3] < 220) continue;
            opaque++;
            // No solid equipment, skin, or clothing in these two demos is near black.
            if (rgba[i + 3] === 255 && Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) < 24) black++;
            if (Math.min(rgba[i], rgba[i + 2]) - rgba[i + 1] > 30) magenta++;
          }
          counts.push({ id, time, magenta, black, opaque });
        }
      }
      return { dpr: devicePixelRatio, dark: matchMedia('(prefers-color-scheme: dark)').matches, counts };
    });
    assert.equal(frames.dpr, 3);
    assert.equal(frames.dark, true);
    for (const { id, time, opaque, magenta, black } of frames.counts) {
      assert.ok(opaque > 10000, id + ' renders a solid figure at ' + time);
      assert.equal(magenta, 0, id + ' contains unexpected magenta at ' + time);
      assert.equal(black, 0, id + ' contains an off-palette black surface at ' + time);
    }
    await mobile.close();
  } finally {
    await app.close();
  }
});
