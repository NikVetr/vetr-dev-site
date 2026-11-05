import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const replay = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => /** @type {any} */ (window).Seating.replay());

test('seats the example on load, as R does, and exposes the API', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator('#guest-count')).toHaveText('39 guests');
  await expect(page.locator('#chart .guest')).toHaveCount(39);
  await expect(page.locator('#replay-status')).toContainText('The best seating found, at iteration 1,853 of 1,950');
  await expect(page.locator('#readout .total').first()).toContainText('−15.7');
  expect(await replay(page)).toEqual({ move: 53, moves: 53, iteration: 1853, best: true, playing: false });

  const api = await page.evaluate(async () => {
    const app = /** @type {any} */ (window).Seating;
    const result = await app.submit({
      guests: ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'].map((id, i) => ({ id, category: i % 2 })),
      tables: { seats: 3 }, together: [['Ann', 'Cy']], options: { seed: 2, iterations: 300, record: 'moves' },
    });
    let error = null;
    try {
      await app.submit({ guests: [{ id: 'a' }, { id: 'a' }], tables: { seats: 1 } });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, codes: e.issues.map((/** @type {any} */ i) => i.code) };
    }
    return {
      tables: result.tables.length,
      same: JSON.stringify(result) === JSON.stringify(app.getResult()),
      svg: app.exportSvgText().slice(0, 4),
      csv: app.exportSeatingCsv().split('\n')[0],
      request: app.getRequest().guests.length,
      error,
    };
  });
  expect(api).toEqual({ tables: 2, same: true, svg: '<svg', csv: 'table,seat,guest,category', request: 6, error: { name: 'SeatingError', code: 'invalid_request', codes: ['duplicate_id'] } });
  // the rejected request left the page showing the accepted one
  await expect(page.locator('#guest-count')).toHaveText('6 guests');
  await expect(page.locator('#chart .guest')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('replays the moves, steps both ways, and ends on the best seating', async ({ page }) => {
  await open(page);
  await page.getByLabel('Animate the swaps').uncheck();
  await page.locator('#speed').fill('6'); // 32 moves a second
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#replay-status')).toContainText('The first seating');
  await expect(page.locator('#readout .total').first()).toContainText('−6,170');
  await page.getByRole('button', { name: 'Step ▶' }).click();
  await expect(page.locator('#replay-status')).toContainText('Move 1 of 53, iteration 3');
  await expect(page.locator('#chart .table circle[stroke-width="2.5"]')).toHaveCount(2); // the move's tables
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('#replay-status')).toContainText('The first seating');

  // seed 2: the best seating is move 32 of 33, so the replay returns to it after the last move
  await page.locator('#seed').fill('2');
  await expect(page.locator('#stale')).toContainText('the settings changed');
  await page.getByRole('button', { name: 'Find a seating' }).click();
  await expect(page.locator('#stale')).toBeHidden();
  await expect.poll(() => replay(page), { timeout: 20_000 }).toEqual({ move: 32, moves: 33, iteration: 1777, best: true, playing: false });
  await expect(page.locator('#replay-status')).toContainText('The best seating found, at iteration 1,777 of 1,950 (move 32 of 33)');
  await page.locator('#timeline').fill('33');
  await expect(page.locator('#replay-status')).toContainText('Move 33 of 33');
  await page.getByRole('button', { name: 'Best' }).click();
  await expect(page.locator('#replay-status')).toContainText('The best seating found');
});

test('animates a swap: the moving guests pass between seats', async ({ page }) => {
  await open(page);
  await page.locator('#speed').fill('0'); // half a move a second, 1.2 s a swap
  await page.getByRole('button', { name: 'Start' }).click();
  const before = await page.locator('#chart [data-guest="Ozzie Fudge"]').getAttribute('transform');
  await page.getByRole('button', { name: 'Step ▶' }).click();
  await page.waitForTimeout(500);
  const during = await page.locator('#chart [data-guest="Ozzie Fudge"]').getAttribute('transform');
  await expect(page.locator('#replay-status')).toContainText('Move 1 of 53');
  const after = await page.locator('#chart [data-guest="Ozzie Fudge"]').getAttribute('transform');
  expect(new Set([before, during, after]).size).toBe(3);
});

test('reduced motion: no tweening, and Find a seating does not play by itself', async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.getByLabel('Animate the swaps')).not.toBeChecked();
  await page.getByRole('button', { name: 'Find a seating' }).click();
  await expect(page.locator('#status')).toContainText('Found in');
  expect(await replay(page)).toMatchObject({ best: true, playing: false });
  await page.close();
});

test('names the problems in the inputs, and reads an R request from the JSON dialog', async ({ page }) => {
  await open(page);
  const guestsField = page.getByLabel('Row 1 guests');
  await guestsField.fill('Ruth Noodle, Nobody');
  await expect(page.locator('#issues')).toContainText('Pairs and groups row 1: "Nobody" is not on the guest list');
  await expect(guestsField).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#stale')).toContainText('the pairs and groups changed');
  await guestsField.fill('Ruth Noodle, Ned Noodle');
  await expect(page.locator('#issues')).toBeHidden();

  await page.getByRole('button', { name: 'Paste or edit request JSON…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Request JSON' });
  await expect(dialog.locator('.dialog-head')).toBeVisible();
  await dialog.locator('textarea').fill(JSON.stringify({
    guests: ['p', 'q', 'r', 's'].map((id, i) => ({ id, category: i })), tables: { seats: 2 },
    options: { logit_scale: 2, table_objective: 'geometric', seed: 3 },
  }));
  await dialog.getByRole('button', { name: 'Load and find a seating' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#guest-count')).toHaveText('4 guests');
  await expect(page.locator('#logit-scale')).toHaveValue('2');
  await expect(page.locator('#table-objective')).toHaveValue('geometric');
  await expect(page.locator('#status')).toContainText('Found in');
  const settings = await page.evaluate(() => /** @type {any} */ (window).Seating.getResult().settings);
  expect(settings).toMatchObject({ logitScale: 2, tableObjective: 'geometric', seed: 3 });
});

test('fits a 390 px phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await overflow(page)).toBe(0);
  for (const figure of ['#chart svg', '#trace svg']) {
    const right = await page.locator(figure).evaluate((svg) => svg.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(390);
  }
  // the seating comes right after the guests
  const order = await page.locator('main > section h2').allTextContents();
  expect(order.slice(0, 3)).toEqual(['Guests', 'Seating', 'Pairs and groups']);
  await page.locator('.method-card summary').click();
  expect(await overflow(page)).toBe(0);
});
