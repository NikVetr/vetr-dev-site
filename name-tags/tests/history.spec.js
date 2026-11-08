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
  const select = page.locator('#font');
  const initial = await select.inputValue();
  await select.selectOption('Source Serif Pro');
  await shortcut(page, 'Control+z');
  await expect(select).toHaveValue(initial);
  await shortcut(page, 'Meta+Shift+z');
  await expect(select).toHaveValue('Source Serif Pro');
  await shortcut(page, 'Meta+z');
  await expect(select).toHaveValue(initial);
  const field = page.locator('#names').first();
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
    const app = state.NameTags;
    state.historyBefore = { result: app.getResult(), svg: await app.exportSvgText() };
    await app.submit({names:['Grace Hopper'],decoration:'none'});
    state.historyAfter = { result: app.getResult(), svg: await app.exportSvgText() };
  });
  await shortcut(page, 'Control+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.NameTags.getResult() === w.historyBefore.result && await w.NameTags.exportSvgText() === w.historyBefore.svg;
  })).toBe(true);
  await shortcut(page, 'Control+Shift+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.NameTags.getResult() === w.historyAfter.result && await w.NameTags.exportSvgText() === w.historyAfter.svg;
  })).toBe(true);
});

test('history keeps imported assets and restores failure feedback', async ({ page }) => {
  await open(page);
  const original = await page.locator('#names').inputValue();
  await page.locator('#names-file').setInputFiles({ name: 'names.txt', mimeType: 'text/plain', buffer: Buffer.from('Li Wu') });
  await expect(page.locator('#names')).toHaveValue('Li Wu');
  await shortcut(page, 'Control+z');
  await expect(page.locator('#names')).toHaveValue(original);
  await shortcut(page, 'Control+Shift+z');
  await expect(page.locator('#names')).toHaveValue('Li Wu');
  await page.locator('#generate').click();
  await expect(page.locator('#issues')).toContainText('No DNA layout found');
  await shortcut(page, 'Control+z');
  await expect(page.locator('#issues')).toBeHidden();
  await shortcut(page, 'Control+Shift+z');
  await expect(page.locator('#issues')).toContainText('No DNA layout found');
  await expect(page.locator('#restarts')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#decoration').selectOption('logo');
  await page.locator('#logo-file').setInputFiles(new URL('fixtures/test_logo.svg', import.meta.url).pathname);
  const logo = await page.evaluate(() => /** @type {any} */ (window).NameTags.getRequest().logo.file);
  await shortcut(page, 'Meta+z');
  expect(await page.evaluate(() => /** @type {any} */ (window).NameTags.getRequest().logo.file)).toBeNull();
  await shortcut(page, 'Meta+Shift+z');
  expect(await page.evaluate(() => /** @type {any} */ (window).NameTags.getRequest().logo.file)).toBe(logo);
});

test('undo invalidates a pending example load and cancels active generation', async ({ page }) => {
  await open(page);
  await page.locator('#names').fill('Saved Name');
  await page.locator('#clear-names').click();
  /** @type {()=>void} */ let release = () => {};
  const gate = new Promise(resolve => { release = () => resolve(undefined); });
  await page.route('**/examples/historical-figures.txt', async route => { await gate; await route.continue(); });
  const request = page.waitForRequest('**/examples/historical-figures.txt');
  await page.locator('#load-example').click();
  await request;
  await shortcut(page, 'Control+z');
  await expect(page.locator('#names')).toHaveValue('Saved Name');
  release();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#names')).toHaveValue('Saved Name');
  await page.locator('#names').fill(Array(200).fill('Grace Hopper').join('\n'));
  await page.locator('#restarts').fill('1000');
  await page.locator('#generate').click();
  await shortcut(page, 'Control+z');
  await expect(page.locator('#generate')).toBeEnabled();
  await expect(page.locator('#stop')).toBeDisabled();
  await expect(page.locator('#restarts')).toHaveValue('20');
});
