// Polygon geometry for the layout, standing in for the sf/GEOS calls of the R
// version: lengths, distances, GEOS's ring orientation, buffer(0) and the
// erosion of thinned small capitals. Rings, areas, bounds and the Clipper
// unions and differences are in shared/polygon.js.

import { bounds, difference, ringArea, union } from '../../shared/polygon.js';

/**
 * @typedef {import('../../shared/polygon.js').Ring} Ring
 * @typedef {import('../../shared/polygon.js').Polygon} Polygon
 */

/** Total length of a polygon's rings (st_length(st_boundary(.))). @param {Polygon} rings */
export function boundaryLength(rings) {
  let len = 0;
  for (const r of rings) for (let k = 0; k + 3 < r.length; k += 2) len += Math.hypot(r[k + 2] - r[k], r[k + 3] - r[k + 1]);
  return len;
}

/** Rings with every point mapped by f. @param {Ring[]} rings @param {(x: number, y: number) => [number, number]} f */
export function mapRings(rings, f) {
  return rings.map((r) => {
    const out = new Array(r.length);
    for (let k = 0; k < r.length; k += 2) [out[k], out[k + 1]] = f(r[k], r[k + 1]);
    return out;
  });
}

// ---------- distance (GEOS DistanceOp for polygons) ----------

/** @param {number} px @param {number} py @param {number} ax @param {number} ay @param {number} bx @param {number} by */
function pointSegment(px, py, ax, ay, bx, by) {
  const len2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const r = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2;
  if (r <= 0) return Math.hypot(px - ax, py - ay);
  if (r >= 1) return Math.hypot(px - bx, py - by);
  const s = ((ay - py) * (bx - ax) - (ax - px) * (by - ay)) / len2;
  return Math.abs(s) * Math.sqrt(len2);
}

/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} cx @param {number} cy */
const orient = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

/** Whether segments AB and CD touch. @param {number[]} s */
function segmentsMeet(...s) {
  const [ax, ay, bx, by, cx, cy, dx, dy] = s;
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 !== o2 && o3 !== o4) return true;
  const on = (/** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ qx, /** @type {number} */ qy, /** @type {number} */ rx, /** @type {number} */ ry) =>
    Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
  return (o1 === 0 && on(ax, ay, bx, by, cx, cy)) || (o2 === 0 && on(ax, ay, bx, by, dx, dy))
    || (o3 === 0 && on(cx, cy, dx, dy, ax, ay)) || (o4 === 0 && on(cx, cy, dx, dy, bx, by));
}

/** Even-odd point in polygon. @param {number} x @param {number} y @param {Polygon} rings */
export function pointInPolygon(x, y, rings) {
  let inside = false;
  for (const r of rings) {
    for (let k = 0; k + 3 < r.length; k += 2) {
      const yi = r[k + 1];
      const yj = r[k + 3];
      if ((yi > y) !== (yj > y) && x < (r[k + 2] - r[k]) * (y - yi) / (yj - yi) + r[k]) inside = !inside;
    }
  }
  return inside;
}

/** Every segment of a polygon as [ax, ay, bx, by, xmin, ymin, xmax, ymax]. @param {Polygon} rings */
function segments(rings) {
  const out = [];
  for (const r of rings) {
    for (let k = 0; k + 3 < r.length; k += 2) {
      const ax = r[k]; const ay = r[k + 1]; const bx = r[k + 2]; const by = r[k + 3];
      out.push([ax, ay, bx, by, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]);
    }
  }
  return out;
}

/**
 * st_distance between two polygons: 0 when they overlap or touch, else the
 * least distance between their boundaries. Segment pairs whose boxes are
 * already farther apart than the best distance so far are skipped.
 * @param {Polygon} a @param {Polygon} b
 */
export function polygonDistance(a, b) {
  const [ax0, ay0, ax1, ay1] = bounds(a);
  const [bx0, by0, bx1, by1] = bounds(b);
  const boxesMeet = ax0 <= bx1 && bx0 <= ax1 && ay0 <= by1 && by0 <= ay1;
  if (boxesMeet && (pointInPolygon(a[0][0], a[0][1], b) || pointInPolygon(b[0][0], b[0][1], a))) return 0;
  const sa = segments(a);
  const sb = segments(b);
  let best = Infinity;
  for (const p of sa) {
    for (const q of sb) {
      const gx = Math.max(0, p[4] - q[6], q[4] - p[6]);
      const gy = Math.max(0, p[5] - q[7], q[5] - p[7]);
      if (gx * gx + gy * gy >= best * best) continue;
      if (gx === 0 && gy === 0 && segmentsMeet(p[0], p[1], p[2], p[3], q[0], q[1], q[2], q[3])) return 0;
      const d = Math.min(
        pointSegment(p[0], p[1], q[0], q[1], q[2], q[3]), pointSegment(p[2], p[3], q[0], q[1], q[2], q[3]),
        pointSegment(q[0], q[1], p[0], p[1], p[2], p[3]), pointSegment(q[2], q[3], p[0], p[1], p[2], p[3]));
      if (d < best) best = d;
    }
  }
  return best;
}

// ---------- GEOS ----------

/**
 * st_buffer(ring, 0) of one ring, self-intersecting or not: GEOS keeps the
 * parts with winding depth >= 1, counted in the ring's own orientation as
 * GEOS reads it at the ring's highest point (Orientation::isCCW).
 * @param {Ring} ring
 */
export function bufferZero(ring) {
  return union([ring], isCCW(ring) ? 'positive' : 'negative');
}

/** GEOS 3.10 Orientation::isCCW for a closed ring. @param {Ring} r */
export function isCCW(r) {
  const n = r.length / 2 - 1; // points without the closing one
  if (n < 3) throw new Error('ring has fewer than 4 points, so orientation cannot be determined');
  const X = (/** @type {number} */ i) => r[2 * i];
  const Y = (/** @type {number} */ i) => r[2 * i + 1];
  let upHi = 0;
  let upLow = -1;
  let prevY = Y(0);
  let hiY = Y(0);
  for (let i = 1; i <= n; i++) {
    const py = Y(i);
    if (py > prevY && py >= hiY) {
      upHi = i;
      hiY = py;
      upLow = i - 1;
    }
    prevY = py;
  }
  if (upHi === 0) return false;
  let downLow = upHi;
  do downLow = (downLow + 1) % n; while (downLow !== upHi && Y(downLow) === hiY);
  const downHi = downLow > 0 ? downLow - 1 : n - 1;
  const same = (/** @type {number} */ i, /** @type {number} */ j) => X(i) === X(j) && Y(i) === Y(j);
  if (same(upHi, downHi)) {
    if (same(upLow, upHi) || same(downLow, upHi) || same(upLow, downLow)) return false;
    return orient(X(upLow), Y(upLow), X(upHi), Y(upHi), X(downLow), Y(downLow)) > 0;
  }
  return X(downHi) - X(upHi) < 0;
}

/**
 * st_buffer(polygon, -d, nQuadSegs = 1): the polygon less everything within
 * d of its boundary. Each edge removes a rectangle of half-width d; each
 * vertex removes the wedge between its edges' offset ends on the outside of
 * the turn, filleted as GEOS does with one segment per quarter circle (so
 * turns under 135 degrees are bevelled).
 * @param {Polygon} rings @param {number} d
 * @returns {Polygon[]}
 */
export function erode(rings, d) {
  /** @type {Ring[]} */
  const cuts = [];
  const ccw = (/** @type {Ring} */ r) => (ringArea(r) < 0 ? reverseRing(r) : r);
  for (const r of rings) {
    const n = r.length / 2 - 1;
    /** @type {{ x: number, y: number, nx: number, ny: number }[]} */
    const edges = [];
    for (let i = 0; i < n; i++) {
      const x = r[2 * i]; const y = r[2 * i + 1];
      const dx = r[2 * i + 2] - x; const dy = r[2 * i + 3] - y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const nx = -dy / len * d; const ny = dx / len * d; // left normal, length d
      edges.push({ x, y, nx, ny });
      const x2 = x + dx; const y2 = y + dy;
      cuts.push(ccw([x + nx, y + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x - nx, y - ny, x + nx, y + ny]));
    }
    for (let i = 0; i < edges.length; i++) {
      const e0 = edges[i];
      const e1 = edges[(i + 1) % edges.length];
      const cross = e0.nx * e1.ny - e0.ny * e1.nx; // turn direction (normals turn with the edges)
      const cos = (e0.nx * e1.nx + e0.ny * e1.ny) / (d * d);
      if (cross === 0 && cos > 0) continue;
      const side = cross > 0 ? -1 : 1; // outside of a left turn is on the right
      const vx = e1.x; const vy = e1.y;
      const a0 = Math.atan2(side * e0.ny, side * e0.nx);
      const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
      const nSegs = Math.trunc(theta / (Math.PI / 2) + 0.5);
      const dir = cross > 0 ? 1 : -1;
      // the apex sits a hair past the vertex, so the vertex itself is cut away
      const wedge = [vx - side * (e0.nx + e1.nx) * 1e-3, vy - side * (e0.ny + e1.ny) * 1e-3, vx + side * e0.nx, vy + side * e0.ny];
      for (let k = 1; k < nSegs; k++) {
        const a = a0 + dir * k * theta / nSegs;
        wedge.push(vx + d * Math.cos(a), vy + d * Math.sin(a));
      }
      wedge.push(vx + side * e1.nx, vy + side * e1.ny, wedge[0], wedge[1]);
      cuts.push(ccw(wedge));
    }
  }
  return difference(rings, 'evenodd', cuts, 'nonzero');
}

/** @param {Ring} r */
function reverseRing(r) {
  const out = [];
  for (let k = r.length - 2; k >= 0; k -= 2) out.push(r[k], r[k + 1]);
  return out;
}
