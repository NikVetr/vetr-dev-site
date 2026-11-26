// The angled-corners decoration, inspired by the Rethink Priorities logo's bands cut
// at 60 degrees. Nik's R drawer called it for its "rethink_priorities" group with
// draw_corner_path() twice: a bottom-left path in the helix's box (rising at the
// angle from the box's bottom-left corner, doubling back, with a hollow triangle
// beside it, inset by the gap between the lines) that runs on under the bottom line
// as the helix's straight end does, and a top-right path over the top line that
// turns down at the angle towards the bottom line's top-right corner. The function
// itself did not survive, so the `lines` style draws those calls: bands
// `line_width` wide, mitred to points at their turns. The `triangles` and `rails`
// styles follow the logo's cutter files instead: solid pieces on a 60-degree grid
// (equilateral triangles a gap apart) and the wordmark's rails above and below its
// letters, without the mark itself. The tag is laid out and fitted exactly as for the
// DNA helix; each style fills the same box, leaving gaps of at least MIN_GAP.

import { difference, union } from '../../shared/polygon.js';
import { findGaps } from './helix.js';

/**
 * @typedef {import('./geometry.js').Polygon} Polygon
 * @typedef {{ style: 'lines' | 'triangles' | 'rails', line_width: number, angle: number, triangle: boolean }} CornersOptions
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

/** The narrowest gap left between bands and letters, inches (0.25 mm): wider than a laser's kerf. */
export const MIN_GAP = 0.01;

/**
 * The decoration of a laid-out two-line tag, as filled polygons in the tag's frame
 * shifted by `adj` inches. `o.style` picks the design: `lines` (thin bands, a peak and
 * a hollow triangle, a bar turning down over the top line), `triangles` (solid
 * triangles in the helix's space over a rail) or `rails` (those triangles framed by
 * rails under the bottom line and over the top line).
 * @param {import('./layout.js').Tag} tag @param {number[]} adj @param {CornersOptions} o
 * @returns {Polygon[]}
 */
export function tagCorners(tag, adj, o) {
  const dec = /** @type {import('./layout.js').DnaDecoration} */ (tag.decoration);
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
  const [bx0, by0, bx1, box1] = dec.bbox.map((v, i) => v + adj[i % 2]);
  // the box stops short of any top-line letter that hangs into it (a lowered Q's tail)
  let by1 = box1;
  const lowerQ = tag.lines[0].lowerQ;
  for (const g of tag.lines[0].glyphs) for (const r of g) for (let k = 0; k < r.length; k += 2) {
    const x = r[k] + adj[0];
    if (x > bx0 - MIN_GAP && x < bx1 + MIN_GAP) by1 = Math.min(by1, r[k + 1] + adj[1] + lowerQ - MIN_GAP);
  }
  const [, margin, , innerTop] = tag.inner_box;
  /** @type {Frame} */
  const f = { top: lineBounds(0), bottom: lineBounds(1), box: [bx0, by0, bx1, by1], cellTop: innerTop + margin, margin };
  const polygons = o.style === 'lines' ? linesDesign(f, o) : solidDesign(f, o, o.style === 'rails');
  return union(polygons.flat(), 'nonzero');
}

/**
 * @typedef {{ x0: number, y0: number, x1: number, y1: number, xs: number[], ys: number[] }} LineBox
 * @typedef {{ top: LineBox, bottom: LineBox, box: number[], cellTop: number, margin: number }} Frame
 *   the lines' bounds, the helix's box, the tag's top and its margin, all in the tag's frame
 */

/**
 * The original angled corners, from the R calls: thin bands mitred to points.
 * @param {Frame} f @param {CornersOptions} o
 * @returns {Polygon[]}
 */
function linesDesign(f, o) {
  const { top, bottom } = f;
  const [bx0, by0, bx1, by1] = f.box;
  const lw = o.line_width;
  const th = o.angle / 180 * Math.PI;
  const cot = 1 / Math.tan(th);
  const across = lw / 2 / Math.sin(th); // half a slanted band's width, measured level
  const tip = lw / 2 / Math.tan(th / 2); // how far a band's point reaches past its centreline's corner, level
  const space = Math.max(top.y0 - bottom.y1, lw, MIN_GAP); // R's space_names: the gap between the lines
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
  // (a descender reaching within MIN_GAP of the band is cut around, as the helix's are)
  const clearY = by0 + lw / 2 + MIN_GAP;
  const cuts = bottom.ys.some((y) => y < clearY) ? findGaps(bottom.xs, bottom.ys, clearY, 0.02) : [];
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
  // (kept the margin's half clear of the tag's edge when the lines stand far apart)
  const barY = Math.min(top.y1 + space + lw / 2, Math.max(top.y1 + MIN_GAP + lw / 2, f.cellTop - f.margin / 2 - lw / 2));
  const endX = bottom.x1 + Math.max(lw / 2, MIN_GAP / Math.sin(th)) + across; // where it would meet the bottom line's top, MIN_GAP clear of it
  const clear = top.x1 + space + across - (barY - top.y1) * cot; // a corner that keeps the leg clear of the top line
  const cornerX = Math.max(endX - (barY - bottom.y1) * cot, clear);
  if (barY + lw / 2 > f.cellTop - MIN_GAP) {
    // a top line reaching the tag's edge leaves no room for the bar
  } else if (endX - cornerX > lw) {
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
  return shapes;
}

/**
 * Bands cut on the logo's grid: a rail under the bottom line, from the helix's box to
 * the line's end, with ends slanted at the angle, and solid triangles, alternately up
 * and down, filling the box above it, a gap apart; with `framed`, a second rail over
 * the top line, its ends in line with the first's.
 * @param {Frame} f @param {CornersOptions} o @param {boolean} framed
 * @returns {Polygon[]}
 */
function solidDesign(f, o, framed) {
  const { top, bottom } = f;
  const [bx0, by0, bx1, by1] = f.box;
  const u = o.line_width;
  const th = o.angle / 180 * Math.PI;
  const tan = Math.tan(th);
  const gap = Math.max(u, MIN_GAP);
  const lean = u / 2 / tan; // a slanted end leans this far over half a rail's width
  const right = framed ? Math.max(bottom.x1, top.x1) : bottom.x1;
  /** @type {Polygon[]} */
  const shapes = [];
  /** A rail centred on y from xa to xb, slanted ends, square where `cuts` interrupt it. @param {number} xa @param {number} xb @param {number} y @param {number[][]} cuts */
  const rail = (xa, xb, y, cuts) => {
    let runs = [[xa, xb]];
    for (const [a, b] of cuts) runs = runs.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([m, n]) => n - m > 2 * u)));
    runs.forEach(([p, q], i) => {
      const l = i === 0 ? lean : 0;
      const r = i === runs.length - 1 ? lean : 0;
      shapes.push([ring([[p - l, y - u / 2], [q - r, y - u / 2], [q + r, y + u / 2], [p + l, y + u / 2]])]);
    });
  };
  // the underline stops a gap short of any descender that would reach into it
  const clearY = by0 + u / 2 + MIN_GAP;
  rail(bx0 + lean, right, by0, bottom.ys.some((y) => y < clearY) ? findGaps(bottom.xs, bottom.ys, clearY, 0.02) : []);
  const railY = top.y1 + Math.min(Math.max(top.y0 - bottom.y1, gap), 2 * gap) + u / 2;
  if (framed && railY + u / 2 <= f.cellTop - MIN_GAP) rail(top.x0 + lean, right, railY, []); // unless the top line reaches the tag's edge

  // the triangles, up first; what the box leaves over widens the gaps, to at most three times
  const y0 = by0 + u / 2 + gap;
  const width = bx1 - bx0;
  let height = by1 - y0;
  if (2 * height / tan > width) height = width * tan / 2; // a narrow box takes one smaller triangle
  if (height <= 3 * gap) return shapes;
  const side = 2 * height / tan;
  const slant = Math.sin(th);
  const n = Math.max(1, Math.floor((width - side) / (side / 2 + gap / slant)) + 1);
  const g = n > 1 ? Math.min(3 * gap, ((width - side) / (n - 1) - side / 2) * slant) : gap;
  const step = side / 2 + g / slant;
  const y1 = y0 + height;
  for (let i = 0; i < n; i++) {
    const x = bx0 + i * step;
    shapes.push([ring(i % 2 === 0 ? [[x, y0], [x + side, y0], [x + side / 2, y1]] : [[x, y1], [x + side / 2, y0], [x + side, y1]])]);
  }
  return shapes;
}
