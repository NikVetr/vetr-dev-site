// Decorative ink only: these marks never participate in measurement or fitting.
// Coordinates are local to each mark so cut/fold/export use the same geometry.

import { LANGUAGE_MOTIFS, pathPen as pen, isLanguageEmblem, languageRule, languageCorner } from "./ornament-designs.js";

export { LANGUAGE_MOTIFS } from "./ornament-designs.js";

export const ORNAMENT_STYLES = /** @type {const} */ ([
  'classic', 'language', 'botanical', 'waves', 'mosaic', 'weave', 'laurel', 'starforge',
]);
/** @typedef {typeof ORNAMENT_STYLES[number]} OrnamentStyle */
/** @typedef {Exclude<OrnamentStyle, 'classic'|'language'>|import('./ornament-designs.js').LanguageMotif} Motif */
/** @typedef {import('./types.js').PathMark} PathMark */
/** @typedef {ReturnType<typeof pen>} Pen */

/** @param {OrnamentStyle|undefined} style @param {string} target */
export function motifFor(style, target) {
  if (style === undefined || style === 'classic') return null;
  if (!ORNAMENT_STYLES.includes(style)) throw new Error(`unknown ornament style: ${style}`);
  if (style !== 'language') return style;
  const motif = LANGUAGE_MOTIFS[/** @type {keyof typeof LANGUAGE_MOTIFS} */ (target)];
  if (!motif) throw new Error(`no ornament design for language: ${target}`);
  return motif;
}

// ---------------------------------------------------------------------------
// Shared measures and marks. Pen space is a 100-square stretched onto the box,
// so a design measured only in pen units comes out nine times as long on the
// 220x18 interface swatch as on a 110x3.2 section divider. Everything below
// takes its proportions from the box it was handed instead.
// ---------------------------------------------------------------------------

/** How many repeats of a pattern to lay down, chosen so that one repeat keeps a
 * constant shape *on paper*. `aspect` is the repeat's width as a multiple of the
 * band's height, so the same style reads the same on a divider and a swatch.
 * @param {number} w @param {number} h @param {number} aspect @param {number} max */
function cells(w, h, aspect, max) {
  return Math.min(max, Math.max(2, Math.round(w / (h * aspect))));
}

/** @param {Pen} p @param {number} x @param {number} y @param {number} w @param {number} h */
function box(p, x, y, w, h) {
  p.m(x, y); p.l(x + w, y); p.l(x + w, y + h); p.l(x, y + h); p.close();
}

/** A shower: unequal rays struck out of one point, thrown in the direction of
 * `turn`. What matters is where the rays land *on paper*, so the horizontal
 * component is scaled by `k` and the caller sets it -- a square corner box wants
 * 1, and a rule band wants the fan spread along the bar until its rays are far
 * enough apart to print as separate strokes. `reach` is the longest ray in pen-y
 * units; the lengths are deliberately unequal, because a shower is not a star.
 * @param {Pen} p @param {number} x @param {number} y @param {number} k
 * @param {number} turn radians @param {number} reach */
function burst(p, x, y, k, turn, reach) {
  for (const [spread, f] of [[-1.15, 0.72], [-0.62, 1], [-0.08, 0.8],
    [0.5, 0.95], [1.1, 0.62]]) {
    const r = reach * f, a = turn + spread;
    const dx = Math.cos(a) * r * k, dy = Math.sin(a) * r;
    // Starting clear of the strike, so it reads as metal coming off the bar
    // rather than as an asterisk pinned to it.
    p.m(x + dx * 0.3, y + dy * 0.3); p.l(x + dx, y + dy);
  }
}

/** A cut sprig: leaves in opposite pairs along a quadratic branch, each raking
 * the way the branch grows and shortening toward the tip.
 *
 * `aspect` is the box's height over its width, and everything about the leaf is
 * taken from it, because pen space is stretched onto the box: a leaf set at a
 * fixed angle here stands upright in a square corner and lies flat along the
 * stem on a 110x3 divider, where it reads as a lozenge threaded on the line
 * rather than as a leaf. Leaning and broadening it in proportion to the box
 * keeps one shape on paper at every size the app asks for.
 * @param {Pen} p @param {[number,number,number,number,number,number]} q
 * @param {number} n @param {number} size @param {number} aspect */
function sprig(p, q, n, size, aspect) {
  const rake = Math.min(0.5, aspect * 0.42);
  // A leaf can carry a breadth only where the box is deep enough to show one.
  // On a divider the whole leaf is three quarters of a point long, so its two
  // margins would print on top of each other as a blot; there it is drawn as a
  // single barb instead, which is the trade the language table makes at the same
  // height under the name `tracery`.
  const breadth = aspect < 0.06 ? 0 : Math.min(0.3, aspect * 0.26);
  const [x0, y0, cx, cy, x1, y1] = q;
  p.m(x0, y0); p.q(cx, cy, x1, y1);
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.7) / (n + 0.5), u = 1 - t;
    const bx = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const by = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const tx = u * (cx - x0) + t * (x1 - cx), ty = u * (cy - y0) + t * (y1 - cy);
    const tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
    const s = size * (1 - t * 0.4);
    for (const side of [-1, 1]) {
      const dx = (ux * rake - side * uy) * s, dy = (uy * rake + side * ux) * s;
      if (!breadth) { p.m(bx, by); p.l(bx + dx, by + dy); continue; }
      // Broadest a third of the way up and drawn to a fine point: a bay leaf is
      // lanceolate, not the symmetric lens a vine leaf is.
      const nx = -dy * breadth, ny = dx * breadth;
      p.m(bx, by);
      p.c(bx + dx * 0.16 + nx, by + dy * 0.16 + ny,
        bx + dx * 0.64 + nx * 0.8, by + dy * 0.64 + ny * 0.8, bx + dx, by + dy);
      p.c(bx + dx * 0.64 - nx * 0.8, by + dy * 0.64 - ny * 0.8,
        bx + dx * 0.16 - nx, by + dy * 0.16 - ny, bx, by);
    }
  }
}

/** One strip of a two-strip plait. It travels between two lanes, meets its
 * partner at every cell's midpoint, and where it passes *under* its line stops
 * short on both sides of the crossing. That gap is the entire difference between
 * a weave and two crossed lines. `off` is the strip's half-width, and 0 draws it
 * as a single thread, which is all a 3pt divider can hold.
 * @param {Pen} p @param {number} n @param {number} phase
 * @param {number} amp @param {number} off */
function plait(p, n, phase, amp, off) {
  const c = 100 / n, g = off ? 0.13 : 0.18;
  for (let i = 0; i < n; i += 1) {
    const x0 = i * c, x1 = x0 + c, mid = x0 + c / 2;
    const a = (i + phase) % 2 ? 50 + amp : 50 - amp, b = 100 - a;
    // The strip lies flat in its lane, runs straight through the crossing, then
    // eases into the other lane; the control points are placed for tangent
    // continuity so the join at the lane is a curve and not a kink.
    const rise = 0.36 * (b - a);
    for (const d of off ? [-off, off] : [0]) {
      p.m(x0, a + d);
      p.q(x0 + 0.222 * c, a + d, x0 + 0.3 * c, 50 - rise + d);
      if (i % 2 === phase) {
        p.l(mid - g * c, 50 - rise * g / 0.2 + d);
        p.m(mid + g * c, 50 + rise * g / 0.2 + d);
      }
      p.l(x1 - 0.3 * c, 50 + rise + d);
      p.q(x1 - 0.222 * c, b + d, x1, b + d);
    }
  }
}

/** One strip of a plain weave -- the plait turned into two directions -- with the
 * crossings it passes under left open and its far end capped, because a woven
 * patch is a piece of material with a cut edge.
 * @param {Pen} p @param {number} lane @param {number} hw @param {number[]} under
 * @param {number} from @param {number} to @param {boolean} down */
function strip(p, lane, hw, under, from, to, down) {
  /** @param {number} a @param {number} b @param {number} d */
  const run = (a, b, d) => {
    if (down) { p.m(lane + d, a); p.l(lane + d, b); }
    else { p.m(a, lane + d); p.l(b, lane + d); }
  };
  for (const d of [-hw, hw]) {
    let at = from;
    for (const u of under) { run(at, u - hw - 3, d); at = u + hw + 3; }
    run(at, to, d);
  }
  if (down) { p.m(lane - hw, to); p.l(lane + hw, to); }
  else { p.m(to, lane - hw); p.l(to, lane + hw); }
}

/** A horizontal ornament. All ink, including the stroke, stays inside its box.
 * @param {Motif} motif @param {number} x @param {number} y
 * @param {number} w @param {number} h @param {string} color
 * @returns {PathMark} */
export function ornamentRule(motif, x, y, w, h, color) {
  const strokeWidth = Math.min(0.3, h / 5);
  const pad = strokeWidth;
  const p = pen(w - pad * 2, h - pad * 2);
  // A section divider is about 3pt tall, so one stroke is a tenth of its height
  // and two registers is nearly all it can hold. `fine` is the taller boxes --
  // the title flourish, the gutter, the interface swatch -- where a second
  // contour or an interior detail survives instead of closing into a blot.
  const fine = h >= 5;
  if (isLanguageEmblem(motif)) {
    languageRule(motif, p, w - pad * 2, h - pad * 2);
  } else if (motif === 'botanical') {
    // The elven vine, and this is the half of it worth keeping now that `laurel`
    // no longer shares the design: it *wanders*. The stem is an S rather than a
    // branch and the leaves alternate rather than pair, where `laurel` below is
    // the same plant cut, bound and finished, in opposite pairs on a straight
    // stem. The tendril that says the vine is still growing is kept for the
    // corner and deliberately not attempted here: a coil in a band twelve times
    // wider than it is tall comes out as a flat squiggle, not a curl.
    const n = cells(w, h, 5.2, 3);
    p.m(0, 55); p.c(18, 62, 23, 35, 43, 50);
    p.m(57, 50); p.c(77, 65, 82, 38, 100, 45);
    for (let k = 0; k < n; k += 1) {
      const o = 8 + (k + 0.5) * (32 / n);
      for (const [i, a] of [o, 100 - o].entries()) {
        const s = (k + i) % 2 ? -1 : 1;
        p.m(a, 50); p.c(a - 3 * s, 50 - 15 * s, a - s, 50 - 32 * s, a + 7 * s, 50 - 38 * s);
        p.c(a + 8 * s, 50 - 13 * s, a + 4 * s, 50 - 5 * s, a, 50);
      }
    }
    // The bud the two stems run into, and its one vein.
    p.m(43, 50); p.q(50, 5, 57, 50); p.q(50, 95, 43, 50);
    p.m(47, 50); p.l(53, 50);
  } else if (motif === 'laurel') {
    // A wreath, which is a branch *cut and bound* -- and that is the whole of
    // what separates it from `botanical` above, whose design it used to share
    // with a flag turned on. The leaves sit in opposite pairs at one constant
    // angle and every one of them rakes away from the tie, because a branch
    // grows outward from where it was cut; there are no tendrils, because a cut
    // branch has stopped growing; and the two stems never join, they are
    // *bound* -- the fillet crossed over the middle with its tail let fall is
    // the mark, and nothing else here or in the language table has one.
    // Named against `oak` (en), which is one lobed leaf seen flat rather than a
    // sprig, and `acanthus` (it), whose leaves scroll back on themselves.
    const n = cells(w, h, 1.3, 10);
    for (const [t, e] of [[44, 7], [56, 93]]) {
      sprig(p, [t, 50, (t + e) / 2, 50, e, 50], n, 32, h / w);
    }
    p.m(44, 34); p.c(53, 43, 47, 57, 56, 66);
    p.m(56, 34); p.c(47, 43, 53, 57, 44, 66);
    p.m(49, 62); p.q(42, 76, 47, 92);
    p.m(53, 62); p.q(60, 74, 56, 86);
  } else if (motif === 'waves') {
    // Open water seen side-on, and not water as a pattern. A swell's own mark is
    // that it is *asymmetric* -- a long shallow back, a short steep face -- and
    // that its crest does not close: it pitches forward and breaks. Named
    // against `seigaiha` (ja), the one motif anywhere in the set this could be
    // confused with, and on the mark: seigaiha is nested concentric arcs that
    // never terminate, a textile pattern of water, where every crest here ends
    // in mid-air over a line of broken chop. Also against `cloud` (zh-Hans), a
    // closed lobed silhouette, and `sail` (sw), one rigid triangle.
    const n = cells(w, h, 2.4, 9), c = 100 / n;
    for (let i = 0; i < n; i += 1) {
      const x0 = i * c;
      // The long shallow back, then the face pitching up: the crest sits two
      // thirds of the way along and the water falls away in half that distance,
      // which is the asymmetry the whole design is for.
      p.m(x0, 60); p.c(x0 + c * 0.38, 59, x0 + c * 0.46, 26, x0 + c * 0.68, 24);
      p.c(x0 + c * 0.82, 23, x0 + c * 0.90, 46, x0 + c, 60);
      // Broken water in the trough, out of phase with the crests above it.
      p.m(x0 + c * 0.05, 87); p.l(x0 + c * 0.24, 87);
      p.m(x0 + c * 0.34, 80); p.l(x0 + c * 0.51, 80);
      if (!fine) continue;
      // The break: the lip throws forward and hooks back under itself.
      p.m(x0 + c * 0.68, 24); p.c(x0 + c * 0.84, 13, x0 + c * 0.95, 34, x0 + c * 0.79, 39);
      // and the spray goes clear of it.
      p.m(x0 + c * 0.66, 13); p.l(x0 + c * 0.78, 6);
      p.m(x0 + c * 0.50, 12); p.l(x0 + c * 0.58, 5);
    }
  } else if (motif === 'mosaic') {
    // Cut stone set in grout. A mosaic is not a row of diamonds: it is a field
    // divided into small *identical* hard-edged cubes with ground showing all
    // round every one of them, laid along a course. So the unit here is a closed
    // tessera and the space between two of them is the grout, and the only
    // tessera that is not square is the one set on the diagonal at the middle of
    // the band, which is where a real border turns a corner. Named against
    // `hazorbof` (uz), the closest mark anywhere in the set: brickwork draws its
    // *joints* as lines through a continuous field, so its bricks touch, where
    // tesserae are discrete and never do. Also against `sklo` (cs), straight
    // facets ground radially into one crystal, and `suhozid` (hr), whose stones
    // are deliberately all different because nobody cut them.
    const n = cells(w, h, 0.7, 25) | 1, c = 100 / n, t = c * 0.72;
    const top = fine ? 10 : 20, bottom = fine ? 66 : 80;
    for (let i = 0; i < n; i += 1) {
      const x0 = i * c + (c - t) / 2;
      if (i * 2 + 1 === n) {
        p.m(i * c, (top + bottom) / 2); p.l(x0 + t / 2, top - 8);
        p.l((i + 1) * c, (top + bottom) / 2); p.l(x0 + t / 2, bottom + 8); p.close();
      } else box(p, x0, top, t, bottom - top);
    }
    // The fillet row a wide course is bordered with, when the band is tall
    // enough to keep the grout open under it.
    if (fine) for (let i = 0; i < n; i += 1) box(p, i * c + c * 0.35, 78, c * 0.3, 16);
  } else if (motif === 'weave') {
    // Two strips plaited, and the whole design turns on one mark: where a strip
    // passes *under* its partner, its line stops short on both sides. That gap
    // is the difference between a weave and two crossed lines, which is what
    // this style used to be. Named against `banig` (fil), the plaited mat, whose
    // unit is a discrete facet of the ground with no strip running through it at
    // all, and against `interlace` (ar), strapwork whose lines are continuous
    // and never terminate anywhere.
    const n = cells(w, h, 2.2, 8);
    for (const phase of [0, 1]) plait(p, n, phase, 22, fine ? 10 : 0);
  } else {
    // Worked stock, and at divider height the *sparks* have to be the loud half,
    // because thickness is the one thing a 3pt band cannot show: two contours a
    // fifth of a point apart print as a single line. That is exactly what the
    // previous design was -- a planished top edge over a swollen underside,
    // stepping by 0.36pt where one stroke is already 0.3pt -- so at 110x3.2 it
    // came out as a doubled straight rule with specks over it, near enough to
    // `classic` that choosing this style looked like choosing no ornament.
    //
    // So the bar is one emphatic line and its identity is in its outline: a
    // hairline neck, a shoulder up into the upset where the hammer landed with
    // the anvil's swell beneath it, then a neck again. A thin line carrying
    // heavy lumps is a silhouette 2.6pt can hold -- about three times the
    // apparent weight at an upset as at a neck -- and off the struck face of
    // every upset, a shower.
    //
    // Named against `sklo` (cs), the other radial mark struck into a hard
    // material: a star-cut's facets are equal, run from the centre of a closed
    // faceted octagon and end on it, where these are unequal, end in mid-air
    // and have no figure to enclose them. And against `askatakwas` (ha), eight
    // closed blades in exact radial symmetry around a collar -- which is what a
    // star is, and what this is not.
    const m = cells(w, h, 12, 4), c = 100 / m;
    const aspect = (h - pad * 2) / (w - pad * 2), reach = 54;
    // Every blow is flat on both faces, so an upset is a slab and not a lens --
    // which is also what keeps it out of `weave`'s chain of pointed links at
    // this height -- and its struck face is the wider one, because that is the
    // way hammered stock spreads. The shoulder has to be measured in the box's
    // proportions as well: a step of a fixed width in pen units is steep in a
    // square corner and a three-point-long taper on a divider, which is how the
    // slab came out as a lens the first time this was drawn.
    const shoulder = Math.min(28 * aspect, 0.18 * c);
    p.m(0, 75);
    for (let i = 0; i < m; i += 1) {
      const x0 = i * c;
      p.l(x0 + 0.30 * c, 75); p.l(x0 + 0.30 * c + shoulder, 55);
      p.l(x0 + 0.78 * c - shoulder, 55); p.l(x0 + 0.78 * c, 75);
    }
    p.l(100, 75);
    // A fan's rays have to land a few stroke widths apart or they print as one
    // blot, and 2.6pt of band cannot give a paper-isotropic fan that much room.
    // So the fan is stretched along the bar until it is about 4pt across, which
    // is how sparks leave struck stock anyway -- low and along it, not straight
    // up. A ray is also held inside its own cell, which is what bounds the
    // spread on a box taller than it is wide.
    const spread = Math.min(Math.max(1, 4 / (reach * (h - pad * 2) / 100)) * aspect,
      0.42 * c / reach);
    for (let i = 0; i < m; i += 1) {
      const x0 = i * c;
      p.m(x0 + 0.30 * c, 75); p.l(x0 + 0.30 * c + shoulder * 1.7, 93);
      p.l(x0 + 0.78 * c - shoulder * 1.7, 93); p.l(x0 + 0.78 * c, 75);
      // No blow lands quite like the last one, so the showers lean apart.
      burst(p, x0 + 0.54 * c, 55, spread,
        -Math.PI / 2 + (i % 2 ? 0.22 : -0.17), reach);
      if (!fine) continue;
      // The hammer's own marks across the struck face, leaning by the box's
      // proportions for `burst`'s reason.
      for (const t of [0.46, 0.62]) {
        p.m(x0 + t * c + 9 * aspect, 60); p.l(x0 + t * c - 9 * aspect, 88);
      }
    }
  }
  const d = p.d().replace(/-?\d+(?:\.\d+)?/g,
    n => String(Number((Number(n) + pad).toFixed(3))));
  return { x, y, w, h, d, stroke: color, strokeWidth };
}

/** Larger corner flourishes, used only where there is genuinely empty paper.
 * Every design is drawn for the top-left corner and mirrored by coordinate
 * parity below, so anything that reads as handed has to be handed both ways.
 * @param {Motif} motif @param {number} size @param {string} color
 * @param {number} x @param {number} y @param {boolean} right @param {boolean} bottom
 * @returns {PathMark} */
function corner(motif, size, color, x, y, right, bottom) {
  const pad = 0.35;
  const p = pen(size - 2 * pad, size - 2 * pad);
  if (isLanguageEmblem(motif)) {
    languageCorner(motif, p);
  } else if (motif === 'botanical') {
    // The vine again, doubled: two stems running the same course at different
    // depths, leaves alternating along them, and the tendrils coiling off into
    // the open quadrant. It wanders where the laurel corner is bound.
    p.m(5, 94); p.c(34, 72, 0, 28, 40, 12); p.c(69, 0, 84, 21, 94, 5);
    p.m(10, 88); p.c(48, 63, 18, 40, 54, 23); p.c(76, 14, 83, 28, 94, 16);
    for (const [a, b] of [[16, 65], [20, 42], [42, 26]]) {
      p.m(a, b); p.c(a - 16, b - 3, a - 12, b - 19, a, b - 24);
      p.c(a + 9, b - 12, a + 5, b - 5, a, b);
    }
    p.m(40, 48); p.c(67, 43, 70, 30, 62, 27); p.c(52, 23, 47, 34, 53, 37);
    p.m(31, 74); p.c(56, 72, 49, 52, 38, 60); p.c(32, 65, 40, 68, 43, 64);
  } else if (motif === 'laurel') {
    // One wreath bound at the corner: the tie sits on the corner's own diagonal
    // and a branch springs from it along each edge, each a single sweep rather
    // than the vine's S, leaves in opposite pairs raking outward all the way to
    // the tip. The fillet is two turns of a narrow band across the joint with
    // its tails let fall into the open quadrant -- the same binding the rule
    // has, which is what makes a sheet of laurel look composed.
    for (const q of /** @type {[number,number,number,number,number,number][]} */ ([
      [34, 34, 18, 60, 17, 88], [34, 34, 60, 18, 88, 17],
    ])) sprig(p, q, 3, 22, 1);
    for (const o of [0, 7]) { p.m(20 + o, 44 + o); p.l(44 + o, 20 + o); }
    p.m(40, 40); p.c(56, 46, 54, 60, 68, 66);
    p.m(43, 37); p.c(60, 40, 64, 52, 78, 54);
  } else if (motif === 'waves') {
    // One wave, breaking. The swell rises off the left, the crest pitches over
    // and hooks back under itself, the spray goes clear, and the foam lies in
    // the trough behind. The doubled contour is the water's own thickness, and
    // it is also what keeps this out of `seigaiha` (ja): nested arcs that never
    // terminate, which is exactly what this corner used to be.
    p.m(4, 74); p.c(26, 66, 34, 22, 58, 14);
    p.c(78, 8, 90, 26, 86, 34); p.c(82, 42, 68, 42, 62, 36);
    p.m(16, 90); p.c(36, 82, 44, 40, 62, 28);
    p.m(70, 26); p.c(78, 24, 82, 31, 80, 35);
    for (const [a, b, d] of [[68, 9, 6], [81, 14, 5], [91, 7, 4]]) {
      p.m(a, b); p.l(a + d, b - d * 0.7);
    }
    p.m(26, 84); p.l(38, 80); p.m(44, 92); p.l(58, 88);
  } else if (motif === 'mosaic') {
    // The field turning the corner: two courses of tesserae following the angle
    // with grout showing all round every cube, and one chip set on the diagonal
    // where the courses turn. The courses are concentric and *separated*, which
    // is the line between this and brickwork, and every cube is the same size,
    // which is the line between it and a dry-stone wall.
    for (let i = 0; i < 4; i += 1) {
      box(p, 5 + i * 24, 5, 18, 18);
      if (i) box(p, 5, 5 + i * 24, 18, 18);
    }
    for (let i = 0; i < 2; i += 1) {
      box(p, 29 + i * 24, 29, 18, 18);
      if (i) box(p, 29, 29 + i * 24, 18, 18);
    }
    p.m(53, 64); p.l(64, 53); p.l(75, 64); p.l(64, 75); p.close();
  } else if (motif === 'weave') {
    // Plain weave: three strips across three, and at every crossing the one
    // passing under stops short -- the rule's plait, turned into two directions
    // so a sheet of this style is one idea. The far ends are capped square
    // because a woven patch has a cut edge; `banig` (fil) has no strip running
    // through its facets and `interlace` (ar) never breaks a line at all.
    const lanes = [20, 46, 72];
    for (const [i, lane] of lanes.entries()) {
      strip(p, lane, 8, lanes.filter((_, j) => (i + j) % 2 === 0), 4, 92, false);
      strip(p, lane, 8, lanes.filter((_, j) => (i + j) % 2 === 1), 4, 92, true);
    }
  } else {
    // The bar off the anvil and the shower off the bar: the rule's two marks
    // turned into a corner, so a sheet of this style is one idea. The stock has
    // been bent round the corner and drawn out to a point at each end -- which
    // is why the inner contour runs back into the outer one there instead of
    // stopping beside it, the difference between a forged bar and a pair of
    // rules, and the elbow is the upset the rule's slabs are -- and the hammer
    // marks lie across it the way they lie across the rule. The shower is the
    // rule's own `burst`: one off each arm, thrown square off the struck face,
    // which is also what keeps every ray inside the open quadrant instead of
    // firing back across the metal it came from. The two are deliberately
    // unequal, because two blows are.
    p.m(4, 92); p.l(4, 4); p.l(92, 4);
    p.m(4, 92); p.l(20, 74); p.l(20, 20); p.l(74, 20); p.l(92, 4);
    for (const a of [32, 46, 60]) {
      p.m(6, a); p.l(18, a - 5); p.m(a, 6); p.l(a - 5, 18);
    }
    burst(p, 20, 48, 1, 0, 40);
    burst(p, 50, 20, 1, Math.PI / 2, 26);
  }
  // Mirror local coordinates once here; exports need only a translation.
  let coordinate = 0;
  const d = p.d().replace(/-?\d+(?:\.\d+)?/g, (n) => {
    const flip = coordinate++ % 2 ? bottom : right;
    const value = Number(n) + pad;
    return String(Number((flip ? size - value : value).toFixed(3)));
  });
  return { x, y, w: size, h: size, d, stroke: color, strokeWidth: 0.35 };
}

/** Keep corner art inside the printer-safe area, clear of content, running heads,
 * and phone reservations. Tight sheets simply have decorated rules.
 * @param {import('./types.js').SheetSpec} spec @param {import('./types.js').Face} face
 * @param {{insetX:number,insetY:number}} box @param {string} color
 * @returns {PathMark[]} */
export function cornerOrnaments(spec, face, box, color) {
  const motif = motifFor(spec.ornamentStyle, spec.target);
  if (!motif || spec.inkMode === 'low-ink') return [];
  const g = spec.geometry;
  const left = box.insetX + 1;
  const top = Math.max(box.insetY, g.pageH * (g.reserve?.top ?? 0)) + 1;
  const bottom = g.pageH - Math.max(box.insetY, g.pageH * (g.reserve?.bottom ?? 0)) - 1;
  const right = g.pageW - box.insetX - 1;
  const obstacles = [
    ...face.hits,
    ...face.runs.map(r => ({ x: r.x, y: r.y - r.size * 1.3,
      w: Math.max(r.size, r.text.length * r.size), h: r.size * 1.7 })),
  ];
  /** @type {PathMark[]} */ const out = [];
  for (const mirroredX of [false, true]) for (const mirroredY of [false, true]) {
    for (const size of [26, 20, 14, 9]) {
      const x = mirroredX ? right - size : left;
      const y = mirroredY ? bottom - size : top;
      if (x < left || y < top || x + size > right || y + size > bottom) continue;
      // A flourish must belong wholly to one half when the sheet is cut or folded.
      if (x < g.pageW / 2 && x + size > g.pageW / 2) continue;
      const collides = obstacles.some(o => x < o.x + o.w + 1 && x + size + 1 > o.x
        && y < o.y + o.h + 1 && y + size + 1 > o.y);
      if (collides) continue;
      out.push(corner(motif, size, color, x, y, mirroredX, mirroredY));
      break;
    }
  }
  return out;
}

/** Slender flourishes in the existing column gutters give dense cards a visible
 * motif without borrowing space from text. Leave the card-cut seam clear.
 * @param {import('./types.js').SheetSpec} spec
 * @param {{left:number,top:number,colWidth:number,height:number}} box
 * @param {string} color @returns {PathMark[]} */
export function gutterOrnaments(spec, box, color) {
  const motif = motifFor(spec.ornamentStyle, spec.target);
  const gap = spec.geometry.columnGap;
  if (!motif || spec.inkMode === 'low-ink' || gap < 2.5) return [];
  const width = Math.min(7, gap - 1.5);
  const height = Math.min(46, box.height - 4);
  if (height < 16) return [];
  /** @type {PathMark[]} */ const out = [];
  for (let c = 1; c < spec.geometry.columns; c += 1) {
    const x = box.left + c * box.colWidth + (c - 0.5) * gap - width / 2;
    if (x < spec.geometry.pageW / 2 && x + width > spec.geometry.pageW / 2) continue;
    for (let y = box.top + 2; y + height <= box.top + box.height - 2; y += 86) {
      const rule = ornamentRule(motif, 0, 0, height, width, color);
      const d = rule.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, '$2 $1');
      out.push({ ...rule, x: x + rule.y, y: y + rule.x, w: rule.h, h: rule.w, d });
    }
  }
  return out;
}
