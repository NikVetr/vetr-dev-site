// A template's words that agree with what fills its slot: `[el|la]`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAlternates, printed, alternatives, joinAlternates, perAlternative, printedAlternatives,
} from '../core/alternation.js';

const NEAREST = '¿Dónde está [el|la] {} más cercan[o|a]?';

test('a cell prints its alternatives joined, and says where each group sits', () => {
  const { text, groups } = parseAlternates(NEAREST);
  assert.equal(text, '¿Dónde está el/la {} más cercano/a?');
  assert.deepEqual(groups, [{ at: 12, alts: ['el', 'la'] }, { at: 31, alts: ['o', 'a'] }]);
  assert.equal(text.slice(31, 34), 'o/a');
  // A placeholder word in brackets is not a group: there is no alternative in it.
  assert.equal(printed('want to [verb]'), 'want to [verb]');
});

test('each gender says the whole sentence, from the cell or from its printed form', () => {
  const said = ['¿Dónde está el {} más cercano?', '¿Dónde está la {} más cercana?'];
  assert.deepEqual(alternatives(NEAREST), said);
  const { text, groups } = parseAlternates(NEAREST);
  assert.deepEqual(printedAlternatives(text, groups), said);
  assert.deepEqual(alternatives('Hola'), ['Hola']);
  assert.deepEqual(printedAlternatives('Hola', undefined), ['Hola']);
});

test('readings join back word by word, sharing a word\'s start only when it is a real stem', () => {
  assert.equal(joinAlternates(['dˈonde estˈa el {} mˈas θeɾkˈano', 'dˈonde estˈa la {} mˈas θeɾkˈana']),
    'dˈonde estˈa [el|la] {} mˈas θeɾkˈan[o|a]');
  // Three genders, and a shared `d` too short to be a stem.
  assert.equal(joinAlternates(['voː ɪst deːɐ̯ {}', 'voː ɪst diː {}', 'voː ɪst das {}']),
    'voː ɪst [deːɐ̯|diː|das] {}');
  // A respelling of each, joined the same way.
  assert.equal(perAlternative('[el|la] cercan[o|a]', (s) => s.toUpperCase()), '[EL|LA] CERCAN[O|A]');
  assert.throws(() => joinAlternates(['a b', 'a b c']), /line up word for word/);
});

test('a card prints a template\'s alternatives joined, each in its gender\'s colour', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createSheetContext, buildSheet } = await import('../core/sheet.js');
  const { referenceSpec } = await import('../scripts/spec.mjs');
  const ctx = await createSheetContext({ loadText: (rel) => readFile(rel, 'utf8'), loadBytes: (rel) => readFile(rel) });
  const blue = '#1f5fae';
  const red = '#c2185b';
  ctx.corpus.genders.es = [{ gender: 'masculine', color: blue }, { gender: 'feminine', color: red }];
  const spec = await referenceSpec('es', 'en');
  // Through a reader's own edit, which takes the same road a corpus row does.
  const edits = {
    overrides: { 'directions.where-is-the-nearest': { values: { script: NEAREST }, include: true } },
    extras: [],
  };
  const built = await buildSheet(ctx, spec, edits);
  /** @type {any[]} */ const runs = [];
  const walk = (/** @type {any} */ node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (typeof node.text === 'string' && typeof node.fill === 'string' && 'fontId' in node) runs.push(node);
      Object.values(node).forEach(walk);
    }
  };
  walk(built.plan);
  const gender = (/** @type {any} */ r) => (r.fill === blue ? 'm' : r.fill === red ? 'f' : '');
  const el = runs.findIndex((r, i) => [r, runs[i + 1], runs[i + 2]].map((x) => x?.text).join('') === 'el/la');
  assert.deepEqual(runs.slice(el, el + 3).map((r) => [r.text, gender(r)]), [['el', 'm'], ['/', ''], ['la', 'f']]);
  const at = runs.findIndex((r) => r.text === 'cercan');
  const word = runs.slice(at, at + 5);
  assert.deepEqual(word.map((r) => [r.text, gender(r)]),
    [['cercan', ''], ['o', 'm'], ['/', ''], ['a', 'f'], ['?', '']]);
  // One word still: side by side in reading order, on one baseline.
  assert.ok(word.every((r, i) => i === 0 || r.x > word[i - 1].x));
  assert.equal(new Set(word.map((r) => r.y)).size, 1);
});
