// Drives the demo page in a real browser: the desktop opens calm (one VS Code window and one terminal, the rest in the
// dock, nothing new for the first seconds), the review shortcut brings its chat's window forward maximized with that
// chat showing, the same chat's dropdown row sends it back, each top-bar part opens its tab, History's search, Show
// context and arrows work, a Codex chat's `agent-bar send` reaches the QC chat at its next turn, and the tour starts,
// follows the visitor and ends; Pipsqueak and its panel step with Back and Next, glide as one unit, drag aside (mouse,
// touch, keyboard) and snap back, and under reduced motion nothing moves. Run with the site served on a port:
//   PLAYWRIGHT=<path to playwright> node agent-bar/tests/demo.browser.mjs [http://127.0.0.1:8717] [chromium|webkit]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sampleGlide } from '../../shared/tour-guide/glide-check.mjs';

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
  await page.waitForFunction(() => window.AgentBarDemo);
  await page.evaluate(() => window.AgentBarDemo.pause());
  return page;
}
const state = (page) => page.evaluate(() => window.AgentBarDemo.state());
const win = (s, id) => s.windows.find((w) => w.id === id);

try {
  const page = await open({ width: 1440, height: 900 });
  let s = await state(page);
  // A calm opening: the focused VS Code window and one terminal, side by side; the other windows wait in the dock.
  assert.deepEqual(s.windows.filter((w) => !w.minimized).map((w) => w.id).sort(), ['terminal:4410', 'w-figures']);
  assert.equal(s.focus, 'w-figures');
  const [a, b] = await Promise.all(['w-figures', 'terminal:4410'].map((id) => page.locator(`section[data-win="${id}"]`).boundingBox()));
  assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x, 'the two open windows do not overlap');
  assert.equal(await page.locator('.dock-item[data-kind="terminal"] .dots i').count(), 3, 'the dock still counts every terminal');
  const quiet = await page.evaluate(() => window.AgentBarDemo.tick(10));
  assert.equal(quiet.notifications.length, 0, 'nothing new in the first ten seconds');
  assert.deepEqual(quiet.shortcuts.map((g) => g.project), s.shortcuts.map((g) => g.project));
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
  assert.equal(win(s, 'w-sampler').minimized, true, 'back to the dock, where it was');
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

  // The tour panel: Back and Next, a glide between steps, dragging by mouse and keyboard, Snap back, and the last step.
  const tourPage = await open({ width: 1440, height: 900 });
  const tour = () => tourPage.evaluate(() => window.AgentBarDemo.tour.state());
  const bubble = tourPage.locator('.tour-bubble');
  const where = async () => { const r = await bubble.boundingBox(); return [Math.round(r.x), Math.round(r.y)]; };
  const settle = () => tourPage.waitForFunction(() => !document.querySelector('.tour-unit').getAnimations({ subtree: true }).length);
  await tourPage.evaluate(() => window.AgentBarDemo.tour.start());
  await bubble.waitFor();
  await settle();
  assert.equal((await tour()).pose, 'wave', 'Pipsqueak waves hello');
  assert.equal(await tourPage.locator('[data-tour="back"]').isDisabled(), true, 'no Back on the first step');
  const first = await where();
  const dogAt0 = await tourPage.locator('.tour-guide').boundingBox();
  // Next: Pipsqueak and the panel glide as one unit, along one path without jumps, to the review button.
  const glide = await sampleGlide(tourPage, '.tour-guide', '.tour-bubble', () => tourPage.locator('[data-tour="next"]').click());
  assert.ok(glide.frames > 10 && glide.distance > 200, `a real move (${glide.frames} frames, ${Math.round(glide.distance)} px)`);
  assert.ok(glide.spread <= 3, `the panel keeps its place beside Pipsqueak (drifts ${glide.spread.toFixed(1)} px)`);
  assert.ok(glide.monotonic, 'one path, without doubling back');
  assert.ok(glide.largest <= 0.1 * glide.distance + 2, `no jumps (${glide.largest.toFixed(1)} px of ${Math.round(glide.distance)} in one frame)`);
  await settle();
  const near = (a, b) => a.x < b.x + b.width + 12 && b.x < a.x + a.width + 12 && a.y < b.y + b.height + 12 && b.y < a.y + a.height + 12;
  const dogAt = await tourPage.locator('.tour-guide').boundingBox();
  assert.deepEqual([Math.round(dogAt.x), Math.round(dogAt.y)], [Math.round(glide.end.x), Math.round(glide.end.y)], 'it stops where the glide ended');
  assert.ok(near(dogAt, await tourPage.locator('.tracker-quick [data-act="shortcut"][data-key^="claude:5b1c"]').boundingBox()), 'beside the review button');
  assert.equal((await tour()).step, 1);
  assert.equal((await tour()).pose, 'point', 'a step that waits for the visitor points');
  assert.notDeepEqual(await where(), first, 'the panel moved to the next step');
  const glideEnd = await where();
  await tourPage.locator('[data-tour="back"]').click();
  assert.equal((await tour()).step, 0);
  await tourPage.waitForFunction(() => document.querySelector('.tour-unit').getAnimations().length > 0);
  await settle();
  assert.deepEqual(await where(), first, 'Back returns the unit to the first step');
  // Dragged by its header, it stays where it was put for the following steps.
  const head = await tourPage.locator('.tour-panel-head').boundingBox();
  await tourPage.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
  await tourPage.mouse.down();
  await tourPage.mouse.move(head.x + head.width / 2 + 400, head.y + head.height / 2 + 250, { steps: 6 });
  await tourPage.mouse.up();
  const dropped = await where();
  assert.ok(Math.abs(dropped[0] - first[0] - 400) <= 2 && Math.abs(dropped[1] - first[1] - 250) <= 2, `dragged to ${dropped} from ${first}`);
  const carried = await tourPage.locator('.tour-guide').boundingBox();
  assert.ok(Math.abs(carried.x - dogAt0.x - 400) <= 2 && Math.abs(carried.y - dogAt0.y - 250) <= 2, 'Pipsqueak moves with the panel');
  assert.equal((await tour()).pinned, true);
  await tourPage.locator('[data-tour="next"]').click();
  await settle();
  assert.equal((await tour()).step, 1);
  assert.deepEqual(await where(), dropped, 'it stays put on the next step');
  // The grip's arrow keys move it, and leave the step alone.
  await tourPage.locator('.tour-grip').focus();
  await tourPage.keyboard.press('ArrowLeft');
  await tourPage.keyboard.press('Shift+ArrowUp');
  assert.deepEqual(await where(), [dropped[0] - 16, dropped[1] - 64]);
  assert.equal((await tour()).step, 1);
  // Snap back returns the whole unit to the review button, the panel where it was beside Pipsqueak.
  await tourPage.locator('.tour-snap').click();
  await settle();
  assert.equal((await tour()).pinned, false);
  assert.equal(await tourPage.locator('.tour-snap').isHidden(), true);
  assert.deepEqual(await where(), glideEnd, 'the panel is back in its place');
  assert.ok(near(await tourPage.locator('.tour-guide').boundingBox(), await tourPage.locator('.tracker-quick [data-act="shortcut"][data-key^="claude:5b1c"]').boundingBox()), 'Pipsqueak is back at the review button');
  // The last step: Next is off; Replay and Done take over.
  for (let i = 0; i < 12; i++) await tourPage.evaluate(() => window.AgentBarDemo.tour.next());
  await tourPage.waitForFunction(() => window.AgentBarDemo.tour.state().step === 11);
  await settle();
  assert.equal(await tourPage.locator('[data-tour="next"]').isDisabled(), true);
  assert.equal(await tourPage.locator('[data-tour="end"]').innerText(), 'Done');
  await tourPage.locator('[data-tour="replay"]').click();
  assert.equal((await tour()).step, 0);
  await tourPage.locator('[data-tour="end"]').click();
  await bubble.waitFor({ state: 'hidden' });
  assert.equal((await tour()).active, false);
  // Under reduced motion the panel and Pipsqueak are placed at once.
  await tourPage.emulateMedia({ reducedMotion: 'reduce' });
  await tourPage.keyboard.press('t');
  await bubble.waitFor();
  await tourPage.keyboard.press('ArrowRight');
  assert.equal((await tour()).step, 1);
  // Once Pipsqueak is at the review button, nothing is still on its way there: the unit jumped.
  await tourPage.waitForFunction(() => {
    const d = document.querySelector('.tour-guide').getBoundingClientRect(), t = document.querySelector('.tracker-quick [data-act="shortcut"][data-key^="claude:5b1c"]').getBoundingClientRect();
    return d.left < t.right + 12 && t.left < d.right + 12 && d.top < t.bottom + 12 && t.top < d.bottom + 12;
  });
  assert.equal(await tourPage.evaluate(() => document.getAnimations().length), 0, 'nothing animates under reduced motion');
  await tourPage.keyboard.press('Escape');
  assert.equal(await bubble.isHidden(), true, 'ends at once under reduced motion');
  await tourPage.close();

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
  // The tour panel fits the phone and drags by touch.
  await phone.evaluate(() => { window.AgentBarDemo.open(null); window.AgentBarDemo.tour.start(); });
  const panel = phone.locator('.tour-bubble');
  await panel.waitFor();
  await phone.waitForFunction(() => !document.querySelector('.tour-unit').getAnimations({ subtree: true }).length);
  const panelAt = await panel.boundingBox();
  assert.ok(panelAt.x >= 0 && panelAt.x + panelAt.width <= 390, 'the panel fits the phone');
  if (engine === 'chromium') {
    const grip = await phone.locator('.tour-panel-head').boundingBox();
    const cdp = await phone.context().newCDPSession(phone);
    const at = (dy) => [{ x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 + dy }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (const dy of [20, 60, 120]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(dy) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await panel.boundingBox();
    assert.ok(Math.abs(after.y - panelAt.y - 120) <= 2, `a touch drag moved the panel (${panelAt.y} → ${after.y})`);
    assert.equal((await state(phone)).tour.pinned, true);
  }
  await phone.close();
  assert.deepEqual(errors, []);
  console.log(`agent-bar demo: ${engine} ok`);
} finally {
  await browser.close();
}
