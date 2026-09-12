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
