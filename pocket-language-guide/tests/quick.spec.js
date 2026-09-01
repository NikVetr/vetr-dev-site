import { test, expect } from '@playwright/test';
import { faceCount } from './counts.js';

const SHEET = '/sheet.html?target=zh-Hans&source=en';

test.describe('the quick export page', () => {
  test('shows the sheet and every control changes it', async ({ page }) => {
    /** @type {string[]} */ const failures = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });

    await page.goto(SHEET);
    // However many faces the content needs, the sheet count must be half of them:
    // a sheet is printed on both sides.
    await expect(page.locator('#status')).toHaveText(/\d+ faces · \d+ sheets/, { timeout: 120_000 });
    const status = (await page.locator('#status').textContent()) ?? '';
    const [, faces, sheets] = /(\d+) faces · (\d+) sheets/.exec(status) ?? [];
    await expect(page.locator('.face')).toHaveCount(Number(faces));
    expect(Number(sheets)).toBe(Number(faces) / 2);

    // A smaller card takes more faces.
    const wide = await page.locator('.face').count();
    await page.getByRole('radio', { name: 'A6' }).click();
    await expect.poll(() => page.locator('.face').count()).toBeGreaterThan(wide);

    // Serif changes which faces the sheet is drawn in.
    await page.getByRole('radio', { name: '7×5in' }).click();
    await expect.poll(() => page.locator('.face').count()).toBe(wide);
    const families = () => page.evaluate(() => [...new Set(
      [...document.querySelectorAll('.face svg text')].map((t) => t.getAttribute('font-family')),
    )].join(' '));
    expect(await families()).not.toContain('serif');
    await page.getByRole('radio', { name: 'Serif' }).click();
    await expect.poll(families).toContain('serif');

    // Narrowing the content drops items, which shows up as a smaller type scale
    // or fewer faces -- either way the sheet has to change.
    const before = await page.locator('#status').textContent();
    await page.selectOption('#preset', 'core');
    await expect(page.locator('#status')).not.toHaveText(before ?? '');

    expect(failures).toEqual([]);
  });

  test('exports a PDF at the chosen resolution and links to the studio', async ({ page }) => {
    await page.goto(SHEET);
    await expect(page.locator('.face').first()).toBeVisible();

    const pdf = page.waitForEvent('download');
    await page.locator('#pdf').click();
    expect((await pdf).suggestedFilename()).toBe('chinese-simplified-pocket-guide.pdf');

    await page.getByRole('radio', { name: 'Screen' }).click();
    const png = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator('#png').click();
    expect((await png).suggestedFilename()).toContain('150dpi');

    await expect(page.locator('#to-studio')).toHaveAttribute(
      'href', 'customize.html?target=zh-Hans&source=en',
    );
  });
});
