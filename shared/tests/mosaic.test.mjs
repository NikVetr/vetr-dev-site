import assert from 'node:assert/strict';
import test from 'node:test';
import { packMosaic } from '../mosaic.js';

/** @param {{items: import("../mosaic.js").PlacedTile[], rows: number}} result @param {number} columns */
function coverage(result, columns) {
  const cells = new Set();
  for (const tile of result.items) {
    assert.ok(tile.column >= 1 && tile.column + tile.width - 1 <= columns);
    for (let y = tile.row; y < tile.row + tile.height; y++) for (let x = tile.column; x < tile.column + tile.width; x++) {
      const key = `${x},${y}`;
      assert.ok(!cells.has(key), 'cards must not overlap');
      cells.add(key);
    }
  }
  assert.equal(cells.size, columns * result.rows, 'every cell in the enclosing rectangle is occupied');
}

test('mixed shapes tile a full rectangle with a shared lower edge', () => {
  const result = packMosaic([
    { id: 'a', width: 3, height: 3 }, { id: 'b', width: 2, height: 2 },
    { id: 'c', width: 1, height: 3 }, { id: 'd', width: 2, height: 2 },
  ], 4, { requireRectangle: true });
  coverage(result, 4);
  assert.equal(result.rows, 5);
  assert.equal(result.items.find(tile => tile.id === 'c')?.row, 1, 'a later narrow card fills the first row');
});

test('short-screen rows expand their last card instead of leaving trailing holes', () => {
  const result = packMosaic(['a', 'b', 'c', 'd'].map(id => ({ id, width: 3, height: 3 })), 5, { flow: true, requireRectangle: true });
  coverage(result, 5);
  assert.equal(result.rows, 2);
  assert.deepEqual(result.items.map(tile => tile.width), [2, 3, 2, 3]);
  assert.ok(result.items.every(tile => tile.height === 1));
});

test('incomplete layouts and invalid cards fail explicitly', () => {
  assert.throws(() => packMosaic([{ id: 'a', width: 1, height: 1 }], 2, { requireRectangle: true }), /unfilled/);
  assert.throws(() => packMosaic([{ id: 'a', width: 3, height: 1 }], 2), /Invalid/);
  assert.throws(() => packMosaic([{ id: 'a', width: 1, height: NaN }], 2, { flow: true }), /Invalid/);
  assert.throws(() => packMosaic([{ id: 'a', width: 1, height: 1 }, { id: 'a', width: 1, height: 1 }], 2), /Invalid/);
});
