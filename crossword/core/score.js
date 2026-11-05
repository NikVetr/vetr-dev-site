// The penalty that generation and refinement minimise, including the target-picture
// term. Ported from R/score.R of the R generator; every term matches it.

import { concaveman } from '../vendor/concaveman.js';
import { adjacency, direction, fillAdjElements, trimState } from './grid.js';

/**
 * @typedef {import('./grid.js').State} State
 * @typedef {import('./grid.js').Cell} Cell
 * @typedef {'area' | 'areaRatio' | 'hvRatio' | 'nConnections' | 'nCycles' | 'picSimilarity' | 'circularity'} Term
 * @typedef {Record<Term, number>} Terms
 * @typedef {{ locs: Cell[], size: number, scaled: Map<number, Cell[]> }} Picture
 * @typedef {{ weights: Terms, desiredAreaRatio: number, desiredHvRatio: number, picture: Picture | null, pictureDistance: 'scan' | 'exact' }} Objective
 */

/** The terms in the order R sums them. @type {Term[]} */
export const TERMS = ['area', 'areaRatio', 'hvRatio', 'nConnections', 'nCycles', 'picSimilarity', 'circularity'];

/**
 * The weighted penalty terms of a state (`score_xword`). Positive is bad, negative is
 * good; the score is their sum.
 * @param {State} state
 * @param {Objective} objective
 * @returns {Terms}
 */
export function scoreTerms(state, objective) {
  const { weights } = objective;
  const placed = state.locs.filter((word) => word !== null);
  if (placed.length === 1) return weighted({ area: 0, areaRatio: 0, hvRatio: 0, nConnections: 0, nCycles: 0, picSimilarity: 0, circularity: 0 }, weights);

  const trimmed = trimState(state);

  const areaRatio = ratioPenalty(objective.desiredAreaRatio / (trimmed.cols / trimmed.rows));

  let across = 0;
  for (const word of placed) if (direction(word) === 'across') across++;
  const down = placed.length - across;
  const hvRatio = across && down ? ratioPenalty(objective.desiredHvRatio / (across / down)) : 0;

  let nConnections = 0;
  let nCycles = 0;
  if (placed.length > 4) {
    const neighbours = adjacency(state.locs);
    for (const list of neighbours) nConnections += list.length * list.length;
    const nodes = state.locs.flatMap((word, w) => (word ? [w] : []));
    nCycles = countInducedCycles(nodes, neighbours, 4) + countInducedCycles(nodes, neighbours, 6);
  }

  let picSimilarity = 0;
  if (objective.picture) {
    const silhouette = fillAdjElements(trimmed).map(([r, c]) => /** @type {Cell} */ ([r + 1, c + 1]));
    for (const d of pictureConcordance(silhouette, objective.picture, objective.pictureDistance)) picSimilarity += Math.pow(d, 4);
  }

  return weighted({
    area: Math.sqrt(trimmed.rows * trimmed.cols),
    areaRatio: areaRatio * areaRatio,
    hvRatio: Math.pow(hvRatio, 3),
    nConnections: -nConnections,
    nCycles: -nCycles,
    picSimilarity,
    circularity: square(circularity(trimmed)),
  }, weights);
}

/** @param {Terms} terms */
export function totalScore(terms) {
  let sum = 0;
  for (const term of TERMS) sum += terms[term];
  return sum;
}

/** @param {Terms} terms @param {Terms} weights @returns {Terms} */
function weighted(terms, weights) {
  // + 0 turns -0 (from negating a zero count) into 0
  return /** @type {Terms} */ (Object.fromEntries(TERMS.map((t) => [t, terms[t] * weights[t] + 0])));
}

/** @param {number} x */
function square(x) {
  return x * x;
}

/** max(r, 1/r): how far a ratio of ratios is from 1, either way. @param {number} r */
function ratioPenalty(r) {
  return Math.max(r, 1 / r);
}

/**
 * Variance of the distances from the concave hull's vertices to their centroid. The
 * hull is the closed ring concaveman returns, so its first vertex counts twice, as in R.
 * @param {State} trimmed
 */
function circularity({ locs }) {
  /** @type {Set<number>} */
  const seen = new Set();
  /** @type {Cell[]} */
  const points = [];
  for (const word of locs) {
    if (!word) continue;
    for (const [r, c] of word) {
      const key = r * 65536 + c;
      if (!seen.has(key)) {
        seen.add(key);
        points.push([r + 1, c + 1]);
      }
    }
  }
  const hull = concaveman(points, 1);
  const n = hull.length;
  let cr = 0;
  let cc = 0;
  for (const [r, c] of hull) {
    cr += r;
    cc += c;
  }
  cr /= n;
  cc /= n;
  const dists = hull.map(([r, c]) => Math.sqrt((r - cr) * (r - cr) + (c - cc) * (c - cc)));
  const mean = dists.reduce((s, d) => s + d, 0) / n;
  return dists.reduce((s, d) => s + (d - mean) * (d - mean), 0) / (n - 1);
}

/**
 * Induced (chordless) cycles of length k in the graph on `nodes`: the number of
 * k-vertex sets whose induced subgraph is a k-cycle, which is what igraph's
 * motifs(size = k) counts for the ring class. Each cycle is found from its lowest
 * vertex in both directions, hence the halving.
 * @param {number[]} nodes
 * @param {number[][]} neighbours
 * @param {number} k
 */
export function countInducedCycles(nodes, neighbours, k) {
  if (nodes.length < k) return 0;
  /** @type {Set<number>[]} */
  const adj = neighbours.map((list) => new Set(list));
  const path = new Array(k);
  let count = 0;
  /** @param {number} depth */
  const extend = (depth) => {
    const last = path[depth - 1];
    for (const v of neighbours[last]) {
      if (v <= path[0]) continue;
      let ok = true;
      for (let i = 0; i < depth - 1; i++) {
        // v may touch the start only when it closes the cycle; it touches no other earlier vertex
        if (path[i] === v || (adj[v].has(path[i]) && !(i === 0 && depth === k - 1))) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (depth === k - 1) {
        if (adj[v].has(path[0])) count++;
      } else {
        path[depth] = v;
        extend(depth + 1);
      }
    }
  };
  for (const u of nodes) {
    path[0] = u;
    extend(1);
  }
  return count / 2;
}

/**
 * The target picture, normalised once (`prepare_picture`): the 1-based [row, col] of
 * every pixel to fill, column by column, shifted to start at 1 and offset to centre
 * the shorter side in a square of side `size`. Rescaled copies for each crossword
 * size are cached in `scaled`.
 * @param {{ width: number, height: number, data: Uint8Array }} mask data[row * width + col] is 1 to fill
 * @returns {Picture}
 */
export function preparePicture({ width, height, data }) {
  /** @type {Cell[]} */
  const locs = [];
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) if (data[r * width + c]) locs.push([r + 1, c + 1]);
  }
  const [minR, maxR, minC, maxC] = bounds(locs);
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const pad = Math.ceil(Math.abs(rows - cols) / 2);
  const [padR, padC] = rows >= cols ? [0, pad] : [pad, 0];
  return {
    locs: locs.map(([r, c]) => /** @type {Cell} */ ([r - minR + 1 + padR, c - minC + 1 + padC])),
    size: Math.max(rows, cols),
    scaled: new Map(),
  };
}

/**
 * The region a target picture asks to fill (`read_target_mask`): its opaque pixels if
 * between 5% and 95% of it is opaque (alpha above 0.5), otherwise the pixels whose
 * R + G + B, each from 0 to 1, is at most `darkThreshold`.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array | Uint8ClampedArray} rgba row-major, 4 bytes per pixel
 * @param {number} darkThreshold
 */
export function maskFromRgba(width, height, rgba, darkThreshold) {
  const n = width * height;
  let opaque = 0;
  for (let i = 0; i < n; i++) if (rgba[4 * i + 3] / 255 > 0.5) opaque++;
  const share = opaque / n;
  const useAlpha = Math.min(1 - share, share) > 0.05;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = 4 * i;
    data[i] = useAlpha
      ? Number(rgba[p + 3] / 255 > 0.01)
      : Number(rgba[p] / 255 + rgba[p + 1] / 255 + rgba[p + 2] / 255 <= darkThreshold);
  }
  return { width, height, data };
}

/**
 * Distances between the crossword's silhouette and the picture
 * (`evaluate_picture_concordance`): both are squared and the larger is rescaled to the
 * smaller's size; then, for every silhouette cell off the picture and every picture
 * cell off the silhouette, the distance to the other shape.
 * @param {Cell[]} silhouette 1-based, without repeats
 * @param {Picture} picture
 * @param {'scan' | 'exact'} distance
 * @returns {number[]}
 */
export function pictureConcordance(silhouette, picture, distance) {
  const [, maxR, , maxC] = bounds(silhouette);
  const pad = Math.ceil(Math.abs(maxR - maxC) / 2);
  const [padR, padC] = maxR >= maxC ? [0, pad] : [pad, 0];
  /** @type {Cell[]} */
  let chars = silhouette.map(([r, c]) => [r + padR, c + padC]);
  const charSize = Math.max(maxR, maxC);

  /** @type {Cell[]} */
  let pic;
  if (picture.size > charSize) {
    let scaled = picture.scaled.get(charSize);
    if (!scaled) {
      scaled = unique(picture.locs.map(([r, c]) => [Math.ceil((r * charSize) / picture.size), Math.ceil((c * charSize) / picture.size)]));
      picture.scaled.set(charSize, scaled);
    }
    pic = scaled;
  } else {
    pic = picture.locs;
    chars = unique(chars.map(([r, c]) => [Math.ceil((r * picture.size) / charSize), Math.ceil((c * picture.size) / charSize)]));
  }

  const [minR1, maxR1, minC1, maxC1] = bounds(pic);
  const [minR2, maxR2, minC2, maxC2] = bounds(chars);
  const dr = Math.max(maxR1, maxR2) - Math.min(minR1, minR2);
  const dc = Math.max(maxC1, maxC2) - Math.min(minC1, minC2);
  const maxDistance = Math.sqrt(dr * dr + dc * dc);

  const picKeys = new Set(pic.map(key));
  const charKeys = new Set(chars.map(key));
  const charOff = chars.filter((p) => !picKeys.has(key(p)));
  const picOff = pic.filter((p) => !charKeys.has(key(p)));
  return [
    ...(charOff.length ? nearestDistances(charOff, pic, maxDistance, distance) : [0]),
    ...(picOff.length ? nearestDistances(picOff, chars, maxDistance, distance) : [0]),
  ];
}

/**
 * Distance from each cell of A to the set B (`scan_nearest_distances`). With "scan",
 * as in R and the original ring search: discs of growing integer radius are scanned
 * and the first hit in scan order (row offset, then column offset, ascending) is
 * taken, which can exceed the true nearest distance by less than one cell; NaN when
 * that radius exceeds maxDistance (R's NA). With "exact", the true nearest distance.
 * @param {Cell[]} A without repeats
 * @param {Cell[]} B
 * @param {number} maxDistance
 * @param {'scan' | 'exact'} distance
 */
export function nearestDistances(A, B, maxDistance, distance) {
  return A.map(([ar, ac]) => {
    let min = Infinity;
    for (const [br, bc] of B) {
      const e = Math.sqrt((br - ar) * (br - ar) + (bc - ac) * (bc - ac));
      if (e < min) min = e;
    }
    if (distance === 'exact') return min;
    const radius = Math.ceil(min);
    if (radius > maxDistance) return NaN;
    let best = Infinity;
    let bestDr = Infinity;
    let bestDc = Infinity;
    for (const [br, bc] of B) {
      const dr = br - ar;
      const dc = bc - ac;
      const e = Math.sqrt(dr * dr + dc * dc);
      if (e <= radius && (dr < bestDr || (dr === bestDr && dc < bestDc))) {
        best = e;
        bestDr = dr;
        bestDc = dc;
      }
    }
    return best;
  });
}

/** @param {Cell} p */
function key([r, c]) {
  return r * 65536 + c;
}

/** @param {Cell[]} cells */
function unique(cells) {
  /** @type {Set<number>} */
  const seen = new Set();
  return cells.filter((p) => {
    const k = key(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** [min row, max row, min col, max col] @param {Cell[]} cells */
function bounds(cells) {
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return [minR, maxR, minC, maxC];
}
