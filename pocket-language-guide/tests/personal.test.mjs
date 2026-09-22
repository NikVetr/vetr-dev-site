// The only copy of someone's own phrases, and the file that carries it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage, readPackage, PACKAGE_VERSION, MAX_PACKAGE_BYTES } from '../core/personal.js';

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
  assert.match(said, /sentence on both sides/);
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
