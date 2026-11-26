// Drives the demo page in a real browser: the review shortcut brings its chat's window forward maximized with that
// chat showing, the same chat's dropdown row sends it back, each top-bar part opens its tab, History's search,
// Show context and arrows work, a Codex chat's `agent-bar send` reaches the QC chat at its next turn, and the tour
// starts, follows the visitor and ends. Run with the site served on a port:
//   PLAYWRIGHT=<path to playwright> node agent-bar/tests/demo.browser.mjs [http://127.0.0.1:8717] [chromium|webkit]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8717';
const engine = process.argv[3] || 'chromium';
const browser = await playwright[engine].launch();
const errors = [];

async function open(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/agent-bar/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.AgentBarDemo.pause());
  return page;
}
const state = (page) => page.evaluate(() => window.AgentBarDemo.state());
const win = (s, id) => s.windows.find((w) => w.id === id);

try {
  const page = await open({ width: 1440, height: 900 });
  let s = await state(page);
  assert.deepEqual(s.providers.claude, { open: 5, review: 3 });
  assert.deepEqual(s.shortcuts.map((g) => g.project), ['paper-figures', 'sampler-study', 'rnaseq-pipeline']);
  assert.equal(await page.locator('.tracker-quick-group .tracker-quick-bubble').count(), 2, 'paper-figures has two numbered bubbles');

  // A review shortcut: that chat's window comes forward, maximized, showing that chat, and its review clears.
  const tune = s.chats.find((c) => c.title === 'Tune the step-size adaptation');
  await page.locator(`.tracker-quick [data-key="${tune.key}"]`).click();
  s = await state(page);
  assert.equal(s.focus, 'w-sampler');
  assert.equal(win(s, 'w-sampler').maximized, true);
  assert.equal(win(s, 'w-sampler').shown, tune.key);
  assert.deepEqual(s.chats.find((c) => c.key === tune.key).unread, []);
  assert.equal(await page.locator('[data-win="w-sampler"] .code-tab.active').innerText().then((t) => t.includes('Tune the step-size')), true);

  // The same chat again in the dropdown sends the window back where it was.
  await page.locator('[data-part="conversations"]').first().click();
  const row = page.locator(`.tracker-conversation[data-key="${tune.key}"]`);
  assert.match(await row.innerText(), /click to return/);
  await row.click();
  s = await state(page);
  assert.equal(win(s, 'w-sampler').maximized, false);
  assert.equal(s.dropdown, null);

  // A bubble opens one chat of a project with several.
  await page.locator('.tracker-quick-group .tracker-quick-bubble').nth(1).click();
  s = await state(page);
  assert.equal(s.focus, 'w-figures');
  assert.equal(s.chats.find((c) => c.key === win(s, 'w-figures').shown).title, 'Check the reference formatting');

  // Each top-bar part opens its own tab; the same part again closes the dropdown.
  for (const [part, view] of [['quota', 'quota'], ['queues', 'queues'], ['messages', 'messages'], ['tickets', 'tickets'], ['conversations', 'conversations']]) {
    await page.locator(`[data-part="${part}"]`).first().click();
    assert.equal((await state(page)).dropdown?.view, view, `${part} opens ${view}`);
  }
  await page.locator('[data-part="conversations"]').first().click();
  assert.equal((await state(page)).dropdown, null);

  // All nine tabs render, by mouse and by arrow keys.
  await page.locator('[data-part="conversations"]').first().click();
  for (const name of ['Queues', 'Cluster', 'Git', 'Messages', 'Tickets', 'History', 'Quota', 'Info', 'Chats']) {
    await page.getByRole('tab', { name, exact: true }).click();
    assert.ok(await page.locator('#tracker-panel').innerText().then((t) => t.trim().length > 20), `${name} has rows`);
  }
  await page.getByRole('tab', { name: 'Chats', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).dropdown.view, 'queues');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).dropdown, null);

  // History: search, Show context, then the arrows.
  await page.locator('[data-part="conversations"]').first().click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.locator('.tracker-search').fill('warmup step');
  const context = page.locator('[data-act="context"]').first();
  await context.click();
  const nav = page.locator('.tracker-history-nav');
  assert.match(await nav.innerText(), /Message 1 of \d+ · Hit 1 of \d+/);
  await page.locator('[data-act="hit"][data-step="1"]').click();
  assert.match(await nav.innerText(), /Hit 2 of|Message 2 of/);
  await page.keyboard.press('Escape');

  // Messages: approving the Codex chat runs `agent-bar send`; the QC chat reads it at its next turn.
  s = await state(page);
  const retry = s.chats.find((c) => c.title === 'Add retries to the alignment step');
  const qc = s.chats.find((c) => c.title === 'Summarize the QC failures');
  const before = qc.letters;
  await page.locator(`.tracker-quick [data-key="${retry.key}"]`).click();
  await page.locator(`[data-win="${retry.window}"] .suggest[data-text="Allow"]`).click();
  await page.evaluate(() => window.AgentBarDemo.tick(12));
  s = await state(page);
  assert.equal(s.chats.find((c) => c.key === qc.key).letters, before + 1, 'the note arrived unread');
  assert.match(await page.locator(`[data-win="${retry.window}"] .chat-log`).innerText(), /agent-bar send/);
  // The QC chat's row in the dropdown brings its terminal forward (Chats keeps History's search, so clear it).
  await page.locator('[data-part="conversations"]').first().click();
  await page.locator('.tracker-search').fill('');
  await page.locator(`.tracker-conversation[data-key="${qc.key}"]`).click();
  await page.locator(`[data-win="${qc.window}"] .suggest`).first().click();
  await page.evaluate(() => window.AgentBarDemo.tick(4));
  assert.match(await page.locator(`[data-win="${qc.window}"] .chat-log`).innerText(), /\[agent-bar\] 2 unread messages/);
  await page.evaluate(() => window.AgentBarDemo.tick(6));
  assert.equal((await state(page)).chats.find((c) => c.key === qc.key).letters, 0, 'the chat read its mail');

  // The tour: starts, cheers when the visitor does the step, and ends with Escape.
  await page.keyboard.press('t');
  await page.waitForTimeout(100);
  assert.equal((await state(page)).tour.step, 0);
  await page.locator('[data-part="conversations"]').first().click();
  assert.equal((await state(page)).tour.tried, true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).tour.active, false);
  await page.close();

  // A phone: the stacked view keeps the bar, the front window and the dropdown usable by touch.
  const phone = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: engine === 'chromium' });
  assert.equal((await state(phone)).phone, true);
  const width = await phone.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 390, `no horizontal page scroll (${width})`);
  await phone.locator(`.tracker-quick [data-key="${tune.key}"]`).tap();
  assert.equal((await state(phone)).focus, 'w-sampler');
  await phone.locator('section[data-win="w-sampler"]').waitFor({ state: 'visible', timeout: 3000 });
  await phone.locator('[data-part="queues"]').tap();
  assert.equal((await state(phone)).dropdown.view, 'queues');
  await phone.close();
  assert.deepEqual(errors, []);
  console.log(`agent-bar demo: ${engine} ok`);
} finally {
  await browser.close();
}
