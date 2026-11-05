import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { decodePng } from '../../shared/decode-png.mjs';
import { cost, features } from '../core/color.js';
import {
  PhotomosaicError, autoGrid, layoutMosaic, scaleImage, scaledHeight, solveAssignment, submit, summarisePhoto,
} from '../core/index.js';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
const R = JSON.parse(readFileSync(`${FIXTURES}r-parity.json`, 'utf8'));
const files = readdirSync(`${FIXTURES}photos`).sort();
const photos = files.map((f) => decodePng(readFileSync(`${FIXTURES}photos/${f}`)));
const means = photos.map(summarisePhoto);

/** @param {{ width: number, height: number, data: Uint8ClampedArray }} image */
const targetOf = (image) => ({ width: image.width, height: image.height, data: Buffer.from(image.data).toString('base64') });
const request = (/** @type {Record<string, any>} */ extra = {}) => ({
  target: targetOf(decodePng(readFileSync(`${FIXTURES}target-wide.png`))),
  photos: means.map((mean, i) => ({ name: files[i], mean })),
  ...extra,
});

/** A small seeded generator for the brute-force cases. @param {number} seed */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 2 ** 32);
}

/** The least total cost over every way of giving n rows distinct columns of m. @param {number[][]} c */
function bruteForce(c) {
  const n = c.length;
  const m = c[0].length;
  let best = Infinity;
  const used = new Array(m).fill(false);
  const visit = (/** @type {number} */ i, /** @type {number} */ sum) => {
    if (sum >= best) return;
    if (i === n) {
      best = sum;
      return;
    }
    for (let j = 0; j < m; j++) {
      if (used[j]) continue;
      used[j] = true;
      visit(i + 1, sum + c[i][j]);
      used[j] = false;
    }
  };
  visit(0, 0);
  return best;
}

test('the assignment is optimal on every brute-forceable case, ties included', () => {
  const rand = lcg(7);
  for (let k = 0; k < 400; k++) {
    const n = 1 + Math.floor(rand() * 6);
    const m = n + Math.floor(rand() * 3);
    const ties = k % 2 === 0; // small integer costs, so many assignments tie
    const c = Array.from({ length: n }, () => Array.from({ length: m }, () => (ties ? Math.floor(rand() * 4) : rand() * 100)));
    const columnOf = solveAssignment(n, m, (i, row) => row.set(c[i]));
    assert.equal(new Set(columnOf).size, n, 'each row gets its own column');
    const total = Array.from(columnOf).reduce((s, j, i) => s + c[i][j], 0);
    assert.ok(Math.abs(total - bruteForce(c)) < 1e-9, `case ${k}: ${total} vs ${bruteForce(c)}`);
  }
});

test('ImageMagick heights for image_scale(img, "200") match R', () => {
  R.heights.sizes.forEach((/** @type {[number, number]} */ [w, h], /** @type {number} */ i) => {
    assert.equal(scaledHeight(w, h, 200), R.heights.height[i], `${w} x ${h}`);
  });
});

for (const run of R.runs) {
  test(`${run.target}, seed ${run.seed}: summaries, costs and the assignment match R`, () => {
    assert.deepEqual(run.files, files);
    const target = decodePng(readFileSync(`${FIXTURES}${run.target}`));
    const grid = autoGrid(files.length, target.width, target.height);
    assert.deepEqual([grid.rows, grid.columns], run.gridDims);

    // photos, in the order R's sample() put them in
    const order = run.perm.map((/** @type {number} */ p) => p - 1);
    order.forEach((/** @type {number} */ p, /** @type {number} */ k) => {
      for (let ch = 0; ch < 4; ch++) assert.ok(Math.abs(means[p][ch] / 255 - run.photoMeans[k][ch]) < 1e-12, `${files[p]} channel ${ch}`);
    });

    // cells: R lists them column by column; the 8-bit values of the scaled target
    const cells = scaleImage(target, grid.columns, grid.rows).data;
    const cellsInROrder = new Float64Array(4 * grid.rows * grid.columns);
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.columns; c++) {
        const mine = cells.subarray(4 * (r * grid.columns + c), 4 * (r * grid.columns + c) + 4);
        assert.deepEqual(Array.from(mine), run.cells[r + c * grid.rows].map((/** @type {number} */ v) => Math.round(v * 255)));
        cellsInROrder.set(mine, 4 * (r + c * grid.rows));
      }
    }

    const shuffled = new Float64Array(4 * files.length);
    order.forEach((/** @type {number} */ p, /** @type {number} */ k) => shuffled.set(means[p], 4 * k));
    const cellF = features(cellsInROrder, 'hsl-r');
    const photoF = features(shuffled, 'hsl-r');
    const close = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
    run.cellFeatures.forEach((/** @type {number[]} */ row, /** @type {number} */ i) => row.forEach((v, d) => assert.ok(close(cellF[4 * i + d], v), `cell ${i} feature ${d}`)));
    run.photoFeatures.forEach((/** @type {number[]} */ row, /** @type {number} */ i) => row.forEach((v, d) => assert.ok(close(photoF[4 * i + d], v), `photo ${i} feature ${d}`)));
    run.cost.forEach((/** @type {number[]} */ row, /** @type {number} */ i) => row.forEach((v, j) => assert.ok(close(cost(cellF, i, photoF, j), v), `cost ${i}, ${j}`)));

    const result = submit({ ...request(), target: targetOf(target), seed: run.seed });
    assert.ok(close(result.cost.total, run.total), `total ${result.cost.total} vs R ${run.total}`);
    // R's assignment, by file and row by row; it can differ from ours only between equal costs
    const fromR = new Array(grid.rows * grid.columns);
    run.assignment.forEach((/** @type {number} */ k, /** @type {number} */ i) => {
      fromR[(i % grid.rows) * grid.columns + Math.floor(i / grid.rows)] = order[k - 1];
    });
    assert.deepEqual(result.assignment, fromR);
  });
}

test('the result: cells row by row, each photo at most once, costs that add up', () => {
  const result = submit(request());
  assert.deepEqual(result.grid, { rows: 5, columns: 6, cells: 30, rule: 'auto' });
  assert.equal(result.assignment.length, 30);
  assert.equal(new Set(result.assignment).size, 30);
  assert.ok(result.uses.every((u) => u <= 1));
  assert.equal(result.photos.used, 30);
  assert.equal(result.cells.length, 30);
  assert.ok(Math.abs(result.cost.perCell.reduce((a, b) => a + b, 0) - result.cost.total) < 1e-6);
  assert.deepEqual(result.settings, { columns: null, maxUses: 1, metric: 'hsl-r', seed: 1 });
  assert.deepEqual(submit(request()).assignment, result.assignment, 'the same request gives the same mosaic');
});

test('the seed decides only between equal costs', () => {
  // the same photo twice: which copy a cell gets is up to the shuffle
  const base = request();
  const twins = { ...base, photos: [...base.photos, { name: 'twin', mean: base.photos[0].mean }] };
  const totals = new Set();
  const picks = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const result = submit({ ...twins, seed });
    totals.add(result.cost.total.toPrecision(12));
    picks.add(JSON.stringify(result.assignment));
  }
  assert.equal(totals.size, 1);
  assert.ok(picks.size >= 1);
});

test('more cells than photos with maxUses, and a set number of columns', () => {
  const result = submit(request({ columns: 12, maxUses: 4 }));
  assert.equal(result.grid.columns, 12);
  assert.equal(result.grid.rows, 10); // round(12 x 38 / 48)
  assert.ok(result.uses.every((u) => u <= 4));
  assert.equal(result.uses.reduce((a, b) => a + b, 0), 120);
  const auto = submit(request({ maxUses: 2 }));
  assert.deepEqual([auto.grid.rows, auto.grid.columns], [7, 9]); // R's rule for 72 uses
});

test('the CIELAB metric is a labelled alternative', () => {
  const hsl = submit(request());
  const lab = submit(request({ metric: 'lab' }));
  assert.equal(lab.settings.metric, 'lab');
  assert.notDeepEqual(lab.assignment, hsl.assignment);
  const white = features([255, 255, 255, 255], 'lab');
  assert.ok(Math.abs(white[0] - 100) < 1e-3 && Math.abs(white[1]) < 1e-3 && Math.abs(white[2]) < 1e-3);
});

test('an invalid request lists every issue', () => {
  const good = request();
  /** @param {unknown} r */
  const issuesOf = (r) => {
    try {
      submit(r);
    } catch (error) {
      assert.ok(error instanceof PhotomosaicError);
      assert.equal(error.code, 'invalid_request');
      return error.issues.map((i) => `${i.code} ${i.path}`);
    }
    assert.fail('no error');
  };
  assert.deepEqual(issuesOf([]), ['wrong_type ']);
  assert.deepEqual(issuesOf({ photos: good.photos, extra: 1 }), ['unknown_field extra', 'missing_field target']);
  assert.deepEqual(issuesOf({
    target: { ...good.target, width: 47 },
    photos: [{ mean: [1, 2, 3] }, { mean: [0, 0, 0, 255], name: 3, colour: 'red' }],
    columns: 0, maxUses: 1.5, metric: 'rgb', seed: -1,
  }).sort(), [
    'wrong_length target.data', 'unknown_field photos[1].colour', 'wrong_type photos[1].name', 'out_of_range photos[0].mean',
    'out_of_range columns', 'out_of_range maxUses', 'out_of_range metric', 'out_of_range seed',
  ].sort());
  assert.deepEqual(issuesOf({ target: { width: 2, height: 1, data: '%%' }, photos: [] }), ['wrong_type target.data', 'wrong_type photos']);
  // the grid: too few photos for the rule, or for the columns asked for
  assert.deepEqual(issuesOf({ ...good, photos: good.photos.slice(0, 1), target: { width: 4, height: 1, data: Buffer.alloc(16).toString('base64') } }), ['too_few_photos photos']);
  assert.deepEqual(issuesOf({ ...good, columns: 40 }), ['too_few_photos columns']);
});

test('layouts: shapes kept as in R, or centred squares', () => {
  const grid = { rows: 2, columns: 2 };
  const sizes = [{ width: 40, height: 30 }, { width: 30, height: 40 }, { width: 50, height: 50 }, { width: 200, height: 100 }];
  const keep = layoutMosaic(grid, [0, 1, 2, 3], sizes, { tileWidth: 20, fit: 'keep' });
  assert.deepEqual(keep.tiles.map((t) => t.height), [15, 27, 20, 10]);
  assert.deepEqual(keep.rowTops, [0, 27, 47]);
  assert.deepEqual([keep.width, keep.height], [40, 47]);
  const crop = layoutMosaic(grid, [0, 1, 2, 3], sizes, { tileWidth: 20, fit: 'crop' });
  assert.deepEqual(crop.tiles.map((t) => t.source), [[5, 0, 30, 30], [0, 5, 30, 30], [0, 0, 50, 50], [50, 0, 100, 100]]);
  assert.deepEqual([crop.width, crop.height], [40, 40]);
});
