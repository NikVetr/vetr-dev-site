// Exact outlines for unions of CSS grid cells. Grid coordinates use screen orientation:
// x grows right and y grows down. Filled cells remain on the right of every boundary edge.

/** @typedef {[number, number]} Point */
/** @typedef {{ from: Point, to: Point, direction: number }} Edge */

/** @param {readonly number[]} point */
const pointKey = (point) => `${point[0]},${point[1]}`;

/**
 * Return the union boundary of integer unit cells as closed, collinear-free loops.
 * Closing is implicit: the first vertex is not repeated at the end. Outer loops are
 * clockwise in screen coordinates and holes counterclockwise. Diagonal-only contacts
 * remain separate loops. Input order and duplicate cells do not affect the output.
 * @param {Iterable<readonly [number, number]>} cells
 * @returns {Point[][]}
 */
export function traceCellContours(cells) {
  if (cells == null || typeof cells[Symbol.iterator] !== 'function') {
    throw new TypeError('Contour cells must be iterable coordinate pairs');
  }
  /** @type {Map<string, Point>} */
  const unique = new Map();
  for (const cell of cells) {
    if (!Array.isArray(cell) || cell.length !== 2 || cell.some((value) => !Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER)) {
      throw new TypeError('Contour cells must contain two safe integer coordinates with safe upper corners');
    }
    unique.set(pointKey(cell), [cell[0], cell[1]]);
  }
  /** @type {Map<string, Edge>} */
  const edges = new Map();
  for (const [x, y] of [...unique.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    /** @type {Point[]} */
    const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    for (let direction = 0; direction < 4; direction++) {
      const from = corners[direction], to = corners[(direction + 1) % 4];
      const reverse = `${pointKey(to)}>${pointKey(from)}`;
      if (!edges.delete(reverse)) edges.set(`${pointKey(from)}>${pointKey(to)}`, { from, to, direction });
    }
  }
  /** @type {Map<string, Edge[]>} */
  const outgoing = new Map();
  for (const edge of edges.values()) {
    const key = pointKey(edge.from);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key)?.push(edge);
  }
  const remaining = new Set(edges.values());
  const ordered = [...remaining].sort((a, b) => a.from[1] - b.from[1] || a.from[0] - b.from[0] || a.direction - b.direction);
  /** @type {Point[][]} */
  const loops = [];
  // Right, straight, left, reverse. Turning right at a diagonal junction traces each
  // filled component separately instead of joining it to its corner-touching neighbour.
  const turnRank = [1, 0, 3, 2];
  for (const first of ordered) {
    if (!remaining.has(first)) continue;
    /** @type {Point[]} */
    const loop = [];
    let edge = first;
    do {
      loop.push(edge.from);
      remaining.delete(edge);
      if (pointKey(edge.to) === pointKey(first.from)) break;
      const candidates = (outgoing.get(pointKey(edge.to)) || []).filter((next) => remaining.has(next));
      candidates.sort((a, b) => turnRank[(a.direction - edge.direction + 4) % 4] - turnRank[(b.direction - edge.direction + 4) % 4]);
      if (!candidates.length) throw new Error('Contour boundary is not closed');
      edge = candidates[0];
    } while (true);
    // A cavity may touch the exterior at a single lattice vertex. Split the resulting
    // self-touch into simple outer/hole rings before callers inset or round the corners.
    const pending = [loop];
    while (pending.length) {
      const part = /** @type {Point[]} */ (pending.pop());
      const seen = new Map();
      const repeated = part.findIndex((point, index) => {
        const key = pointKey(point);
        if (seen.has(key)) return true;
        seen.set(key, index);
        return false;
      });
      if (repeated >= 0) {
        const firstIndex = seen.get(pointKey(part[repeated]));
        pending.push(part.slice(firstIndex, repeated), [...part.slice(0, firstIndex), ...part.slice(repeated)]);
        continue;
      }
      const corners = part.filter((point, index) => {
        const previous = part[(index + part.length - 1) % part.length];
        const next = part[(index + 1) % part.length];
        return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
      });
      const start = corners.reduce((best, point, index) => point[1] < corners[best][1] || (point[1] === corners[best][1] && point[0] < corners[best][0]) ? index : best, 0);
      loops.push([...corners.slice(start), ...corners.slice(0, start)]);
    }
  }
  return loops.sort((a, b) => a[0][1] - b[0][1] || a[0][0] - b[0][0]);
}

/**
 * Convert an implicitly closed orthogonal pixel-coordinate contour to an SVG path.
 * Each corner's radius is capped at half either neighbouring segment, so short steps
 * cannot overshoot. Radius zero retains sharp corners. No DOM or SVG library is needed.
 * @param {readonly (readonly [number, number])[]} points
 * @param {number} [radius]
 * @returns {string}
 */
export function roundedContourPath(points, radius = 8) {
  if (!Number.isFinite(radius) || radius < 0) throw new TypeError('Contour radius must be finite and nonnegative');
  if (!Array.isArray(points) || points.length < 4 || points.some((point) => !Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isFinite(value)))) {
    throw new TypeError('A contour needs at least four finite coordinate pairs');
  }
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const dx = point[0] - previous[0], dy = point[1] - previous[1];
    const ex = next[0] - point[0], ey = next[1] - point[1];
    const before = Math.abs(dx) + Math.abs(dy), after = Math.abs(ex) + Math.abs(ey);
    if (!before || !after || !Number.isFinite(before) || !Number.isFinite(after) || (dx && dy) || (ex && ey)) throw new TypeError('Contour segments must be finite, nonzero and axis-aligned');
    const r = Math.min(radius, before / 2, after / 2);
    return { point, entry: [point[0] - dx / before * r, point[1] - dy / before * r], exit: [point[0] + ex / after * r, point[1] + ey / after * r] };
  });
  if (!radius) return `M ${points.map((point) => point.join(' ')).join(' L ')} Z`;
  let path = `M ${corners[0].entry.join(' ')}`;
  for (const [index, corner] of corners.entries()) {
    if (index) path += ` L ${corner.entry.join(' ')}`;
    path += ` Q ${corner.point.join(' ')} ${corner.exit.join(' ')}`;
  }
  return `${path} Z`;
}
