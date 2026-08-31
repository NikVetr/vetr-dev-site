import { test, expect } from '@playwright/test';

const STUDIO = '/customize.html?target=zh-Hans&source=en';

test.describe('help me decide', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('the quiz narrows the sheet and syncs the controls it changed', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('#counts')).toContainText('358 of 359');

    await page.locator('#quiz-open').click();
    const quiz = page.locator('dialog.quiz');
    await expect(quiz).toBeVisible();

    // A reader who can read the script does not need a respelling.
    await quiz.locator('.quiz-option input').first().uncheck();
    await quiz.locator('.quiz-option', { hasText: 'Health and emergencies' }).locator('input').check();
    await page.selectOption('#quiz-prof', 'reading');
    await page.selectOption('#quiz-print', 'large');
    await quiz.getByRole('button', { name: 'Build my sheet' }).click();
    await expect(quiz).toHaveCount(0);

    // Fewer items than everything, and the banner steps out of the way.
    await expect(page.locator('#counts')).not.toContainText('358 of 359');
    await expect(page.locator('.banner')).toBeHidden();
    // Large print asked for bigger type, not the same content shrunk.
    await expect(page.getByRole('radio', { name: 'X-large' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.field-toggles input[data-field="respell"]')).not.toBeChecked();
    await expect(page.locator('.field-toggles input[data-field="roman"]')).toBeChecked();
    await expect(page.locator('.face.focused')).toBeVisible();
  });

  test('cancelling changes nothing', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('#counts')).toContainText('358 of 359');
    await page.locator('#quiz-open').click();
    await page.locator('dialog.quiz').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('dialog.quiz')).toHaveCount(0);
    await expect(page.locator('#counts')).toContainText('358 of 359');
  });
});

test.describe('drag handles', () => {
  test('dragging the left margin changes the geometry and re-solves', async ({ page }) => {
    await page.goto(STUDIO);
    const face = page.locator('.face.focused');
    await expect(face).toBeVisible();
    await expect(page.locator('.handle')).toHaveCount(5);

    const grip = page.locator('.handle[aria-label="Left margin"]');
    const box = await grip.boundingBox();
    if (!box) throw new Error('no handle to drag');

    const leftOf = () => grip.evaluate((node) => Number.parseFloat(node.style.left));
    const before = await leftOf();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Halfway through the drag the readout should be showing inches and points.
    await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2, { steps: 6 });
    await expect(page.locator('.handle-readout')).toContainText('Left margin');
    await expect(page.locator('.handle-readout')).toContainText('in (');
    await page.mouse.up();

    // Committing on release re-solves, and the new margin has to survive it: the
    // geometry preset must not be re-read and quietly overwrite the drag.
    await expect(page.locator('.face.focused')).toBeVisible();
    await expect.poll(leftOf).toBeGreaterThan(before + 0.5);
    // The sheet still lays out, just with a narrower content box.
    await expect(page.locator('#status')).toContainText('faces at');
  });
});
