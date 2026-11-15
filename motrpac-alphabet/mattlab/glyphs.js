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

  // Whole-piece studies, not outline-font stencils. The central opening is
  // immutable: crossbars and bowls are suggested by adjacent facets, while
  // gaps remain visible. The notes describe the intended reading of each guess.
  /** @type {Record<string, {pieces:number[], note:string}>} */
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
    '\u0060':{pieces:[1],note:'Single upper-left triangular mark.'},

    A:{pieces:[1,2,3,6],note:'Upper-left peaked arch with the inner cap suggesting a crossbar.'},
    B:{pieces:[1,2,3,6,7,8,9,10,15],note:'Left stem and two inward-turning bowls, separated by the fixed central gap.'},
    D:{pieces:[1,2,3,4,5,7,8,9,10,11,12,13,14,15,16],note:'Broad outer bowl with an open inner upper cap; an angular D.'},
    E:{pieces:[1,2,3,6,7,10,15],note:'Left spine with upper, middle and lower terminals.'},
    F:{pieces:[1,2,3,6,7,15],note:'Upper and middle arms on a left spine, with the lower foot removed.'},
    H:{pieces:[1,2,3,4,5,6,7,10,11,12,13,15,16],note:'Paired outer stems linked by the upper inner facets; the crossbar bends around the opening.'},
    J:{pieces:[4,11,12,13,14,16],note:'Long right stem curling inward at its lower end.'},
    K:{pieces:[1,2,3,7,9,10,15],note:'Left stem with inward upper and lower diagonal arms.'},
    P:{pieces:[1,2,3,5,6,7,15],note:'Upper inward bowl on a left descending stem.'},
    Q:{pieces:[1,2,3,4,5,6,7,8,9,11,12,13,14,15,16],note:'Angular ring opened at the lower left, retaining the lower-right diagonal tail.'},
    R:{pieces:[1,2,3,5,6,7,10,13,14,15],note:'Upper bowl and left stem, with a separate lower-right diagonal leg.'},
    S:{pieces:[1,2,3,6,7,8,10,12,13,14,15,16],note:'Opposed upper-left and lower-right turns around the central opening.'},
    T:{pieces:[1,2,3,4,5,6,8,9,10,11],note:'Broad upper crown above a single lower slanted stem.'},
    U:{pieces:[1,2,4,7,8,9,10,11,12,13,14,15,16],note:'Tall outer stems joined by the lower ribbon; the upper inner facets stay open.'},
    X:{pieces:[1,3,4,5,6,8,9,10,13,14],note:'Opposing diagonal fans converge toward the narrow central gap.'},
    Y:{pieces:[1,3,4,5,6,8,9,10],note:'Two upper arms converge above one lower slanted stem.'},
    Z:{pieces:[1,4,5,6,8,9,10,13,14],note:'Upper caps and a broad lower foot linked by descending diagonal facets.'},

    a:{pieces:[8,9,10,12,13,14,16],note:'Compact lower bowl with a right shoulder and terminal.'},
    b:{pieces:[1,2,7,8,9,10,12,13,14,15,16],note:'Tall left ascender above a wide lower bowl.'},
    d:{pieces:[4,7,8,9,10,11,12,13,14,15,16],note:'Wide lower bowl with a tall right ascender.'},
    e:{pieces:[7,8,9,10,14,15],note:'Lower open curve with a short inward upper arm.'},
    f:{pieces:[1,2,3,6,8,9,10,15],note:'Upper hooked shoulder above a lower slanted stem.'},
    g:{pieces:[1,2,3,4,5,6,11,12,13,14,15,16],note:'Upper bowl with a descending right hook.'},
    h:{pieces:[1,2,7,8,9,10,13,14,15],note:'Left ascender and a lower arch with its right side open.'},
    i:{pieces:[6,8,9,10],note:'Lower slanted stem with a detached dot directly above it.'},
    j:{pieces:[6,7,9,10],note:'Detached upper dot above a lower stem and leftward hook.'},
    k:{pieces:[2,7,8,9,10,14,15],note:'Left stem with a compact lower pair of diagonal arms.'},
    p:{pieces:[1,2,3,4,5,6,7,10,11,15,16],note:'Upper bowl with a long left descender.'},
    q:{pieces:[1,2,3,4,5,6,11,12,13,15,16],note:'Upper bowl with a long right descender and no inward hook.'},
    r:{pieces:[3,6,8,9,10],note:'Lower slanted stem under a short upper shoulder.'},
    s:{pieces:[2,3,6,7,8,10,13,14,15],note:'Compact opposed turns with shortened upper and lower terminals.'},
    t:{pieces:[3,5,6,8,9,10],note:'Short upper crosspiece over one lower slanted stem.'},
    u:{pieces:[7,9,10,12,13,14],note:'Low paired stems and lower return, with the central upper cap removed.'},
    x:{pieces:[3,5,6,8,9,14],note:'Four compact diagonal arms, inset from the outer caps.'},
    y:{pieces:[7,8,9,10,13,14],note:'Lower V with a diagonal branch extending to the right foot.'},
    z:{pieces:[3,5,6,8,9,10,13],note:'Inset upper shoulder, descending diagonal and two lower terminals.'},

    '2':{pieces:[1,3,4,5,6,8,9,10,11,13,14,16],note:'Rounded upper-right shoulder leading into a descending diagonal and broad lower foot.'},
    '3':{pieces:[4,5,6,8,11,12,13,14,16],note:'Two inward-facing right bowls around the middle waist.'},
    '4':{pieces:[1,3,4,5,6,11,12,13,16],note:'Short upper-left arm meets the upper bridge beside a long right stem.'},
    '5':{pieces:[1,2,3,6,8,12,13,14,15,16],note:'Upper-left arm and waist paired with a lower-right bowl.'},
    '6':{pieces:[1,2,3,7,8,9,10,12,13,14,15,16],note:'Upper-left curl above the closed lower bowl.'},
    '7':{pieces:[1,2,3,4,5,6,8,9,10],note:'Upper ribbon terminating in one long descending diagonal.'},
    '8':{pieces:[1,2,3,4,5,6,7,8,9,10,11,12,13,14],note:'Two broad angular bowls with the side waist wedges removed.'},
    '9':{pieces:[1,2,3,4,5,6,8,11,12,13,14,15,16],note:'Upper loop with a right descender and an inward lower hook.'},

    '!':{pieces:[3,6,8],note:'Upper diagonal stroke and a separate lower triangular dot.'},
    '#':{pieces:[2,3,5,7,9,11,12,14],note:'Two pairs of crossing diagonal bands; a slanted hash study.'},
    '$':{pieces:[1,2,3,5,6,8,9,10,12,13,14,15,16],note:'Opposed S-like turns crossed by the inner diagonal stem.'},
    '%':{pieces:[1,4,5,6,8,9,10,13],note:'Ascending diagonal between isolated upper-left and lower-right triangular dots.'},
    '&':{pieces:[1,2,3,6,7,8,9,10,13,14,15],note:'Two left-hand loops with an added lower-right diagonal tail.'},
    '*':{pieces:[3,5,9,14,15,16],note:'Six inward-pointing facets surround the fixed center opening.'},
    '+':{pieces:[6,8,15,16],note:'Four inward terminals mark the arms of a plus around the central opening.'},
    ',':{pieces:[13,14],note:'Lower triangular mark extended into a diagonal tail.'},
    '-':{pieces:[6],note:'One short, flat-ended inner cap suggests a horizontal dash.'},
    ';':{pieces:[4,13,14],note:'Upper triangular dot above a lower comma-like mark.'},
    '=':{pieces:[6,8],note:'Two separated, flat-ended inner caps.'},
    '?':{pieces:[1,3,4,5,6,8,11,16],note:'An upper-right hooked sweep ending above a detached lower dot.'},
    '@':{pieces:[1,2,3,4,5,6,7,8,9,10,11,12,14,15,16],note:'Angular enclosing ring with an inward return and an open lower-right terminal.'},
    '[':{pieces:[1,2,3,7,8,9,10,15],note:'Left spine with extended inward top and bottom returns.'},
    ']':{pieces:[4,5,6,11,12,13,14,16],note:'Right spine with inward top and bottom returns.'},
    '_':{pieces:[10,13],note:'Two aligned lower caps suggest a low horizontal rule.'},
    '{':{pieces:[2,3,6,7,8,9,15],note:'Left-pointing waist between two inward-curving returns.'},
    '|':{pieces:[5,6,8,9],note:'One continuous-direction central stem, interrupted only by the fixed opening.'},
    '}':{pieces:[5,6,8,11,12,14,16],note:'Right-pointing waist between two inward-curving returns.'},
    '~':{pieces:[1,3,5,6],note:'A short upper wave descending into the central valley and rising again.'}
  };
  const SEEDS = Object.create(null);
  Core.SEQUENCES.ascii.forEach(function (glyph) {
    const recipe = recipes[glyph];
    if (!recipe && glyph !== ' ') throw new Error('Missing printable character study: ' + glyph);
    const fills = recipe ? fillsFromNumbers(recipe.pieces) : allWhite();
    const red = ids.filter(function (id) { return fills[id] === CARDINAL; });
    SEEDS[glyph] = Object.freeze({
      glyph:glyph,
      status:recipe ? 'guess' : 'blank',
      red:Object.freeze(red),
      note:recipe ? recipe.note : 'Space is intentionally empty.',
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
