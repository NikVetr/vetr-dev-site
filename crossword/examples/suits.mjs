// The four card-suit target shapes of the landing preview, as signed distance fields
// (negative inside) in one shared frame, so a target can morph from one suit to the
// next by interpolating fields. The heart is make-heart.mjs's notched parametric heart:
// its 64 × 64 mask is exactly heart-notched.txt.

export const SUITS = /** @type {const} */ (['heart', 'diamond', 'spade', 'club']);
/** @typedef {typeof SUITS[number]} Suit */

/** Side of the target masks, in pixels. */
export const MASK_SIZE = 64;

/** The shared frame: x from -17 to 17 left to right, y from 14 to -20 top to bottom. */
export function frameX(/** @type {number} */ column, size = MASK_SIZE) { return -17 + column * 34 / size; }
export function frameY(/** @type {number} */ row, size = MASK_SIZE) { return 14 - row * 34 / size; }

/** The classic parametric heart: deeper cleft and tapered point. @param {number} [n] */
export function heartOutline(n = 720) {
  return Array.from({ length: n }, (_, i) => {
    const t = 2 * Math.PI * i / n;
    return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
  });
}

/** Even-odd point-in-polygon test. @param {number[][]} polygon @param {number} x @param {number} y */
export function insidePolygon(polygon, x, y) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** @typedef {(x: number, y: number) => number} Field */

/** Signed distance to a closed polygon, negative inside. @param {number[][]} polygon @returns {Field} */
function polygonField(polygon) {
  return (x, y) => {
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, ay] = polygon[j], [bx, by] = polygon[i];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return insidePolygon(polygon, x, y) ? -best : best;
  };
}

/** @param {number} cx @param {number} cy @param {number} r @returns {Field} */
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
/** @param {Field[]} fields @returns {Field} */
const union = (...fields) => (x, y) => Math.min(...fields.map((f) => f(x, y)));

/** A stem flaring from `top` (width wTop) to a foot at `bottom` (width wBottom), with concave sides. */
function stem(top = -4, bottom = -17.6, wTop = 3.4, wBottom = 13) {
  const side = Array.from({ length: 13 }, (_, i) => {
    const s = i / 12, flare = s ** 2.2;
    return [(wTop + (wBottom - wTop) * flare) / 2, top + (bottom - top) * s];
  });
  return polygonField([...side, ...side.slice().reverse().map(([x, y]) => [-x, y])]);
}

/** A rhombus whose sides bow slightly inward, like a playing-card diamond. */
function diamond(halfWidth = 12.6, top = 12.6, bottom = -17.6, waist = -2.5, bow = 1.1) {
  const corners = [[0, top], [halfWidth, waist], [0, bottom], [-halfWidth, waist]];
  return polygonField(corners.flatMap(([ax, ay], i) => {
    const [bx, by] = corners[(i + 1) % 4], len = Math.hypot(bx - ax, by - ay);
    // Inward normal of a clockwise polygon (y up) is to the right of travel: (dy, -dx) flipped.
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    return Array.from({ length: 16 }, (_, k) => {
      const s = k / 16, b = 4 * s * (1 - s) * bow;
      return [ax + (bx - ax) * s - nx * b, ay + (by - ay) * s - ny * b];
    });
  }));
}

/** A field that remembers its values: masks and contours sample the same points for every morph step. @param {Field} field @returns {Field} */
function remembered(field) {
  /** @type {Map<string, number>} */
  const values = new Map();
  return (x, y) => {
    const key = `${x} ${y}`;
    let v = values.get(key);
    if (v === undefined) values.set(key, v = field(x, y));
    return v;
  };
}

/** @type {Record<Suit, Field>} */
const FIELDS = {
  heart: remembered(polygonField(heartOutline())),
  diamond: remembered(diamond()),
  // The heart upside down and smaller, its cleft covered by the stem.
  spade: remembered(union(polygonField(heartOutline().map(([x, y]) => [0.82 * x, 12.6 - 0.82 * (y + 17)]).reverse()), stem(-3.5, -17.6, 3.2, 12.4))),
  club: remembered(union(circle(0, 4.9, 7.4), circle(-8.7, -4.3, 7.4), circle(8.7, -4.3, 7.4), polygonField([[0, 4.9], [8.7, -4.3], [-8.7, -4.3]]), stem(-3, -17.6, 3.2, 12.4))),
};

/** The field of the target `t` of the way from one suit to the next (0 ≤ t ≤ 1). @param {Suit} from @param {Suit} to @param {number} t @returns {Field} */
export function morphField(from, to, t) {
  const a = FIELDS[from], b = FIELDS[to];
  if (!a || !b) throw new Error(`unknown suit: ${!a ? from : to}`);
  return t <= 0 ? a : t >= 1 ? b : (x, y) => (1 - t) * a(x, y) + t * b(x, y);
}

/** The target mask (rows of "#" and ".") of a field, sampled at pixel centres. @param {Field} field */
export function fieldMask(field, size = MASK_SIZE) {
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (field(frameX(c + 0.5, size), frameY(r + 0.5, size)) < 0 ? '#' : '.')).join(''));
}

/**
 * The field's zero contour as closed rings of [column, row] points in mask pixel units
 * (pixel (r, c) spans c..c+1, r..r+1), by marching squares on a grid `oversample`
 * times finer than the mask, interpolating linearly along cell edges.
 * @param {Field} field
 * @returns {number[][][]}
 */
export function fieldContours(field, oversample = 2, size = MASK_SIZE) {
  const n = size * oversample, step = 1 / oversample;
  // Samples on the grid points, padded by one outside value so every ring closes.
  const value = Array.from({ length: n + 3 }, (_, i) => Array.from({ length: n + 3 }, (_, j) =>
    i === 0 || j === 0 || i === n + 2 || j === n + 2 ? 1 : field(frameX((j - 1) * step, size), frameY((i - 1) * step, size))));
  /** @param {number} i @param {number} j @param {number} i2 @param {number} j2 @returns {string} */
  const key = (i, j, i2, j2) => (i < i2 || (i === i2 && j < j2) ? `${i},${j},${i2},${j2}` : `${i2},${j2},${i},${j}`);
  /** @param {number} i @param {number} j @param {number} i2 @param {number} j2 */
  const point = (i, j, i2, j2) => {
    const a = value[i][j], b = value[i2][j2], s = a / (a - b);
    return [((j + (j2 - j) * s) - 1) * step, ((i + (i2 - i) * s) - 1) * step];
  };
  /** @type {Map<string, string[]>} */
  const links = new Map();
  /** @type {Map<string, number[]>} */
  const points = new Map();
  for (let i = 0; i < n + 2; i++) for (let j = 0; j < n + 2; j++) {
    const corners = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
    const crossing = [];
    for (let k = 0; k < 4; k++) {
      const [a, b] = [corners[k], corners[(k + 1) % 4]];
      if ((value[a[0]][a[1]] < 0) !== (value[b[0]][b[1]] < 0)) {
        const id = key(a[0], a[1], b[0], b[1]);
        if (!points.has(id)) points.set(id, point(a[0], a[1], b[0], b[1]));
        crossing.push(id);
      }
    }
    // Two crossings join; four (a saddle) pair by the centre value's sign.
    const pairs = crossing.length === 2 ? [[crossing[0], crossing[1]]]
      : crossing.length === 4 ? ((value[i][j] < 0) === ((value[i][j] + value[i][j + 1] + value[i + 1][j + 1] + value[i + 1][j]) / 4 < 0)
        ? [[crossing[0], crossing[3]], [crossing[1], crossing[2]]] : [[crossing[0], crossing[1]], [crossing[2], crossing[3]]]) : [];
    for (const [a, b] of pairs) {
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    }
  }
  const rings = [];
  const seen = new Set();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const ring = [];
    let previous = '', current = start;
    while (!seen.has(current)) {
      seen.add(current);
      ring.push(/** @type {number[]} */ (points.get(current)));
      const next = (links.get(current) ?? []).find((id) => id !== previous && !seen.has(id));
      if (!next) break;
      previous = current;
      current = next;
    }
    if (ring.length > 2) rings.push(ring);
  }
  return rings;
}
