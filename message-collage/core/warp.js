// A bounded C2 displacement grid, sampled as one affine map per character. Keeping
// each glyph affine lets outlined, selectable-text, PDF and PNG exports agree exactly.
import { faceKey } from './fonts.js';
import { overlaps } from './rotation.js';
import { CollageError } from './request.js';

/** @typedef {[number, number]} Point */
/** @typedef {[number, number, number, number, number, number]} Matrix */
/** @typedef {{x:number,y:number,rx:number,ry:number,dx:number,dy:number}} Node */
/** @typedef {{matrix:Matrix, center:Point, corners:Point[], area:number, line:number, char:number}} Geometry */
/** @param {Matrix} m @param {Point} p @returns {Point} */
export const applyMatrix = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Baseline physical geometry in inches, with glyph coordinates in font units (y up).
 * @param {import('./index.js').Result} result @param {Map<string,import('./fonts.js').Face>} faces
 * @returns {Geometry[]}
 */
export function glyphGeometry(result, faces) {
  return result.lines.flatMap((line, li) => {
    const face = faces.get(faceKey(line.family, line.style_name));
    if (!face) throw new Error(`Missing font ${line.family}`);
    const scale = line.font_size_pt / face.unitsPerEm / 72;
    const rotation = result.messages[line.message - 1].rotation;
    const angle = (rotation?.angle_deg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const cx = rotation?.x_in ?? 0, cy = rotation?.y_in ?? 0;
    let pen = 0;
    return Array.from(line.text, (ch, ci) => {
      const glyph = face.font.glyphForCodePoint(/** @type {number} */ (ch.codePointAt(0)));
      const x = line.x_in + pen * scale, y = line.baseline_in;
      /** @type {Matrix} */
      const matrix = [c * scale, s * scale, s * scale, -c * scale, cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)];
      let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
      for (const command of glyph.path.commands) for (let i = 0; i < command.args.length; i += 2) {
        left = Math.min(left, command.args[i]); right = Math.max(right, command.args[i]);
        bottom = Math.min(bottom, command.args[i + 1]); top = Math.max(top, command.args[i + 1]);
      }
      const ink = Number.isFinite(left);
      /** @type {Point[]} */
      const corners = ink ? [[left, top], [right, top], [right, bottom], [left, bottom]] : [];
      const center = applyMatrix(matrix, ink ? [(left + right) / 2, (top + bottom) / 2] : [glyph.advanceWidth / 2, face.capAscent / 2]);
      pen += glyph.advanceWidth;
      return { matrix, center, corners, area: ink ? (right - left) * (top - bottom) * scale * scale : 0, line: li, char: ci };
    });
  });
}

/** Compact C2 basis and derivative. @param {number} u */
function bump(u) { return Math.abs(u) >= 1 ? [0, 0] : [(1 - u * u) ** 3, -6 * u * (1 - u * u) ** 2]; }
/** @param {Node} node @param {Point} p */
function basis(node, [x, y]) {
  const [bx, dx] = bump((x - node.x) / node.rx), [by, dy] = bump((y - node.y) / node.ry);
  return [bx * by, dx * by / node.rx, bx * dy / node.ry];
}
/** @param {number} lo @param {number} hi @param {boolean} derivative */
function maximum(lo, hi, derivative) {
  return Math.max(...[lo, hi, -1 / Math.sqrt(5), 0, 1 / Math.sqrt(5)].filter((v, i) => i < 2 || (v >= lo && v <= hi)).map(v => Math.abs(bump(v)[derivative ? 1 : 0])));
}
/** @param {Point[]} points */
function bounds(points) {
  return { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
}
/** @param {ReturnType<typeof bounds>} a @param {ReturnType<typeof bounds>} b */
const disjoint = (a, b) => a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top;

/** Candidate collision pairs from a bounded spatial hash. Includes same-message letters:
 * pre-existing overlap of italic glyph control boxes is allowed, but no new pair may overlap.
 * @param {Point[][]} polygons @param {number} width @param {number} height
 */
export function collisionPairs(polygons, width, height) {
  const boxes = polygons.map(points => points.length ? bounds(points) : null);
  /** @type {Map<string,number[]>} */ const cells = new Map();
  const pairs = new Set();
  boxes.forEach((box, i) => {
    if (!box) return;
    const seen = new Set();
    for (let x = Math.floor(box.left / width * 24); x <= Math.floor(box.right / width * 24); x++) for (let y = Math.floor(box.top / height * 24); y <= Math.floor(box.bottom / height * 24); y++) {
      const key = `${x},${y}`, bucket = cells.get(key) ?? [];
      for (const j of bucket) if (!seen.has(j)) {
        seen.add(j);
        if (!disjoint(box, /** @type {NonNullable<typeof box>} */ (boxes[j])) && overlaps(polygons[i], polygons[j])) pairs.add(`${j}:${i}`);
      }
      bucket.push(i); cells.set(key, bucket);
    }
  });
  return pairs;
}

/** Deterministic coordinate ascent of the summed glyph control-box area. No layout RNG.
 * The grid fixes all four edges. Interval bounds certify ||DF-I||₂ < 1 over the entire
 * card, so the smooth field cannot fold; glyph transforms are also checked individually.
 * @param {import('./index.js').Result} result @param {Map<string,import('./fonts.js').Face>} faces
 */
export function warpMessages(result, faces) {
  const strength = result.request.warp_strength;
  if (!strength) return;
  const width = result.card.width_in, height = result.card.height_in;
  const geometry = glyphGeometry(result, faces);
  const originalPolygons = geometry.map(g => g.corners.map(p => applyMatrix(g.matrix, p)));
  if (originalPolygons.some(polygon => polygon.some(([x, y]) => x < 0 || y < 0 || x > width || y > height))) {
    throw new CollageError('layout_collision', 'Local warp needs text inside the card. Lower Fill, increase the card width, or try a different seed.');
  }
  const originalCollisions = collisionPairs(originalPolygons, width, height);
  // Intersecting conservative boxes do not imply intersecting ink (especially italics).
  // Give each connected component one shared affine map, preserving its actual relative
  // geometry instead of merely exempting those pairs from collision checks.
  const parents = geometry.map((_, i) => i);
  /** @param {number} i @returns {number} */
  const root = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  for (const pair of originalCollisions) { const [a, b] = pair.split(':').map(Number); parents[root(a)] = root(b); }
  /** @type {Map<number, ReturnType<typeof bounds>>} */ const components = new Map();
  originalPolygons.forEach((polygon, i) => {
    if (!polygon.length) return;
    const b = bounds(polygon), previous = components.get(root(i));
    components.set(root(i), previous ? {left:Math.min(b.left,previous.left),right:Math.max(b.right,previous.right),top:Math.min(b.top,previous.top),bottom:Math.max(b.bottom,previous.bottom)} : b);
  });
  const centers = geometry.map((g, i) => {
    const b = components.get(root(i));
    return b ? /** @type {Point} */ ([(b.left + b.right) / 2, (b.top + b.bottom) / 2]) : g.center;
  });
  /** @type {Node[]} */ const nodes = [];
  const nx = 12, ny = 10;
  for (let y = 1; y < ny; y++) for (let x = 1; x < nx; x++) nodes.push({ x: width * x / nx, y: height * y / ny, rx: width / nx, ry: height / ny, dx: 0, dy: 0 });
  const bases = centers.map(center => nodes.flatMap((n, j) => { const b = basis(n, center); return b.some(v => v !== 0) ? [{ j, b }] : []; }));
  // Conservative derivative maxima over every rectangle, not just sampled Jacobians.
  const certificates = Array.from({ length: nx * ny * 4 }, (_, i) => nodes.flatMap((n, j) => {
    const x0 = (width * (i % (nx * 2)) / (nx * 2) - n.x) / n.rx, x1 = x0 + width / (nx * 2) / n.rx;
    const y0 = (height * Math.floor(i / (nx * 2)) / (ny * 2) - n.y) / n.ry, y1 = y0 + height / (ny * 2) / n.ry;
    const dx = maximum(x0, x1, true) / n.rx * maximum(y0, y1, false), dy = maximum(x0, x1, false) * maximum(y0, y1, true) / n.ry;
    return dx || dy ? [{j,dx,dy}] : [];
  }));
  const originalArea = geometry.reduce((sum, g) => sum + g.area, 0);
  /** @param {boolean} validate */
  function evaluate(validate) {
    if (validate) for (const certificate of certificates) {
      let xx = 0, xy = 0, yx = 0, yy = 0;
      certificate.forEach(({j, dx, dy}) => { const n = nodes[j]; xx += Math.abs(n.dx) * dx; xy += Math.abs(n.dx) * dy; yx += Math.abs(n.dy) * dx; yy += Math.abs(n.dy) * dy; });
      if (Math.max(xx + xy, yx + yy, xx + yx, xy + yy) > 0.18 * strength) return null;
    }
    let area = 0, maxStretch = 1, minStretch = 1, maxDisplacement = 0;
    /** @type {Matrix[]} */ const matrices = [];
    /** @type {Point[][]} */ const polygons = [];
    for (let i = 0; i < geometry.length; i++) {
      const g = geometry[i];
      let dx = 0, dy = 0, a = 1, b = 0, c = 0, d = 1;
      bases[i].forEach(({ j, b: [v, vx, vy] }) => { const n = nodes[j]; dx += n.dx * v; dy += n.dy * v; a += n.dx * vx; c += n.dx * vy; b += n.dy * vx; d += n.dy * vy; });
      const trace = a * a + b * b + c * c + d * d, det = a * d - b * c;
      const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det * det));
      const high = Math.sqrt((trace + disc) / 2), low = Math.sqrt((trace - disc) / 2);
      if (validate && (high > 1 + 0.12 * strength || low < 1 - 0.09 * strength || high / low > 1 + 0.16 * strength || Math.abs(Math.atan2(b - c, a + d)) > 0.05 * strength)) return null;
      maxStretch = Math.max(maxStretch, high); minStretch = Math.min(minStretch, low);
      const [ma, mb, mc, md, mx, my] = g.matrix;
      const center = centers[i];
      const tx = center[0] + dx - a * center[0] - c * center[1], ty = center[1] + dy - b * center[0] - d * center[1];
      maxDisplacement = Math.max(maxDisplacement, Math.hypot((a - 1) * g.center[0] + c * g.center[1] + tx, b * g.center[0] + (d - 1) * g.center[1] + ty));
      /** @type {Matrix} */ const matrix = [a * ma + c * mb, b * ma + d * mb, a * mc + c * md, b * mc + d * md, a * mx + c * my + tx, b * mx + d * my + ty];
      const polygon = g.corners.map(p => applyMatrix(matrix, p));
      if (validate && polygon.some(([x, y]) => x < 0 || y < 0 || x > width || y > height)) return null;
      matrices.push(matrix); polygons.push(polygon); area += g.area * det;
    }
    if (validate && [...collisionPairs(polygons, width, height)].some(pair => !originalCollisions.has(pair))) return null;
    return { matrices, area, maxStretch, minStretch, maxDisplacement };
  }
  let best = /** @type {NonNullable<ReturnType<typeof evaluate>>} */ (evaluate(false)), accepted = 0;
  // Fixed finite work: 99 nodes × two axes × six sweeps. Gradient signs use the
  // current determinant objective; each accepted step is fully checked before use.
  for (let pass = 0; pass < 6; pass++) {
    const step = Math.min(width, height) * 0.004 * strength / (1 << Math.floor(pass / 2));
    const moves = nodes.flatMap(n => (/** @type {const} */ (['dx', 'dy'])).map(axis => {
      const previous = n[axis]; n[axis] = previous + step;
      const score = /** @type {NonNullable<ReturnType<typeof evaluate>>} */ (evaluate(false)).area - best.area; n[axis] = previous;
      return {n,axis,score};
    })).sort((a,b) => Math.abs(b.score) - Math.abs(a.score));
    for (const {n,axis} of moves) {
      const previous = n[axis];
      n[axis] = previous + step;
      const plus = evaluate(false);
      const sign = plus && plus.area > best.area ? 1 : -1;
      n[axis] = previous + sign * step;
      const next = evaluate(true);
      if (next && next.area > best.area + 1e-10) { best = next; accepted++; }
      else n[axis] = previous;
    }
  }
  result.lines.forEach(line => { line.glyph_transforms = []; });
  geometry.forEach((g, i) => { result.lines[g.line].glyph_transforms?.push(best.matrices[i].map(v => v * 72)); });
  result.warp = { strength, nodes, accepted_steps: accepted, glyph_box_area_before: originalArea, glyph_box_area_after: best.area,
    min_stretch: best.minStretch, max_stretch: best.maxStretch, max_displacement_in: best.maxDisplacement, gradient_bound: 0.18 * strength };
}
