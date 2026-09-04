// The join: what a pair's rows say once the pair is known.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildBlocks, fillLanguageSlots, loadCorpus, loadLanguage, loadRespellOverrides,
} from '../core/pack.js';
import { referenceSpec } from '../scripts/spec.mjs';

/** The corpus, once. */
let held;
const context = async () => {
  held ??= await loadCorpus((rel) => readFile(rel, 'utf8'));
  return held;
};

/** The blocks a pair produces, slots filled the way `core/sheet.js` fills them.
 * @param {any} corpus @param {string} target @param {string} source */
const blocksFor = async (corpus, target, source) => {
  const spec = await referenceSpec(target, source);
  const load = (/** @type {string} */ code) => loadLanguage(
    (rel) => readFile(rel, 'utf8'), code, corpus.groups);
  const [targetRows, sourceRows] = await Promise.all([load(target), load(source)]);
  const pair = { target, source };
  fillLanguageSlots(targetRows, { ...pair, locale: target, names: corpus.languageNames[target] });
  fillLanguageSlots(sourceRows, { ...pair, locale: source, names: corpus.languageNames[source] });
  const respell = await loadRespellOverrides(
    (rel) => readFile(rel, 'utf8'), target, source, spec.accent).catch(() => ({}));
  return buildBlocks({ corpus, targetRows, sourceRows, respell, spec });
};

const ID = 'communication.do-you-speak-english';

/**
 * One cell through the real substitution.
 * @param {string} text @param {{locale:string, target:string, source:string,
 *   names?:Record<string,{name:string, roman:string, ipa:string}>}} args
 * @param {string} [roman]
 */
function fill(text, args, roman) {
  /** @type {Record<string,Record<string,string>>} */
  const rows = { [ID]: { text, ...(roman ? { romanization_pinyin: roman } : {}) } };
  fillLanguageSlots(rows, { names: {}, ...args });
  return rows[ID];
}

test('a language slot is rendered in the language of the cell it sits in', () => {
  // The rule that matters, and the reason the narrower one ("target in the gloss,
  // source in the target text") does not work: one cell has to serve both sides.
  // `communication.do-you-speak-english` is "do you speak *the traveller's*
  // language", so the French cell says `Parlez-vous {source} ?` and that same cell
  // is the gloss when French is the reader's language.
  assert.equal(
    fill('Parlez-vous {source} ?', { locale: 'fr', target: 'fr', source: 'es' }).text,
    'Parlez-vous espagnol ?',
  );
  assert.equal(
    fill('Parlez-vous {source} ?', { locale: 'fr', target: 'zh-Hans', source: 'fr' }).text,
    'Parlez-vous français ?',
  );
});

test('the gloss names the language being learned, not the reader’s own', () => {
  // This was wrong on 135 of the 240 pairs, and not vaguely wrong: the French card
  // read `Je ne parle pas français` and its German gloss read `Ich spreche kein
  // Deutsch`, so the sentence the reader was shown was false.
  assert.equal(
    fill('Ich spreche kein {target}', { locale: 'de', target: 'fr', source: 'de' }).text,
    'Ich spreche kein Französisch',
  );
  assert.equal(
    fill('I do not speak {target}', { locale: 'en', target: 'fr', source: 'en' }).text,
    'I do not speak French',
  );
});

test('a script subtag is dropped, because nobody asks about simplified Chinese', () => {
  assert.equal(
    fill('Je ne parle pas {target}', { locale: 'fr', target: 'zh-Hans', source: 'fr' }).text,
    'Je ne parle pas chinois',
  );
});

test('the registry supplies what ICU cannot: a romanised name', () => {
  // The romanisation column is keyed to the target alone, so it cannot be curated
  // per pair the way the respelling can, and ICU has no romanisations. Without a
  // registry entry the gap is visible rather than wrong.
  const bare = fill('你会说{source}吗？', { locale: 'zh-Hans', target: 'zh-Hans', source: 'en' }, 'ni hui shuo {source} ma?');
  assert.equal(bare.text, '你会说英语吗？');
  assert.ok(!bare.romanization_pinyin.includes('{'), 'the placeholder must not survive');

  const named = fill(
    '你会说{source}吗？',
    {
      locale: 'zh-Hans',
      target: 'zh-Hans',
      source: 'en',
      names: { en: { name: '英语', roman: 'yingyu', ipa: 'iŋy' } },
    },
    'ni hui shuo {source} ma?',
  );
  assert.equal(named.romanization_pinyin, 'ni hui shuo yingyu ma?');
});

test('an ipa cell keeps its own blank slot and loses only an unnamed language', () => {
  // Two rules in one cell, and the first one used to eat the second. The guard was
  // "blank the ipa if a brace survived the substitution", which is right for a
  // language nobody has an IPA for -- but `{}`, the ordinary blank the traveller
  // fills in, is a brace that always survives, so every ipa cell carrying one was
  // blanked at render time: 747 cells, 44 per language, each printing an empty
  // respelling column for a row whose transcription was sitting on disk.
  assert.equal(
    fill('sin˧ ɣɔj˨˩ˀ t̪oj˧ zəɪ˨˩ˀ luc˧˥ {}', { locale: 'vi', target: 'vi', source: 'en' }).ipa,
    undefined, 'no ipa field to fill',
  );
  /** @type {Record<string,Record<string,string>>} */
  const kept = { [ID]: { ipa: 'me ʝˈamo {}' } };
  fillLanguageSlots(kept, { locale: 'es', target: 'es', source: 'en', names: {} });
  assert.equal(kept[ID].ipa, 'me ʝˈamo {}', 'the blank slot is a token the respeller passes through');

  // And a language the registry has no IPA for still blanks the whole cell, because
  // the alternative prints a fluent sentence with the language silently missing.
  /** @type {Record<string,Record<string,string>>} */
  const unnamed = { [ID]: { ipa: 'paʁlˈevˈu {source}' } };
  fillLanguageSlots(unnamed, { locale: 'fr', target: 'fr', source: 'es', names: {} });
  assert.equal(unnamed[ID].ipa, '');
  /** @type {Record<string,Record<string,string>>} */
  const named = { [ID]: { ipa: 'paʁlˈevˈu {source}' } };
  fillLanguageSlots(named, {
    locale: 'fr', target: 'fr', source: 'es',
    names: { es: { name: 'espagnol', roman: '', ipa: 'ɛspanjˈɔl' } },
  });
  assert.equal(named[ID].ipa, 'paʁlˈevˈu ɛspanjˈɔl');
});

test('a respelling is never substituted into', () => {
  // Respellings are curated per pair already, and they have to be: the French
  // `par-lay voo zahn-GLEH` carries a liaison /z/ that vanishes with `espagnol`,
  // so a generated one would be wrong rather than merely clumsy.
  const row = fill('Parlez-vous {source} ?', { locale: 'fr', target: 'fr', source: 'es' });
  assert.equal(row.respell, undefined);
  /** @type {Record<string,Record<string,string>>} */
  const rows = { [ID]: { text: 'x', respell: 'par-lay voo {source}' } };
  fillLanguageSlots(rows, { locale: 'fr', target: 'fr', source: 'es', names: {} });
  assert.equal(rows[ID].respell, 'par-lay voo {source}', 'left alone for a human to write');
});

test('every pack agrees on which slots a concept takes', async () => {
  // The check that stops `Parlez-vous anglais ?` being written again. A concept
  // either names a language or it does not, so if one pack's cell carries a
  // placeholder and another's does not, one of them is hardcoding a language --
  // which is exactly how all sixteen packs came to ask about English.
  const corpus = await loadCorpus((rel) => readFile(rel, 'utf8'));
  const ready = corpus.languages
    ? Object.values(corpus.languages).filter((l) => l.status === 'ready').map((l) => l.bcp47)
    : [];
  assert.ok(ready.length >= 16, `expected the ready languages, got ${ready.length}`);

  /** @type {Map<string, Map<string, string[]>>} */ const byConcept = new Map();
  for (const code of ready) {
    const rows = await loadLanguage((rel) => readFile(rel, 'utf8'), code, corpus.groups);
    for (const [id, row] of Object.entries(rows)) {
      const slots = [...(row.text ?? '').matchAll(/\{(target|source)\}/g)].map((m) => m[1]).sort();
      if (!byConcept.has(id)) byConcept.set(id, new Map());
      const seen = /** @type {Map<string,string[]>} */ (byConcept.get(id));
      const key = slots.join(',');
      seen.set(key, (seen.get(key) ?? []).concat(code));
    }
  }
  const disagreeing = [...byConcept.entries()]
    .filter(([, seen]) => seen.size > 1)
    .map(([id, seen]) => `${id}: ${[...seen].map(([k, v]) => `${k || '(none)'}=${v.join(' ')}`).join(' | ')}`);
  assert.deepEqual(disagreeing, []);

  // And it has to be checking something: a corpus whose placeholders were reverted
  // would satisfy the agreement check above vacuously, which is the failure mode two
  // other tests in this suite have already had. Six concepts carry a slot -- two
  // `{source}`, "does anyone here speak *my* language", and four `{target}`, "I do
  // not speak / please write *the local* language".
  const slotted = [...byConcept.entries()].filter(([, seen]) => [...seen.keys()].some(Boolean));
  assert.ok(slotted.length >= 6, `${slotted.length} concepts carry a language slot`);
});

test('a section shows one row shape at a time', async () => {
  // A row's template comes from its concept and a section mixes them freely --
  // `toilets` is fifteen phrases and ten words -- so in rank order the two shapes
  // alternated row by row: a phrase in two columns with its respelling underneath,
  // then a word in a three-column grid with the respelling beside it, then another
  // phrase. `buildBlocks` already groups *consecutive* rows of one template into a
  // run, so the fix was to stop rank order interleaving them.
  //
  // Asserted as "no template appears in two separate runs", which is the property,
  // rather than as an expected sequence, which would be a snapshot of the corpus.
  const ctx = await context();
  for (const [target, source] of [['es', 'en'], ['ja', 'en'], ['el', 'hu']]) {
    const blocks = await blocksFor(ctx, target, source);
    /** @type {Record<string, string[]>} */ const seq = {};
    let section = null;
    for (const b of blocks) {
      if (b.kind === 'heading') { section = b.sectionId; seq[section] = []; continue; }
      if (b.kind === 'items' && section) seq[section].push(b.templateId ?? 'entry');
    }
    for (const [id, list] of Object.entries(seq)) {
      const runs = list.filter((v, i) => i === 0 || v !== list[i - 1]);
      assert.equal(runs.length, new Set(list).size,
        `${target}<-${source} ${id} interleaves its templates: ${runs.join(' > ')}`);
    }
  }
});
