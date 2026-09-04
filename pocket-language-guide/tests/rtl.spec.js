import { test, expect } from '@playwright/test';
import { pickReader } from './controls.js';

test('a sheet does not mirror when the reader reads right to left', async ({ page }) => {
  // Every run's `x` is its left edge, which is the contract the plan and the PDF
  // renderer share -- but SVG reads it through `text-anchor: start`, and under an
  // inherited `direction: rtl` that means the *right* edge. The gallery sets
  // `<html dir>` from the reader's language, so an Arabic reader turned every
  // anchor around: columns landed on each other and the leftmost ran off the card.
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await pickReader(page, 'العربية');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.locator('.card-thumb-button').first().click();
  await expect(page.locator('.lightbox-face svg text').first()).toBeVisible({ timeout: 90_000 });

  const box = await page.evaluate(() => {
    const svg = document.querySelector('.lightbox-face svg');
    const page_ = svg.getBoundingClientRect();
    let left = Infinity;
    let right = -Infinity;
    for (const t of svg.querySelectorAll('text')) {
      const r = t.getBoundingClientRect();
      if (r.width === 0) continue;
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    return { pageLeft: page_.left, pageRight: page_.right, left, right };
  });
  // No ink outside the paper, on either side.
  expect(box.left, 'ink left of the sheet').toBeGreaterThan(box.pageLeft - 2);
  expect(box.right, 'ink right of the sheet').toBeLessThan(box.pageRight + 2);

  // And the foot still lines up with the paper and does not scroll, mirrored.
  const foot = await page.evaluate(() => {
    const r = (/** @type {string} */ sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right) };
    };
    const strip = document.querySelector('.lightbox-strip');
    return { face: r('.lightbox-face'), foot: r('.lightbox-foot'),
      overflow: strip.scrollWidth - strip.clientWidth };
  });
  expect(Math.abs(foot.foot.left - foot.face.left)).toBeLessThan(3);
  expect(Math.abs(foot.foot.right - foot.face.right)).toBeLessThan(3);
  expect(foot.overflow, 'the strip should not scroll for an RTL reader either').toBe(0);
});

test('the studio does not mirror its sheet either', async ({ page }) => {
  // Same fix, different consumer: the studio injects the same SVG and also sets
  // `<html dir>` from the reader's language.
  await page.goto('/customize.html?target=ar&source=ar');
  await expect(page.locator('.face.focused svg text').first())
    .toBeVisible({ timeout: 90_000 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const box = await page.evaluate(() => {
    const svg = document.querySelector('.face.focused svg');
    const p = svg.getBoundingClientRect();
    let left = Infinity;
    for (const t of svg.querySelectorAll('text')) {
      const r = t.getBoundingClientRect();
      if (r.width) left = Math.min(left, r.left);
    }
    return { left, pageLeft: p.left };
  });
  expect(box.left).toBeGreaterThan(box.pageLeft - 2);
});
