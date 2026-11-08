import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return errors;
}
/** @param {import('@playwright/test').Page} page */
const frame = (page) => page.evaluate(() => /** @type {any} */ (window).Hypercube.getRequest().frame);
/** @param {import('@playwright/test').Page} page */
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/** The canvas has ink other than its background. @param {import('@playwright/test').Page} page */
const inked = (page) => page.evaluate(() => {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
  const data = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) ink++;
  return ink;
});

test('plays on load, shows the stage, and exposes the API and exports', async ({ page }) => {
  const errors = await open(page);
  const first = await frame(page);
  await page.waitForTimeout(400);
  expect(await frame(page)).toBeGreaterThan(first);
  await expect(page.locator('#play')).toHaveText('❚❚ Pause');
  await expect(page.locator('#timeline')).toHaveAttribute('max', '1448');
  expect(await inked(page)).toBeGreaterThan(100); // at least the spinning line

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).Hypercube;
    const result = await app.submit({ k: 4, frame: 714, style: 'opaque', render: 'geometry' });
    const png = await app.exportPngBlob();
    const webm = await app.exportWebmBlob({ frames: 12 });
    let error = null;
    try {
      await app.submit({ k: 4, frame: 0, colour: 'red' });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, paths: e.issues.map((/** @type {any} */ i) => i.path) };
    }
    return {
      stage: result.stage.label, numbers: result.geometry.faces.filter((/** @type {any} */ f) => f.number === 4).length,
      request: app.getRequest(), playing: app.isPlaying(),
      svg: app.exportSvgText().slice(0, 4), png: [png.type, png.size > 5000], webm: [webm.type, webm.size > 1000], error,
    };
  });
  expect(api).toEqual({
    stage: 'tesseract (ℝ⁴)', numbers: 6, playing: false, // R's six visible faces at this frame
    request: { k: 4, frame: 714, style: 'opaque', numerals: true, theme: 'light', camera: [1, 0, 0, 0] },
    svg: '<svg', png: ['image/png', true], webm: ['video/webm', true],
    error: { name: 'HypercubeError', code: 'invalid_request', paths: ['colour', 'frame'] },
  });
  // The rejected request left the page showing the accepted one.
  await expect(page.locator('#stage-name')).toHaveText('tesseract (ℝ⁴)');
  await expect(page.locator('#k')).toHaveValue('4');
  await expect(page.locator('#numerals-field')).toBeVisible();
  await expect(page.locator('#alpha-field')).toBeHidden();
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced motion: no autoplay; step, scrub, change k and style', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page);
  await expect(page.locator('#play')).toHaveText('▶︎ Play');
  await expect(page.locator('#stage-name')).toHaveText('ennearact (ℝ⁹)');
  const start = await frame(page);
  await page.waitForTimeout(300);
  expect(await frame(page)).toBe(start);
  await page.getByRole('button', { name: 'Frame ▶︎' }).click();
  expect(await frame(page)).toBe(start + 1);
  await page.locator('#view').focus();
  await page.keyboard.press(',');
  await page.keyboard.press(',');
  expect(await frame(page)).toBe(start - 1);
  await page.locator('#timeline').fill('200');
  await expect(page.locator('#stage-name')).toHaveText('square (ℝ²)');
  await expect(page.locator('#clock-frame')).toHaveText('frame 200 of 1448');
  await page.selectOption('#k', '5');
  await expect(page.locator('#timeline')).toHaveAttribute('max', '1518');
  await expect(page.locator('#alpha-note')).toContainText("R's default for 5 dimensions");
  await page.getByLabel('Opaque and lit').check();
  await expect(page.locator('#alpha-field')).toBeHidden();
  expect(await page.evaluate(() => /** @type {any} */ (window).Hypercube.isPlaying())).toBe(false);
  expect(errors).toEqual([]);
});

test('turning the view hides the numerals until Reset view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByLabel('Opaque and lit').check();
  await expect(page.locator('#reset-view')).toBeDisabled();
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#view').boundingBox());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#view-note')).toHaveClass(/turned/);
  await expect(page.locator('#view-note')).toContainText('numerals are hidden');
  expect(await page.evaluate(() => /** @type {any} */ (window).Hypercube.exportSvgText().includes('<text'))).toBe(true); // the caption only
  expect(await page.evaluate(() => (/** @type {any} */ (window).Hypercube.exportSvgText().match(/<text /g) ?? []).length)).toBe(1);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('#view-note')).not.toHaveClass(/turned/);
  expect(await page.evaluate(() => (/** @type {any} */ (window).Hypercube.exportSvgText().match(/<text /g) ?? []).length)).toBeGreaterThan(10);
  await page.locator('#view').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#reset-view')).toBeEnabled();
});

test('390 px: the viewer comes first and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  const view = /** @type {{ x: number, width: number, y: number }} */ (await page.locator('#view').boundingBox());
  const settings = /** @type {{ y: number }} */ (await page.locator('.settings-card').boundingBox());
  expect(view.width).toBeGreaterThan(300);
  expect(settings.y).toBeGreaterThan(view.y);
  expect(await noSideScroll(page)).toBe(true);
  expect(await inked(page)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('short landscape keeps the square, playback and timeline together without changing the frame', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page);
  const view = await page.locator('#view').boundingBox();
  if (!view) throw new Error('Hypercube canvas is not rendered');
  expect(view.height).toBeGreaterThanOrEqual(180);
  expect(view.width).toBe(view.height);
  expect(view.y + view.height).toBeLessThanOrEqual(390);
  for (const selector of ['.transport', '.timeline']) {
    const box = await page.locator(selector).boundingBox();
    if (!box) throw new Error(`${selector} is not rendered`);
    expect(box.x).toBeGreaterThan(view.x + view.width);
    expect(box.y + box.height).toBeLessThanOrEqual(390);
  }
  const first = await frame(page);
  await page.locator('#view').focus();
  await page.keyboard.press(',');
  expect(await frame(page)).toBe(first - 1);
  await page.keyboard.press('Tab');
  await expect(page.locator('#step-back')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#play')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveText('❚❚ Pause');
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveText('▶︎ Play');
  await page.locator('#timeline').focus();
  await page.keyboard.press('End');
  expect(await frame(page)).toBe(1448);
  const saved = await page.evaluate(() => /** @type {any} */ (window).Hypercube.exportSvgText());
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    expect(await noSideScroll(page)).toBe(true);
    expect(await page.evaluate(() => /** @type {any} */ (window).Hypercube.exportSvgText())).toBe(saved);
  }
  await page.locator('#k').focus();
  await expect(page.locator('#k')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('a plan that fails to load is reported, the old plan stays, and Try again recovers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  await page.route('**/plans/k5.json', (route) => (fail ? route.fulfill({ status: 404, body: '' }) : route.continue()));
  await open(page);
  await page.selectOption('#k', '5');
  await expect(page.locator('#load-issues')).toContainText('The k = 5 plan could not be loaded (HTTP 404). Still showing 9 dimensions.');
  await expect(page.locator('#k')).toHaveValue('9');
  await expect(page.locator('#stage-name')).toHaveText('ennearact (ℝ⁹)');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#load-issues')).toBeHidden();
  await expect(page.locator('#k')).toHaveValue('5');
});
