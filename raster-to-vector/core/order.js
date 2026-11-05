// Paint order by containment, as R/order.R, and the image frame. For every
// pair of shapes, the share of each one's area inside the other; a shape more
// than `threshold` inside another, and not vice versa, is contained by it, and
// contained shapes paint later. A pair that is the same shape both ways is a
// hole boundary of one layer and the outer boundary of the region filling the
// hole; the "impostor" is the member whose layer matches the nearest container,
// and it is not painted.
//
// R measures areas with sf (GEOS), repairing self-intersecting rings with
// st_make_valid(), whose method fills a ring by the nonzero winding rule. Here
// the same areas are computed exactly by a trapezoid sweep under that rule.

/**
 * @typedef {{ x: ArrayLike<number>, y: ArrayLike<number> }} Ring
 * @typedef {{ x0: number, y0: number, x1: number, y1: number, dir: number, poly: number }} Edge y0 < y1
 */

/**
 * The padded image's rectangle, as R's frame_contour(): corners at pixel indices
 * 1 and the size, each side including both of its corners, and the layer most
 * frequent along that outline (corners counted twice).
 * @param {Int32Array} labels row-major 1..K @param {number} height @param {number} width
 * @returns {{ layer: number, contour: { x: Float64Array, y: Float64Array } }}
 */
export function frameContour(labels, height, width) {
  const corners = [[1, 1], [height, 1], [height, width], [1, width]]; // (row, column)
  /** @type {number[]} */
  const rows = [];
  /** @type {number[]} */
  const cols = [];
  for (let s = 0; s < 4; s++) {
    const [r0, c0] = corners[s];
    const [r1, c1] = corners[(s + 1) % 4];
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    for (let t = 0; t <= steps; t++) {
      rows.push(steps ? r0 + ((r1 - r0) / steps) * t : r0);
      cols.push(steps ? c0 + ((c1 - c0) / steps) * t : c0);
    }
  }
  /** @type {Map<number, number>} */
  const counts = new Map();
  rows.forEach((r, i) => {
    const v = labels[(r - 1) * width + (cols[i] - 1)];
    counts.set(v, (counts.get(v) ?? 0) + 1);
  });
  let layer = 0;
  let most = -1;
  for (const v of [...counts.keys()].sort((a, b) => a - b)) {
    if (/** @type {number} */ (counts.get(v)) > most) {
      most = /** @type {number} */ (counts.get(v));
      layer = v;
    }
  }
  return { layer, contour: { x: Float64Array.from(cols), y: Float64Array.from(rows) } };
}

/** @param {Ring} ring @param {number} poly @returns {Edge[]} */
function edgesOf(ring, poly) {
  /** @type {Edge[]} */
  const out = [];
  const n = ring.x.length;
  for (let i = 0; i < n; i++) {
    const ax = ring.x[i];
    const ay = ring.y[i];
    const bx = ring.x[(i + 1) % n];
    const by = ring.y[(i + 1) % n];
    if (ay === by) continue; // horizontal edges bound no slab
    out.push(ay < by ? { x0: ax, y0: ay, x1: bx, y1: by, dir: 1, poly } : { x0: bx, y0: by, x1: ax, y1: ay, dir: -1, poly });
  }
  return out;
}

/** @param {Edge} e @param {number} y */
const xAt = (e, y) => (y === e.y0 ? e.x0 : y === e.y1 ? e.x1 : e.x0 + ((y - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0));

/**
 * Area where the nonzero winding rule puts a point inside every polygon in
 * `polys` (one or two). Slabs between consecutive vertex heights are split
 * further where two edges cross, so within each slab the edges keep their order
 * and the covered region is a set of trapezoids.
 * @param {Edge[]} edges @param {number} nPolys @param {number} lo @param {number} hi heights to sweep
 */
function sweepArea(edges, nPolys, lo, hi) {
  const ys = [...new Set(edges.flatMap((e) => [e.y0, e.y1]))].filter((y) => y >= lo && y <= hi).sort((a, b) => a - b);
  const byStart = edges.filter((e) => e.y1 > lo && e.y0 < hi).sort((a, b) => a.y0 - b.y0);
  /** @type {Edge[]} */
  let active = [];
  let next = 0;
  let area = 0;
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k];
    const y1 = ys[k + 1];
    while (next < byStart.length && byStart[next].y0 <= y0) active.push(byStart[next++]);
    active = active.filter((e) => e.y1 > y0);
    area += slab(active, y0, y1, nPolys, 0);
  }
  return area;
}

/**
 * @param {Edge[]} active edges spanning [y0, y1] @param {number} y0 @param {number} y1
 * @param {number} nPolys @param {number} depth
 * @returns {number}
 */
function slab(active, y0, y1, nPolys, depth) {
  if (active.length < 2 * nPolys) return 0;
  const ym = (y0 + y1) / 2;
  const items = active.map((e) => ({ e, a: xAt(e, y0), m: xAt(e, ym), b: xAt(e, y1) }));
  items.sort((p, q) => p.m - q.m);
  if (depth < 50) {
    for (let i = 0; i + 1 < items.length; i++) {
      const p = items[i];
      const q = items[i + 1];
      if (p.a <= q.a && p.b <= q.b) continue;
      // p and q cross inside the slab: split there
      const da = q.a - p.a;
      const db = q.b - p.b;
      const yc = y0 + ((y1 - y0) * da) / (da - db);
      if (yc > y0 && yc < y1) {
        return slab(active, y0, yc, nPolys, depth + 1) + slab(active, yc, y1, nPolys, depth + 1);
      }
    }
  }
  const winding = new Int32Array(nPolys);
  let insideCount = 0;
  let start = -1;
  let area = 0;
  for (let i = 0; i < items.length; i++) {
    const { e } = items[i];
    const was = winding[e.poly] !== 0;
    winding[e.poly] += e.dir;
    const now = winding[e.poly] !== 0;
    if (was === now) continue;
    const before = insideCount === nPolys;
    insideCount += now ? 1 : -1;
    if (!before && insideCount === nPolys) start = i;
    if (before && insideCount !== nPolys) area += ((items[i].a - items[start].a) + (items[i].b - items[start].b)) / 2 * (y1 - y0);
  }
  return area;
}

/** @param {Ring} r */
function bbox(r) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < r.x.length; i++) {
    x0 = Math.min(x0, r.x[i]);
    x1 = Math.max(x1, r.x[i]);
    y0 = Math.min(y0, r.y[i]);
    y1 = Math.max(y1, r.y[i]);
  }
  return { x0, y0, x1, y1 };
}

/**
 * poverlap[a][b]: the share of shape a's area inside shape b (the diagonal 1),
 * skipping pairs whose bounding boxes are disjoint and pairs with the frame,
 * which R overwrites.
 * @param {Ring[]} rings @param {number} frame index of the frame
 */
export function shapeOverlaps(rings, frame) {
  const n = rings.length;
  const edges = rings.map((r) => edgesOf(r, 0));
  const edgesB = rings.map((r) => edgesOf(r, 1));
  const boxes = rings.map(bbox);
  const areas = rings.map((r, i) => (i === frame ? 0 : sweepArea(edges[i], 1, boxes[i].y0, boxes[i].y1)));
  const p = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (i === frame || j === frame) continue;
      const a = boxes[i];
      const b = boxes[j];
      if (a.x0 > b.x1 || b.x0 > a.x1 || a.y0 > b.y1 || b.y0 > a.y1) continue;
      const isec = sweepArea([...edges[i], ...edgesB[j]], 2, Math.max(a.y0, b.y0), Math.min(a.y1, b.y1));
      p[i][j] = areas[i] > 0 ? isec / areas[i] : 0;
      p[j][i] = areas[j] > 0 ? isec / areas[j] : 0;
    }
  }
  for (let i = 0; i < n; i++) {
    if (i === frame) continue;
    p[i][frame] = 1;
    p[frame][i] = 0;
  }
  return p;
}

/**
 * R's find_shape_plotting_order(). Shapes are indexed in layer order, each
 * layer's shapes in order (the frame being the last shape of its layer).
 * Indices are 0-based.
 * @param {Ring[][]} layers smoothed rings per layer @param {number} frameLayer 0-based
 * @param {number} threshold
 */
export function plottingOrder(layers, frameLayer, threshold) {
  /** @type {{ layer: number, shape: number }[]} */
  const inds = layers.flatMap((rings, layer) => rings.map((_, shape) => ({ layer, shape })));
  const rings = layers.flat();
  const n = rings.length;
  const frame = inds.findIndex((s) => s.layer === frameLayer && s.shape === layers[frameLayer].length - 1);
  const p = shapeOverlaps(rings, frame);

  // cm[i][j]: -1 where i is inside j, 1 where j is inside i
  const cm = Array.from({ length: n }, (_, i) => Int8Array.from({ length: n }, (_, j) => {
    if (p[i][j] > threshold && p[j][i] < threshold) return -1;
    if (p[i][j] < threshold && p[j][i] > threshold) return 1;
    return 0;
  }));
  const nContains = cm.map((row) => row.filter((v) => v === 1).length);

  // impostor pairs (a, b), a < b, in R's which() order, then from the most-containing shape down
  /** @type {[number, number][]} */
  let pairs = [];
  for (let b = 0; b < n; b++) for (let a = 0; a < b; a++) if (p[a][b] > threshold && p[b][a] > threshold) pairs.push([a, b]);
  pairs = pairs.map((pair, i) => ({ pair, i })).sort((u, v) => nContains[v.pair[0]] - nContains[u.pair[0]] || u.i - v.i).map((u) => u.pair);
  /** @type {number[]} */
  const impostors = [];
  /** @type {number[]} */
  const partners = [];
  for (const pair of pairs) {
    // walk up the containers from the smallest until one shares a layer with a member of the pair
    const containers = cm[pair[0]].reduce((acc, v, j) => (v === -1 && !impostors.includes(j) ? [...acc, j] : acc), /** @type {number[]} */ ([]));
    const levels = [...new Set(containers.map((c) => nContains[c]))].sort((a, b) => a - b);
    for (const level of levels) {
      const layersUp = new Set(containers.filter((c) => nContains[c] === level).map((c) => inds[c].layer));
      const hit = pair.filter((s) => layersUp.has(inds[s].layer));
      if (hit.length > 0) {
        if (hit.length === 1) {
          impostors.push(hit[0]);
          partners.push(pair[0] === hit[0] ? pair[1] : pair[0]);
        }
        break;
      }
    }
  }

  // shapes by (containers - contained), as order(ceiling(rank(.))), impostors left out
  const score = cm.map((row) => -row.reduce((s, v) => s + v, 0));
  const order = score.map((_, i) => i).sort((a, b) => score[a] - score[b] || a - b).filter((i) => !impostors.includes(i));
  return { order, inds, cm, nContains, impostors, partners, frame, poverlap: p };
}
