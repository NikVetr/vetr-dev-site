// Colouring (R/regions.R): each message's label point is the mode of a 2-D kernel density of its
// cells (MASS::kde2d on a 50 x 50 grid, normal-reference bandwidths), and messages are coloured
// in order, unused palette colours first, then colours whose nearest message of the same colour
// is farthest away (softmax of mean-normalised distances).

import { exp, pow } from './crmath.js';
import { CollageError } from './request.js';
import { dnorm, mean, quantile7, seqLength, sum, variance } from './rmath.js';

/**
 * @typedef {import('./layout.js').Grid} Grid
 * @typedef {{ x: number, y: number }} Point
 */

const KDE_POINTS = 50;

/**
 * The label point of every message, in plot coordinates (cell centres).
 * @param {Grid} grid @param {number} nMessages
 * @returns {Point[]}
 */
export function messageLabels(grid, nMessages) {
  // Each message's cells in column-major order (R's which(arr.ind = TRUE)), as plot y and x.
  /** @type {number[][]} */
  const ys = Array.from({ length: nMessages }, () => []);
  /** @type {number[][]} */
  const xs = Array.from({ length: nMessages }, () => []);
  for (let c = 1; c <= grid.cols; c++) {
    for (let r = 1; r <= grid.rows; r++) {
      const v = grid.at(r, c);
      if (v > 0) {
        ys[v - 1].push(grid.rows - r + 1);
        xs[v - 1].push(c);
      }
    }
  }
  return ys.map((y, i) => {
    const mode = kdeMode(Float64Array.from(y), Float64Array.from(xs[i]), i + 1);
    return { x: mode.y - 0.5, y: mode.x - 0.5 };
  });
}

/**
 * The grid point of greatest density of MASS::kde2d(x, y, n = 50): the first maximum in R's
 * column-major order. The products are summed in the order reference BLAS's dgemm sums them.
 * @param {Float64Array} x @param {Float64Array} y @param {number} id for the error message
 */
function kdeMode(x, y, id) {
  const nx = x.length;
  const gx = seqLength(Math.min(...x), Math.max(...x), KDE_POINTS);
  const gy = seqLength(Math.min(...y), Math.max(...y), KDE_POINTS);
  const h1 = bandwidthNrd(x) / 4;
  const h2 = bandwidthNrd(y) / 4;
  if (!(h1 > 0 && h2 > 0)) {
    throw new CollageError('degenerate_region', `message ${id} lies in a single row or column, so its kernel density has no width (as in R's kde2d); change the card size, fill or seed`);
  }
  // The cells' coordinates are whole numbers, so each density factor is computed once per value.
  const ax = densities(gx, x, h1);
  const ay = densities(gy, y, h2);
  const denom = nx * h1 * h2;
  let best = -Infinity;
  let at = { x: 0, y: 0 };
  const col = new Float64Array(KDE_POINTS);
  for (let j = 0; j < KDE_POINTS; j++) {
    col.fill(0);
    for (let l = 0; l < nx; l++) {
      const b = ay.of(y[l])[j];
      const a = ax.of(x[l]);
      for (let i = 0; i < KDE_POINTS; i++) col[i] += b * a[i];
    }
    for (let i = 0; i < KDE_POINTS; i++) {
      const z = col[i] / denom;
      if (z > best) {
        best = z;
        at = { x: gx[i], y: gy[j] };
      }
    }
  }
  return at;
}

/**
 * dnorm((g[i] - v) / h) for every grid point g[i] and every whole number v in the data's range.
 * @param {Float64Array} g @param {Float64Array} data @param {number} h
 */
function densities(g, data, h) {
  const lo = Math.min(...data);
  const rows = Array.from({ length: Math.max(...data) - lo + 1 }, (_, k) => Float64Array.from(g, (gi) => dnorm((gi - (lo + k)) / h)));
  return { of: (/** @type {number} */ v) => rows[v - lo] };
}

/** MASS::bandwidth.nrd. @param {Float64Array} x */
function bandwidthNrd(x) {
  const sorted = Float64Array.from(x).sort();
  const h = (quantile7(sorted, 0.75) - quantile7(sorted, 0.25)) / 1.34;
  return 4 * 1.06 * Math.min(Math.sqrt(variance(x, mean(x))), h) * pow(x.length, -1 / 5);
}

/**
 * Colours for messages in layout order, drawn with R's sample().
 * @param {Point[]} labels @param {string[]} palette
 * @param {{ index(n: number): number, weighted(weights: ArrayLike<number>, k?: number): number[] }} rng
 */
export function assignColors(labels, palette, rng) {
  /** @type {string[]} */
  const colors = [];
  for (let i = 0; i < labels.length; i++) {
    if (i === 0) {
      colors.push(palette[rng.index(palette.length)]);
      continue;
    }
    /** @type {Map<string, number>} nearest distance to a message of each colour */
    const nearest = new Map();
    let farthest = -Infinity;
    for (let k = 0; k < i; k++) {
      const dx = labels[i].x - labels[k].x;
      const dy = labels[i].y - labels[k].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      farthest = Math.max(farthest, d);
      nearest.set(colors[k], Math.min(nearest.get(colors[k]) ?? Infinity, d));
    }
    for (const color of palette) if (!nearest.has(color)) nearest.set(color, farthest * 1e3);
    const names = [...nearest.keys()].sort(collate);
    const dists = names.map((name) => /** @type {number} */ (nearest.get(name)));
    const m = mean(dists);
    const e = dists.map((d) => exp(d / m));
    const total = sum(e);
    colors.push(names[rng.weighted(e.map((v) => v / total), 1)[0]]);
  }
  return colors;
}

/**
 * The order R's split() puts colour names in (sorted factor levels): a locale's collation, for
 * #rrggbb strings ignoring case first, then lower case before upper.
 * @param {string} a @param {string} b
 */
function collate(a, b) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a === b ? 0 : a > b ? -1 : 1;
}
