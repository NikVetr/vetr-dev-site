// @ts-check
const { test, expect } = require('@playwright/test');

test.setTimeout(120000);

test.describe('Gamut Clipping Detail Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('#panels', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('capture color wheel with gamut clipping (detail)', async ({ page }) => {
    // Enable Visual clip to gamut
    await page.check('#clip-gamut');
    await page.waitForTimeout(500);

    // Find the trichromacy panel and take a screenshot of just that area
    const panel = page.locator('#panels').first();

    await panel.screenshot({
      path: 'tests/screenshots/wheel-detail-srgb.png',
    });
  });

  test('run quick optimization and capture status panel', async ({ page }) => {
    // Enter test colors
    await page.fill('#palette-input', '#407600, #9026B2, #E64B35');
    await page.waitForTimeout(200);

    // Enable both Visual and Optim clip to gamut
    await page.check('#clip-gamut');
    await page.check('#clip-gamut-opt');
    await page.waitForTimeout(200);

    // Run optimization with default settings
    await page.click('#run-btn');

    // Wait for some iterations (not full completion)
    await page.waitForTimeout(5000);

    // Take screenshot while running or finished
    await page.screenshot({
      path: 'tests/screenshots/optimization-running.png',
      fullPage: true
    });

    // Wait for completion
    try {
      await page.waitForFunction(() => {
        const status = document.querySelector('#status-state');
        return status && status.textContent?.includes('Finished');
      }, { timeout: 90000 });
    } catch (e) {
      // Take screenshot even if timeout
    }

    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/screenshots/optimization-finished.png',
      fullPage: true
    });

    // Screenshot the status mini area
    const statusMini = page.locator('#status-mini');
    if (await statusMini.isVisible()) {
      await statusMini.screenshot({
        path: 'tests/screenshots/optimization-paths-detail.png',
      });
    }
  });
});
