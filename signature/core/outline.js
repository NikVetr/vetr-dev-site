// Variable-width strokes as filled outlines, since an SVG stroke has one width.
// Each stroke becomes one ribbon: its left edge forward, a round cap, its right
// edge back and a round cap, each edge offset by the half-width at each point.
// On the outside of a bend the two offsets meet in a round join; on the inside
// the edge runs back through the centre point, as Clipper's own offsetting
// does, so that the overlap is counted twice rather than cut out. The union of
// all the ribbons under the positive fill rule (shared/polygon.js) is then one
// outline with no seams where strokes cross or a stroke crosses itself.

import { union } from '../../shared/polygon.js';

/**
 * @typedef {[number, number][]} Ring  closed implicitly
 * @typedef {Ring[]} Polygon  outer ring, then holes
 */

const ARC_STEP = 0.35; // radians per segment of a round cap or join
const MITRE_TURN = 0.25; // turns under this many radians meet at one mitred point

/** Points of an arc about (cx, cy) from angle a0 by `sweep` radians, both ends included. @param {number} cx @param {number} cy @param {number} r @param {number} a0 @param {number} sweep @param {Ring} out */
function arc(cx, cy, r, a0, sweep, out) {
  const k = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP));
  for (let j = 0; j <= k; j++) {
    const a = a0 + (sweep * j) / k;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
}

/** The signed turn from direction a to direction b, in (-π, π]. @param {number} a @param {number} b */
function turnBetween(a, b) {
  let d = b - a;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  return d;
}

/**
 * One side of a ribbon: the offsets of points i0..i1 by `side` (1 left, -1 right)
 * × the half-width, joined round on the outside of a bend and through the
 * centre on the inside.
 * @param {number[][]} p points [x, y, r] @param {number[]} heading direction of each segment
 * @param {1 | -1} side @param {boolean} backward @param {Ring} out
 */
function edge(p, heading, side, backward, out) {
  const n = p.length;
  const offset = (/** @type {number} */ i, /** @type {number} */ seg) => {
    const a = heading[seg] + side * (Math.PI / 2);
    return /** @type {[number, number]} */ ([p[i][0] + p[i][2] * Math.cos(a), p[i][1] + p[i][2] * Math.sin(a)]);
  };
  for (let k = 0; k < n; k++) {
    const i = backward ? n - 1 - k : k;
    if (i === 0) { out.push(offset(0, 0)); continue; }
    if (i === n - 1) { out.push(offset(n - 1, n - 2)); continue; }
    const turn = turnBetween(heading[i - 1], heading[i]);
    const [first, second] = backward ? [i, i - 1] : [i - 1, i];
    if (Math.abs(turn) < MITRE_TURN) {
      const a = heading[i - 1] + turn / 2 + side * (Math.PI / 2);
      const r = p[i][2] / Math.cos(turn / 2);
      out.push([p[i][0] + r * Math.cos(a), p[i][1] + r * Math.sin(a)]);
    } else if (Math.sign(turn) === side) {
      out.push(offset(i, first), [p[i][0], p[i][1]], offset(i, second)); // inside of the bend
    } else {
      const a0 = heading[first] + side * (Math.PI / 2);
      arc(p[i][0], p[i][1], p[i][2], a0, backward ? -turn : turn, out); // outside: round join (the same turn, so a full reversal goes round the tip)
    }
  }
}

/**
 * The ribbon of one stroke, oriented counterclockwise (in y-up terms: positive area).
 * @param {ArrayLike<number>} x @param {ArrayLike<number>} y @param {ArrayLike<number>} w widths
 * @returns {Ring}
 */
export function ribbon(x, y, w) {
  /** @type {number[][]} */
  const p = [];
  for (let i = 0; i < x.length; i++) {
    const last = p[p.length - 1];
    if (!last || last[0] !== x[i] || last[1] !== y[i]) p.push([x[i], y[i], w[i] / 2]);
    else last[2] = Math.max(last[2], w[i] / 2);
  }
  /** @type {Ring} */
  const ring = [];
  if (p.length === 1) {
    arc(p[0][0], p[0][1], p[0][2], 0, 2 * Math.PI - ARC_STEP / 2, ring);
    return ring;
  }
  const heading = p.slice(1).map((q, i) => Math.atan2(q[1] - p[i][1], q[0] - p[i][0]));
  const n = p.length;
  edge(p, heading, 1, false, ring);
  arc(p[n - 1][0], p[n - 1][1], p[n - 1][2], heading[n - 2] + Math.PI / 2, -Math.PI, ring);
  edge(p, heading, -1, true, ring);
  arc(p[0][0], p[0][1], p[0][2], heading[0] - Math.PI / 2, -Math.PI, ring);
  return signedArea(ring) < 0 ? ring.reverse() : ring;
}

/** Signed area (shoelace). @param {Ring} r */
export function signedArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * The union of rings, each counted where it winds positively: polygons of an
 * outer ring and its holes. shared/polygon.js takes flat closed rings, and
 * Clipper's grid here is scaled about the origin.
 * @param {Ring[]} rings
 * @returns {Polygon[]}
 */
export function unionRings(rings) {
  const flat = rings.map((r) => [...r.flat(), r[0][0], r[0][1]]);
  const pairs = (/** @type {number[]} */ f) => /** @type {Ring} */ (Array.from({ length: f.length / 2 - 1 }, (_, k) => [f[2 * k], f[2 * k + 1]]));
  return union(flat, 'positive', 'origin').map((poly) => poly.map(pairs));
}

/**
 * SVG path data for polygons (even-odd, so holes need no particular direction).
 * @param {Polygon[]} polygons @param {number} digits
 */
export function pathData(polygons, digits) {
  const f = (/** @type {number} */ v) => {
    const s = v.toFixed(digits);
    return digits > 0 ? s.replace(/\.?0+$/, '').replace(/^-0$/, '0') : s.replace(/^-0$/, '0');
  };
  return polygons.flatMap((poly) => poly.map((ring) => `M${ring.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`)).join('');
}

/** [xmin, ymin, xmax, ymax] of polygons. @param {Polygon[]} polygons */
export function polygonBounds(polygons) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polygons) {
    for (const [x, y] of poly[0]) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return [x0, y0, x1, y1];
}
