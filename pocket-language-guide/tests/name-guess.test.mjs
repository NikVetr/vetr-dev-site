// A typed name's sounds, guessed from its letters for the sound keyboard to start from.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guessSounds } from '../core/respell.js';
import { parseTable } from '../core/csv.js';

const TABLE = [
  { language: '', script: 'Latn', letters: 'n', sound: 'n' },
  { language: '', script: 'Latn', letters: 'i', sound: 'i' },
  { language: '', script: 'Latn', letters: 'k', sound: 'k' },
  { language: '', script: 'Latn', letters: 'o', sound: 'o' },
  { language: '', script: 'Latn', letters: 'l', sound: 'l' },
  { language: '', script: 'Latn', letters: 'a', sound: 'a' },
  { language: '', script: 'Latn', letters: 'e', sound: 'e' },
  { language: '', script: 'Latn', letters: 's', sound: 's' },
  { language: '', script: 'Latn', letters: 'sh', sound: 'ʃ' },
  { language: '', script: 'Latn', letters: 'j', sound: 'dʒ' },
  { language: '', script: 'Latn', letters: 'u', sound: 'u' },
  { language: '', script: 'Latn', letters: 'x', sound: 'k s' },
  { language: '', script: 'Latn', letters: 'h', sound: 'h' },
  { language: 'es', script: 'Latn', letters: 'j', sound: 'x' },
  { language: 'fr', script: 'Latn', letters: 'h', sound: '' },
];

test('a name is read letter run by letter run, the longest run first', () => {
  assert.equal(guessSounds('Nikolai', TABLE, 'en', 'Latn'), 'nikolai');
  assert.equal(guessSounds('Sasha', TABLE, 'en', 'Latn'), 'saʃa');
  assert.equal(guessSounds('Alex', TABLE, 'en', 'Latn'), 'aleks');
});

test('a language reads a letter its own way, and a silent one adds nothing', () => {
  assert.equal(guessSounds('Juan', TABLE, 'en', 'Latn'), 'dʒuan');
  assert.equal(guessSounds('Juan', TABLE, 'es', 'Latn'), 'xuan');
  assert.equal(guessSounds('Hanna', TABLE, 'fr', 'Latn'), 'anna');
});

test('a run may be read only at a word\'s start or end', () => {
  const edges = [...TABLE, { language: '', script: 'Latn', letters: 'e$', sound: '' },
    { language: 'de', script: 'Latn', letters: '^s', sound: 'ʃ' }];
  assert.equal(guessSounds('Jane', edges, 'en', 'Latn'), 'dʒan');
  assert.equal(guessSounds('Jane Lee', edges, 'en', 'Latn'), 'dʒanle');
  assert.equal(guessSounds('Elena', edges, 'en', 'Latn'), 'elena');
  assert.equal(guessSounds('Sissel', edges, 'de', 'Latn'), 'ʃissel');
});

test('an Indic consonant carries its own vowel unless a sign or virama follows, and Hangul reads by its letters', () => {
  const deva = [['क', 'k'], ['म', 'm'], ['ल', 'l'], ['र', 'r'], ['ा', 'a'], ['ि', 'i'], ['्', ''], ['◌', 'ə']]
    .map(([letters, sound]) => ({ language: '', script: 'Deva', letters, sound }))
    .concat({ language: 'hi', script: 'Deva', letters: '◌$', sound: '' });
  assert.equal(guessSounds('कमल', deva, 'mr', 'Deva'), 'kəmələ');
  // Hindi drops the vowel a word ends on.
  assert.equal(guessSounds('कमल', deva, 'hi', 'Deva'), 'kəməl');
  assert.equal(guessSounds('राम', deva, 'hi', 'Deva'), 'ram');
  assert.equal(guessSounds('क्रिल', deva, 'hi', 'Deva'), 'kril');
  const hangul = [['ᄆ', 'm'], ['ᅵ', 'i'], ['ᆫ', 'n'], ['ᄉ', 's'], ['ᅮ', 'u']]
    .map(([letters, sound]) => ({ language: '', script: 'Kore', letters, sound }));
  assert.equal(guessSounds('민수', hangul, 'ko', 'Kore'), 'minsu');
});

test('a Hangul row composed by the CSV reader still reads, and an apostrophe stays inside its word', () => {
  // 시 as a CSV cell is one syllable; the name arrives as jamo.
  const hangul = [['시', 'ʃ i'], ['ᄆ', 'm'], ['ᅵ', 'i'], ['ᆫ', 'n']]
    .map(([letters, sound]) => ({ language: '', script: 'Kore', letters, sound }));
  assert.equal(guessSounds('시민', hangul, 'ko', 'Kore'), 'ʃimin');
  const uzbek = [...TABLE, { language: 'uz', script: 'Latn', letters: "o'", sound: 'o' },
    { language: 'uz', script: 'Latn', letters: 't', sound: 't' }, { language: 'uz', script: 'Latn', letters: 'r', sound: 'r' }];
  assert.equal(guessSounds("O'tkir", uzbek, 'uz', 'Latn'), 'otkir');
});

test('what the table does not read adds no sound, and another script reads nothing here', () => {
  assert.equal(guessSounds('Ana-Lou', TABLE, 'en', 'Latn'), 'analou');
  assert.equal(guessSounds('Ника', TABLE, 'ru', 'Latn'), '');
});

test('the shipped table reads j as a Spanish reader does, and a doubled letter once unless the reader\'s language makes it long', async () => {
  const rel = 'data/registry/name-letters.csv';
  const table = parseTable(await readFile(rel, 'utf8'), rel);
  assert.equal(guessSounds('Jorge', table, 'es', 'Latn'), 'xorxe');
  assert.equal(guessSounds('Matteo', table, 'en', 'Latn'), 'mateo');
  assert.equal(guessSounds('Matteo', table, 'it', 'Latn'), 'matteo');
});

test('the shipped table reads German st as ʃt only where it begins a word', async () => {
  const rel = 'data/registry/name-letters.csv';
  const table = parseTable(await readFile(rel, 'utf8'), rel);
  assert.equal(guessSounds('Stefan', table, 'de', 'Latn'), 'ʃtefan');
  assert.equal(guessSounds('Sebastian', table, 'de', 'Latn'), 'sebastian');
});

test('the shipped table keeps a Marathi name\'s last vowel after a conjunct, and drops it elsewhere', async () => {
  const rel = 'data/registry/name-letters.csv';
  const table = parseTable(await readFile(rel, 'utf8'), rel);
  assert.equal(guessSounds('राजेंद्र', table, 'mr', 'Deva'), 'radʒendrə');
});

test('the shipped table reads Hangul g as k where a name starts and moves a final onto a silent ᄋ, voiced', async () => {
  const rel = 'data/registry/name-letters.csv';
  const table = parseTable(await readFile(rel, 'utf8'), rel);
  assert.equal(guessSounds('김석우', table, 'ko', 'Kore'), 'kimsəɡu');
});

test('the shipped table reads only into the keyboard\'s own sounds, for scripts and languages there are', async () => {
  const { SOUNDS } = await import('../ui/board-menu.js');
  const read = async (/** @type {string} */ rel) => parseTable(await readFile(rel, 'utf8'), rel);
  const scripts = new Set((await read('data/registry/scripts.csv')).map((r) => r.iso15924));
  const languages = new Set((await read('data/registry/languages.csv')).map((r) => r.bcp47));
  for (const row of await read('data/registry/name-letters.csv')) {
    const where = `${row.language || '*'} ${row.script} ${row.letters}`;
    assert.ok(scripts.has(row.script), `${where}: no script ${row.script}`);
    assert.ok(!row.language || languages.has(row.language), `${where}: no language ${row.language}`);
    // The CSV reader composes every cell, so Hangul's rows, decomposed on disk, are the
    // validator's to check as written; read back, every row is NFC.
    assert.equal(row.letters, row.letters.normalize('NFC').toLowerCase(), `${where}: letters must be lower-case NFC`);
    for (const sound of row.sound.split(' ').filter(Boolean)) {
      assert.ok(SOUNDS.includes(sound), `${where}: ${sound} is not a key on the sound keyboard`);
    }
  }
});
