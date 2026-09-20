// Who is speaking, and the three things this must never do.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readAxes, axesFor, variantKey, variantOf, applyVariants, unanswered,
} from '../core/speaker.js';

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

/** One Russian pack row and the one concept that differs for a woman. */
const RU_ROWS = {
  'lost-rescue.i-am-lost': {
    concept_id: 'lost-rescue.i-am-lost',
    text: 'Я заблудился',
    romanization_bgn: 'ya zabludilsya',
    ipa: 'ja zəblʊˈdʲilsʲə',
    confidence: '2',
  },
  'social-basics.thank-you': { concept_id: 'social-basics.thank-you', text: 'Спасибо' },
};
const RU_VARIANTS = {
  'speaker_gender=f': {
    'lost-rescue.i-am-lost': {
      text: 'Я заблудилась',
      romanization_bgn: 'ya zabludilas',
      ipa: '',
    },
  },
};

test('a variant is used where one exists and the base row where it does not', () => {
  // Sparse on purpose: most phrases are the same whoever says them, and only the
  // rows that genuinely differ are written down.
  const key = variantKey(axes.ru, { speaker_gender: 'f' });
  const said = variantOf({
    conceptId: 'lost-rescue.i-am-lost', row: RU_ROWS['lost-rescue.i-am-lost'],
    variants: RU_VARIANTS, key,
  });
  assert.equal(said.varied, true);
  assert.equal(said.row.text, 'Я заблудилась');
  // **The pronunciation moves with the wording.** A card that changed the script and
  // left the respelling masculine would be teaching her to say the wrong thing.
  assert.equal(said.row.romanization_bgn, 'ya zabludilas');
  // A blank cell inherits rather than deleting: this variant has no IPA of its own,
  // and clearing the column would be worse than reusing a close one.
  assert.equal(said.row.ipa, 'ja zəblʊˈdʲilsʲə');
  assert.equal(said.row.confidence, '2');
  // The row on disk is untouched, so a second reader on the same corpus is unaffected.
  assert.equal(RU_ROWS['lost-rescue.i-am-lost'].text, 'Я заблудился');

  // A concept with no variant falls back, silently and correctly.
  const plain = variantOf({
    conceptId: 'social-basics.thank-you', row: RU_ROWS['social-basics.thank-you'],
    variants: RU_VARIANTS, key,
  });
  assert.deepEqual(plain, { row: RU_ROWS['social-basics.thank-you'], varied: false });
});

test('a whole pack can be voiced at once, for the sheet', () => {
  // The printed card is all the traveller's own speech, so the substitution happens
  // once -- before the solver measures anything, because it decides what fits by
  // measuring these exact strings.
  const key = variantKey(axes.ru, { speaker_gender: 'f' });
  const voiced = applyVariants(RU_ROWS, RU_VARIANTS, key);
  assert.equal(voiced['lost-rescue.i-am-lost'].text, 'Я заблудилась');
  assert.equal(voiced['social-basics.thank-you'], RU_ROWS['social-basics.thank-you']);
  // Nothing to do is the common case, and it must not copy the table: the studio
  // re-solves on every drag, and the content tree compares these by identity.
  assert.equal(applyVariants(RU_ROWS, RU_VARIANTS, null), RU_ROWS);
  assert.equal(applyVariants(RU_ROWS, {}, key), RU_ROWS);
  // A variant for a concept this pack has no row for is skipped, not invented: a
  // draft language is legitimately partial and a variant file may run ahead of it.
  assert.deepEqual(
    Object.keys(applyVariants(RU_ROWS, { [key ?? '']: { 'nothing.here': { text: 'x' } } }, key)),
    Object.keys(RU_ROWS),
  );
});

test('an incoming reply is never inflected for the owner', () => {
  // **The rule that has to be structural rather than remembered.** What the listener
  // taps is theirs to say. Bending it to the owner's gender would put words in a
  // stranger's mouth and leak the owner's profile to someone who never asked -- so
  // replies are written naturally neutral in both languages, and this refuses to
  // vary them even when a variant exists and the key is set.
  const variants = { 'speaker_gender=f': { 'board-answers.x': { text: 'feminine form' } } };
  const key = variantKey(axes.ru, { speaker_gender: 'f' });
  const row = { concept_id: 'board-answers.x', text: 'neutral form' };
  assert.equal(key, 'speaker_gender=f');
  assert.deepEqual(
    variantOf({ conceptId: 'board-answers.x', row, variants, key, incoming: true }),
    { row, varied: false },
  );
});

test('what is still unanswered is reportable, and is not an error', () => {
  const asked = axesFor(axes, ['ru', 'ja']);
  assert.equal(unanswered(asked, {}).length, 2);
  assert.equal(unanswered(asked, { speaker_gender: 'f' }).length, 1);
  assert.equal(unanswered(asked, { speaker_gender: 'f', politeness: 'plain' }).length, 0);
  // **Declining is an answer.** Someone who said "rather not say" has been asked, and
  // a line that keeps telling them the wording is the standard one is a nag. The
  // wording is unchanged -- an empty value produces no key -- so only the asking stops.
  assert.equal(unanswered(asked, { speaker_gender: '', politeness: '' }).length, 0);
  assert.equal(variantKey(axes.ru, { speaker_gender: '' }), null);
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
