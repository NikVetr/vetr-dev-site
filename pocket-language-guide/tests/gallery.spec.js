import { test, expect } from '@playwright/test';
import { pickReader } from './controls.js';
import { translatedEndonym, withoutPack } from './registry.js';

test.describe('gallery', () => {
  test('lists languages, honest about what is translated', async ({ page }) => {
    /** @type {string[]} */ const failures = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });

    // The "help translate" state is what this test is about, and every registered
    // language now has a pack -- so it is served rather than hunted for. Reading it
    // off the registry meant the assertion evaporated into a skip the moment the
    // last language landed, which is the worst outcome: the state still exists in
    // the code and nothing checks it.
    const { code, endonym, coverage } = withoutPack('ja');
    await page.route('**/data/coverage.json', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify(coverage),
    }));

    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();

    // Chinese has a corpus, so it gets a real thumbnail and working buttons.
    const chinese = page.locator('.card', { hasText: translatedEndonym('zh-Hans') });
    await expect(chinese.locator('img.card-thumb')).toBeVisible();
    await expect(chinese.getByRole('link', { name: 'Export' })).toBeVisible();

    // And a language with no corpus must not offer a button that yields an empty
    // sheet, whatever its declared status says.
    const waiting = page.locator('.card', { hasText: endonym });
    await expect(waiting, `${code} should read as untranslated`).toBeVisible();
    await expect(waiting.getByText('Not translated yet')).toBeVisible();
    await expect(waiting.getByRole('link', { name: 'Export' })).toHaveCount(0);
    await expect(waiting.getByText('help translate')).toBeVisible();

    expect(failures).toEqual([]);
  });

  test('changing your own language re-glosses the grid', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    // You are never offered a guide into the language you already speak.
    await expect(page.locator('.card', { hasText: 'English' })).toHaveCount(0);

    await pickReader(page, '简体中文');
    await expect(page.locator('.card', { hasText: 'English' })).toHaveCount(1);
    await expect(page.locator('.card', { hasText: '简体中文' })).toHaveCount(0);
  });

  test('the header names a language by its own name, and glosses it only in the list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    // Collapsed it is the endonym alone: "Deutsch", not "Deutsch (German)".
    await expect(page.locator('.lang-picker-button')).toHaveText('English');

    await page.locator('.lang-picker-button').click();
    const german = page.locator('.lang-picker-option').filter({ hasText: 'Deutsch' });
    await expect(german.locator('.lang-picker-name')).toHaveText('Deutsch');
    await expect(german.locator('.lang-picker-aside')).toHaveText('German');
  });

  test('a thumbnail opens every face, one arrow key or one thumbnail apart', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('dialog.lightbox')).toHaveCount(0);

    await page.locator('.card-thumb-button').first().click();
    const dialog = page.locator('dialog.lightbox');
    await expect(dialog).toBeVisible();
    // The pre-rendered thumbnail holds the frame so the card is never blank, then
    // the typeset faces replace it -- vector, and every face rather than the first.
    await expect(dialog.locator('.lightbox-face img')).toBeVisible();
    await expect(dialog.locator('.lightbox-face svg')).toBeVisible({ timeout: 180_000 });

    // One thumbnail per face, and the sheet comes in pairs of them.
    const thumbs = dialog.locator('.lightbox-thumb');
    const faces = await thumbs.count();
    expect(faces).toBeGreaterThanOrEqual(4);
    expect(faces % 2).toBe(0);
    await expect(thumbs.first()).toHaveAttribute('aria-selected', 'true');

    // The carets are the ends of the series, so the first one cannot go back.
    await expect(dialog.locator('.lightbox-step.prev')).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await expect(thumbs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('.lightbox-step.prev')).toBeEnabled();
    await page.keyboard.press('End');
    await expect(dialog.locator('.lightbox-step.next')).toBeDisabled();

    // And a thumbnail is the other way to the same place.
    await thumbs.nth(2).click();
    await expect(thumbs.nth(2)).toHaveAttribute('aria-selected', 'true');

    // The two things you would want next are right there.
    await expect(dialog.getByRole('link', { name: 'Export' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.lightbox')).toHaveCount(0);
  });

  test('the pair is editable from inside the lightbox, either side or the arrow', async ({ page }) => {
    await page.goto('/');
    await page.locator('.card-thumb-button').first().click();
    const dialog = page.locator('dialog.lightbox');
    await expect(dialog.locator('.lightbox-thumb').first()).toBeVisible({ timeout: 180_000 });

    // Reads the way the pair is spoken: the language you read, then the one being
    // learned. The card behind is the first in the grid, whatever that is today.
    const pair = dialog.locator('.lightbox-pair .lang-picker-button');
    await expect(pair.first()).toHaveText('English');
    const learning = await pair.nth(1).textContent();
    const before = await dialog.getByRole('link', { name: 'Export' }).getAttribute('href');

    // The arrow reverses the pair, and the export it offers follows.
    await dialog.locator('.lightbox-swap').click();
    await expect(pair.first()).toHaveText(learning ?? '');
    await expect(pair.nth(1)).toHaveText('English');
    await expect(dialog.getByRole('link', { name: 'Export' })).not.toHaveAttribute('href', before ?? '');
    await expect(dialog.locator('.lightbox-thumb').first()).toBeVisible({ timeout: 180_000 });

    // Changing the reader's language here changes it for the grid behind too, so
    // closing the lightbox does not land on a gallery that disagrees with it.
    await expect(page.locator('#reader .lang-picker-button')).toHaveText(learning ?? '');
  });

  test('the flag overflow shows the flags it stands for', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    const more = page.locator('.flag.more').first();
    const rest = more.locator('.flag-rest');
    await expect(rest).toBeHidden();
    await more.hover();
    await expect(rest).toBeVisible();
    // It is a popover, so revealing it must not move the card behind it.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBe(0);
  });
});

