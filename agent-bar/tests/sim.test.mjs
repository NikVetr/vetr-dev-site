// The simulation without a page: the fixture's top-bar counts, review shortcuts, bringing a chat's window forward and
// sending it back as extension.js `_activate` does, messages read at the recipient's next turn, History's search, and
// queues finishing. Run in agent-bar/: node --test
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSim, matchSpans } from '../js/sim.js';

function world() {
  let t = 1_800_000_000;
  const sim = createSim({ now: () => t });
  const run = (n) => { for (let i = 0; i < n; i++) { t += 1; sim.tick(); } };
  const key = (name) => sim.state.rows.find((r) => r.name === name).key;
  return { sim, run, key };
}

test('the top bar starts as the reference captures show it', () => {
  const { sim } = world();
  const snap = sim.snapshot();
  assert.deepEqual(snap.providers, { claude: { open: 5, review: 3 }, codex: { open: 3, review: 1 }, copilot: { open: 1, review: 0 }, antigravity: { open: 1, review: 0 } });
  assert.deepEqual([snap.counts.working, snap.counts.waiting], [2, 1]);
  assert.equal(snap.stranded.length, 2, 'two chats have mail that waits for a prompt');
  assert.equal(snap.readyTickets.length, 2);
  assert.deepEqual([snap.queues.done, snap.queues.total], [0, 3]);
  assert.deepEqual(snap.quick.map((g) => [g[0].project, g.length]), [['paper-figures', 2], ['sampler-study', 1], ['rnaseq-pipeline', 1]]);
  assert.deepEqual([Math.floor(sim.limitOf('claude', 'weekly').left), Math.floor(sim.limitOf('codex', 'weekly').left)], [64, 21]);
});

test('a review shortcut brings the chat forward maximized; its row clicked again sends the window back', () => {
  const { sim, key } = world();
  const before = structuredClone(sim.state.windows.find((w) => w.id === 'w-sampler'));
  const result = sim.activate({ key: key('tune'), window: 'w-sampler' }, 'focus');
  assert.equal(result.action, 'focused');
  const win = sim.state.windows.find((w) => w.id === 'w-sampler');
  assert.equal(win.maximized, true);
  assert.equal(win.shown, key('tune'));
  assert.equal(sim.state.focus, 'w-sampler');
  assert.deepEqual(sim.unread(sim.byKey(key('tune'))), [], 'opening it clears its review');
  // Another chat in the same window comes forward in the same window, which stays borrowed.
  assert.equal(sim.activate({ key: key('release'), window: 'w-sampler' }, 'toggle', 'w-sampler').action, 'focused');
  assert.equal(sim.activate({ key: key('release'), window: 'w-sampler' }, 'toggle', 'w-sampler').action, 'returned');
  assert.equal(win.maximized, before.maximized);
  assert.deepEqual(win.rect, before.rect);
  // A focus click never sends back; a toggle from an unfocused window brings forward again.
  sim.activate({ key: key('tune'), window: 'w-sampler' }, 'focus');
  assert.equal(sim.activate({ key: key('tune'), window: 'w-sampler' }, 'focus').action, 'focused');
  assert.equal(sim.activate({ key: key('tune'), window: 'w-sampler' }, 'toggle', 'w-figures').action, 'focused');
  sim.setting('focusedClick', 'stay');
  assert.equal(sim.activate({ key: key('tune'), window: 'w-sampler' }, 'toggle', 'w-sampler').action, 'focused');
});

test('agent-bar send reaches the recipient at its next turn, unless waking is on', () => {
  const { sim, run, key } = world();
  assert.equal(sim.prompt(key('retry'), 'Allow').ok, true);
  run(10);
  const qc = key('qc');
  assert.equal(sim.unreadFor(qc).length, 2);
  assert.ok(sim.stranded().includes(qc));
  sim.prompt(qc, sim.byKey(qc).prompts[0]);
  run(2);
  assert.match(sim.byKey(qc).log.find((l) => l.kind === 'note').text, /2 unread messages/);
  run(4);
  assert.equal(sim.unreadFor(qc).length, 0);
  assert.ok(!sim.stranded().includes(qc));
  // With waking on, a note to an idle Claude chat starts its turn.
  sim.setting('wake', true);
  sim.send(key('retry'), key('release'), 'A note');
  assert.equal(sim.byKey(key('release')).state, 'working');
});

test('History search needs every word to start a word in one message', () => {
  const { sim } = world();
  assert.deepEqual(matchSpans('the warmup step size', ['warm', 'step']), [[4, 10], [11, 15]]);
  assert.equal(matchSpans('the warmup', ['armup']), null);
  const titles = sim.search('warmup step').map((h) => h.chat.title);
  assert.ok(titles.includes('Choose the warmup schedule'));
  assert.ok(sim.search('repo:paper-figures legend').every((h) => h.chat.project === 'paper-figures'));
});

test('queues finish, count in Q, and bring their project up for review', () => {
  const { sim, run, key } = world();
  run(90);
  assert.equal(sim.queueCounts().projects['rnaseq-pipeline'].done, 1);
  assert.ok(sim.unread(sim.byKey(key('qc'))).includes('Queues finished'));
  sim.clearQueues('rnaseq-pipeline');
  assert.equal(sim.queueCounts().projects['rnaseq-pipeline'], undefined);
  assert.ok(sim.state.notifications.some((n) => n.body.startsWith('Queues finished')));
});

test('a scheduled message arrives as the user’s request when its time comes', () => {
  const { sim, run, key } = world();
  const release = sim.byKey(key('release'));
  run(92);
  assert.equal(release.log.find((l) => l.kind === 'scheduled')?.text, 'Check whether the step-size pull request has merged');
  run(8);
  assert.ok(sim.unread(release).includes('Reply finished'));
  assert.equal(sim.state.tickets.find((t) => t.id === 6).status, 'done');
});
