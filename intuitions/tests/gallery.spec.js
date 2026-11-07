import { expect, test } from '@playwright/test';

test('the gallery stays flush, readable, and keyboard ordered across aspect ratios', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const focused = page.locator('[data-mosaic-key="threshold-model"]');
  await focused.focus();
  for (const [width, height] of [[1440, 900], [1920, 1080], [768, 1024], [1000, 800], [844, 390], [390, 844], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    // Wait for the packer and the figure ResizeObservers to paint the new dimensions.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(focused).toBeFocused();
    const fit = await page.evaluate(() => {
      const wall = /** @type {HTMLElement} */ (document.querySelector('.gallery'));
      const bounds = wall.getBoundingClientRect();
      const cards = [...wall.children].map(card => {
        const r = card.getBoundingClientRect();
        return { key: card.getAttribute('data-mosaic-key'), left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          clipped: [...card.querySelectorAll('h2,p,.meta')].some(child => child.getBoundingClientRect().bottom > r.bottom + 1) };
      });
      const columns = Number(getComputedStyle(wall).getPropertyValue('--cols'));
      const bottoms = Array.from({ length: columns }, (_, i) => {
        const x = bounds.left + bounds.width * (i + 0.5) / columns;
        return Math.max(...cards.filter(card => card.left < x && card.right > x).map(card => card.bottom));
      });
      const visual = [...cards].sort((a, b) => a.top - b.top || a.left - b.left);
      const overlap = cards.some((a, i) => cards.slice(i + 1).some(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
      return { count: cards.length, overflow: document.documentElement.scrollWidth - innerWidth, clipped: cards.some(card => card.clipped), overlap,
        bottomRange: Math.max(...bottoms) - Math.min(...bottoms), order: cards.map(card => card.key), visual: visual.map(card => card.key) };
    });
    expect(fit.count).toBe(15);
    expect(fit.overflow).toBeLessThanOrEqual(1);
    expect(fit.clipped).toBe(false);
    expect(fit.overlap).toBe(false);
    expect(fit.bottomRange).toBeLessThan(1);
    expect(fit.order).toEqual(fit.visual);
  }
  const next = await focused.evaluate(card => card.nextElementSibling?.getAttribute('data-mosaic-key'));
  await page.keyboard.press('Tab');
  await expect(page.locator(`[data-mosaic-key="${next}"]`)).toBeFocused();
  await page.evaluate(() => { /** @type {HTMLElement} */ (document.activeElement).blur(); window.scrollTo(0, 0); });
  const visible = await page.locator('.entry-card').evaluateAll(cards => cards.filter(card => card.getBoundingClientRect().top < innerHeight).length);
  expect(visible).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test('Forecast Calibration keeps its standalone route and callable API', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-mosaic-key="forecast-calibration"]').click();
  await expect(page).toHaveURL(/\/forecast-calibration\/$/);
  await expect.poll(() => page.evaluate(() => typeof /** @type {any} */ (window).ForecastCalibration?.submit)).toBe('function');
});

for (const [entry, target] of [['dag-adjustment', 'dag-plot'], ['samplers', 'funnel-target']]) {
  test(`${entry}: the early keyboard link reaches the first figure on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${entry}/`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    const jump = page.getByRole('link', { name: 'Jump to the first figure' });
    await expect(jump).toBeInViewport();
    for (let i = 0; i < 15 && !await jump.evaluate(link => link === document.activeElement); i++) await page.keyboard.press('Tab');
    await expect(jump).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(`#${target}`)).toBeFocused();
    await expect(page.locator(`#${target} svg`)).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.locator(`#${target}`)).not.toBeFocused();
    if (entry === 'samplers') await expect(page.locator('.note').first()).toContainText("A different sampler from the scripts'.");
  });
}

test('the landing preview shows six ideas and animates only on interaction', async ({ page }) => {
  await page.goto('/');
  const art = page.locator('[data-art="intuitions"]');
  await art.scrollIntoViewIfNeeded();
  await expect(art.locator('[data-entry]')).toHaveCount(6);
  const liability = art.locator('.liability').first();
  const still = await liability.evaluate(el => getComputedStyle(el).transform);
  await art.hover();
  await expect(art).toHaveAttribute('data-playing', '');
  await expect.poll(() => liability.evaluate(el => getComputedStyle(el).transform)).not.toBe(still);
  await expect(art.locator('canvas')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(art).not.toHaveAttribute('data-playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await art.hover();
  await expect(art).not.toHaveAttribute('data-playing');
});
