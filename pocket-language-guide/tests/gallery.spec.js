import { test, expect } from '@playwright/test';
import { pickReader } from './controls.js';

test.describe('gallery', () => {
  test('lists languages, honest about what is translated', async ({ page }) => {
    /** @type {string[]} */ const failures = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });

    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();

    // Chinese has a corpus, so it gets a real thumbnail and working buttons.
    const chinese = page.locator('.card', { hasText: '简体中文' });
    await expect(chinese.locator('img.card-thumb')).toBeVisible();
    await expect(chinese.getByRole('link', { name: 'Export' })).toBeVisible();

    // A language with no corpus must not offer a button that yields an empty sheet.
    // Portuguese, not French: French has a full pack now. This assertion is about
    // the "not translated yet" state, so it needs a language that genuinely is not.
    const french = page.locator('.card', { hasText: 'Português' });
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

  test('a thumbnail opens a closer look without leaving the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('dialog.preview-dialog')).toHaveCount(0);

    await page.locator('.card-thumb-button').first().click();
    const dialog = page.locator('dialog.preview-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('img')).toBeVisible();
    // The two things you would want next are right there.
    await expect(dialog.getByRole('link', { name: 'Export' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.preview-dialog')).toHaveCount(0);
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

