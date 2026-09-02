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

  test('a thumbnail opens every face, one arrow key apart', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('dialog.preview-dialog')).toHaveCount(0);

    await page.locator('.card-thumb-button').first().click();
    const dialog = page.locator('dialog.preview-dialog');
    await expect(dialog).toBeVisible();
    // The pre-rendered thumbnail goes up first so the dialog is never empty, then
    // the typeset faces replace it -- vector, and every face rather than the first.
    await expect(dialog.locator('.preview-stage img')).toBeVisible();
    await expect(dialog.locator('.preview-stage svg')).toBeVisible({ timeout: 180_000 });

    const counter = dialog.locator('.preview-counter');
    await expect(counter).toHaveText(/\b1\b.*\b(\d+)\b/);
    const faces = Number(/(\d+)\s*$/.exec((await counter.textContent()) ?? '')?.[1]);
    expect(faces).toBeGreaterThanOrEqual(4);
    expect(faces % 2).toBe(0);

    await page.keyboard.press('ArrowRight');
    await expect(counter).not.toHaveText(/^Face 1 /);
    await page.keyboard.press('End');
    await expect(dialog.locator('.preview-step').last()).toBeDisabled();

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

