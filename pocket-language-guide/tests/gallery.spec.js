import { test, expect } from '@playwright/test';

test.describe('gallery', () => {
  test('lists languages, honest about what is translated', async ({ page }) => {
    /** @type {string[]} */ const failures = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });

    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();

    // Chinese has a corpus, so it gets a real thumbnail and working buttons.
    const chinese = page.locator('.card', { hasText: 'Chinese (Simplified)' });
    await expect(chinese.locator('img.card-thumb')).toBeVisible();
    await expect(chinese.getByRole('link', { name: 'Export' })).toBeVisible();

    // A language with no corpus must not offer a button that yields an empty sheet.
    // Portuguese, not French: French has a full pack now. This assertion is about
    // the "not translated yet" state, so it needs a language that genuinely is not.
    const french = page.locator('.card', { hasText: 'Portuguese' });
    await expect(french.getByText('Not translated yet')).toBeVisible();
    await expect(french.getByRole('link', { name: 'Export' })).toHaveCount(0);
    await expect(french.getByText('help translate')).toBeVisible();

    expect(failures).toEqual([]);
  });

  test('changing your own language re-glosses the grid', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    // You are never offered a guide into the language you already speak.
    await expect(page.locator('.card', { hasText: 'English' })).toHaveCount(0);

    await page.selectOption('#reader', 'zh-Hans');
    await expect(page.locator('.card', { hasText: 'English' })).toHaveCount(1);
    await expect(page.locator('.card', { hasText: 'Chinese (Simplified)' })).toHaveCount(0);
  });
});
