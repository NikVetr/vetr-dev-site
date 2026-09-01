import { test, expect } from '@playwright/test';

const STUDIO = '/customize.html?target=zh-Hans&source=en';

test.describe('studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('solves the reference sheet and shows three panels', async ({ page }) => {
    /** @type {string[]} */ const failures = [];
    page.on('pageerror', (e) => failures.push(e.message));
    await page.goto(STUDIO);

    await expect(page.locator('.face.focused')).toBeVisible();
    await expect(page.locator('#status')).toContainText('4 faces');
    await expect(page.locator('.studio > section')).toHaveCount(3);
    // Every face is reachable from the thumbnail strip.
    await expect(page.locator('.face-strip .face')).toHaveCount(4);
    expect(failures).toEqual([]);
  });

  test('a face grid and a focused face swap places', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toHaveCount(1);
    await page.locator('#grid-toggle').click();
    await expect(page.locator('.face-grid .face')).toHaveCount(4);
    await expect(page.locator('.face.focused')).toHaveCount(0);
    await page.locator('.face-grid .face').nth(2).click();
    await expect(page.locator('.face.focused')).toHaveCount(1);
    await expect(page.locator('.face-strip .face.current')).toHaveCount(1);
  });

  test('clicking a row on the page finds it in the content list', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.locator('.face.focused .hit').nth(3).click();
    await expect(page.locator('.items li.flash')).toHaveCount(1);
  });

  test('turning a section off re-solves with fewer items', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('#counts')).toContainText('358 of 359');
    await page.locator('.tree summary input[type=checkbox]').first().uncheck();
    await expect(page.locator('#counts')).not.toContainText('358 of 359');
    await page.locator('.tree summary input[type=checkbox]').first().check();
    await expect(page.locator('#counts')).toContainText('358 of 359');
  });

  test('a small card just uses more faces instead of failing', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('#status')).toContainText('4 faces');
    await page.getByRole('radio', { name: 'Credit-card size' }).click();
    // Auto grows the face count rather than reporting an error.
    await expect(page.locator('#status')).not.toContainText('4 faces');
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
    await expect(page.locator('.face.focused')).toBeVisible();
  });

  test('a pinned face count that cannot hold the content fails loudly, once', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'Credit-card size' }).click();
    await page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: '2', exact: true }).click();
    await expect(page.locator('#status')).toContainText('nothing to lay out');
    // One message in the reader's terms, not that plus the breaker's internals.
    await expect(page.locator('#warnings li.error')).toHaveCount(1);
    await expect(page.locator('#warnings li.error')).toContainText('will not fit');
  });

  test('an unfittable sheet offers fixes that actually fix it', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'A6' }).click();
    await page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: '2', exact: true }).click();
    await expect(page.locator('#status')).toContainText('nothing to lay out');

    const fix = page.locator('button.fix').first();
    await expect(fix).toContainText('faces instead of 2');
    await fix.click();

    // The remedy was verified before being offered, so it has to clear the error.
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
    await expect(page.locator('.face.focused')).toBeVisible();
  });

  test('balancing is refused, with a reason, while the sheet does not fit', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'Credit-card size' }).click();
    await page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: '2', exact: true }).click();
    await expect(page.locator('#status')).toContainText('nothing to lay out');
    await page.locator('#balance').click();
    await expect(page.locator('#diff p')).toContainText('does not fit yet');
  });

  test('auto reports the face count it settled on', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('#status')).toContainText('4 faces');
    const auto = page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: /^Auto/ });
    await expect(auto).toHaveAttribute('aria-checked', 'true');
    await expect(auto).toContainText('4');

    // Bigger type needs more of them, and auto says so.
    await page.getByRole('radio', { name: 'X-large' }).click();
    await expect(auto).not.toContainText('4');
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
  });

  test('balancing proposes reasoned additions and applying them adds items', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'Small' }).click();
    await expect(page.locator('#status')).toContainText('0.90x');

    const boxes = page.locator('.items input[type=checkbox]');
    const count = await boxes.count();
    for (let i = 0; i < count; i += 9) await boxes.nth(i).uncheck({ force: true });
    // Let the debounced solve settle before reading the count.
    await expect(page.locator('#status')).not.toHaveAttribute('data-busy', '1');
    await expect(page.locator('#counts')).not.toContainText('358 of 359');

    const before = Number((await page.locator('#counts').textContent())?.match(/(\d+) of/)?.[1]);
    await page.locator('#balance').click();
    await expect(page.locator('#diff')).toBeVisible();
    await expect(page.locator('#diff p')).toContainText('whitespace');
    // Each proposal has to say what it costs and why it was chosen.
    await expect(page.locator('#diff li').first()).toContainText('pt;');

    await page.locator('#diff button.primary').click();
    await expect(page.locator('#diff')).toBeHidden();
    // Applying schedules a debounced re-solve; wait for the count to actually move.
    await expect(page.locator('#counts')).not.toContainText(`${before} of`);
    const after = Number((await page.locator('#counts').textContent())?.match(/(\d+) of/)?.[1]);
    expect(after).toBeGreaterThan(before);
  });

  test('exports a vector PDF, and card-splitting doubles the pages', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();

    const sheet = page.waitForEvent('download');
    await page.locator('#pdf').click();
    expect((await sheet).suggestedFilename()).toBe('chinese-simplified-pocket-guide.pdf');

    await page.getByRole('radio', { name: 'Short edge' }).click();
    await expect(page.locator('.panel-note')).toContainText('four double-sided cards');
    const cards = page.waitForEvent('download');
    await page.locator('#pdf').click();
    expect((await cards).suggestedFilename()).toBe('chinese-simplified-pocket-guide-cards.pdf');
  });

  test('a CSV round trip merges by concept_id instead of duplicating', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('#counts')).toContainText('358 of 359');

    const out = page.waitForEvent('download');
    await page.locator('#csv-out').click();
    const csv = await (await out).createReadStream();
    let text = '';
    for await (const chunk of csv) text += chunk;

    // Change one gloss and re-import; the count must not move.
    const edited = text.replace('Hello', 'Hi there');
    page.once('dialog', (d) => d.accept());
    await page.locator('#csv-file').setInputFiles({
      name: 'edited.csv', mimeType: 'text/csv', buffer: Buffer.from(edited, 'utf8'),
    });
    await expect(page.locator('#counts')).toContainText('358 of 359');
    await expect(page.locator('.items li', { hasText: 'Hi there' })).toHaveCount(1);
  });
});
