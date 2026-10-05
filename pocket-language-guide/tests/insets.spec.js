// Every page with a sticky header, under an iPhone's insets: the header keeps its
// contents below the status bar once the page is scrolled.
//
// The native shell draws edge to edge (`viewport-fit=cover`), so `env(safe-area-inset-*)`
// is the status bar and the home indicator. Chrome can stand in for them; the values are
// an iPhone 17's. Where the insets are zero -- a desktop browser -- nothing here moves.

import { test, expect } from '@playwright/test';

const PAGES = [
  ['the landing page', '/'],
  ['the sheet', '/sheet.html?target=zh-Hans&source=en'],
  ['the signaller', '/signal.html?target=morse&source=en'],
  ['the studio', '/customize.html?target=zh-Hans&source=en'],
];

for (const [name, url] of PAGES) {
  test(`under an iPhone's insets ${name}'s header stays below the status bar when scrolled`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, bottom: 34, left: 0, right: 0 } });
    await page.goto(url);
    await expect(page.locator('.site-header .brand')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 300));
    const at = await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('.site-header .brand'))
      .getBoundingClientRect().top);
    expect(at).toBeGreaterThanOrEqual(62);
  });
}
