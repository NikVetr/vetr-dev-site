// Polygons and their boolean operations, standing in for sf/GEOS: name-tags and the helix
// generator union, cut and offset with the vendored Clipper. A ring is a flat closed array
// [x0, y0, ..., x0, y0]; a polygon is an array of rings, the first its shell and the rest
// holes (sf's POLYGON). Clipper works in integers, so coordinates are moved to a grid of
// about 1e-8 of the shapes' extent for each operation.

import ClipperLib from './vendor/clipper.js';

/**
 * @typedef {number[]} Ring
 * @typedef {Ring[]} Polygon
 */

/** Signed area of a ring (positive when counterclockwise, y up). @param {Ring} r */
export function ringArea(r) {
  let a = 0;
  for (let k = 0; k + 3 < r.length; k += 2) a += r[k] * r[k + 3] - r[k + 2] * r[k + 1];
  return a / 2;
}

/** st_area of a polygon: its shell's area less its holes'. @param {Polygon} rings */
export function polygonArea(rings) {
  return rings.reduce((sum, r, i) => sum + (i ? -1 : 1) * Math.abs(ringArea(r)), 0);
}

/** [xmin, ymin, xmax, ymax] of rings. @param {Ring[]} rings */
export function bounds(rings) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const r of rings) {
    for (let k = 0; k < r.length; k += 2) {
      if (r[k] < x0) x0 = r[k];
      if (r[k] > x1) x1 = r[k];
      if (r[k + 1] < y0) y0 = r[k + 1];
      if (r[k + 1] > y1) y1 = r[k + 1];
    }
  }
  return [x0, y0, x1, y1];
}

/**
 * Coordinates are shifted to their bounding box's centre and scaled by a
 * power of two so every one stays within Clipper's fast integer range
 * (|v| < 47,453,132 in its JavaScript build).
 * @param {Ring[]} rings
 */
function clipperFrame(rings) {
  const [x0, y0, x1, y1] = bounds(rings);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const half = Math.max(x1 - x0, y1 - y0, 1e-300) / 2;
  return { cx, cy, s: 2 ** Math.floor(Math.log2(4.5e7 / half)) };
}

/** @param {Ring} r @param {{ cx: number, cy: number, s: number }} f */
function toPath(r, f) {
  const path = [];
  for (let k = 0; k + 2 < r.length; k += 2) path.push({ X: Math.round((r[k] - f.cx) * f.s), Y: Math.round((r[k + 1] - f.cy) * f.s) }); // drop the closing point
  return path;
}

/** @param {{ X: number, Y: number }[]} path @param {{ cx: number, cy: number, s: number }} f @returns {Ring} */
function fromPath(path, f) {
  const r = [];
  for (const p of path) r.push(p.X / f.s + f.cx, p.Y / f.s + f.cy);
  r.push(r[0], r[1]);
  return r;
}

// drop the zero-area fragments Clipper leaves where boundaries touch
const solid = (/** @type {{ X: number, Y: number }[]} */ path) => Math.abs(ClipperLib.Clipper.Area(path)) > 4;

/** A Clipper PolyTree as polygons (shell, then holes). @param {unknown} tree @param {{ cx: number, cy: number, s: number }} f @returns {Polygon[]} */
const treePolygons = (tree, f) => ClipperLib.JS.PolyTreeToExPolygons(tree).filter((e) => solid(e.outer))
  .map((e) => [fromPath(e.outer, f), ...e.holes.filter(solid).map((h) => fromPath(h, f))]);

const FILL = /** @type {const} */ ({ evenodd: 'pftEvenOdd', nonzero: 'pftNonZero', positive: 'pftPositive', negative: 'pftNegative' });

/**
 * Runs one Clipper operation and returns the result as polygons (shell, then holes).
 * @param {'union' | 'difference'} op
 * @param {Ring[]} subject @param {keyof typeof FILL} subjectFill
 * @param {Ring[]} clip @param {keyof typeof FILL} clipFill
 * @returns {Polygon[]}
 */
function clip(op, subject, subjectFill, clip = [], clipFill = 'nonzero') {
  if (!subject.length) return [];
  const s = clipperFrame([...subject, ...clip]);
  const c = new ClipperLib.Clipper();
  for (const r of subject) c.AddPath(toPath(r, s), ClipperLib.PolyType.ptSubject, true);
  for (const r of clip) c.AddPath(toPath(r, s), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(op === 'union' ? ClipperLib.ClipType.ctUnion : ClipperLib.ClipType.ctDifference, tree,
    ClipperLib.PolyFillType[FILL[subjectFill]], ClipperLib.PolyFillType[FILL[clipFill]]);
  return treePolygons(tree, s);
}

/**
 * The union of rings under a fill rule: "evenodd" is GEOS's make-valid of a
 * self-intersecting ring, "nonzero" a plain union of simple pieces.
 * @param {Ring[]} rings @param {keyof typeof FILL} fill
 */
export function union(rings, fill) {
  return clip('union', rings, fill);
}

/**
 * The subject rings less the clip rings, each read under its fill rule.
 * @param {Ring[]} subject @param {keyof typeof FILL} subjectFill @param {Ring[]} clipRings @param {keyof typeof FILL} clipFill
 */
export function difference(subject, subjectFill, clipRings, clipFill) {
  return clip('difference', subject, subjectFill, clipRings, clipFill);
}

/**
 * Polygons grown by `delta` (shrunk if negative) with round joins, as a
 * stroke of width 2 × delta around them adds; arcs are flattened to within
 * a thousandth of delta.
 * @param {Polygon[]} polygons @param {number} delta
 * @returns {Polygon[]}
 */
export function offset(polygons, delta) {
  const rings = polygons.flat();
  if (!rings.length) return [];
  const [x0, y0, x1, y1] = bounds(rings);
  const s = clipperFrame([[x0 - Math.abs(delta), y0 - Math.abs(delta), x1 + Math.abs(delta), y1 + Math.abs(delta)]]);
  const o = new ClipperLib.ClipperOffset(2, Math.abs(delta) * s.s * 1e-3);
  o.AddPaths(rings.map((r) => toPath(r, s)), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  o.Execute(tree, delta * s.s);
  return treePolygons(tree, s);
}
