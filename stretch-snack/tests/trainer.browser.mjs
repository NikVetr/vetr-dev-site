import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium' | 'webkit' | 'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

test('the studio frames every movement at rest and at full reach on either side', async () => {
  const app = await openPage('stretch-snack/', { width: 390, height: 844, engine });
  try {
    const clipped = await app.page.evaluate(async () => {
      const { renderMovement } = await import(new URL('./demo.js', document.baseURI).href);
      const { moves } = await import(new URL('./core/catalog.js', document.baseURI).href);
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:320px;height:220px';
      document.body.append(canvas);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const failures = [];
      for (const move of moves)
        for (const time of [0, 2, 6]) {
          renderMovement(canvas, move, time, { location: 'roomy-seat' });
          const { width, height } = canvas;
          const pixels = ctx.getImageData(0, 0, width, height).data;
          const opaque = (x, y) => pixels[4 * (y * width + x) + 3] > 128;
          let edge = false;
          for (let x = 0; x < width; x++) edge ||= opaque(x, 0) || opaque(x, height - 1);
          for (let y = 0; y < height; y++) edge ||= opaque(0, y) || opaque(width - 1, y);
          if (edge || !pixels.some((v, i) => i % 4 === 3 && v === 255)) failures.push([move.id, time]);
        }
      return failures;
    });
    assert.deepEqual(clipped, []);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('intersecting surfaces occlude each other according to depth at each pixel', async () => {
  const app = await openPage('stretch-snack/', { engine });
  try {
    const result = await app.page.evaluate(async () => {
      const { drawSurface } = await import(new URL('./surface.js', document.baseURI).href);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const sample = (x) => Array.from(ctx.getImageData(x, 18, 1, 1).data);
      const colors = [];
      for (const reverse of [false, true]) {
        ctx.clearRect(0, 0, 64, 64);
        const faces = [
          {
            pts: [
              [2, 2, -1],
              [62, 2, 1],
              [32, 60, 0],
            ],
            color: '#d92b25',
          },
          {
            pts: [
              [2, 2, 1],
              [62, 2, -1],
              [32, 60, 0],
            ],
            color: '#236bd9',
          },
        ];
        drawSurface(
          ctx,
          64,
          64,
          (p) => p,
          (mesh) => {
            for (const f of reverse ? faces.reverse() : faces) {
              mesh.triangles(f.pts, [reverse ? [0, 2, 1] : [0, 1, 2]], f.color);
            }
          },
        );
        colors.push([sample(18), sample(46), sample(0)]);
      }
      return colors;
    });
    for (const [left, right, outside] of result) {
      assert.ok(left[2] > left[0] && right[0] > right[2]);
      assert.equal(outside[3], 0);
    }
    assert.deepEqual(result[0], result[1]);
  } finally {
    await app.close();
  }
});
