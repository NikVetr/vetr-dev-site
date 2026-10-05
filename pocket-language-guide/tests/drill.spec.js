// The quiz, on its own page (`drill.html`).
//
// The seed box is what makes these tests possible: the drill's default seed comes off
// the clock, so a spec that did not pin one would be asserting about a different set
// of questions on every run. Every test here types a seed first.

import { test, expect } from '@playwright/test';

const STUDIO = '/customize.html?target=zh-Hans&source=en';
const QUIZ = '/drill.html?target=zh-Hans&source=en';

/**
 * Open the quiz page for a pair and pin the seed.
 * @param {import('@playwright/test').Page} page
 * @param {string} seed
 * @param {string} [path]
 */
async function openDrill(page, seed, path = QUIZ) {
  await page.goto(path);
  const drill = page.locator('#drill');
  await expect(drill.locator('.drill-setup')).toBeVisible();
  await drill.locator('#drill-seed').fill(seed);
  return drill;
}

/** The setup's own count of what can be asked, as a number. @param {import('@playwright/test').Locator} drill */
async function poolSize(drill) {
  const note = await drill.locator('.drill-note').innerText();
  return Number(/(\d+)/.exec(note)?.[1] ?? 0);
}

test.describe('quiz mode', () => {
  test.beforeEach(async ({ page }) => {
    // Once per test rather than once per page: a test that reloads is asking whether
    // something was kept.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('cleared')) return;
      localStorage.clear();
      sessionStorage.setItem('cleared', '1');
    });
  });

  test('Card leads to the quiz for its pair, which is not the onboarding banner', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    // Two different things in one header, and confusing them is the risk the naming
    // exists to avoid.
    await expect(page.locator('#quiz-open')).toHaveText('Help me decide.');
    await expect(page.locator('#drill-open')).toHaveText('Quiz');
    await page.locator('#drill-open').click();
    await expect(page).toHaveURL(/drill\.html\?target=zh-Hans&source=en$/);
    await expect(page.locator('#drill .drill-setup')).toBeVisible();
  });

  test('the quiz page sets no type, so it never downloads the font engine', async ({ page }) => {
    const fetched = [];
    page.on('request', (request) => fetched.push(request.url()));
    await openDrill(page, 'seed-1');
    await page.waitForLoadState('networkidle');
    expect(fetched.filter((url) => url.includes('fontkit'))).toEqual([]);
  });

  test('the setup names the pool and the pair\'s columns', async ({ page }) => {
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
  });

  test('a column cannot be both shown and entered', async ({ page }) => {
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

  test('a missed choice says what each wrong option does answer', async ({ page }) => {
    // Jeopardy's way round: every wrong option is some other card's right answer, and
    // after a miss it says which -- so a miss teaches four words rather than one.
    const drill = await openDrill(page, 'keys');
    await drill.getByRole('button', { name: 'Start' }).click();
    const options = drill.locator('.drill-option');
    await expect(options).toHaveCount(4);
    await expect(drill.locator('.drill-answers')).toHaveCount(0);
    await drill.getByRole('button', { name: 'See answer' }).click();
    await expect(drill.locator('.drill-option.right')).toHaveCount(1);
    await expect(drill.locator('.drill-option.right .drill-answers')).toHaveCount(0);
    await expect(drill.locator('.drill-option:not(.right) .drill-answers')).toHaveCount(3);
    for (const text of await drill.locator('.drill-answers').allInnerTexts()) expect(text.trim()).not.toBe('');
  });

  test('multiple choice is keyboard-only, from the digits to the verdict', async ({ page }) => {
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
    // **Drop the bidi isolates the verdict wraps its insert in.** `t()` puts FSI and
    // PDI around any placeholder carrying letters, so the sentence keeps its own
    // direction when the answer runs the other way. They are invisible, they are
    // part of the rendered text, and a reader typing this answer would never produce
    // them -- so scraping them out of the page and typing them back in is the test
    // inventing a failure the product does not have.
    const want = verdict.replace(/^.*?Answer:\s*/s, '').replace(/[\u2068\u2069]/g, '').trim();
    expect(want).not.toBe('');
    const stripped = want.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
    // 100% of this pack's pinyin carries a tone mark, so there is always one to drop.
    expect(stripped).not.toBe(want);

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

  test('not knowing is an answer: See answer fills it in and counts the miss', async ({ page }) => {
    // A learner stuck on a row could only guess or close the quiz, and either way
    // left without the one thing they came for. Revealing shows the answer where they
    // would have typed it, says only what it is -- a reveal is not "not quite" -- and
    // counts the question as missed, which is what it was.
    const drill = await openDrill(page, 'reveal-1');
    await drill.locator('select#drill-kind').selectOption('blank');
    const asked = drill.locator('fieldset').nth(1);
    await asked.locator('input[value="roman"]').check();
    await asked.locator('input[value="script"]').uncheck();
    await drill.getByRole('button', { name: 'Start' }).click();

    const box = drill.locator('.drill-answer');
    await expect(box).toHaveValue('');
    const reveal = drill.getByRole('button', { name: 'See answer' });
    await reveal.click();
    await expect(box).not.toHaveValue('');
    await expect(box).toHaveJSProperty('readOnly', true);
    const mark = await drill.locator('.drill-mark').innerText();
    expect(mark).toMatch(/^Answer:/);
    expect(mark).not.toMatch(/Not quite/);
    // Used once per question: it goes, and Check has become Next.
    await expect(reveal).toBeHidden();
    await expect(drill.getByRole('button', { name: /^(Next|Finish)$/ })).toBeVisible();
  });

  test('Speak reads the target text, and not before the reader has answered for it', async ({ page }) => {
    // Hearing it is part of learning it. The engine is the board's own, stubbed here
    // because this machine has no voices; what is asserted is *what* is read and
    // *when* it may be. Shown as a prompt, the target text can be heard at once;
    // asked for, it is held back until the question is graded, or the button would
    // read the answer out to someone still typing it.
    await page.addInitScript(() => {
      const voice = { name: 'Test', lang: 'zh-CN', localService: true, default: true, voiceURI: 'test' };
      Object.defineProperty(speechSynthesis, 'getVoices', { value: () => [voice] });
      /** @type {{text:string, lang:string}[]} */ (globalThis).__spoken = [];
      class FakeUtterance { constructor(/** @type {string} */ text) { this.text = text; } }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
      Object.defineProperty(speechSynthesis, 'speak', {
        configurable: true,
        value: (/** @type {any} */ u) => {
          globalThis.__spoken.push({ text: u.text, lang: u.lang });
          setTimeout(() => u.onend && u.onend(), 5);
        },
      });
    });
    // Target text shown, gloss asked: Speak is live from the start.
    const drill = await openDrill(page, 'speak-1');
    await drill.locator('select#drill-kind').selectOption('choice');
    const shown = drill.locator('fieldset').nth(0);
    const asked = drill.locator('fieldset').nth(1);
    await shown.locator('input[value="script"]').check();
    await asked.locator('input[value="gloss"]').check();
    await asked.locator('input[value="script"]').uncheck().catch(() => {});
    await drill.getByRole('button', { name: 'Start' }).click();
    const speak = drill.getByRole('button', { name: 'Speak' });
    await expect(speak).toBeEnabled();
    await speak.click();
    await expect.poll(() => page.evaluate(() => globalThis.__spoken.length)).toBe(1);
    const said = await page.evaluate(() => globalThis.__spoken[0]);
    expect(said.text).toMatch(/\p{Script=Han}/u);
    expect(said.lang).toBe('zh-CN');

    // Target text asked: Speak waits for the grade.
    const again = await openDrill(page, 'speak-2');
    await again.locator('select#drill-kind').selectOption('blank');
    const asked2 = again.locator('fieldset').nth(1);
    await asked2.locator('input[value="script"]').check();
    await asked2.locator('input[value="roman"]').uncheck().catch(() => {});
    await again.getByRole('button', { name: 'Start' }).click();
    const speak2 = again.getByRole('button', { name: 'Speak' });
    await expect(speak2).toBeDisabled();
    await page.keyboard.press('Enter');
    await expect(speak2).toBeEnabled();
  });

  test('the same seed asks the same questions', async ({ page }) => {
    /** The four options of question one, which is the whole shuffled state in one line. */
    const firstQuestion = async (/** @type {string} */ seed) => {
      const drill = await openDrill(page, seed);
      await drill.getByRole('button', { name: 'Start' }).click();
      await expect(drill.locator('.drill-option')).toHaveCount(4);
      return drill.locator('.drill-option').allInnerTexts();
    };
    const a = await firstQuestion('repeatable');
    const b = await firstQuestion('repeatable');
    const c = await firstQuestion('different');
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test('a choice with nothing to ask says so rather than starting', async ({ page }) => {
    // Every section off, which is the extreme of "the selection is too small".
    const drill = await openDrill(page, 'empty');
    await drill.getByRole('button', { name: 'All off' }).click();
    await expect(drill.locator('.drill-pick-count')).toHaveText('0 rows from 0 sections');
    await expect(drill.locator('.drill-note')).toContainText('nothing to ask');
    await expect(drill.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  test('an answer box takes a right-to-left script, and a conscript', async ({ page }) => {
    // Hebrew's pointed column is the one a learner has to be able to read, and the
    // box has to start at the right edge for it.
    const drill = await openDrill(page, 'rtl', '/drill.html?target=he&source=en');
    await drill.locator('select#drill-kind').selectOption('blank');
    await drill.getByRole('button', { name: 'Start' }).click();
    const box = drill.locator('.drill-answer');
    await expect(box).toHaveAttribute('lang', 'he');
    await expect(box).toHaveAttribute('dir', 'rtl');

    // Klingon prints in pIqaD, which is Private Use Area and has no system font, so
    // the prompt has to be drawn by the shipped conscript face -- which `--ui` leads
    // with for exactly this reason. Assert it renders as glyphs rather than as
    // zero-width nothing.
    const klingon = await openDrill(page, 'piqad', '/drill.html?target=tlh&source=en');
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
    const drill = await openDrill(page, 'ar', '/drill.html?target=zh-Hans&source=ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
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
    // Every string in the setup is `t()`-built rather than marked up, so `applyStatic`
    // cannot reach it and the setup has to be built against the loaded catalogue.
    await page.goto('/customize.html?target=zh-Hans&source=ja');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('#drill-open')).toHaveText('クイズ');
    const drill = await openDrill(page, 'ja', '/drill.html?target=zh-Hans&source=ja');
    await expect(page.locator('h1')).toHaveText('クイズ');
    await expect(drill.getByRole('button', { name: '開始' })).toBeVisible();
    // The column names come from the format panel, which names them after the pair.
    await expect(drill.locator('fieldset').first().getByText('日本語')).toBeVisible();
  });
  test('what to practise narrows the pool, by section and by row, and is kept', async ({ page }) => {
    const drill = await openDrill(page, 'pick');
    const pick = drill.locator('.drill-pick');
    const all = await poolSize(drill);
    expect(all).toBeGreaterThan(100);
    const greetings = pick.locator('.tree > li', { hasText: 'Social + basics' });
    const [, rows] = /(\d+)\/(\d+)/.exec(await greetings.locator('.count').innerText()) ?? [];
    await greetings.locator('summary input[type=checkbox]').uncheck();
    await expect.poll(() => poolSize(drill)).toBe(all - Number(rows));
    // A row of a section that is off is unavailable rather than merely off.
    await expect(greetings.locator('.items input').first()).toBeDisabled();
    // One row of a section that is on.
    const toilets = pick.locator('.tree > li', { hasText: 'Toilets' });
    await toilets.locator('summary').click();
    await toilets.locator('.items input').first().uncheck();
    await expect.poll(() => poolSize(drill)).toBe(all - Number(rows) - 1);
    // And it is the quiz's own choice of this pair, there again next time.
    await page.reload();
    await expect(drill.locator('.drill-setup')).toBeVisible();
    await expect.poll(() => poolSize(drill)).toBe(all - Number(rows) - 1);
    await expect(greetings.locator('summary input[type=checkbox]')).not.toBeChecked();
  });

  test('until the reader chooses, it asks about the card\'s rows, and can go back to them', async ({ page }) => {
    // A card of one section, saved the way the studio saves it.
    await page.addInitScript(() => {
      if (localStorage.getItem('plg.studio.zh-Hans__en')) return;
      const sections = { 'social-basics': true, toilets: false, 'emergency-medical': false };
      localStorage.setItem('plg.studio.zh-Hans__en', JSON.stringify({
        spec: { selection: { sections, items: {} }, priority: 0.9 },
        finish: { mode: '', flip: 'short-edge' }, dpi: 600,
      }));
    });
    const drill = await openDrill(page, 'card');
    const asOnCard = await poolSize(drill);
    await drill.getByRole('button', { name: 'All on' }).click();
    const everything = await poolSize(drill);
    expect(everything).toBeGreaterThan(asOnCard);
    await drill.getByRole('button', { name: 'Same as my card' }).click();
    await expect.poll(() => poolSize(drill)).toBe(asOnCard);
    // The card's priority floor is part of what it carries: the greetings under 0.9
    // are not on it, so they are not asked about either.
    const greetings = drill.locator('.drill-pick .tree > li', { hasText: 'Social + basics' });
    const [, on, of] = /(\d+)\/(\d+)/.exec(await greetings.locator('.count').innerText()) ?? [];
    expect(Number(on)).toBeGreaterThan(0);
    expect(Number(on)).toBeLessThan(Number(of));
  });

  test('the record keeps how each row went, names what to practise, and resets on asking', async ({ page }) => {
    const drill = await openDrill(page, 'record');
    const record = page.locator('#drill-record');
    await expect(record).toContainText('Nothing answered');
    await drill.locator('select#drill-length').selectOption('10');
    await drill.getByRole('button', { name: 'Start' }).click();
    // A question has the page to itself.
    await expect(record).toBeHidden();
    for (let i = 0; i < 2; i += 1) {
      await drill.getByRole('button', { name: 'See answer' }).click();
      await drill.getByRole('button', { name: 'Next' }).click();
    }
    await drill.getByRole('button', { name: 'Stop' }).click();
    await expect(drill.locator('.drill-summary')).toContainText('Out of 2');
    await expect(record).toBeVisible();
    const missed = record.locator('tr', { hasText: 'Missed' }).locator('td');
    await expect(missed).toHaveText(['2', '2', '2', '2']);
    await expect(record.locator('.drill-practise li')).toHaveCount(2);
    // Kept on the device, so it is there after a reload too.
    await page.reload();
    await expect(record.locator('.drill-practise li')).toHaveCount(2);
    await record.getByRole('button', { name: 'Reset the record' }).click();
    await page.locator('dialog.confirm-ask').getByRole('button', { name: 'Reset' }).click();
    await expect(record).toContainText('Nothing answered');
  });
});

test.describe('hands-free', () => {
  /**
   * A voice for both languages, which says each utterance in a few milliseconds and
   * keeps what it said -- or, while `__hold` is set, holds it until `__release()`, so a
   * graded question can be looked at before hands-free moves on; and a recogniser that
   * hears, in turn, whatever the test has put in `__heard` -- `null` is silence.
   * Neither touches a microphone or a speaker.
   * @param {import('@playwright/test').Page} page @param {{listen?: boolean}} [options]
   */
  const fakeSpeech = (page, { listen = true } = {}) => page.addInitScript((canListen) => {
    const voices = [
      { name: 'Zh', lang: 'zh-CN', localService: true, default: false, voiceURI: 'zh' },
      { name: 'En', lang: 'en-US', localService: true, default: true, voiceURI: 'en' },
    ];
    Object.defineProperty(speechSynthesis, 'getVoices', { value: () => voices });
    const g = /** @type {any} */ (globalThis);
    g.__spoken = [];
    g.__heard = [];
    g.__listened = [];
    g.__hold = false;
    /** @type {any[]} */ const held = [];
    g.__release = () => { g.__hold = false; for (const u of held.splice(0)) u.onend?.(); };
    class FakeUtterance { constructor(/** @type {string} */ text) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    Object.defineProperty(speechSynthesis, 'speak', {
      configurable: true,
      value: (/** @type {any} */ u) => {
        g.__spoken.push({ text: u.text, lang: u.lang });
        if (g.__hold) held.push(u);
        else setTimeout(() => u.onend && u.onend(), 5);
      },
    });
    Object.defineProperty(speechSynthesis, 'cancel', { configurable: true, value: () => {} });
    if (!canListen) {
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
      return;
    }
    class FakeRecognition {
      start() {
        g.__listened.push(this.lang);
        // Heard once the test has said something: it waits, as a recogniser does.
        const poll = setInterval(() => {
          if (!g.__heard.length) return;
          clearInterval(poll);
          const next = g.__heard.shift();
          if (next === null) this.onerror?.({ error: 'no-speech' });
          else this.onresult?.({ results: [[{ transcript: next }]] });
          this.onend?.();
        }, 20);
        this.stop = () => clearInterval(poll);
      }
      abort() { this.stop?.(); this.onerror?.({ error: 'aborted' }); this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition, configurable: true });
  }, listen);

  /**
   * Say something to the recogniser; `hold` keeps hands-free on what it heard until released.
   * @param {import('@playwright/test').Page} page @param {string|null} said @param {boolean} [hold]
   */
  const say = (page, said, hold = false) => page.evaluate(([text, stay]) => {
    const g = /** @type {any} */ (globalThis);
    g.__hold = stay;
    g.__heard.push(text);
  }, /** @type {[string|null, boolean]} */ ([said, hold]));
  /** @param {import('@playwright/test').Page} page */
  const release = (page) => page.evaluate(() => /** @type {any} */ (globalThis).__release());

  test('it reads the question and the numbered options, and an option is chosen by saying its number', async ({ page }) => {
    await fakeSpeech(page);
    const drill = await openDrill(page, 'voice-choice');
    await drill.locator('input[name="drill-voice"][value="on"]').check();
    await expect(drill.locator('.drill-voice-note')).toContainText('skip');
    await drill.getByRole('button', { name: 'Start' }).click();
    await expect(drill.locator('.drill-voice-state')).toHaveText('Listening');
    await expect(drill.locator('.drill-voice-state')).toHaveAttribute('data-state', 'listening');
    // The prompt in the reader's voice, then each number in it and each option in the target's.
    const spoken = await page.evaluate(() => /** @type {any} */ (globalThis).__spoken);
    const prompt = await drill.locator('.drill-prompt .drill-value').innerText();
    expect(spoken[0]).toEqual({ text: prompt, lang: 'en-US' });
    expect(spoken.slice(1, 9).map((/** @type {any} */ u) => u.lang)).toEqual(
      ['en-US', 'zh-CN', 'en-US', 'zh-CN', 'en-US', 'zh-CN', 'en-US', 'zh-CN']);
    expect(spoken[1].text).toBe('1');
    // A number is listened for in the reader's own language.
    expect(await page.evaluate(() => /** @type {any} */ (globalThis).__listened)).toEqual(['en']);
    await say(page, 'two', true);
    await expect(drill.locator('.drill-option').nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(drill.locator('.drill-mark')).not.toBeEmpty();
    // Then it says how that went, in the reader's voice, and moves on by itself.
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (globalThis).__spoken.at(-1).text))
      .toMatch(/^(Right\.|Not quite\.)$/);
    await release(page);
    await expect(drill.locator('.drill-head')).toContainText('2 of 10');
    await say(page, 'skip');
    await expect(drill.locator('.drill-head')).toContainText('3 of 10');
    await say(page, 'stop');
    await expect(drill.locator('.drill-summary')).toContainText('Out of 2');
  });

  test('a spoken answer is heard in the target language and graded, and silence is asked about', async ({ page }) => {
    await fakeSpeech(page);
    // Learn the answer from a first pass, as the typed tests do, then say it.
    const setUp = async () => {
      const drill = await openDrill(page, 'voice-blank');
      await drill.locator('select#drill-kind').selectOption('blank');
      await drill.locator('input[name="drill-voice"][value="on"]').check();
      await drill.getByRole('button', { name: 'Start' }).click();
      await expect(drill.locator('.drill-voice-state')).toHaveText('Listening');
      return drill;
    };
    let drill = await setUp();
    expect((await page.evaluate(() => /** @type {any} */ (globalThis).__listened))[0]).toBe('zh-CN');
    // Silence twice: it listens once more, then asks to be told to listen again.
    await say(page, null);
    await say(page, null);
    const again = drill.getByRole('button', { name: 'Listen again' });
    await expect(again).toBeVisible();
    await expect(drill.locator('.drill-voice-state')).toHaveText('Nothing heard.');
    await again.click();
    await say(page, '不对', true);
    await expect(drill.locator('.drill-mark.wrong')).toHaveCount(1);
    const verdict = await drill.locator('.drill-mark').innerText();
    const want = verdict.replace(/^.*?Answer:\s*/s, '').replace(/[⁨⁩]/g, '').trim();

    await release(page);
    drill = await setUp();
    await say(page, `${want}。`, true);
    await expect(drill.locator('.drill-mark.right')).toHaveCount(1);
    await expect(drill.locator('.drill-answer')).toHaveValue(`${want}。`);
    await release(page);
    await expect(drill.locator('.drill-head')).toContainText('2 of 10');
  });

  test('where the browser cannot listen, it says so and the switch stays off', async ({ page }) => {
    await fakeSpeech(page, { listen: false });
    const drill = await openDrill(page, 'voice-none');
    await expect(drill.locator('.drill-voice-note')).toHaveText(/cannot listen/);
    await expect(drill.locator('input[name="drill-voice"][value="on"]')).toBeDisabled();
  });
});
