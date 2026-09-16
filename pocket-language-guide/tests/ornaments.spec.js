import { test, expect } from '@playwright/test';

/**
 * Every renderer takes the ornaments without error.
 *
 * PDF and SVG are one file and download directly. A multi-page PNG does not: eight
 * faces used to arrive as one zip, which is unopenable on a phone, so they are laid
 * out one row per page with their own save button and the download happens when a
 * page is asked for. Waiting for a `download` event on the PNG button is therefore
 * waiting for something that no longer happens by itself.
 * @param {import('@playwright/test').Page} page
 */
async function exportsCleanly(page) {
  for (const id of ['pdf', 'svg']) {
    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator(`#${id}`).click();
    expect(await (await download).failure()).toBeNull();
  }
  await page.locator('#png').click();
  const panel = page.locator('#saved-images');
  await expect(panel).toBeVisible({ timeout: 120_000 });
  const first = page.waitForEvent('download', { timeout: 120_000 });
  await panel.locator('.saved-page').first().getByRole('button').click();
  expect(await (await first).failure()).toBeNull();
}

test('Quenya grows a reserved frame, exports it and restores Classic exactly', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/customize.html?target=qya&source=en');
  await expect(page.locator('.face.focused')).toBeVisible();
  const positions = () => page.locator('.face.focused svg text').evaluateAll(nodes =>
    nodes.map(n => [n.textContent, n.getAttribute('x'), n.getAttribute('y')]));
  const before = await positions();
  await page.selectOption('#ornament-style', 'language');
  await expect(page.locator('.face.focused .ornament').first()).toBeAttached();
  expect(await page.locator('.face.focused .ornament[fill]:not([fill="none"])').count()).toBeGreaterThan(20);
  expect(await page.evaluate(() => [...document.fonts].some(f =>
    f.family.replace(/"/g, '') === 'plg-latin-serif' && f.style === 'italic' && f.status === 'loaded'))).toBe(true);
  expect(await positions()).not.toEqual(before);
  await expect(page.locator('#ornament-hint')).toContainText('page count may change');
  expect(await page.locator('.ornament-sample path').count()).toBeGreaterThan(10);
  await exportsCleanly(page);
  await page.selectOption('#ornament-style', 'classic');
  await expect(page.locator('.face.focused .ornament')).toHaveCount(0);
  expect(await positions()).toEqual(before);
  expect(errors).toEqual([]);
});

test('style is opt-in, decorates the sheet and exports through every renderer', async ({ page }) => {
  await page.goto('/customize.html?target=en&source=en');
  await expect(page.locator('.face.focused')).toBeVisible();
  const selection = page.locator('#ornament-style');
  await expect(selection).toHaveValue('classic');
  await expect(page.locator('.face.focused .ornament')).toHaveCount(0);
  const textPositions = () => page.locator('.face.focused svg text').evaluateAll(
    nodes => nodes.map(n => [n.textContent, n.getAttribute('x'), n.getAttribute('y'), n.getAttribute('font-size')]),
  );
  const before = await textPositions();
  await selection.selectOption('language');
  await expect(page.locator('.face.focused .ornament').first()).toBeAttached();
  await expect(page.locator('.ornament-control p').first()).toHaveText('Language-inspired');
  expect(await textPositions()).toEqual(before);
  await exportsCleanly(page);
  await selection.selectOption('classic');
  await expect(page.locator('.face.focused .ornament')).toHaveCount(0);
  expect(await textPositions()).toEqual(before);
});

test('style controls localize in LTR and RTL interfaces and render their own designs', async ({ page }) => {
  const paths = new Set();
  for (const [code, label, choice, dir] of [
    ['ja', '装飾スタイル', '言語にちなんだ装飾', 'ltr'],
    ['ar', 'نمط الزخرفة', 'مستوحى من اللغة', 'rtl'],
    ['fa', 'سبک', 'الهام‌گرفته از زبان', 'rtl'],
  ]) {
    await page.goto(`/customize.html?target=${code}&source=${code}`);
    await expect(page.locator('.face.focused')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    const selection = page.getByLabel(label, { exact: true });
    await selection.selectOption('language');
    await expect(page.locator('.ornament-control p').first()).toHaveText(choice);
    await expect(page.locator('.face.focused .ornament').first()).toBeAttached();
    paths.add(await page.locator('.ornament-sample path').getAttribute('d'));
    await expect(page.locator('#ornament-hint')).not.toContainText('Decorative borders');
  }
  expect(paths.size).toBe(3);
});

test('the lock screen furniture is drawn in the preview and never in an export', async ({ page }) => {
  // Reserved space is invisible, so a phone preset showed a card with a wide empty
  // margin and nothing to say why -- the setting looked like it had just made the
  // sheet smaller. The clock, date, widgets and buttons that are going to be there
  // are drawn over the reserved bands instead, dashed and unfilled, which is how
  // they say "not yours": the sheet's own ink is solid.
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });
  // No reserve on paper, so nothing to draw.
  await expect(page.locator('.face.focused > svg[aria-hidden="true"]')).toHaveCount(0);

  await page.getByRole('radio', { name: 'Phone screen' }).click();
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });
  const whichPhone = page.locator('.panel-field')
    .filter({ has: page.locator('.panel-field-title', { hasText: /^Which phone$/ }) });
  await whichPhone.getByRole('radio', { name: /iPhone 12-17/ }).click();

  const lock = page.locator('.face.focused > svg[aria-hidden="true"]');
  await expect(lock).toHaveCount(1, { timeout: 90_000 });
  await expect(lock.locator('text')).toHaveCount(2);
  // Dashed, which is the whole of how it reads as a guide rather than as ink.
  const dashed = await lock.locator('[stroke-dasharray]').count();
  expect(dashed).toBeGreaterThan(4);
  // It must not eat a tap meant for a row underneath it.
  expect(await lock.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

  // **And it is not in the plan**, so no renderer can draw it: the export path goes
  // through `faceSvgs`, which reads the LayoutPlan, and this is a DOM overlay added
  // on top of the face afterwards.
  const inPlan = await page.evaluate(() => {
    const svg = document.querySelector('.face.focused svg:not([aria-hidden])');
    return (svg?.textContent ?? '').includes('9:41');
  });
  expect(inPlan).toBe(false);
  expect(errors).toEqual([]);
});
