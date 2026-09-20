// The conversation board's contracts: what a board may say, what it resolves to,
// and where every tap goes.
//
// The navigation table in the specification is transcribed here as fixtures rather
// than as a browser script. Every row of it is a statement about state, and a
// reducer can be asked all of them in a millisecond; the browser tests in
// `tests/conversation.spec.js` then only have to prove that the DOM dispatches the
// actions this file already pins down.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateBoard, phrasesOf, resolvePhrase, missingPhrases,
  reduce, openBoard, currentNode, resolveValue,
} from '../core/conversation.js';
import { loadCorpus } from '../core/pack.js';

/** A board with one submenu, one reply set, and a term indexed into two nodes. */
const board = /** @type {any} */ ({
  schemaVersion: 1,
  id: 'fixture',
  titleKey: 'boards.fixture.title',
  rootNodeId: 'main',
  nodes: {
    main: {
      buttons: [
        { id: 'stop', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.stop' } },
        { id: 'hurts', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.hurts' }, replySetId: 'ok' },
        { id: 'where', kind: 'submenu', nodeId: 'areas' },
        { id: 'thanks', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.thanks' } },
      ],
    },
    areas: {
      buttons: [
        { id: 'back-area', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.back' } },
        // The same term as the root's `thanks`, reached from a second subsection.
        { id: 'thanks', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.thanks' } },
      ],
    },
  },
  replySets: {
    ok: {
      buttons: [
        { id: 'yes', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.yes' } },
        { id: 'dunno', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.dunno' } },
      ],
    },
  },
});

/** A corpus stub: four concepts, two languages, one of them scoped away. */
const ctx = /** @type {any} */ ({
  corpus: {
    concepts: {
      'a.stop': { concept_id: 'a.stop', applies_to: '' },
      'a.hurts': { concept_id: 'a.hurts', applies_to: '' },
      'a.thanks': { concept_id: 'a.thanks', applies_to: '' },
      'a.back': { concept_id: 'a.back', applies_to: '' },
      'a.yes': { concept_id: 'a.yes', applies_to: '' },
      'a.dunno': { concept_id: 'a.dunno', applies_to: '' },
      'a.elsewhere': { concept_id: 'a.elsewhere', applies_to: 'ja' },
    },
  },
  listenerRows: {
    'a.stop': { text: '请停下', confidence: '2', provenance: 'fixture' },
    'a.hurts': { text: '很痛', confidence: '2', provenance: 'fixture' },
    'a.thanks': { text: '谢谢', confidence: '2', provenance: 'fixture' },
    'a.back': { text: '背部', confidence: '2', provenance: 'fixture' },
    'a.yes': { text: '好的', confidence: '2', provenance: 'fixture' },
    'a.dunno': { text: '我不确定', confidence: '2', provenance: 'fixture' },
    'a.elsewhere': { text: 'x', confidence: '2', provenance: 'fixture' },
  },
  ownerRows: {
    'a.stop': { text: 'Please stop' },
    'a.hurts': { text: 'That hurts' },
    'a.thanks': { text: 'Thank you' },
    'a.back': { text: 'my back' },
    'a.yes': { text: 'Yes, that is fine' },
    'a.dunno': { text: "I'm not sure" },
    'a.elsewhere': { text: 'x' },
  },
  listener: 'zh-Hans',
  owner: 'en',
  listenerDir: 'ltr',
  ownerDir: 'ltr',
});

test('a sound board validates, and every way of being unsound is reported', () => {
  assert.deepEqual(validateBoard(board), []);

  const broken = structuredClone(board);
  broken.nodes.main.buttons[2].nodeId = 'nowhere';
  broken.nodes.orphan = { buttons: [{ id: 'x', kind: 'message', phraseRef: { kind: 'corpus', id: 'a.stop' } }] };
  broken.nodes.main.buttons.push({ id: 'run', kind: 'action', url: 'https://example.com' });
  const problems = validateBoard(broken);
  // All three at once, not the first: an author fixing three things wants three.
  assert.ok(problems.some((p) => p.includes('unknown node nowhere')), problems.join('; '));
  assert.ok(problems.some((p) => p.includes('orphan: not reachable')), problems.join('; '));
  // The kind is an enum, so a board file can never carry a URL or an expression.
  assert.ok(problems.some((p) => p.includes('neither message nor submenu')), problems.join('; '));
});

test('a term indexed into two subsections is one dependency, not two', () => {
  // `a.thanks` sits on the root grid and again in the body-area submenu, which is
  // the intended way to reach an existing term from a second context. The board
  // depends on six phrases, not seven.
  const ids = phrasesOf(board).map((r) => r.id);
  assert.equal(ids.length, new Set(ids).size, `duplicated: ${ids.join(', ')}`);
  assert.deepEqual(ids.sort(), ['a.back', 'a.dunno', 'a.hurts', 'a.stop', 'a.thanks', 'a.yes']);
});

test('a phrase resolves to both languages, with the listener text first', () => {
  const got = resolvePhrase({ kind: 'corpus', id: 'a.stop' }, ctx);
  assert.equal(got?.listener.text, '请停下');
  assert.equal(got?.listener.lang, 'zh-Hans');
  assert.equal(got?.owner.text, 'Please stop');
  assert.equal(got?.owner.lang, 'en');
  assert.equal(got?.custom, false);
  assert.equal(got?.confidence, 2);
});

test('a missing translation is unavailable, never quietly English', () => {
  // The failure the specification names twice. A board showing the owner's own
  // language to the listener has not degraded gracefully.
  const thin = { ...ctx, listenerRows: { ...ctx.listenerRows, 'a.stop': { text: '' } } };
  assert.equal(resolvePhrase({ kind: 'corpus', id: 'a.stop' }, thin), null);
  assert.deepEqual(missingPhrases(board, thin), ['a.stop']);
  // ...and a complete board reports nothing missing, so a caller can open it.
  assert.deepEqual(missingPhrases(board, ctx), []);
});

test('a concept scoped away from this listener is not reachable through a board', () => {
  // `appliesTo` is the sheet's own helper, so scope means the same thing in both
  // places -- a board must not resolve a concept the corpus says is not for this
  // language just because a gloss row happens to exist.
  assert.equal(resolvePhrase({ kind: 'corpus', id: 'a.elsewhere' }, ctx), null);
});

test("the owner's own phrase carries its text and admits it is unreviewed", () => {
  const withCustom = { ...ctx, custom: { mine: { owner: 'No peanuts', listener: '不要花生' } } };
  const got = resolvePhrase({ kind: 'custom', id: 'mine' }, withCustom);
  assert.equal(got?.listener.text, '不要花生');
  assert.equal(got?.custom, true);
  // Zero, not two: nobody reviewed it, and the board must not imply otherwise.
  assert.equal(got?.confidence, 0);
  // A half-written custom phrase is unavailable rather than half-shown.
  assert.equal(resolvePhrase({ kind: 'custom', id: 'mine' },
    { ...ctx, custom: { mine: { owner: 'No peanuts', listener: '' } } }), null);
});

test('every row of the navigation table', () => {
  let s = openBoard(board, true);
  assert.equal(s.view, 'grid');
  assert.deepEqual(s.path, ['main']);

  // Owner grid -> tap a message -> the listener's message.
  s = reduce(s, { type: 'open', buttonId: 'stop', kind: 'message' });
  assert.equal(s.view, 'message');
  assert.equal(s.buttonId, 'stop');

  // **The opening tap cannot also dismiss it.** A second `open` arriving in the
  // same breath -- the event that opened the message reaching a global listener --
  // is a no-op rather than a transition, which is B03 stated as a property.
  assert.deepEqual(reduce(s, { type: 'open', buttonId: 'stop', kind: 'message' }), s);

  // Message -> tap anywhere -> the grid it came from.
  s = reduce(s, { type: 'dismiss' });
  assert.equal(s.view, 'grid');
  assert.equal(s.buttonId, null);
  assert.deepEqual(s.path, ['main']);

  // Owner grid -> tap a submenu -> the child grid, and the parent is remembered.
  s = reduce(s, { type: 'open', buttonId: 'where', kind: 'submenu', nodeId: 'areas' });
  assert.deepEqual(s.path, ['main', 'areas']);
  assert.equal(currentNode(board, s), board.nodes.areas);

  // **A message opened from a submenu returns to that submenu**, not to the root.
  // The one hard navigation requirement, and the reason `path` is a stack.
  s = reduce(s, { type: 'open', buttonId: 'back-area', kind: 'message' });
  s = reduce(s, { type: 'dismiss' });
  assert.deepEqual(s.path, ['main', 'areas'], 'a dismissal must land on the originating grid');

  // Child grid -> the grid-level parent control -> back up. Not available from a
  // message: those have no Back control by design.
  s = reduce(s, { type: 'up' });
  assert.deepEqual(s.path, ['main']);
  // ...and never off the root.
  assert.deepEqual(reduce(s, { type: 'up' }), s);

  // Reply flow: message -> Reply -> answers -> the owner's reading of the answer.
  s = reduce(s, { type: 'open', buttonId: 'hurts', kind: 'message' });
  s = reduce(s, { type: 'reply' });
  assert.equal(s.view, 'reply');
  // Cancel is "I have not answered", so it returns to the question and not to the grid.
  assert.equal(reduce(s, { type: 'cancelReply' }).view, 'message');
  s = reduce(s, { type: 'answer', answerId: 'dunno' });
  assert.equal(s.view, 'answer');
  assert.equal(s.answerId, 'dunno');
  // An answer dismisses to the owner's originating grid, completing the exchange
  // rather than unwinding back through the question.
  s = reduce(s, { type: 'dismiss' });
  assert.equal(s.view, 'grid');
  assert.deepEqual(s.path, ['main']);
  assert.equal(s.answerId, null);
});

test('show-only means the Reply action does nothing at all', () => {
  let s = openBoard(board, false);
  s = reduce(s, { type: 'open', buttonId: 'hurts', kind: 'message' });
  // Not merely a hidden control: the transition itself is unavailable, so a
  // keyboard or an assistive technology cannot reach a view the session has turned
  // off.
  assert.deepEqual(reduce(s, { type: 'reply' }), s);
});

test('a board never reaches the solver, the PDF library or fontkit', async () => {
  // C2's requirement, asked of the import graph rather than of a browser: the
  // resolver has to stay a corpus join. `core/pack.js` is data-only today and this
  // is what keeps it that way.
  /** @type {Set<string>} */ const seen = new Set();
  const walk = async (/** @type {string} */ file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      await walk(new URL(m[1], new URL(file, import.meta.url)).pathname);
    }
  };
  await walk(new URL('../core/conversation.js', import.meta.url).pathname);
  // The walk has to have walked. An empty or one-file `seen` would pass the
  // assertion below while proving nothing, which is how a guard test rots.
  assert.ok([...seen].some((f) => f.endsWith('core/pack.js')),
    `the import walk found ${seen.size} files and missed core/pack.js`);
  const heavy = [...seen].filter((f) => /solve|fontkit|pdf|measure|sheet\.js|render\//.test(f));
  assert.deepEqual(heavy, [], `conversation.js pulls in ${heavy.join(', ')}`);
});

test('the real corpus can answer a board, with no sheet in sight', async () => {
  // The three terms the spa board indexes rather than copies. This is the check
  // that the reuse decision actually holds against the shipped data.
  const corpus = await loadCorpus((rel) => readFile(rel, 'utf8'));
  for (const id of ['social-basics.thank-you', 'emergency-medical.it-hurts-here',
    'hotel-requests.another-towel-please']) {
    assert.ok(corpus.concepts[id], `${id} is not in the corpus, so it cannot be indexed`);
  }
});

// --- answers that are a quantity ---------------------------------------------

test('a structured answer is said to both people, from one value', () => {
  // No stored text, so the two sides cannot disagree, and no language needs a row.
  const said = resolveValue({ amount: 15, unit: 'minute' }, ctx);
  assert.equal(said?.listener.text, '15分钟');
  assert.equal(said?.owner.text, '15 minutes');
  assert.equal(said?.listener.lang, 'zh-Hans');
  assert.equal(said?.provenance, 'cldr');
});

test('a language with no formatter gets no quantity, rather than an English one', () => {
  // `Intl` falls back to the runtime default for a tag it does not know, which would
  // put "15 minutes" on a Klingon screen.
  assert.equal(resolveValue({ amount: 15, unit: 'minute' }, { ...ctx, listener: 'tlh' }), null);
  assert.equal(resolveValue({ amount: 15, unit: 'minute' }, { ...ctx, owner: 'qya' }), null);
});

test('a board may not carry a quantity that is not one', () => {
  const bad = structuredClone(board);
  bad.replySets.ok.buttons.push({ id: 'v1', kind: 'value', value: { amount: 0, unit: 'minute' } });
  bad.replySets.ok.buttons.push({ id: 'v2', kind: 'value', value: { amount: 5, unit: 'fortnight' } });
  bad.replySets.ok.buttons.push({ id: 'v3', kind: 'value' });
  bad.replySets.ok.buttons.push({ id: 'e1', kind: 'entry', entry: 'parsecs' });
  const problems = validateBoard(bad);
  assert.equal(problems.filter((p) => p.includes('whole amount')).length, 3, problems.join('; '));
  assert.ok(problems.some((p) => p.includes('unknown entry parsecs')));
});

test('the keypad is reached from the answers and cancels back to them', () => {
  let s = openBoard(board, true);
  s = reduce(s, { type: 'open', buttonId: 'hurts', kind: 'message' });
  s = reduce(s, { type: 'reply' });
  s = reduce(s, { type: 'enter' });
  assert.equal(s.view, 'entry');
  // Back to the list they were just looking at, not to the question and not to the
  // grid: someone who opened the keypad by mistake wanted the answers.
  assert.equal(reduce(s, { type: 'cancelEntry' }).view, 'reply');

  s = reduce(s, { type: 'confirmEntry', value: { amount: 45, unit: 'minute' } });
  assert.equal(s.view, 'answer');
  assert.deepEqual(s.answerValue, { amount: 45, unit: 'minute' });
  // The value travels, not the text of one -- so the owner's reading of it is
  // formatted fresh in their own language.
  assert.equal(resolveValue(/** @type {any} */ (s.answerValue), ctx)?.owner.text, '45 minutes');

  // Dismissing clears it, so the next message cannot inherit the last answer.
  s = reduce(s, { type: 'dismiss' });
  assert.equal(s.view, 'grid');
  assert.equal(s.answerValue, null);
});

test('the keypad cannot be opened from anywhere but the answers', () => {
  let s = openBoard(board, true);
  assert.deepEqual(reduce(s, { type: 'enter' }), s);
  s = reduce(s, { type: 'open', buttonId: 'hurts', kind: 'message' });
  assert.deepEqual(reduce(s, { type: 'enter' }), s);
});
