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
  const select = page.locator('#table-objective');
  const initial = await select.inputValue();
  await select.selectOption('variance');
  await shortcut(page, 'Control+z');
  await expect(select).toHaveValue(initial);
  await shortcut(page, 'Meta+Shift+z');
  await expect(select).toHaveValue('variance');
  await shortcut(page, 'Meta+z');
  await expect(select).toHaveValue(initial);
  const field = page.locator('#guest-rows textarea').first();
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
    const app = state.Seating;
    state.historyBefore = { result: app.getResult(), svg: await app.exportSvgText() };
    await app.submit({guests:['Ann','Bo','Cy','Di'].map((id,i)=>({id,category:i%2})),tables:{seats:2},options:{iterations:10,seed:1}});
    state.historyAfter = { result: app.getResult(), svg: await app.exportSvgText() };
  });
  await shortcut(page, 'Control+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.Seating.getResult() === w.historyBefore.result && await w.Seating.exportSvgText() === w.historyBefore.svg;
  })).toBe(true);
  await shortcut(page, 'Control+Shift+z');
  expect(await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    return w.Seating.getResult() === w.historyAfter.result && await w.Seating.exportSvgText() === w.historyAfter.svg;
  })).toBe(true);
});

test('history restores editable rows and request files while dialogs retain native shortcuts', async ({ page }) => {
  await open(page);
  await page.locator('#add-guest').click();
  await expect(page.locator('#guest-rows tr')).toHaveCount(40);
  await page.locator('#undo-replace').click();
  await expect(page.locator('#guest-rows tr')).toHaveCount(39);
  await page.locator('#redo').click();
  await expect(page.locator('#guest-rows tr')).toHaveCount(40);
  await page.getByRole('button', { name: 'Remove guest 40', exact: true }).click();
  const request = { guests: ['Ann','Bo','Cy','Di'].map((id, i) => ({ id, category: i % 2 })), tables: { seats: 2 }, options: { iterations: 10 } };
  await page.locator('#request-file').setInputFiles({ name: 'party.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(request)) });
  await expect(page.locator('#guest-count')).toHaveText('4 guests');
  await expect(page.locator('#status')).toContainText('Found in');
  await shortcut(page, 'Control+z');
  await expect(page.locator('#guest-count')).toHaveText('39 guests');
  await shortcut(page, 'Control+Shift+z');
  await expect(page.locator('#guest-count')).toHaveText('4 guests');
  await page.locator('#edit-json').click();
  await page.locator('#json-apply').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#guest-count')).toHaveText('4 guests');
  await expect(page.locator('#json-dialog')).toBeVisible();
});
