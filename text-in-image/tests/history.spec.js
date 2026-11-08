import { test, expect } from '@playwright/test';

const result = (page) => page.evaluate(() => /** @type {any} */ (window).TextInImage.exportSvgText());
const open = async (page) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
};

test('text edits and rendered results undo/redo separately, without rerendering', async ({ page }) => {
  await open(page);
  const originalText = await page.locator('#text').inputValue();
  const original = await result(page);
  await page.locator('#text').fill('A short new document.');
  await page.locator('#render').click();
  await expect(page.locator('#stale')).toBeHidden();
  const rendered = await result(page);
  expect(rendered).not.toBe(original);
  await page.locator('#render').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#text')).toHaveValue('A short new document.');
  expect(await result(page)).toBe(original);
  await page.keyboard.press('Meta+Shift+z');
  expect(await result(page)).toBe(rendered);
  expect(await page.evaluate(async () => {
    const api = /** @type {any} */ (window).TextInImage;
    const expected = new Uint8Array(await (await api.exportPngBlob()).arrayBuffer());
    const pending = api.exportPngBlob();
    api.undo();
    const actual = new Uint8Array(await (await pending).arrayBuffer());
    api.redo();
    return expected.length === actual.length && expected.every((value, i) => value === actual[i]);
  })).toBe(true);
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#text')).toHaveValue(originalText);
  await page.locator('#text').fill('A different branch.');
  await page.locator('#text').blur();
  await expect(page.locator('#redo')).toBeDisabled();
  await page.locator('#text').focus();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#text')).toHaveValue('A different branch.');
  expect(await result(page)).toBe(original);
});

test('Undo cancels an in-flight render and a rejected API call preserves redo', async ({ page }) => {
  await page.route('**/text-in-image/worker.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `const deliver = self.postMessage.bind(self); self.postMessage = (...args) => setTimeout(() => deliver(...args), 350);\n${await response.text()}` });
  });
  await open(page);
  const original = await result(page);
  await page.locator('#text').fill('Pending work.');
  await page.locator('#text').blur();
  await page.locator('#render').click();
  await expect(page.locator('html')).toHaveAttribute('data-busy', 'true');
  await page.locator('#undo-replace').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-busy');
  await page.waitForTimeout(500);
  expect(await result(page)).toBe(original);
  await expect(page.locator('#text')).not.toHaveValue('Pending work.');
  await page.evaluate(async () => { try { await /** @type {any} */ (window).TextInImage.submit({}); } catch {} });
  await expect(page.locator('#redo')).toBeEnabled();
  await page.locator('#redo').click();
  await expect(page.locator('#text')).toHaveValue('Pending work.');
  expect(await result(page)).toBe(original);
});

test('Undo invalidates a pending example load and releases its busy controls', async ({ page }) => {
  await open(page);
  const original = await page.locator('#text').inputValue();
  await page.locator('#text').fill('An edit before the pending example.');
  await page.locator('#text').blur();
  let release = () => {};
  const held = new Promise(resolve => { release = () => resolve(undefined); });
  await page.route('**/examples/alice-chapter-1.txt', async route => { await held; await route.continue(); });
  await page.locator('#load-example').click();
  await expect(page.locator('#load-example')).toBeDisabled();
  await page.locator('#undo-replace').click();
  await expect(page.locator('#load-example')).toBeEnabled();
  await expect(page.locator('#text')).toHaveValue(original);
  release();
  await page.waitForTimeout(400);
  await expect(page.locator('#text')).toHaveValue(original);
  await page.locator('#redo').click();
  await expect(page.locator('#text')).toHaveValue('An edit before the pending example.');
});
