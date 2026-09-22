// The conversation board in a browser.
//
// `tests/conversation.test.mjs` already pins every row of the navigation table
// against the reducer, so this file has a narrower job: prove the DOM dispatches
// those actions, that a tap lands where a tap should, and that the page does not
// drag the typesetting engine along to show a sentence.

import { test, expect } from '@playwright/test';

const BOARD = '/conversation.html?target=zh-Hans&source=en&board=spa';

/**
 * The controls that are part of the exchange, which is Speak and Reply.
 *
 * The turn control shares their row and is not one of them: it is always present and
 * it is about how the screen is drawn rather than about what is being said, so every
 * test that means "the button the listener presses" has to say so.
 */
const EXCHANGE = '.board-controls .board-control:not(.board-turn)';

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
  // At the root the control stays, because the root has a parent now: the topic
  // list. It used to vanish here, which left a board with no way out of itself.
  await expect(page.locator('#board-up')).toBeVisible();
  await expect(page.locator('#board-up')).toHaveAttribute('aria-label', 'All topics');
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

test('a message with no answers offers no reply, and gaps are reported', async ({ page }) => {
  // B08. There is no reply screen after every statement: the control appears only on
  // a message that has answers, and "it hurts here" is not a question. Replies are on
  // by default now -- while they were behind `?replies=1` the tint and the ↩ mark that
  // promise an answer were decorating cells that behaved like every other one.
  await board(page);
  // `please stop` rather than `it hurts here`: the reply-set audit gave the latter an
  // answer space, and a therapist answering "which area do you mean?" is the point of
  // that change. Stopping is an instruction with nothing to say back to it.
  await page.locator('[data-button="stop"]').click();
  // The row itself is always there -- the turn control is in it -- so what is
  // asserted is that nothing in the *exchange* is offered on a message that cannot
  // be answered and cannot be spoken.
  await expect(page.locator(EXCHANGE))
    .toHaveCount(0);
  // B16: nothing on this board is unavailable for en/zh-Hans, so no warning.
  await expect(page.locator('#board-status')).toBeEmpty();
});

test('a board refuses a language it cannot say, and names it', async ({ page }) => {
  // A board needs text on *both* sides, so one whose phrases have no Quenya is not a
  // board for a Quenya listener -- better a clear refusal than letting every button
  // resolve to nothing and reporting ten unavailable phrases, which is true and
  // tells the reader nothing.
  //
  // It names the **language**, not the pairs it does serve. That list used to be one
  // pair; it is computed from the corpus now and is most of a fifty-three-language
  // registry, which is not something a reader can act on.
  await page.goto('/conversation.html?target=qya&source=en&board=spa');
  const shown = page.locator('body');
  await expect(shown).toContainText(/does not have every phrase it needs/i);
  await expect(shown).toContainText('Quenya');
  await expect(page.locator('.board-cell')).toHaveCount(0);

  // ...and the topic list simply does not offer it, which is the path a reader
  // actually takes: a board they cannot use is absent rather than broken.
  await page.goto('/conversation.html?target=qya&source=en');
  await expect(page.locator('#board-title')).toHaveText('Context');
  await expect(page.locator('.board-cell')).toHaveCount(0);
  await expect(page.locator('#board-status')).not.toBeEmpty();
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
  await expect(page.locator(EXCHANGE))
    .toHaveCount(0);
  await page.locator('.board-message').click();

  await page.locator('[data-button="avoid"]').click();
  const reply = page.locator(EXCHANGE);
  await expect(reply).toHaveCount(1);
  // The listener reads this one too, so it is in their language and not the owner's.
  await expect(reply).toHaveText(/\p{Script=Han}/u);
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
  await page.locator(EXCHANGE).click();

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
  await page.locator(EXCHANGE).click();
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
  await page.locator(EXCHANGE).click();
  await expect(page.locator('.board-answers')).toBeVisible();

  // The way back is the listener's control, so it is in the listener's language --
  // small and in the corner, not centred among the answers.
  const close = page.locator('.board-back');
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
  await page.locator(EXCHANGE).click();
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
  await page.locator(EXCHANGE).click();
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
  // Chrome, not type: the filled grey button this used to be became an outlined
  // square when the bar went to one row, so what is checked is that the arrow is
  // drawn in the muted grey rather than in white on a colour.
  expect(fg).not.toMatch(/255,\s*255,\s*255/);
  // Grey, and not one of the five role colours a substantive button wears.
  const roles = await page.locator('.board-cell').evaluateAll(
    (ns) => ns.map((n) => getComputedStyle(n).backgroundColor),
  );
  expect(roles).not.toContain(bg);
});

// --- the owner's own buttons (C4) -------------------------------------------

/**
 * Reach one of the owner's two controls, which now live behind the three bars.
 *
 * Two named buttons cost the bar a second row on a phone, and the row they cost was
 * the one the topic needed -- so the test reaches them the way a reader does.
 * @param {import('@playwright/test').Page} page @param {string} name
 */
async function fromMenu(page, name) {
  await page.locator('#board-menu').click();
  await page.locator('.board-menu-item', { hasText: name }).click();
}

/** @param {import('@playwright/test').Page} page */
async function addOwn(page, label, own, theirs) {
  await fromMenu(page, 'Edit buttons');
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
  await fromMenu(page, 'Edit buttons');
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
  await fromMenu(page, 'Edit buttons');
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
  await expect(page.locator('#board-menu')).toBeVisible();
  await page.locator('[data-button="avoid"]').click();
  await expect(page.locator('#board-menu')).toBeHidden();
  await page.locator(EXCHANGE).click();
  await expect(page.locator('#board-menu')).toBeHidden();
  await page.locator('.board-back').click();
  await page.locator('.board-message').click();
  await expect(page.locator('#board-menu')).toBeVisible();
});

test('damaged storage is reported rather than presented as empty', async ({ page }) => {
  // A reader whose storage is corrupt has lost sentences they typed by hand,
  // possibly about an allergy. An editor that opens blank invites them to type over
  // what is still there.
  await page.goto(BOARD);
  await page.evaluate(() => localStorage.setItem('plg.boards', '{not json'));
  await page.reload();
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await fromMenu(page, 'Edit buttons');
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
  await expect(page.locator(EXCHANGE).last())
    .toHaveText(/\p{Script=Han}/u);

  // Speak is a sibling of the message surface, not a child -- which is what stops
  // its click reaching the dismiss handler. Pressing it must not close the message.
  await speak.click();
  await expect(page.locator('.board-message-text')).toBeVisible();
});

// --- the shapes a phone actually comes in (C7) -------------------------------

/** Everything in the chrome a narrow or enlarged screen can push off its edge. */
async function noSpill(/** @type {import('@playwright/test').Page} */ page) {
  const spilled = await page.evaluate(() => {
    /** @type {string[]} */ const bad = [];
    const named = (/** @type {HTMLElement} */ n) => n.dataset.button || n.id || n.className;
    for (const n of document.querySelectorAll(
      '.board-cell, .board-up, .board-menu, .board-pair, .board-brand,'
      + ' .board-grid-title, .board-title')) {
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
}

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

    // **The topic list and the densest board, as well as the one this was written
    // against.** Massage is ten short labels; "Getting around" is twelve and the
    // picker's are whole phrases, so a board title, a legend or a long topic name
    // runs off the edge there first.
    for (const at of ['', '&board=transport']) {
      await page.goto(`/conversation.html?target=zh-Hans&source=en${at}`);
      await expect(page.locator('.board-cell').first()).toBeVisible();
      await noSpill(page);
    }

    await page.goto(`${BOARD}&replies=1`);
    await expect(page.locator('.board-cell').first()).toBeVisible();
    await noSpill(page);

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

// --- answers that are a quantity (Batch B) -----------------------------------

/** @param {import('@playwright/test').Page} page */
async function openWaitAnswers(page) {
  // The wait question lives on the Time board now, not the massage one. "How long is
  // the wait" is not a thing anyone says face down on a massage table, and a board is
  // a situation rather than a phrasebook.
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=time');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="wait"]').click();
  await page.locator(EXCHANGE).first().click();
  await expect(page.locator('.board-answer').first()).toBeVisible();
}

test('durations are offered in the listener’s language, from numbers', async ({ page }) => {
  // No row in any language says "15 minutes". The value is `{15, minute}` and CLDR
  // does the rest, which is why this works in fifty-one languages at once.
  await openWaitAnswers(page);
  const answers = await page.locator('.board-answer').allTextContents();
  // "No wait" first, because it is the answer everyone hopes for; then the ladder.
  expect(answers[0]).toBe('不用等，现在就可以');
  expect(answers.slice(1, 7)).toEqual(['5分钟', '10分钟', '15分钟', '30分钟', '1小时', '2小时']);
  // ...and the keypad's own button is in the listener's language too, not English.
  await expect(page.locator('.board-answer-entry')).toHaveText(/\p{Script=Han}/u);
});

test('the question stays on screen while an answer is chosen and typed', async ({ page }) => {
  // Someone answering "how long is the wait" should not have to remember what they
  // are answering, and that holds through the keypad as well as the list.
  await openWaitAnswers(page);
  const asked = await page.locator('.board-asked').textContent();
  expect(asked).toMatch(/\p{Script=Han}/u);
  await page.locator('.board-answer-entry').click();
  await expect(page.locator('.board-asked')).toHaveText(asked ?? '');
});

test('a typed duration confirms in the owner’s language and cancels back to the answers', async ({ page }) => {
  await openWaitAnswers(page);
  await page.locator('.board-answer-entry').click();

  // Cancel returns to the answers, not to the question and not to the grid.
  await page.locator('.board-close').click();
  await expect(page.locator('.board-answer')).toHaveCount(10);

  await page.locator('.board-answer-entry').click();
  const confirm = page.locator('.board-entry-confirm');
  // Nothing typed is not an answer, so Confirm is not offered.
  await expect(confirm).toBeDisabled();
  await page.locator('.board-entry-amount').fill('45');
  // The preview is the exact text the listener reads, updating as it is typed.
  await expect(page.locator('.board-entry-preview')).toHaveText('45分钟');
  await expect(confirm).toBeEnabled();

  await confirm.click();
  // The value travelled, not the text: the owner's reading is formatted fresh.
  await expect(page.locator('.board-message-text')).toHaveText('45 minutes');
  await expect(page.locator('.board-message-text')).toHaveAttribute('lang', 'en');
});

test('the unit changes what the same number means, in both languages', async ({ page }) => {
  await openWaitAnswers(page);
  await page.locator('.board-answer-entry').click();
  await page.locator('.board-entry-amount').fill('3');
  await expect(page.locator('.board-entry-preview')).toHaveText('3分钟');
  await page.locator('[data-unit="hour"]').click();
  await expect(page.locator('.board-entry-preview')).toHaveText('3小时');
  await page.locator('.board-entry-confirm').click();
  await expect(page.locator('.board-message-text')).toHaveText('3 hours');
});

test('a keypad refuses what is not an amount, rather than showing it to a stranger', async ({ page }) => {
  await openWaitAnswers(page);
  await page.locator('.board-answer-entry').click();
  const amount = page.locator('.board-entry-amount');
  const confirm = page.locator('.board-entry-confirm');
  for (const bad of ['0', '-5', '1.5', 'abc', '900']) {
    await amount.fill(bad);
    await expect(confirm, `"${bad}" should not be confirmable`).toBeDisabled();
  }
  await amount.fill('20');
  await expect(confirm).toBeEnabled();
});

test('the keypad’s own text is legible on the coloured stage', async ({ page }) => {
  // The preview was left at the body ink and drawn dark on a saturated fill -- the
  // same miss as the question, which had already been given white type.
  await openWaitAnswers(page);
  await page.locator('.board-answer-entry').click();
  await page.locator('.board-entry-amount').fill('45');
  const seen = await page.locator('.board-entry-preview').evaluate((n) => ({
    fg: getComputedStyle(n).color,
    bg: getComputedStyle(/** @type {HTMLElement} */ (n.closest('.board-stage'))).backgroundColor,
  }));
  const lum = (/** @type {string} */ css) => {
    const [r, g, b] = (css.match(/\d+/g) ?? []).map(Number).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (Math.max(lum(seen.fg), lum(seen.bg)) + 0.05)
    / (Math.min(lum(seen.fg), lum(seen.bg)) + 0.05);
  expect(ratio, `${seen.fg} on ${seen.bg}`).toBeGreaterThan(4.5);
});

// --- the topic picker --------------------------------------------------------

test('converse opens the topics, not a board', async ({ page }) => {
  // A board is a situation. What someone needs face down on a massage table and what
  // they need in a taxi have almost nothing in common, and one grid holding both
  // would be a grid you have to read rather than glance at.
  await page.goto('/conversation.html?target=zh-Hans&source=en');
  await expect(page.locator('#board-title')).toHaveText('Context');
  const topics = page.locator('.board-cell');
  await expect(topics.first()).toBeVisible();
  // Emergency first, and in the authored order throughout -- nothing here sorts by
  // use or by name. Someone who has learned where a topic is must find it there.
  expect(await topics.allTextContents()).toEqual([
    'Emergency', 'Meeting people', 'Directions', 'Getting around',
    'Eating out', 'Shopping', 'Time', 'Massage and spa',
  ]);
  // Nothing on this screen is owner-only chrome: there is no board to edit yet.
  await expect(page.locator('#board-menu')).toBeHidden();

  await page.locator('[data-button="time"]').click();
  await expect(page.locator('#board-title')).toHaveText('Time');
  // The board names itself and the topic list is one tap away, which is the whole
  // point of the root control no longer vanishing.
  await expect(page.locator('#board-up')).toBeVisible();
  await expect(page.locator('#board-up')).toHaveAttribute('aria-label', 'All topics');
  await page.locator('#board-up').click();
  await expect(page.locator('#board-title')).toHaveText('Context');
});

test('the mark that promises an answer is drawn, and only where it is used', async ({ page }) => {
  // **Drawn large and faint across the button, not badged into its corner.** In the
  // corner it was an icon, and an icon invites the question of what it means -- which
  // is what the legend under the grid used to answer, in words, on a screen whose
  // whole job is to be read at a glance. Filling the button it is a surface rather
  // than a control, so there is nothing left to explain and the legend is gone.
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=shopping');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await expect(page.locator('#board-legend')).toHaveCount(0);
  const marked = page.locator('.board-cell-asks').first();
  await expect(marked).toBeVisible();
  await expect(marked.locator('.board-cell-mark')).toHaveCount(1);

  // ...and the Reply control it promises actually appears, with no query string.
  await page.locator('[data-button="stock"]').click();
  await expect(page.locator('.board-message')).toBeVisible();
  const reply = page.locator(EXCHANGE).first();
  await expect(reply).toBeVisible();
  await reply.click();
  // The answers are the listener's own language, for the listener to tap.
  const answers = page.locator('.board-answer');
  await expect(answers.first()).toBeVisible();
  expect(await answers.first().textContent()).toMatch(/\p{Script=Han}/u);

  // The mark is drawn per cell and nowhere else: on the spa's body-area grid the four
  // focus requests are answerable and `please stop` is not, so four of six wear it.
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=spa');
  await page.locator('[data-button="focus"]').click();
  await expect(page.locator('[data-button="shoulders"]')).toBeVisible();
  await expect(page.locator('[data-button="shoulders"] .board-cell-mark')).toHaveCount(1);
  await expect(page.locator('[data-button="stop"] .board-cell-mark')).toHaveCount(0);
});

test('a message never breaks a word in half', async ({ page }) => {
  // **Reported from a phone: "supervisor" was set as "supervis / or".** A reader
  // sounding that out to a stranger is being actively misled, and in a script they
  // cannot read the damage is invisible to them. The cause was a fitter that grew
  // the text while `overflow-wrap: anywhere` quietly absorbed the overflow by
  // breaking words, so growing never looked like it had gone too far.
  //
  // Two changes fix it and **either one alone is sufficient**, which is worth knowing
  // before someone deletes one as redundant: the CSS is now `break-word`, which only
  // breaks a word that cannot fit a line by itself, and the fitter now measures width
  // as well as height so it stops before any word gets that long. Checked by
  // reverting each in turn -- this test only goes red when both are gone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=spa');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="avoid"]').click();
  await page.locator(EXCHANGE).first().click();
  await expect(page.locator('.board-answer').first()).toBeVisible();
  // "I am not sure, I need to ask my supervisor" -- the longest answer on the board,
  // and the one that produced the screenshot.
  await page.locator('.board-answer').nth(4).click();

  const broken = await page.locator('.board-message-text').evaluate((node) => {
    // Walk the text one character at a time and group by line box: where a line
    // starts on a character that is not preceded by a space, the browser split a
    // word to get there.
    const text = node.textContent ?? '';
    const point = node.firstChild;
    if (!point) return ['no text node'];
    const range = document.createRange();
    /** @type {string[]} */ const bad = [];
    let top = null;
    for (let i = 0; i < text.length; i += 1) {
      range.setStart(point, i);
      range.setEnd(point, i + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.height) continue;
      if (top !== null && rect.top > top + 1 && !/\s/.test(text[i - 1] ?? ' ')) {
        bad.push(`${text.slice(Math.max(0, i - 8), i)} / ${text.slice(i, i + 8)}`);
      }
      top = rect.top;
    }
    return bad;
  });
  expect(broken).toEqual([]);
});

// --- the beacon ---------------------------------------------------------------

test('the beacon is seen from across a road, and stays under the flash limit', async ({ page }) => {
  // **The one thing in this app that moves**, because a distress signal that does
  // not move is not one. Everywhere else the same information is given statically.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=emergency');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await expect(page.locator('.board-cell-beacon')).toHaveCount(2);

  await page.locator('[data-button="sos"]').click();
  await expect(page.locator('.beacon')).toBeVisible();

  // **A safety property, not a style one.** WCAG puts the photosensitive seizure
  // threshold at three flashes per second; a Morse dot of 300ms keeps this at one.
  // Counted rather than asserted from the constant, so shortening the dot without
  // thinking about it goes red here.
  const flips = await page.evaluate(async () => {
    const node = /** @type {HTMLElement} */ (document.querySelector('.beacon'));
    let last = node.classList.contains('beacon-lit');
    let n = 0;
    const started = performance.now();
    while (performance.now() - started < 3000) {
      await new Promise((r) => { setTimeout(r, 20); });
      const now = node.classList.contains('beacon-lit');
      if (now !== last) { n += 1; last = now; }
    }
    return n;
  });
  expect(flips / 2 / 3).toBeLessThan(3);
  expect(flips).toBeGreaterThan(0);

  // Tapping anywhere stops it: someone who has just been found should not have to
  // hunt for a control.
  await page.locator('.beacon').click();
  await expect(page.locator('.beacon')).toHaveCount(0);

  // The other mode is a word held still with a light running the edge of the
  // display -- the travelling light is what catches an eye not pointed at the phone.
  await page.locator('[data-button="attention"]').click();
  await expect(page.locator('.beacon-attention')).toBeVisible();
  // **The word is the stranger's, not the reader's.** A beacon exists to be read by
  // whoever walks past, so the one thing on this screen that cannot be in the
  // reader's language is the word on it -- and it is the corpus's own reviewed
  // wording, not a second translation of `Help` living in the interface catalogue.
  const word = page.locator('.beacon-word');
  await expect(word).toHaveAttribute('lang', 'zh-Hans');
  expect(await word.textContent()).toMatch(/\p{Script=Han}/u);

  // One light going round, rather than four edges taking turns. Sampled over a full
  // lap and sorted into sides: a travelling light visits all four, and -- the part
  // that makes it a travel rather than a switch -- it is somewhere new every frame.
  const path = await page.evaluate(async () => {
    const light = /** @type {HTMLElement} */ (document.querySelector('.beacon-light'));
    /** @type {Set<string>} */ const sides = new Set();
    /** @type {Set<number>} */ const spots = new Set();
    for (let i = 0; i < 30; i += 1) {
      const r = light.getBoundingClientRect();
      const x = (r.left + r.right) / 2;
      const y = (r.top + r.bottom) / 2;
      if (y < 8) sides.add('top');
      else if (y > innerHeight - 8) sides.add('bottom');
      else if (x < 8) sides.add('left');
      else if (x > innerWidth - 8) sides.add('right');
      spots.add(Math.round(x) * 10000 + Math.round(y));
      await new Promise((r2) => { setTimeout(r2, 100); });
    }
    return { sides: [...sides].sort(), spots: spots.size };
  });
  expect(path.sides).toEqual(['bottom', 'left', 'right', 'top']);
  expect(path.spots).toBeGreaterThan(20);

  // Escape leaves the beacon and nothing else: the grid is exactly where it was.
  await page.keyboard.press('Escape');
  await expect(page.locator('.beacon')).toHaveCount(0);
  await expect(page.locator('[data-button="sos"]')).toBeVisible();
});

test('personal data can be carried off the device, and deleted from it', async ({ page }) => {
  // §5.4. There is no account and no server, so the only copy of someone's own
  // phrases is on one device -- which means there has to be a way to get it off.
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=spa');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem('plg.boards', JSON.stringify({
    schemaVersion: 1,
    phrases: {
      p1: {
        id: 'p1', label: 'no peanuts', owner: 'No peanuts', listener: '不要花生',
        pair: 'zh-Hans__en', created: '2026-09-21T00:00:00.000Z',
      },
    },
    placements: { 'spa/main': ['p1'] },
  })));
  await page.reload();
  await expect(page.locator('[data-button="p1"]')).toBeVisible();

  // **Offered on every pair**, not only the 22 languages that ask about voice: a
  // backup button that appears for Russian readers alone is one nobody can find.
  await fromMenu(page, 'Settings');
  const dialog = page.locator('dialog.speaker-settings');
  await expect(dialog).toBeVisible();

  const save = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save a copy' }).click();
  const file = await save;
  expect(file.suggestedFilename()).toMatch(/^pocket-language-guide-\d{4}-\d{2}-\d{2}\.json$/);

  // Deleting is confirmed, because the saved copy is the only way back.
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog.locator('[role="status"]')).toHaveText('Deleted.');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-button="p1"]')).toHaveCount(0);
});

// --- what the screen can actually hold (I) ------------------------------------

test('no message is drawn wider than the screen it is on', async ({ page }) => {
  // **Reported as "the text pushes flush against the white outline". It was not
  // flush, it was off the edge**: `Извините` was drawn 810px wide in a 368px box and
  // Tamil's `காவல்துறையை அழையுங்கள்` ran 349px past the screen. `.board-message` is a
  // `<button>`, the HTML rendering spec gives a button `align-items: center`, and a
  // centred flex item is shrink-to-fit -- so the paragraph grew to its own
  // max-content width, and `fitMessage`'s width test, which measures that
  // paragraph's content box, was comparing the ink with itself and passing at every
  // size. Four scripts, every cell, both orientations, measured as ink against the
  // viewport rather than as any box metric, because a box is what lied last time.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [target, board] of [['zh-Hans', 'emergency'], ['de', 'emergency'],
    ['ta', 'emergency'], ['ru', 'intro']]) {
    await page.goto(`/conversation.html?target=${target}&source=en&board=${board}`);
    await expect(page.locator('.board-cell').first()).toBeVisible();
    const cells = page.locator('.board-cell:not([disabled])');
    for (let i = 0; i < await cells.count(); i += 1) {
      const cell = cells.nth(i);
      if ((await cell.getAttribute('class') ?? '').includes('beacon')) continue;
      await cell.click();
      const big = page.locator('.board-message-text');
      if (!(await big.count())) { await page.keyboard.press('Escape'); continue; }
      for (const turned of [false, true]) {
        if (turned) await page.locator('.board-turn').click();
        const gap = await big.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          let near = Infinity;
          for (const box of range.getClientRects()) {
            if (!box.height) continue;
            near = Math.min(near, box.left, box.top,
              innerWidth - box.right, innerHeight - box.bottom);
          }
          return Math.round(near);
        });
        expect(gap, `${target} ${await big.textContent()}${turned ? ' turned' : ''}`)
          .toBeGreaterThan(0);
      }
      await page.locator('.board-turn').click();
      await page.locator('.board-message').click({ position: { x: 3, y: 3 } });
      await expect(page.locator('.board-stage')).toBeHidden();
    }
  }
});

test('turning the screen sideways sets a long phrase larger', async ({ page }) => {
  // Nothing here breaks a word in half, so the longest word in a message sets the
  // type size -- eleven characters of Russian hold one to 42px in 310px of line. The
  // turn is worth the long axis of the phone, and the fitter has to measure it with
  // the rotation dropped: client rects are reported in viewport space, so a turned
  // stage hands back every line's thickness where its length belongs, which reads as
  // far too wide at every size and pinned the text at the floor.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=emergency');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="hospital"]').click();
  const big = page.locator('.board-message-text');
  const size = () => big.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const lines = () => big.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].filter((r) => r.height > 0).length;
  });
  const upright = { px: await size(), lines: await lines() };
  const turn = page.locator('.board-turn');
  await turn.click();
  await expect(turn).toHaveAttribute('aria-pressed', 'true');
  const sideways = { px: await size(), lines: await lines() };
  // Nine characters: four lines at 108px upright, one line at 126px sideways.
  expect(sideways.px).toBeGreaterThan(upright.px);
  expect(sideways.lines).toBeLessThan(upright.lines);
  // And the stage still covers exactly the screen, rather than a rotated box hanging
  // off two edges of it.
  const stage = await page.locator('.board-stage').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  });
  expect(stage).toEqual([0, 0, 390, 844]);
  // Turning it back is the same control, and returns the same size.
  await turn.click();
  expect(await size()).toBeCloseTo(upright.px, 0);
});

test('every row of a board is on the screen', async ({ page }) => {
  // `grid-auto-rows: 1fr` needs a definite height to divide, and the page had only a
  // floor -- so the emergency board settled on six 118px rows where 111px fitted and
  // hung its last row, the two beacons, 38px off the bottom edge. A board whose
  // safety controls are half drawn below the fold is worse than one that scrolls.
  for (const [w, h, board] of /** @type {[number,number,string][]} */ ([
    [390, 844, 'emergency'], [360, 640, 'emergency'], [390, 844, 'transport'],
  ])) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/conversation.html?target=zh-Hans&source=en&board=${board}`);
    await expect(page.locator('.board-cell').first()).toBeVisible();
    const fit = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.board-cell')];
      return {
        past: Math.max(...cells.map((c) => Math.round(c.getBoundingClientRect().bottom)))
          - innerHeight,
        scrolls: document.documentElement.scrollHeight - innerHeight,
      };
    });
    expect(fit.past, `${board} at ${w}x${h}`).toBeLessThanOrEqual(0);
    expect(fit.scrolls).toBe(0);
  }
});

test('characters in a square script line up, and the punctuation sits outside them', async ({ page }) => {
  // **Reported from a phone.** `救命！` set large enough to wrap breaks as `救` / `命！`,
  // because no line may begin with a closing mark — and centring each line then puts
  // the `救` on the midline while the `命` is pushed half a character left of it by the
  // `！`. Two characters that should be a column, visibly out of line. Aligning the
  // lines to each other and centring the block makes the characters the column and
  // the punctuation the thing that sits off to the side.
  await page.setViewportSize({ width: 390, height: 844 });
  const lines = () => page.locator('.board-message-text').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return {
      columns: el.classList.contains('board-text-columns'),
      lefts: [...range.getClientRects()].filter((r) => r.height > 0)
        .map((r) => Math.round(r.left)),
    };
  });

  await page.goto('/conversation.html?target=zh-Hans&source=en&board=emergency');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="hospital"]').click();
  const han = await lines();
  expect(han.columns).toBe(true);
  expect(han.lefts.length).toBeGreaterThan(1);
  // Every line starts in the same place, which is what makes them a column.
  expect(new Set(han.lefts).size).toBe(1);

  // **Not for a proportional script.** Aligning Latin lines buys a ragged right edge
  // and no column, because the characters are not on an em square to begin with.
  await page.goto('/conversation.html?target=de&source=en&board=emergency');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="hospital"]').click();
  const latin = await lines();
  expect(latin.columns).toBe(false);
  expect(latin.lefts.length).toBeGreaterThan(1);
  expect(new Set(latin.lefts).size).toBeGreaterThan(1);
});

test('the SOS screen has nothing in the middle of it', async ({ page }) => {
  // The Morse *is* the message: the middle of the screen is the part doing the
  // signalling, and a word there costs lit area on the white frames and competes with
  // the flash on the black ones. `SOS` is also not a word in most of these languages.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=emergency');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await page.locator('[data-button="sos"]').click();
  await expect(page.locator('.beacon-sos')).toBeVisible();
  const shape = await page.evaluate(() => {
    const word = /** @type {HTMLElement} */ (document.querySelector('.beacon-word'));
    const hint = /** @type {HTMLElement} */ (document.querySelector('.beacon-hint'));
    return {
      // Present for the alert to announce, and taking no room.
      announces: (word.textContent ?? '').length > 0,
      wordInk: Math.round(word.getBoundingClientRect().width),
      hintFromBottom: Math.round(innerHeight - hint.getBoundingClientRect().bottom),
      middleClear: [...document.querySelectorAll('.beacon *')].every((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 2 || r.top > innerHeight * 0.75 || r.bottom < innerHeight * 0.25;
      }),
    };
  });
  expect(shape.announces).toBe(true);
  expect(shape.wordInk).toBeLessThan(3);
  expect(shape.hintFromBottom).toBeLessThan(60);
  expect(shape.middleClear).toBe(true);

  // The attention beacon is the opposite case: its word is the point, and it is the
  // listener's own.
  await page.locator('.beacon').click({ position: { x: 4, y: 4 } });
  await page.locator('[data-button="attention"]').click();
  const word = page.locator('.beacon-word');
  await expect(word).toHaveAttribute('lang', 'zh-Hans');
  expect(await word.evaluate((el) => Math.round(el.getBoundingClientRect().width)))
    .toBeGreaterThan(100);
});
