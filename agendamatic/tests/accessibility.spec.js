import { test, expect } from '@playwright/test';

async function loadFresh(page) {
    await page.goto('/agendamatic/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/agendamatic/');
    await expect(page.locator('.agenda-row')).toHaveCount(5);
}

test('pointer-opened dialogs receive focus and expose descriptive control names', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await loadFresh(page);

    const notesTrigger = page.locator('.agenda-row [data-action="notes"]').first();
    await notesTrigger.click();
    await expect(page.locator('#editor-textarea')).toBeFocused();
    await expect(page.locator('#notes-modal .editor-toolbar [data-action="bold"]')).toHaveAttribute('aria-label', 'Bold');
    await expect(page.locator('#notes-modal .editor-toolbar [data-action="code"]')).toHaveAttribute('aria-label', 'Code block');
    await page.keyboard.press('Escape');

    const colorTrigger = page.locator('.agenda-color-button').first();
    await colorTrigger.click();
    await expect(page.locator('#item-color-hue')).toBeFocused();
    await page.keyboard.press('Escape');

    await page.locator('#btn-edit-csv').click();
    await expect(page.locator('#bulk-edit-text')).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Edit Agenda CSV', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('.bulk-column-button[data-bulk-field="name"]').first().click();
    await expect(page.getByRole('textbox', { name: 'Edit Items', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');

    await page.locator('#btn-metadata').click();
    await expect(page.locator('#metadata-meeting-title')).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(page.locator('[data-action="settings-time-up"]')).toHaveAttribute('aria-label', 'Increase start time');
    await expect(page.locator('[data-action="settings-time-down"]')).toHaveAttribute('aria-label', 'Decrease start time');
    await expect(page.locator('[data-action="settings-time-up"]')).toHaveAttribute('type', 'button');
    expect(pageErrors).toEqual([]);
});

test('metadata additions and removals retain a useful keyboard focus target', async ({ page }) => {
    await loadFresh(page);
    await page.locator('#btn-metadata').click();

    await page.locator('#metadata-add-group').click();
    const secondGroup = page.locator('.metadata-attendee-group').nth(1);
    await expect(secondGroup.locator('.metadata-group-header input')).toBeFocused();

    const addAttendeeInput = secondGroup.locator('.metadata-add-attendee input');
    await addAttendeeInput.fill('Avery');
    await secondGroup.getByRole('button', { name: 'Add attendee to Group 2' }).click();
    const addedAttendee = secondGroup.locator('.metadata-attendee-row').filter({ hasText: '' }).last();
    await expect(addedAttendee.locator('input[type="text"]')).toHaveValue('Avery');
    await expect(addedAttendee.locator('input[type="text"]')).toBeFocused();

    await addedAttendee.getByRole('button', { name: 'Remove Avery' }).click();
    await expect(secondGroup.locator('.metadata-add-attendee input')).toBeFocused();

    await secondGroup.getByRole('button', { name: 'Remove Group 2 group' }).click();
    await expect(page.locator('.metadata-attendee-group').first().locator('.metadata-group-header input')).toBeFocused();

    await page.locator('#metadata-add-action').click();
    const firstAction = page.locator('.metadata-action-row').first();
    await expect(firstAction.locator('input[placeholder="Action item"]')).toBeFocused();
    await firstAction.locator('input[placeholder="Action item"]').fill('First action');
    await page.locator('#metadata-add-action').click();
    const secondAction = page.locator('.metadata-action-row').nth(1);
    await secondAction.locator('input[placeholder="Action item"]').fill('Second action');

    await firstAction.locator('.metadata-remove-attendee').click();
    await expect(page.locator('.metadata-action-row').first().locator('.metadata-remove-attendee')).toBeFocused();
    await page.locator('.metadata-action-row').first().locator('.metadata-remove-attendee').click();
    await expect(page.locator('#metadata-add-action')).toBeFocused();
});
