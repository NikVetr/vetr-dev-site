import test from 'node:test';
import assert from 'node:assert/strict';
import fontkit from '../../shared/vendor/fontkit.esm.js';
import { buildFont, FontExportError } from '../font-export.js';

const rectangle = (x, y, width, height, fill = '#46257e') => ({ fill,
  points: [{x,y}, {x:x+width,y}, {x:x+width,y:y+height}, {x,y:y+height}] });
const letters = [{ letter: 'A', layers: [rectangle(30, 40, 60, 100), rectangle(90, 50, 20, 20, '#b40e2c')] },
  { letter: 'M', layers: [rectangle(5, 10, 100, 100)] }];

test('font parser reads names, cmap aliases, metrics and colour layers', () => {
  const result = buildFont({ letters, family: 'Test alphabet' });
  const font = fontkit.create(result.bytes);
  assert.equal(font.familyName, 'Test alphabet');
  assert.equal(font.unitsPerEm, 2048);
  assert.equal(font.glyphForCodePoint(65).id, font.glyphForCodePoint(97).id);
  assert.equal(font.glyphForCodePoint(48).id, 0);
  assert.equal(font.glyphForCodePoint(32).advanceWidth, 600);
  assert.equal(font.glyphForCodePoint(65).advanceWidth, 1460);
  assert.equal(font.glyphForCodePoint(77).advanceWidth, 1780);
  const a = font.glyphForCodePoint(65);
  assert.equal(a.bbox.minY, 0);
  assert.equal(a.bbox.maxY, 1600);
  assert.equal(a.layers.length, 2);
  assert.equal(font.getGlyph(a.layers[0].glyph.id).bbox.minX, 90);
  assert.equal(result.missing.length, 24);
});

test('monochrome font has identical base outlines and spacing without COLR tables', () => {
  const color = fontkit.create(buildFont({ letters }).bytes);
  const mono = fontkit.create(buildFont({ letters, color: false }).bytes);
  const a = mono.glyphForCodePoint(65);
  const c = color.glyphForCodePoint(65);
  assert.equal(a.advanceWidth, c.advanceWidth);
  assert.deepEqual(a.path.commands, c.layers.flatMap(layer => layer.glyph.path.commands));
  assert.equal(mono.directory.tables.COLR, undefined);
});

test('font rejects invalid contours, duplicate letters and pathological dimensions', () => {
  assert.throws(() => buildFont({ letters: [] }), FontExportError);
  assert.throws(() => buildFont({ letters: [letters[0], letters[0]] }), /unique/);
  assert.throws(() => buildFont({ letters, family: '' }), /family name/);
  assert.throws(() => buildFont({ letters: [{ letter: 'A', layers: [rectangle(0,0,1e7,1)] }] }), /too wide/);
  assert.throws(() => buildFont({ letters: [{ letter: 'A', layers: [rectangle(NaN,0,1,1)] }] }), /invalid/);
});

test('whole-font checksum matches OpenType specification', () => {
  const {bytes} = buildFont({ letters });
  const view = new DataView(bytes.buffer);
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  assert.equal(sum, 0xB1B0AFBA);
});
