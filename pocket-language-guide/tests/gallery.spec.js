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

  test('changing your own language re-glosses the chrome too, not just the grid', async ({ page }) => {
    // The grid and the collage came from the registry, so they moved; everything
    // built by passing `t(...)` in as a value stayed in the previous language,
    // because nothing swapped the catalogue. The result was a German card list
    // under an English heading, which is worse than either language alone.
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    const heading = page.locator('h1');
    const english = await heading.textContent();

    await pickReader(page, 'Deutsch');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(heading).not.toHaveText(english ?? '');
    // Static markup, a card built in JS, and the picker's own accessible name --
    // three different mechanisms, all of which used to be left behind.
    await expect(page.locator('.skip-link')).toHaveText('Zu den Sprachen springen');
    await expect(page.locator('.card').first().getByRole('link', { name: 'Exportieren' }))
      .toBeVisible();
    await expect(page.locator('.lang-picker-button'))
      .toHaveAttribute('aria-label', /wählen Sie die Sprache/);
    // And it survives a second change, rather than sticking on the first.
    await pickReader(page, 'English');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(heading).toHaveText(english ?? '');
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

  test('a thumbnail opens every face, one arrow key or one thumbnail apart', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('dialog.lightbox')).toHaveCount(0);

    await page.locator('.card-thumb-button').first().click();
    const dialog = page.locator('dialog.lightbox');
    await expect(dialog).toBeVisible();
    // Vector immediately -- the first face is pre-rendered, so there is nothing to
    // wait for -- and then every face rather than the first, once the sheet solves.
    // The `img` is still built first and is still what a pair with no pack falls back
    // to; it is no longer worth asserting on, because the inflate usually beats it
    // off the screen.
    await expect(dialog.locator('.lightbox-face svg')).toBeVisible({ timeout: 180_000 });

    // One thumbnail per face, and the sheet comes in pairs of them. The strip is
    // built from the whole sheet rather than from the pre-rendered first face, so it
    // is also the signal that the solve has landed -- which is what has to be waited
    // for now that the card no longer waits for it to show something.
    const thumbs = dialog.locator('.lightbox-thumb');
    await expect(thumbs.first()).toBeVisible({ timeout: 180_000 });
    const faces = await thumbs.count();
    expect(faces).toBeGreaterThanOrEqual(4);
    expect(faces % 2).toBe(0);
    await expect(thumbs.first()).toHaveAttribute('aria-selected', 'true');

    // The carets are the ends of the series, so the first one cannot go back.
    await expect(dialog.locator('.lightbox-step.prev')).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await expect(thumbs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('.lightbox-step.prev')).toBeEnabled();
    await page.keyboard.press('End');
    await expect(dialog.locator('.lightbox-step.next')).toBeDisabled();

    // And a thumbnail is the other way to the same place.
    await thumbs.nth(2).click();
    await expect(thumbs.nth(2)).toHaveAttribute('aria-selected', 'true');

    // The two things you would want next are right there.
    await expect(dialog.locator('.lightbox-export')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.lightbox')).toHaveCount(0);
  });

  test('the card opens on a pre-rendered face, not on a blur', async ({ page }) => {
    // Laying a sheet out is about a second of arithmetic and none of it is network,
    // so for that second the reader used to be looking at the 480px card thumbnail
    // upscaled and dimmed. `prerender_packs.mjs` now ships the first face as 13KB of
    // gzipped SVG, which is the same renderer over the same pinned fit -- so the face
    // that arrives first is byte-identical to the one the solve would produce, and
    // the swap is invisible.
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    const dialog = page.locator('dialog.lightbox');

    const opened = Date.now();
    await page.locator('.card-thumb-button').first().click();
    await expect(dialog.locator('.lightbox-face svg')).toBeVisible({ timeout: 30_000 });
    const vector = Date.now() - opened;
    const early = dialog.locator('.lightbox-face svg').innerHTML();

    // The strip is built from the whole sheet, so it marks when the solve landed.
    await expect(dialog.locator('.lightbox-thumb').first()).toBeVisible({ timeout: 180_000 });
    const solved = Date.now() - opened;

    // A fetch and an inflate against a full solve. The bound is loose on purpose --
    // this asserts the ordering, not a benchmark -- but the measured gap is ~60ms
    // against ~1050ms, and if the pre-render stopped being read this would fail
    // rather than merely get slower.
    expect(vector).toBeLessThan(Math.max(solved / 2, 400));

    // And the solved face replaces it with the same bytes, so nothing visibly moves.
    expect(await dialog.locator('.lightbox-face svg').innerHTML()).toBe(await early);
  });

  test('the pair is editable from inside the lightbox, either side or the arrow', async ({ page }) => {
    await page.goto('/');
    await page.locator('.card-thumb-button').first().click();
    const dialog = page.locator('dialog.lightbox');
    await expect(dialog.locator('.lightbox-thumb').first()).toBeVisible({ timeout: 180_000 });

    // Reads the way the pair is spoken: the language you read, then the one being
    // learned. The card behind is the first in the grid, whatever that is today --
    // and the swap below makes *that* language the reader, which switches the whole
    // interface into it. So the export link is found by class: on an Arabic card its
    // label is تصدير, and looking for the English word stops working the moment the
    // gallery reorders.
    const pair = dialog.locator('.lightbox-pair .lang-picker-button');
    await expect(pair.first()).toHaveText('English');
    const learning = await pair.nth(1).textContent();
    const before = await dialog.locator('.lightbox-export').getAttribute('href');

    // The arrow reverses the pair, and the export it offers follows.
    await dialog.locator('.lightbox-swap').click();
    await expect(pair.first()).toHaveText(learning ?? '');
    await expect(pair.nth(1)).toHaveText('English');
    await expect(dialog.locator('.lightbox-export')).not.toHaveAttribute('href', before ?? '');
    await expect(dialog.locator('.lightbox-thumb').first()).toBeVisible({ timeout: 180_000 });

    // Changing the reader's language here changes it for the grid behind too, so
    // closing the lightbox does not land on a gallery that disagrees with it.
    await expect(page.locator('#reader .lang-picker-button')).toHaveText(learning ?? '');
  });

  test('the flag grid is two rows whatever the language, and shows all six', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    // Six is what the widest languages need: French, Spanish and Arabic are each
    // spoken in exactly six of the registry's countries, and a grid two columns
    // wide hid three of them behind a `+3`. The column count follows the cell
    // count so the block stays two rows tall -- which is the constraint that
    // matters, because a third row would make one card taller than its neighbours.
    const heights = await page.evaluate(() => [...new Set(
      [...document.querySelectorAll('.card-head')].map((c) => Math.round(c.getBoundingClientRect().height)),
    )]);
    expect(heights).toHaveLength(1);

    const french = page.locator('.card').filter({ hasText: 'Français' }).first();
    await expect(french.locator('.flags > .flag')).toHaveCount(6);
    await expect(french.locator('.flag.more')).toHaveCount(0);
    expect(await french.locator('.flags').evaluate((n) => n.style.getPropertyValue('--flag-cols')))
      .toBe('3');
  });

  test('the flag overflow shows the flags it stands for', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    // The grid holds six flags now, so only English overflows -- and English is
    // the default reader, which is never in its own grid. So the reader moves
    // first. This is the same trap as the language with no pack: raising the cap
    // left the overflow state real and untested.
    await pickReader(page, 'Français');
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

test('the card, the pair and the strip share one width', async ({ page }) => {
  // The card's width is its rendered height times the sheet's aspect, so on a short
  // window the height binds. The pair was hard-coded to the width a tall window
  // gives and the foot was sized by its own fixed thumbnails, so both sat outboard
  // of the paper.
  for (const size of [{ width: 1500, height: 950 }, { width: 1500, height: 560 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.locator('.card-thumb-button').first().click();
    const face = page.locator('.lightbox-face');
    await expect(face).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(300);

    const w = async (/** @type {string} */ sel) =>
      (await page.locator(sel).boundingBox()).width;
    const card = await w('.lightbox-face');
    for (const sel of ['.lightbox-pair', '.lightbox-foot']) {
      const got = await w(sel);
      expect(Math.abs(got - card), `${sel} against the card at ${size.height}px tall`)
        .toBeLessThan(3);
    }

    // The carets sit beside the paper, not on it and not out at the window's edge.
    const edges = await page.evaluate(() => {
      const r = (/** @type {string} */ sel) => {
        const b = document.querySelector(sel).getBoundingClientRect();
        return { left: b.left, right: b.right };
      };
      const strip = document.querySelector('.lightbox-strip');
      return {
        face: r('.lightbox-face'), prev: r('.lightbox-step.prev'), next: r('.lightbox-step.next'),
        overflow: strip.scrollWidth - strip.clientWidth,
      };
    });
    expect(edges.prev.right).toBeLessThanOrEqual(edges.face.left + 1);
    expect(edges.next.left).toBeGreaterThanOrEqual(edges.face.right - 1);
    expect(edges.face.left - edges.prev.right, 'the left caret hugs the paper')
      .toBeLessThan(24);
    expect(edges.next.left - edges.face.right, 'and so does the right one')
      .toBeLessThan(24);

    // Every thumbnail fits: the strip is a grid of equal fractions, so ten faces
    // give narrower thumbs rather than a scrollbar.
    expect(edges.overflow, 'the thumbnail strip should never scroll').toBe(0);
    await page.keyboard.press('Escape');
  }
});

test('both carets are visible before hover and neither has a box', async ({ page }) => {
  await page.goto('/');
  await page.locator('.card-thumb-button').first().click();
  await expect(page.locator('.lightbox-face')).toBeVisible({ timeout: 90_000 });

  for (const dir of ['prev', 'next']) {
    const step = page.locator(`.lightbox-step.${dir}`);
    await expect(step).toBeVisible();
    // The box was `button:hover` winning over a `:not(:disabled)`-guarded override,
    // so it appeared on whichever caret was at the end of the series.
    await step.hover();
    const paint = await step.evaluate((el) => {
      const css = getComputedStyle(el);
      return { bg: css.backgroundColor, radius: css.borderRadius };
    });
    expect(paint.bg, `${dir} caret background on hover`).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  }
});

test('a language CLDR cannot name falls back to the registry, not to its code',
  async ({ page }) => {
    // `Intl.DisplayNames.of()` defaults to `fallback: 'code'` and returns *the code
    // itself* when CLDR has no name -- so `?? fallback` never fired and the registry's
    // `exonym_en` was unreachable. CLDR has no name for Quenya in any locale, and
    // headless Chrome has none for Klingon even in English, so these two cards were
    // titled `qya` and `tlh` while the registry sat there saying otherwise.
    await page.goto('/?reader=en');
    await expect(page.locator('.card').first()).toBeVisible();
    const titles = await page.locator('.card-name').allInnerTexts();
    expect(titles).toContain('Quenya');
    expect(titles.filter((t) => /^(qya|tlh)$/.test(t)),
      'no card should be titled with a bare language code').toEqual([]);

    // And the conscript face leads the interface stack, so a Private Use Area glyph
    // renders wherever chrome text carries one rather than only in the badge.
    const drawn = await page.evaluate(async () => {
      await document.fonts.ready;
      const span = document.createElement('span');
      span.style.cssText = 'position:absolute;visibility:hidden;font-size:100px';
      document.body.append(span);
      const width = (family) => {
        span.style.fontFamily = family;
        span.textContent = '\uF8E4\uF8D7';
        return span.getBoundingClientRect().width;
      };
      return { ui: width('var(--ui)'), plain: width('serif') };
    });
    expect(drawn.ui).toBeGreaterThan(0);
    expect(drawn.ui, 'the conscript face should win for these codepoints')
      .not.toBeCloseTo(drawn.plain, 0);
  });

test('a sheet the reader has looked at is kept across visits', async ({ page }) => {
  // Only the *first* face is a shipped asset. Faces two onward are solved in the
  // browser, and shipping them too would be 50MB gzipped across 420 pairs — so this
  // cache is what stops a reader paying for the same solve on every visit.
  await page.goto('/');
  const dialog = page.locator('dialog.lightbox');
  await page.locator('.card-thumb-button').first().click();
  // **The strip, not the face.** The face arrives pre-rendered and would be visible
  // whether this cache worked or not, which made an earlier version of this test pass
  // vacuously. The thumbnail strip is built from the whole sheet, so it is the only
  // thing on screen that means the solve is done.
  await expect(dialog.locator('.lightbox-thumb').first()).toBeVisible({ timeout: 180_000 });
  await expect.poll(() => page.evaluate(async () => {
    const c = await caches.open('plg-sheets');
    return (await c.keys()).length;
  }), { timeout: 60_000 }).toBeGreaterThan(0);

  // A fresh page finds it, and finds it fast.
  await page.reload();
  await expect(page.locator('.card').first()).toBeVisible();
  const t0 = Date.now();
  await page.locator('.card-thumb-button').first().click();
  await expect(dialog.locator('.lightbox-thumb').first()).toBeVisible({ timeout: 90_000 });
  const took = Date.now() - t0;
  expect(took, `a kept sheet should open without solving, took ${took}ms`).toBeLessThan(1500);

  // And the key carries the shell's content hash, so an engine change invalidates.
  const keys = await page.evaluate(async () => {
    const c = await caches.open('plg-sheets');
    return (await c.keys()).map((r) => r.url);
  });
  expect(keys[0]).toMatch(/__sheet\/.+__.+\?v=[0-9a-f]{6,}/);
});

  test('the card does not resize when the thumbnails arrive', async ({ page }) => {
    // The strip and the two buttons appear after the faces are typeset, and the card
    // is sized from the height left over -- so the foot arriving used to take that
    // height away and resize the card under the reader. Reserving a *floor* was not
    // enough: a thumbnail's height depends on how many there are, so the foot still
    // moved once the face count was known. The strip is now exactly as tall as the
    // tallest a thumbnail may be, and they fit inside it.
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    await page.locator('.card-thumb-button').first().click();
    const face = page.locator('.lightbox-face');
    await expect(face).toBeVisible();
    const before = /** @type {{height:number}} */ (await face.boundingBox());
    await expect(page.locator('.lightbox-thumb').nth(3)).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(400);
    const after = /** @type {{height:number}} */ (await face.boundingBox());
    expect(Math.abs(after.height - before.height),
      `card moved ${(after.height - before.height).toFixed(0)}px when the foot filled`)
      .toBeLessThan(2);
  });
