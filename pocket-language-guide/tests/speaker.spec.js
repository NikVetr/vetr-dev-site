// The speaker profile, end to end, on the page someone prints from.
//
// `tests/speaker.test.mjs` proves the resolution rules and `validate_data.py` proves
// the data is reachable. Neither can prove the thing that actually matters: that
// answering the question beside the card changes the sentence on it. So this asks a
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

  // **Asked in the controls, not behind a button.** It was a Settings chip opening a
  // dialog that carried a second light switch; the question is the controls' own now.
  const controls = page.locator('#controls');
  await expect(page.locator('dialog.speaker-settings')).toHaveCount(0);
  // Only the question Russian actually asks. A settings screen that asks everyone
  // everything is the thing this replaces.
  await expect(controls.locator('.speaker-axis')).toHaveCount(1);
  await expect(controls.getByRole('radiogroup', { name: 'Speaking as' })).toBeVisible();
  // Nothing is preselected on a form nobody has filled in -- a default the reader
  // never chose must not be displayed back to them as their choice.
  await expect(controls.locator('.speaker-axis input[type=radio]:checked')).toHaveCount(0);

  await controls.getByRole('radio', { name: 'A woman' }).check();

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

test('a pair that asks nothing asks nothing, and still offers the saved copy', async ({ page }) => {
  // Thirty-one of the fifty-three languages declare no axis, and for those pairs
  // there is no voice question to put, so the controls carry no heading over nothing.
  // **The saved copy is in the page's settings**, behind the bars, with the reader's
  // other details: a Save-a-copy button that only appeared for Russian readers would
  // be a backup nobody can find.
  await page.goto('/sheet.html?target=zh-Hans&source=en');
  await expect(page.locator('.face').first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#controls .speaker-axis')).toHaveCount(0);
  await expect(page.locator('#controls').getByText('How you speak')).toHaveCount(0);
  await page.locator('#site-menu').click();
  const dialog = page.locator('dialog.site-settings');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.speaker-axis')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save a copy' })).toBeVisible();
  await expect(dialog.getByText('Your name')).toBeVisible();
});
