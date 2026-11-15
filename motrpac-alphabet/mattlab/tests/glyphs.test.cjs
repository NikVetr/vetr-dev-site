const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Core = require('../core.js');
const Glyphs = require('../glyphs.js');

test('every printable ASCII character has a whole-piece study except intentional space', () => {
  assert.equal(Core.SEQUENCES.ascii.length, 95);
  assert.equal(Glyphs.guessCount, 94);
  const ids = Core.FACES.map(face => face.id).sort();
  for (const glyph of Core.SEQUENCES.ascii) {
    const seed = Glyphs.getSeed(glyph);
    const fills = Glyphs.seedFills(glyph);
    assert.equal(seed.status, glyph === ' ' ? 'blank' : 'guess', JSON.stringify(glyph));
    assert.equal(seed.red.length === 0, glyph === ' ', JSON.stringify(glyph));
    assert.deepEqual(Object.keys(fills).sort(), ids);
    assert.ok(Object.values(fills).every(fill => fill === Glyphs.CARDINAL || fill === Glyphs.WHITE));
    for (const [corner, parent] of Object.entries(Glyphs.CORNER_PARENTS)) assert.equal(fills[corner], fills[parent]);
    assert.ok(seed.note.length > 15);
  }
});

test('the original thirty nonblank recipes and original logo palette are preserved', () => {
  // Snapshot of the pre-expansion hand-picked study geometry, in ASCII order.
  const originals = ['"',"'",'(',')','.','/','0','1',':','<','>','C','G','I','L','M','N','O','V','W','\\','^','`','c','l','m','n','o','v','w'];
  const data = originals.map(glyph => [glyph, Glyphs.getSeed(glyph).red]);
  assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    '955d67ab3e462571695c517049fde88924c9167870a4b695ea6bc8602ff07170');
  assert.deepEqual(Glyphs.DESIGNS.map(design => design.key), ['@original']);
  assert.deepEqual(Glyphs.getDesign('@original').fills, Core.presetFills('reference'));
  for (const key of ['@cardinal-slate', '@cardinal-sky', '@ember-navy', '@tonal-weave']) assert.equal(Glyphs.getDesign(key), null);
});

test('new guesses do not fill missing characters with repeated placeholder patterns', () => {
  const patterns = new Map();
  for (const glyph of Core.SEQUENCES.ascii) {
    const key = Glyphs.getSeed(glyph).red.join('|');
    if (!patterns.has(key)) patterns.set(key, []);
    patterns.get(key).push(glyph);
  }
  const duplicates = [...patterns.values()].filter(group => group.length > 1).map(group => group.join('')).sort();
  // Existing intentional geometric counterparts remain; new studies are distinct.
  assert.deepEqual(duplicates, ['0Oo', '/1Il', '(Cc', 'Mm', 'Nn', 'Ww'].sort());
});
