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

test('the shipped table reads only into the keyboard\'s own sounds, for scripts and languages there are', async () => {
  const { SOUNDS } = await import('../ui/board-menu.js');
  const read = async (/** @type {string} */ rel) => parseTable(await readFile(rel, 'utf8'), rel);
  const scripts = new Set((await read('data/registry/scripts.csv')).map((r) => r.iso15924));
  const languages = new Set((await read('data/registry/languages.csv')).map((r) => r.bcp47));
  for (const row of await read('data/registry/name-letters.csv')) {
    const where = `${row.language || '*'} ${row.script} ${row.letters}`;
    assert.ok(scripts.has(row.script), `${where}: no script ${row.script}`);
    assert.ok(!row.language || languages.has(row.language), `${where}: no language ${row.language}`);
    assert.equal(row.letters, row.letters.normalize('NFC').toLowerCase(), `${where}: letters must be lower-case NFC`);
    for (const sound of row.sound.split(' ').filter(Boolean)) {
      assert.ok(SOUNDS.includes(sound), `${where}: ${sound} is not a key on the sound keyboard`);
    }
  }
});
