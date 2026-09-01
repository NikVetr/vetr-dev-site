// Reading the studio's item counter, without pinning the corpus size.
//
// These specs used to assert literals like "358 of 413". The corpus is meant to
// grow -- it went from 413 to 755 concepts in one change -- and every one of those
// assertions failed at once, all of them for the same uninteresting reason. What
// the tests actually care about is the direction a count moves when you toggle
// something, so that is what they assert now.

import { expect } from '@playwright/test';

/**
 * The counter, once it has settled on a value. Returns included and total.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{included:number, total:number}>}
 */
export async function counts(page) {
  const locator = page.locator('#counts');
  await expect(locator).toHaveText(/\d+ of \d+ items/, { timeout: 90_000 });
  const text = (await locator.textContent()) ?? '';
  const m = /(\d+) of (\d+) items/.exec(text);
  if (!m) throw new Error(`unreadable item count: ${JSON.stringify(text)}`);
  return { included: Number(m[1]), total: Number(m[2]) };
}

/**
 * Wait for the counter to reach a specific number of included items. Use when a
 * change has a known size -- adding one term adds exactly one item.
 * @param {import('@playwright/test').Page} page @param {number} included
 */
export async function expectIncluded(page, included) {
  await expect(page.locator('#counts')).toHaveText(
    new RegExp(`^${included} of \\d+ items$`), { timeout: 90_000 },
  );
}

/**
 * Wait for the counter to move off a value, then return the new one. A solve is
 * debounced and takes a moment, so "it changed" needs polling rather than a read.
 * @param {import('@playwright/test').Page} page @param {number} from
 */
export async function expectIncludedNot(page, from) {
  await expect(page.locator('#counts')).not.toHaveText(
    new RegExp(`^${from} of \\d+ items$`), { timeout: 90_000 },
  );
  return counts(page);
}
