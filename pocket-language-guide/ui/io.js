// CSV round-trip for item-level editing.
//
// The export is the whole sheet, one row per item, with every field the renderer
// uses. Hand it to a spreadsheet or paste it into a chat with content/LLM_SPEC.md,
// change what you like, import it back. Rows match on concept_id, so a re-import
// updates in place instead of duplicating; a row with a new id becomes a custom
// item in the section it names.

import { parseTable, serialize, stripFormulaGuard } from '../core/csv.js';
import { download } from './app.js';

const EDIT_KEY = 'plg.edits';

export const CSV_HEADER = [
  'concept_id', 'section_id', 'template', 'include',
  'target_text', 'romanization', 'ipa', 'gloss', 'respell',
  'importance', 'notes',
];

/** @typedef {import('../core/pack.js').SheetEdits} SheetEdits */

/** @param {string} target @param {string} source @returns {SheetEdits} */
export function loadEdits(target, source) {
  try {
    const raw = localStorage.getItem(`${EDIT_KEY}.${target}__${source}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { overrides: parsed.overrides ?? {}, extras: parsed.extras ?? [] };
    }
  } catch {
    // A corrupt entry should not brick the studio; start clean instead.
  }
  return { overrides: {}, extras: [] };
}

/** @param {string} target @param {string} source @param {SheetEdits} edits */
export function saveEdits(target, source, edits) {
  localStorage.setItem(`${EDIT_KEY}.${target}__${source}`, JSON.stringify(edits));
}

/** @param {string} target @param {string} source */
export function clearEdits(target, source) {
  localStorage.removeItem(`${EDIT_KEY}.${target}__${source}`);
}

/**
 * @param {Object} input
 * @param {any} input.corpus
 * @param {import('../core/types.js').Block[]} input.blocks
 * @param {import('../core/types.js').SheetSpec} input.spec
 * @param {SheetEdits} input.edits
 * @param {string} input.name
 */
export function exportSheetCsv({ corpus, blocks, spec, edits, name }) {
  const included = new Set(blocks.flatMap((b) => (b.rows ?? []).map((r) => r.conceptId)));
  /** @type {Map<string, import('../core/types.js').ItemRow & {templateId:string, sectionId:string}>} */
  const rows = new Map();
  for (const block of blocks) {
    for (const row of block.rows ?? []) {
      rows.set(row.conceptId, {
        ...row, templateId: block.templateId ?? 'entry', sectionId: block.sectionId,
      });
    }
  }

  /** @type {Record<string,string>[]} */ const records = [];
  for (const section of corpus.sections) {
    for (const concept of corpus.conceptsByGroup[section.group] ?? []) {
      if (concept.section_id !== section.section_id) continue;
      const row = rows.get(concept.concept_id);
      // Items the pair cannot render at all are left out; there is nothing to edit.
      if (!row && !edits.overrides[concept.concept_id]) continue;
      const values = row?.values ?? {};
      records.push({
        concept_id: concept.concept_id,
        section_id: concept.section_id,
        template: concept.default_template,
        include: included.has(concept.concept_id) ? 'yes' : 'no',
        target_text: values.script ?? '',
        romanization: values.roman ?? '',
        ipa: values.ipa ?? '',
        gloss: values.gloss ?? '',
        respell: values.respell ?? '',
        importance: concept.importance,
        notes: concept.notes ?? '',
      });
    }
  }
  for (const extra of edits.extras) {
    records.push({
      concept_id: extra.conceptId,
      section_id: extra.sectionId,
      template: extra.template,
      include: 'yes',
      target_text: extra.values.script ?? '',
      romanization: extra.values.roman ?? '',
      ipa: extra.values.ipa ?? '',
      gloss: extra.values.gloss ?? '',
      respell: extra.values.respell ?? '',
      importance: String(extra.weight),
      notes: 'custom',
    });
  }

  download(
    new Blob([serialize(CSV_HEADER, records, { bom: true })], { type: 'text/csv;charset=utf-8' }),
    `${name}-${spec.target}-${spec.source}.csv`,
  );
}

/**
 * Apply an edited CSV. Unknown concept_ids become custom items, which is how a
 * user or an external model adds vocabulary without touching the corpus.
 * @param {string} text
 * @param {any} corpus
 * @param {SheetEdits} current
 * @returns {{edits:SheetEdits, updated:number, added:number, problems:string[]}}
 */
export function importSheetCsv(text, corpus, current) {
  const rows = parseTable(text, 'import');
  const missing = CSV_HEADER.filter((h) => !(h in (rows[0] ?? {})));
  if (!rows.length) throw new Error('the file has no data rows');
  if (missing.length) throw new Error(`missing column(s): ${missing.join(', ')}`);

  /** @type {SheetEdits} */
  const edits = { overrides: { ...current.overrides }, extras: [...current.extras] };
  /** @type {string[]} */ const problems = [];
  let updated = 0;
  let added = 0;

  const clean = (/** @type {string} */ v) => stripFormulaGuard(v ?? '').trim();

  for (const [i, row] of rows.entries()) {
    const id = clean(row.concept_id);
    const line = i + 2;
    if (!id) {
      problems.push(`row ${line}: no concept_id`);
      continue;
    }
    const values = {
      script: clean(row.target_text),
      roman: clean(row.romanization),
      ipa: clean(row.ipa),
      gloss: clean(row.gloss),
      respell: clean(row.respell),
    };
    const include = clean(row.include).toLowerCase();
    const on = include === '' || ['yes', 'y', 'true', '1'].includes(include);

    if (corpus.concepts[id]) {
      edits.overrides[id] = { values, include: on };
      updated += 1;
      continue;
    }
    const sectionId = clean(row.section_id);
    if (!corpus.sectionById[sectionId]) {
      problems.push(`row ${line}: unknown section_id "${sectionId}" for new item "${id}"`);
      continue;
    }
    if (!values.script || !values.gloss) {
      problems.push(`row ${line}: new item "${id}" needs both target_text and gloss`);
      continue;
    }
    const weight = Number(clean(row.importance));
    edits.extras = edits.extras.filter((e) => e.conceptId !== id);
    edits.extras.push({
      conceptId: id,
      sectionId,
      template: clean(row.template) || 'entry',
      weight: Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0.5,
      values,
    });
    added += 1;
  }

  return { edits, updated, added, problems };
}
