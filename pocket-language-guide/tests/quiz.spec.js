import { test, expect } from '@playwright/test';
import { counts, expectIncluded, expectIncludedNot } from './counts.js';

const STUDIO = '/customize.html?target=zh-Hans&source=en';

test.describe('help me decide', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('the quiz narrows the sheet and syncs the controls it changed', async ({ page }) => {
    await page.goto(STUDIO);
    const all = await counts(page);

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
    const narrowed = await expectIncludedNot(page, all.included);
    expect(narrowed.included).toBeLessThan(all.included);
    await expect(page.locator('.banner')).toBeHidden();
    // Large print asked for bigger type, not the same content shrunk.
    await expect(page.getByRole('radio', { name: 'X-large' })).toHaveAttribute('aria-checked', 'true');
    // The shown-fields control is a row of glyph toggles now, not checkboxes, and
    // each one is named after what it actually holds for this pair -- so the
    // romanisation toggle says `Pinyin`, not `Romanisation`.
    await expect(page.getByRole('checkbox', { name: 'Say-it-like' }))
      .toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('checkbox', { name: 'Pinyin' }))
      .toHaveAttribute('aria-checked', 'true');
    // And the two sides of the pair are named, where they used to read
    // "Their script" and "Your language".
    await expect(page.getByRole('checkbox', { name: 'Simplified Chinese' })).toBeVisible();
    // `exact`, because two phrases in the tree are *about* speaking English.
    await expect(page.getByRole('checkbox', { name: 'English', exact: true }))
      .toBeVisible();
    await expect(page.locator('.face.focused')).toBeVisible();
  });

  test('cancelling changes nothing', async ({ page }) => {
    await page.goto(STUDIO);
    const before = await counts(page);
    await page.locator('#quiz-open').click();
    await page.locator('dialog.quiz').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('dialog.quiz')).toHaveCount(0);
    await expectIncluded(page, before.included);
  });
});

test.describe('drag handles', () => {
  test('a gutter bar narrows the columns and stays where it was dragged', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();

    // One bar per gutter, so it reads as the gap rather than as an arbitrary line.
    const gutters = page.locator('.face.focused .handle[aria-label="Column gap"]');
    await expect(gutters).toHaveCount(3);
    const positions = () => gutters.evaluateAll((ns) => ns.map((n) => n.style.left));

    // How wide a row is drawn tells us whether the columns actually changed.
    const columnWidth = () => page.evaluate(() => {
      const rects = [...document.querySelectorAll('.face.focused svg rect')];
      const row = rects.find((r) => {
        const w = Number(r.getAttribute('width'));
        return w > 60 && w < 200;
      });
      return row ? Number(row.getAttribute('width')) : null;
    });

    const before = /** @type {number} */ (await columnWidth());
    expect(before).toBeGreaterThan(0);

    const box = await gutters.first().boundingBox();
    if (!box) throw new Error('no gutter to drag');
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 22, box.y + 200, { steps: 8 });
    // The readout names the consequence, not just the gap.
    await expect(page.locator('.handle-readout')).toContainText('columns');
    const during = await positions();
    // The bar must not jump to the page edge, which is what it used to do.
    for (const left of during) {
      expect(Number.parseFloat(left)).toBeGreaterThan(5);
    }
    await page.mouse.up();

    // Widening the gutter narrows every column, so the content reflows.
    await expect.poll(columnWidth).toBeLessThan(before - 2);
    await expect(page.locator('.face.focused')).toBeVisible();
  });

  test('dragging the left margin changes the geometry and re-solves', async ({ page }) => {
    await page.goto(STUDIO);
    const face = page.locator('.face.focused');
    await expect(face).toBeVisible();
    // Four margins plus one bar per gutter.
    await expect(page.locator('.handle')).toHaveCount(7);

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
