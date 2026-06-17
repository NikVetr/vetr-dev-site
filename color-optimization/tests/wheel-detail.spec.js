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
    await expect(statusMini).toBeVisible();
    await expectStarClusters(page, 3);
    await statusMini.screenshot({
      path: 'tests/screenshots/optimization-paths-detail.png',
    });
  });
});

async function expectStarClusters(page, expectedCount) {
  const clusterCount = await page.locator('#status-mini').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const isStarPixel = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];
      if (a > 160 && r > 220 && g > 150 && g < 215 && b < 95) {
        isStarPixel[i] = 1;
      }
    }

    const visited = new Uint8Array(width * height);
    let clusters = 0;
    const stack = [];
    for (let i = 0; i < width * height; i++) {
      if (!isStarPixel[i] || visited[i]) continue;
      let area = 0;
      visited[i] = 1;
      stack.push(i);
      while (stack.length) {
        const idx = stack.pop();
        area++;
        const x = idx % width;
        const y = Math.floor(idx / width);
        const neighbors = [
          x > 0 ? idx - 1 : -1,
          x < width - 1 ? idx + 1 : -1,
          y > 0 ? idx - width : -1,
          y < height - 1 ? idx + width : -1,
        ];
        neighbors.forEach((next) => {
          if (next >= 0 && isStarPixel[next] && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        });
      }
      if (area >= 12) clusters++;
    }
    return clusters;
  });
  expect(clusterCount).toBeGreaterThanOrEqual(expectedCount);
}
