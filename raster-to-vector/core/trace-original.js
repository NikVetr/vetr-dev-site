// The original tracer (trace.method = "original"), as R/trace.R. For each
// layer the mask gets a FALSE margin, is dilated up and left (so neighbouring
// layers share boundaries), and goes through Sobel edge detection; the dilated
// mask's inner border near the edges is thinned to a 4-connected one-pixel
// line (2×2 blocks removed, diagonal gaps filled, nubbins deleted) and
// followed into closed chains, taking the first free neighbour.
//
// R did the convolutions with ImageMagick (bias 50%, results thresholded); on
// binary masks they reduce to the exact operations below, with ImageMagick's
// edge-replicating virtual pixels. Like R, the work after the Sobel step is
// done on the transposed mask ("width × height"), and every scan follows R's
// column-major which() order, which the chain follower depends on.

/** A matrix of 0/1, element (i, j) at data[i * ncol + j]. @typedef {{ nrow: number, ncol: number, data: Uint8Array }} Mat */

/** @param {number} nrow @param {number} ncol @returns {Mat} */
const zeros = (nrow, ncol) => ({ nrow, ncol, data: new Uint8Array(nrow * ncol) });

/** @param {Mat} m @param {number} i @param {number} j value with off-matrix positions replicating the edge */
const edgeAt = (m, i, j) => m.data[Math.min(Math.max(i, 0), m.nrow - 1) * m.ncol + Math.min(Math.max(j, 0), m.ncol - 1)];

/** @param {Mat} m @param {number} i @param {number} j value, 0 off the matrix */
const at = (m, i, j) => (i >= 0 && i < m.nrow && j >= 0 && j < m.ncol ? m.data[i * m.ncol + j] : 0);

/** @param {Mat} m @param {number} i @param {number} j @param {number} v */
const set = (m, i, j, v) => { m.data[i * m.ncol + j] = v; };

/** @param {Mat} m @returns {Mat} */
function transpose(m) {
  const t = zeros(m.ncol, m.nrow);
  for (let i = 0; i < m.nrow; i++) for (let j = 0; j < m.ncol; j++) t.data[j * m.nrow + i] = m.data[i * m.ncol + j];
  return t;
}

/**
 * img2mat(image_convolve(mat2img(m), matrix(1, k, k), bias = "50%")): set where the
 * k × k window from (i - o, j - o), o = floor(k / 2), is all set. (A convolution
 * reflects the kernel, origin included: ImageMagick's origin floor((k - 1) / 2)
 * becomes k - 1 minus that.)
 * @param {Mat} m @param {number} k @returns {Mat}
 */
export function allInWindow(m, k) {
  const o = Math.floor(k / 2);
  const out = zeros(m.nrow, m.ncol);
  for (let i = 0; i < m.nrow; i++) {
    for (let j = 0; j < m.ncol; j++) {
      let all = 1;
      for (let u = 0; u < k && all; u++) for (let v = 0; v < k && all; v++) all = edgeAt(m, i - o + u, j - o + v);
      out.data[i * m.ncol + j] = all;
    }
  }
  return out;
}

/**
 * R's sobel_sum(m): ImageMagick's Sobel convolution of mat2img(m) (set pixels
 * black, bias 50%) summed over the three 8-bit channels: 765 where the weighted
 * difference of the complement, right minus left, is positive, 0 where negative,
 * 384 where zero. Indexed (column, row), as image_data() gives it.
 * @param {Mat} m @returns {{ nrow: number, ncol: number, data: Uint16Array }}
 */
export function sobelSum(m) {
  const data = new Uint16Array(m.nrow * m.ncol);
  for (let i = 0; i < m.nrow; i++) {
    for (let j = 0; j < m.ncol; j++) {
      let r = 0;
      for (let d = -1; d <= 1; d++) r += (d === 0 ? 2 : 1) * (edgeAt(m, i + d, j - 1) - edgeAt(m, i + d, j + 1));
      data[j * m.nrow + i] = r > 0 ? 765 : r < 0 ? 0 : 384;
    }
  }
  return { nrow: m.ncol, ncol: m.nrow, data };
}

/**
 * scale2(abs(s - median(s))) > 0.5 for sobelSum() values.
 * @param {{ nrow: number, ncol: number, data: Uint16Array }} s @returns {Mat}
 */
function sobelEdges(s) {
  const n = s.data.length;
  const counts = [0, 0, 0];
  for (const v of s.data) counts[v === 0 ? 0 : v === 384 ? 1 : 2]++;
  const nth = (/** @type {number} */ t) => (t < counts[0] ? 0 : t < counts[0] + counts[1] ? 384 : 765);
  const med = n % 2 ? nth((n - 1) / 2) : (nth(n / 2 - 1) + nth(n / 2)) / 2;
  const dev = [0, 384, 765].map((v, c) => (counts[c] ? Math.abs(v - med) : NaN)).filter((v) => !Number.isNaN(v));
  const min = Math.min(...dev);
  const range = Math.max(...dev) - min || Infinity;
  const out = zeros(s.nrow, s.ncol);
  for (let p = 0; p < n; p++) out.data[p] = (Math.abs(s.data[p] - med) - min) / range > 0.5 ? 1 : 0;
  return out;
}

/**
 * deconvolve_1kern(m, dimk): every set pixel also sets the pixels at row and column
 * offsets from ceil(-dimk / 2) to floor(dimk / 2) (one less for even dimk).
 * @param {Mat} m @param {number} dimk @returns {Mat}
 */
function dilate(m, dimk) {
  const lo = Math.ceil(-dimk / 2);
  const hi = Math.floor(dimk / 2) - (dimk % 2 === 0 ? 1 : 0);
  const out = { ...m, data: m.data.slice() };
  for (let i = 0; i < m.nrow; i++) {
    for (let j = 0; j < m.ncol; j++) {
      if (!m.data[i * m.ncol + j]) continue;
      for (let di = lo; di <= hi; di++) {
        for (let dj = lo; dj <= hi; dj++) {
          if (i + di >= 0 && i + di < m.nrow && j + dj >= 0 && j + dj < m.ncol) set(out, i + di, j + dj, 1);
        }
      }
    }
  }
  return out;
}

const NESW = /** @type {const} */ ([[0, 1], [1, 0], [0, -1], [-1, 0]]);

/** Set positions in R's column-major which() order. @param {Mat} m @returns {[number, number][]} */
function which(m) {
  /** @type {[number, number][]} */
  const out = [];
  for (let j = 0; j < m.ncol; j++) for (let i = 0; i < m.nrow; i++) if (m.data[i * m.ncol + j]) out.push([i, j]);
  return out;
}

/** Number of set 4-neighbours of (i, j). @param {Mat} m @param {number} i @param {number} j */
const degree = (m, i, j) => at(m, i, j + 1) + at(m, i + 1, j) + at(m, i, j - 1) + at(m, i - 1, j);

/** @param {[number, number]} p @param {readonly number[]} q */
const manhattan = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

/**
 * R's fill_gaps_delete_nubbins(): among the degree-1 pixels of inds, deletes those
 * whose neighbour has degree 3 (nubbins), and for each pair of chain ends (whose
 * neighbour has degree 2) at Manhattan distance 2 sets the first of the second
 * end's neighbours that the first end shares. Changes m; returns whether inds
 * had any degree-1 pixel.
 * @param {Mat} m @param {[number, number][]} inds @param {number[]} degrees of inds in m
 */
function fillGapsDeleteNubbins(m, inds, degrees) {
  const ends = inds.filter((_, k) => degrees[k] === 1);
  if (ends.length === 0) return false;
  const nborDegree = ends.map(([i, j]) => {
    const [di, dj] = /** @type {readonly [number, number]} */ (NESW.find(([a, b]) => at(m, i + a, j + b)));
    return degree(m, i + di, j + dj);
  });
  const gaps = ends.filter((_, k) => nborDegree[k] === 2);
  ends.forEach(([i, j], k) => { if (nborDegree[k] === 3) set(m, i, j, 0); });
  for (let a = 0; a < gaps.length; a++) {
    for (let b = a + 1; b < gaps.length; b++) {
      const [p, q] = [gaps[a], gaps[b]];
      if (manhattan(p, q) !== 2) continue;
      const shared = /** @type {number[]} */ (NESW.map(([di, dj]) => [q[0] + di, q[1] + dj]).find((s) => manhattan(p, s) === 1));
      set(m, shared[0], shared[1], 1);
    }
  }
  return true;
}

/**
 * Thins the inner border to a one-pixel 4-connected line, as R's thin_edges().
 * @param {Mat} edges @param {number} [max2x2] @returns {Mat}
 */
function thinEdges(edges, max2x2 = 10) {
  const m = { ...edges, data: edges.data.slice() };
  let extra = allInWindow(m, 2);
  for (let round = 1; extra.data.includes(1) && round <= max2x2; round++) {
    for (let p = 0; p < m.data.length; p++) if (extra.data[p]) m.data[p] = 0;
    const inds = which(m);
    fillGapsDeleteNubbins(m, inds, inds.map(([i, j]) => degree(m, i, j)));
    extra = allInWindow(m, 2);
  }
  // one last check for gaps and nubbins
  const inds = which(m);
  if (fillGapsDeleteNubbins(m, inds, inds.map(([i, j]) => degree(m, i, j)))) {
    // pixels of inds (as listed before the patch) no longer of degree 2: delete the
    // degree-1 member of each adjacent pair, or all of them if none are adjacent
    const degrees = inds.map(([i, j]) => degree(m, i, j));
    const odd = inds.map((_, k) => k).filter((k) => degrees[k] !== 2);
    let pairs = 0;
    for (let a = 0; a < odd.length; a++) {
      for (let b = a + 1; b < odd.length; b++) {
        if (manhattan(inds[odd[a]], inds[odd[b]]) !== 1) continue;
        pairs++;
        for (const k of [odd[a], odd[b]]) if (degrees[k] === 1) set(m, inds[k][0], inds[k][1], 0);
      }
    }
    if (pairs === 0) for (const k of odd) set(m, inds[k][0], inds[k][1], 0);
  }
  return m;
}

/**
 * R's follow_chains(): from the first unvisited pixel (column-major), step to the
 * first unvisited neighbour in R's nesw order until there is none. A chain is kept
 * if it ends next to its start and has at least minLength pixels. Positions are
 * R's 1-based (row, column) indices of m.
 * @param {Mat} edges @param {number} minLength
 */
function followChains(edges, minLength) {
  const left = { ...edges, data: edges.data.slice() };
  const { nrow, ncol } = edges;
  /** @type {{ x: number[], y: number[] }[]} */
  const shapes = [];
  /** @type {{ n: number, closed: boolean }[]} */
  const dropped = [];
  let scan = 0; // column-major position before which every pixel is visited
  for (;;) {
    while (scan < nrow * ncol && !at(left, scan % nrow, Math.floor(scan / nrow))) scan++;
    if (scan === nrow * ncol) break;
    let i = scan % nrow;
    let j = Math.floor(scan / nrow);
    /** @type {number[]} */
    const xs = [];
    /** @type {number[]} */
    const ys = [];
    for (;;) {
      set(left, i, j, 0);
      xs.push(i + 1);
      ys.push(j + 1);
      const next = NESW.find(([di, dj]) => at(left, i + di, j + dj));
      if (!next) break;
      i += next[0];
      j += next[1];
    }
    const n = xs.length;
    const closed = Math.abs(xs[0] - xs[n - 1]) + Math.abs(ys[0] - ys[n - 1]) < 1.01;
    if (closed && n > minLength - 0.1) shapes.push({ x: xs, y: ys });
    else dropped.push({ n, closed });
  }
  return { shapes, dropped };
}

/**
 * Traces one layer's mask (row-major, height × width) as R's trace_layer() with a
 * margin of 2. Rings come back on the padded image's pixel-corner grid, x the
 * column and y the row.
 * @param {Uint8Array} mask @param {number} height @param {number} width
 * @param {number} minLength @param {number} kconvInit
 */
export function traceMaskOriginal(mask, height, width, minLength, kconvInit) {
  const margin = 2;
  const a = zeros(height + 2 * margin, width + 2 * margin);
  for (let i = 0; i < height; i++) a.data.set(mask.subarray(i * width, (i + 1) * width), (i + margin) * a.ncol + margin);
  // erode by a kconvInit window, then dilate up and left (by one pixel for kconvInit = 1)
  const d = dilate(kconvInit === 1 ? a : allInWindow(a, kconvInit), kconvInit + 1);
  // Sobel edges in both directions, in (column, row) orientation, then the 2 × 2 band
  const s1 = sobelEdges(sobelSum(d));
  const s2 = transpose(sobelEdges(sobelSum(transpose(d))));
  const band = transpose(allInWindow({ ...s1, data: s1.data.map((v, p) => v | s2.data[p]) }, 2));
  // the dilated mask's inner border (an in-matrix outside 8-neighbour) within the
  // 8-neighbourhood of a band pixel, the pixel itself excluded
  const border = zeros(d.nrow, d.ncol);
  for (let i = 0; i < d.nrow; i++) {
    for (let j = 0; j < d.ncol; j++) {
      if (!at(d, i, j)) continue;
      let outside = false;
      let near = false;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (di === 0 && dj === 0) continue;
          const inside = i + di >= 0 && i + di < d.nrow && j + dj >= 0 && j + dj < d.ncol;
          if (inside && !at(d, i + di, j + dj)) outside = true;
          if (at(band, i + di, j + dj)) near = true;
        }
      }
      if (outside && near) set(border, i, j, 1);
    }
  }
  const chains = followChains(thinEdges(transpose(border)), minLength);
  return {
    shapes: chains.shapes.map((s) => ({ x: Float64Array.from(s.x, (v) => v - margin), y: Float64Array.from(s.y, (v) => v - margin) })),
    dropped: chains.dropped,
  };
}

/**
 * Traces every layer of a label image (1..K, row-major).
 * @param {Int32Array} labels @param {number} height @param {number} width
 * @param {number} nLayers @param {number} minLength @param {number} kconvInit
 */
export function traceLayersOriginal(labels, height, width, nLayers, minLength, kconvInit) {
  return Array.from({ length: nLayers }, (_, layer) => {
    const mask = Uint8Array.from(labels, (v) => (v === layer + 1 ? 1 : 0));
    if (!mask.includes(1)) return { shapes: [], dropped: [] };
    return traceMaskOriginal(mask, height, width, minLength, kconvInit);
  });
}
