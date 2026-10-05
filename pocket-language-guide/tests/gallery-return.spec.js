// Coming back to the landing page within a session. Converse's way back and the
// studio's are links to `./`, a fresh load; the browser's Back may or may not come from
// its cache; a reload is the reader coming back too. Every way, the page is where the
// reader left it -- scrolled as far down the cards, the language they chose still
// chosen -- and a new session starts at the top, on the question.
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
const look = (page) => page.evaluate(() => ({
  y: Math.round(scrollY),
  open: document.getElementById('want-toggle')?.getAttribute('aria-expanded'),
  pressed: [...document.querySelectorAll('#want .want-btn[aria-pressed="true"]')]
    .map((b) => /** @type {HTMLElement} */ (b).dataset.lang),
  named: document.getElementById('want-chosen')?.textContent,
  order: [...document.querySelectorAll('#gallery .card')].map((c) => /** @type {HTMLElement} */ (c).dataset.lang).join(),
  ringed: /** @type {HTMLElement|null} */ (document.querySelector('#gallery .card.chosen'))?.dataset.lang ?? null,
}));

/** @param {import('@playwright/test').Page} page */
const ready = (page) => expect(page.locator('#gallery')).toHaveAttribute('aria-busy', 'false');

test('on a phone, every way back returns to the place and the choice; a new session does not', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await page.locator('#want .want-btn[data-lang="ja"]').click();
  // And on a little, as a reader looks around the card they went to.
  await page.evaluate(() => scrollBy(0, 300));
  const left = await look(page);
  expect(left).toMatchObject({ open: 'false', pressed: ['ja'], named: 'Japanese' });
  expect(left.y).toBeGreaterThan(1000);

  // Converse's own way back: `location.href = './'`.
  await page.locator('.card[data-lang="ja"] a', { hasText: 'Converse' }).click();
  await expect(page).toHaveURL(/conversation\.html/);
  await page.locator('#board-up').click();
  await ready(page);
  await expect.poll(() => look(page)).toEqual(left);

  // The browser's Back.
  await page.locator('.card[data-lang="ja"] a', { hasText: 'Converse' }).click();
  await expect(page).toHaveURL(/conversation\.html/);
  await page.goBack();
  await ready(page);
  await expect.poll(() => look(page)).toEqual(left);

  // A reload.
  await page.reload();
  await ready(page);
  await expect.poll(() => look(page)).toEqual(left);

  // A new session -- a new tab -- starts at the top, the question open, nothing chosen.
  const fresh = await page.context().newPage();
  await fresh.setViewportSize({ width: 390, height: 844 });
  await fresh.goto('/');
  await ready(fresh);
  expect(await look(fresh)).toMatchObject({ y: 0, open: 'true', pressed: [], named: '' });
});

test('on a desktop, the studio’s way back keeps the reeled card in the top row and the page where it was', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await ready(page);
  // Something well below the first row, so the reel has a column to turn.
  const pick = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#gallery .card')];
    return /** @type {HTMLElement} */ (cards[cards.length - 3]).dataset.lang;
  });
  await page.locator(`#want .want-btn[data-lang="${pick}"]`).click();
  await expect(page.locator('#gallery .card.chosen')).toHaveAttribute('data-lang', pick ?? '');
  await page.waitForTimeout(600);
  // Down the page, with the card's own buttons still on screen: a locator click scrolls
  // what it clicks into view first, and the page would leave from somewhere else.
  await page.evaluate(() => {
    const chosen = /** @type {HTMLElement} */ (document.querySelector('#gallery .card.chosen'));
    scrollTo(0, Math.round(chosen.getBoundingClientRect().top + scrollY - 120));
  });
  const left = await look(page);
  expect(left).toMatchObject({ open: 'false', pressed: [pick], ringed: pick });
  expect(left.y).toBeGreaterThan(0);

  await page.locator('#gallery .card.chosen a', { hasText: 'Customise' }).click();
  await expect(page).toHaveURL(/customize\.html/);
  await page.locator('a.back-link').click();
  await ready(page);
  await expect.poll(() => look(page)).toEqual(left);
});

test('a choice whose fold the reader undid comes back open, still chosen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await ready(page);
  await page.locator('#want .want-btn[data-lang="ja"]').click();
  await page.locator('#want-toggle').click();
  await expect(page.locator('#want-toggle')).toHaveAttribute('aria-expanded', 'true');
  const left = await look(page);
  await page.reload();
  await ready(page);
  await expect.poll(() => look(page)).toEqual(left);
  expect(left).toMatchObject({ open: 'true', pressed: ['ja'] });
});
