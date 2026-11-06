// Browser smoke tests: npx playwright test (from signature/).
import { expect, test } from '@playwright/test';

/** Draws a wave across the pad with the mouse, in small steps. @param {import('@playwright/test').Page} page */
async function drawWithMouse(page) {
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#pad').boundingBox());
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    await page.mouse.move(box.x + box.width * (0.15 + 0.7 * t), box.y + box.height * (0.5 - 0.25 * Math.sin(t * 9)));
  }
  await page.mouse.up();
}

test('opens on the example, exposes the API, and exports a transparent PNG at its resolution', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await expect(page.locator('#pad-info')).toHaveText('8 strokes, 358 points, timed');
  await expect(page.locator('#status')).toHaveText('8 strokes, width from signing speed');
  const api = await page.evaluate(async () => {
    const S = window.Signature;
    const svg = S.exportSvgText();
    const own = S.submit(S.getRequest()).svg === svg;
    let error = null;
    try { S.load({ csv: 'x,y\n0,0\n1,1', smooth: { wavelet: { keepEnergy: 3 } }, colour: 1 }); } catch (e) { error = { name: e.name, paths: e.issues.map((i) => i.path).sort() }; }
    const png = new Uint8Array(await (await S.exportPngBlob({ height: 1, unit: 'in', dpi: 200 })).arrayBuffer());
    const chunks = [];
    for (let at = 8; at < png.length;) {
      const len = new DataView(png.buffer).getUint32(at);
      chunks.push(String.fromCharCode(...png.subarray(at + 4, at + 8)));
      if (chunks.at(-1) === 'pHYs') chunks.push(new DataView(png.buffer).getUint32(at + 8));
      at += 12 + len;
    }
    const bmp = await createImageBitmap(new Blob([png]));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const corner = ctx.getImageData(0, 0, 1, 1).data[3];
    return { svgStart: svg.slice(0, 40), own, error, chunks: chunks.filter((x) => x === 'pHYs' || typeof x === 'number'), height: bmp.height, corner };
  });
  expect(api.svgStart).toBe('<svg xmlns="http://www.w3.org/2000/svg" ');
  expect(api.own).toBe(true);
  expect(api.error).toEqual({ name: 'SignatureError', paths: ['colour', 'smooth.wavelet.keepEnergy'] });
  expect(api.chunks).toEqual(['pHYs', Math.round(200 / 0.0254)]);
  expect(api.height).toBe(200);
  expect(api.corner).toBe(0);
  expect(errors).toEqual([]);
});

test('draws with the mouse, corrects as it goes, undoes, and brushes a region', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await page.click('#clear');
  await expect(page.locator('#result-empty')).toBeVisible();
  await drawWithMouse(page);
  await expect(page.locator('#pad-info')).toContainText('1 stroke,');
  await expect(page.locator('#pad-info')).toContainText('timed');
  await page.waitForFunction(() => window.Signature.getResult()?.strokes.length === 1);
  expect(await page.evaluate(() => window.Signature.getResult().widthSource)).toBe('speed');
  // a setting changes the correction
  const before = await page.evaluate(() => window.Signature.exportSvgText());
  await page.locator('[data-path="smooth.fourier.strength"]').fill('6');
  await page.waitForFunction((b) => window.Signature.exportSvgText() !== b, before);
  // brush a stretch of the stroke to smooth it more
  await page.check('input[name="brush"][value="more"]', { force: true });
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#result').boundingBox());
  const stroke = await page.evaluate(() => {
    const r = window.Signature.getResult();
    const c = document.getElementById('result');
    const rect = c.getBoundingClientRect();
    const [bx, by, bw, bh] = r.viewBox;
    const s = Math.min(rect.width * 0.94 / bw, rect.height * 0.94 / bh);
    const pt = r.strokes[0].points[Math.floor(r.strokes[0].points.length / 2)];
    return { x: rect.width / 2 + s * (pt[0] - bx - bw / 2), y: rect.height / 2 + s * (pt[1] - by - bh / 2) };
  });
  await page.mouse.move(box.x + stroke.x - 10, box.y + stroke.y);
  await page.mouse.down();
  await page.mouse.move(box.x + stroke.x + 10, box.y + stroke.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#brush-info')).toContainText('＋ 1 region smoothed more');
  expect(await page.evaluate(() => window.Signature.getRequest().smooth.local.length)).toBeGreaterThan(0);
  await page.click('#undo');
  await expect(page.locator('#result-empty')).toBeVisible();
  await expect(page.locator('#brush-info')).toHaveText('No brushed regions.');
});

test('Undo after Clear or Import shows the signature as it was', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => /** @type {any} */ (window).Signature?.getResult());
  const pad = () => page.evaluate(() => /** @type {HTMLCanvasElement} */ (document.getElementById('pad')).toDataURL());
  const before = await pad();
  await page.click('#clear');
  await page.click('#undo');
  expect(await pad()).toBe(before);
  await page.setInputFiles('#import', new URL('../examples/juno-marsh.csv', import.meta.url).pathname);
  await expect.poll(pad).not.toBe(before);
  await page.click('#undo');
  expect(await pad()).toBe(before);
});

test('Undo restores local corrections after Clear, import and example replacement', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => /** @type {any} */ (window).Signature?.getResult());
  const local = [{ stroke: 0, from: 0.1, to: 0.8, strength: 3 }];
  const before = await page.evaluate((local) => {
    const request = /** @type {any} */ (window).Signature.getRequest();
    request.smooth.local = local;
    /** @type {any} */ (window).Signature.load(request);
    return /** @type {any} */ (window).Signature.exportSvgText();
  }, local);
  const regions = () => page.evaluate(() => /** @type {any} */ (window).Signature.getRequest().smooth.local);
  const restored = async () => {
    await expect.poll(regions).toEqual(local);
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).Signature.exportSvgText())).toBe(before);
    await expect(page.locator('#brush-info')).toHaveText('＋ 1 region smoothed more');
  };

  await page.click('#clear');
  await expect.poll(regions).toEqual([]);
  await page.click('#undo');
  await restored();

  await page.setInputFiles('#import', new URL('../examples/juno-marsh.csv', import.meta.url).pathname);
  await expect.poll(regions).toEqual([]);
  await page.click('#undo');
  await restored();

  await page.click('#example');
  await expect.poll(regions).toEqual([]);
  await page.click('#undo');
  await restored();

  // A JSON request can carry different local corrections; Undo must retain the previous set.
  await page.evaluate(() => {
    const request = /** @type {any} */ (window).Signature.getRequest();
    request.smooth.local = [{ stroke: 1, from: 0, to: 1, strength: 0.5 }];
    /** @type {any} */ (window).Signature.load(request);
  });
  await page.click('#undo');
  await restored();
});

test('morphs into the second example and plays when asked', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await page.click('#morph-example');
  await expect(page.locator('#morph-play')).toBeEnabled();
  await expect(page.locator('#filmstrip li')).toHaveCount(5);
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#morph-play');
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#morph-p')).not.toHaveValue('0');
  await page.click('#morph-play');
  await expect(page.locator('#morph-play')).toHaveText('▶ Play');
  await page.locator('#morph-p').fill('120');
  await expect(page.locator('#morph-p-out')).toHaveText('100%');
  // with reduced motion, Play runs one cycle there and back, then stops on its own
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#morph-p').fill('0');
  await page.click('#morph-play');
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'false', { timeout: 8000 });
});

test('a moved slider keeps the thinnest pen at most the thickest, and a bad field is named by its label', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await page.locator('[data-path="width.min"]').fill('6');
  await expect(page.locator('[data-path="width.max"]')).toHaveValue('6');
  await expect(page.locator('#issues')).toBeHidden();
  await page.click('details.more summary >> text=More smoothing settings');
  await page.locator('[data-path="smooth.wavelet.levels"]').fill('lots');
  await page.locator('[data-path="smooth.wavelet.levels"]').press('Enter');
  await page.locator('[data-path="smooth.wavelet.levels"]').blur();
  await expect(page.locator('#issues')).toContainText('Wavelet levels (auto or 1–12): must be');
  await expect(page.locator('[data-path="smooth.wavelet.levels"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#stale')).toBeVisible();
});

test('fits a 390 px phone without sideways scrolling and takes a finger-drawn stroke', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.click('#clear');
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#pad').boundingBox());
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const cdp = await context.newCDPSession(page);
  const at = (/** @type {number} */ t) => [{ x: box.x + box.width * (0.1 + 0.8 * t), y: box.y + box.height * (0.5 + 0.2 * Math.sin(t * 7)) }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= 30; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / 30) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#pad-info')).toContainText('1 stroke,');
  await page.waitForFunction(() => window.Signature.getResult()?.strokes.length === 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await context.close();
});
