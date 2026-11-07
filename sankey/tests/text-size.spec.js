const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  await page.goto('/index.html');
  await page.evaluate(() => (/** @type {any} */ (window)).SankeyApp.loadExample('pathways'));
});

/** @param {import('@playwright/test').Page} page */
const snapshot = (page) => page.evaluate(() => {
  const app = (/** @type {any} */ (window)).SankeyApp;
  return {
    project: app.getProject(),
    widths: app.layout.flows.map((/** @type {{w: number}} */ f) => f.w),
    canvas: ['width', 'height'].map((name) => Number((/** @type {Element} */ (document.querySelector('#plot'))).getAttribute(name))),
  };
});

test('toolbar text sizing scales geometry, preserves data and supports undo and saved exports', async ({ page }) => {
  const before = await snapshot(page);
  const slider = page.getByRole('slider', { name: 'Text size (px)' });
  await expect(slider).toBeVisible();
  await slider.fill('26');
  await slider.press('Tab');
  await expect(page.locator('#ctl-fontSize')).toHaveValue('26');
  const after = await snapshot(page);
  for (const key of ['matrices', 'paths', 'valueScale', 'loc', 'view']) {
    expect(after.project[key]).toEqual(before.project[key]);
  }
  after.widths.forEach((/** @type {number} */ width, /** @type {number} */ i) => expect(width / before.widths[i]).toBeCloseTo(2, 7));
  expect(after.project.presentation).toEqual({ mode: 'native', zoom: 1 });
  await page.locator('#undo').click();
  expect((await snapshot(page)).project.style.fontSize).toBe(13);
  await page.locator('#redo').click();
  expect((await snapshot(page)).project.style.fontSize).toBe(26);

  const exported = await page.evaluate(() => {
    const app = (/** @type {any} */ (window)).SankeyApp;
    const project = app.getProject();
    const svg = app.exportSvgText();
    app.loadExample('labeled');
    app.submit({ type: 'project', project });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return { labels: [...doc.querySelectorAll('.node-label')].map((node) => Number(node.getAttribute('font-size'))),
      reloaded: app.getProject() };
  });
  expect(exported.labels).toHaveLength(11);
  expect(exported.labels.every((size) => size === 26)).toBe(true);
  expect(exported.reloaded.style).toEqual(after.project.style);
  expect(exported.reloaded.matrices).toEqual(before.project.matrices);
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(page.locator('#ctl-fontSize')).toHaveValue('26.5');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test(`text-size extremes keep labels clear and controls contained at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.evaluate(() => (/** @type {any} */ (window)).SankeyApp.loadExample('pathways'));
    for (const size of [4, 36, 13]) {
      await page.evaluate((pixels) => (/** @type {any} */ (window)).SankeyApp.setTextSize(pixels), size);
      const geometry = await page.evaluate(() => {
        const app = (/** @type {any} */ (window)).SankeyApp, R = (/** @type {any} */ (window)).SK.render;
        const collisions = [];
        const labels = app.layout.nodes.map((/** @type {any} */ node) => ({ node, box: R.labelGeometry(node, app.state.style).bounds }));
        for (const { node, box } of labels) {
          for (const other of app.layout.nodes) {
            if (node.id === other.id) continue;
            const halfHeight = Math.max(other.inPx, other.outPx, other.bodyHeightPx || 0) / 2;
            if (box.x0 < other.X + other.widthPx / 2 && box.x1 > other.X - other.widthPx / 2 &&
                box.y0 < other.Y + halfHeight && box.y1 > other.Y - halfHeight) collisions.push(`${node.label} / ${other.label}`);
          }
        }
        const control = (/** @type {Element} */ (document.querySelector('#text-size-control'))).getBoundingClientRect();
        const input = (/** @type {Element} */ (document.querySelector('#ctl-fontSize'))).getBoundingClientRect();
        return { collisions, pageOverflow: document.documentElement.scrollWidth - innerWidth,
          controlOverflow: input.right - control.right };
      });
      expect(geometry.collisions).toEqual([]);
      expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
      expect(geometry.controlOverflow).toBeLessThanOrEqual(0);
      await expect(page.locator('#banner')).toBeHidden();
    }
  });
}

test('text-size API rejects invalid sizes before altering the project', async ({ page }) => {
  const before = await snapshot(page);
  const failures = await page.evaluate(() => [0, -1, NaN, Infinity, '20'].map((size) => {
    try { (/** @type {any} */ (window)).SankeyApp.setTextSize(size); return false; }
    catch (error) { return error instanceof Error && error.name === 'SankeyError'; }
  }));
  expect(failures).toEqual([true, true, true, true, true]);
  expect(await snapshot(page)).toEqual(before);
});
