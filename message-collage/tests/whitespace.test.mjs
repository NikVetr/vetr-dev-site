import test from 'node:test';
import assert from 'node:assert/strict';
import { submit, loadFaces, CollageError } from '../core/index.js';
import { glyphGeometry } from '../core/warp.js';
import { measureWhitespace, scoreOccupancy } from '../core/whitespace.js';

test('equal total whitespace distinguishes one large blank block from dispersed gaps', () => {
  const block = Uint8Array.from({ length: 64 }, (_, i) => i < 32 ? 0 : 1);
  const dispersed = Uint8Array.from({ length: 64 }, (_, i) => (i % 8 + Math.floor(i / 8)) % 2);
  const a = scoreOccupancy(block, 8, 8), b = scoreOccupancy(dispersed, 8, 8);
  assert.equal(a.empty_fraction, .5); assert.equal(b.empty_fraction, .5);
  assert.equal(a.largest_empty_rectangle_fraction, .5);
  assert.equal(b.largest_empty_rectangle_fraction, 1 / 64);
  assert.deepEqual(a.largest_empty_rectangle, { col: 0, row: 0, width: 8, height: 4 });
  assert.equal(scoreOccupancy(new Uint8Array(12), 4, 3).largest_empty_rectangle_fraction, 1);
  assert.equal(scoreOccupancy(new Uint8Array(12).fill(1), 4, 3).largest_empty_rectangle_fraction, 0);
});

test('largest empty rectangle agrees with exhaustive small-grid enumeration', () => {
  for (let seed = 1; seed <= 20; seed++) {
    let state = seed;
    const mask = Uint8Array.from({ length: 30 }, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 31; });
    let area = 0;
    for (let top = 0; top < 5; top++) for (let bottom = top; bottom < 5; bottom++) {
      for (let left = 0; left < 6; left++) for (let right = left; right < 6; right++) {
        let free = true;
        for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) if (mask[row * 6 + col]) free = false;
        if (free) area = Math.max(area, (bottom - top + 1) * (right - left + 1));
      }
    }
    assert.equal(scoreOccupancy(mask, 6, 5).largest_empty_rectangle_fraction, area / 30);
  }
});

test('scoring reads saved glyph transforms, preserves rotation, and never mutates geometry', async () => {
  const result = await submit({ messages: ['HELLO'], fonts: ['Inter'], styles: ['bold'], width_in: 2, height_in: 2, fill: .2, grid_res: 32, seed: 7, runs: 1 });
  const faces = await loadFaces(result.request.fonts, result.request.styles), before = JSON.stringify(result);
  const baseline = measureWhitespace(result, faces, { resolution: 256 });
  assert.deepEqual(measureWhitespace(result, faces, { resolution: 256 }), baseline);
  assert.equal(JSON.stringify(result), before);
  const scaled = structuredClone(result);
  for (const line of scaled.lines) line.glyph_transforms = [];
  for (const glyph of glyphGeometry(scaled, faces)) {
    const m = glyph.matrix.map((v, i) => i < 4 ? v / 2 : v / 2 + .5);
    scaled.lines[glyph.line].glyph_transforms?.push(m.map(value => value * 72));
  }
  const smaller = measureWhitespace(scaled, faces, { resolution: 256 });
  assert.ok(Math.abs((1 - smaller.empty_fraction) / (1 - baseline.empty_fraction) - .25) < .04, 'saved point-unit affine matrices determine the footprint');
  const rotated = structuredClone(result);
  rotated.messages[0].rotation = { angle_deg: 90, x_in: 1, y_in: 1 };
  const turned = measureWhitespace(rotated, faces, { resolution: 256 });
  assert.ok(Math.abs(turned.empty_fraction - baseline.empty_fraction) < .005, 'rotating glyph boxes preserves their area');
  assert.throws(() => measureWhitespace(result, faces, { resolution: 0 }), error => error instanceof CollageError && error.code === 'invalid_scoring_input');
  assert.throws(() => scoreOccupancy([0, 2], 2, 1), /must be 0 or 1/);
  assert.throws(() => scoreOccupancy([0], 2, 1), /matching the mask/);
});
