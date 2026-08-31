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
  const sectionRows = await read('data/registry/sections.csv');
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
    paper,
    sections: sectionRows,
    sectionById: index(sectionRows, 'section_id'),
    groups,
    conceptsByGroup,
    concepts: index(Object.values(conceptsByGroup).flat(), 'concept_id'),
  };
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
    } catch {
      continue;
    }
    for (const row of parseTable(text, `data/lang/${bcp47}/${group}.csv`)) {
      rows[row.concept_id] = row;
    }
  }
  return rows;
}

/**
 * Hand-curated respellings for one (target, source, accent) triple. Sparse by
 * design: the transducer covers the rest.
 * @param {LoadText} loadText @param {string} target @param {string} source @param {string} accent
 */
export async function loadRespellOverrides(loadText, target, source, accent) {
  const rel = `data/respell/overrides/${target}__${source}__${accent}.csv`;
  /** @type {Record<string,string>} */ const out = {};
  try {
    for (const row of parseTable(await loadText(rel), rel)) out[row.concept_id] = row.respell;
  } catch {
    return out;
  }
  return out;
}

/**
 * @typedef {Object} PackInput
 * @property {Awaited<ReturnType<typeof loadCorpus>>} corpus
 * @property {Record<string,Record<string,string>>} targetRows
 * @property {Record<string,Record<string,string>>} sourceRows
 * @property {Record<string,string>} respell
 * @property {import('./types.js').SheetSpec} spec
 */

/**
 * Assemble ordered blocks for the sheet. A section contributes one heading plus
 * one block per contiguous run of concepts sharing a template, which is how the
 * reference mixes a phrase grid and phrase rows under a single heading.
 * @param {PackInput} input
 * @returns {import('./types.js').Block[]}
 */
export function buildBlocks({ corpus, targetRows, sourceRows, respell, spec }) {
  const { selection } = spec;
  /** @type {import('./types.js').Block[]} */ const blocks = [];

  for (const section of corpus.sections) {
    if (selection.sections[section.section_id] === false) continue;
    const concepts = (corpus.conceptsByGroup[section.group] ?? [])
      .filter((c) => c.section_id === section.section_id)
      .filter((c) => selection.items[c.concept_id] !== false)
      .filter((c) => targetRows[c.concept_id] && sourceRows[c.concept_id]);
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
          text: sourceRows[concept.concept_id].text,
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
      /** @type {import('./types.js').ItemRow[]} */ (run.rows).push(
        itemRow(concept, targetRows[concept.concept_id], sourceRows[concept.concept_id], respell, spec),
      );
    }
  }
  return blocks;
}

/**
 * @param {Record<string,string>} concept
 * @param {Record<string,string>} target
 * @param {Record<string,string>} source
 * @param {Record<string,string>} respell
 * @param {import('./types.js').SheetSpec} spec
 * @returns {import('./types.js').ItemRow}
 */
function itemRow(concept, target, source, respell, spec) {
  return {
    conceptId: concept.concept_id,
    weight: Number(concept.importance),
    values: {
      script: target.text,
      script_alt: target.text_alt || '',
      roman: target[`romanization_${spec.romanization}`] ?? '',
      ipa: target.ipa || '',
      literal: target.literal || '',
      gloss: source.text,
      // The numeral column of a number table is a source-language label, so it
      // reads from the same cell as the gloss; templates pick one or the other.
      numeral: source.text,
      respell: respell[concept.concept_id] ?? '',
    },
  };
}

/**
 * Default selection: every section whose audience tags overlap the reader's
 * interests. With no interests given, everything is on.
 * @param {Awaited<ReturnType<typeof loadCorpus>>} corpus
 * @param {string[]} interests
 */
export function defaultSelection(corpus, interests = []) {
  /** @type {Record<string,boolean>} */ const sections = {};
  if (interests.length) {
    for (const section of corpus.sections) {
      const tags = section.audience_tags.split(';').filter(Boolean);
      sections[section.section_id] = tags.some((t) => t === 'core' || interests.includes(t));
    }
  }
  return { sections, items: /** @type {Record<string,boolean>} */ ({}) };
}
