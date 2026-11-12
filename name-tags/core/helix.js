// The tags' DNA helix (R's draw_DNA with take_union, in polylines_vendored.R): the
// helix geometry of shared/helix.js drawn with rot = 90, its pieces merged into one
// filled outline, with gaps where the bottom line's descenders cross its straight end.

import { dnaShape, ribbon } from '../../shared/helix.js';
import { polygonArea, union } from '../../shared/polygon.js';

/**
 * @typedef {import('../../shared/polygon.js').Polygon} Polygon
 * @typedef {import('../../shared/helix.js').Piece} Piece
 */

/**
 * The helix as filled polygons: each piece's ribbon made valid (even-odd, as
 * GEOS's make-valid), all merged, slivers under 1e-12 square units dropped.
 * @param {Piece[]} pieces @param {number} xyr
 * @returns {Polygon[]}
 */
export function helixOutline(pieces, xyr) {
  const valid = pieces.flatMap((p) => union([ribbon(p.x, p.y, p.lwd, xyr)], 'evenodd'));
  return union(valid.flat(), 'nonzero').filter((poly) => polygonArea(poly) > 1e-12);
}


/**
 * find_gaps: x ranges of the runs of consecutive points lying below `y`,
 * widened by `widen` on each side.
 * @param {number[]} xs @param {number[]} ys @param {number} y @param {number} widen
 */
export function findGaps(xs, ys, y, widen) {
  /** @type {number[][]} */
  const gaps = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= ys.length; i++) {
    if (i < ys.length && ys[i] < y) {
      lo = Math.min(lo, xs[i]);
      hi = Math.max(hi, xs[i]);
    } else if (lo <= hi) {
      gaps.push([lo - widen, hi + widen]);
      lo = Infinity;
      hi = -Infinity;
    }
  }
  return gaps;
}

/**
 * draw_dna_decoration: the helix of a laid-out tag, left of the bottom line,
 * its straight end underlining that line with gaps where the line's
 * descenders cross it. In the tag's frame shifted by `adj` inches.
 * @param {import('./layout.js').Tag} tag @param {number[]} adj
 */
export function tagHelixPieces(tag, adj) {
  const dec = /** @type {import('./layout.js').DnaDecoration} */ (tag.decoration);
  const bottom = dec.bbox[1] + adj[1];
  const xs = [];
  const ys = [];
  for (const glyph of tag.lines[1].glyphs) {
    for (const ring of glyph) {
      for (let k = 0; k < ring.length; k += 2) {
        xs.push(ring[k] + adj[0]);
        ys.push(ring[k + 1] + adj[1]);
      }
    }
  }
  const gaps = ys.some((y) => y < bottom) ? findGaps(xs, ys, bottom, 0.02) : null;
  const shape = dnaShape({
    dhBounds: dec.dh_bounds, rot: 90, strandThickness: dec.box_dim[1] * 0.08, extendStraight: dec.extend_straight,
    extendStraightBy: dec.extend_straight_by, topleft: [dec.topleft[0] + adj[0], dec.topleft[1] + adj[1]], forcedBox: dec.box_dim,
    boxDNA: true, extensionRealUnits: true, propDist: dec.prop_dist, gaps, xyr: 1,
  });
  return { shape, gaps };
}

/** @param {import('./layout.js').Tag} tag @param {number[]} adj */
export function tagHelix(tag, adj) {
  const { shape, gaps } = tagHelixPieces(tag, adj);
  return { polygons: helixOutline(shape.pieces, 1), gaps };
}
