// Quiz mode in the real studio.
//
// The seed box is what makes these tests possible: the drill's default seed comes off
// the clock, so a spec that did not pin one would be asserting about a different set
// of questions on every run. Every test here types a seed first.

import { test, expect } from '@playwright/test';

const STUDIO = '/customize.html?target=zh-Hans&source=en';

/**
 * Open the quiz on a solved sheet and pin the seed.
 * @param {import('@playwright/test').Page} page
 * @param {string} seed
 */
async function openDrill(page, seed) {
  await expect(page.locator('.face.focused')).toBeVisible();
  await page.locator('#drill-open').click();
  const drill = page.locator('dialog.drill');
  await expect(drill).toBeVisible();
  await drill.locator('#drill-seed').fill(seed);
  return drill;
}

test.describe('quiz mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('the button is not the onboarding banner, and the setup names the pool', async ({ page }) => {
    await page.goto(STUDIO);
    // Two different things in one header, and confusing them is the risk the naming
    // exists to avoid.
    await expect(page.locator('#quiz-open')).toHaveText('Help me decide.');
    await expect(page.locator('#drill-open')).toHaveText('Quiz');

    const drill = await openDrill(page, 'seed-1');
    // It says how much of the card can be asked about before anything is chosen,
    // rather than leaving that to be discovered after pressing Start.
    await expect(drill.locator('.drill-note')).toContainText('can be asked');
    // The columns are named the way the format panel names them, in terms of the
    // pair actually chosen -- so the romanisation column is "Pinyin", not
    // "Romanisation", and the two sides of the pair have their own names.
    const shown = drill.locator('fieldset').first();
    await expect(shown.getByText('Pinyin')).toBeVisible();
    await expect(shown.getByText('Simplified Chinese')).toBeVisible();
    await expect(shown.getByText('English', { exact: true })).toBeVisible();
    // The default is the reader's own language shown and the target's script asked.
    await expect(shown.locator('input[value="gloss"]')).toBeChecked();
    await expect(drill.locator('fieldset').nth(1).locator('input[value="script"]')).toBeChecked();
    // And nothing about the sheet has changed by opening it.
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.drill')).toHaveCount(0);
    await expect(page.locator('.face.focused')).toBeVisible();
  });

  test('a column cannot be both shown and entered', async ({ page }) => {
    await page.goto(STUDIO);
    const drill = await openDrill(page, 'seed-2');
    const shown = drill.locator('fieldset').first();
    const asked = drill.locator('fieldset').nth(1);
    // Ticking the gloss on the answer side takes it off the prompt side, rather than
    // refusing the click -- a column that is both prints the answer beside the
    // question.
    await asked.locator('input[value="gloss"]').check();
    await expect(shown.locator('input[value="gloss"]')).not.toBeChecked();
    await expect(asked.locator('input[value="gloss"]')).toBeChecked();
  });

  test('multiple choice is keyboard-only, from the digits to the verdict', async ({ page }) => {
    await page.goto(STUDIO);
    const drill = await openDrill(page, 'keys');
    await drill.getByRole('button', { name: 'Start' }).click();

    await expect(drill.locator('.drill-head')).toContainText('1 of 10');
    // The seed the questions were built from is on screen, so a run that misbehaves
    // can be asked for again.
    await expect(drill.locator('.drill-head')).toContainText('keys');
    const options = drill.locator('.drill-option');
    await expect(options).toHaveCount(4);
    // Roving tabindex, the same contract the settings groups and the face chooser
    // answer: one tab stop for the group and arrows inside it.
    await expect(options.first()).toHaveAttribute('tabindex', '0');
    await expect(options.nth(1)).toHaveAttribute('tabindex', '-1');

    await options.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect(options.nth(3)).toHaveAttribute('aria-checked', 'true');
    // A numbered list of four invites the digits, so it answers them.
    await page.keyboard.press('3');
    await expect(options.nth(2)).toHaveAttribute('aria-checked', 'true');

    // Enter checks, then Enter again advances -- the same key throughout.
    await page.keyboard.press('Enter');
    await expect(drill.locator('.drill-option.right')).toHaveCount(1);
    // The verdict is words in a live region, not a colour on an option: marking the
    // right answer with a hue and a rule says nothing to a screen reader.
    await expect(drill.locator('.drill-mark[role="status"]')).toHaveCount(1);
    await expect(drill.locator('.drill-mark')).not.toBeEmpty();
    await expect(drill.getByRole('button', { name: 'Next' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(drill.locator('.drill-head')).toContainText('2 of 10');
  });

  test('fill in the blank grades a missing tone mark as its own outcome', async ({ page }) => {
    await page.goto(STUDIO);
    const drill = await openDrill(page, 'blank-1');
    await drill.locator('select#drill-kind').selectOption('blank');
    // Ask for the romanisation, which is where a tone mark can be dropped: 100% of
    // this pack's pinyin carries one.
    const asked = drill.locator('fieldset').nth(1);
    await asked.locator('input[value="roman"]').check();
    await asked.locator('input[value="script"]').uncheck();
    await drill.getByRole('button', { name: 'Start' }).click();

    const box = drill.locator('.drill-answer');
    await expect(box).toHaveCount(1);
    // The answer box carries the language of the cell it is for, so the target's own
    // face draws it.
    await expect(box).toHaveAttribute('lang', 'zh-Hans');
    // Pinyin is Latin whatever the target writes in, so the box runs left to right.
    await expect(box).toHaveAttribute('dir', 'ltr');

    // **Learn the expected answer from a first pass, then repeat the seed.** Which
    // row question one is depends on the seed and on the corpus, and hardcoding a
    // pinyin string here would make this a golden file that every new concept
    // breaks. So: answer nothing, read the answer off the verdict, and ask the same
    // seed for the same question again. That the second pass *is* the same question
    // is the reproducibility the seed exists for.
    await page.keyboard.press('Enter');
    const verdict = await drill.locator('.drill-mark').innerText();
    const want = verdict.replace(/^.*?Answer:\s*/s, '').trim();
    expect(want).not.toBe('');
    const stripped = want.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
    // 100% of this pack's pinyin carries a tone mark, so there is always one to drop.
    expect(stripped).not.toBe(want);
    await page.keyboard.press('Escape');

    const again = await openDrill(page, 'blank-1');
    await again.locator('select#drill-kind').selectOption('blank');
    const asked2 = again.locator('fieldset').nth(1);
    await asked2.locator('input[value="roman"]').check();
    await asked2.locator('input[value="script"]').uncheck();
    await again.getByRole('button', { name: 'Start' }).click();
    await again.locator('.drill-answer').fill(stripped);
    await page.keyboard.press('Enter');
    // Right letters, wrong marks: neither a pass nor a failure.
    await expect(again.locator('.drill-mark.marks')).toHaveCount(1);
    await expect(again.locator('.drill-mark.right')).toHaveCount(0);
    // And it says what was expected, so the reader learns the spelling either way.
    await expect(again.locator('.drill-mark')).toContainText(want);
  });

  test('the same seed asks the same questions', async ({ page }) => {
    await page.goto(STUDIO);
    /** The four options of question one, which is the whole shuffled state in one line. */
    const firstQuestion = async (/** @type {string} */ seed) => {
      const drill = await openDrill(page, seed);
      await drill.getByRole('button', { name: 'Start' }).click();
      await expect(drill.locator('.drill-option')).toHaveCount(4);
      const options = await drill.locator('.drill-option').allInnerTexts();
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.drill')).toHaveCount(0);
      return options;
    };
    const a = await firstQuestion('repeatable');
    const b = await firstQuestion('repeatable');
    const c = await firstQuestion('different');
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test('a card with nothing to ask says so rather than starting', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    // Empty the card, which is the extreme of "the selection is too small". The
    // status line is not the check: with every section off the solver still lays out
    // a pair of empty faces, so what says the card is empty is the item count.
    await page.locator('#all-off').click();
    await expect(page.locator('#counts')).toContainText('0 of');
    const drill = await openDrill(page, 'empty');
    await expect(drill.locator('.drill-note')).toContainText('nothing to ask');
    await expect(drill.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  test('an answer box takes a right-to-left script, and a conscript', async ({ page }) => {
    // Hebrew's pointed column is the one a learner has to be able to read, and the
    // box has to start at the right edge for it.
    await page.goto('/customize.html?target=he&source=en');
    const drill = await openDrill(page, 'rtl');
    await drill.locator('select#drill-kind').selectOption('blank');
    await drill.getByRole('button', { name: 'Start' }).click();
    const box = drill.locator('.drill-answer');
    await expect(box).toHaveAttribute('lang', 'he');
    await expect(box).toHaveAttribute('dir', 'rtl');
    await page.keyboard.press('Escape');

    // Klingon prints in pIqaD, which is Private Use Area and has no system font, so
    // the prompt has to be drawn by the shipped conscript face -- which `--ui` leads
    // with for exactly this reason. Assert it renders as glyphs rather than as
    // zero-width nothing.
    await page.goto('/customize.html?target=tlh&source=en');
    const klingon = await openDrill(page, 'piqad');
    await klingon.getByRole('button', { name: 'Start' }).click();
    const answer = klingon.locator('.drill-option').first();
    await expect(answer).toBeVisible();
    const drawn = await answer.evaluate((node) => {
      const span = node.querySelector('span[lang]');
      return span ? span.getBoundingClientRect().width : 0;
    });
    expect(drawn).toBeGreaterThan(4);
  });

  test('a right-to-left reader gets right-to-left prompts and Latin answer boxes', async ({ page }) => {
    // The other direction from the Hebrew test above: here the *reader* is
    // right-to-left, so the gloss cell mirrors while the pinyin the question asks for
    // does not. `ui/panels.js` had a bug of exactly this shape -- an offset that
    // assumed the reader's own direction -- which is why the source side gets its own
    // assertion rather than being assumed to follow the target's.
    await page.goto('/customize.html?target=zh-Hans&source=ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const drill = await openDrill(page, 'ar');
    await drill.locator('select#drill-kind').selectOption('blank');
    const asked = drill.locator('fieldset').nth(1);
    await asked.locator('input[value="roman"]').check();
    await asked.locator('input[value="script"]').uncheck();
    await drill.getByRole('button', { name: 'ابدأ' }).click();
    // The Arabic gloss the question hands over.
    const prompt = drill.locator('.drill-prompt .drill-value').first();
    await expect(prompt).toHaveAttribute('lang', 'ar');
    await expect(prompt).toHaveAttribute('dir', 'rtl');
    // And the pinyin it asks for, which is Latin whatever the reader reads.
    await expect(drill.locator('.drill-answer')).toHaveAttribute('dir', 'ltr');
  });

  test('the interface language is the reader′s own', async ({ page }) => {
    // Every string here is `t()`-built rather than marked up, so `applyStatic`
    // cannot reach it and the dialog has to be built against the loaded catalogue.
    await page.goto('/customize.html?target=zh-Hans&source=ja');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('#drill-open')).toHaveText('クイズ');
    const drill = await openDrill(page, 'ja');
    await expect(drill.locator('h2')).toHaveText('クイズ');
    await expect(drill.getByRole('button', { name: '開始' })).toBeVisible();
    // The column names come from the format panel, which names them after the pair.
    await expect(drill.locator('fieldset').first().getByText('日本語')).toBeVisible();
  });
});
