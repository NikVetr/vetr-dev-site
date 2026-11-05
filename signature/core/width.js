// Pen width along each smoothed stroke. A pen lays down more ink where it moves
// slowly, so the width follows the signing speed, slow strokes thick and fast
// ones thin:
//
// - "speed": the measured speed of the raw samples (how far the pen moved per
//   polling interval), smoothed along the stroke as time per unit length (so a
//   pause, where the pen moves not at all, counts as a long time in one place),
//   then blended in log space with the speed the stroke's shape predicts
//   (`geometryWeight`).
// - "curvature": for input without timing, the speed the two-thirds power law
//   of human movement predicts from the smoothed curvature (Lacquaniti, Terzuolo
//   & Viviani 1983: speed = K curvature^(-1/3)): fast on long straight runs,
//   slow in tight turns. `exponent` is the power (1/3 is the law), and bends
//   wider than `straightRadius` × the signature's height count as straight.
// - "pressure": the pen pressure the device reported, from 0 to 1.
// - "constant": every point at the largest width.
//
// Speeds become widths through their spread over the whole signature: the 5%
// slowest points take the largest width and the 5% fastest the smallest. The
// ends of each stroke then taper. Widths are in units of the signature's height.

/**
 * @typedef {import('./resample.js').RawPoint} RawPoint
 * @typedef {{ source: 'speed' | 'curvature' | 'pressure' | 'constant', min: number, max: number, exponent: number,
 *   straightRadius: number, geometryWeight: number, smoothing: number, taper: { length: number, floor: number } }} WidthSettings
 * @typedef {{ x: Float64Array, y: Float64Array, s: Float64Array, raw: RawPoint[], rawS: Float64Array }} WidthStroke
 *   x, y the smoothed points; s their raw arc length; raw and rawS the raw samples and their arc length
 */

/**
 * Gaussian smoothing of values at positions along a stroke, with weights
 * renormalised where the kernel runs off the stroke's ends.
 * @param {ArrayLike<number>} v @param {ArrayLike<number>} pos @param {number} bandwidth
 */
export function gaussianAlong(v, pos, bandwidth) {
  const n = v.length;
  const out = new Float64Array(n);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (pos[i] - pos[lo] > 4 * bandwidth) lo++;
    while (hi + 1 < n && pos[hi + 1] - pos[i] <= 4 * bandwidth) hi++;
    let sw = 0;
    let sv = 0;
    for (let k = lo; k <= hi; k++) {
      const d = (pos[k] - pos[i]) / bandwidth;
      const w = Math.exp(-0.5 * d * d);
      sw += w;
      sv += w * v[k];
    }
    out[i] = sv / sw;
  }
  return out;
}

/** Arc length along a polyline. @param {ArrayLike<number>} x @param {ArrayLike<number>} y */
function arcLength(x, y) {
  const s = new Float64Array(x.length);
  for (let i = 1; i < x.length; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  return s;
}

/**
 * Unsigned curvature at each point (turning angle over the mean of the two
 * neighbouring steps), the end points taking their neighbours'.
 * @param {ArrayLike<number>} x @param {ArrayLike<number>} y
 */
export function curvature(x, y) {
  const n = x.length;
  const k = new Float64Array(n);
  for (let i = 1; i + 1 < n; i++) {
    const ax = x[i] - x[i - 1];
    const ay = y[i] - y[i - 1];
    const bx = x[i + 1] - x[i];
    const by = y[i + 1] - y[i];
    const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    const step = (Math.hypot(ax, ay) + Math.hypot(bx, by)) / 2;
    k[i] = step > 0 ? turn / step : 0;
  }
  if (n > 2) {
    k[0] = k[1];
    k[n - 1] = k[n - 2];
  }
  return k;
}

/**
 * Log speed predicted by the power law from the smoothed curvature.
 * @param {WidthStroke} st @param {number} height @param {WidthSettings} w
 */
export function powerLawLogSpeed(st, height, w) {
  const pos = arcLength(st.x, st.y);
  const kappa = gaussianAlong(curvature(st.x, st.y), pos, w.smoothing * height);
  const k0 = 1 / (w.straightRadius * height);
  return kappa.map((k) => -w.exponent * Math.log(k + k0));
}

/**
 * Log of the measured speed at each smoothed point: time per unit of raw arc
 * length over each step between points, smoothed, and inverted.
 * @param {WidthStroke} st @param {number} height @param {WidthSettings} w
 */
export function measuredLogSpeed(st, height, w) {
  const n = st.s.length;
  const times = st.s.map((s, i) => (i === 0 ? /** @type {number} */ (st.raw[0].t) : i === n - 1
    ? /** @type {number} */ (st.raw[st.raw.length - 1].t) : timeAt(st, s)));
  const mid = new Float64Array(n - 1);
  const pace = new Float64Array(n - 1);
  for (let i = 0; i + 1 < n; i++) {
    mid[i] = (st.s[i] + st.s[i + 1]) / 2;
    pace[i] = (times[i + 1] - times[i]) / Math.max(st.s[i + 1] - st.s[i], 1e-12);
  }
  const smooth = gaussianAlong(pace, mid, w.smoothing * height);
  const floor = 1e-9 * Math.max(...smooth);
  return Float64Array.from({ length: n }, (_, i) => {
    const p = i === 0 ? smooth[0] : i === n - 1 ? smooth[n - 2] : (smooth[i - 1] + smooth[i]) / 2;
    return -Math.log(Math.max(p, floor));
  });
}

/** Time at raw arc length s: after any pause at that place. @param {WidthStroke} st @param {number} s */
function timeAt(st, s) {
  const { rawS, raw } = st;
  let k = 0;
  while (k + 1 < rawS.length && rawS[k + 1] <= s) k++;
  if (k + 1 >= rawS.length) return /** @type {number} */ (raw[k].t);
  const f = (s - rawS[k]) / (rawS[k + 1] - rawS[k]);
  return /** @type {number} */ (raw[k].t) + (/** @type {number} */ (raw[k + 1].t) - /** @type {number} */ (raw[k].t)) * f;
}

/** Pressure at each smoothed point, read off the raw samples by arc length. @param {WidthStroke} st */
function pressureAt(st) {
  const { rawS, raw } = st;
  return st.s.map((s) => {
    let k = 0;
    while (k + 1 < rawS.length && rawS[k + 1] <= s) k++;
    const p0 = /** @type {number} */ (raw[k].pressure);
    if (k + 1 >= rawS.length || rawS[k + 1] === rawS[k]) return p0;
    return p0 + (/** @type {number} */ (raw[k + 1].pressure) - p0) * ((s - rawS[k]) / (rawS[k + 1] - rawS[k]));
  });
}

/** The p-quantile (type 7, R's default) of values. @param {number[]} sorted ascending @param {number} p */
function quantile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return sorted[lo] + (h - lo) * (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]);
}

/** Median of the values of several arrays. @param {ArrayLike<number>[]} arrays */
function pooledMedian(arrays) {
  const all = arrays.flatMap((a) => Array.from(a)).sort((a, b) => a - b);
  return quantile(all, 0.5);
}

/**
 * Widths of every stroke, in the units of the strokes (height × the settings).
 * @param {WidthStroke[]} strokes @param {number} height @param {WidthSettings} w
 * @returns {Float64Array[]}
 */
export function strokeWidths(strokes, height, w) {
  const lo = w.min * height;
  const hi = w.max * height;
  /** @type {Float64Array[]} */
  let base;
  if (w.source === 'constant') base = strokes.map((st) => new Float64Array(st.x.length).fill(hi));
  else if (w.source === 'pressure') {
    base = strokes.map((st) => gaussianAlong(pressureAt(st), st.s, w.smoothing * height).map((p) => lo + (hi - lo) * Math.min(1, Math.max(0, p))));
  } else {
    const geometric = strokes.map((st) => powerLawLogSpeed(st, height, w));
    /** @type {Float64Array[]} */
    let logSpeed = geometric;
    if (w.source === 'speed') {
      const measured = strokes.map((st) => measuredLogSpeed(st, height, w));
      const mm = pooledMedian(measured);
      const mg = pooledMedian(geometric);
      const g = w.geometryWeight;
      logSpeed = measured.map((m, i) => m.map((v, k) => (1 - g) * (v - mm) + g * (geometric[i][k] - mg)));
    }
    const sorted = logSpeed.flatMap((a) => Array.from(a)).sort((a, b) => a - b);
    const q05 = quantile(sorted, 0.05);
    const q95 = quantile(sorted, 0.95);
    const spread = q95 - q05;
    base = logSpeed.map((ls) => ls.map((v) => {
      const z = spread > 0 ? Math.min(1, Math.max(0, (v - q05) / spread)) : 0.5;
      return hi - (hi - lo) * z;
    }));
  }
  return base.map((wd, i) => taper(wd, strokes[i], height, w.taper));
}

/**
 * Narrows each end of a stroke from `floor` × the width up to the full width over
 * `length` × the height (at most a third of the stroke), on a quarter sine.
 * @param {Float64Array} wd @param {WidthStroke} st @param {number} height @param {{ length: number, floor: number }} t
 */
function taper(wd, st, height, t) {
  if (t.length === 0) return wd;
  const pos = arcLength(st.x, st.y);
  const total = pos[pos.length - 1];
  const len = Math.min(t.length * height, total / 3);
  if (len <= 0) return wd;
  return wd.map((v, i) => {
    const d = Math.min(pos[i], total - pos[i]) / len;
    return v * (t.floor + (1 - t.floor) * Math.sin((Math.PI / 2) * Math.min(1, d)));
  });
}
