const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Core = require('../core.js');
const Model = require('../model.js');
const Glyphs = require('../glyphs.js');
const Edited = require('../edited-glyphs.js');
const Sheet = require('../sheet.js');
const provenance = require('../edited-glyphs.provenance.json');

test('edited sheets supply exact fills for 83 supplied characters, including deliberate blanks', () => {
  assert.equal(Object.keys(Edited).length, 83);
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
  // Exact face colors extracted independently from the supplied SVG sheets.
  assert.equal(createHash('sha256').update(JSON.stringify(imported)).digest('hex'), '1f9022d6ace8a956561b64b0a40282b3cd55607f4fffad23f000f20eb4dab75a');
  assert.equal(Object.values(Edited).filter(pattern => pattern.includes('r')).length, 64);
  assert.equal(Glyphs.seedFills('D')[Core.FACES[0].id], 'none');
});

test('the latest ASCII sheet supplies all visible defaults; omitted symbols remain blank', () => {
  assert.equal(Core.SEQUENCES.ascii.length, 95);
  assert.equal(Glyphs.guessCount, 0);
  const ids = Core.FACES.map(face => face.id).sort();
  for (const glyph of Core.SEQUENCES.ascii) {
    const fills = Glyphs.seedFills(glyph);
    assert.deepEqual(Object.keys(fills).sort(), ids);
    if (Object.hasOwn(Edited, glyph)) continue;
    assert.equal(Sheet.hasVisibleFills(fills), false, JSON.stringify(glyph));
    assert.equal(Glyphs.getSeed(glyph).status, 'blank');
  }
  assert.equal(Core.SEQUENCES.ascii.filter(glyph => Sheet.hasVisibleFills(Glyphs.seedFills(glyph))).length, 64);
});

test('NV presets replace Original and retain supplied colors with corrected automatic corners', () => {
  assert.deepEqual(Glyphs.DESIGNS.map(design => design.key), ['@nv-1','@nv-2','@cardinal','@original-warm']);
  assert.equal(Glyphs.getDesign('@original'), null);
  const expected = [
    ['#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#6B8196','#3E4D5B','#3E4D5B','#161F27','#161F27','#161F27'],
    ['#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#3E4D5B','#161F27','#161F27','#3E4D5B','#6B8196','#8C1515','#8C1515','#8C1515','#161F27','#161F27']
  ];
  Glyphs.DESIGNS.slice(0,2).forEach((design,index) => {
    assert.equal(design.name, 'NV-' + (index + 1));
    assert.equal(design.cornerMode, 'auto');
    assert.deepEqual(Core.FACES.slice(0,16).map(face => design.fills[face.id]), expected[index]);
    for (const [corner,owner] of Object.entries(Core.CORNER_PARENTS)) assert.equal(design.fills[corner], design.fills[owner]);
  });
});


test('warm Original uses existing swatches and keeps ending-leg corners linked', () => {
  const design = Glyphs.getDesign('@original-warm');
  assert.ok(design);
  assert.equal(design.name, 'Original');
  const store = new Model.Store();
  const swatches = new Set(Core.PALETTES.concat(Model.getPalettes(store.project)).flatMap(row => row.colors));
  for (const color of Object.values(design.fills)) assert.ok(swatches.has(color));
  for (const [corner,owner] of Object.entries(Core.CORNER_PARENTS)) assert.equal(design.fills[corner],design.fills[owner]);
  assert.equal(design.fills['face-red_bottom-cell-2'], '#E5AE4F');
  assert.equal(design.fills['face-gray_top'], '#DF3531');
  for (const color of Object.values(design.fills)) assert.ok(store.inferBinding(color), 'Every preset color links to a palette row');
});
