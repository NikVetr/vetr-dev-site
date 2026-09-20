// Who is speaking, and the three things this must never do.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readAxes, axesFor, variantKey, variantOf, unanswered } from '../core/speaker.js';

/** A registry with two languages that inflect and one that does not. */
const ROWS = [
  { language: 'ru', axis: 'speaker_gender', value: 'f', default: '0' },
  { language: 'ru', axis: 'speaker_gender', value: 'm', default: '1' },
  { language: 'ja', axis: 'politeness', value: 'polite', default: '1' },
  { language: 'ja', axis: 'politeness', value: 'plain', default: '0' },
  { language: 'ja', axis: 'speaker_gender', value: 'f', default: '0' },
  { language: 'ja', axis: 'speaker_gender', value: 'm', default: '1' },
];
const axes = readAxes(ROWS);

test('a language that does not inflect declares nothing, and is asked nothing', () => {
  // The whole point of a per-language registry: a reader whose languages have no
  // first-person gender agreement is never asked their gender. A settings screen
  // that asks everyone everything is what this replaces.
  assert.deepEqual(axes.en, undefined);
  assert.deepEqual(axesFor(axes, ['en', 'es']), []);
});

test('a pair asks the union of both languages, once each', () => {
  // A pair is two languages and either may inflect. "Are you speaking as a man or a
  // woman" is one question even when both need the answer.
  const asked = axesFor(axes, ['ru', 'ja']).map((a) => a.axis).sort();
  assert.deepEqual(asked, ['politeness', 'speaker_gender']);
  assert.equal(axesFor(axes, ['ru', 'en']).length, 1);
});

test('an unanswered axis resolves to the wording the corpus already ships', () => {
  // Unset is a real state, not a prompt to guess. The default is what every row in
  // the bank says today, so a reader who answers nothing sees no change at all.
  assert.equal(variantKey(axes.ru, {}), null);
  // ...and so is choosing the default explicitly: it is the base text either way, so
  // there is no variant to look up and no sparse row to write.
  assert.equal(variantKey(axes.ru, { speaker_gender: 'm' }), null);
  assert.equal(variantKey(axes.ru, { speaker_gender: 'f' }), 'speaker_gender=f');
});

test('nothing is inferred, and a foreign value is ignored rather than guessed at', () => {
  // A profile is global -- "I am a woman" is a fact about the reader, not about
  // Russian -- so it can carry a value a given language has never declared.
  assert.equal(variantKey(axes.ru, { politeness: 'plain' }), null);
  assert.equal(variantKey(axes.ru, { speaker_gender: 'nonsense' }), null);
});

test('a key is order-independent, so data and code cannot disagree', () => {
  const a = variantKey(axes.ja, { speaker_gender: 'f', politeness: 'plain' });
  const b = variantKey(axes.ja, { politeness: 'plain', speaker_gender: 'f' });
  assert.equal(a, b);
  assert.equal(a, 'politeness=plain|speaker_gender=f');
});

test('a variant is used where one exists and the base text where it does not', () => {
  // Sparse on purpose: most phrases are the same whoever says them, and only the
  // rows that genuinely differ are written down.
  const variants = { 'speaker_gender=f': { 'lost-rescue.i-am-lost': 'Я заблудилась' } };
  const key = variantKey(axes.ru, { speaker_gender: 'f' });
  assert.deepEqual(
    variantOf({ conceptId: 'lost-rescue.i-am-lost', base: 'Я заблудился', variants, key }),
    { text: 'Я заблудилась', varied: true },
  );
  // A concept with no variant falls back, silently and correctly.
  assert.deepEqual(
    variantOf({ conceptId: 'social-basics.thank-you', base: 'Спасибо', variants, key }),
    { text: 'Спасибо', varied: false },
  );
});

test('an incoming reply is never inflected for the owner', () => {
  // **The rule that has to be structural rather than remembered.** What the listener
  // taps is theirs to say. Bending it to the owner's gender would put words in a
  // stranger's mouth and leak the owner's profile to someone who never asked -- so
  // replies are written naturally neutral in both languages, and this refuses to
  // vary them even when a variant exists and the key is set.
  const variants = { 'speaker_gender=f': { 'board-answers.x': 'feminine form' } };
  const key = variantKey(axes.ru, { speaker_gender: 'f' });
  assert.equal(key, 'speaker_gender=f');
  assert.deepEqual(
    variantOf({ conceptId: 'board-answers.x', base: 'neutral form', variants, key, incoming: true }),
    { text: 'neutral form', varied: false },
  );
});

test('what is still unanswered is reportable, and is not an error', () => {
  const asked = axesFor(axes, ['ru', 'ja']);
  assert.equal(unanswered(asked, {}).length, 2);
  assert.equal(unanswered(asked, { speaker_gender: 'f' }).length, 1);
  assert.equal(unanswered(asked, { speaker_gender: 'f', politeness: 'plain' }).length, 0);
});

test('the shipped registry parses, and declares nothing it cannot back', async () => {
  // Reads whatever is on disk today, so this fails when a malformed row lands rather
  // than when a reader meets it. An empty registry is a legitimate state -- it means
  // the survey has not landed yet, not that the feature is broken.
  const { readFile } = await import('node:fs/promises');
  let text;
  try { text = await readFile('data/registry/speaker-axes.csv', 'utf8'); } catch { return; }
  const { parseTable } = await import('../core/csv.js');
  const shipped = readAxes(parseTable(text, 'speaker-axes.csv'));
  for (const [language, list] of Object.entries(shipped)) {
    for (const axis of list) {
      assert.ok(axis.values.length > 1,
        `${language}/${axis.axis} offers ${axis.values.length} value(s), so it is not a choice`);
      assert.ok(axis.values.includes(axis.fallback),
        `${language}/${axis.axis} defaults to ${axis.fallback}, which is not one of its values`);
      // No axis may be about the listener: replies are kept neutral instead, and a
      // questionnaire about a stranger is the thing this design refuses.
      assert.ok(!/listener|addressee|hearer/i.test(axis.axis),
        `${language}/${axis.axis} is about the listener, which must never be asked`);
    }
  }
});
