// The only copy of someone's own phrases, and the file that carries it.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPackage, readPackage, buildButtons, readButtons, PACKAGE_VERSION, MAX_PACKAGE_BYTES,
} from '../core/personal.js';

/** One written phrase, placed on one screen of one board. */
const MINE = {
  schemaVersion: 1,
  phrases: {
    p1: {
      id: 'p1', label: 'no peanuts', owner: 'No peanuts, please', listener: '请不要放花生',
      pair: 'zh-Hans__en', created: '2026-09-21T00:00:00.000Z',
    },
  },
  placements: { 'food/main': ['p1'] },
};
const KNOWN = { boards: { food: new Set(['main', 'avoid']), spa: new Set(['main']) } };
const round = (/** @type {any} */ parts, /** @type {any} */ known) => readPackage(
  JSON.stringify(buildPackage(parts)), known,
);

test('a package carries the work and not the furniture', () => {
  const made = buildPackage({
    boards: MINE, speaker: { speaker_gender: 'feminine' }, edits: { 'zh-Hans__en': { overrides: {} } },
  });
  assert.equal(made.version, PACKAGE_VERSION);
  assert.ok(made.created);
  assert.deepEqual(made.boards, MINE);
  // Column widths and dismissed banners are this device's preferences, not the
  // reader's work; carrying them to another phone would be presumptuous.
  assert.equal('studio' in made, false);
  // Nothing empty travels: a package from a reader who wrote nothing is just a stamp.
  assert.deepEqual(Object.keys(buildPackage({ boards: { schemaVersion: 1, phrases: {}, placements: {} } })),
    ['version', 'created']);
});

test('it round-trips', () => {
  const got = round({ boards: MINE, speaker: { speaker_gender: 'feminine' } }, KNOWN);
  assert.equal(got.ok, true);
  assert.equal(got.ok && got.data.boards?.phrases.p1.listener, '请不要放花生');
  assert.equal(got.ok && got.data.speaker?.speaker_gender, 'feminine');
});

test('a board this build does not have is refused, not half-imported', () => {
  // The plan's rule, and the reason `known` exists: a placement naming a screen that
  // is not here would put a phrase where nobody can reach it, and reporting that as
  // imported is worse than refusing the file.
  const gone = { ...MINE, placements: { 'nosuchboard/main': ['p1'] } };
  const got = readPackage(JSON.stringify(buildPackage({ boards: gone })), KNOWN);
  assert.equal(got.ok, false);
  assert.match(got.ok === false ? got.problems.join(' ') : '', /no board "nosuchboard"/);

  const noNode = { ...MINE, placements: { 'food/nosuchscreen': ['p1'] } };
  const second = readPackage(JSON.stringify(buildPackage({ boards: noNode })), KNOWN);
  assert.equal(second.ok, false);
  assert.match(second.ok === false ? second.problems.join(' ') : '', /no screen "nosuchscreen"/);

  // ...and without a board list it is a plain backup restore, which is allowed.
  assert.equal(readPackage(JSON.stringify(buildPackage({ boards: gone }))).ok, true);
});

test('everything wrong is reported at once, and nothing is applied', () => {
  // A half-applied import is worse than a refused one, because the reader cannot
  // tell which half -- so validation is whole-package and returns problems or a
  // value, never both.
  const bad = {
    version: PACKAGE_VERSION,
    created: 'x',
    boards: {
      schemaVersion: 1,
      phrases: {
        a: { id: 'b', owner: '', listener: 'x', pair: 'nope' },
      },
      placements: { 'food/main': ['a', 'a', 'missing'] },
    },
  };
  const got = readPackage(JSON.stringify(bad), KNOWN);
  assert.equal(got.ok, false);
  const said = got.ok === false ? got.problems.join('\n') : '';
  assert.match(said, /its own id says b/);
  // A missing label is a wrong type, not a missing sentence: drafts with an empty
  // side are legitimate and travel (tested below); a field that is not text is not.
  assert.match(said, /label is not text/);
  assert.match(said, /not a language pair/);
  assert.match(said, /the same phrase twice/);
  assert.match(said, /no phrase missing/);
});

test('a package is inert, and cannot reach past itself', () => {
  // It is JSON with sentences in it. Anything that is not text, or that is shaped to
  // touch a prototype, is a file arriving in the shape of one.
  const nasty = `{"version":${PACKAGE_VERSION},"created":"x","speaker":{"__proto__":{"admin":true}}}`;
  const got = readPackage(nasty, KNOWN);
  // `JSON.parse` does not assign `__proto__` as an own property, so this may parse
  // clean -- what matters is that nothing was polluted either way.
  assert.equal(/** @type {any} */ ({}).admin, undefined);
  if (got.ok === false) assert.match(got.problems.join(' '), /unsafe key|not text/);

  // Depth is capped, because nothing anyone typed is eight deep.
  let deep = /** @type {any} */ ('leaf');
  for (let i = 0; i < 12; i += 1) deep = { d: deep };
  const nested = readPackage(JSON.stringify({ version: PACKAGE_VERSION, created: 'x', speaker: deep }));
  assert.equal(nested.ok, false);
  assert.match(nested.ok === false ? nested.problems.join(' ') : '', /nested deeper/);
});

test('a newer package is refused rather than guessed at', () => {
  // It was written by a later build and this one cannot know what it left out.
  const got = readPackage(JSON.stringify({ version: PACKAGE_VERSION + 1, created: 'x' }));
  assert.equal(got.ok, false);
  assert.match(got.ok === false ? got.problems[0] : '', /this build reads/);
  assert.equal(readPackage('not json at all').ok, false);
  assert.equal(readPackage('[]').ok, false);
});

test('an oversized file is refused before it is parsed', () => {
  // The cap is about memory, so it is counted in bytes: one emoji is four.
  const huge = `{"version":1,"created":"x","speaker":{"a":"${'é'.repeat(MAX_PACKAGE_BYTES)}"}}`;
  const got = readPackage(huge);
  assert.equal(got.ok, false);
  assert.match(got.ok === false ? got.problems[0] : '', /over the/);
});

test('a wrong type is refused, not thrown at, and does not become an empty store', () => {
  // `boards: 123` used to read as a store with no phrases and replace the reader's own.
  const number = readPackage(JSON.stringify({ version: PACKAGE_VERSION, created: 'x', boards: 123 }));
  assert.equal(number.ok, false);
  assert.ok(!number.ok && number.problems.some((p) => p.startsWith('boards:')));
  // A numeric owner reached `.trim()` and threw out of the import handler.
  const owner = readPackage(JSON.stringify({
    version: PACKAGE_VERSION, created: 'x',
    boards: { schemaVersion: 1, phrases: { p1: { ...MINE.phrases.p1, owner: 5 } }, placements: {} },
  }));
  assert.equal(owner.ok, false);
  assert.ok(!owner.ok && owner.problems.includes('phrase p1: owner is not text'));
  // Speaker answers and edits are checked the same way.
  const speaker = readPackage(JSON.stringify({ version: PACKAGE_VERSION, created: 'x', speaker: { speaker_gender: 1 } }));
  assert.ok(!speaker.ok && speaker.problems.includes('speaker speaker_gender: not text'));
  const edits = readPackage(JSON.stringify({ version: PACKAGE_VERSION, created: 'x', edits: { 'zh-Hans__en': 'no' } }));
  assert.ok(!edits.ok && edits.problems.includes('edits zh-Hans__en: not a set of edits'));
});

test('a half-written phrase travels, and arrives still unfinished', () => {
  // A draft is a legitimate saved state on the device that wrote it, and refusing
  // it refused the whole copy for one unfinished line. It goes through whole; the
  // board refuses to *show* it until both sides are there, which is the right gate.
  const draft = { ...MINE, phrases: { p1: { ...MINE.phrases.p1, listener: '' } } };
  const got = round({ boards: draft }, KNOWN);
  assert.equal(got.ok, true);
  assert.equal(got.ok && got.data.boards?.phrases.p1.listener, '');
});

/**
 * A screen of the reader's own holding one phrase, as a backup would carry it.
 * @type {import('../ui/board-store.js').BoardPersonal}
 */
const SCREENED = {
  schemaVersion: 1,
  phrases: {
    s1: { id: 's1', label: 'Allergies', owner: '', listener: '', pair: 'zh-Hans__en', created: 'x', screen: /** @type {true} */ (true) },
    p1: MINE.phrases.p1,
  },
  placements: { 'food/main': ['s1'], 'food/s1': ['p1'] },
};

test('a backup may place buttons on a screen of the reader\'s own, and on no other unknown one', () => {
  assert.equal(round({ boards: SCREENED }, KNOWN).ok, true);
  const stray = { ...SCREENED, placements: { ...SCREENED.placements, 'food/nowhere': ['p1'] } };
  const got = round({ boards: stray }, KNOWN);
  assert.ok(!got.ok && got.problems.some((p) => p.includes('has no screen "nowhere"')));
});

test('a file of buttons is read for its own pair, and names only its own screens', () => {
  const contents = { phrases: SCREENED.phrases, placements: { '.': ['s1'], s1: ['p1'] } };
  const text = JSON.stringify(buildButtons('zh-Hans__en', contents));
  const got = readButtons(text, 'zh-Hans__en');
  assert.equal(got.ok, true);
  assert.deepEqual(got.ok && got.data.placements, contents.placements);
  // Another pair's board would store the buttons and never show them.
  const other = readButtons(text, 'ja__en');
  assert.ok(!other.ok && other.problems[0].includes('written for zh-Hans__en'));
  // A placement may name the screen loaded into, or a screen in the file -- not a sentence.
  const bad = JSON.stringify(buildButtons('zh-Hans__en', { ...contents, placements: { '.': ['s1'], p1: ['s1'] } }));
  const refused = readButtons(bad, 'zh-Hans__en');
  assert.ok(!refused.ok && refused.problems.some((p) => p.includes('names no screen')));
  // A backup is not a file of buttons, and is said not to be.
  const backup = readButtons(JSON.stringify(buildPackage({ boards: SCREENED })), 'zh-Hans__en');
  assert.ok(!backup.ok && backup.problems[0] === 'not a file of buttons');
});

test('the answers a button carries travel with it, and must be pairs of text', () => {
  const asks = { ...MINE, phrases: { p1: { ...MINE.phrases.p1, replies: [{ owner: 'Yes', listener: '有' }] } } };
  const got = round({ boards: asks }, KNOWN);
  assert.equal(got.ok, true);
  assert.deepEqual(got.ok && got.data.boards?.phrases.p1.replies, [{ owner: 'Yes', listener: '有' }]);
  // One side missing is not an answer; neither is a bare string where the list goes.
  for (const replies of [[{ owner: 'Yes' }], 'Yes']) {
    const bad = round({ boards: { ...MINE, phrases: { p1: { ...MINE.phrases.p1, replies } } } }, KNOWN);
    assert.ok(!bad.ok && bad.problems.includes('phrase p1: replies are not a list of answers'));
  }
});
