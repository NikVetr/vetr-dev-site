// The phone. Three things were broken here and none of them showed on a desktop.
import { test, expect } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the studio preview has a size', async ({ page }) => {
    // It had none. `.face-fit` is a `container-type: size` and `.face.focused` asks
    // it for `100cqh`; the stacked layout takes the viewport height off the body, so
    // the flex chain had no definite block size, every `flex: 1` resolved to 0, and
    // `min(100%, calc(0 * aspect))` was 0. Measured before the fix: `.face-fit` 0
    // tall, the face 2x2, its `<svg>` 0x0 -- a 56pt sliver where the sheet should be.
    // The thumbnail strip still drew, which is why the panel looked present.
    await page.goto('/customize.html?target=es&source=en');
    const face = page.locator('.face.focused svg');
    await expect(face).toBeVisible();
    const box = await face.boundingBox();
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(100);
    // And it must be laid out rather than overflowing a collapsed parent, which is
    // the half-fixed state `contain: size` left it in.
    const fit = await page.locator('.face-fit').boundingBox();
    expect(fit.height).toBeGreaterThanOrEqual(box.height);
  });

  test('a card is on screen before the language picker has had its say', async ({ page }) => {
    // The "…I want to speak" grid is a compact block beside the heading on a desktop
    // and 922pt of wall on a phone -- fifty-two buttons at three or four across --
    // which put the first card 1230pt down. A screen and a half of controls before
    // any of the thing they control.
    await page.goto('/index.html');
    await expect(page.locator('.card').first()).toBeVisible();
    const grid = await page.locator('.want-grid').boundingBox();
    const card = await page.locator('.card').first().boundingBox();
    expect(grid.height).toBeLessThan(320);
    expect(card.y).toBeLessThan(PHONE.height);
    // And nothing may scroll sideways, which is the other way a phone layout fails.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(wide).toBe(false);
  });

  test('the sheet comes before the controls, with its status under it', async ({ page }) => {
    // Stacked, the options are 1400pt of form, so the preview began 1708pt down --
    // two screens past the fold -- and the status line and the warnings with it. A
    // reader met a page of controls and never saw the sheet they controlled.
    await page.goto('/sheet.html?target=es&source=en');
    await expect(page.locator('.sheet-preview .face svg').first()).toBeVisible();
    const y = async (sel) => (await page.locator(sel).boundingBox()).y;
    const preview = await y('.sheet-preview');
    expect(preview).toBeLessThan(PHONE.height);
    expect(await y('.export-block')).toBeGreaterThan(preview);
    expect(await y('#controls')).toBeGreaterThan(await y('#warnings'));
    // And the point of the cap: the sheet, what it says about itself and the way
    // out all share the first screen. The status line was at 978pt on an 844pt
    // phone before this, which is the complaint restated one scroll lower.
    expect(await y('#status')).toBeLessThan(PHONE.height);
    expect(await y('#warnings')).toBeLessThan(PHONE.height);
  });
});

test.describe('a multi-page export', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('offers each page on its own instead of one zip', async ({ page }) => {
    // Neither mobile OS unzips by default, so the archive a desktop wants is a file
    // the reader cannot open -- and the phone-screen preset produces 25 of them.
    // The share sheet alone was not enough: `navigator.share` needs transient user
    // activation, and rasterising 25 faces outlasts the activation from the export
    // button, so it throws and the reader was dropped back to the zip.
    await page.addInitScript(() => {
      window.__downloads = [];
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function patched() {
        if (this.download) { window.__downloads.push(this.download); return; }
        return click.call(this);
      };
    });
    await page.goto('/sheet.html?target=es&source=en');
    await expect(page.locator('.sheet-preview .face svg').first()).toBeVisible();
    // A phone wallpaper is the case that makes many images.
    await page.evaluate(() => {
      [...document.querySelectorAll('#controls button')]
        .find((b) => /phone screen/i.test(b.textContent || ''))?.click();
    });
    await expect(page.locator('#status')).toContainText('image(s)');
    await page.locator('#png').click();

    const panel = page.locator('#saved-images');
    await expect(panel).toBeVisible({ timeout: 120_000 });
    const pages = panel.locator('.saved-page');
    expect(await pages.count()).toBeGreaterThan(1);
    // Every page has its own picture, its own save and its own open.
    await expect(pages.first().locator('img')).toBeVisible();
    await expect(pages.first().locator('button')).toHaveCount(1);
    const open = pages.first().locator('a[target="_blank"]');
    await expect(open).toHaveAttribute('href', /^blob:/);
    // And nothing was downloaded without being asked for -- least of all a zip.
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);

    // The zip is still one click for whoever wants it.
    await expect(panel.getByRole('button', { name: /zip/i })).toBeVisible();
  });
});
