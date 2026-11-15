/* Curated whole-polygon character studies. Geometry belongs to PainterCore. */
(function (global) {
  'use strict';
  const Core = global.PainterCore || (typeof require === 'function' ? require('./core.js') : null);
  if (!Core) throw new Error('PainterGlyphs needs PainterCore.');
  const CARDINAL = '#8C1515';
  const WHITE = '#FFFFFF';
  const ids = Core.FACES.map(function (face) { return face.id; });
  const CORNER_PARENTS = Object.freeze({
    'inner-fillet-lower-left':'face-red_bottom-cell-2',
    'inner-fillet-lower-right':'face-gray_bottom',
    'inner-fillet-upper-right':'face-red_top-right-leg-cell-2',
    'inner-fillet-upper-left':'face-red_top-connector'
  });
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

  // These are deliberately limited sketches, not a typeface. The fixed central
  // opening and whole-polygon constraint do not support every alphabet shape.
  const recipes = {
    C:{pieces:[1,2,7,10,15],note:'Angular open curve.'},
    G:{pieces:[1,2,7,8,9,10,15],note:'Angular C with a rising inner arm; an exploratory G.'},
    I:{pieces:[8,9,10],note:'Single slanted stem.'},
    L:{pieces:[7,10],note:'Angled stem with a short lower foot.'},
    M:{pieces:[1,2,3,4,5,6,11],note:'Four diagonal strokes form an M.'},
    N:{pieces:[1,2,3,4,5,6],note:'The original upper N ribbon.'},
    O:{pieces:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],note:'A closed angular ring; a stylized O.'},
    V:{pieces:[1,3,4,5,6],note:'Two upper strokes meet at the central low point.'},
    W:{pieces:[7,8,9,10,12,13,14],note:'Four lower diagonal strokes form a W.'},
    c:{pieces:[1,2,7,10,15],note:'Geometric counterpart of the C study.'},
    l:{pieces:[8,9,10],note:'Single slanted lowercase stem.'},
    m:{pieces:[1,2,3,4,5,6,11],note:'Geometric counterpart of the M study.'},
    n:{pieces:[1,2,3,4,5,6],note:'Geometric counterpart of the N study.'},
    o:{pieces:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],note:'Geometric counterpart of the O study.'},
    v:{pieces:[7,8,9,10],note:'Compact lower V.'},
    w:{pieces:[7,8,9,10,12,13,14],note:'Geometric counterpart of the W study.'},
    '0':{pieces:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],note:'A closed loop; shares the O construction.'},
    '1':{pieces:[8,9,10],note:'Single slanted numeral stem.'},
    '(':{pieces:[1,2,7,10,15],note:'Angular left parenthesis.'},
    ')':{pieces:[4,11,12,13,16],note:'Angular right parenthesis.'},
    '<':{pieces:[2,7,15],note:'Left-pointing chevron.'},
    '>':{pieces:[11,12,16],note:'Right-pointing chevron.'},
    '^':{pieces:[1,2,3],note:'Two strokes form an upward chevron.'},
    '/':{pieces:[8,9,10],note:'Ascending slash.'},
    '\\':{pieces:[4,11],note:'Descending slash.'},
    ':':{pieces:[4,13],note:'Two triangular dots.'},
    '.':{pieces:[13],note:'Single lower triangular dot.'},
    "'":{pieces:[4],note:'Single upper triangular mark.'},
    '"':{pieces:[1,4],note:'Two upper triangular quotation marks.'},
    '\u0060':{pieces:[1],note:'Single upper-left triangular mark.'}
  };
  const SEEDS = Object.create(null);
  Core.SEQUENCES.ascii.forEach(function (glyph) {
    const recipe = recipes[glyph];
    const fills = recipe ? fillsFromNumbers(recipe.pieces) : allWhite();
    const red = ids.filter(function (id) { return fills[id] === CARDINAL; });
    SEEDS[glyph] = Object.freeze({
      glyph:glyph,
      status:recipe ? 'guess' : 'blank',
      red:Object.freeze(red),
      note:recipe ? recipe.note : glyph === ' ' ? 'Space is intentionally empty.' :
        'Left blank: no clear whole-polygon construction was found.',
      outline:true
    });
  });
  Object.freeze(SEEDS);

  function getSeed(glyph) {
    if (Object.prototype.hasOwnProperty.call(SEEDS,glyph)) return SEEDS[glyph];
    return {glyph:String(glyph),status:'blank',red:[],note:'A blank study for your own construction.',outline:true};
  }
  function seedFills(glyph) {
    const fills = allWhite();
    getSeed(glyph).red.forEach(function (id) { fills[id] = CARDINAL; });
    return fills;
  }
  function patterned(colors) {
    const fills = Object.create(null);
    Core.FACES.forEach(function (face, index) { fills[face.id] = Core.normalizeColor(colors[index] || face.fill); });
    return followCorners(fills);
  }
  const DESIGNS = [
    {
      key:'@original', label:'Original', name:'Original', kind:'design', character:'',
      note:'The approved reference colors.', cornerMode:'manual', outline:false,
      fills:Core.presetFills('reference')
    },
    {
      key:'@cardinal-slate', label:'Cardinal + slate', name:'Cardinal + slate', kind:'design', character:'',
      note:'Cardinal red tones with the original cool grays.', cornerMode:'auto', outline:false,
      fills:followCorners(Core.presetFills('cardinal'))
    },
    {
      key:'@cardinal-sky', label:'Cardinal + sky', name:'Cardinal + sky', kind:'design', character:'',
      note:'Cardinal, soft sky blue, and deep slate.', cornerMode:'auto', outline:false,
      fills:patterned(['#8C1515','#8C1515','#5E0E0E','#8C1515','#8C1515','#B85150',
        '#405365','#BCD5DB','#BCD5DB','#80949B','#BCD5DB','#405365','#697988','#8C1515','#22292F','#373F46'])
    },
    {
      key:'@ember-navy', label:'Ember + navy', name:'Ember + navy', kind:'design', character:'',
      note:'Warm red and burnt orange balanced by navy.', cornerMode:'auto', outline:false,
      fills:patterned(['#CC782E','#8C1515','#8C1515','#CC782E','#8C1515','#E3B68E',
        '#323753','#323753','#323753','#9093A2','#CC782E','#323753','#9093A2','#8C1515','#22292F','#22292F'])
    },
    {
      key:'@tonal-weave', label:'Tonal weave', name:'Tonal weave', kind:'design', character:'',
      note:'Three Cardinal tones reveal the intersecting facets.', cornerMode:'auto', outline:false,
      fills:patterned(['#B85150','#8C1515','#5E0E0E','#B85150','#8C1515','#5E0E0E',
        '#B85150','#5E0E0E','#8C1515','#B85150','#5E0E0E','#8C1515','#B85150','#5E0E0E','#5E0E0E','#5E0E0E'])
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
