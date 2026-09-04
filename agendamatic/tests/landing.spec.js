import { test, expect } from '@playwright/test';

test('vetr.dev landing page exposes the live autoCHAIR route', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.project-card').filter({ hasText: 'autoCHAIR' });
    await expect(card).toBeVisible();
    const link = card.locator('a.project-link');
    await expect(link).toHaveAttribute('href', '/agendamatic/');
    await link.click();
    await expect(page).toHaveURL(/\/agendamatic\//);
    await expect(page.locator('.page-title-text')).toContainText('autoCHAIR');
});
