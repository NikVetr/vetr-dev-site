// The conversation board in a browser.
//
// `tests/conversation.test.mjs` already pins every row of the navigation table
// against the reducer, so this file has a narrower job: prove the DOM dispatches
// those actions, that a tap lands where a tap should, and that the page does not
// drag the typesetting engine along to show a sentence.

import { test, expect } from '@playwright/test';

const BOARD = '/conversation.html?target=zh-Hans&source=en&board=spa';

/** @param {import('@playwright/test').Page} page */
async function board(page) {
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
}

test('one tap shows the whole message, and one tap puts it away', async ({ page }) => {
  await board(page);
  // B01: no confirmation, no intermediate page.
  await page.locator('[data-button="hurts"]').click();
  const surface = page.locator('.board-message');
  await expect(surface).toBeVisible();

  // The listener's language is the big text, and it is the listener's own script --
  // not a romanisation, not the owner's wording.
  const big = page.locator('.board-message-text');
  await expect(big).toHaveAttribute('lang', 'zh-Hans');
  expect(await big.textContent()).toMatch(/\p{Script=Han}/u);
  // The owner's own wording is present but secondary, as a confirmation that the
  // right button was pressed.
  await expect(page.locator('.board-message-gloss')).toHaveAttribute('lang', 'en');

  // B05: no visible Back control and no instruction paragraph on the message.
  await expect(page.locator('.board-stage .board-up')).toHaveCount(0);
  const stageText = await page.locator('.board-stage').innerText();
  expect(stageText.toLowerCase()).not.toMatch(/tap (anywhere|here|to)/);

  // B02: the surface itself, text included, is the way back.
  await big.click();
  await expect(surface).toHaveCount(0);
  await expect(page.locator('.board-cell').first()).toBeVisible();
});

test('the opening tap cannot also dismiss the message', async ({ page }) => {
  // B03, and the reason the reducer ignores a second `open`: the click that opened
  // the message must not reach a listener that closes it. Ten in a row, because the
  // failure is a race and one pass proves little.
  await board(page);
  for (let i = 0; i < 10; i += 1) {
    await page.locator('[data-button="pause"]').click();
    await expect(page.locator('.board-message')).toBeVisible();
    await page.locator('.board-message').click();
    await expect(page.locator('.board-message')).toHaveCount(0);
  }
});

test('a message opened from a submenu returns to that submenu', async ({ page }) => {
  // The one hard navigation requirement. Returning to the board's root instead
  // would make a submenu unusable for more than one message.
  await board(page);
  await page.locator('[data-button="focus"]').click();
  await expect(page.locator('[data-button="shoulders"]')).toBeVisible();
  await page.locator('[data-button="shoulders"]').click();
  await page.locator('.board-message').click();
  // Back on the child grid, not the root: the body areas are still on screen.
  await expect(page.locator('[data-button="shoulders"]')).toBeVisible();
  await expect(page.locator('[data-button="hurts"]')).toHaveCount(0);
  // And the parent control is offered here, where a Back *is* wanted.
  await expect(page.locator('#board-up')).toBeVisible();
  await page.locator('#board-up').click();
  await expect(page.locator('[data-button="hurts"]')).toBeVisible();
  await expect(page.locator('#board-up')).toBeHidden();
});

test('the buttons stay where they were put', async ({ page }) => {
  // B06. Nothing reorders by use, and coming back from a message must not shuffle
  // the grid under someone who has learned where a button is.
  await board(page);
  const order = () => page.locator('.board-cell').evaluateAll(
    (ns) => ns.map((n) => n.getAttribute('data-button')),
  );
  const before = await order();
  for (const id of ['hurts', 'stop', 'hurts', 'hurts', 'pause']) {
    await page.locator(`[data-button="${id}"]`).click();
    await page.locator('.board-message').click();
  }
  expect(await order()).toEqual(before);
});

test('keyboard and focus work without any visible instruction', async ({ page }) => {
  // B14. Escape is an alternative route out, not a control added to the message,
  // and dismissing returns focus to the cell that opened it -- on a grid of
  // near-identical cells, landing at the top means counting from the start again.
  await board(page);
  await page.locator('[data-button="gentler"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.board-message')).toBeVisible();
  // The surface's accessible name carries the return action for a screen reader.
  await expect(page.locator('.board-message')).toHaveAttribute('aria-label', /close/i);
  await page.keyboard.press('Escape');
  await expect(page.locator('.board-message')).toHaveCount(0);
  await expect(page.locator('[data-button="gentler"]')).toBeFocused();
});

test('showing a phrase does not load the solver, fontkit or pdf-lib', async ({ page }) => {
  // B17 and C2's closing requirement, asked of the network rather than of the
  // import graph: a board is a view over language content, not a small sheet.
  /** @type {string[]} */ const fetched = [];
  page.on('request', (r) => { if (/\.(js|mjs)$/.test(r.url())) fetched.push(r.url()); });
  await board(page);
  await page.locator('[data-button="hurts"]').click();
  await expect(page.locator('.board-message')).toBeVisible();
  const names = fetched.map((u) => u.replace(/.*:\d+\//, ''));
  // The walk has to have walked: an empty list would pass every assertion below.
  expect(names).toContain('ui/conversation.js');
  expect(names.filter((n) => /fontkit|pdf-lib|core\/solve|render\//.test(n))).toEqual([]);
});

test('show-only offers no reply, and the reader is told what is missing', async ({ page }) => {
  // B08. The default session shows only; a Reply control appears with `replies=1`
  // and only on a message that has answers, which this board has none of yet.
  await board(page);
  await page.locator('[data-button="hurts"]').click();
  await expect(page.locator('.board-controls')).toHaveCount(0);
  // B16: nothing on this board is unavailable for en/zh-Hans, so no warning.
  await expect(page.locator('#board-status')).toBeEmpty();
});

test('a board refuses a pair it was not written for', async ({ page }) => {
  // A board needs text on *both* sides, so one written in Mandarin and English is a
  // board for an English reader. Opening it as Quenya is a clear refusal naming the
  // pairs it does serve -- better than letting every button resolve to nothing and
  // reporting ten unavailable phrases, which is true and tells the reader nothing.
  await page.goto('/conversation.html?target=qya&source=en&board=spa');
  const shown = page.locator('body');
  await expect(shown).toContainText(/written for these language pairs only/i);
  await expect(shown).toContainText('zh-Hans__en');
  await expect(page.locator('.board-cell')).toHaveCount(0);
});

test('an unavailable button is drawn in place, not removed', async ({ page }) => {
  // B16's other half, and a unit test of a DOM function rather than of the page:
  // when the corpus cannot supply one phrase the cell must stay where it is and go
  // dim. A grid that closes a gap is a grid whose buttons have moved, and someone
  // who has learned that "stop" is bottom-left must still find it bottom-left.
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=spa');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  const drawn = await page.evaluate(async () => {
    const { renderGrid } = await import('/ui/conversation-view.js');
    const root = document.createElement('div');
    document.body.append(root);
    renderGrid(root, {
      buttons: [
        { id: 'a', kind: 'message' },
        { id: 'gone', kind: 'message' },
        { id: 'c', kind: 'message' },
      ],
    }, {
      lang: 'en',
      label: (b) => b.id,
      available: (b) => b.id !== 'gone',
      onPick: () => {},
    });
    return [...root.querySelectorAll('button')].map((n) => ({
      id: n.dataset.button, off: n.disabled,
    }));
  });
  // All three, in the author's order, with the middle one disabled in place.
  expect(drawn).toEqual([
    { id: 'a', off: false },
    { id: 'gone', off: true },
    { id: 'c', off: false },
  ]);
});

// --- replies (C3) -----------------------------------------------------------

/** The same board with the two-way interaction switched on. */
const REPLIES = `${BOARD}&replies=1`;

test('a reply is offered only where there are answers, and only when asked for', async ({ page }) => {
  await page.goto(REPLIES);
  await expect(page.locator('.board-cell').first()).toBeVisible();

  // B08's other half. `avoid` carries a reply set; `stop` does not, and a board must
  // not put a Reply control on every statement.
  await page.locator('[data-button="stop"]').click();
  await expect(page.locator('.board-controls')).toHaveCount(0);
  await page.locator('.board-message').click();

  await page.locator('[data-button="avoid"]').click();
  await expect(page.locator('.board-controls button')).toHaveCount(1);
  // The listener reads this one too, so it is in their language and not the owner's.
  await expect(page.locator('.board-controls button')).toHaveText(/\p{Script=Han}/u);
  // ...and it is still just a message until someone presses it. No forced reply
  // screen after a statement.
  await expect(page.locator('.board-answers')).toHaveCount(0);
});

test('the answers are the listener\'s, and the chosen one comes back as the owner\'s', async ({ page }) => {
  // B09. The question stays on screen while the answers are offered, because
  // somebody choosing between six answers should not have to remember what was
  // asked.
  await page.goto(REPLIES);
  await page.locator('[data-button="avoid"]').click();
  const asked = await page.locator('.board-message-text').textContent();
  await page.locator('.board-controls button').click();

  await expect(page.locator('.board-answers')).toBeVisible();
  await expect(page.locator('.board-answer')).toHaveCount(6);
  await expect(page.locator('.board-asked')).toHaveText(asked ?? '');
  // Every answer is in the listener's language and carries their direction.
  await expect(page.locator('.board-answers')).toHaveAttribute('lang', 'zh-Hans');
  for (const text of await page.locator('.board-answer').allTextContents()) {
    expect(text, 'an answer the listener cannot read').toMatch(/\p{Script=Han}/u);
  }

  // Choosing one shows it to the owner, in the owner's language, large.
  await page.locator('.board-answer').first().click();
  const back = page.locator('.board-message-text');
  await expect(back).toHaveAttribute('lang', 'en');
  await expect(back).toContainText(/avoid/i);
  // The presentation reverses; the meaning and whose sentence it is do not.
  await expect(page.locator('.board-message-gloss')).toHaveAttribute('lang', 'zh-Hans');
  // An incoming answer is tinted, so the owner can see at a glance that this is the
  // reply and not something they said.
  await expect(page.locator('.board-stage')).toHaveClass(/board-stage-incoming/);
});

test('an uncertain answer and a rejection are both reachable, and say what they say', async ({ page }) => {
  // B10. "None of these" must show *that* meaning rather than inventing a
  // substantive answer, and it must not launch anything.
  await page.goto(REPLIES);
  await page.locator('[data-button="avoid"]').click();
  await page.locator('.board-controls button').click();
  const answers = await page.locator('.board-answer').allTextContents();
  // One answer admits uncertainty and one rejects the set. Both are requirements of
  // the specification, not decoration.
  expect(answers.some((a) => a.includes('不确定')), `no uncertain answer in ${answers}`).toBe(true);

  await page.locator('.board-answer').last().click();
  await expect(page.locator('.board-message-text')).toContainText(/none of these/i);
  // ...and it is an answer like any other: one tap returns to the owner's grid.
  await page.locator('.board-message').click();
  await expect(page.locator('[data-button="avoid"]')).toBeVisible();
});

test('cancelling a reply claims no answer and goes back to the question', async ({ page }) => {
  await page.goto(REPLIES);
  await page.locator('[data-button="avoid"]').click();
  const asked = await page.locator('.board-message-text').textContent();
  await page.locator('.board-controls button').click();
  await expect(page.locator('.board-answers')).toBeVisible();

  // Close is the listener's control, so it is in the listener's language.
  const close = page.locator('.board-close');
  await expect(close).toHaveAttribute('lang', 'zh-Hans');
  // ...and actually *in* it. The attribute alone passed while the button said
  // "Close", because the listener's catalogue had no such key and fell back to
  // English -- which is the designed fallback and exactly wrong on the one surface
  // the listener has to read.
  await expect(close).toHaveText(/\p{Script=Han}/u);
  await close.click();
  // Back to the question, not to the grid: cancelling is "I have not answered", not
  // "we are done".
  await expect(page.locator('.board-message-text')).toHaveText(asked ?? '');
  await expect(page.locator('.board-answers')).toHaveCount(0);
  // Escape does the same thing, one view at a time.
  await page.locator('.board-controls button').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.board-message-text')).toHaveText(asked ?? '');
});

test('the listener never changes what language the owner reads', async ({ page }) => {
  // B11, and the reason `loadCatalogue` exists. The reply surface is drawn from the
  // listener's catalogue; if it went through `loadUiLanguage` it would move the
  // owner's own preference and flip the document's direction under them.
  await page.goto(REPLIES);
  // After the board is up, not after `goto`: the bootstrap sets `lang` and `dir`
  // asynchronously, so a baseline taken too early records the empty document and the
  // test then "catches" its own race instead of a regression.
  await expect(page.locator('.board-cell').first()).toBeVisible();
  const before = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    saved: localStorage.getItem('plg.reader'),
  }));
  await page.locator('[data-button="avoid"]').click();
  await page.locator('.board-controls button').click();
  await page.locator('.board-answer').nth(1).click();
  await expect(page.locator('.board-message-text')).toBeVisible();
  expect(await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    saved: localStorage.getItem('plg.reader'),
  }))).toEqual(before);
});

// --- colour coding and legibility -------------------------------------------

/** Relative luminance, for asking whether white type can sit on a colour. */
const LUMA = `(css) => {
  const [r, g, b] = css.match(/\\d+/g).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}`;

test('every grid label has real contrast against its own cell', async ({ page }) => {
  // **This began as "white type is never on a light background", and the grid it was
  // written for is gone.** The cells were five saturated fills with white type; they
  // are neutral with dark type now, so that assertion would pass by finding no white
  // text at all. The question underneath it is the one that survives: can the label
  // be read? So it measures the contrast ratio, at rest and hovered, which also
  // still catches the original bug -- `style.css` has
  // `button:hover { background: var(--surface) }` at a specificity above a bare
  // `.board-cell`, and a cell that changes colour under the pointer is exactly how
  // white-on-white happened twice.
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();

  const ratio = `(fg, bg) => {
    const lum = (css) => {
      const [r, g, b] = css.match(/\\d+/g).map(Number).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(fg); const b2 = lum(bg);
    return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
  }`;

  const cells = page.locator('.board-cell');
  for (let i = 0; i < await cells.count(); i += 1) {
    for (const when of ['at rest', 'hovered']) {
      if (when === 'hovered') await cells.nth(i).hover();
      const { fg, bg } = await cells.nth(i).evaluate((n) => ({
        fg: getComputedStyle(n).color, bg: getComputedStyle(n).backgroundColor,
      }));
      const got = await page.evaluate(([f, b, fn]) => eval(fn)(f, b), [fg, bg, ratio]);
      // 4.5:1 is the ordinary-text threshold. These are large, so it is stricter
      // than it has to be -- which is the right side to be wrong on for a label
      // someone reads face down in a dim room.
      expect(got, `cell ${i} ${when}: ${fg} on ${bg}`).toBeGreaterThan(4.5);
    }
  }

  // The full-screen message keeps its colour and its white type, so the original
  // form of this check still applies there.
  await page.locator('[data-button="stop"]').click();
  const stage = page.locator('.board-stage');
  const { fg, bg } = await stage.evaluate((n) => ({
    fg: getComputedStyle(/** @type {HTMLElement} */ (n.querySelector('.board-message-text'))).color,
    bg: getComputedStyle(n).backgroundColor,
  }));
  expect(await page.evaluate(([f, b, fn]) => eval(fn)(f, b), [fg, bg, ratio])).toBeGreaterThan(4.5);
});

test('a label is as large as its own cell allows, and is never broken mid-word', async ({ page }) => {
  // At a phone width, where the cells are small enough that the answer differs
  // between labels. On a desktop the grid is wide and every label reaches the
  // ceiling, which would make the comparison below vacuous.
  await page.setViewportSize({ width: 390, height: 844 });
  // Each cell answers for itself: a short label has no reason to wear the size a
  // long one was forced down to. And the fitter measures with normal wrapping, so a
  // size that would split a word counts as too big -- `overflow-wrap: anywhere` lets
  // *any* size "fit", which is how "Comfort" came to be set at the ceiling and drawn
  // as "Comfor / t".
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  const seen = await page.locator('.board-cell-label').evaluateAll((ns) => ns.map((n) => {
    const cell = /** @type {HTMLElement} */ (n.parentElement);
    const box = getComputedStyle(cell);
    const room = {
      h: cell.clientHeight - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom),
      w: cell.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight),
    };
    return {
      text: n.textContent ?? '',
      px: parseFloat(getComputedStyle(n).fontSize),
      overflows: n.scrollHeight > room.h + 1 || n.scrollWidth > room.w + 1,
    };
  }));
  expect(seen.length).toBeGreaterThan(5);
  for (const cell of seen) {
    // Nothing spills, and nothing is below the floor at which a label stops being
    // readable at arm's length.
    expect(cell.overflows, `"${cell.text}" overflows its cell`).toBe(false);
    expect(cell.px, `"${cell.text}" is ${cell.px}px`).toBeGreaterThanOrEqual(12);
  }
  // The sizes genuinely differ, which is the whole point -- one global size would
  // make every short label as small as the longest one.
  expect(new Set(seen.map((c) => Math.round(c.px))).size).toBeGreaterThan(1);
  // The shortest label is set larger than the longest.
  const byLength = [...seen].sort((a, b) => a.text.length - b.text.length);
  expect(byLength[0].px).toBeGreaterThan(byLength.at(-1)?.px ?? 0);
});

test('a message that can be answered is marked, not only tinted', async ({ page }) => {
  // Colour alone excludes roughly one man in twelve and washes out in sunlight, and
  // this is the distinction that changes what happens after the tap.
  await page.goto(`${BOARD}&replies=1`);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  const asks = page.locator('[data-button="avoid"]');
  await expect(asks).toHaveClass(/board-cell-asks/);
  await expect(asks.locator('.board-cell-mark')).toHaveCount(1);
  // ...and a show-only message has neither.
  const shows = page.locator('[data-button="stop"]');
  await expect(shows).not.toHaveClass(/board-cell-asks/);
  await expect(shows.locator('.board-cell-mark')).toHaveCount(0);
  // A submenu is still recognisable as neither.
  await expect(page.locator('[data-button="focus"]')).toHaveClass(/board-cell-more/);
});

test('a message wears the colour of the button that opened it', async ({ page }) => {
  // That is what makes it coding rather than decoration: the owner can see they
  // pressed the right one without reading their own language back off the screen.
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  // **The grid no longer wears these colours and the message still does.** The cells
  // went neutral so the labels could have the contrast; the full-screen message kept
  // its role colour, because there it is the only thing on screen and has no label
  // to compete with. So the colour is read off the stage, not off the cell.
  /** @type {Set<string>} */ const seen = new Set();
  for (const [id, role] of [['stop', 'alert'], ['gentler', 'comm'], ['avoid', 'money']]) {
    await page.locator(`[data-button="${id}"]`).click();
    const stage = page.locator('.board-stage');
    await expect(stage).toHaveClass(new RegExp(`board-role-${role}`));
    seen.add(await stage.evaluate((n) => getComputedStyle(n).backgroundColor));
    await page.locator('.board-message').click();
  }
  // Three roles, three different colours -- not one class applied three times.
  expect(seen.size).toBe(3);
});

test('a submenu says its prompt once, and the buttons finish it', async ({ page }) => {
  // Four cells reading "Please focus on my shoulders / my back / ..." spend most of
  // a small screen on the words that do not vary. The prompt is owner-language
  // presentation only -- the listener still gets one complete idiomatic sentence,
  // which the last assertion here is the guard for.
  await page.goto(BOARD);
  await page.locator('[data-button="focus"]').click();
  await expect(page.locator('.board-grid-title')).toHaveText(/focus on/i);
  // Said once, not per button.
  for (const label of await page.locator('[data-button^="my"], .board-cell').allTextContents()) {
    expect(label.toLowerCase()).not.toContain('focus on');
  }
  await expect(page.locator('[data-button="shoulders"]')).toHaveText('my shoulders');

  // ...and the listener is shown the whole sentence, not the fragment.
  await page.locator('[data-button="shoulders"]').click();
  const shown = await page.locator('.board-message-text').textContent();
  expect((shown ?? '').length).toBeGreaterThan(4);
  expect(shown).toMatch(/\p{Script=Han}/u);
});

test('the way back does not look like something you are saying', async ({ page }) => {
  // It sits among coloured buttons that are all things to show a stranger, so the
  // one control that is not must read as chrome: grey, arrowed, and big enough to
  // hit without looking.
  await page.goto(BOARD);
  await page.locator('[data-button="focus"]').click();
  const up = page.locator('#board-up');
  await expect(up).toBeVisible();
  await expect(up).toContainText('←');
  const box = await up.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  const { bg, fg } = await up.evaluate((n) => ({
    bg: getComputedStyle(n).backgroundColor, fg: getComputedStyle(n).color,
  }));
  expect(fg).toMatch(/255,\s*255,\s*255/);
  // Grey, and not one of the five role colours a substantive button wears.
  const roles = await page.locator('.board-cell').evaluateAll(
    (ns) => ns.map((n) => getComputedStyle(n).backgroundColor),
  );
  expect(roles).not.toContain(bg);
});

// --- the owner's own buttons (C4) -------------------------------------------

/** @param {import('@playwright/test').Page} page */
async function addOwn(page, label, own, theirs) {
  await page.locator('#board-edit').click();
  const box = page.locator('.board-editor');
  await expect(box).toBeVisible();
  const fields = box.locator('.board-editor-field input');
  await fields.nth(0).fill(label);
  await fields.nth(1).fill(own);
  if (theirs !== undefined) await fields.nth(2).fill(theirs);
  await box.getByRole('button', { name: 'Save', exact: true }).click();
  return box;
}

// **Cleared once, not on every navigation.** `addInitScript` runs again on each
// `goto` and each `reload`, so clearing storage there wipes what the test just
// wrote the moment it reloads -- which is exactly what the persistence tests below
// are for, and both of them passed alone and failed together until this was found.
test.beforeEach(async ({ page }) => {
  await page.goto(BOARD);
  await page.evaluate(() => localStorage.clear());
});

test('a phrase you write appears on the board and survives a reload', async ({ page }) => {
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  const before = await page.locator('.board-cell').count();

  const box = await addOwn(page, 'No peanuts', 'I cannot eat peanuts', '我不能吃花生');
  await box.locator('.board-editor-close').click();
  await expect(page.locator('.board-cell')).toHaveCount(before + 1);

  // Placement is the reader's and is kept. Nothing reorders by use.
  await page.reload();
  await expect(page.locator('.board-cell')).toHaveCount(before + 1);
  const labels = await page.locator('.board-cell').allTextContents();
  expect(labels.at(-1)).toBe('No peanuts');
  // ...and it says the listener's sentence, not the owner's.
  await page.locator('.board-cell').last().click();
  await expect(page.locator('.board-message-text')).toHaveText('我不能吃花生');
  await expect(page.locator('.board-message-gloss')).toHaveText('I cannot eat peanuts');
});

test('the app does not pretend to translate, and says so', async ({ page }) => {
  // §5.2: there is no backend and inventing one is out of scope, so the form has to
  // admit it rather than leave a reader waiting for a translation that never comes.
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('#board-edit').click();
  await expect(page.locator('.board-editor')).toContainText(/does not translate/i);

  // A half-written phrase saves -- the reader may be coming back to it -- and stays
  // off the board, because `resolvePhrase` will not resolve one.
  const fields = page.locator('.board-editor .board-editor-field input');
  await fields.nth(0).fill('Half');
  await fields.nth(1).fill('Only my side');
  await page.locator('.board-editor').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.board-editor-list li')).toHaveCount(1);
  await page.locator('.board-editor-close').click();
  // Drawn, and drawn unavailable -- the same treatment an author's button gets when
  // the corpus cannot supply it, because the rule is the same: a grid that hides a
  // gap is a grid whose buttons have moved. `resolvePhrase` refuses a half-written
  // phrase, so it can never reach a listener.
  const half = page.locator('.board-cell', { hasText: 'Half' });
  await expect(half).toHaveCount(1);
  await expect(half).toBeDisabled();
});

test('the preview is the exact text the listener will be shown', async ({ page }) => {
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('#board-edit').click();
  const fields = page.locator('.board-editor .board-editor-field input');
  await fields.nth(2).fill('我对花生过敏');
  await expect(page.locator('.board-editor-preview')).toHaveText('我对花生过敏');
  await expect(page.locator('.board-editor-preview')).toHaveAttribute('lang', 'zh-Hans');
});

test('removing a button from a screen is not deleting the phrase', async ({ page }) => {
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  const before = await page.locator('.board-cell').count();
  const box = await addOwn(page, 'Tea please', 'I would like tea', '我想要茶');

  await box.getByRole('button', { name: 'Remove from this screen' }).click();
  await expect(box.locator('.board-editor-list li')).toHaveCount(0);
  await box.locator('.board-editor-close').click();
  await expect(page.locator('.board-cell')).toHaveCount(before);

  // The sentence itself is still stored -- losing a placement must not lose words
  // the reader typed by hand.
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('plg.boards') ?? '{}'));
  expect(Object.values(kept.phrases ?? {})).toHaveLength(1);
});

test('a board button never changes what a sheet prints', async ({ page }) => {
  // **The semantic boundary in §5.2.** The studio keeps `plg.edits.<pair>`, whose
  // flags decide what is printed. Making a button to say "no peanuts" to a waiter
  // must not add a row to every card the reader prints for that pair.
  await page.goto(BOARD);
  await page.evaluate(() => localStorage.setItem('plg.edits.zh-Hans__en', JSON.stringify({
    overrides: {}, extras: [{ concept_id: 'own-1', gloss: 'mine', script: '我的' }],
  })));
  const before = await page.evaluate(() => localStorage.getItem('plg.edits.zh-Hans__en'));

  await expect(page.locator('.board-cell').first()).toBeVisible();
  const box = await addOwn(page, 'No peanuts', 'I cannot eat peanuts', '我不能吃花生');
  await box.getByRole('button', { name: 'Remove from this screen' }).click();
  await box.locator('.board-editor-close').click();

  expect(await page.evaluate(() => localStorage.getItem('plg.edits.zh-Hans__en'))).toBe(before);
});

test('the editor is owner-only and cannot be reached from a message', async ({ page }) => {
  // The listener must not find it by tapping, and the owner must not open it while
  // holding the phone out to a stranger.
  await page.goto(`${BOARD}&replies=1`);
  await expect(page.locator('#board-edit')).toBeVisible();
  await page.locator('[data-button="avoid"]').click();
  await expect(page.locator('#board-edit')).toBeHidden();
  await page.locator('.board-controls button').click();
  await expect(page.locator('#board-edit')).toBeHidden();
  await page.locator('.board-close').click();
  await page.locator('.board-message').click();
  await expect(page.locator('#board-edit')).toBeVisible();
});

test('damaged storage is reported rather than presented as empty', async ({ page }) => {
  // A reader whose storage is corrupt has lost sentences they typed by hand,
  // possibly about an allergy. An editor that opens blank invites them to type over
  // what is still there.
  await page.goto(BOARD);
  await page.evaluate(() => localStorage.setItem('plg.boards', '{not json'));
  await page.reload();
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('#board-edit').click();
  await expect(page.locator('.board-editor-status')).toContainText(/could not be read/i);
  // ...and the unreadable record is still on disk, not overwritten by the read.
  expect(await page.evaluate(() => localStorage.getItem('plg.boards'))).toMatch(/not json/);
});

test('a device with no voice still shows every message', async ({ page }) => {
  // A01. Chromium here enumerates no voices, which is the case worth pinning: text
  // must never wait on audio, and a board with no Speak control is a working board.
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="stop"]').click();
  await expect(page.locator('.board-message-text')).toHaveText(/\p{Script=Han}/u);
  // Nothing was spoken, and nothing is pending, on open.
  expect(await page.evaluate(() => speechSynthesis.speaking || speechSynthesis.pending)).toBe(false);
});

test('Speak is the owner’s control and Reply is the listener’s', async ({ page }) => {
  // They sit side by side and are labelled from different catalogues, because
  // different people press them. Asserted through a stubbed voice list, since this
  // machine has none — the point is which language each label is in, not audio.
  await page.addInitScript(() => {
    const voice = { name: 'Test', lang: 'zh-CN', localService: true, default: true, voiceURI: 'test' };
    Object.defineProperty(speechSynthesis, 'getVoices', { value: () => [voice] });
  });
  await page.goto(`${BOARD}&replies=1`);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="avoid"]').click();

  const speak = page.locator('.board-speak');
  await expect(speak).toHaveText('Speak');
  // The listener's control, in Han script; the owner's, in Latin. Different people.
  await expect(page.locator('.board-controls button').last()).toHaveText(/\p{Script=Han}/u);

  // Speak is a sibling of the message surface, not a child -- which is what stops
  // its click reaching the dismiss handler. Pressing it must not close the message.
  await speak.click();
  await expect(page.locator('.board-message-text')).toBeVisible();
});

// --- the shapes a phone actually comes in (C7) -------------------------------

for (const [name, width, height, scale] of /** @type {[string,number,number,number][]} */ ([
  ['a narrow portrait phone', 360, 640, 1],
  ['a short landscape phone', 740, 360, 1],
  ['a phone with enlarged system text', 390, 844, 1.6],
])) {
  test(`nothing is cut off on ${name}`, async ({ page }) => {
    // §9.2 asks for these three to be *looked at*, and the reason is that each has
    // produced a defect the behavioural tests could not see. Enlarged text is the
    // sharpest: at 1.6x the header ran off the right edge and read
    // "Englis / Simpli / Chines", because a flex item will not shrink below its
    // content unless told it may. This is that check, automated -- it cannot judge
    // whether a layout looks good, but it can say whether anything has been cut off.
    await page.setViewportSize({ width, height });
    if (scale !== 1) {
      await page.addInitScript((z) => {
        addEventListener('DOMContentLoaded', () => {
          document.documentElement.style.fontSize = `${16 * z}px`;
        });
      }, scale);
    }
    await page.goto(`${BOARD}&replies=1`);
    await expect(page.locator('.board-cell').first()).toBeVisible();

    const spilled = await page.evaluate(() => {
      /** @type {string[]} */ const bad = [];
      const named = (/** @type {HTMLElement} */ n) => n.dataset.button || n.id || n.className;
      for (const n of document.querySelectorAll(
        '.board-cell, .board-up, .board-edit, .board-pair, .board-brand, .board-grid-title')) {
        const el = /** @type {HTMLElement} */ (n);
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        // Past either edge of the viewport, or clipped inside its own box.
        if (r.right > innerWidth + 1 || r.left < -1) bad.push(`${named(el)} off-screen`);
        if (el.scrollWidth > el.clientWidth + 1) bad.push(`${named(el)} clipped`);
      }
      return bad;
    });
    expect(spilled).toEqual([]);

    // And a message, which is the surface that has to hold the most text.
    await page.locator('[data-button="stop"]').click();
    const text = page.locator('.board-message-text');
    await expect(text).toBeVisible();
    const fits = await text.evaluate((n) => {
      const box = /** @type {HTMLElement} */ (n.closest('.board-message'));
      // It may scroll -- that is the designed answer for a long phrase -- but it
      // must never be cut off sideways, which would lose a word silently.
      return n.scrollWidth <= n.clientWidth + 1 && box.scrollHeight >= n.scrollHeight;
    });
    expect(fits).toBe(true);
  });
}

test('a tap reaches the message inside the frame budget', async ({ page }) => {
  // §9.3 asks for p95 under 100ms on the test device, warm. Measured to the next
  // animation frame, which is when the reader could first see it. Not a benchmark
  // of anyone's phone -- a tripwire for the day something starts solving, fetching
  // or re-reading the corpus on the tap path, which is the failure that would make
  // this slow.
  await page.goto(BOARD);
  await expect(page.locator('.board-cell').first()).toBeVisible();
  /** @type {number[]} */ const times = [];
  for (let i = 0; i < 12; i += 1) {
    times.push(await page.evaluate(() => {
      const t0 = performance.now();
      /** @type {HTMLElement} */ (document.querySelector('[data-button="stop"]')).click();
      return new Promise((done) => requestAnimationFrame(() => done(performance.now() - t0)));
    }));
    await page.locator('.board-message').click();
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  expect(p95, `p95 was ${p95.toFixed(0)}ms over ${times.length} taps`).toBeLessThan(100);
});
