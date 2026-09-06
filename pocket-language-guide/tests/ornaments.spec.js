import { test, expect } from '@playwright/test';

test('style is opt-in, decorates the sheet and exports through every renderer', async ({ page }) => {
  await page.goto('/customize.html?target=qya&source=en');
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
  for (const id of ['pdf', 'svg', 'png']) {
    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator(`#${id}`).click();
    expect(await (await download).failure()).toBeNull();
  }
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
