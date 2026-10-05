// What the quiz keeps: the record per pair and per row, its windows, and the choice of rows.
import test from 'node:test';
import assert from 'node:assert/strict';

/** A `localStorage` for the store to write to, and a clock the test moves. */
const held = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (/** @type {string} */ k) => (held.has(k) ? held.get(k) : null),
  setItem: (/** @type {string} */ k, /** @type {string} */ v) => { held.set(k, String(v)); },
  removeItem: (/** @type {string} */ k) => { held.delete(k); },
  key: (/** @type {number} */ i) => [...held.keys()][i] ?? null,
  get length() { return held.size; },
});
const DAY = 86_400_000;
let now = Date.UTC(2026, 8, 1, 12);
Date.now = () => now;

const {
  forgetDrill, loadPick, pairRecord, recordAnswer, savePick, tallyOver, toPractise,
} = await import('../ui/drill-store.js');

test('an answer counts in every window that holds it, and only in its own pair', async () => {
  await forgetDrill();
  await recordAnswer('zh-Hans__en', 'social-basics.hello', 'right');
  now += 10 * DAY;
  await recordAnswer('zh-Hans__en', 'social-basics.hello', 'wrong');
  await recordAnswer('zh-Hans__en', 'toilets.where-toilet', 'marks');
  await recordAnswer('ja__en', 'social-basics.hello', 'right');
  const record = pairRecord('zh-Hans__en');
  assert.deepEqual(tallyOver(record, 'week'), [0, 1, 1]);
  assert.deepEqual(tallyOver(record, 'month'), [1, 1, 1]);
  assert.deepEqual(tallyOver(record, 'all'), [1, 1, 1]);
  assert.deepEqual(record.rows['social-basics.hello'].n, [1, 0, 1]);
  assert.deepEqual(tallyOver(pairRecord('ja__en'), 'all'), [1, 0, 0]);
});

test('days past a year are dropped, and all time keeps them', async () => {
  await forgetDrill();
  await recordAnswer('zh-Hans__en', 'social-basics.hello', 'wrong');
  now += 400 * DAY;
  await recordAnswer('zh-Hans__en', 'social-basics.hello', 'right');
  const record = pairRecord('zh-Hans__en');
  assert.equal(Object.keys(record.days).length, 1);
  assert.deepEqual(tallyOver(record, 'year'), [1, 0, 0]);
  assert.deepEqual(tallyOver(record, 'all'), [1, 0, 1]);
});

test('a row is to practise until it is answered right, the most missed first', async () => {
  await forgetDrill();
  const pair = 'zh-Hans__en';
  await recordAnswer(pair, 'a', 'wrong');
  await recordAnswer(pair, 'b', 'wrong');
  await recordAnswer(pair, 'b', 'wrong');
  await recordAnswer(pair, 'c', 'marks');
  await recordAnswer(pair, 'd', 'wrong');
  await recordAnswer(pair, 'd', 'right');
  assert.deepEqual(toPractise(pairRecord(pair)).map((r) => r.conceptId), ['b', 'a', 'c']);
});

test('the choice of rows is kept per pair, and Delete everything takes it with the record', async () => {
  await forgetDrill();
  assert.equal(loadPick('zh-Hans__en'), null);
  const pick = { sections: { 'social-basics': false }, items: { 'toilets.where-toilet': false } };
  await savePick('zh-Hans__en', pick);
  await recordAnswer('zh-Hans__en', 'a', 'right');
  assert.deepEqual(loadPick('zh-Hans__en'), pick);
  assert.equal(loadPick('ja__en'), null);
  await forgetDrill();
  assert.equal(loadPick('zh-Hans__en'), null);
  assert.deepEqual(tallyOver(pairRecord('zh-Hans__en'), 'all'), [0, 0, 0]);
  assert.equal([...held.keys()].filter((k) => k.startsWith('plg.drill')).length, 0);
});
