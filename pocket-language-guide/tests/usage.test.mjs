// The counts behind Most used: windows, languages, pruning and the order they rank in.
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

const { recordUse, readUsage, countOf, ranked, forgetUsage } = await import('../ui/usage.js');
const at = { board: 'transport', node: 'taxi', button: 'stophere' };

test('a press is counted in every window that holds it, per language and pooled', async () => {
  await forgetUsage();
  await recordUse('c:taxi.please-stop-here', at, 'zh-Hans', { en: 'Please stop here' });
  now += 10 * DAY;
  await recordUse('c:taxi.please-stop-here', at, 'zh-Hans', { en: 'Please stop here' });
  await recordUse('c:taxi.please-stop-here', at, 'ja', { en: 'Please stop here' });
  const item = readUsage().items['c:taxi.please-stop-here'];
  assert.equal(countOf(item, 'week', 'zh-Hans'), 1);
  assert.equal(countOf(item, 'month', 'zh-Hans'), 2);
  assert.equal(countOf(item, 'month', null), 3);
  assert.equal(countOf(item, 'all', 'ja'), 1);
  assert.deepEqual(item.said, { en: 'Please stop here' });
});

test('days past a year are dropped, and all time keeps them', async () => {
  await forgetUsage();
  await recordUse('c:quick-directions.turn-left', at, 'zh-Hans', {});
  now += 400 * DAY;
  await recordUse('c:quick-directions.turn-left', at, 'zh-Hans', {});
  const item = readUsage().items['c:quick-directions.turn-left'];
  assert.equal(Object.keys(item.by['zh-Hans'].d).length, 1, 'the old day is gone');
  assert.equal(countOf(item, 'year', 'zh-Hans'), 1);
  assert.equal(countOf(item, 'all', 'zh-Hans'), 2);
});

test('the most pressed rank first, and a tie goes to the one pressed later', async () => {
  await forgetUsage();
  await recordUse('c:a', at, 'zh-Hans', {});
  await recordUse('c:b', at, 'zh-Hans', {});
  await recordUse('c:b', at, 'zh-Hans', {});
  now += DAY;
  await recordUse('c:c', at, 'zh-Hans', {});
  await recordUse('c:d', at, 'ja', {});
  assert.deepEqual(ranked(readUsage(), 'month', 'zh-Hans').map((r) => r.key), ['c:b', 'c:c', 'c:a']);
  assert.deepEqual(ranked(readUsage(), 'month', null).map((r) => r.key), ['c:b', 'c:c', 'c:d', 'c:a']);
});
