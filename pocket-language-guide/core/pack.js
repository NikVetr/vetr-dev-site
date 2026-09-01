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
 */
export function emergencyNote(corpus, regionCode) {
  const region = corpus.regions[regionCode];
  if (!region || !region.emergency_numbers.trim()) return null;
  if (Number(region.confidence) < MIN_EMERGENCY_CONFIDENCE) {
    return { text: null, region, reason: 'unreviewed' };
  }
  const numbers = region.emergency_numbers.split(';').map((n) => n.trim()).filter(Boolean);
  return { text: `In ${region.name_en}: ${numbers.join(' · ')}`, region, reason: null };
}

/**
 * Assemble ordered blocks for the sheet. A section contributes one heading plus
 * one block per contiguous run of concepts sharing a template, which is how the
 * reference mixes a phrase grid and phrase rows under a single heading.
 * @param {PackInput} input
 * @returns {import('./types.js').Block[]}
 */
export function buildBlocks({ corpus, targetRows, sourceRows, respell, spec, edits }) {
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
      .filter((c) => c.custom === '1' || (targetRows[c.concept_id] && sourceRows[c.concept_id]));
    if (!concepts.length) continue;

    blocks.push({
      kind: 'heading',
      sectionId: section.section_id,
      colorRole: section.color_role,
      stretch: 0,
      level: /** @type {1|2|3} */ (Number(section.default_level)),
      text: section.title_en,
      icon: section.icon || null,
    });

    // The reference sheet printed 110/119/120 straight after the emergency
    // heading. Those are facts about the country, not the language, so they come
    // from the region registry and lead the section here too.
    if (section.section_id === EMERGENCY_SECTION) {
      const note = emergencyNote(corpus, spec.region);
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
        blocks.push({
          kind: 'note',
          sectionId: section.section_id,
          colorRole: section.color_role,
          stretch: 0,
          text: overrides[concept.concept_id]?.values.gloss
            ?? sourceRows[concept.concept_id].text,
        });
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
  return blocks;
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
