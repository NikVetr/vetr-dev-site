// The angled-corners decoration, inspired by the Rethink Priorities logo's bands cut
// at 60 degrees. Nik's R drawer called it for its "rethink_priorities" group with
// draw_corner_path() twice: a bottom-left path in the helix's box (rising at the
// angle from the box's bottom-left corner, doubling back, with a hollow triangle
// beside it, inset by the gap between the lines) that runs on under the bottom line
// as the helix's straight end does, and a top-right path over the top line that
// turns down at the angle towards the bottom line's top-right corner. The function
// itself did not survive, so the shapes here are drawn from those calls: bands
// `line_width` wide, mitred to points at their turns. The tag is laid out and fitted
// exactly as for the DNA helix; the decoration fills the same box.

import { difference, union } from '../../shared/polygon.js';
import { findGaps } from './helix.js';

/**
 * @typedef {import('./geometry.js').Polygon} Polygon
 * @typedef {{ line_width: number, angle: number, triangle: boolean }} CornersOptions
 * @typedef {number[]} Point
 */

/**
 * A polyline offset by `d` (to its left), mitred at the turns; a closed one has
 * no end points (its first point is not repeated).
 * @param {Point[]} pts @param {number} d @param {boolean} closed
 * @returns {Point[]}
 */
function offsetLine(pts, d, closed) {
  const n = pts.length;
  const normal = (/** @type {Point} */ a, /** @type {Point} */ b) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  };
  return pts.map((p, i) => {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[i - 1];
    const next = closed ? pts[(i + 1) % n] : pts[i + 1];
    if (!prev) {
      const m = normal(p, /** @type {Point} */ (next));
      return [p[0] + d * m[0], p[1] + d * m[1]];
    }
    if (!next) {
      const m = normal(prev, p);
      return [p[0] + d * m[0], p[1] + d * m[1]];
    }
    const a = normal(prev, p);
    const b = normal(p, next);
    const mx = a[0] + b[0];
    const my = a[1] + b[1];
    const k = d / (1 + a[0] * b[0] + a[1] * b[1]); // miter: d / cos(half the turn), along a + b
    return [p[0] + k * mx, p[1] + k * my];
  });
}

/** @param {Point[]} pts */
const ring = (pts) => [...pts.flat(), pts[0][0], pts[0][1]];

/**
 * A band `w` wide centred on a polyline, as filled polygons. An open line's band is
 * one ring, filled under the nonzero rule so that where it crosses itself (a peak's
 * foot coming down onto the underline it rose from) it stays filled; a closed
 * line's is two, its outline with the inside a hole under the even-odd rule.
 * @param {Point[]} pts @param {number} w @param {boolean} [closed]
 * @returns {Polygon[]}
 */
function band(pts, w, closed = false) {
  const left = offsetLine(pts, w / 2, closed);
  const right = offsetLine(pts, -w / 2, closed);
  return closed ? union([ring(left), ring(right)], 'evenodd') : union([ring([...left, ...right.reverse()])], 'nonzero');
}

/**
 * The decoration of a laid-out two-line tag, as filled polygons in the tag's frame
 * shifted by `adj` inches.
 * @param {import('./layout.js').Tag} tag @param {number[]} adj @param {CornersOptions} o
 * @returns {Polygon[]}
 */
export function tagCorners(tag, adj, o) {
  const dec = /** @type {import('./layout.js').DnaDecoration} */ (tag.decoration);
  const lw = o.line_width;
  const th = o.angle / 180 * Math.PI;
  const cot = 1 / Math.tan(th);
  const across = lw / 2 / Math.sin(th); // half a slanted band's width, measured level
  const tip = lw / 2 / Math.tan(th / 2); // how far a band's point reaches past its centreline's corner, level
  const lineBounds = (/** @type {number} */ j) => {
    /** @type {number[]} */
    const xs = [];
    /** @type {number[]} */
    const ys = [];
    for (const g of tag.lines[j].glyphs) for (const r of g) for (let k = 0; k < r.length; k += 2) {
      xs.push(r[k] + adj[0]);
      ys.push(r[k + 1] + adj[1]);
    }
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), xs, ys };
  };
  const top = lineBounds(0);
  const bottom = lineBounds(1);
  const [bx0, by0, bx1, by1] = dec.bbox.map((v, i) => v + adj[i % 2]);
  const space = Math.max(top.y0 - bottom.y1, lw); // R's space_names: the gap between the lines
  /** @type {Polygon[]} */
  const shapes = [];

  // Bottom left: a peak rising from the box's bottom-left corner and doubling back,
  // the underline running on from that corner; with a hollow triangle beside each
  // peak, as many peak-and-triangle pairs as the box holds.
  const point = lw / 2 / Math.cos(th); // how far the point of a peak (or a triangle's lower corner) reaches past its centreline
  const apexY = by1 - point; // the peak's point reaches the box's top
  const rise = apexY - by0;
  const triTop = by1 - lw / 2;
  const triLow = by0 + lw / 2 + space + point; // its point stops the gap short of the underline
  const triH = triTop - triLow;
  const shift = (/** @type {number} */ g) => (g + lw) / Math.sin(th); // level distance between parallel bands g apart
  // from a peak's foot: its triangle's top-left corner, and the next peak's foot
  const triLeft = (/** @type {number} */ g) => rise * cot + shift(g) - (triTop - apexY) * cot;
  const triSpan = 2 * triH * cot;
  const step = (/** @type {number} */ g) => triLeft(g) + triSpan - (triTop - by0) * cot + shift(g);
  const start = bx0 + tip; // the corner's point reaches the box's side
  const reach = (/** @type {number} */ k, /** @type {number} */ g) => start + (k - 1) * step(g) + triLeft(g) + triSpan + tip;
  let count = 0;
  let g = space;
  if (o.triangle && triH > 3 * lw) {
    while (reach(count + 1, g) <= bx1) count++;
    // spread what is left over the level gaps, up to three times the gap
    if (count > 0) g = Math.min(3 * space, g + (bx1 - reach(count, g)) * Math.sin(th) / (2 * count - 1));
  }
  const peaks = rise > 2 * lw ? Math.max(count, 1) : 0; // no room for a peak under very wide bands
  const right = bottom.x1; // the underline ends where the bottom line does, as the helix's
  // the underline, with gaps where the bottom line's descenders cross it
  const cuts = bottom.ys.some((y) => y < by0) ? findGaps(bottom.xs, bottom.ys, by0, 0.02) : [];
  /** @type {number[][]} */
  let runs = [[start, right]];
  for (const [a, b] of cuts) runs = runs.flatMap(([u, v]) => (b <= u || a >= v ? [[u, v]] : [[u, a], [b, v]].filter(([p, q]) => q - p > lw)));
  for (let i = 0; i < peaks; i++) {
    const foot = start + i * step(g);
    const peak = [[foot, by0], [foot + rise * cot, apexY], [foot + 2 * rise * cot, by0]];
    // the first peak turns up out of the underline's first run, so their corner is one point
    shapes.push(...band(i === 0 && runs[0][0] === start ? [[runs[0][1], by0], ...peak] : peak, lw));
    if (i < count) {
      const x = foot + triLeft(g);
      shapes.push(...band([[x, triTop], [x + triSpan, triTop], [x + triSpan / 2, triLow]], lw, true));
    }
  }
  for (const [u, v] of runs.slice(peaks && runs[0][0] === start ? 1 : 0)) shapes.push(...band([[u, by0], [v, by0]], lw));

  // Top right: a bar over the top line from its left end, turning down at the angle
  // towards the bottom line's top-right corner, clear of the top line.
  const barY = top.y1 + space + lw / 2;
  const endX = bottom.x1 + lw / 2 + across; // where it would meet the bottom line's top, just clear of it
  const clear = top.x1 + space + across - (barY - top.y1) * cot; // a corner that keeps the leg clear of the top line
  const cornerX = Math.max(endX - (barY - bottom.y1) * cot, clear);
  if (endX - cornerX > lw) {
    const endY = Math.max(bottom.y1, barY - (endX - cornerX) / cot);
    const legX = cornerX + (barY - endY) * cot;
    // run the leg on past where it stops, then cut it level there
    const bracket = band([[top.x0, barY], [cornerX, barY], [legX + 2 * lw * cot, endY - 2 * lw]], lw);
    const box = [legX - 4 * lw, endY - 4 * lw, legX + 4 * lw, endY];
    const cut = [box[0], box[1], box[2], box[1], box[2], box[3], box[0], box[3], box[0], box[1]];
    shapes.push(...difference(bracket.flat(), 'nonzero', [cut], 'nonzero'));
  } else {
    shapes.push(...band([[top.x0, barY], [cornerX, barY]], lw));
  }
  return union(shapes.flat(), 'nonzero');
}
