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
  const select = page.locator('#scheme');
  const initial = await select.inputValue();
  await select.selectOption('bold');
  await shortcut(page, 'Control+z');
  await expect(select).toHaveValue(initial);
  await shortcut(page, 'Meta+Shift+z');
  await expect(select).toHaveValue('bold');
  await shortcut(page, 'Meta+z');
  await expect(select).toHaveValue(initial);
  const field = page.locator('#messages').first();
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
    const app = state.MessageCollage;
    state.historyBefore = { result: app.getResult(), svg: await app.exportSvgText() };
    await app.submit({messages:['Thank you','Good luck'],fonts:['Inter'],styles:['plain'],runs:1});
    state.historyAfter = { result: app.getResult(), svg: await app.exportSvgText() };
  });
  await shortcut(page, 'Control+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.MessageCollage.getResult() === w.historyBefore.result && await w.MessageCollage.exportSvgText() === w.historyBefore.svg;
  })).toBe(true);
  await shortcut(page, 'Control+Shift+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.MessageCollage.getResult() === w.historyAfter.result && await w.MessageCollage.exportSvgText() === w.historyAfter.svg;
  })).toBe(true);
});

test('history reverses file additions and retains settings across clear and redo', async ({ page }) => {
  await open(page);
  const file = (/** @type {string} */ text) => ({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.locator('#upload').setInputFiles(file('Thank you'));
  await expect(page.locator('#messages')).toHaveValue('Thank you');
  await page.locator('#upload').setInputFiles(file('Good luck'));
  await expect(page.locator('#messages')).toHaveValue('Thank you\nGood luck');
  await shortcut(page, 'Control+z');
  await expect(page.locator('#messages')).toHaveValue('Thank you');
  await shortcut(page, 'Control+Shift+z');
  await expect(page.locator('#messages')).toHaveValue('Thank you\nGood luck');
  await page.locator('#fill').fill('0.5');
  await page.locator('#clear').click();
  await page.locator('#undo-replace').click();
  await expect(page.locator('#messages')).toHaveValue('Thank you\nGood luck');
  await expect(page.locator('#fill')).toHaveValue('0.5');
  await page.locator('#redo').click();
  await expect(page.locator('#messages')).toHaveValue('');
});

test('undo cancels an active collage without a late status or result overwrite', async ({ page }) => {
  await open(page);
  await page.locator('#runs').fill('1000');
  const status = await page.locator('#status').textContent();
  await page.locator('#generate').click();
  await shortcut(page, 'Control+z');
  await expect(page.locator('#runs')).toHaveValue('20');
  await expect(page.locator('#generate')).toBeEnabled();
  await expect(page.locator('#stop')).toBeDisabled();
  // The canceled worker's catch/finally settle before inspecting the restored status.
  await page.waitForTimeout(100);
  await expect(page.locator('#status')).toHaveText(status ?? '');
});
