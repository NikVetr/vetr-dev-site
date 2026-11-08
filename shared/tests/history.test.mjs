import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../history.js';

test('snapshots undo and redo, flush live edits, and discard abandoned branches', () => {
  let value = 0;
  const history = createHistory({ capture: () => value, restore: (saved) => { value = saved; } });
  value = 1; history.commit();
  value = 2; // an unfinished field gesture
  assert.equal(history.undo(), true); assert.equal(value, 1);
  assert.equal(history.undo(), true); assert.equal(value, 0);
  assert.equal(history.redo(), true); assert.equal(value, 1);
  value = 3;
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), false); assert.equal(value, 3);
  history.undo(); assert.equal(value, 1);
  history.redo(); assert.equal(value, 3);
});

test('immutable large results stay by reference; replace updates derived output only', () => {
  const asset = new Uint8Array(1024);
  let state = { input: 1, asset };
  const history = createHistory({ capture: () => ({ ...state }), restore: (s) => { state = s; }, equal: (a, b) => a.input === b.input && a.asset === b.asset });
  state = { input: 2, asset }; history.commit();
  const output = new Uint8Array(2048);
  state.asset = output; history.replace();
  history.undo(); assert.equal(state.asset, asset);
  history.redo(); assert.equal(state.asset, output);
});

test('bounded history, reset, and a failed restore preserve the cursor', () => {
  let value = 0, fail = false;
  const history = createHistory({ capture: () => value, restore: (v) => { if (fail) throw new Error('restore failed'); value = v; }, limit: 2 });
  for (value = 1; value <= 3; value++) history.commit();
  value = 3;
  fail = true;
  assert.throws(() => history.undo(), /restore failed/);
  assert.equal(history.restoring, false); assert.equal(value, 3);
  fail = false; history.undo(); assert.equal(value, 2);
  history.undo(); assert.equal(value, 1); assert.equal(history.undo(), false);
  history.reset(); assert.equal(history.canUndo, false); assert.equal(history.canRedo, false);
});
