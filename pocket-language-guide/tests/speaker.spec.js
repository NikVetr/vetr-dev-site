// The speaker profile, end to end, on the page someone prints from.
//
// `tests/speaker.test.mjs` proves the resolution rules and `validate_data.py` proves
// the data is reachable. Neither can prove the thing that actually matters: that
// answering a question in a dialog changes the sentence on the card. So this asks a
// browser to solve a real Russian sheet twice.

import { test, expect } from '@playwright/test';

/**
 * Every string the typeset faces contain, as one haystack.
 *
 * Joined with nothing: the renderer emits one `<text>` per word, because that is how
 * a solved line is positioned, so a sentence never appears whole in any one node and
 * a separator would break the only words worth looking for.
 */
const drawn = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(
  () => [...document.querySelectorAll('.face svg text')].map((t) => t.textContent).join(''),
);

test('answering once changes the wording on the card', async ({ page }) => {
  await page.goto('/sheet.html?target=ru&source=en');
  await expect(page.locator('.face').first()).toBeVisible({ timeout: 120_000 });

  // **No silent default.** Russian inflects and nothing has been said, so the page
  // says which wording it is showing rather than letting the masculine pass.
  const notice = page.locator('.speaker-why').first();
  await expect(notice).toHaveText(/not set/);
  expect(await drawn(page)).toContain('\u0437\u0430\u0431\u043b\u0443\u0434\u0438\u043b\u0441\u044f');

  await page.getByRole('button', { name: 'How you speak' }).click();
  const dialog = page.locator('dialog.speaker-settings');
  await expect(dialog).toBeVisible();
  // Only the question Russian actually asks. A settings screen that asks everyone
  // everything is the thing this replaces.
  await expect(dialog.locator('.speaker-axis')).toHaveCount(1);
  await expect(dialog.getByText('Speaking as')).toBeVisible();
  // Nothing is preselected on a form nobody has filled in -- a default the reader
  // never chose must not be displayed back to them as their choice.
  await expect(dialog.locator('input[type=radio]:checked')).toHaveCount(0);

  await dialog.getByRole('radio', { name: 'A woman' }).check();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The card is re-solved in her voice, and the notice goes away because she has
  // been asked and has answered.
  await expect.poll(() => drawn(page), { timeout: 120_000 })
    .toContain('\u0437\u0430\u0431\u043b\u0443\u0434\u0438\u043b\u0430\u0441\u044c');
  expect(await drawn(page)).not.toContain('\u0437\u0430\u0431\u043b\u0443\u0434\u0438\u043b\u0441\u044f');
  await expect(notice).toHaveText('');

  // And it is remembered, which is the whole point of asking in advance.
  await page.reload();
  await expect(page.locator('.face').first()).toBeVisible({ timeout: 120_000 });
  expect(await drawn(page)).toContain('\u0437\u0430\u0431\u043b\u0443\u0434\u0438\u043b\u0430\u0441\u044c');
});

test('a pair that asks nothing shows no control', async ({ page }) => {
  // Thirty-one of the fifty-three languages declare no axis. For those pairs the
  // field does not exist, rather than opening onto an empty form.
  await page.goto('/sheet.html?target=zh-Hans&source=en');
  await expect(page.locator('.face').first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: 'How you speak' })).toHaveCount(0);
});
