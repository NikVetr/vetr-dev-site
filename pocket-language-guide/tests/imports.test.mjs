import test from 'node:test';
import assert from 'node:assert/strict';
import { importSheetCsv, CSV_HEADER, setItemInclusion, itemIncluded, sheetCsvRecords } from '../ui/io.js';
import { serialize } from '../core/csv.js';
import { buildBlocks } from '../core/pack.js';
import { faceToSvg } from '../render/svg.js';

test('reimporting a custom row replaces both its wording and exclusion', () => {
  const corpus = { concepts: {}, sectionById: { basics: {} } };
  const csv = (/** @type {string} */ include, /** @type {string} */ text) => serialize(CSV_HEADER, [{
    concept_id: 'custom.one', section_id: 'basics', template: 'entry', include,
    target_text: text, gloss: 'Hello', importance: '0.5',
  }]);
  const first = importSheetCsv(csv('no', 'old'), corpus, { overrides: {}, extras: [] });
  const next = importSheetCsv(csv('yes', 'new'), corpus, first.edits);
  assert.deepEqual(next.problems, []);
  assert.equal(next.edits.extras.length, 1);
  assert.equal(next.edits.overrides['custom.one'].include, true);
  assert.equal(next.edits.overrides['custom.one'].values.script, 'new');
  assert.equal(next.edits.extras[0].values.script, 'new');
  assert.equal(importSheetCsv(csv('yes', 'new').replace('entry', 'missing'), corpus, first.edits).problems.length, 1);
});

test('checkbox choices can reenable legacy imported exclusions without losing wording', () => {
  const section = { section_id: 'basics', group: 'basics', color_role: 'comm', default_level: '1' };
  const concept = { concept_id: 'basics.hello', section_id: 'basics', default_template: 'entry', importance: '1' };
  const corpus = /** @type {any} */ ({ sections: [section], sectionById: { basics: section },
    concepts: { 'basics.hello': concept }, conceptsByGroup: { basics: [concept] } });
  const text = serialize(CSV_HEADER, [{ concept_id: 'basics.hello', section_id: 'basics', template: 'entry',
    include: 'no', target_text: 'Buenas', gloss: 'Hello', importance: '1' }]);
  const imported = importSheetCsv(text, corpus, { overrides: {}, extras: [] });
  const spec = /** @type {any} */ ({ target: 'es', source: 'en', priority: 0, romanization: '',
    selection: { sections: {}, items: { 'basics.hello': true } } });
  assert.equal(itemIncluded(spec, imported.edits, 'basics.hello', 'basics'), false);
  const edits = setItemInclusion(imported.edits, { 'basics.hello': true });
  assert.equal(imported.edits.overrides['basics.hello'].include, false, 'do not mutate the stored snapshot');
  const blocks = buildBlocks({ corpus, spec, edits, respell: {},
    targetRows: { 'basics.hello': { text: 'Hola' } }, sourceRows: { 'basics.hello': { text: 'Hello' } } });
  assert.equal(itemIncluded(spec, edits, 'basics.hello', 'basics'), true);
  assert.equal(blocks.flatMap((b) => b.rows ?? [])[0].values.script, 'Buenas');
});

test('custom CSV inclusion follows item and section selection and preserves current text', () => {
  const id = 'custom.one';
  const corpus = /** @type {any} */ ({ sections: [], concepts: {}, sectionById: { basics: {} } });
  const edits = { extras: [{ conceptId: id, sectionId: 'basics', template: 'entry', weight: 1,
    values: { script: 'Hola', gloss: 'Hello' } }],
  overrides: { [id]: { include: true, values: { script: 'Buenas', gloss: 'Hi' } } } };
  const spec = /** @type {any} */ ({ target: 'es', source: 'en', selection: { sections: {}, items: {} } });
  const records = () => sheetCsvRecords({ corpus, spec, edits, blocks: [] });
  assert.equal(records()[0].include, 'yes');
  spec.selection.items[id] = false;
  assert.equal(records()[0].include, 'no');
  spec.selection.items[id] = true;
  spec.selection.sections.basics = false;
  const off = records();
  assert.equal(off[0].include, 'no');
  assert.equal(off[0].target_text, 'Buenas');
  const roundTrip = importSheetCsv(serialize(CSV_HEADER, off), corpus, edits);
  assert.equal(roundTrip.edits.overrides[id].include, false);
  assert.equal(roundTrip.edits.extras[0].values.script, 'Buenas');
});

test('every SVG string attribute stays inside its quoted value', () => {
  const attack = '#000000"/><image href="x" onerror="globalThis.injected=1"/>';
  const face = {
    rects: [{ x: 0, y: 0, w: 1, h: 1, fill: attack }], paths: [], hits: [],
    icons: [{ x: 0, y: 0, size: 1, name: 'x', fill: attack }],
    runs: [{ x: 0, y: 0, size: 1, text: '<hello>', fontId: 'f', fill: attack,
      bold: false, italic: false, dir: /** @type {const} */ ('ltr') }],
  };
  const svg = faceToSvg(face, /** @type {any} */ ({ pageW: 10, pageH: 10 }), {
    background: attack, faces: { f: { family: attack, weight: 400, italic: false, stack: 'latin' } },
    icons: { viewBox: 24, strokeWidth: 1, linecap: attack, linejoin: attack, paths: { x: [attack] } },
  });
  assert(!svg.includes('<image'));
  assert(!svg.includes('onerror="'));
  assert(svg.includes('&lt;hello&gt;'));
  assert(svg.includes('&quot;/&gt;&lt;image'));
});
