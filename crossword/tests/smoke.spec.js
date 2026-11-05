import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('generates the example on load and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#entry-count')).toHaveText('20 entries');
  await expect(page.locator('#target-status')).toContainText('Example heart: 64 × 64 pixels');
  await expect(page.locator('#crossword-choice input')).toHaveCount(3);
  await expect(page.locator('#grid-filled svg text')).not.toHaveCount(0);
  await expect(page.locator('#clues-across li, #clues-down li')).toHaveCount(20);
  await expect(page.locator('#terms tr')).toHaveCount(7);
  await expect(page.locator('#status')).toContainText('Done in');

  await page.getByLabel('Greedy layout').check();
  const greedy = await page.locator('#score').textContent();
  await page.getByLabel('After refinement').check();
  expect(await page.locator('#score').textContent()).not.toBe(greedy);

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).Crossword;
    const result = await app.submit({
      entries: [{ clue: 'Falls from clouds', answer: 'Rain' }, { clue: 'White winter cover', answer: 'Snow' }, { clue: 'Moving air', answer: 'Wind' }, { clue: 'Tempest', answer: 'Storm' }, { clue: 'Light fog', answer: 'Mist' }],
      search: { seed: 4, nIter: 5, nXwords: 2 },
    });
    const png = await app.exportPngBlob({ style: 'blank' });
    let error = null;
    try {
      await app.submit({ entries: [{ answer: 'hail' }, { answer: 'Hail' }] });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, path: e.issues[0].path };
    }
    return {
      crosswords: result.crosswords.length,
      same: JSON.stringify(result) === JSON.stringify(app.getResult()),
      svg: app.exportSvgText().slice(0, 4),
      png: [png.type, png.size > 1000],
      request: app.getRequest().entriesText.split('\n')[0],
      error,
    };
  });
  expect(api).toEqual({
    crosswords: 2, same: true, svg: '<svg', png: ['image/png', true], request: 'Falls from clouds : Rain',
    error: { name: 'CrosswordError', code: 'invalid_request', path: 'entries[1].answer' },
  });
  // The rejected request left the page showing the accepted one.
  await expect(page.locator('#crossword-choice input')).toHaveCount(2);
  await expect(page.locator('#entry-count')).toHaveText('5 entries');
  await expect(page.locator('#target-status')).toContainText('No picture');
  expect(errors).toEqual([]);
});

test('shows the layout while it refines, and stops', async ({ page }) => {
  await open(page);
  await page.getByLabel('MCMC iterations each').fill('100000');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#progress-grid svg')).toBeVisible();
  await expect(page.locator('#status')).toContainText(/Crossword 1 of 3: iteration \d+ of 100000/);
  await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#status')).toHaveText('Stopped');
  await expect(page.locator('#progress-grid')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Generate' })).toBeEnabled();
  await expect(page.locator('#crossword-choice input')).toHaveCount(3); // the previous result stays
});

test('flags bad entry lines, and refines the crossword shown', async ({ page }) => {
  await open(page);
  const entries = page.locator('#entries');
  await entries.fill('Frozen rain : Hail\nno colon\nMist : Fog\n');
  await expect(page.locator('#entry-issues')).toContainText('entriesText line 2: has no ":"');
  await expect(entries).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#entry-issues')).toBeHidden();

  await page.locator('#n-xwords').fill('2');
  await page.getByRole('button', { name: 'Refine the one shown' }).click();
  await expect(page.locator('#status')).toContainText('Done in');
  await expect(page.locator('#crossword-choice input')).toHaveCount(2);
});

test('reads an uploaded picture with canvas', async ({ page }) => {
  await open(page);
  const png = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 50, height: 40 });
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 50, 40);
    ctx.fillStyle = '#000';
    ctx.fillRect(10, 5, 30, 30);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#target-file').setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('#target-status')).toHaveText('square.png: 50 × 40 pixels, 900 to fill.');
  await expect(page.getByLabel(/Darkness threshold/)).toBeEnabled();
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('#status')).toContainText('Done in');
  const target = await page.evaluate(() => /** @type {any} */ (window).Crossword.getResult().settings.target);
  expect(target).toEqual({ width: 50, height: 40, cells: 900 });
});

test('fits a 390 px phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await overflow(page)).toBe(0);
  const svgWidth = await page.locator('#grid-filled svg').evaluate((svg) => svg.getBoundingClientRect().right);
  expect(svgWidth).toBeLessThanOrEqual(390);
  await page.locator('.method-card summary').click();
  expect(await overflow(page)).toBe(0);
});
