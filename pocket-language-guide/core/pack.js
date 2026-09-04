// Corpus loading and the source x target join.
//
// Nothing here is per-language-pair on disk: each language contributes one
// directory of concept realizations, and a sheet is assembled by joining the
// target language's rows, the source language's rows, and a respelling layer on
// concept_id. Adding a language is one directory, and every pair with it works.

import { parseTable } from './csv.js';

/** @typedef {(relPath:string)=>Promise<string>} LoadText */

/** @param {Record<string,string>[]} rows @param {string} key */
function index(rows, key) {
  /** @type {Record<string,Record<string,string>>} */ const out = {};
  for (const row of rows) out[row[key]] = row;
  return out;
}

/**
 * Registries plus the language-independent concept bank.
 * @param {LoadText} loadText
 */
export async function loadCorpus(loadText) {
  const read = async (/** @type {string} */ rel) => parseTable(await loadText(rel), rel);

  const scripts = index(await read('data/registry/scripts.csv'), 'iso15924');
  const languages = index(await read('data/registry/languages.csv'), 'bcp47');
  const paper = index(await read('data/registry/paper.csv'), 'preset_id');
  const regions = index(await read('data/registry/regions.csv'), 'iso3166');
  const sectionRows = await read('data/registry/sections.csv');
  // How many concepts each language actually has rows for. `status` in the
  // registry is an editorial intent ("we mean to do Spanish"); this is the fact,
  // and it is what decides whether a language can be offered as a target or a
  // gloss. The two used to be conflated, so the studio offered Spanish glosses
  // and then 404ed on every data/lang/es file and rendered a blank sheet.
  const coverage = JSON.parse(await loadText('data/coverage.json'));
  // Which (target, source, accent) triples someone has hand-curated respellings
  // for. Most have none, so knowing the list up front avoids asking for files that
  // were never written.
  const respellOverrides = new Set(
    /** @type {string[]} */ (JSON.parse(await loadText('data/respell/overrides/index.json'))),
  );
  // What one language calls another, where `Intl.DisplayNames` will not do. One
  // table rather than a file per language, because it is the only O(N^2) data in
  // the project and a directory of mostly-absent files would mean either an index
  // to generate or a 404 on every pair that does not need one.
  const languageNames = languageNameTable(await read('data/registry/language-names.csv'));
  // Which reading languages have a respelling rule table. Most do not yet, so a
  // pair whose reader has none gets no generated respelling -- which is the same
  // shape as the override index above, and for the same reason.
  const respellRules = new Set(
    /** @type {string[]} */ (JSON.parse(await loadText('data/respell/rules/index.json'))),
  );
  sectionRows.sort((a, b) => Number(a.rank) - Number(b.rank));

  const groups = [...new Set(sectionRows.map((s) => s.group))];
  /** @type {Record<string,Record<string,string>[]>} */ const conceptsByGroup = {};
  for (const group of groups) {
    const rows = await read(`data/concepts/${group}.csv`);
    rows.sort((a, b) => Number(a.rank) - Number(b.rank));
    conceptsByGroup[group] = rows;
  }

  return {
    scripts,
    languages,
    coverage,
    respellOverrides,
    respellRules,
    languageNames,
    paper,
    regions,
    sections: sectionRows,
    sectionById: index(sectionRows, 'section_id'),
    groups,
    conceptsByGroup,
    concepts: index(Object.values(conceptsByGroup).flat(), 'concept_id'),
  };
}

/**
 * Section headings in the reader's language.
 *
 * A heading is structural text the *source*-language reader reads, so on a
 * `zh-Hans <- ja` sheet it belongs in Japanese -- it was English regardless, which
 * left a French card with French glosses under headings like "Phone, text + power".
 * Absent file means English, which is the same fallback the interface uses.
 * @param {LoadText} loadText @param {string} code
 * @returns {Promise<Record<string,string>>}
 */
export async function loadSectionTitles(loadText, code) {
  const rel = `data/registry/section-titles/${code}.csv`;
  try {
    /** @type {Record<string,string>} */ const out = {};
    for (const row of parseTable(await loadText(rel), rel)) out[row.section_id] = row.title;
    return out;
  } catch (err) {
    if (isMissingFile(err)) return {};
    throw err;
  }
}

/**
 * Whether a concept belongs on a sheet for this target. Empty `applies_to` means
 * every target, which is almost all of them.
 * @param {Record<string,string>} concept @param {string} target
 */
export function appliesTo(concept, target) {
  const only = concept.applies_to;
  return !only || only.split(';').includes(target);
}

/**
 * The printer-and-paper half of a spec, from the registry row that describes it.
 *
 * One function because three places were building this by hand and one of them --
 * the dev scripts' `referenceSpec` -- had the printable-area inset and the minimum
 * type bump hardcoded to zero. That made the committed gallery thumbnails a
 * slightly different sheet from the one the app renders for the same pair, which
 * showed the moment the lightbox began typesetting the faces for real.
 * @param {{paper:Record<string,Record<string,string>>}} corpus
 * @param {string} presetId
 * @returns {import('./types.js').PaperSpec}
 */
export function paperSpec(corpus, presetId) {
  const paper = corpus.paper[presetId];
  if (!paper) throw new Error(`no paper preset "${presetId}"`);
  return {
    presetId,
    borderless: paper.borderless === '1',
    oversprayPct: Number(paper.overspray_pct),
    nonprintablePt: Number(paper.nonprintable_pt),
    minRulePt: Number(paper.min_rule_pt),
    minSizeDelta: Number(paper.min_size_delta),
  };
}

/**
 * Whether a language has enough rows to render a sheet from. A handful of stray
 * rows is not a language pack, so this asks for a real fraction of the bank.
 *
 * This is the one place that decides, because the registry's `status` column is
 * editorial intent and had been standing in for the fact: the studio offered
 * Spanish glosses, 404ed on all fifteen data files, and rendered a blank sheet
 * without saying anything.
 * @param {{total:number, languages:Record<string,number>}} coverage
 * @param {string} bcp47
 */
export function hasContent(coverage, bcp47) {
  return (coverage.languages[bcp47] ?? 0) >= coverage.total * 0.25;
}

/**
 * Whether a failed load means the file is absent rather than momentarily
 * unreachable: a 404 in the browser, ENOENT in Node. The distinction matters
 * because a draft language really has no file for some sections, while a 503 from
 * a warming CDN or a dropped connection means we failed to fetch rows that exist
 * -- and treating those alike printed a sheet quietly missing whole sections.
 * @param {any} err
 */
export function isMissingFile(err) {
  return err?.status === 404 || err?.code === 'ENOENT';
}

/**
 * One language's realizations, keyed by concept_id. Missing concepts are simply
 * absent -- draft languages are legitimately partial.
 * @param {LoadText} loadText @param {string} bcp47 @param {string[]} groups
 */
export async function loadLanguage(loadText, bcp47, groups) {
  /** @type {Record<string,Record<string,string>>} */ const rows = {};
  for (const group of groups) {
    let text;
    try {
      text = await loadText(`data/lang/${bcp47}/${group}.csv`);
    } catch (err) {
      // A draft language legitimately has no file for some groups. Anything other
      // than "absent" means we failed to fetch rows that do exist, and carrying on
      // would print a sheet silently missing a section -- possibly Emergency.
      if (isMissingFile(err)) continue;
      throw err;
    }
    for (const row of parseTable(text, `data/lang/${bcp47}/${group}.csv`)) {
      rows[row.concept_id] = row;
    }
  }
  return rows;
}

/**
 * Path of the curated respelling file for a triple. `corpus.respellOverrides` says
 * whether it exists.
 * @param {string} target @param {string} source @param {string} accent
 */
export function respellOverrideFile(target, source, accent) {
  return `data/respell/overrides/${target}__${source}__${accent}.csv`;
}

/**
 * Hand-curated respellings for one (target, source, accent) triple. Sparse by
 * design: most pairs have none, and the transducer covers the rest.
 * @param {LoadText} loadText @param {string} target @param {string} source @param {string} accent
 */
export async function loadRespellOverrides(loadText, target, source, accent) {
  const rel = respellOverrideFile(target, source, accent);
  /** @type {Record<string,string>} */ const out = {};
  try {
    for (const row of parseTable(await loadText(rel), rel)) out[row.concept_id] = row.respell;
  } catch {
    return out;
  }
  return out;
}

/**
 * A user's item-level edits, layered over the corpus. Overrides replace field
 * values for an existing concept; extras are new items the corpus never had, which
 * is how someone adds their own vocabulary -- or an external model's -- without
 * the corpus having to change.
 * @typedef {Object} SheetEdits
 * @property {Record<string,{values:Partial<Record<import('./types.js').FieldId,string>>, include:boolean}>} overrides
 * @property {{conceptId:string, sectionId:string, template:string, weight:number,
 *            values:Partial<Record<import('./types.js').FieldId,string>>}[]} extras
 */

/**
 * @typedef {Object} PackInput
 * @property {Awaited<ReturnType<typeof loadCorpus>>} corpus
 * @property {Record<string,Record<string,string>>} targetRows
 * @property {Record<string,Record<string,string>>} sourceRows
 * @property {Record<string,string>} respell
 * @property {import('./types.js').SheetSpec} spec
 * @property {SheetEdits} [edits]
 * @property {Record<string,string>} [sectionTitles] headings in the source language;
 *   absent or incomplete falls back to `title_en`
 * @property {Record<string,string>} [emergencyLabels] the service words the region's
 *   numbers are labelled with, in the source language; absent falls back to English
 */

/**
 * Which section carries the local emergency numbers, and the minimum confidence
 * they must have been reviewed to. Wrong numbers here are worse than none.
 */
const EMERGENCY_SECTION = 'emergency-medical';
const MIN_EMERGENCY_CONFIDENCE = 2;

/**
 * The local emergency numbers as a note, or null if this region has none we are
 * willing to print. Returned rather than pushed so the caller can also warn.
 * @param {Awaited<ReturnType<typeof loadCorpus>>} corpus
 * @param {string} regionCode
 * @param {string} [source] the reader's language, for the country name and the frame
 * @param {Record<string,string>} [labels] service words, keyed by their English
 */
export function emergencyNote(corpus, regionCode, source = 'en', labels = {}) {
  const region = corpus.regions[regionCode];
  if (!region || !region.emergency_numbers.trim()) return null;
  if (Number(region.confidence) < MIN_EMERGENCY_CONFIDENCE) {
    return { text: null, region, reason: 'unreviewed' };
  }
  const numbers = region.emergency_numbers.split(';').map((n) => n.trim()).filter(Boolean)
    // `119 fire` -> the number, then the service in the reader's language. The CSV
    // holds the English service word, which doubles as the lookup key: there are ten
    // of them across all 49 regions, and using the English as the key means the
    // registry stays readable and needs no migration when a label is added.
    //
    // The frame carries no preposition, in English or in the three other languages
    // written so far. "In {region}" wanted an article for three of the 49 names --
    // "In United States" -- and in Portuguese a contraction and in Turkish a
    // locative suffix, none of which a frame that never sees the name can supply.
    // A bare `{region}:` under a heading that already says Emergency is right for
    // every country and two characters shorter.
    .map((entry) => {
      const [, digits, label] = /^([\d/]+)\s*(.*)$/.exec(entry) ?? [];
      if (!digits) return entry;
      const service = labels[label] ?? label;
      return service ? `${digits} ${service}` : digits;
    });
  return {
    text: (labels._frame ?? '{region}: {numbers}')
      .replace('{region}', regionName(regionCode, source, region.name_en))
      .replace('{numbers}', numbers.join(' \u00b7 ')),
    region,
    reason: null,
  };
}

/**
 * A country's name in the reader's language. The platform already knows every one
 * of them in every language here -- checked against all 49 regions and all sixteen
 * reader languages -- which is a better answer than 784 cells in a registry file
 * that would go stale. Same argument as `Intl.DisplayNames` for language names.
 * @param {string} code ISO 3166-1 alpha-2
 * @param {string} locale @param {string} fallback
 */
function regionName(code, locale, fallback) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * One reading language's respelling rule table.
 *
 * Keyed on the reader and their accent rather than on the pair, which is the whole
 * point: the table says how *an English speaker* spells a sound, and the sound
 * comes from the target's `ipa` column. That is what makes the respelling column
 * O(N) rather than O(N^2). See `core/respell.js`.
 * @param {LoadText} loadText @param {string} source @param {string} accent
 */
export async function loadRespellRules(loadText, source, accent) {
  return JSON.parse(await loadText(`data/respell/rules/${source}__${accent}.json`));
}

/**
 * What one language calls another, where `Intl.DisplayNames` will not do.
 *
 * ICU answers this for every pair, so the registry only carries what it gets wrong
 * for our purposes -- which is two things. Russian needs the prepositional case,
 * because no nominal frame takes `английский` and there is not even a shared
 * preposition: `по-английски` against `на хинди`. And the seven romanised packs
 * need the *romanisation* of each name, which ICU cannot give at all.
 *
 * `locale` is the language doing the naming -- the language of the cell the name
 * will be written into -- and `bcp47` is the language being named.
 * @param {Record<string,string>[]} rows
 * @returns {Record<string, Record<string,{name:string, roman:string, ipa:string}>>}
 */
function languageNameTable(rows) {
  /** @type {Record<string, Record<string,{name:string, roman:string, ipa:string}>>} */
  const out = {};
  for (const row of rows) {
    (out[row.locale] ??= {})[row.bcp47] = {
      name: row.name, roman: row.romanization, ipa: row.ipa ?? '',
    };
  }
  return out;
}

/** @param {string} bcp47 */
const baseLanguage = (bcp47) => bcp47.split('-')[0];

/**
 * What to write where a cell says `{target}` or `{source}`.
 *
 * Three columns rather than two, because the sheet names a language in three
 * alphabets at once: its own script, its romanisation, and -- since the respelling
 * column is generated from the `ipa` cell -- IPA. Only the registry can answer the
 * last two; `Intl` knows names, not transcriptions, which is why `ipa` has no
 * fallback and an absent one blanks the cell rather than guessing.
 * @param {string} subject the language being named
 * @param {string} locale  the language doing the naming
 * @param {Record<string,{name:string, roman:string, ipa:string}>} overrides
 * @param {'name'|'roman'|'ipa'} which
 */
function languageName(subject, locale, overrides, which) {
  const own = overrides[subject];
  if (which === 'roman') return own?.roman || '';
  if (which === 'ipa') return own?.ipa || '';
  if (own?.name) return own.name;
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(baseLanguage(subject))
      || baseLanguage(subject);
  } catch {
    return baseLanguage(subject);
  }
}

/** Which cells can carry a placeholder. Respellings cannot: they are already
 * curated per pair, so the local word for the reader's language is written into
 * them directly -- and it has to be, because French `par-lay voo zahn-GLEH` carries
 * a liaison that vanishes the moment the language changes.
 *
 * `ipa` can, and has to. The respelling column for the other 256 pairs is generated
 * from this cell, so a slot row with no `ipa` printed a blank respelling: a Russian
 * reader's Japanese sheet showed the kana and the romanisation for
 * `{target}の文を見せてください` and nothing in Cyrillic. `scripts/build_ipa.py` now
 * leaves both slots in the transcription and the name's own IPA goes in here --
 * `{target}` from the 17 rows where a language names itself, `{source}` from the
 * other 272, which is the same mechanism over the whole matrix rather than its
 * diagonal. */
const SLOT_FIELDS = ['text', 'text_alt', 'literal', 'ipa'];
const LANGUAGE_SLOT = /\{(target|source)\}/g;

/**
 * Fill `{target}` and `{source}` in one language's rows.
 *
 * Seven concepts in the bank name a language, and before this they either named
 * the wrong one or named none. `communication.do-you-speak-english` hardcoded
 * English in all sixteen packs, so a Spanish traveller in France held up a card
 * asking whether the waiter spoke *English*; and the gloss of
 * `communication.i-do-not-speak-this-language` named the reader's own language, so
 * on 135 of the 240 pairs it printed something false -- `Je ne parle pas français`
 * glossed as `Ich spreche kein Deutsch`.
 *
 * One rule covers both, and the narrower version of it does not: **a placeholder
 * names which side of the pair, and is rendered in the language of the cell it sits
 * in.** So the French cell `Parlez-vous {source} ?` prints `espagnol` when French is
 * the target and a Spaniard is reading it, and `français` when French is the source
 * -- because then the source *is* French. One cell, both jobs.
 *
 * Two things fall out. A substituted cell can never contain a script its own font
 * stack cannot draw, since a language only ever names another in its own words. And
 * a `note` needs no placeholder at all: it prints source-side only, so both would
 * resolve to constants and prose is clearer.
 *
 * @param {Record<string,Record<string,string>>} rows  one language's rows, mutated
 * @param {Object} args
 * @param {string} args.locale  the language these rows are written in
 * @param {string} args.target
 * @param {string} args.source
 * @param {Record<string,{name:string, roman:string, ipa:string}>} [args.names] the
 *   `locale` row of the registry table, where it has one
 */
export function fillLanguageSlots(rows, { locale, target, source, names = {} }) {
  for (const row of Object.values(rows)) {
    for (const [field, value] of Object.entries(row)) {
      if (!value || !value.includes('{')) continue;
      const which = field.startsWith('romanization_') ? 'roman'
        : /** @type {'name'|'roman'|'ipa'} */ (field === 'ipa' ? 'ipa' : 'name');
      if (which === 'name' && !SLOT_FIELDS.includes(field)) continue;
      let missing = false;
      const filled = value.replace(
        LANGUAGE_SLOT,
        (/** @type {string} */ _, /** @type {string} */ side) => {
          const name = languageName(side === 'target' ? target : source, locale, names, which);
          if (!name) missing = true;
          return name;
        },
      );
      // No name, no cell -- and the test has to be whether the *substitution* was
      // empty rather than whether braces survived it, because `languageName`
      // answers an absent `ipa` with an empty string and not with the placeholder.
      // A cell that kept the sentence and dropped the name would be worse than a
      // blank one: `xoŋ˧ aː˨˩ˀ` respells as a fluent question with the language
      // silently missing, where an empty cell prints the blank column these rows
      // print today.
      row[field] = which === 'ipa' && missing ? '' : filled;
    }
  }
  return rows;
}

/**
 * The service words a region's emergency numbers are labelled with, in the reader's
 * language. Registry rather than `data/i18n/`, for the same reason the section
 * headings are: `core/` renders the sheet and must not reach into the interface's
 * catalogues. Missing file or missing row falls back to the English in the CSV.
 * @param {(rel:string)=>Promise<string>} loadText @param {string} code
 */
export async function loadEmergencyLabels(loadText, code) {
  try {
    const rows = parseTable(await loadText(`data/registry/emergency-labels/${code}.csv`), code);
    return Object.fromEntries(rows.map((r) => [r.label, r.text]));
  } catch (err) {
    if (isMissingFile(err)) return {};
    throw err;
  }
}

/**
 * Assemble ordered blocks for the sheet. A section contributes one heading plus
 * one block per contiguous run of concepts sharing a template, which is how the
 * reference mixes a phrase grid and phrase rows under a single heading.
 * @param {PackInput} input
 * @returns {import('./types.js').Block[]}
 */
export function buildBlocks({
  corpus, targetRows, sourceRows, respell, spec, edits, sectionTitles, emergencyLabels,
}) {
  const { selection } = spec;
  const overrides = edits?.overrides ?? {};
  const extras = edits?.extras ?? [];
  /** @type {import('./types.js').Block[]} */ const blocks = [];

  for (const section of corpus.sections) {
    if (selection.sections[section.section_id] === false) continue;
    const own = (corpus.conceptsByGroup[section.group] ?? [])
      .filter((c) => c.section_id === section.section_id);
    // Custom items join the section they name, after its own concepts.
    const custom = extras
      .filter((e) => e.sectionId === section.section_id)
      .map((e) => ({
        concept_id: e.conceptId,
        section_id: e.sectionId,
        default_template: e.template,
        importance: String(e.weight),
        rank: '9999',
        custom: '1',
      }));
    const concepts = [...own, ...custom]
      .filter((c) => selection.items[c.concept_id] !== false)
      .filter((c) => overrides[c.concept_id]?.include !== false)
      // A few concepts only mean something for one target. The bank was seeded
      // from Chinese and Japanese sheets, so Chinese measure words, the yuan,
      // Japanese counters and "write it in Roman letters" arrived dressed as
      // universal entries -- and a Spanish sheet was printing all of them.
      .filter((c) => appliesTo(c, spec.target))
      // `priority` trims the corpus from the bottom by importance. An item ticked
      // by hand outranks it: the ladder is a bulk default -- "give me the top of
      // the list" -- and a tick in the content tree is a specific instruction, so
      // overriding it would make that checkbox a silent no-op. A custom item
      // carries importance 1, so nothing a reader typed is ever cut.
      .filter((c) => Number(c.importance) >= spec.priority
        || selection.items[c.concept_id] === true)
      .filter((c) => c.custom === '1' || (targetRows[c.concept_id] && sourceRows[c.concept_id]));

    // **One shape at a time inside a section.** A row's template comes from its
    // concept, and a section mixes them freely -- `toilets` is fifteen phrases and
    // ten words -- so in rank order the two shapes alternate row by row: a phrase
    // laid out in two columns with its respelling underneath, then a word in a
    // three-column grid with the respelling beside it, then another phrase. The run
    // loop below already groups *consecutive* rows of one template, so all that was
    // needed was to stop rank order from interleaving them.
    //
    // A stable sort by template, phrases first. Rank still orders the rows inside
    // each group, so nothing about the priority ladder changes; the section simply
    // reads as a block of phrases followed by a block of reference words instead of
    // the two shuffled together. Forcing one template on the whole section was the
    // other option and it is worse both ways: the reference grid is much the more
    // compact of the two, and a long phrase does not fit it.
    // Grouped by the *whole* template name, not just entry-versus-rest: `toilets`
    // and `pharmacy-symptoms` alternate `refphrase` with `ref`, which are two
    // different grids and read as two different shapes. `entry` leads because the
    // phrases are the substance of a section and the reference words are its
    // appendix; the rest keep the order they first appear in, so the arrangement is
    // still the corpus's and not this function's.
    const order = new Map([['entry', 0]]);
    for (const c of concepts) {
      if (!order.has(c.default_template)) order.set(c.default_template, order.size);
    }
    concepts.sort((a, b) => (order.get(a.default_template) ?? 0)
      - (order.get(b.default_template) ?? 0));

    // No rows, no heading. A section is only as wide as the concepts that survive
    // every filter above, and importance is not spread evenly across them --
    // `emergency-medical` is dense with high-importance rows where `hike` has
    // none -- so a priority step empties whole sections. This is the line that
    // stops their headings printing over nothing.
    if (!concepts.length) continue;

    blocks.push({
      kind: 'heading',
      sectionId: section.section_id,
      // The registry's role is the default; the content tree can override it.
      colorRole: spec.sectionColors?.[section.section_id] ?? section.color_role,
      stretch: 0,
      level: /** @type {1|2|3} */ (Number(section.default_level)),
      text: sectionTitles?.[section.section_id] || section.title_en,
      icon: section.icon || null,
    });

    // The reference sheet printed 110/119/120 straight after the emergency
    // heading. Those are facts about the country, not the language, so they come
    // from the region registry and lead the section here too.
    if (section.section_id === EMERGENCY_SECTION) {
      const note = emergencyNote(corpus, spec.region, spec.source, emergencyLabels);
      if (note?.text) {
        blocks.push({
          kind: 'note',
          sectionId: section.section_id,
          colorRole: section.color_role,
          stretch: 0,
          text: note.text,
        });
      }
    }

    /** @type {import('./types.js').Block|null} */ let run = null;
    for (const concept of concepts) {
      const template = concept.default_template;
      if (template === 'note') {
        run = null;
        // A note is prose in the *reader's* language about the target -- Chinese
        // classifiers, Japanese counters -- so its text comes from the source row.
        // A language that has the row but left it blank was drawing an empty
        // bordered box on the card, which is worse than the note being absent: it
        // takes the space and says nothing.
        const text = overrides[concept.concept_id]?.values.gloss
          ?? sourceRows[concept.concept_id].text;
        if (text.trim()) {
          blocks.push({
            kind: 'note',
            sectionId: section.section_id,
            colorRole: section.color_role,
            stretch: 0,
            text,
          });
        }
        continue;
      }
      if (!run || run.templateId !== template) {
        run = {
          kind: 'items',
          sectionId: section.section_id,
          colorRole: section.color_role,
          stretch: 0,
          templateId: template,
          rows: [],
        };
        blocks.push(run);
      }
      /** @type {import('./types.js').ItemRow[]} */ (run.rows).push(itemRow(
        concept,
        targetRows[concept.concept_id],
        sourceRows[concept.concept_id],
        respell,
        spec,
        overrides[concept.concept_id]?.values,
        extras.find((e) => e.conceptId === concept.concept_id)?.values,
      ));
    }
  }
  for (const block of blocks) mergeIdenticalRows(block);
  return blocks;
}

/**
 * Fold together rows whose target text came out the same.
 *
 * Concepts are language-independent, so two of them can land on one word: Spanish
 * says `Buenos días` for both "hello (polite)" and "good morning", and `Buenas
 * noches` for both "good evening" and "good night". Printing the same phrase twice
 * on a pocket card is worse than useless -- it reads as a mistake, and it costs a
 * row that something else could have had.
 *
 * Merging is better than dropping one, because the collapse is itself the lesson:
 * "Buenos días — Hello (polite) / Good morning" tells a reader that Spanish does
 * not make the distinction their own language does. The first row keeps its
 * pronunciation and its concept id; only the gloss grows.
 *
 * Within one block, so the fold never crosses a section or a template: the same
 * word under two different headings is two different pieces of advice.
 * @param {import('./types.js').Block} block
 */
function mergeIdenticalRows(block) {
  if (block.kind !== 'items' || !block.rows?.length) return;
  /** @type {Map<string, import('./types.js').ItemRow>} */ const first = new Map();
  /** @type {import('./types.js').ItemRow[]} */ const kept = [];
  for (const row of block.rows) {
    const key = (row.values.script ?? '').trim();
    const held = key ? first.get(key) : undefined;
    if (!held) {
      if (key) first.set(key, row);
      kept.push(row);
      continue;
    }
    const glosses = new Set(
      [held.values.gloss ?? '', row.values.gloss ?? '']
        .flatMap((g) => g.split(' / ')).map((g) => g.trim()).filter(Boolean),
    );
    const mirrored = held.values.numeral === held.values.gloss;
    held.values.gloss = [...glosses].join(' / ');
    if (mirrored) held.values.numeral = held.values.gloss;
    held.weight = Math.max(held.weight, row.weight);
    held.mergedFrom = [...(held.mergedFrom ?? []), row.conceptId];
  }
  block.rows = kept;
}

/**
 * @param {Record<string,string>} concept
 * @param {Record<string,string>|undefined} target
 * @param {Record<string,string>|undefined} source
 * @param {Record<string,string>} respell
 * @param {import('./types.js').SheetSpec} spec
 * @param {Partial<Record<import('./types.js').FieldId,string>>} [override]
 * @param {Partial<Record<import('./types.js').FieldId,string>>} [custom]
 * @returns {import('./types.js').ItemRow}
 */
function itemRow(concept, target, source, respell, spec, override, custom) {
  const base = {
    script: target?.text ?? '',
    script_alt: target?.text_alt || '',
    roman: target?.[`romanization_${spec.romanization}`] ?? '',
    ipa: target?.ipa || '',
    literal: target?.literal || '',
    gloss: source?.text ?? '',
    // The numeral column of a number table is a source-language label, so it
    // reads from the same cell as the gloss; templates pick one or the other.
    numeral: source?.text ?? '',
    respell: respell[concept.concept_id] ?? '',
  };
  // Blank cells in an edited CSV mean "leave it alone", not "delete it": a user
  // clearing one column by accident should not silently drop content.
  const merged = { ...base };
  for (const layer of [custom, override]) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined && value !== '') merged[/** @type {'script'} */ (key)] = value;
    }
  }
  if (merged.numeral === base.numeral && merged.gloss !== base.gloss) merged.numeral = merged.gloss;
  return { conceptId: concept.concept_id, weight: Number(concept.importance), values: merged };
}

/**
 * Extra breathing room the default sheet asks for, in points at nominal type size.
 *
 * Shared because both default specs have to agree: the app builds one and
 * `scripts/spec.mjs` builds the other for the committed thumbnails, and the last
 * time those two drifted the gallery advertised a sheet nobody could print. It is
 * the setting the panel calls `Normal` -- the reference sheet's own padding is
 * essentially nil, which is right for reproducing it and cramped for reading it.
 */
export const DEFAULT_PADDING = 1.4;

/**
 * The `spec.priority` ladder: how far down the corpus, by `importance`, each step
 * keeps.
 *
 * Here rather than in the panel that draws it, for the same reason
 * `DEFAULT_PADDING` is: these are not opinions about words, they are measurements
 * of what fits, and `tests/solve.test.mjs` asserts them. The panel supplies the
 * captions.
 *
 * Each is the largest cut in the distribution that still fills a real card,
 * measured against every language in `data/coverage.json` at the default spacing:
 *
 *   - `essential` (11 concepts under 5 headings) fits **one phone face at full
 *     nominal type** in every language. That is the whole point of the top step:
 *     one image, set as a lock screen. One phone face holds about 23 concepts with
 *     every field pushed to its script's floor, 18 at the comfort threshold and
 *     14-16 at nominal size -- and the next cut down the distribution, 0.90, is 35
 *     concepts under 12 headings, which overflows one face by 20% even at the
 *     floor. So this is the only step in the distribution that fits one, and it
 *     fits with room rather than by a hair.
 *   - `core` (145) fits one sheet of photo paper: two faces of the 7x5in card.
 *   - `wide` (304) fits two sheets, four faces -- the count both hand-built
 *     reference sheets settled on.
 *   - `all` keeps everything, which is six to eight faces. The default: trimming
 *     the corpus is for fitting a card the content will not fit, and the reference
 *     card is not that card.
 *
 * A floor on importance rather than a count, so the step means the same thing on
 * every pair -- importance belongs to the concept, and every language realises the
 * same bank. Plain `importance` and not the cluster-decayed score in
 * `solve/weights.js`, which measures marginal value against a sheet already chosen:
 * that is the right question when filling whitespace and the wrong one here, where
 * the set has to be stable and nested. It is also unsafe on this corpus --
 * `numbers-money.misc` holds the number line, 0 through 10, as one cluster, so a
 * decay would delete counting from the card. Plain importance is monotone in
 * `cluster_rank` in 110 of the 114 clustered pairs, so a cut takes cluster prefixes
 * anyway: it never offers `hello (polite)` without `hello`.
 */
export const PRIORITY_STEPS = { all: 0, wide: 0.74, core: 0.82, essential: 0.95 };

/**
 * Default selection: every section whose audience tags overlap the reader's
 * interests. With no interests given, everything except the `default_on: 0`
 * sections is on.
 *
 * Typed to the section rows alone rather than to a whole corpus, because
 * `referenceSpec` builds a spec without ever loading one.
 * @param {{sections:Record<string,string>[]}} corpus
 * @param {string[]} interests
 */
export function defaultSelection(corpus, interests = []) {
  /** @type {Record<string,boolean>} */ const sections = {};
  for (const section of corpus.sections) {
    if (interests.length) {
      // The quiz is an explicit request, so it decides on its own and a section's
      // `default_on` does not veto it.
      const tags = section.audience_tags.split(';').filter(Boolean);
      sections[section.section_id] = tags.some((t) => t === 'core' || interests.includes(t));
    } else if (section.default_on === '0') {
      // On the shelf but not on the card. The corpus carries more than a pocket
      // sheet can hold, and a section that a traveler needs once (customs, buying
      // a SIM) or only if it applies to them (chronic medication, travelling with
      // children) should not push the everyday content onto extra paper. One click
      // in the content panel, or one answer in the quiz, brings it back.
      sections[section.section_id] = false;
    }
  }
  return { sections, items: /** @type {Record<string,boolean>} */ ({}) };
}
