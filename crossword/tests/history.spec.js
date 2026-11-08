import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}
/** @param {import('@playwright/test').Page} page @param {string} key */
async function shortcut(page, key) {
  await page.locator('h1').click();
  await page.keyboard.press(key);
}

test('workspace history supports both modifiers, redo, branching and native text undo', async ({ page }) => {
  await open(page);
  const select = page.locator('#picture-distance');
  const initial = await select.inputValue();
  await select.selectOption('exact');
  await shortcut(page, 'Control+z');
  await expect(select).toHaveValue(initial);
  await shortcut(page, 'Meta+Shift+z');
  await expect(select).toHaveValue('exact');
  await shortcut(page, 'Meta+z');
  await expect(select).toHaveValue(initial);
  const field = page.locator('#entries').first();
  const typed = await field.inputValue();
  await field.focus();
  await field.press('End');
  await field.pressSequentially('x');
  await field.press('Control+z');
  await expect(field).toHaveValue(typed);
  await field.pressSequentially(' new');
  await page.locator('h1').click();
  await expect(page.locator('#redo')).toBeDisabled();
});

test('history restores generated result references and exact exports without recalculating', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const state = /** @type {any} */ (window);
    const app = state.Crossword;
    state.historyBefore = { result: app.getResult(), svg: await app.exportSvgText() };
    await app.submit({entries:[{answer:'rain'},{answer:'wind'},{answer:'snow'}],search:{nIter:2,seed:4}});
    state.historyAfter = { result: app.getResult(), svg: await app.exportSvgText() };
  });
  await shortcut(page, 'Control+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.Crossword.getResult() === w.historyBefore.result && await w.Crossword.exportSvgText() === w.historyBefore.svg;
  })).toBe(true);
  await shortcut(page, 'Control+Shift+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.Crossword.getResult() === w.historyAfter.result && await w.Crossword.exportSvgText() === w.historyAfter.svg;
  })).toBe(true);
});

test('history restores image targets and greedy/refined result selection', async ({ page }) => {
  await open(page);
  const target = await page.evaluate(() => /** @type {any} */ (window).Crossword.getRequest().target);
  await page.locator('#target-none').click();
  await expect(page.locator('#target-status')).toContainText('No picture');
  await shortcut(page, 'Control+z');
  expect(await page.evaluate(() => /** @type {any} */ (window).Crossword.getRequest().target)).toEqual(target);
  await shortcut(page, 'Control+Shift+z');
  await expect(page.locator('#target-status')).toContainText('No picture');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    ctx.fillRect(0, 0, 4, 4); return c.toDataURL().split(',')[1];
  });
  await page.locator('#target-file').setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('#target-status')).toContainText('square.png');
  await shortcut(page, 'Control+z');
  await expect(page.locator('#target-status')).toContainText('No picture');
  await shortcut(page, 'Control+Shift+z');
  await expect(page.locator('#target-status')).toContainText('square.png');
  const refined = await page.locator('#score').textContent();
  await page.getByLabel('Greedy layout').check();
  await shortcut(page, 'Meta+z');
  await expect(page.getByLabel('After refinement')).toBeChecked();
  await expect(page.locator('#score')).toHaveText(refined ?? '');
  await shortcut(page, 'Meta+Shift+z');
  await expect(page.getByLabel('Greedy layout')).toBeChecked();
});

test('undo prevents a pending example from replacing the restored answers or feedback', async ({ page }) => {
  await open(page);
  await page.locator('#entries').fill('Frozen drop : Hail\nMoving air : Wind');
  await page.locator('#clear-entries').click();
  /** @type {()=>void} */ let release = () => {};
  const gate = new Promise(resolve => { release = () => resolve(undefined); });
  await page.route('**/examples/heart-example.json', async route => { await gate; await route.continue(); });
  const request = page.waitForRequest('**/examples/heart-example.json');
  await page.locator('#load-example').click();
  await request;
  await shortcut(page, 'Control+z');
  await expect(page.locator('#entries')).toHaveValue('Frozen drop : Hail\nMoving air : Wind');
  release();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#entries')).toHaveValue('Frozen drop : Hail\nMoving air : Wind');
  await expect(page.locator('#undo-note')).toBeHidden();
});
