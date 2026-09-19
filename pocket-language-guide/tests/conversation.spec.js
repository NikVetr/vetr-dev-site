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
