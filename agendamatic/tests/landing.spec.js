import { test, expect } from '@playwright/test';

test('vetr.dev landing page exposes the live autoCHAIR route', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'autoCHAIR — Meeting Agenda Timer' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/agendamatic/');
    await link.click();
    await expect(page).toHaveURL(/\/agendamatic\//);
    await expect(page.locator('.page-title-text')).toContainText('autoCHAIR');
});
