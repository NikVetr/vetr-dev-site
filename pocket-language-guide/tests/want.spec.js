// The language grid at the top of the gallery: "I speak" is answered in the site
// header, and this is the answer to "and I want to speak".
import { test, expect } from '@playwright/test';

/** The cards' languages in grid order, and which of them shares the first row. */
async function grid(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const top = cards[0]?.offsetTop;
    return {
      order: cards.map((c) => c.dataset.lang),
      topRow: cards.filter((c) => c.offsetTop === top).map((c) => c.dataset.lang),
      chosen: document.querySelector('.card.chosen')?.dataset.lang ?? null,
    };
  });
}

test('the grid offers every language the cards do, in the same order', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  const buttons = await page.locator('#want .want-btn').evaluateAll(
    (nodes) => nodes.map((n) => n.getAttribute('data-lang')));
  const { order } = await grid(page);
  // One list seen twice, not two lists -- and not empty, which is the shape of a
  // selector that matches nothing and passes.
  expect(buttons.length).toBeGreaterThan(20);
  expect(buttons).toEqual(order);
  // The reader's own language is not offered, here or below.
  expect(buttons).not.toContain('en');
});

test('picking a language turns its column until that card is in the top row', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  const start = await grid(page);
  expect(start.chosen).toBe(null);

  // Something known to be well below the first row, so the test is not vacuous.
  const pick = start.order[start.order.length - 3];
  expect(start.topRow).not.toContain(pick);
  const columns = start.topRow.length;
  const from = start.order.indexOf(pick);

  await page.locator(`#want .want-btn[data-lang="${pick}"]`).click();
  await page.waitForTimeout(800);
  const after = await grid(page);

  expect(after.chosen).toBe(pick);
  expect(after.topRow).toContain(pick);
  // **Only that card's column moved.** Sorting it to the front instead would
  // displace every card after it; the grid is alphabetical and that is worth
  // keeping, so every other column has to be untouched.
  for (let i = 0; i < start.order.length; i += 1) {
    if (i % columns === from % columns) continue;
    expect(after.order[i], `column ${i % columns} should not have moved`)
      .toBe(start.order[i]);
  }
  // And the column it did move stayed a rotation of itself rather than a reshuffle.
  const before = [];
  const now = [];
  for (let i = from % columns; i < start.order.length; i += columns) {
    before.push(start.order[i]);
    now.push(after.order[i]);
  }
  expect(now.length).toBeGreaterThan(1);
  expect([...now].sort()).toEqual([...before].sort());
  expect(now[0]).toBe(pick);

  // The card has to be somewhere a reader can see it, which is the whole point.
  const box = await page.locator('.card.chosen').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(1100);

  // Exactly one button reads as pressed.
  await expect(page.locator('#want .want-btn[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator(`#want .want-btn[data-lang="${pick}"]`))
    .toHaveAttribute('aria-pressed', 'true');
});

test('the reorder still happens for a reader who has asked for less motion', async ({ page }) => {
  // The travel is an explanation, not the mechanism: without it the card still has
  // to arrive in the top row and still has to be the one wearing the ring.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  const start = await grid(page);
  const pick = start.order[start.order.length - 3];
  await page.locator(`#want .want-btn[data-lang="${pick}"]`).click();
  const after = await grid(page);
  expect(after.chosen).toBe(pick);
  expect(after.topRow).toContain(pick);
});

test('the gallery uses the viewport without touching its edges', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  const { gap, columns, headerGap } = await page.evaluate(() => {
    const g = document.getElementById('gallery').getBoundingClientRect();
    const brand = document.querySelector('.brand').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.card')];
    const top = cards[0].offsetTop;
    return {
      gap: Math.round(g.left),
      columns: cards.filter((c) => c.offsetTop === top).length,
      headerGap: Math.round(brand.left),
    };
  });
  // Inset, but not the 370px of nothing that a 1180px cap left on each side.
  expect(gap).toBeGreaterThan(8);
  expect(gap).toBeLessThan(220);
  // The header is capped the same way, or the brand sits inboard of the cards it
  // labels -- the mistake `.container-wide` was added to fix on the studio.
  expect(Math.abs(headerGap - gap)).toBeLessThan(4);
  // Six across at this width rather than the four a 1180px cap gave.
  expect(columns).toBeGreaterThanOrEqual(5);
});

test('the intro stacks before its two columns get too narrow to read', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  const stacked = await page.evaluate(() => {
    const h1 = document.querySelector('h1').getBoundingClientRect();
    const want = document.getElementById('want').getBoundingClientRect();
    return want.top >= h1.bottom;
  });
  expect(stacked, 'the language grid should sit below the heading, not beside it')
    .toBe(true);
});

test('a language ICU has never heard of is still named in the reader’s own script', async ({ page }) => {
  // Klingon and Quenya printed their English exonyms on all fifty interface
  // languages. `languageName` asks `Intl.DisplayNames` and falls back to the
  // registry's `exonym_en`, and Chromium's ICU answers a bare `tlh` for *every*
  // locale -- so `fallback: 'none'` gives null and English is what is left. Node's
  // fuller ICU does know them, which is why this only ever showed in a browser and
  // no test caught it.
  //
  // `language-names.csv` is the only place that knows the answer, so the gallery
  // now loads it: 29KB gzipped against a pack index an order of magnitude bigger on
  // the same page.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  const { pickReader } = await import('./controls.js');
  await pickReader(page, '日本語');
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  await expect(page.locator('.card[data-lang="tlh"] .card-name')).toHaveText('クリンゴン語');
  await expect(page.locator('.card[data-lang="qya"] .card-name')).toHaveText('クウェンヤ');
  // The picker grid reads the same function, so it comes along.
  await expect(page.locator('#want .want-btn[data-lang="tlh"] .want-name'))
    .toHaveText('クリンゴン語');

  // Not vacuous in the other direction either: a language ICU *does* know must
  // still come from ICU, because the registry's column is inflected for the
  // "I do not speak {target}" frame and would put a case form in a title.
  await expect(page.locator('.card[data-lang="ru"] .card-name')).toHaveText('ロシア語');
});

test('a card is headed with the language, not with "in the language"', async ({ page }) => {
  // The registry's `name` is the form the sentence slot needs, so Russian carries
  // `клингонском` -- the prepositional of `на {target}` -- and Polish `po
  // klingońsku`. For the fifty languages ICU knows that never surfaced, because
  // `languageName` asks ICU first and gets the nominative. For the two it does not,
  // the registry *is* the answer, and the Klingon card came out headed
  // `клингонском`: "in Klingon", on a card whose neighbours all say `английский`.
  //
  // The `title` column is the dictionary form for those cells and
  // `setLanguageNames` prefers it. `tests/language-titles.test.mjs` holds the source
  // for each one; this is the reproduction.
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { pickReader } = await import('./controls.js');

  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await pickReader(page, 'Русский');
  await page.waitForFunction(() => document.documentElement.lang === 'ru');
  await expect(page.locator('.card[data-lang="tlh"] .card-name')).toHaveText('клингонский');
  // The `#want` grid and the picker's own list read the same function.
  await expect(page.locator('#want .want-btn[data-lang="tlh"] .want-name'))
    .toHaveText('клингонский');
  // Quenya is indeclinable in Russian, so its cell is already a title and stays
  // one -- the column is sparse on purpose and an empty cell means "no change".
  await expect(page.locator('.card[data-lang="qya"] .card-name')).toHaveText('квенья');

  // Polish, where the slot form is a whole prepositional phrase rather than a case
  // ending, so the two forms share no suffix and a rule could not have derived one
  // from the other.
  await pickReader(page, 'Polski');
  await page.waitForFunction(() => document.documentElement.lang === 'pl');
  await expect(page.locator('.card[data-lang="tlh"] .card-name')).toHaveText('klingoński');
  await expect(page.locator('.card[data-lang="qya"] .card-name')).toHaveText('Quenya');
});

test('where the platform draws no flags, the codes carry the flag’s colours', async ({ page }) => {
  // Windows ships no glyph for a regional-indicator pair, so `ui/flags.js` detects
  // that and shows country codes instead. Two grey letters in a white box, a dozen
  // of them down a card, read as something that failed to load rather than as a
  // choice -- which is how it was reported. The chips now carry that flag's own two
  // colours, the same `flag_colors` the sheet's background wash uses.
  //
  // Forced here by making the width probe report a composed pair as no narrower
  // than the two letters drawn separately, which is exactly what the platform
  // without flag glyphs does.
  await page.addInitScript(() => {
    const measure = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      return { ...measure.call(this, text), width: [...text].length * 16 };
    };
  });
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();

  const seen = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.flags.as-codes .flag')]
      .filter((c) => !c.classList.contains('more'));
    return chips.map((c) => ({
      code: c.textContent,
      tinted: c.classList.contains('tinted'),
      a: c.style.getPropertyValue('--flag-a'),
      painted: getComputedStyle(c).backgroundImage.startsWith('linear-gradient'),
    }));
  });
  // The fallback is actually in force, and on real cards -- not a selector matching
  // nothing, which is the shape this suite has been caught by before.
  expect(seen.length).toBeGreaterThan(20);
  // Every region in the registry has two colours, so every chip should be tinted.
  expect(seen.filter((c) => !c.tinted)).toEqual([]);
  for (const c of seen.slice(0, 12)) {
    expect(c.a, `${c.code} should carry a flag colour`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(c.painted, `${c.code} should be painted with the split wash`).toBe(true);
  }
});

test('the picker opens expanded, and its label stays above the list', async ({ page }) => {
  // Two things, and both are about the picker being what the page is for. It folds
  // itself the moment a language has been picked, which is the common case -- so
  // remembering that state meant almost every return visit opened on a page whose
  // first control was collapsed. And fifty-two buttons is more than one screen, so
  // the question they answer used to scroll off the top and leave a reader looking at
  // a wall of unlabelled languages with no visible way to fold them away.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const toggle = page.locator('#want-toggle');
  await expect(page.locator('#gallery')).toHaveAttribute('aria-busy', 'false');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // Picking folds it, and the fold does not survive a reload. Nothing about the
  // picker does: which card was reeled to the top row is this visit's reordering
  // rather than a setting, and the reader's own language is the header's business.
  await page.locator('#want .want-btn[data-lang="ja"]').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#want-chosen')).not.toBeEmpty();
  await page.reload();
  await expect(page.locator('#gallery')).toHaveAttribute('aria-busy', 'false');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // Stuck under the site header, whose height is not a constant and so is published
  // by a `ResizeObserver` as `--header-h`.
  const stuck = await page.evaluate(async () => {
    const label = /** @type {HTMLElement} */ (document.getElementById('want-toggle'));
    const header = /** @type {HTMLElement} */ (document.querySelector('.site-header'));
    scrollTo(0, Math.round(label.getBoundingClientRect().top + scrollY
      - header.getBoundingClientRect().height + 120));
    await new Promise((r) => { setTimeout(r, 120); });
    return {
      label: Math.round(label.getBoundingClientRect().top),
      under: Math.round(header.getBoundingClientRect().bottom),
      published: getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
    };
  });
  expect(stuck.published).toMatch(/^\d+px$/);
  // Pinned to the header's lower edge rather than scrolled past it.
  expect(stuck.label).toBeGreaterThanOrEqual(stuck.under - 2);
  expect(stuck.label).toBeLessThan(stuck.under + 12);
});

test('the collage names the language of the place, not whatever sorts first', async ({ browser }) => {
  // It used to say "I speak" in whichever languages the registry listed first, which
  // is decoration that means nothing. The two signals a browser gives away do mean
  // something: what the device is set to, and — the one that actually moves when the
  // reader does — the timezone, which `data/registry/timezones.csv` turns into a
  // country and `languages.csv` turns into what is spoken there.
  const context = await browser.newContext({
    locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('#gallery')).toHaveAttribute('aria-busy', 'false');
    const chips = () => page.evaluate(() => [...document.querySelectorAll('#reader-label .speak')]
      .map((el) => ({
        lang: el.lang,
        lead: el.classList.contains('lead'),
        shown: getComputedStyle(el).display !== 'none',
      })));

    const wide = await chips();
    // The reader's own leads and is last in source order; the guess sits beside it.
    expect(wide.at(-1)).toMatchObject({ lang: 'en', lead: true });
    expect(wide.at(-2)?.lang).toBe('ja');

    // **And it survives the phone**, where there is only room for the nearest two --
    // which is the whole reason for choosing them by meaning rather than by sort.
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = (await chips()).filter((c) => c.shown);
    expect(narrow.length).toBeLessThanOrEqual(3);
    expect(narrow.map((c) => c.lang)).toContain('ja');
    expect(narrow.at(-1)).toMatchObject({ lang: 'en', lead: true });
  } finally {
    await context.close();
  }
});
