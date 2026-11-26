import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NO_ADJUST, PhotomosaicError, addDetail, applyAdjust, composeMosaic, layoutMosaic, oklab, prepareAdjust, readAdjust,
} from '../core/index.js';

/** A small seeded generator. @param {number} seed */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 2 ** 32);
}

/** A textured, opaque w × h picture with values in [lo, hi], so that moderate shifts stay in gamut. */
function picture(w, h, seed, lo = 95, hi = 155) {
  const rand = lcg(seed);
  const data = new Uint8ClampedArray(4 * w * h);
  for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : lo + Math.floor(rand() * (hi - lo + 1));
  return data;
}

/** The mean OKLab of an RGBA picture's pixels. @param {ArrayLike<number>} rgba */
function meanLab(rgba) {
  const sum = [0, 0, 0];
  for (let o = 0; o < rgba.length; o += 4) oklab(rgba[o], rgba[o + 1], rgba[o + 2]).forEach((v, c) => { sum[c] += v; });
  return sum.map((v) => v / (rgba.length / 4));
}

const W = 24;
const H = 16;
const whole = [{ x: 0, y: 0, width: W, height: H }];
const CELL = [150, 110, 90, 255]; // a muted orange, reachable from the picture without clipping
/** @param {Partial<import('../core/adjust.js').Adjust>} adjust @param {Uint8ClampedArray} [rgba] */
const adjusted = (adjust, rgba = picture(W, H, 3)) => applyAdjust(prepareAdjust(rgba, W, whole, [CELL]), { ...NO_ADJUST, ...adjust }, new Uint8ClampedArray(rgba));

test('at 0% the photos are unchanged, whatever the detail', () => {
  const rgba = picture(W, H, 1);
  assert.deepEqual(adjusted({}, rgba), rgba);
  assert.deepEqual(adjusted({ detail: 1 }, rgba), rgba);
  // composeMosaic with no adjustment is the drawing it was
  const layout = layoutMosaic({ rows: 1, columns: 2 }, [0, 1], [{ width: W, height: H }, { width: H, height: W }], { tileWidth: 12, fit: 'keep' });
  const pixels = [{ width: W, height: H, data: rgba }, { width: H, height: W, data: picture(H, W, 2) }];
  const cells = [[200, 40, 40, 255], [40, 40, 200, 255]];
  assert.deepEqual(composeMosaic(layout, (p) => pixels[p], cells, 0.3, { adjust: NO_ADJUST }), composeMosaic(layout, (p) => pixels[p], cells, 0.3));
});

test('at 100% each channel of the mean is the cell\'s, and the texture is kept', () => {
  const rgba = picture(W, H, 4);
  const before = meanLab(rgba);
  const cell = oklab(CELL[0], CELL[1], CELL[2]);
  const out = adjusted({ L: 1, a: 1, b: 1 }, rgba);
  const after = meanLab(out);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(after[c] - cell[c]) < 0.002, `channel ${c}: ${after[c]} vs the cell's ${cell[c]}`);
  // every pixel moved by the same OKLab shift (8-bit rounding aside)
  const shift = cell.map((v, c) => v - before[c]);
  for (let o = 0; o < rgba.length; o += 4 * 7) {
    const p = oklab(rgba[o], rgba[o + 1], rgba[o + 2]);
    const q = oklab(out[o], out[o + 1], out[o + 2]);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(q[c] - p[c] - shift[c]) < 0.006, `pixel ${o / 4} channel ${c}`);
  }
});

test('each channel moves alone, by its fraction', () => {
  const rgba = picture(W, H, 5);
  const before = meanLab(rgba);
  const cell = oklab(CELL[0], CELL[1], CELL[2]);
  ['L', 'a', 'b'].forEach((channel, c) => {
    for (const s of [0.5, 1]) {
      const after = meanLab(adjusted({ [channel]: s }, rgba));
      for (let k = 0; k < 3; k++) {
        const want = k === c ? before[k] + s * (cell[k] - before[k]) : before[k];
        assert.ok(Math.abs(after[k] - want) < 0.002, `${channel} at ${s}: channel ${k} is ${after[k]}, expected ${want}`);
      }
    }
  });
});

test('target detail moves each pixel towards the target\'s pixel there', () => {
  const rgba = picture(W, H, 6);
  const target = picture(W, H, 7, 60, 200);
  const run = (/** @type {number} */ detail, /** @type {number} */ s) => {
    const prepared = prepareAdjust(rgba, W, whole, [CELL]);
    addDetail(prepared, target);
    return applyAdjust(prepared, { L: s, a: s, b: s, detail }, new Uint8ClampedArray(rgba));
  };
  const full = run(1, 1);
  for (let o = 0; o < rgba.length; o++) if (o % 4 !== 3) assert.ok(Math.abs(full[o] - target[o]) <= 1, `byte ${o}: ${full[o]} vs ${target[o]}`);
  // halfway: each pixel halfway to the target's in OKLab
  const half = run(1, 0.5);
  for (let o = 0; o < rgba.length; o += 4 * 5) {
    const p = oklab(rgba[o], rgba[o + 1], rgba[o + 2]);
    const t = oklab(target[o], target[o + 1], target[o + 2]);
    const q = oklab(half[o], half[o + 1], half[o + 2]);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(q[c] - (p[c] + t[c]) / 2) < 0.006, `pixel ${o / 4} channel ${c}`);
  }
  assert.throws(() => applyAdjust(prepareAdjust(rgba, W, whole, [CELL]), { L: 1, a: 0, b: 0, detail: 0.5 }, new Uint8ClampedArray(rgba)), /addDetail/);
});

test('tiles are adjusted towards their own cells; pixels outside them are left alone', () => {
  const rgba = picture(W, H, 8);
  const rects = [{ x: 0, y: 0, width: 10, height: H }, { x: 12, y: 2, width: 12, height: 10 }];
  const cells = [[90, 90, 160, 255], [160, 120, 80, 255]];
  const out = applyAdjust(prepareAdjust(rgba, W, rects, cells), { L: 1, a: 1, b: 1, detail: 0 }, new Uint8ClampedArray(rgba));
  rects.forEach((r, t) => {
    const part = [];
    for (let y = r.y; y < r.y + r.height; y++) part.push(...out.subarray(4 * (y * W + r.x), 4 * (y * W + r.x + r.width)));
    const cell = oklab(cells[t][0], cells[t][1], cells[t][2]);
    meanLab(part).forEach((v, c) => assert.ok(Math.abs(v - cell[c]) < 0.002, `tile ${t} channel ${c}`));
  });
  for (let y = 0; y < H; y++) for (const x of [10, 11]) assert.deepEqual(out.subarray(4 * (y * W + x), 4 * (y * W + x) + 4), rgba.subarray(4 * (y * W + x), 4 * (y * W + x) + 4));
});

test('composeMosaic adjusts, then tints, and needs the target only for detail', () => {
  const photo = { width: W, height: H, data: picture(W, H, 9) };
  const layout = layoutMosaic({ rows: 1, columns: 1 }, [0], [photo], { tileWidth: W, fit: 'keep' });
  const target = { width: 4, height: 3, data: picture(4, 3, 10) };
  const plain = composeMosaic(layout, () => photo, [CELL], 0);
  const shifted = composeMosaic(layout, () => photo, [CELL], 0, { adjust: { L: 1, a: 1, b: 1 } });
  const cell = oklab(CELL[0], CELL[1], CELL[2]);
  meanLab(shifted).forEach((v, c) => assert.ok(Math.abs(v - cell[c]) < 0.002));
  assert.notDeepEqual(shifted, plain);
  const tinted = composeMosaic(layout, () => photo, [CELL], 0.5, { adjust: { L: 1, a: 1, b: 1 } });
  for (let o = 0; o < tinted.length; o += 4) for (let ch = 0; ch < 3; ch++) assert.equal(tinted[o + ch], Math.round(0.5 * shifted[o + ch] + 0.5 * CELL[ch]));
  assert.throws(() => composeMosaic(layout, () => photo, [CELL], 0, { adjust: { L: 1, detail: 0.5 } }), /target/);
  assert.notDeepEqual(composeMosaic(layout, () => photo, [CELL], 0, { adjust: { L: 1, a: 1, b: 1, detail: 0.5 }, target }), shifted);
});

test('an adjustment is checked: fractions from 0 to 1, known channels, missing ones 0', () => {
  assert.equal(readAdjust(undefined), NO_ADJUST);
  assert.deepEqual(readAdjust({ L: 0.4 }), { L: 0.4, a: 0, b: 0, detail: 0 });
  const issuesOf = (/** @type {unknown} */ x) => {
    try {
      readAdjust(x);
    } catch (error) {
      assert.ok(error instanceof PhotomosaicError);
      assert.equal(error.code, 'invalid_request');
      return error.issues.map((i) => `${i.code} ${i.path}`);
    }
    assert.fail('no error');
  };
  assert.deepEqual(issuesOf({ L: 1.5, a: -0.1, b: '1', detail: null, c: 0 }), [
    'out_of_range adjust.L', 'out_of_range adjust.a', 'out_of_range adjust.b', 'out_of_range adjust.detail', 'unknown_field adjust.c',
  ]);
  assert.deepEqual(issuesOf([0.5, 0.5, 0.5]), ['wrong_type adjust']);
  assert.deepEqual(issuesOf(null), ['wrong_type adjust']);
});
