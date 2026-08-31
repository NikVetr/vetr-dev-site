import { test, expect } from '@playwright/test';

const STUDIO = '/customize.html?target=zh-Hans&source=en';

test.describe('local emergency numbers', () => {
  test('are printed only where a fluent speaker has confirmed them', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();

    // China's numbers came from the verified reference sheet, so they print.
    await expect(page.locator('#region')).toHaveValue('CN');
    const onSheet = () => page.evaluate(
      () => [...document.querySelectorAll('.face svg text')]
        .some((t) => t.textContent?.trim() === '110'),
    );
    expect(await onSheet()).toBe(true);

    // Singapore's are on file but unreviewed, so they are withheld and said so.
    await page.selectOption('#region', 'SG');
    await expect(page.locator('#warnings li.warn', { hasText: 'not been checked' }))
      .toHaveCount(1);
    expect(await onSheet()).toBe(false);
  });
});

test.describe('adding your own term', () => {
  /** Start from a clean slate without clearing it again on later navigations. */
  /** @param {import('@playwright/test').Page} page */
  async function freshStudio(page) {
    await page.goto(STUDIO);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#counts')).toContainText('358 of 359');
  }

  test('reaches the tree and the sheet, and survives a reload', async ({ page }) => {
    await freshStudio(page);

    await page.locator('details.add-term summary').click();
    await page.selectOption('#add-section', 'introductions');
    await page.fill('#add-script', '我住在北京饭店');
    await page.fill('#add-gloss', 'I am staying at the Beijing Hotel');
    await page.getByRole('button', { name: 'Add to the sheet' }).click();

    await expect(page.locator('#counts')).toContainText('359 of 359');
    const mine = page.locator('.items li', { hasText: 'Beijing Hotel' });
    await expect(mine).toHaveCount(1);
    await expect(mine.locator('.tag.mine')).toBeVisible();
    await expect(page.locator('.face svg text', { hasText: /^饭$/ }).first()).toBeAttached();

    // Kept in local storage, so a reload does not lose it.
    await page.reload();
    await expect(page.locator('#counts')).toContainText('359 of 359');
    await expect(page.locator('.items li', { hasText: 'Beijing Hotel' })).toHaveCount(1);
  });

  test('a half-filled term is refused', async ({ page }) => {
    await freshStudio(page);
    await page.locator('details.add-term summary').click();
    await page.fill('#add-script', '只有一边');
    await page.getByRole('button', { name: 'Add to the sheet' }).click();
    await expect(page.locator('details.add-term p')).toContainText('Both language fields');
    await expect(page.locator('#counts')).toContainText('358 of 359');
  });
});

test.describe('entry layout', () => {
  test('one line puts every field on a single row', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();

    // How far the romanisation sits from the script it belongs to. Side by side
    // stacks them, so it is a line away; one line puts them beside each other, so
    // it is roughly the same baseline. Compared rather than fixed, because the two
    // fields are different sizes and each centres in its own cell.
    const baselineGap = async () => page.evaluate(() => {
      const runs = [...document.querySelectorAll('.face.focused svg text')];
      const script = runs.find((t) => t.textContent === '你');
      const pinyin = runs.find((t) => t.textContent?.trim() === 'nǐ');
      if (!script || !pinyin) return null;
      return Math.abs(Number(pinyin.getAttribute('y')) - Number(script.getAttribute('y')));
    });

    const stacked = await baselineGap();
    expect(stacked).not.toBeNull();

    await page.getByRole('radio', { name: 'One line' }).click();
    // The re-solve is debounced, and the status text does not change, so poll the
    // thing that actually moves rather than a proxy for it.
    await expect.poll(baselineGap).toBeLessThan(/** @type {number} */ (stacked) / 2);
  });
});
