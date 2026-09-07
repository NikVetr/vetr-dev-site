import { test, expect } from '@playwright/test';

// The gallery's order is a user-visible contract, and the interesting half of it is
// that "alphabetical" means *the reader's* alphabet: the labels are already in the
// reader's language, so sorting them by their English names would have produced an
// order with no visible logic. Checked in five locales rather than one, because
// English and Swedish agree on almost everything and would have hidden a collator
// that was quietly falling back to codepoint order.
//
// The card count is asserted first. An earlier version of this test used a selector
// that matched nothing and passed, because an empty list is sorted.
test('the gallery is alphabetical in the reader locale, not in English', async ({ page }) => {
  for (const reader of ['en', 'sv', 'ar', 'ru', 'zh-Hans']) {
    await page.addInitScript((code) => localStorage.setItem('plg.reader', code), reader);
    await page.goto('/index.html');
    await expect(page.locator('.card-name').first()).toBeVisible({ timeout: 60_000 });
    const names = await page.locator('.card-name').allInnerTexts();
    expect(names.length, 'no cards found').toBeGreaterThan(30);
    const sorted = [...names].sort(new Intl.Collator(reader, { numeric: true }).compare);
    expect(names, `${reader} is out of order`).toEqual(sorted);
  }
});
