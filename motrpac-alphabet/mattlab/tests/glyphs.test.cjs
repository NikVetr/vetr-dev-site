const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Core = require('../core.js');
const Model = require('../model.js');
const Glyphs = require('../glyphs.js');
const Edited = require('../edited-glyphs.js');
const Sheet = require('../sheet.js');
const provenance = require('../edited-glyphs.provenance.json');

const punctuation = new Set(['*','+',"'",'"','%',',','(',')','/','\\',';','<','>',':']);

test('edited sheets supply exact fills for all 62 letters and digits, including deliberate blanks', () => {
  assert.equal(Object.keys(Edited).length, 62);
  assert.deepEqual(provenance.faceOrder, Core.FACES.map(face => face.id));
  const imported = [];
  /** @type {Record<string,string>} */
  const colorKeys = {'#8C1515':'r','#FFFFFF':'w',none:'-'};
  for (const source of provenance.sources) {
    const blanks = [];
    for (const glyph of source.characters) {
      const fills = Glyphs.seedFills(glyph);
      const pattern = Core.FACES.map(face => colorKeys[fills[face.id]]).join('');
      assert.equal(pattern, Edited[glyph]);
      assert.equal(Glyphs.getSeed(glyph).status, 'curated');
      assert.equal(Glyphs.getSeed(glyph).cornerMode, 'manual');
      if (!Sheet.hasVisibleFills(fills)) blanks.push(glyph);
      imported.push([glyph, pattern]);
      const store = new Model.Store();
      store.ensureDocument(glyph, fills, {cornerMode:'manual',seedStatus:'curated'});
      assert.deepEqual({...store.project.documents[glyph].fills}, {...fills}, 'No corner normalization for ' + glyph);
    }
    assert.equal(blanks.join(''), source.blank);
  }
  // Exact face colors extracted independently from the three supplied SVG sheets.
  assert.equal(createHash('sha256').update(JSON.stringify(imported)).digest('hex'), '99df3165abc30115b7504422aeb06f49f669ef57515abe7136955a985d809cb2');
  assert.equal(Object.values(Edited).filter(pattern => pattern.includes('r')).length, 42);
  assert.equal(Glyphs.seedFills('D')[Core.FACES[0].id], 'none');
});

test('only requested punctuation survives; remaining punctuation and space are blank', () => {
  assert.equal(Core.SEQUENCES.ascii.length, 95);
  assert.equal(Glyphs.guessCount, 14);
  const ids = Core.FACES.map(face => face.id).sort();
  for (const glyph of Core.SEQUENCES.ascii) {
    const fills = Glyphs.seedFills(glyph);
    assert.deepEqual(Object.keys(fills).sort(), ids);
    if (Object.hasOwn(Edited, glyph)) continue;
    assert.equal(Sheet.hasVisibleFills(fills), punctuation.has(glyph), JSON.stringify(glyph));
    assert.equal(Glyphs.getSeed(glyph).status, punctuation.has(glyph) ? 'guess' : 'blank');
  }
  assert.equal(Core.SEQUENCES.ascii.filter(glyph => Sheet.hasVisibleFills(Glyphs.seedFills(glyph))).length, 56);
});

test('the original logo palette is preserved', () => {
  assert.deepEqual(Glyphs.DESIGNS.map(design => design.key), ['@original']);
  assert.deepEqual(Glyphs.getDesign('@original')?.fills, Core.presetFills('reference'));
  for (const key of ['@cardinal-slate', '@cardinal-sky', '@ember-navy', '@tonal-weave']) assert.equal(Glyphs.getDesign(key), null);
});
