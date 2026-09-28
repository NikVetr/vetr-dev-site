// Finding a button by what it says: which buttons can be found, where each one is,
// and how a match is found and ranked. The page's own wiring is in the Playwright specs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { find, reachable } from '../ui/board-search.js';

const PAIR = 'zh-Hans__en';
/** @param {Partial<import('../ui/board-store.js').BoardPersonal>} [data] */
const personal = (data) => ({ schemaVersion: 1, phrases: {}, placements: {}, ...data });

const board = {
  id: 'food',
  rootNodeId: 'main',
  nodes: {
    main: { buttons: [
      { id: 'menu', kind: 'message', phraseRef: { kind: 'corpus', id: 'food.menu' } },
      { id: 'diet', kind: 'submenu', nodeId: 'diet' },
      { id: 'bill', kind: 'message', phraseRef: { kind: 'corpus', id: 'food.bill' } },
    ] },
    diet: { buttons: [
      { id: 'vegan', kind: 'message', phraseRef: { kind: 'corpus', id: 'diet.vegan' } },
      // Back up to the first screen: found once, by the shorter way.
      { id: 'again', kind: 'submenu', nodeId: 'main' },
    ] },
  },
};

test('every button is found with the screens that lead to it, a loop only once', () => {
  const found = reachable([/** @type {any} */ (board)], personal(), PAIR);
  assert.deepEqual(found.map((f) => [f.button.id, f.path.join('/')]), [
    ['menu', 'main'], ['diet', 'main'], ['bill', 'main'], ['vegan', 'main/diet'], ['again', 'main/diet'],
  ]);
});

test('a button switched off is not found, and the reader\'s own are, down their own screens', () => {
  const data = personal({
    phrases: {
      p1: { id: 'p1', label: 'No ice', owner: 'No ice, please', listener: '请不要加冰', pair: PAIR, created: '' },
      s1: { id: 's1', label: 'Mine', owner: '', listener: '', pair: PAIR, created: '', screen: true },
      p2: { id: 'p2', label: 'Spicy', owner: 'Very spicy', listener: '很辣', pair: PAIR, created: '' },
      // Written for another pair: kept, and not on this pair's boards.
      p3: { id: 'p3', label: 'Other', owner: 'Other', listener: 'Otro', pair: 'es__en', created: '' },
    },
    placements: { 'food/main': ['p1', 's1', 'p3'], 'food/s1': ['p2'] },
    hidden: { 'food/main': ['bill'] },
  });
  const found = reachable([/** @type {any} */ (board)], data, PAIR);
  const ids = found.map((f) => f.button.id);
  assert.ok(!ids.includes('bill'));
  assert.ok(!ids.includes('p3'));
  assert.deepEqual(found.find((f) => f.button.id === 'p2')?.path, ['main', 's1']);
  assert.deepEqual(found.find((f) => f.button.id === 'p1')?.button.phraseRef, { kind: 'custom', id: 'p1' });
});

test('a match ignores case and accents as the reader\'s language does, and says where it is', () => {
  const entries = [{ label: 'Café au lait' }, { label: 'The bill, please' }, { label: 'Cafeteria' }];
  const found = find(entries, 'cafe', 'en');
  assert.deepEqual(found.map((f) => [f.label, f.at]), [['Cafeteria', [0, 4]], ['Café au lait', [0, 4]]]);
  assert.deepEqual(find(entries, 'BILL', 'en').map((f) => f.at), [[4, 8]]);
  assert.deepEqual(find(entries, '   ', 'en'), []);
});

test('whole words first: a label starting with it, then a word that does, then the rest', () => {
  const entries = [{ label: 'Please help' }, { label: 'Helpful' }, { label: 'Can you help me?' }, { label: 'Help!' }];
  assert.deepEqual(find(entries, 'help', 'en').map((f) => f.label),
    ['Help!', 'Helpful', 'Please help', 'Can you help me?']);
  // Inside a word comes last.
  assert.deepEqual(find([{ label: 'unhelpful' }, { label: 'help' }], 'help', 'en').map((f) => f.label),
    ['help', 'unhelpful']);
});

test('scripts without spaces are found anywhere in the label', () => {
  const found = find([{ label: '我需要医生' }, { label: '医院在哪里？' }], '医', 'zh-Hans');
  assert.deepEqual(found.map((f) => f.at), [[0, 1], [3, 4]]);
});
