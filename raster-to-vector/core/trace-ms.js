// The default tracer (trace.method = "marching_squares"), as R/trace_ms.R:
// marching squares on each layer's mask without interpolation. Every pixel
// edge between an inside and an outside pixel is a unit segment with the
// inside on its left (y down); segments link head to tail into closed rings,
// turning left at a saddle, so diagonal pixels belong to separate rings.
// Vertices lie on pixel corners: (x, y) with x the column and y the row of
// the padded image's corner grid. Edges and rings come in R's order, so the
// rings, their start vertices included, are R's.

/** @typedef {{ x: Float64Array, y: Float64Array }} Ring */

/**
 * Rings of one mask.
 * @param {Uint8Array} mask row-major, height × width (1 inside)
 * @param {number} height @param {number} width
 * @returns {Ring[]}
 */
export function traceMaskMs(mask, height, width) {
  // margined mask m: (height + 2) × (width + 2); R's 1-based m[i, j] is mask[i - 2, j - 2]
  const nr = height + 2;
  const nc = width + 2;
  const m = (/** @type {number} */ i, /** @type {number} */ j) => (i >= 2 && i <= nr - 1 && j >= 2 && j <= nc - 1 ? mask[(i - 2) * width + (j - 2)] : 0);
  /** @type {number[]} */
  const x0 = [];
  /** @type {number[]} */
  const y0 = [];
  /** @type {number[]} */
  const x1 = [];
  /** @type {number[]} */
  const y1 = [];
  // horizontal edges between (i, j) and (i + 1, j) at y = i, in R's which() order (column-major)
  for (let j = 1; j <= nc; j++) {
    for (let i = 1; i < nr; i++) {
      const above = m(i, j);
      if (above === m(i + 1, j)) continue;
      x0.push(above ? j - 1 : j);
      x1.push(above ? j : j - 1);
      y0.push(i);
      y1.push(i);
    }
  }
  // vertical edges between (i, j) and (i, j + 1) at x = j
  for (let j = 1; j < nc; j++) {
    for (let i = 1; i <= nr; i++) {
      const left = m(i, j);
      if (left === m(i, j + 1)) continue;
      x0.push(j);
      x1.push(j);
      y0.push(left ? i : i - 1);
      y1.push(left ? i - 1 : i);
    }
  }
  const n = x0.length;
  // outgoing edges per corner, in edge order (a saddle has two)
  const corner = (/** @type {number} */ x, /** @type {number} */ y) => x * (nr + 1) + y;
  const first = new Int32Array((nc + 1) * (nr + 1)).fill(-1);
  const second = new Int32Array((nc + 1) * (nr + 1)).fill(-1);
  for (let e = 0; e < n; e++) {
    const c = corner(x0[e], y0[e]);
    if (first[c] === -1) first[c] = e;
    else second[c] = e;
  }
  const used = new Uint8Array(n);
  /** @type {Ring[]} */
  const rings = [];
  for (let e0 = 0; e0 < n; e0++) {
    if (used[e0]) continue;
    /** @type {number[]} */
    const xs = [];
    /** @type {number[]} */
    const ys = [];
    let e = e0;
    for (;;) {
      used[e] = 1;
      xs.push(x0[e] - 1);
      ys.push(y0[e] - 1);
      const c = corner(x1[e], y1[e]);
      let next = first[c];
      if (second[c] !== -1) {
        // saddle: the left turn of the incoming direction
        const dx = x1[e] - x0[e];
        const dy = y1[e] - y0[e];
        const left = (/** @type {number} */ f) => x1[f] - x0[f] === dy && y1[f] - y0[f] === -dx;
        next = left(first[c]) ? first[c] : second[c];
      }
      e = next;
      if (e === e0) break;
    }
    rings.push({ x: Float64Array.from(xs), y: Float64Array.from(ys) });
  }
  return rings;
}

/**
 * Traces every layer of a label image (1..K, row-major). Rings with fewer than
 * minLength vertices are dropped and reported.
 * @param {Int32Array} labels @param {number} height @param {number} width
 * @param {number} nLayers @param {number} minLength
 */
export function traceLayersMs(labels, height, width, nLayers, minLength) {
  return Array.from({ length: nLayers }, (_, layer) => {
    const mask = labels.map((v) => (v === layer + 1 ? 1 : 0));
    const rings = traceMaskMs(Uint8Array.from(mask), height, width);
    return {
      shapes: rings.filter((r) => r.x.length >= minLength),
      dropped: rings.filter((r) => r.x.length < minLength).map((r) => ({ n: r.x.length, closed: true })),
    };
  });
}
