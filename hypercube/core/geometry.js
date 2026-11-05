// The cube and one frame of it: topology in R's order, the projected vertices of a
// plan frame, the 3-D view camera, which faces an opaque cube shows, and the RGL
// renderer's lighting. Arrays are flat typed arrays, three numbers per point.

import { rotateVector } from '../../intuitions/lib/geom3d.js';

/**
 * Vertices are {±0.5}^k in R's expand.grid order (vertex v has coordinate j at
 * bit j of v, 0-based). Edges and faces are the 1- and 2-faces of
 * generate_hypercube_faces, in its order; each face is listed as R's quad cycle,
 * its sorted vertices in the order (1, 2, 4, 3).
 * @typedef {{ k: number, vertexCount: number, edges: Int32Array, faces: Int32Array, faceAxes: Int8Array }} Topology
 */

/** All r-subsets of 0..n-1 in lexicographic order, as R's combn lists them. @param {number} n @param {number} r */
function combinations(n, r) {
  /** @type {number[][]} */
  const out = [];
  const pick = Array.from({ length: r }, (_, i) => i);
  if (r > n) return out;
  for (;;) {
    out.push(pick.slice());
    let i = r - 1;
    while (i >= 0 && pick[i] === n - r + i) i--;
    if (i < 0) return out;
    pick[i]++;
    for (let j = i + 1; j < r; j++) pick[j] = pick[j - 1] + 1;
  }
}

/**
 * The d-faces of the k-cube as generate_hypercube_faces(k, d) orders them: each
 * choice of k - d fixed axes (combn order), then each setting of those axes
 * (expand.grid order, the first fixed axis fastest). Returns the free axes and
 * the lowest vertex of each face.
 * @param {number} k @param {number} d
 */
function cubeFaces(k, d) {
  /** @type {{ free: number[], base: number }[]} */
  const out = [];
  for (const fixed of combinations(k, k - d)) {
    const free = [];
    for (let j = 0; j < k; j++) if (!fixed.includes(j)) free.push(j);
    for (let setting = 0; setting < 2 ** fixed.length; setting++) {
      let base = 0;
      fixed.forEach((axis, i) => { if ((setting >> i) & 1) base |= 1 << axis; });
      out.push({ free, base });
    }
  }
  return out;
}

/** @param {number} k @returns {Topology} */
export function topology(k) {
  const edgeList = cubeFaces(k, 1);
  const edges = new Int32Array(edgeList.length * 2);
  edgeList.forEach(({ free, base }, i) => {
    edges[2 * i] = base;
    edges[2 * i + 1] = base | (1 << free[0]);
  });
  const faceList = cubeFaces(k, 2);
  const faces = new Int32Array(faceList.length * 4);
  const faceAxes = new Int8Array(faceList.length * 2);
  faceList.forEach(({ free: [a, b], base }, i) => {
    faces.set([base, base | (1 << a), base | (1 << a) | (1 << b), base | (1 << b)], 4 * i);
    faceAxes[2 * i] = a;
    faceAxes[2 * i + 1] = b;
  });
  return { k, vertexCount: 2 ** k, edges, faces, faceAxes };
}

/**
 * The projected vertices of a frame: [x y depth] = V A with V the base vertices
 * and A the frame's k × 3 matrix (rows per base axis), as R's hcubes_proj and
 * depths_proj. Built up one axis at a time: vertex v adds row j of A to vertex
 * v - 2^j for its highest bit j.
 * @param {Float32Array} projection all frames' matrices, frame-major
 * @param {number} k @param {number} frame 1-based
 */
export function projectFrame(projection, k, frame) {
  const offset = (frame - 1) * k * 3;
  const points = new Float64Array(3 * 2 ** k);
  for (let j = 0; j < k; j++) {
    for (let c = 0; c < 3; c++) points[c] -= 0.5 * projection[offset + 3 * j + c];
  }
  for (let v = 1; v < 2 ** k; v++) {
    const j = 31 - Math.clz32(v);
    const from = 3 * (v - (1 << j));
    for (let c = 0; c < 3; c++) points[3 * v + c] = points[from + c] + projection[offset + 3 * j + c];
  }
  return points;
}

/** @typedef {import('../../intuitions/lib/geom3d.js').Quat} Quat [w, x, y, z], unit length */

/** The default view: R's fixed camera on +z, looking down at the x-y plane. @type {Readonly<Quat>} */
export const DEFAULT_CAMERA = Object.freeze([1, 0, 0, 0]);

/** True for the identity rotation (q or -q), within rounding. @param {readonly number[]} q */
export function isDefaultCamera(q) {
  return Math.abs(Math.abs(q[0]) - 1) < 1e-12 && Math.hypot(q[1], q[2], q[3]) < 1e-6;
}

/**
 * Turns points by a unit quaternion, in place: world (x, y, depth) to view space
 * (x right, y up, z toward the viewer), with the gallery's 3-D layer.
 * @param {Float64Array} points @param {Quat} q
 */
export function rotatePoints(points, q) {
  if (isDefaultCamera(q)) return points;
  for (let i = 0; i < points.length; i += 3) {
    points.set(rotateVector(q, [points[i], points[i + 1], points[i + 2]]), i);
  }
  return points;
}

/**
 * Which faces an opaque cube shows: R's face_label_visibility. The projected cube
 * is convex, so a face's interior shows only if it lies on the cube's front
 * supporting plane (normal toward the viewer) and is not edge-on. Ties count as
 * visible, so coincident copies all do.
 * @param {Float64Array} points view-space vertices
 * @param {Topology} topo
 * @param {number} tolerance R uses 1e-9 on double-precision coordinates
 * @returns {{ visible: Uint8Array, normals: Float64Array, gaps: Float64Array }} normals: unit, z ≥ 0;
 *   gaps: how far behind the front supporting plane each face lies (0 on it; NaN if edge-on)
 */
export function faceVisibility(points, topo, tolerance) {
  const { k, faces } = topo;
  const count = faces.length / 4;
  const generators = new Float64Array(3 * k);
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < points.length; i += 3) { cx += points[i]; cy += points[i + 1]; cz += points[i + 2]; }
  const n = points.length / 3;
  cx /= n; cy /= n; cz /= n;
  for (let j = 0; j < k; j++) {
    for (let c = 0; c < 3; c++) generators[3 * j + c] = points[3 * (1 << j) + c] - points[c];
  }
  const visible = new Uint8Array(count);
  const normals = new Float64Array(3 * count);
  const gaps = new Float64Array(count).fill(NaN);
  for (let f = 0; f < count; f++) {
    const p0 = 3 * faces[4 * f], p1 = 3 * faces[4 * f + 1], p2 = 3 * faces[4 * f + 2], p3 = 3 * faces[4 * f + 3];
    const ax = points[p1] - points[p0], ay = points[p1 + 1] - points[p0 + 1], az = points[p1 + 2] - points[p0 + 2];
    const bx = points[p3] - points[p0], by = points[p3 + 1] - points[p0 + 1], bz = points[p3 + 2] - points[p0 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const front = Math.abs(nz) > tolerance;
    const scale = (nz < 0 ? -1 : nz > 0 ? 1 : 0) / Math.max(Math.hypot(nx, ny, nz), tolerance);
    nx *= scale; ny *= scale; nz *= scale;
    normals[3 * f] = nx; normals[3 * f + 1] = ny; normals[3 * f + 2] = nz;
    if (!front) continue;
    let support = 0;
    for (let j = 0; j < k; j++) support += Math.abs(nx * generators[3 * j] + ny * generators[3 * j + 1] + nz * generators[3 * j + 2]);
    support /= 2;
    const mx = (points[p0] + points[p2]) / 2 - cx, my = (points[p0 + 1] + points[p2 + 1]) / 2 - cy, mz = (points[p0 + 2] + points[p2 + 2]) / 2 - cz;
    gaps[f] = support - (mx * nx + my * ny + mz * nz);
    visible[f] = gaps[f] <= tolerance ? 1 : 0;
  }
  return { visible, normals, gaps };
}

/**
 * The RGL renderer's colour for a lit face (rgl's WebGL fragment shader): one white
 * light at (2, 2, 2) relative to the viewer, black ambient material, white
 * specular with shininess 50, two-sided normals. RGL's orthographic observer sits
 * 2√3 b in front of the cube's centre, for bounding box ±b. Evaluated at the face
 * centre (RGL evaluates it per pixel; the variation across a face is slight).
 * @param {number[]} base RGB from 0 to 1
 * @param {number} nx @param {number} ny @param {number} nz unit normal, nz ≥ 0
 * @param {number} x @param {number} y @param {number} z face centre, view space
 * @param {number} bounds the plan's axis bound b
 * @returns {number[]} RGB from 0 to 1
 */
export function litColor(base, nx, ny, nz, x, y, z, bounds) {
  const pz = z - 2 * Math.sqrt(3) * bounds;
  let lx = 2 - x, ly = 2 - y, lz = 2 - pz;
  const ln = Math.hypot(lx, ly, lz);
  lx /= ln; ly /= ln; lz /= ln;
  const en = Math.hypot(x, y, pz);
  const ex = -x / en, ey = -y / en, ez = -pz / en;
  let hx = lx + ex, hy = ly + ey, hz = lz + ez;
  const hn = Math.hypot(hx, hy, hz);
  hx /= hn; hy /= hn; hz /= hn;
  const diffuse = Math.max(nx * lx + ny * ly + nz * lz, 0);
  const specular = Math.max(hx * nx + hy * ny + hz * nz, 0) ** 50;
  return base.map((c) => Math.min(1, diffuse * c + specular));
}
