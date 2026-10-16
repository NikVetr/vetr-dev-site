import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_LINKS, personalPrompt, responseCsv } from '../ui/quiz-personal.js';
import { importSheetCsv, CSV_HEADER } from '../ui/io.js';
import { applyQuiz } from '../ui/quiz.js';

test('a personal prompt includes only supplied details and the real import contract', () => {
  const prompt = personalPrompt({
    target: 'ja', source: 'en', sections: [{ section_id: 'introductions' }],
    personal: { name: '  Alex  ', country: '', profession: 'engineer', school: '' },
    interests: ['outdoors'], proficiency: 'some', carry: 'one', breadth: 'basics',
    speaker: { speaker_gender: 'feminine' },
  });
  assert.ok(prompt.includes('Target language: ja; reader/gloss language: en'));
  assert.ok(prompt.includes('{"name":"Alex","profession":"engineer"}'));
  assert.ok(!prompt.includes('"country":'));
  assert.ok(prompt.includes(CSV_HEADER.join(',')));
  assert.ok(prompt.includes('introductions'));
  assert.ok(prompt.includes('speaker_gender'));
  assert.ok(MODEL_LINKS.every(({ href }) => !new URL(href).search));
});

test('model CSV fences are unwrapped, then the shared importer checks every row', () => {
  const csv = CSV_HEADER.join(',') + '\ncustom.personal.name,introductions,entry,yes,アレックスです,,,I am Alex,,0.8,custom';
  assert.equal(responseCsv('```csv\n' + csv + '\n```'), csv);
  assert.equal(responseCsv(csv), csv);
  const imported = importSheetCsv(responseCsv('```csv\n' + csv + '\n```'),
    { concepts: {}, sectionById: { introductions: {} } }, { overrides: {}, extras: [] });
  assert.deepEqual(imported.problems, []);
  assert.equal(imported.added, 1);
  assert.equal(imported.edits.extras[0].values.script, 'アレックスです');
  assert.throws(() => responseCsv('Here is your CSV:\n```csv\n' + csv + '\n```'), /only the CSV/);
  assert.throws(() => responseCsv(''), /Paste a CSV/);
  assert.throws(() => importSheetCsv(responseCsv('target_text,gloss\na,b'),
    { concepts: {}, sectionById: {} }, { overrides: {}, extras: [] }), /missing column/);
});

test('carry limits and basics affect the real sheet settings without mutating the original', () => {
  const spec = /** @type {any} */ ({ target: 'es', source: 'en', geometry: { faces: 8 }, selection: { sections: {}, items: {} } });
  const corpus = /** @type {any} */ ({ romanLegends: {}, sections: [], concepts: {}, conceptsByGroup: {} });
  const choices = { interests: [], proficiency: /** @type {const} */ ('reading'), print: /** @type {const} */ ('pocket'),
    carry: /** @type {const} */ ('one'), breadth: /** @type {const} */ ('basics') };
  const result = applyQuiz(spec, corpus, choices);
  assert.equal(result.geometry.faces, 2);
  assert.equal(result.autoFaces, false);
  assert.equal(result.priority, 0.65);
  assert.equal(spec.geometry.faces, 8);
  assert.equal(applyQuiz({ ...spec, geometry: { ...spec.geometry, screen: true } }, corpus, choices).geometry.faces, 1);
  assert.equal(applyQuiz(spec, corpus, { ...choices, carry: 'any', breadth: 'broad' }).autoFaces, true);
});
