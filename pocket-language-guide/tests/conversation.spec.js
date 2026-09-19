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
