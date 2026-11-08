import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodePng } from '../../shared/decode-png.mjs';
import { submit, DEFAULTS, renderSvg } from '../core/index.js';
import { prepareText } from '../core/layout.js';
import { layoutWords } from '../core/word-layout.js';
import { regionRows } from '../core/region.js';
import { toRaster } from '../core/quantize.js';

/** @param {number} width @param {number} height @param {(x:number,y:number)=>boolean} [inside] */
function image(width, height, inside = () => true) {
  return { width, height, data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? (inside(Math.floor(i / 4) % width, Math.floor(i / 4 / width)) ? 255 : 0) : 80) };
}
/** Every word is either placed together in one connected run or wholly unplaced. @param {import('../core/index.js').Result} result */
function assertWholeWords(result) {
  let previous = null;
  for (const glyph of result.glyphs) {
    if (!glyph.char.trim()) { previous = null; continue; }
    if (previous) assert.deepEqual([glyph.placed, glyph.line, glyph.block], [previous.placed, previous.line, previous.block]);
    previous = glyph;
  }
}

test('words stay within one shape run, including punctuation; unfit words are not partially placed', () => {
  const region = regionRows(toRaster(image(100, 50, x => x < 25 || x >= 70), 'white'), .2);
  const text = prepareText('alpha, beta longunbrokenword', 'word');
  const pass = layoutWords(text, text.map(() => .04), .12, .1, region, .04, { lineWidths: 'row', skipGaps: true, justify: true });
  assert.equal(pass.complete, false);
  for (const [from, to] of [[0, 6], [7, 11]]) {
    assert.equal(new Set(pass.line.slice(from, to)).size, 1);
    assert.equal(new Set(pass.block.slice(from, to)).size, 1);
    assert.ok(pass.x.slice(from, to).every(x => x !== null));
  }
  assert.ok(pass.x.slice(12).every(x => x === null));
  for (const [i, x] of pass.x.entries()) if (x !== null && text[i].trim()) {
    assert.ok((x >= .01 && x + .04 <= .26 + 1e-12) || (x >= .71 && x + .04 <= 1.01 + 1e-12));
  }
});

test('word mode preserves explicit and blank lines and never renders newline boxes', () => {
  assert.deepEqual(prepareText('first\r\n\r\nsecond\tword', 'word'), Array.from('first\n\nsecond word'));
  const result = submit({ image: image(120, 100), text: 'first\n\nsecond word', quantize: null, layout: { wrap: 'word' } });
  assert.ok(result.complete);
  assertWholeWords(result);
  const first = result.glyphs[0], second = result.glyphs[7];
  assert.ok(second.line !== null && first.line !== null);
  assert.equal(second.line - first.line, 2);
  assert.ok(result.glyphs.filter(g => g.char === '\n').every(g => g.placed && g.col === null));
  assert.equal(result.warnings.length, 0);
  assert.ok(!renderSvg(result).includes('NaN'));
});

test('a long word is shrunk to fit instead of being split or overflowing', () => {
  const result = submit({ image: image(100, 100), text: 'Ab'.repeat(500), quantize: null, layout: { wrap: 'word' } });
  assert.ok(result.complete);
  assertWholeWords(result);
  assert.equal(new Set(result.glyphs.map(g => g.line)).size, 1);
  assert.ok(result.font_size_px > 0 && Number.isFinite(result.font_size_px));
});

test('both the complete Alice example and its two-paragraph card fit with no word splits', () => {
  const pixels = decodePng(readFileSync(new URL('../examples/alice-drink-me.png', import.meta.url)));
  const chapter = readFileSync(new URL('../examples/alice-chapter-1.txt', import.meta.url), 'utf8');
  for (const text of [chapter, chapter.trim().split(/\n\s*\n/).slice(0, 2).join(' ')]) {
    const result = submit({ image: pixels, text, layout: { wrap: 'word' }, color: { background: '#ffffff' } });
    assert.ok(result.complete);
    assert.equal(result.fraction_placed, 1);
    assertWholeWords(result);
    assert.ok(result.glyphs.every(g => g.placed));
  }
  assert.equal(DEFAULTS.layout.wrap, 'character');
  assert.deepEqual(prepareText('first\n\nsecond'), Array.from('first second'));
});
