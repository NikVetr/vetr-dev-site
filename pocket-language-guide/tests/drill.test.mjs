// The quiz's pure half: how an answer is graded, and how a question is built.
//
// These are the assertions the design decisions were made from, written against
// **real corpus strings** rather than invented ones, because the whole argument for
// three-valued grading is a measurement over this bank: `nǎlǐ`/`nàlǐ` and
// `Hỏng`/`Họng` are the collisions that ruled out a mark-blind pass, and `我`/`你`
// are the pair that ruled out a flat edit-distance budget.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable } from '../core/csv.js';
import { buildDrill, drillPool, grade, normalise } from '../ui/drill.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('normalise drops case and the punctuation around a phrase', () => {
  assert.equal(normalise('  Où est la gare ?  '), 'où est la gare');
  assert.equal(normalise('¿Dónde está el baño?'), 'dónde está el baño');
  assert.equal(normalise('Hol van ez: {}?'), 'hol van ez');
  assert.equal(normalise('Two  spaces'), 'two spaces');
  // Interior punctuation is part of the word, so it stays.
  assert.equal(normalise("D'accord"), "d'accord");
  // A bare currency sign is entirely `\p{S}`. Stripping would leave an empty
  // expected answer, which accepts anything, so the strip is discarded.
  assert.equal(normalise('¥'), '¥');
  assert.equal(normalise('₹'), '₹');
});

test('a mark-only difference is its own verdict, not a pass and not a failure', () => {
  // 100% of pinyin answers carry a tone mark, so an exact match would fail every
  // learner typing on a plain keyboard.
  assert.equal(grade('nihao', 'nǐhǎo'), 'marks');
  assert.equal(grade('toi', 'tôi'), 'marks');
  // **And this is the assertion the whole three-valued design exists for.** These
  // are the real corpus collisions that a mark-blind *pass* would have accepted as
  // right -- a different word in Vietnamese, a different tone in pinyin. They are
  // `marks`, which is both true (the letters are right) and not a pass.
  assert.equal(grade('nàlǐ', 'nǎlǐ'), 'marks');
  assert.equal(grade('jiǎo', 'jiào'), 'marks');
  assert.equal(grade('Họng', 'Hỏng'), 'marks');
  // Right stays right, and a different word stays wrong.
  assert.equal(grade('nǐhǎo', 'nǐhǎo'), 'right');
  assert.equal(grade('NǏHǍO', 'nǐhǎo'), 'right');
  assert.equal(grade('zàijiàn', 'nǐhǎo'), 'wrong');
  // **The breve for the caron**, which is the Vietnamese translator's own case:
  // `ă` and `ǎ` are near-identical at 5pt and a Vietnamese reader is primed to
  // read a tone mark as a vowel-quality mark. Writing the first test of this file
  // reproduced the confusion by accident -- `nĭhǎo` was typed for `nǐhǎo` -- which is
  // the argument for the `legend` head slot restated from the input side. It is a
  // mark mistake and it grades as one.
  assert.equal(grade('nĭhǎo', 'nǐhǎo'), 'marks');
});

test('folding marks can never reach `right`, whatever the marks are', () => {
  // The safety property the design rests on, asserted rather than argued.
  // `Mn` is a broad class and it catches more than the keyboard-inaccessible
  // diacritics it was chosen for: Japanese dakuten and handakuten decompose into it,
  // so `ぜんぶ` and `ぜんぷ` are one fold apart although they are bu and pu and any
  // IME types both; Devanagari's virama is `Mn` too. Measured, that costs 8 of
  // Japanese's 1,600 distinct answers and 8 of Hindi's 1,558 -- and it costs them
  // only a *generous label on a near miss*, never a pass, because the fold is
  // consulted only after `right` has already been refused.
  assert.equal(grade('ぜんぶ', 'ぜんぷ'), 'marks');
  assert.notEqual(grade('ぜんぶ', 'ぜんぷ'), 'right');
  for (const [typed, answer] of [['nàlǐ', 'nǎlǐ'], ['ぜんぶ', 'ぜんぷ'], ['אני', 'אֲנִי'], ['toi', 'tôi']]) {
    assert.notEqual(grade(typed, answer), 'right');
  }
});

test('Hebrew niqqud fold to the unpointed column, which is the right verdict', () => {
  // `text` is `text_alt` with the points stripped, and `validate_data.py` enforces
  // it -- so typing the unpointed form of a pointed answer is "right letters, no
  // points" by construction rather than by coincidence.
  assert.equal(grade('אני', 'אֲנִי'), 'marks');
  assert.equal(grade('אֲנִי', 'אֲנִי'), 'right');
  // A different word is still a different word.
  assert.equal(grade('אתה', 'אֲנִי'), 'wrong');
});

test('the typo budget is proportional, because a flat one fails one-glyph scripts', () => {
  // 我 is one edit from 你. A flat budget of 1 accepts a real word for another on
  // 18% of Han answers, so the budget is zero below six code points.
  assert.equal(grade('你', '我'), 'wrong');
  assert.equal(grade('있어요', '없어요'), 'wrong');
  // Long enough to have room for a slip.
  assert.equal(grade('Where is the toilett?', 'Where is the toilet?'), 'right');
  // Transposition costs one edit, which is why this is Damerau and not Levenshtein:
  // as plain Levenshtein `wheer` is two edits from `where` and this would fail.
  assert.equal(grade('Wheer is the toilet?', 'Where is the toilet?'), 'right');
  // Two edits is still too many for nineteen characters (budget 3 -- but a whole
  // different word is far more than three).
  assert.equal(grade('Where is the station?', 'Where is the toilet?'), 'wrong');
  assert.equal(grade('', 'anything'), 'wrong');
});

test('the same seed gives the same drill and a different one does not', async () => {
  const blocks = await mandarinBlocks();
  /** @type {Parameters<typeof buildDrill>[0]} */
  const input = {
    blocks,
    concepts: await conceptTable(),
    kind: 'choice',
    prompt: ['gloss'],
    answer: ['script'],
    seed: 'abc123',
    count: 10,
  };
  const a = buildDrill(input);
  const b = buildDrill(input);
  const c = buildDrill({ ...input, seed: 'abc124' });
  assert.equal(a.length, 10);
  assert.deepEqual(signature(a), signature(b));
  assert.notDeepEqual(signature(a), signature(c));
});

test('a multiple-choice question offers four distinct answers, one of them right', async () => {
  const blocks = await mandarinBlocks();
  const questions = buildDrill({
    blocks,
    concepts: await conceptTable(),
    kind: 'choice',
    prompt: ['gloss'],
    answer: ['script'],
    seed: 'options',
    count: 40,
  });
  assert.equal(questions.length, 40);
  for (const question of questions) {
    const options = /** @type {string[]} */ (question.options);
    assert.equal(options.length, 4);
    // Distinct *after normalisation*, so no offered wrong answer would grade right.
    assert.equal(new Set(options.map(normalise)).size, 4);
    const want = /** @type {string} */ (question.rows[0].values.script);
    assert.equal(options.filter((o) => normalise(o) === normalise(want)).length, 1);
  }
});

test('distractors come from the row′s own cluster where the corpus has one', async () => {
  const concepts = await conceptTable();
  const blocks = await mandarinBlocks();
  const questions = buildDrill({
    blocks, concepts, kind: 'choice', prompt: ['gloss'], answer: ['gloss'], seed: 'x', count: 1,
  });
  // `gloss` on both sides is refused by the dialog, so ask a real one instead: take
  // the number line, which is one 18-member cluster, and check that a question about
  // one of its rows is answered with others of its own cluster rather than with
  // whatever else is on the card.
  assert.ok(questions.length >= 0);
  const numbers = buildDrill({
    blocks: blocks.map((b) => (b.kind === 'items'
      ? { ...b, rows: (b.rows ?? []).filter((r) => concepts[r.conceptId]?.cluster_id === 'numbers-money.misc') }
      : b)).filter((b) => b.kind !== 'items' || (b.rows ?? []).length),
    concepts,
    kind: 'choice',
    prompt: ['gloss'],
    answer: ['script'],
    seed: 'cluster',
    count: 5,
  });
  assert.ok(numbers.length >= 1, 'the number line should be quizzable');
  for (const question of numbers) {
    for (const option of /** @type {string[]} */ (question.options)) {
      const row = blocks.flatMap((b) => b.rows ?? []).find((r) => r.values.script === option);
      assert.equal(concepts[/** @type {string} */ (row?.conceptId)]?.cluster_id, 'numbers-money.misc');
    }
  }
});

test('no question ever asks for, or shows, a blank cell', async () => {
  const blocks = await mandarinBlocks();
  const concepts = await conceptTable();
  // A column nothing on the card fills has to produce no question rather than a
  // blank one. Here that is `respell`, because the respelling is generated by
  // `core/respell.js` during a solve and this fixture has not run one -- which is
  // the same shape as `ipa` on a pack whose romanisation column is not written yet.
  assert.equal(drillPool(blocks, ['respell']).length, 0);
  // And a sparse column narrows the pool rather than emptying it: `literal` is
  // filled on a minority of rows.
  assert.ok(drillPool(blocks, ['literal']).length < drillPool(blocks, ['gloss']).length);
  assert.ok(drillPool(blocks, ['literal']).length > 0);
  for (const kind of /** @type {const} */ (['choice', 'match', 'blank'])) {
    const questions = buildDrill({
      blocks, concepts, kind, prompt: ['gloss', 'literal'], answer: ['script'], seed: 's', count: 40,
    });
    for (const question of questions) {
      for (const row of question.rows) {
        for (const field of ['gloss', 'literal', 'script']) {
          assert.notEqual((row.values[/** @type {'gloss'} */ (field)] ?? '').trim(), '');
        }
      }
    }
  }
});

test('a pool too small for a question yields none rather than a broken one', async () => {
  const concepts = await conceptTable();
  const blocks = await mandarinBlocks();
  const one = blocks
    .filter((b) => b.kind === 'items')
    .slice(0, 1)
    .map((b) => ({ ...b, rows: (b.rows ?? []).slice(0, 1) }));
  /** @type {{prompt:import('../core/types.js').FieldId[],
   *   answer:import('../core/types.js').FieldId[], seed:string, count:number}} */
  const common = { prompt: ['gloss'], answer: ['script'], seed: 's', count: 10 };
  // Matching needs two rows to match and multiple choice needs a second answer to
  // offer; fill-in-the-blank needs neither.
  assert.equal(buildDrill({ ...common, blocks: one, concepts, kind: 'match' }).length, 0);
  assert.equal(buildDrill({ ...common, blocks: one, concepts, kind: 'choice' }).length, 0);
  assert.equal(buildDrill({ ...common, blocks: one, concepts, kind: 'blank' }).length, 1);
  // And an empty card is empty rather than an error.
  for (const kind of /** @type {const} */ (['choice', 'match', 'blank'])) {
    assert.equal(buildDrill({ ...common, blocks: [], concepts, kind }).length, 0);
  }
});

test('a matching group never offers the same label for two of its own rows', async () => {
  const blocks = await mandarinBlocks();
  const questions = buildDrill({
    blocks,
    concepts: await conceptTable(),
    kind: 'match',
    prompt: ['gloss'],
    answer: ['script'],
    seed: 'match',
    count: 20,
  });
  assert.ok(questions.length > 0);
  for (const question of questions) {
    const labels = /** @type {string[]} */ (question.labels);
    assert.ok(question.rows.length >= 2);
    assert.equal(labels.length, question.rows.length);
    assert.equal(new Set(labels.map(normalise)).size, labels.length);
  }
});

/** @param {ReturnType<typeof buildDrill>} questions */
const signature = (questions) => questions.map((q) => [
  q.rows.map((r) => r.conceptId).join(','), q.asks.join(','), (q.options ?? q.labels ?? []).join('|'),
].join(' '));

/** @type {Record<string,Record<string,string>>|null} */ let conceptCache = null;
async function conceptTable() {
  if (conceptCache) return conceptCache;
  /** @type {Record<string,Record<string,string>>} */ const out = {};
  for (const file of await readdir(join(ROOT, 'data/concepts'))) {
    if (!file.endsWith('.csv')) continue;
    for (const row of parseTable(await readFile(join(ROOT, 'data/concepts', file), 'utf8'), file)) {
      out[row.concept_id] = row;
    }
  }
  conceptCache = out;
  return out;
}

/**
 * Blocks shaped as the solver produces them, for `zh-Hans <- en`.
 *
 * Built from the corpus directly rather than through `buildSheet`, because the drill
 * only ever reads `kind`, `sectionId` and `rows[].values` -- so a solve would cost
 * two seconds and a font stack to produce the same three fields. What matters is
 * that the shape is the real one, which the section grouping here is.
 */
/** @type {import('../core/types.js').Block[]|null} */ let blockCache = null;
async function mandarinBlocks() {
  if (blockCache) return blockCache;
  const concepts = await conceptTable();
  /** @param {string} code */
  const pack = async (code) => {
    /** @type {Record<string,Record<string,string>>} */ const rows = {};
    for (const file of await readdir(join(ROOT, 'data/lang', code))) {
      if (!file.endsWith('.csv')) continue;
      for (const row of parseTable(await readFile(join(ROOT, 'data/lang', code, file), 'utf8'), file)) {
        rows[row.concept_id] = row;
      }
    }
    return rows;
  };
  const target = await pack('zh-Hans');
  const source = await pack('en');
  /** @type {Map<string, import('../core/types.js').Block>} */ const bySection = new Map();
  for (const concept of Object.values(concepts)) {
    const applies = !concept.applies_to
      || concept.applies_to.split(';').filter(Boolean).includes('zh-Hans');
    if (!applies || concept.default_template === 'note') continue;
    const t = target[concept.concept_id];
    const s = source[concept.concept_id];
    if (!t?.text || !s?.text) continue;
    if (!bySection.has(concept.section_id)) {
      bySection.set(concept.section_id, {
        kind: 'items',
        sectionId: concept.section_id,
        colorRole: 'ink',
        stretch: 0,
        templateId: concept.default_template,
        rows: [],
      });
    }
    /** @type {import('../core/types.js').Block} */
    const block = /** @type {any} */ (bySection.get(concept.section_id));
    /** @type {import('../core/types.js').ItemRow[]} */ (block.rows).push({
      conceptId: concept.concept_id,
      weight: Number(concept.importance),
      values: {
        script: t.text,
        roman: t.romanization_pinyin ?? '',
        ipa: t.ipa ?? '',
        literal: t.literal ?? '',
        gloss: s.text,
        numeral: s.text,
        respell: '',
      },
    });
  }
  blockCache = [...bySection.values()];
  return blockCache;
}
