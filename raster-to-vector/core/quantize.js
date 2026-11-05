// Colour quantization and speckle cleanup, as R/quantize.R.
//
// quantizeColors(): round colours, give transparent pixels a sentinel colour,
// run weighted k-means on the most frequent distinct colours for each k, give
// every pixel its nearest centre, and pick k by the Davies-Bouldin index.
// cleanLabels(): absorb short runs. relabelClusters(): drop emptied colours.

import { createRng } from './rng.js';
import { mean, roundR, sum } from './stats.js';

/**
 * @typedef {{ kRange: number[], offset: number, nTop: number, digits: number, alphaThreshold: number,
 *   seeding: 'weighted' | 'unweighted', space: 'rgb' | 'oklab', seed: number }} QuantizeSettings
 * @typedef {{ clusterInds: Int32Array, centers: number[][], k: number, dbi: (number | null)[], ks: number[], nDistinct: number }} Quantized
 */

const P = 4; // features per colour: three colour coordinates and alpha

/**
 * Quantizes RGBA bytes (row-major). clusterInds are 1-based, per pixel in
 * row-major order; centers are mean RGBA pixel values rounded to 3 decimals.
 * @param {{ width: number, height: number, data: Uint8Array }} img
 * @param {QuantizeSettings} q
 * @param {(k: number, i: number, of: number) => void} [onK] called before each k is tried
 * @returns {Quantized}
 */
export function quantizeColors(img, q, onK) {
  const rng = createRng(q.seed);
  const nPix = img.width * img.height;
  const level = Array.from({ length: 256 }, (_, b) => roundR(b / 255, q.digits));

  // distinct colours (as R's paste(r, g, b, a, sep = "_")) in C collation order, with counts
  /** @type {Map<number, number>} */
  const byRgba = new Map();
  /** @type {Map<string, number>} */
  const byName = new Map();
  /** @type {number[][]} */
  const colours = [];
  const firstKey = new Int32Array(nPix);
  for (let i = 0; i < nPix; i++) {
    const d = img.data;
    const rgba = ((d[4 * i] << 24) | (d[4 * i + 1] << 16) | (d[4 * i + 2] << 8) | d[4 * i + 3]) >>> 0;
    let key = byRgba.get(rgba);
    if (key === undefined) {
      const a = level[d[4 * i + 3]];
      const c = a < q.alphaThreshold ? [-1, -1, -1, a] : [level[d[4 * i]], level[d[4 * i + 1]], level[d[4 * i + 2]], a];
      const name = c.join('_');
      key = byName.get(name);
      if (key === undefined) {
        key = colours.length;
        byName.set(name, key);
        colours.push(c);
      }
      byRgba.set(rgba, key);
    }
    firstKey[i] = key;
  }
  const names = [...byName.keys()];
  const sorted = names.map((_, i) => i).sort((a, b) => (names[a] < names[b] ? -1 : names[a] > names[b] ? 1 : 0));
  const rank = new Int32Array(colours.length);
  sorted.forEach((c, r) => { rank[c] = r; });
  const nDistinct = colours.length;
  const distinct = sorted.map((c) => colours[c]);
  const pixelKey = firstKey.map((k) => rank[k]);
  const counts = new Float64Array(nDistinct);
  for (let i = 0; i < nPix; i++) counts[pixelKey[i]]++;

  // the nTop most frequent (ties in name order, as R's stable decreasing sort)
  const nTop = Math.min(q.nTop, nDistinct);
  const top = distinct.map((_, i) => i).sort((a, b) => counts[b] - counts[a]).slice(0, nTop);
  const topW = Float64Array.from(top, (i) => counts[i]);

  let ks = q.kRange.filter((k) => k <= nTop);
  if (ks.length === 0) ks = [nTop];

  const distinctFeats = features(distinct, q.space);
  const topFeats = new Float64Array(nTop * P);
  top.forEach((d, i) => topFeats.set(distinctFeats.subarray(d * P, d * P + P), i * P));

  /** @type {{ clusterInds: Int32Array, centers: number[][], dbi: number | null }[]} */
  const out = [];
  ks.forEach((k, i) => {
    onK?.(k, i, ks.length);
    if (k === 1) {
      const centers = [Array.from({ length: P }, (_, f) => roundR(pixelMean(distinct, pixelKey, f, null, 0), 3))];
      out.push({ clusterInds: new Int32Array(nPix).fill(1), centers, dbi: null });
      return;
    }
    const fit = wkmeans(topFeats, topW, k, q.seeding, rng);
    const cls = nearestCenters(distinctFeats, fit.cents, k);
    const exploded = pixelKey.map((d) => cls[d] + 1);
    const centers = Array.from({ length: k }, (_, c) => Array.from({ length: P }, (_, f) => roundR(pixelMean(distinct, pixelKey, f, exploded, c + 1), 3)));
    out.push({ clusterInds: exploded, centers, dbi: daviesBouldin(distinctFeats, pixelKey, exploded) });
  });

  const dbi = out.map((o) => o.dbi);
  let best = -1;
  dbi.forEach((v, i) => { if (v !== null && !Number.isNaN(v) && (best === -1 || v < /** @type {number} */ (dbi[best]))) best = i; });
  const picked = Math.min(best === -1 ? 0 : best + q.offset, ks.length - 1);
  const centers = out[picked].centers.map((c) => c.map((v) => (v < 0 ? 0 : v)));
  return { clusterInds: out[picked].clusterInds, centers, k: ks[picked], dbi, ks, nDistinct };
}

/**
 * Mean of feature f (of the rounded RGBA, sentinel included) over the pixels of
 * cluster c (all pixels when cls is null); NaN for an empty cluster.
 * @param {number[][]} distinct @param {Int32Array} pixelKey @param {number} f
 * @param {Int32Array | null} cls @param {number} c
 */
function pixelMean(distinct, pixelKey, f, cls, c) {
  /** @type {number[]} */
  const values = [];
  for (let i = 0; i < pixelKey.length; i++) if (!cls || cls[i] === c) values.push(distinct[pixelKey[i]][f]);
  return values.length ? mean(values) : NaN;
}

/**
 * Clustering features: RGBA as it is, or OKLab for opaque colours and L = -1,
 * a = b = 0 for the transparent sentinel. Row-major, P per colour.
 * @param {number[][]} colours @param {'rgb' | 'oklab'} space
 */
function features(colours, space) {
  const out = new Float64Array(colours.length * P);
  colours.forEach((c, i) => {
    const lab = space === 'rgb' ? c.slice(0, 3) : c[0] < 0 ? [-1, 0, 0] : srgbToOklab(c);
    out.set([...lab, c[3]], i * P);
  });
  return out;
}

const M1 = [[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]];
const M2 = [[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]];

/** OKLab of an sRGB colour in [0, 1] (Ottosson's matrices), in R's order of operations. @param {number[]} c */
function srgbToOklab(c) {
  const lin = c.slice(0, 3).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lms = M1.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  const root = lms.map((v) => Math.sign(v) * Math.abs(v) ** (1 / 3));
  return M2.map((row) => row[0] * root[0] + row[1] * root[1] + row[2] * root[2]);
}

/**
 * Squared distances from each row of x to each centre (n × k, row-major).
 * @param {Float64Array} x @param {Float64Array} cents @param {number} k
 */
function sqdists(x, cents, k) {
  const n = x.length / P;
  const d = new Float64Array(n * k);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) {
      let s = 0;
      for (let f = 0; f < P; f++) {
        const v = x[i * P + f] - cents[c * P + f];
        s += v * v;
      }
      d[i * k + c] = s;
    }
  }
  return d;
}

/** Index of the nearest centre per row (first on ties, as R's max.col(ties.method = "first")). @param {Float64Array} d @param {number} k */
function argmins(d, k) {
  const n = d.length / k;
  const cls = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let c = 1; c < k; c++) if (d[i * k + c] < d[i * k + best]) best = c;
    cls[i] = best;
  }
  return cls;
}

/** @param {Float64Array} x @param {Float64Array} cents @param {number} k */
function nearestCenters(x, cents, k) {
  return argmins(sqdists(x, cents, k), k);
}

/**
 * Weighted k-means, the R version's wkmeans(): 10k restarts from k-means++
 * starts, at most 5k - 1 updates each, keeping the run with the least weighted
 * sum of squares. seeding "weighted" draws starts in proportion to the weights
 * times the squared distance; "unweighted" ignores the weights when seeding.
 * @param {Float64Array} x n × P features @param {Float64Array} w weights
 * @param {number} k @param {'weighted' | 'unweighted'} seeding
 * @param {ReturnType<typeof createRng>} rng
 */
function wkmeans(x, w, k, seeding, rng) {
  const n = w.length;
  const restarts = k * 10;
  const iterMax = k * 5;
  const eps = 1e-6;
  const seedW = seeding === 'weighted' ? w : null;
  /** @param {Float64Array} d @param {Int32Array} cls */
  const draw = (d, cls) => {
    const p = new Float64Array(n);
    for (let i = 0; i < n; i++) p[i] = d[i * k + cls[i]] * (seedW ? seedW[i] : 1);
    return rng.weighted(p);
  };
  /** @param {Float64Array} cents @param {number} c @param {number} i */
  const setCenter = (cents, c, i) => cents.set(x.subarray(i * P, i * P + P), c * P);

  let best = null;
  for (let run = 0; run < restarts; run++) {
    const cents = new Float64Array(k * P);
    setCenter(cents, 0, seedW ? rng.weighted(seedW) : rng.index(n));
    for (let ki = 1; ki < k; ki++) {
      const d = sqdists(x, cents.subarray(0, ki * P), ki);
      const cls = argmins(d, ki);
      const p = new Float64Array(n);
      for (let i = 0; i < n; i++) p[i] = d[i * ki + cls[i]] * (seedW ? seedW[i] : 1);
      setCenter(cents, ki, rng.weighted(p));
    }
    let d = sqdists(x, cents, k);
    let cls = argmins(d, k);
    let iter = 1;
    let converged = false;
    let current = cents;
    while (!converged && iter < iterMax) {
      iter++;
      const prev = current.slice();
      const present = new Uint8Array(k);
      for (const c of cls) present[c] = 1;
      if (present.includes(0)) {
        for (let ki = 0; ki < k; ki++) {
          if (present[ki]) continue;
          d = sqdists(x, current, k);
          cls = argmins(d, k);
          setCenter(current, ki, draw(d, cls));
        }
        d = sqdists(x, current, k);
        cls = argmins(d, k);
      }
      const next = new Float64Array(k * P);
      for (let c = 0; c < k; c++) {
        /** @type {number[]} */
        const members = [];
        for (let i = 0; i < n; i++) if (cls[i] === c) members.push(i);
        const total = sum(members.map((i) => w[i]));
        if (total === 0) throw new Error(`k-means left cluster ${c + 1} of ${k} empty after reseeding; the R version stops here too`);
        for (let f = 0; f < P; f++) next[c * P + f] = sum(members.map((i) => x[i * P + f] * w[i])) / total;
      }
      converged = next.every((v, i) => Math.abs(v - prev[i]) < eps);
      current = next;
      if (!converged) {
        d = sqdists(x, current, k);
        cls = argmins(d, k);
      }
    }
    const ss = sum(Array.from(cls, (c, i) => d[i * k + c] * w[i]));
    if (!best || ss < best.ss) best = { ss, cents: current, cls };
  }
  return /** @type {NonNullable<typeof best>} */ (best);
}

/**
 * clusterSim::index.DB(x, cl) with p = q = 2 over all pixels: centroids, S_i the
 * RMS distance to the centroid, M_ij the distance between centroids, and the mean
 * over clusters of the largest finite (S_i + S_j) / M_ij. Clusters are relabelled
 * to those present; null with fewer than two.
 * @param {Float64Array} distinctFeats @param {Int32Array} pixelKey @param {Int32Array} cls 1-based per pixel
 */
function daviesBouldin(distinctFeats, pixelKey, cls) {
  const present = [...new Set(cls)].sort((a, b) => a - b);
  if (present.length < 2) return null;
  const k = present.length;
  const label = new Map(present.map((c, i) => [c, i]));
  const nPix = cls.length;
  /** @type {number[][]} */
  const members = Array.from({ length: k }, () => []);
  for (let i = 0; i < nPix; i++) members[/** @type {number} */ (label.get(cls[i]))].push(i);
  const centers = members.map((m) => Array.from({ length: P }, (_, f) => mean(m.map((i) => distinctFeats[pixelKey[i] * P + f]))));
  const S = members.map((m, c) => {
    if (m.length <= 1) return 0;
    const sq = m.map((i) => {
      let s = 0;
      for (let f = 0; f < P; f++) {
        const v = distinctFeats[pixelKey[i] * P + f] - centers[c][f];
        s += v * v;
      }
      const r = Math.sqrt(s);
      return r * r;
    });
    return Math.sqrt(mean(sq));
  });
  /** @type {number[]} */
  const r = [];
  for (let i = 0; i < k; i++) {
    let best = -Infinity;
    for (let j = 0; j < k; j++) {
      let d = 0;
      for (let f = 0; f < P; f++) {
        const v = centers[i][f] - centers[j][f];
        d += v * v;
      }
      const v = (S[i] + S[j]) / Math.sqrt(d);
      if (Number.isFinite(v) && v > best) best = v;
    }
    r.push(best);
  }
  return mean(r.filter(Number.isFinite));
}

/**
 * Absorbs runs shorter than minRun pixels into the next run long enough (or the
 * last such run). Each pass treats the rows, then the columns, as R's
 * apply(clmat, 1, ...) does twice per pass. R's `1:(2 * passes)` also runs one
 * pass for passes = 0; the request validation therefore asks for passes >= 1.
 * @param {Int32Array} labels row-major, height × width @param {number} height @param {number} width
 * @param {number} minRun @param {number} passes
 */
export function cleanLabels(labels, height, width, minRun, passes) {
  let m = Int32Array.from(labels);
  let rows = height;
  let cols = width;
  for (let pass = 0; pass < 2 * passes; pass++) {
    const t = new Int32Array(rows * cols); // the result, transposed: cols × rows
    for (let r = 0; r < rows; r++) {
      const line = absorbShortRuns(m.subarray(r * cols, (r + 1) * cols), minRun, pass % 2 ? 'column' : 'row', r);
      for (let c = 0; c < cols; c++) t[c * rows + r] = line[c];
    }
    m = t;
    [rows, cols] = [cols, rows];
  }
  return m;
}

/**
 * @param {Int32Array} x @param {number} minRun @param {'row' | 'column'} what @param {number} index
 */
function absorbShortRuns(x, minRun, what, index) {
  /** @type {{ value: number, length: number }[]} */
  const runs = [];
  for (const v of x) {
    if (runs.length && runs[runs.length - 1].value === v) runs[runs.length - 1].length++;
    else runs.push({ value: v, length: 1 });
  }
  const ok = runs.filter((r) => r.length >= minRun);
  if (ok.length === runs.length) return x;
  if (ok.length === 0) {
    throw new CleanError(`${what} ${index + 1} of the padded label image has no run of ${minRun} or more equal pixels, so cleanup has nothing to absorb its short runs into; lower clean.minRun`);
  }
  const lengths = ok.map((r) => r.length);
  let seen = 0;
  for (const r of runs) {
    if (r.length >= minRun) seen++;
    else lengths[Math.min(seen, ok.length - 1)] += r.length;
  }
  const out = new Int32Array(x.length);
  let i = 0;
  ok.forEach((r, j) => {
    out.fill(r.value, i, i + lengths[j]);
    i += lengths[j];
  });
  return out;
}

/** Cleanup that cannot proceed (R fails with an internal error here). */
export class CleanError extends Error {}

/**
 * Drops clusters that cleanup removed and relabels the rest 1..K.
 * @param {Int32Array} labels @param {number[][]} centers
 */
export function relabelClusters(labels, centers) {
  const left = [...new Set(labels)].sort((a, b) => a - b);
  const map = new Map(left.map((c, i) => [c, i + 1]));
  return { labels: labels.map((c) => /** @type {number} */ (map.get(c))), centers: left.map((c) => centers[c - 1]) };
}
