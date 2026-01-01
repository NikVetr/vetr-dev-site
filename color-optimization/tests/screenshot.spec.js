// @ts-check
const { test, expect } = require('@playwright/test');

test.setTimeout(120000);

test.describe('Color Optimization App Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('#panels', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('capture initial state', async ({ page }) => {
    await page.screenshot({
      path: 'tests/screenshots/01-initial-state.png',
      fullPage: true
    });
  });

  test('capture with clip to gamut enabled (sRGB)', async ({ page }) => {
    // Enable Visual clip to gamut
    await page.check('#clip-gamut');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/screenshots/02-clip-to-gamut-srgb.png',
      fullPage: true
    });
  });

  test('capture with clip to gamut enabled (Display P3)', async ({ page }) => {
    // Enable Visual clip to gamut
    await page.check('#clip-gamut');
    await page.waitForTimeout(300);

    // Select Display P3
    await page.selectOption('#gamut-preset', 'p3');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/screenshots/03-clip-to-gamut-p3.png',
      fullPage: true
    });
  });

  test('run optimization with sRGB clipping', async ({ page }) => {
    // Enter test colors
    await page.fill('#palette-input', '#407600, #9026B2');
    await page.waitForTimeout(200);

    // Enable both Visual and Optim clip to gamut
    await page.check('#clip-gamut');
    await page.check('#clip-gamut-opt');
    await page.waitForTimeout(200);

    // Set small restarts for quick test
    await page.fill('#restarts', '20');
    await page.waitForTimeout(100);

    // Run optimization
    await page.click('#run-btn');

    // Wait for completion
    await page.waitForFunction(() => {
      const status = document.querySelector('#status-state');
      return status && status.textContent?.includes('Finished');
    }, { timeout: 60000 });

    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/screenshots/04-optimization-srgb-clipped.png',
      fullPage: true
    });
  });

  test('run optimization with discontiguous constraints', async ({ page }) => {
    // Enter test colors
    await page.fill('#palette-input', '#407600, #9026B2');
    await page.waitForTimeout(200);

    // Set discontiguous constraints
    await page.selectOption('#constraint-topology', 'discontiguous');
    await page.waitForTimeout(200);

    // Enable clip to gamut for both
    await page.check('#clip-gamut');
    await page.check('#clip-gamut-opt');
    await page.waitForTimeout(200);

    // Set small restarts
    await page.fill('#restarts', '20');
    await page.waitForTimeout(100);

    // Run optimization
    await page.click('#run-btn');

    // Wait for completion
    await page.waitForFunction(() => {
      const status = document.querySelector('#status-state');
      return status && status.textContent?.includes('Finished');
    }, { timeout: 60000 });

    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/screenshots/05-discontiguous-clipped.png',
      fullPage: true
    });
  });
});
