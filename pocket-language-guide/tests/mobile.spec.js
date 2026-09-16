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

test.describe('editing a row on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('a row is edited over the card, not a screen and a half away', async ({ page }) => {
    // The studio's three panels stack at this width with the card first, so the
    // bidirectional link that makes the studio work on a desktop -- tap a row on the
    // card and the content list scrolls to it -- threw the reader away from the thing
    // they had just tapped, to a checkbox they then had to find.
    await page.goto('/customize.html?target=es&source=en');
    await expect(page.locator('.face.focused .hit').first()).toBeAttached();
    await page.locator('.face.focused .hit').nth(3).click();

    const popup = page.locator('.item-popup');
    await expect(popup).toBeVisible();
    // It names the row it is editing, which is the one thing a docked sheet could
    // not tell you, and it is why this is anchored rather than docked.
    await expect(popup.locator('.item-popup-title')).not.toBeEmpty();
    // Entirely on screen even for a row near an edge.
    const box = await popup.boundingBox();
    const size = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
    // The four decisions the content list offers for a row.
    await expect(popup.locator('.item-popup-toggle')).toHaveCount(2);
    expect(await popup.locator('.item-popup-chip').count()).toBe(5);
    await expect(popup.getByRole('button', { name: /edit text/i })).toBeVisible();
    await expect(popup.getByRole('button', { name: /show in list/i })).toBeVisible();

    // Escape closes it, and so does a tap outside.
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
  });

  test('switching a row off from the popup takes it off the sheet', async ({ page }) => {
    await page.goto('/customize.html?target=es&source=en');
    await expect(page.locator('.face.focused .hit').first()).toBeAttached();
    const hit = page.locator('.face.focused .hit').nth(3);
    await hit.click();
    const popup = page.locator('.item-popup');
    const title = await popup.locator('.item-popup-title').textContent();
    // The row's own words are on the card; unticking it should take them off.
    await expect(page.locator('.face.focused svg')).toContainText(title.trim());
    await popup.locator('.item-popup-toggle input').first().uncheck();
    // A re-solve replaces the hit layer the popup is anchored to, so it closes
    // itself rather than pointing at a row that has moved.
    await expect(popup).toHaveCount(0);
    await expect(page.locator('.face.focused svg')).not.toContainText(title.trim());
  });

  test('the editor in the popup is the list\'s own, and it saves', async ({ page }) => {
    await page.goto('/customize.html?target=es&source=en');
    await expect(page.locator('.face.focused .hit').first()).toBeAttached();
    await page.locator('.face.focused .hit').nth(3).click();
    const popup = page.locator('.item-popup');
    await popup.getByRole('button', { name: /edit text/i }).click();
    // `.item-edit` is the tree's own form, shared rather than copied: a second
    // editor would drift from the first, and this one already writes to the
    // `overrides` layer the CSV import uses.
    const form = popup.locator('form.item-edit');
    await expect(form).toBeVisible();
    const first = form.locator('input').first();
    await first.fill('Hasta luego');
    await form.getByRole('button', { name: /save/i }).click();
    await expect(page.locator('.face.focused svg')).toContainText('Hasta luego');
  });
});

test.describe('the studio\'s chrome on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  /** The studio, solved, with its phone chrome built. @param {import('@playwright/test').Page} page */
  const studio = async (page) => {
    await page.goto('/customize.html?target=es&source=en');
    await expect(page.locator('.face.focused svg')).toBeVisible();
    await expect(page.locator('.panel-toggle')).toHaveCount(2);
  };

  test('the header is one line of actions over one line of information', async ({ page }) => {
    // It was four lines and 156pt tall -- brand, pair, a full-width banner and a row
    // of four buttons -- on an 844pt phone, and sticky, so it cost that on every
    // screen. And it was not aligned: the sheet page's `#status { order: -2 }` is a
    // bare id selector in a `max-width: 700px` block, so it reached this header too
    // and put the status line to the *left* of the brand on the first line.
    await studio(page);
    const header = await page.locator('.site-header').boundingBox();
    expect(header.height).toBeLessThan(96);

    const box = async (sel) => page.locator(sel).boundingBox();
    const brand = await box('.brand');
    const pdf = await box('#pdf');
    const more = await box('#header-more');
    const pair = await box('#pair');
    const status = await box('#status');
    // Line one: the brand, then the primary action and the disclosure, in that order.
    expect(Math.round(pdf.y)).toBe(Math.round(brand.y + (brand.height - pdf.height) / 2));
    expect(brand.x).toBeLessThan(pdf.x);
    expect(pdf.x).toBeLessThan(more.x);
    expect(more.x + more.width).toBeLessThanOrEqual(390);
    // Line two: what the sheet is and how it came out, under the brand and level
    // with each other rather than scattered up the first line.
    expect(pair.y).toBeGreaterThan(brand.y + brand.height - 1);
    expect(Math.round(pair.y)).toBe(Math.round(status.y));
    expect(pair.x).toBeLessThan(status.x);
    // Export PDF is the page's primary action and stays out of the menu; the rest
    // are in it, and there is one of each rather than a visible copy and a hidden one.
    await expect(page.locator('.site-header .container > #pdf')).toBeVisible();
    for (const sel of ['#banner', '#drill-open', '#png', '.back-link']) {
      await expect(page.locator(`#header-menu > ${sel}`)).toHaveCount(1);
      await expect(page.locator(sel)).toHaveCount(1);
    }
    await expect(page.locator('#png')).toBeHidden();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(wide).toBe(false);
  });

  test('the menu is a disclosure, and closes the four ways it has to', async ({ page }) => {
    await studio(page);
    const more = page.locator('#header-more');
    const menu = page.locator('#header-menu');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();

    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    // Entirely on screen, which a panel hung off the right edge of a 390pt phone
    // is not guaranteed to be.
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    // The button that opened it closes it again.
    await more.click();
    await expect(menu).toBeHidden();

    // Escape, with focus handed back rather than left on something unrendered.
    await more.click();
    await page.locator('#png').focus();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await page.evaluate(() => document.activeElement.id)).toBe('header-more');

    // A press outside it.
    await more.click();
    await page.locator('#pair').click();
    await expect(menu).toBeHidden();

    // And choosing something: the quiz opens and the menu it was chosen from is gone.
    await more.click();
    await page.locator('#header-menu #quiz-open').click();
    await expect(menu).toBeHidden();
    await expect(page.locator('dialog.quiz')).toBeVisible();
  });

  test('each panel folds into its own bar, and opening one folds the other', async ({ page }) => {
    await studio(page);
    const bars = page.locator('.panel-toggle');
    // The bar is the panel's own title, not a second heading above it.
    await expect(page.locator('.panel-title > .panel-toggle')).toHaveCount(2);
    await expect(bars.first()).toHaveText(/format/i);
    await expect(bars.nth(1)).toHaveText(/content/i);
    // Nothing is folded away from a reader who has not asked for it.
    await expect(bars.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#format-body')).toBeVisible();
    await expect(page.locator('#content-body')).toBeVisible();

    await bars.nth(1).click();
    await expect(bars.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#content-body')).toBeHidden();
    await expect(page.locator('#format-body')).toBeVisible();

    // Opening one folds the other, which is what makes the bars worth having.
    await bars.nth(1).click();
    await expect(page.locator('#content-body')).toBeVisible();
    await expect(page.locator('#format-body')).toBeHidden();

    // Folded, a panel is exactly its bar -- and with both folded the card, both bars
    // and the way into either of them are on the first screen, which is the whole
    // point of the thing on a phone.
    await bars.nth(1).click();
    await page.evaluate(() => scrollTo(0, 0));
    const last = page.locator('.studio > section').last();
    const section = await last.boundingBox();
    const bar = await last.locator('.panel-title').boundingBox();
    // The bar and the 1px rule the panel already drew under itself, and nothing else.
    expect(section.height).toBeLessThanOrEqual(bar.height + 1);
    expect(section.y + section.height).toBeLessThan(PHONE.height);
  });

  test('a panel fades at its foot while there is more below the cut', async ({ page }) => {
    // A scrolling box that ends where the viewport ends looks like a list that ends
    // there. The fade says otherwise -- and has to stop saying it at the bottom,
    // because a fade that cannot know where it is is a lie.
    await studio(page);
    const format = page.locator('.studio > section').first();
    await expect(format).not.toHaveClass(/at-end/);
    expect(await format.evaluate((s) => getComputedStyle(s).maskImage)).toContain('linear-gradient');

    await format.evaluate((s) => { s.scrollTop = s.scrollHeight; });
    await expect(format).toHaveClass(/at-end/);
    expect(await format.evaluate((s) => getComputedStyle(s).maskImage)).toBe('none');

    // And back: it is the panel's own last row that answers, not a height measured
    // once, so scrolling away from the bottom brings the fade back.
    await format.evaluate((s) => { s.scrollTop = 0; });
    await expect(format).not.toHaveClass(/at-end/);
  });

  test('a folded list is opened by the things that put something in it', async ({ page }) => {
    // "Show in list" on the card's row popup scrolls the content list to that row.
    // With the list folded into its bar that would move nothing anyone can see.
    await studio(page);
    await page.locator('.panel-toggle').nth(1).click();
    await expect(page.locator('#content-body')).toBeHidden();

    // Back to the top first, and wait for the scroll event that takes us there to
    // land: the row popup dismisses itself on a scroll, so a click dispatched in the
    // same frame as one is undone by it. A finger never does this; Playwright's
    // scroll-then-click does.
    await page.evaluate(() => new Promise((done) => {
      scrollTo(0, 0);
      requestAnimationFrame(() => requestAnimationFrame(done));
    }));
    await page.locator('.face.focused .hit').nth(3).click();
    await page.locator('.item-popup').getByRole('button', { name: /show in list/i }).click();
    await expect(page.locator('#content-body')).toBeVisible();
    await expect(page.locator('#tree .items li.lit, #tree details[open]').first()).toBeAttached();
  });
});

test('the phone\'s chrome is built and taken down at the breakpoint', async ({ page }) => {
  // Turning a phone to landscape crosses 700px, and what belongs at 844 wide is the
  // desktop header -- in the order the desktop was built for, which is why the
  // controls are put back against markers rather than re-stated in a second list.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.face.focused svg')).toBeVisible();
  const order = () => page.evaluate(() => [...document.querySelectorAll('.site-header .container > *')]
    .map((el) => el.id || el.className.replace(/\s+/g, '.')).join(' '));
  const laid = await order();
  expect(laid).toContain('drill-open pdf png btn.ghost.back-link');
  await expect(page.locator('.panel-toggle')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#header-menu > #png')).toBeAttached();
  await expect(page.locator('.panel-toggle')).toHaveCount(2);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.site-header .container > #png')).toBeVisible();
  await expect(page.locator('.panel-toggle')).toHaveCount(0);
  expect(await order()).toBe(laid);
});

test('none of the phone\'s chrome is on a desktop', async ({ page }) => {
  // The desktop studio is a viewport-height grid with all three panels in front of
  // you: there is nothing to fold away and nothing to hide in a menu.
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.face.focused svg')).toBeVisible();
  await expect(page.locator('.panel-toggle')).toHaveCount(0);
  await expect(page.locator('#header-more')).toBeHidden();
  await expect(page.locator('#header-menu')).toBeHidden();
  for (const sel of ['#banner', '#drill-open', '#pdf', '#png', '.back-link']) {
    await expect(page.locator(`.site-header .container > ${sel}`)).toBeVisible();
  }
  const panels = page.locator('.studio > section:nth-of-type(1), .studio > section:nth-of-type(3)');
  expect(await panels.evaluateAll((all) => all.map((s) => getComputedStyle(s).maskImage)))
    .toEqual(['none', 'none']);
});

test('on a desktop a picked row still reveals itself in the list', async ({ page }) => {
  // The popup is the phone's answer, not a replacement: with both panes in front of
  // you, scrolling the list to the row is the better one and stays.
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.face.focused .hit').first()).toBeAttached();
  await page.locator('.face.focused .hit').nth(3).click();
  await expect(page.locator('.item-popup')).toHaveCount(0);
  await expect(page.locator('#tree .items li.lit, #tree details[open]').first()).toBeAttached();
});
