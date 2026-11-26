import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

/** The mean distance between each tile's mean colour on the mosaic canvas and its cell's (with square tiles). */
const tileError = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const result = /** @type {any} */ (window).Photomosaic.getResult();
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('mosaic'));
  const data = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).getImageData(0, 0, canvas.width, canvas.height).data;
  const { rows, columns } = result.grid;
  const tw = canvas.width / columns;
  let total = 0;
  for (let i = 0; i < rows * columns; i++) {
    const x0 = (i % columns) * tw;
    const y0 = Math.floor(i / columns) * tw;
    const sum = [0, 0, 0];
    for (let y = y0; y < y0 + tw; y++) for (let x = x0; x < x0 + tw; x++) for (let c = 0; c < 3; c++) sum[c] += data[4 * (y * canvas.width + x) + c];
    total += Math.hypot(...sum.map((v, c) => v / (tw * tw) - result.cells[i][c]));
  }
  return { error: total / (rows * columns), sample: Array.from(data.subarray(0, 4000)).join() };
});

test('the adjustment redraws live without changing the match, and exports, undoes and redoes with it', async ({ page }) => {
  await open(page);
  await page.locator('#fit').selectOption('crop');
  const match = await page.evaluate(() => JSON.stringify(/** @type {any} */ (window).Photomosaic.getResult()));
  await expect(page.locator('#adjust-state')).toHaveText('off');
  await expect(page.locator('#adjust')).not.toHaveAttribute('data-on');
  const before = await tileError(page);

  for (const id of ['adjust-l', 'adjust-a', 'adjust-b']) await page.locator(`#${id}`).fill('100');
  await expect(page.locator('#adjust-l-value')).toHaveText('100%');
  await expect(page.locator('#adjust-state')).toHaveText('on');
  await expect(page.locator('#adjust')).toHaveAttribute('data-on', '');
  const after = await tileError(page);
  expect(after.sample).not.toBe(before.sample);
  // each photo's mean is now its cell's colour (in OKLab), so far closer to it in RGB too
  expect(after.error).toBeLessThan(before.error * 0.25);
  await expect(page.locator('#stale')).toBeHidden(); // a display option: the match stands
  expect(await page.evaluate(() => JSON.stringify(/** @type {any} */ (window).Photomosaic.getResult()))).toBe(match);

  const exports = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).Photomosaic;
    const bytes = async (/** @type {object} */ options) => Array.from(new Uint8Array(await (await app.exportPngBlob({ tileWidth: 8, ...options })).arrayBuffer())).join();
    let error = null;
    try {
      await app.exportPngBlob({ adjust: { L: 2, c: 1 } });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, paths: e.issues.map((/** @type {any} */ i) => i.path) };
    }
    const page = await bytes({});
    return { page: page === await bytes({ adjust: { L: 1, a: 1, b: 1 } }), plain: page === await bytes({ adjust: {} }), error };
  });
  expect(exports).toEqual({ page: true, plain: false, error: { name: 'PhotomosaicError', paths: ['adjust.L', 'adjust.c'] } });

  await page.locator('#adjust-detail').fill('60');
  const detailed = await tileError(page);
  expect(detailed.sample).not.toBe(after.sample);

  await page.locator('#undo').click();
  await expect(page.locator('#adjust-detail-value')).toHaveText('0%');
  expect((await tileError(page)).sample).toBe(after.sample);
  for (let i = 0; i < 3; i++) await page.locator('#undo').click();
  await expect(page.locator('#adjust-l-value')).toHaveText('0%');
  await expect(page.locator('#adjust-state')).toHaveText('off');
  expect((await tileError(page)).sample).toBe(before.sample);
  for (let i = 0; i < 4; i++) await page.locator('#redo').click();
  await expect(page.locator('#adjust-detail-value')).toHaveText('60%');
  expect((await tileError(page)).sample).toBe(detailed.sample);
});

test('the GPU drawing of the adjustment agrees with the core\'s', async ({ page }) => {
  await open(page);
  const agreement = await page.evaluate(async () => {
    const { createGpuAdjuster } = await import('./adjust-gl.js');
    const core = await import('./core/index.js');
    const gpu = createGpuAdjuster();
    if (!gpu) return 'no WebGL2';
    const W = 64;
    const H = 48;
    let s = 7;
    const rand = () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 2 ** 32);
    const image = new ImageData(W, H);
    const target = new OffscreenCanvas(W, H);
    const targetImage = new ImageData(W, H);
    for (let i = 0; i < image.data.length; i++) {
      image.data[i] = i % 4 === 3 ? 255 : Math.floor(rand() * 256);
      targetImage.data[i] = i % 4 === 3 ? 255 : Math.floor(rand() * 256);
    }
    /** @type {OffscreenCanvasRenderingContext2D} */ (target.getContext('2d')).putImageData(targetImage, 0, 0);
    const rects = [{ x: 0, y: 0, width: 30, height: 20 }, { x: 32, y: 0, width: 32, height: 30 }, { x: 4, y: 24, width: 20, height: 24 }];
    const colors = [[200, 60, 40], [40, 90, 200], [230, 220, 120]];
    gpu.load(image, rects);
    gpu.loadDetail(target);
    let worst = 0;
    for (const adjust of [{ L: 1, a: 0, b: 0, detail: 0 }, { L: 0.3, a: 1, b: 0.6, detail: 0 }, { L: 1, a: 1, b: 1, detail: 0.5 }]) {
      const canvas = new OffscreenCanvas(W, H);
      const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
      ctx.drawImage(gpu.render(core.tileDeltas(image.data, W, rects, colors), adjust), 0, 0);
      const drawn = ctx.getImageData(0, 0, W, H).data;
      const prepared = core.prepareAdjust(image.data, W, rects, colors);
      core.addDetail(prepared, targetImage.data);
      const expected = core.applyAdjust(prepared, adjust, new Uint8ClampedArray(image.data));
      for (let i = 0; i < drawn.length; i++) worst = Math.max(worst, Math.abs(drawn[i] - expected[i]));
    }
    return worst;
  });
  expect(agreement).toBeLessThanOrEqual(2); // 8-bit levels: rounding and the GPU's float arithmetic
});

test('uses per photo is explained, checked at the field, and marks the mosaic out of date until Generate', async ({ page }) => {
  await open(page);
  await expect(page.locator('#uses-note')).toContainText('how many cells one photo may fill');
  const uses = page.locator('#max-uses');
  await uses.fill('0');
  await expect(uses).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#grid-note')).toHaveText('Uses per photo must be a whole number from 1.');
  await expect(page.locator('#grid-note')).toHaveClass(/problem/);
  await uses.fill('2');
  await expect(uses).not.toHaveAttribute('aria-invalid');
  await expect(page.locator('#grid-note')).toContainText('each used at most 2 times');
  await expect(page.locator('#grid-note .large')).toHaveCount(0);
  await expect(page.locator('#stale')).toHaveText(/Out of date: the matching settings changed/);
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#stale')).toBeHidden();
  await expect(page.locator('#summary')).toContainText('each at most 2 times');
  await uses.fill('8');
  await expect(page.locator('#grid-note .large')).toContainText('A large assignment (3,456 cells, 3,536 photo places)');
  await page.locator('#undo').click();
  await expect(uses).toHaveValue('2');
  await expect(page.locator('#stale')).toBeHidden();
});

test('without WebGL2 the core draws the adjustment on the CPU', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    // @ts-ignore: a browser without WebGL2
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
  });
  await open(page);
  await page.locator('#fit').selectOption('crop');
  const before = await tileError(page);
  for (const id of ['adjust-l', 'adjust-a', 'adjust-b']) await page.locator(`#${id}`).fill('100');
  const after = await tileError(page);
  expect(after.error).toBeLessThan(before.error * 0.25);
  await page.locator('#adjust-detail').fill('60');
  expect((await tileError(page)).sample).not.toBe(after.sample);
});
