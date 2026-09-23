import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE, encode, decode, toUnits, unitMs } from '../core/morse.js';

test('the table is the ITU one, and every code is unique', () => {
  assert.equal(CODE.S, '...');
  assert.equal(CODE.O, '---');
  assert.equal(CODE['?'], '..--..');
  const codes = Object.values(CODE);
  assert.equal(new Set(codes).size, codes.length, 'two characters share a code');
  assert.equal(Object.keys(CODE).length, 26 + 10 + 18);
});

test('text becomes dots and dashes the way a published table lays them out', () => {
  assert.equal(encode('SOS').code, '... --- ...');
  assert.equal(encode('help me').code, '.... . .-.. .--. / -- .');
  // Case and diacritics fold, because an operator folds them.
  assert.equal(encode('Élan').code, encode('ELAN').code);
  assert.deepEqual(encode('SOS').unsayable, []);
});

test('what Morse cannot say is dropped and named, never guessed', () => {
  const { code, unsayable } = encode('救命 SOS');
  assert.equal(code, '... --- ...');
  assert.deepEqual(unsayable, ['救', '命']);
});

test('dots and dashes come back as text, and an unknown group as a query', () => {
  assert.equal(decode('... --- ...'), 'SOS');
  assert.equal(decode('.... . .-.. .--. / -- .'), 'HELP ME');
  assert.equal(decode('.... .-.-.-.-'), 'H?');
  assert.equal(decode(encode('Where is the hospital?').code), 'WHERE IS THE HOSPITAL?');
});

test('the unit list is the standard timing, and SOS is the one the beacon had by hand', () => {
  // dot 1, gap 1, dot, gap, dot, letter gap 3, dash 3 ... letter gap, dots, then 7.
  assert.deepEqual(toUnits('SOS'), [
    1, 0, 1, 0, 1, 0, 0, 0,
    3, 0, 3, 0, 3, 0, 0, 0,
    1, 0, 1, 0, 1,
    0, 0, 0, 0, 0, 0, 0,
  ]);
  // A word gap is seven dark units, not three plus three.
  const two = toUnits('E E');
  assert.deepEqual(two, [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(toUnits(''), []);
});

test('a unit is PARIS-timed, and five words a minute stays under three flashes a second', () => {
  assert.equal(unitMs(5), 240);
  assert.equal(unitMs(20), 60);
  // The fastest strobe is a run of dots: one unit on, one off. At 5 wpm that is
  // 480ms a cycle, just over two flashes a second.
  assert.ok(1000 / (2 * unitMs(5)) < 3);
});
