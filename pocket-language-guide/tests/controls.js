// Driving the app's custom controls from a spec.
//
// The header's language chooser stopped being a `<select>` when it had to show the
// endonym collapsed and a greyed gloss in the list, which a native select cannot
// do. `page.selectOption` therefore no longer reaches it, and every spec that
// changes the reader's language goes through here instead -- so the next time the
// control is rebuilt there is one place to fix rather than four.

import { expect } from '@playwright/test';

/**
 * Choose a reader language in the header, the way a person would.
 * @param {import('@playwright/test').Page} page
 * @param {string} endonym the language's own name, as the list shows it
 */
export async function pickReader(page, endonym) {
  await page.locator('.lang-picker-button').click();
  const list = page.locator('.lang-picker-list');
  await expect(list).toBeVisible();
  await list.getByRole('option').filter({ hasText: endonym }).first().click();
  await expect(list).toBeHidden();
}
