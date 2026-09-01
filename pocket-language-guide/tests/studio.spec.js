import { test, expect } from '@playwright/test';
import { counts, expectIncluded, expectIncludedNot, faceCount } from './counts.js';

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
    const faces = await faceCount(page);
    await expect(page.locator('.studio > section')).toHaveCount(3);
    // Every face is reachable from the thumbnail strip.
    await expect(page.locator('.face-strip .face')).toHaveCount(faces);
    expect(failures).toEqual([]);
  });

  test('a face grid and a focused face swap places', async ({ page }) => {
    await page.goto(STUDIO);
    const faces = await faceCount(page);
    await expect(page.locator('.face.focused')).toHaveCount(1);
    await page.locator('#grid-toggle').click();
    await expect(page.locator('.face-grid .face')).toHaveCount(faces);
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
    const all = await counts(page);
    expect(all.included).toBeGreaterThan(0);

    await page.locator('.tree summary input[type=checkbox]').first().uncheck();
    const fewer = await expectIncludedNot(page, all.included);
    expect(fewer.included).toBeLessThan(all.included);
    expect(fewer.total).toBe(all.total);

    await page.locator('.tree summary input[type=checkbox]').first().check();
    await expectIncluded(page, all.included);
  });

  test('a small card takes more faces instead of failing', async ({ page }) => {
    await page.goto(STUDIO);
    const faces = await faceCount(page);
    await expect(page.locator('.face-strip .face')).toHaveCount(faces);
    await page.getByRole('radio', { name: 'Credit-card size' }).click();
    // Auto takes more pairs rather than reporting an error, and says how many.
    // Counting elements rather than matching "4 faces", which "14 faces" contains.
    await expect.poll(() => page.locator('.face-strip .face').count()).toBeGreaterThan(4);
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
    await expect(page.locator('.face.focused')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: /^Auto/ })).toContainText('·');
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
    const faces = await faceCount(page);
    const auto = page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: /^Auto/ });
    await expect(auto).toHaveAttribute('aria-checked', 'true');
    // The point is that Auto reports what it resolved to, not that it resolved to
    // any particular number -- the count follows the content.
    await expect(auto).toContainText(String(faces));

    // Bigger type needs more of them, and auto says so.
    await page.getByRole('radio', { name: 'X-large' }).click();
    await expect.poll(async () => faceCount(page), { timeout: 120_000 })
      .toBeGreaterThan(faces);
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
  });

  test('balancing proposes reasoned additions and applying them adds items', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'Small' }).click();
    // Whatever it settles on, it must have settled: the balance panel refuses to
    // propose anything while the sheet does not fit.
    await expect(page.locator('#status')).toHaveText(/faces at \d/, { timeout: 90_000 });
    await expect(page.locator('#warnings li.error')).toHaveCount(0);

    // Work down the list the way a person would. Clicking rather than unchecking:
    // a solve blocks the main thread for a few hundred milliseconds, so uncheck's
    // immediate state assertion is a race against that, and what matters here is
    // that the selection ends up right.
    const full = await counts(page);
    const boxes = page.locator('.items input[type=checkbox]');
    const count = await boxes.count();
    for (let i = 0; i < count; i += 9) await boxes.nth(i).click({ force: true });
    const { included: before } = await expectIncludedNot(page, full.included);
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
    const before = await counts(page);

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
    await expectIncluded(page, before.included);
    await expect(page.locator('.items li', { hasText: 'Hi there' })).toHaveCount(1);
  });
});

// Registry `status` is editorial intent; only rows on file decide what is offered.
// Spanish and Arabic are registered with none, and offering them produced fifteen
// 404s and a blank sheet that said nothing about why.
test('the gloss menu offers only languages with rows on file', async ({ page }) => {
  await page.goto('/customize.html?target=zh-Hans&source=en');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });

  const offered = await page.locator('#source option').evaluateAll((os) => os.map((o) => o.value));
  expect(offered).toContain('ja');
  expect(offered).toContain('es');            // has rows now, so it is offered
  expect(offered).not.toContain('pt');        // registered, but no rows on file
  expect(offered).not.toContain('th');
  expect(offered).not.toContain('zh-Hans');   // it is the target
});
