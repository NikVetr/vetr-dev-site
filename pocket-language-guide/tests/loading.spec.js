// The mark that moves while a page loads or typesets (`.loading` in style.css).

import { test, expect } from '@playwright/test';

/**
 * The picture a `.loading` placeholder draws above its words.
 * @param {import('@playwright/test').Page} page
 */
const markOf = (page) => page.evaluate(() => {
  const placeholder = Object.assign(document.createElement('p'), { className: 'loading', textContent: 'Loading…' });
  document.body.append(placeholder);
  const image = getComputedStyle(placeholder, '::before').backgroundImage;
  placeholder.remove();
  return image;
});

test('a loading placeholder carries the moving mark, in the scheme\'s colours, and the still one for less motion', async ({ page }) => {
  await page.goto('/index.html');
  expect(await markOf(page)).toContain('/data/brand/mark-loading.svg');
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await markOf(page)).toContain('/data/brand/mark-loading-dark.svg');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  expect(await markOf(page)).toContain('/data/brand/mark-dark.svg');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  expect(await markOf(page)).toContain('/data/brand/mark.svg');
  for (const name of ['mark-loading', 'mark-loading-dark']) {
    const response = await page.request.get(`/data/brand/${name}.svg`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('@keyframes');
  }
});
