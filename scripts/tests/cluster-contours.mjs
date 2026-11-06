import assert from 'node:assert/strict';
import test from 'node:test';
import { traceCellContours, roundedContourPath } from '../../assets/cluster-contours.js';

/** @typedef {[number, number]} Point */
/** @param {Point[]} loop */
function area(loop) {
  return loop.reduce((sum, [x, y], i) => {
    const next = loop[(i + 1) % loop.length];
    return sum + x * next[1] - y * next[0];
  }, 0) / 2;
}
/** @param {Point[]} loop */
function perimeter(loop) {
  return loop.reduce((sum, [x, y], i) => {
    const next = loop[(i + 1) % loop.length];
    return sum + Math.abs(next[0] - x) + Math.abs(next[1] - y);
  }, 0);
}
/** @param {Point[][]} loops @param {number} x @param {number} y */
function contains(loops, x, y) {
  let inside = false;
  for (const loop of loops) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

test('empty input, repeated cells and deterministic ordering', () => {
  assert.deepEqual(traceCellContours([]), []);
  assert.deepEqual(traceCellContours([[0, 0], [0, 0]]), [[[0, 0], [1, 0], [1, 1], [0, 1]]]);
  /** @type {Point[]} */
  const cells = [[-3, 5], [0, 0], [1, 0], [-3, 6]];
  assert.deepEqual(traceCellContours(cells), traceCellContours([...cells].reverse()));
});

test('adjacent cells form a single rectangle without interior seams', () => {
  const loops = traceCellContours([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]);
  assert.deepEqual(loops, [[[0, 0], [2, 0], [2, 3], [0, 3]]]);
  assert.equal(area(loops[0]), 6);
  assert.equal(perimeter(loops[0]), 10);
});

test('an L shape retains its inward corner', () => {
  const loops = traceCellContours([[0, 0], [1, 0], [0, 1]]);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].length, 6);
  assert.equal(area(loops[0]), 3);
  assert.equal(perimeter(loops[0]), 8);
  assert.equal(contains(loops, 1.5, 1.5), false);
});

test('a hole has opposite winding and stays empty', () => {
  /** @type {Point[]} */
  const cells = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x !== 1 || y !== 1) cells.push([x, y]);
  const loops = traceCellContours(cells);
  assert.equal(loops.length, 2);
  assert.deepEqual(loops.map(area).sort((a, b) => a - b), [-1, 9]);
  assert.equal(contains(loops, 1.5, 1.5), false);
});

test('diagonal-only contacts never fuse into a figure-eight', () => {
  const loops = traceCellContours([[0, 0], [1, 1], [2, 2]]);
  assert.equal(loops.length, 3);
  assert.deepEqual(loops.map(area), [1, 1, 1]);
  for (const loop of loops) assert.equal(new Set(loop.map(p => p.join(','))).size, loop.length);
});

test('a cavity touching the exterior at one point yields simple outer and hole loops', () => {
  const loops = traceCellContours([[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2]]);
  assert.equal(loops.length, 2);
  assert.deepEqual(loops.map(area).sort((a, b) => a - b), [-1, 8]);
  for (const loop of loops) assert.equal(new Set(loop.map(p => p.join(','))).size, loop.length);
});

test('all 3×3 patterns preserve filled area, exposed perimeter and occupancy', () => {
  for (let mask = 0; mask < 512; mask++) {
    /** @type {Point[]} */
    const cells = [];
    for (let i = 0; i < 9; i++) if (mask & (1 << i)) cells.push([i % 3, Math.floor(i / 3)]);
    const loops = traceCellContours(cells);
    for (const loop of loops) assert.equal(new Set(loop.map(p => p.join(','))).size, loop.length, `simple ring for mask ${mask}`);
    assert.equal(loops.reduce((sum, loop) => sum + area(loop), 0), cells.length, `area for mask ${mask}`);
    const sharedSides = cells.reduce((sum, [x, y]) => sum + cells.filter(([xx, yy]) => (xx === x + 1 && yy === y) || (xx === x && yy === y + 1)).length, 0);
    assert.equal(loops.reduce((sum, loop) => sum + perimeter(loop), 0), 4 * cells.length - 2 * sharedSides, `perimeter for mask ${mask}`);
    for (let y = -1; y <= 3; y++) for (let x = -1; x <= 3; x++) {
      assert.equal(contains(loops, x + 0.5, y + 0.5), cells.some(([xx, yy]) => xx === x && yy === y), `occupancy at ${x},${y}, mask ${mask}`);
    }
  }
});

test('malformed cells and unsafe upper corners fail explicitly', () => {
  for (const cells of [null, {}, [[0.5, 0]], [[0, Infinity]], [[0]], [[0, 0, 1]], [[Number.MAX_SAFE_INTEGER, 0]]]) {
    assert.throws(() => traceCellContours(/** @type {any} */ (cells)), TypeError);
  }
});

test('rounded paths remain closed, respect short segments and support sharp corners', () => {
  /** @type {Point[]} */
  const rectangle = [[0, 0], [20, 0], [20, 10], [0, 10]];
  const path = roundedContourPath(rectangle, 100);
  assert.equal(path, 'M 0 5 Q 0 0 5 0 L 15 0 Q 20 0 20 5 L 20 5 Q 20 10 15 10 L 5 10 Q 0 10 0 5 Z');
  assert.equal((path.match(/Q/g) || []).length, 4);
  assert.equal(roundedContourPath(rectangle, 0), 'M 0 0 L 20 0 L 20 10 L 0 10 Z');
  const concave = traceCellContours([[0, 0], [1, 0], [0, 1]])[0].map(([x, y]) => /** @type {Point} */ ([x * 30, y * 20]));
  assert.equal((roundedContourPath(concave).match(/Q/g) || []).length, 6);
  assert.ok(!roundedContourPath(concave).includes('NaN'));
});

test('malformed pixel paths fail explicitly', () => {
  /** @type {Point[]} */
  const rectangle = [[0, 0], [20, 0], [20, 10], [0, 10]];
  assert.throws(() => roundedContourPath(rectangle, -1), TypeError);
  assert.throws(() => roundedContourPath(rectangle, NaN), TypeError);
  assert.throws(() => roundedContourPath([[0, 0], [1, 1], [0, 2], [-1, 1]]), TypeError);
  assert.throws(() => roundedContourPath([...rectangle, rectangle[0]]), TypeError);
  assert.throws(() => roundedContourPath([]), TypeError);
});
