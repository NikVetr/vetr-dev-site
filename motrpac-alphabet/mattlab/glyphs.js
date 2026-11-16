/* Curated whole-polygon character studies. Geometry belongs to PainterCore. */
(function (global) {
  'use strict';
  const Core = global.PainterCore || (typeof require === 'function' ? require('./core.js') : null);
  if (!Core) throw new Error('PainterGlyphs needs PainterCore.');
  const CARDINAL = '#8C1515';
  const WHITE = '#FFFFFF';
  const ids = Core.FACES.map(function (face) { return face.id; });
  const CORNER_PARENTS = Core.CORNER_PARENTS;
  function numbered(numbers) {
    return numbers.map(function (number) {
      if (!Number.isInteger(number) || number < 1 || number > 20) throw new Error('Unknown polygon number.');
      return ids[number - 1];
    });
  }
  function allWhite() {
    const fills = Object.create(null);
    ids.forEach(function (id) { fills[id] = WHITE; });
    return fills;
  }
  function followCorners(fills) {
    Object.keys(CORNER_PARENTS).forEach(function (corner) { fills[corner] = fills[CORNER_PARENTS[corner]]; });
    return fills;
  }
  function fillsFromNumbers(numbers) {
    const fills = allWhite();
    numbered(numbers).forEach(function (id) { fills[id] = CARDINAL; });
    return followCorners(fills);
  }

  const Edited = /** @type {{PainterEditedGlyphs?:Readonly<Record<string,string>>}} */ (global).PainterEditedGlyphs || (typeof require === 'function' ? require('./edited-glyphs.js') : null);
  if (!Edited) throw new Error('PainterGlyphs needs the edited character sheets.');
  // Retained punctuation studies; the other punctuation cells are deliberately blank.
  /** @type {Record<string, {pieces:number[],note:string}>} */
  const recipes = {
    '(':{pieces:[1,2,7,10,15],note:'Angular left parenthesis.'},
    ')':{pieces:[4,11,12,13,16],note:'Angular right parenthesis.'},
    '<':{pieces:[2,7,15],note:'Left-pointing chevron.'},
    '>':{pieces:[11,12,16],note:'Right-pointing chevron.'},
    '/':{pieces:[8,9,10],note:'Ascending slash.'},
    '\\':{pieces:[4,11],note:'Descending slash.'},
    ':':{pieces:[4,13],note:'Two triangular dots.'},
    "'":{pieces:[4],note:'Single upper triangular mark.'},
    '"':{pieces:[1,4],note:'Two upper triangular quotation marks.'},
    '%':{pieces:[1,4,5,6,8,9,10,13],note:'Ascending diagonal between isolated upper-left and lower-right triangular dots.'},
    '*':{pieces:[3,5,9,14,15,16],note:'Six inward-pointing facets surround the fixed center opening.'},
    '+':{pieces:[6,8,15,16],note:'Four inward terminals mark the arms of a plus around the central opening.'},
    ',':{pieces:[13,14],note:'Lower triangular mark extended into a diagonal tail.'},
    ';':{pieces:[4,13,14],note:'Upper triangular dot above a lower comma-like mark.'}
  };
  const SEEDS = Object.create(null);
  Core.SEQUENCES.ascii.forEach(function (glyph) {
    const recipe = recipes[glyph];
    const pattern = Edited[glyph];
    const fills = recipe ? fillsFromNumbers(recipe.pieces) : allWhite();
    if (pattern !== undefined) {
      if (!/^[rw-]{20}$/.test(pattern)) throw new Error('Invalid edited glyph: ' + glyph);
      ids.forEach(function (/** @type {string} */ id, /** @type {number} */ index) { fills[id] = pattern[index] === 'r' ? CARDINAL : pattern[index] === 'w' ? WHITE : 'none'; });
    }
    SEEDS[glyph] = Object.freeze({
      glyph:glyph,
      status:pattern !== undefined ? 'curated' : recipe ? 'guess' : 'blank',
      red:Object.freeze(ids.filter(function (id) { return fills[id] === CARDINAL; })),
      fills:Object.freeze(fills),
      cornerMode:pattern !== undefined ? 'manual' : 'auto',
      note:pattern !== undefined ? 'Your edited character-sheet design, including deliberate blank pieces.' :
        recipe ? recipe.note : glyph === ' ' ? 'Space is intentionally empty.' : 'Intentionally blank; ready for your own design.',
      outline:true
    });
  });
  Object.freeze(SEEDS);

  function getSeed(glyph) {
    if (Object.prototype.hasOwnProperty.call(SEEDS,glyph)) return SEEDS[glyph];
    return {glyph:String(glyph),status:'blank',red:[],note:'A blank study for your own construction.',outline:true};
  }
  function seedFills(glyph) {
    const seed = getSeed(glyph);
    return Object.assign(allWhite(), seed.fills || {});
  }
  const DESIGNS = [
    {
      key:'@original', label:'Original', name:'Original', kind:'design', character:'',
      note:'The approved reference colors.', cornerMode:'manual', outline:false,
      fills:Core.presetFills('reference')
    }
  ];
  DESIGNS.forEach(function (design) { Object.freeze(design.fills); Object.freeze(design); });
  Object.freeze(DESIGNS);
  function getDesign(key) { return DESIGNS.find(function (design) { return design.key === key; }) || null; }
  const API = Object.freeze({
    CARDINAL:CARDINAL, WHITE:WHITE, CORNER_PARENTS:CORNER_PARENTS,
    SEEDS:SEEDS, DESIGNS:DESIGNS, getSeed:getSeed, seedFills:seedFills, getDesign:getDesign,
    guessCount:Object.values(SEEDS).filter(function (seed) { return seed.status === 'guess'; }).length
  });
  global.PainterGlyphs = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
