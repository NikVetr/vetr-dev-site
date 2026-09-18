// The `title` column of `data/registry/language-names.csv`, and the sources for it.
//
// That table holds what each locale calls each language in **the form a sentence slot
// needs**, because that is its job: `fillLanguageSlots` substitutes it into rows like
// `Nemluvím {target}` and `Ви розмовляєте {source}?`. So Czech carries `anglicky`
// ("in English", an adverb) rather than `angličtina`, Finnish `englannin` (genitive,
// for the `{target} kieltä` frame), Polish `po angielsku`, Russian `английском`
// (prepositional, for `на {target}`) and Ukrainian `англійською` (instrumental).
//
// That is right inside a sentence and wrong as a standalone heading, and for the 50
// natural languages it never showed, because `languageName` in `ui/i18n.js` asks ICU
// first and ICU gives the nominative. It showed for the two languages CLDR has never
// heard of. With the interface in Russian, the gallery card for Klingon was headed
// `клингонском` -- "in Klingon" -- because those two are the only codes that ever
// reach the registry fallback. `title` is the dictionary form for the cells where the
// slot form is not one, and `setLanguageNames` prefers it.
//
// **This file is where those eleven cells are sourced, because the CSV has nowhere to
// put a citation.** The table has no `notes` column and adding one for eleven rows out
// of 2,750 would cost more than it documents, so the provenance lives here beside the
// assertion that the cell still says it. The house rule holds: a sourced form or an
// empty cell with a recorded reason, never a plausible-looking guess.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTable } from '../core/csv.js';
import { languageName, setLanguageNames } from '../ui/i18n.js';

const rows = parseTable(
  await readFile('data/registry/language-names.csv', 'utf8'), 'language-names.csv',
);
const cell = (/** @type {string} */ locale, /** @type {string} */ bcp47) => {
  const row = rows.find((r) => r.locale === locale && r.bcp47 === bcp47);
  if (!row) throw new Error(`no ${locale},${bcp47} row`);
  return row;
};

/**
 * Every title form, with the source for it and the slot form it stands beside.
 *
 * The order of preference for a source was: the language's own Wikipedia article on
 * Klingon or Quenya (its title and lead sentence give the nominative), then that
 * language's Wiktionary, then the Wikidata label. Klingon is Q10134 and Quenya is
 * Q56383 -- **not** Q56475, which is Hausa.
 *
 * **Klingon has a fourth source, and it is the one that settles it: CLDR itself.**
 * Node ships the full ICU data and answers `tlh` in every one of these six locales;
 * Chromium's trimmed build answers nothing, which is the whole reason the registry is
 * reached at all. So the title for `tlh` is not an editorial choice -- it is the
 * string ICU would have returned if the browser had the data, which is exactly the
 * contract of a fallback. All six were derived from Wikipedia first and then found to
 * match CLDR character for character, and the test below asserts that they still do,
 * so an ICU upgrade that renames one of them fails here rather than drifting.
 *
 * Quenya has no such backstop: CLDR carries no name for `qya` in any of the 52
 * locales, so those five cells rest on Wikipedia and Wikidata alone.
 */
const TITLES = [
  // Klingon. `cldr: true` means CLDR agrees, asserted below.
  {
    locale: 'cs', bcp47: 'tlh', slot: 'klingonsky', title: 'klingonština', cldr: true,
    // cs.wikipedia "Klingonština", lead: "Klingonština (klingonsky, v latince
    // tlhIngan Hol) je umělý jazyk" -- which names the adverb the slot uses in the
    // same breath as the noun the title wants. Wikidata Q10134 cs: "klingonština".
    source: 'cs.wikipedia Klingonština (title and lead); Wikidata Q10134 cs',
  },
  {
    locale: 'fi', bcp47: 'tlh', slot: 'klingonin', title: 'klingon', cldr: true,
    // fi.wiktionary "klingon" is a substantiivi glossed "klingonin kieli, ...
    // klingonien puhuma kieli", so the bare noun is the citation form and
    // `klingonin` is its genitive, which is what the `{target} kieltä` frame takes.
    // fi.wikipedia titles the article with that genitive, "Klingonin kieli", the way
    // Finnish does for a language with no established bare noun -- but this one has
    // one. Wikidata Q10134 fi: "klingon".
    source: 'fi.wiktionary klingon (noun); Wikidata Q10134 fi',
  },
  {
    locale: 'pl', bcp47: 'tlh', slot: 'po klingońsku', title: 'klingoński', cldr: true,
    // pl.wikipedia "Język klingoński", lead: "Klingoński (ang. klingon, kl. tlhIngan
    // Hol) - sztuczny język artystyczny". Bare adjective rather than "język
    // klingoński" to match the column it sits in, where ICU gives `angielski` and
    // `japoński`. Wikidata Q10134 pl has "język klingonski", missing the ń.
    source: 'pl.wikipedia Język klingoński (title and lead)',
  },
  {
    locale: 'ru', bcp47: 'tlh', slot: 'клингонском', title: 'клингонский', cldr: true,
    // ru.wikipedia "Клингонский язык", lead: "Клингонский язык (самоназвание:
    // tlhIngan Hol) - искусственный язык". Bare adjective, as ICU gives `английский`.
    // Wikidata Q10134 ru: "клингонский язык". This is the reproduced cell.
    source: 'ru.wikipedia Клингонский язык (title and lead); Wikidata Q10134 ru',
  },
  {
    locale: 'uk', bcp47: 'tlh', slot: 'клінгонською', title: 'клінгонська', cldr: true,
    // uk.wikipedia "Клінгонська мова", lead: "Клінго́нська мо́ва - штучна мова".
    // Bare adjective, as ICU gives `англійська`. Wikidata Q10134 uk: "клінгонська
    // мова".
    source: 'uk.wikipedia Клінгонська мова (title and lead); Wikidata Q10134 uk',
  },
  {
    locale: 'vi', bcp47: 'tlh', slot: 'Klingon', title: 'Tiếng Klingon', cldr: true,
    // vi.wikipedia "Tiếng Klingon", lead: "Tiếng Klingon (tlhIngan Hol, ...) là một
    // ngôn ngữ được xây dựng". Vietnamese inflects for nothing, so this is the one
    // locale here where the slot form is already a nominative -- but it is still the
    // wrong form for a heading, and for the same reason: the frame `nói tiếng
    // {target}` supplies the classifier, so the cell omits it, and every other card
    // on the page is headed `Tiếng Anh`, `Tiếng Nga`, `Tiếng Nhật`.
    source: 'vi.wikipedia Tiếng Klingon (title and lead); Wikidata Q10134 vi',
  },

  // Quenya. CLDR has nothing for `qya` in any locale, so no `cldr` flag.
  {
    locale: 'cs', bcp47: 'qya', slot: 'quenijsky', title: 'quenijština',
    // cs.wikipedia "Quenijština", lead: "Quenya (nebo taky quenijština) neboli
    // Vznešená elfština". Lowercase because Czech does not capitalise a language
    // name and ICU gives `angličtina`; the article title is capitalised only by
    // MediaWiki's first-letter rule, and the lead has it mid-sentence. Wikidata
    // Q56383 cs: "Quenijština".
    source: 'cs.wikipedia Quenijština (title and lead); Wikidata Q56383 cs',
  },
  {
    locale: 'fi', bcp47: 'qya', slot: 'quenyan', title: 'quenya',
    // fi.wikipedia "Quenya", lead: "Quenya on yksi fantasiakirjailija J. R. R.
    // Tolkienin kehittämistä keinotekoisista kielistä" -- nominative, against the
    // genitive `quenyan` the slot frame takes. Wikidata Q56383 fi: "quenya".
    source: 'fi.wikipedia Quenya (title and lead); Wikidata Q56383 fi',
  },
  {
    locale: 'pl', bcp47: 'qya', slot: 'w Quenya', title: 'Quenya',
    // pl.wikipedia "Quenya", lead: "Quenya (wym. ['k*n*a]), także język quenejski,
    // Wysoka Mowa - sztuczny język opracowany przez J.R.R. Tolkiena". Capitalised
    // because Polish keeps this one as an unassimilated proper noun -- both the
    // article and the slot cell already do -- where `klingoński` above is an
    // ordinary adjective. Wikidata Q56383 pl: "Quenya".
    source: 'pl.wikipedia Quenya (title and lead); Wikidata Q56383 pl',
  },
  {
    locale: 'uk', bcp47: 'qya', slot: 'мовою Квенья', title: 'квенья',
    // uk.wikipedia "Квенья", lead: "Кве́нья (кв. Quenya) - вигадана мова фантазійного
    // світу Середзем'я". Lowercase per the Wikidata Q56383 uk label "квенья", which
    // is also how the Russian cell beside it is written; the article's capital is
    // sentence-initial. The slot form is the instrumental phrase "in the Quenya
    // language", which is a sentence fragment rather than a name.
    source: 'uk.wikipedia Квенья (title and lead); Wikidata Q56383 uk',
  },
  {
    locale: 'vi', bcp47: 'qya', slot: 'Quenya', title: 'Tiếng Quenya',
    // vi.wikipedia titles the article "Quenya" but opens "Tiếng Quenya là một ngôn
    // ngữ hư cấu được phát minh bởi nhà văn J. R. R. Tolkien" -- so the lead, not
    // the title, is the source here. Same classifier reason as `tlh` above.
    source: 'vi.wikipedia Quenya (lead sentence)',
  },
];

/**
 * Cells left empty on purpose, and why. A documented blank beats an invented value,
 * so these are asserted empty rather than left to drift full.
 */
const DELIBERATELY_BLANK = [
  {
    locale: 'ru', bcp47: 'qya',
    // `квенья` is indeclinable in Russian -- ru.wikipedia's lead inflects everything
    // around it and never the word itself ("Кве́нья (Quenya) - искусственный язык")
    // -- so the slot form and the dictionary form are the same string and a `title`
    // would only be a second copy of it. Russian's Klingon needs one; its Quenya
    // does not, and that asymmetry is the finding.
    reason: 'квенья is indeclinable: the slot form is already the nominative',
  },
];

test('the title column holds exactly the eleven sourced cells', () => {
  const filled = rows.filter((r) => r.title)
    .map((r) => `${r.locale},${r.bcp47}`).sort();
  assert.deepEqual(
    filled,
    TITLES.map((t) => `${t.locale},${t.bcp47}`).sort(),
    'a title cell with no entry in TITLES above is an unsourced claim',
  );
});

test('every title cell says what its source says, and stands beside its slot form', () => {
  for (const want of TITLES) {
    const row = cell(want.locale, want.bcp47);
    assert.equal(row.title, want.title, `${want.locale},${want.bcp47}: ${want.source}`);
    // The point of the column: the slot keeps the inflected value. A fix that moved
    // the sentence form would break `Nemluvím {target}` to mend a card heading.
    assert.equal(row.name, want.slot, `${want.locale},${want.bcp47} slot form moved`);
    assert.notEqual(row.title, row.name, `${want.locale},${want.bcp47}: title duplicates name`);
  }
});

test('CLDR agrees with every Klingon title, and has no Quenya name to agree with', () => {
  // Node carries the full ICU data; Chromium does not, which is why the registry is
  // consulted for these two at all. Where CLDR does know the answer it is the
  // authority, so the cell has to match it -- and an ICU upgrade that renames
  // Klingon in one of these six locales fails here.
  for (const want of TITLES.filter((t) => t.cldr)) {
    const icu = new Intl.DisplayNames([want.locale], { type: 'language', fallback: 'none' })
      .of(want.bcp47);
    assert.equal(icu, want.title, `CLDR ${want.locale} disagrees with the registry`);
  }
  const locales = [...new Set(rows.map((r) => r.locale))];
  const known = locales.filter((l) => (
    new Intl.DisplayNames([l], { type: 'language', fallback: 'none' }).of('qya')
  ));
  assert.deepEqual(known, [], 'CLDR has grown a Quenya name; prefer it over the registry');
});

test('a cell left empty is left empty on purpose', () => {
  for (const blank of DELIBERATELY_BLANK) {
    assert.equal(cell(blank.locale, blank.bcp47).title, '', blank.reason);
  }
});

test('languageName reads the title, and falls back to the slot form without one', () => {
  // Asked of a code CLDR has never heard of in any locale, because every code that
  // reaches the registry in the browser is one ICU could not answer -- and in Node,
  // ICU can answer `tlh`, so asking about Klingon here would test ICU instead.
  setLanguageNames([
    { locale: 'ru', bcp47: 'zzz', name: 'слот', title: 'заголовок', romanization: '', ipa: '' },
    { locale: 'ru', bcp47: 'zzy', name: 'только слот', title: '', romanization: '', ipa: '' },
    { locale: 'ru', bcp47: 'zzx', name: '', title: '', romanization: '', ipa: '' },
  ]);
  assert.equal(languageName('zzz', 'fallback'), 'заголовок');
  assert.equal(languageName('zzy', 'fallback'), 'только слот');
  assert.equal(languageName('zzx', 'fallback'), 'fallback');
  // Replaced rather than merged: the gallery hands over a new locale's slice every
  // time the reader changes, and a name left behind from the previous one would
  // print in the wrong language.
  setLanguageNames([]);
  assert.equal(languageName('zzz', 'fallback'), 'fallback');
});
