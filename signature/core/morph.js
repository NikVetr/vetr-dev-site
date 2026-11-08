// Morphing one signature into another, as the R script's interpolation section
// (:417-643), extended from its first stroke to whole signatures.
//
// Both signatures are centred on their bounding boxes and brought to the same
// total ink length (the R script multiplied by length / longest length, which
// shortens the shorter one further; here it is divided, :436-439). Strokes are
// paired: with equal counts in order; otherwise, as the R script began to
// (:653-711), the longest strokes of the signature with more are paired in
// drawing order with the other's, and each stroke left over is paired with a
// stroke of no length placed where it crosses a paired stroke (or, if it
// crosses none, at the paired stroke's nearest point), so that it grows out
// of that point. Each pair is resampled to one length.
//
// method "wavelet" (wavelet_smooth_interpolate): each coordinate's MODWT
// coefficients, soft-thresholded at noiseMultiplier / (its share of the larger
// raw sample count) × sd(d1), are interpolated and inverted. `loop` swells the
// detail levels part way through (by 1 + loop · 4p(1 - p)), the "loopier
// intermediate stage" the script's notes suggest (:312). Without it the
// inverse is linear, so this equals interpolating the two smoothed strokes.
// method "linear" (linear_smooth_interpolate of fourier_smooth): the strokes
// smoothed by the script's Fourier threshold, interpolated. method
// "corrected": the strokes smoothed by the request's own smoothing settings.
// Widths, from each signature's width model, are interpolated too.

import { imodwt, modwt, waveletNoise } from '../../shared/wavelet.js';
import { cumulativeLength, resampleStroke } from './resample.js';
import { fourierSmoothSeries, strokeLevels } from './smooth.js';

/**
 * @typedef {import('./resample.js').RawPoint} RawPoint
 * @typedef {{ stroke: number } | { anchor: [number, number] }} Side
 * @typedef {{ a: Side, b: Side }} Pair
 */

/** Total ink length of a signature (line_lengths summed). @param {RawPoint[][]} sig */
export function inkLength(sig) {
  return sig.reduce((sum, s) => {
    const c = cumulativeLength(s.map((p) => p.x), s.map((p) => p.y));
    return sum + c[c.length - 1];
  }, 0);
}

/** A signature moved so its bounding box is centred on the origin, and scaled by k. @param {RawPoint[][]} sig @param {number} k */
function centreAndScale(sig, k) {
  const xs = sig.flat().map((p) => p.x);
  const ys = sig.flat().map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return sig.map((s) => s.map((p) => ({ ...p, x: (p.x - cx) * k, y: (p.y - cy) * k })));
}

/**
 * Both signatures centred, the shorter scaled up to the longer's ink length.
 * @param {RawPoint[][]} a @param {RawPoint[][]} b
 */
export function normalizePair(a, b) {
  const [la, lb] = [inkLength(a), inkLength(b)];
  const longest = Math.max(la, lb);
  return [centreAndScale(a, longest / la), centreAndScale(b, longest / lb)];
}

/**
 * Where segments p1p2 and q1q2 meet, as the share along each, or null.
 * (The R script's intersect_func tested only the first segment's x range
 * and returned the wrong y; this is the parametric test of both.)
 * @param {number[]} p1 @param {number[]} p2 @param {number[]} q1 @param {number[]} q2
 */
export function segmentIntersection(p1, p2, q1, q2) {
  const rx = p2[0] - p1[0];
  const ry = p2[1] - p1[1];
  const sx = q2[0] - q1[0];
  const sy = q2[1] - q1[1];
  const den = rx * sy - ry * sx;
  if (den === 0) return null;
  const qpx = q1[0] - p1[0];
  const qpy = q1[1] - p1[1];
  const a = (qpx * sy - qpy * sx) / den;
  const b = (qpx * ry - qpy * rx) / den;
  return a >= 0 && a <= 1 && b >= 0 && b <= 1 ? { a, b } : null;
}

/**
 * The first place stroke e crosses one of the strokes `kept` of the same
 * signature, else the point of those strokes nearest e's start: which kept
 * stroke, and the share of its length there.
 * @param {RawPoint[]} e @param {RawPoint[][]} sig @param {number[]} kept
 */
function attachPoint(e, sig, kept) {
  for (let i = 0; i + 1 < e.length; i++) {
    const [p1, p2] = [[e[i].x, e[i].y], [e[i + 1].x, e[i + 1].y]];
    for (const k of kept) {
      const s = sig[k];
      const cum = cumulativeLength(s.map((p) => p.x), s.map((p) => p.y));
      for (let j = 0; j + 1 < s.length; j++) {
        const hit = segmentIntersection(p1, p2, [s[j].x, s[j].y], [s[j + 1].x, s[j + 1].y]);
        if (hit) return { stroke: k, share: (cum[j] + hit.b * (cum[j + 1] - cum[j])) / (cum[cum.length - 1] || 1) };
      }
    }
  }
  let best = { stroke: kept[0], share: 0, d: Infinity };
  for (const k of kept) {
    const s = sig[k];
    const cum = cumulativeLength(s.map((p) => p.x), s.map((p) => p.y));
    s.forEach((p, j) => {
      const d = Math.hypot(p.x - e[0].x, p.y - e[0].y);
      if (d < best.d) best = { stroke: k, share: cum[j] / (cum[cum.length - 1] || 1), d };
    });
  }
  return { stroke: best.stroke, share: best.share };
}

/** The point at a share of a stroke's length. @param {RawPoint[]} s @param {number} share @returns {[number, number]} */
function pointAt(s, share) {
  if (s.length === 1) return [s[0].x, s[0].y];
  const r = resampleStroke(s.map((p) => p.x), s.map((p) => p.y), 1001);
  const i = Math.round(share * 1000);
  return [r.x[i], r.y[i]];
}

/**
 * Pairs the strokes of two signatures (see the header).
 * @param {RawPoint[][]} a @param {RawPoint[][]} b
 * @returns {Pair[]}
 */
export function pairStrokes(a, b) {
  if (a.length === b.length) return a.map((_, i) => ({ a: { stroke: i }, b: { stroke: i } }));
  const swap = a.length < b.length;
  const [big, small] = swap ? [b, a] : [a, b];
  // the small.length strokes with the most samples (order(nb1, decreasing = TRUE)), in drawing order
  const kept = big.map((s, i) => [s.length, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]).slice(0, small.length).map((e) => e[1]).sort((x, y) => x - y);
  /** @type {{ big: Side, small: Side, at: number }[]} */
  const pairs = kept.map((k, j) => ({ big: { stroke: k }, small: { stroke: j }, at: k }));
  big.forEach((e, i) => {
    if (kept.includes(i)) return;
    const hit = attachPoint(e, big, kept);
    pairs.push({ big: { stroke: i }, small: { anchor: pointAt(small[kept.indexOf(hit.stroke)], hit.share) }, at: i });
  });
  pairs.sort((x, y) => x.at - y.at);
  return pairs.map((p) => (swap ? { a: p.small, b: p.big } : { a: p.big, b: p.small }));
}

/** @param {number[]} v @param {number} p */
const lerp = (v, p) => (1 - p) * v[0] + p * v[1];

/**
 * The script's coefficient interpolation for one coordinate of one pair: series
 * of n points each, thresholds multipliers × sd(d1), frames at props.
 * @param {ArrayLike<number>} va @param {ArrayLike<number>} vb @param {number[]} multipliers
 * @param {number[]} props weight of b @param {number} loop @param {import('../../shared/wavelet.js').Filter} filter
 * @returns {Float64Array[]}
 */
export function waveletInterpolate(va, vb, multipliers, props, loop, filter = 'mb4') {
  const n = va.length;
  const J = strokeLevels(n, 'auto');
  const shrink = (/** @type {ArrayLike<number>} */ v, /** @type {number} */ k) => {
    const w = modwt(v, filter, J, 'reflection');
    const thr = multipliers[k] * waveletNoise(w.d[0], 'sd');
    return { ...w, d: w.d.map((dj) => dj.map((c) => (Math.abs(c) > thr ? Math.sign(c) * (Math.abs(c) - thr) : 0))) };
  };
  const [wa, wb] = [shrink(va, 0), shrink(vb, 1)];
  return props.map((p) => {
    const swell = 1 + loop * 4 * p * (1 - p);
    return imodwt({
      ...wa,
      d: wa.d.map((da, j) => da.map((c, t) => swell * lerp([c, wb.d[j][t]], p))),
      s: wa.s.map((c, t) => lerp([c, wb.s[t]], p)),
    });
  });
}

/**
 * Morph frames between two signatures.
 * @param {RawPoint[][]} rawA @param {RawPoint[][]} rawB
 * @param {import('./request.js').MorphOptions} m
 * @param {{ step: (sig: RawPoint[][]) => number,
 *   smooth: (x: Float64Array, y: Float64Array, sig: 'a' | 'b', stroke: number, s: Float64Array) => { x: Float64Array, y: Float64Array },
 *   edit?: (strokes: {x:Float64Array,y:Float64Array,s:Float64Array}[], widths:Float64Array[], normalized:RawPoint[][], original:RawPoint[][])=>void,
 *   widths: (strokes: { x: Float64Array, y: Float64Array, s: Float64Array, raw: RawPoint[] }[], sig: RawPoint[][]) => Float64Array[] }} pipeline
 *   the correction pipeline's resampling step, smoothing and widths
 */
export function morphFrames(rawA, rawB, m, pipeline) {
  const [selA, selB] = m.strokes === 'first' ? [[rawA[0]], [rawB[0]]] : [rawA, rawB];
  const [a, b] = normalizePair(selA, selB);
  const pairs = pairStrokes(a, b);
  const step = Math.min(pipeline.step(a), pipeline.step(b));
  const len = (/** @type {RawPoint[]} */ s) => {
    const c = cumulativeLength(s.map((p) => p.x), s.map((p) => p.y));
    return c[c.length - 1];
  };
  /** @param {Side} side @param {RawPoint[][]} sig */
  const count = (side, sig) => ('stroke' in side ? (m.strokes === 'first' ? sig[side.stroke].length : Math.round(len(sig[side.stroke]) / step) + 1) : 0);
  const sides = pairs.map((pair) => {
    const n = Math.max(2, count(pair.a, a), count(pair.b, b));
    const one = (/** @type {Side} */ side, /** @type {RawPoint[][]} */ sig) => {
      if (!('stroke' in side)) {
        return { x: new Float64Array(n).fill(side.anchor[0]), y: new Float64Array(n).fill(side.anchor[1]), s: new Float64Array(n), raw: null, count: 1 };
      }
      const s = sig[side.stroke];
      const r = resampleStroke(s.map((p) => p.x), s.map((p) => p.y), n);
      return { ...r, raw: s, count: s.length };
    };
    return { n, a: one(pair.a, a), b: one(pair.b, b), pair };
  });
  // smoothed end points, per method
  const ends = sides.map((sd) => {
    if (m.method === 'wavelet') return null;
    const sm = (/** @type {typeof sd.a} */ e, /** @type {'a' | 'b'} */ which, /** @type {Side} */ side) => {
      if (!e.raw) return { x: e.x, y: e.y };
      if (m.method === 'linear') return { x: fourierSmoothSeries(e.x, 1), y: fourierSmoothSeries(e.y, 1) };
      return pipeline.smooth(e.x, e.y, which, /** @type {{ stroke: number }} */ (side).stroke, e.s);
    };
    return { a: sm(sd.a, 'a', sd.pair.a), b: sm(sd.b, 'b', sd.pair.b) };
  });
  const coords = sides.map((sd, i) => {
    if (m.method !== 'wavelet') {
      const e = /** @type {NonNullable<typeof ends[number]>} */ (ends[i]);
      return { x: m.props.map((p) => e.a.x.map((v, t) => lerp([v, e.b.x[t]], p))), y: m.props.map((p) => e.a.y.map((v, t) => lerp([v, e.b.y[t]], p))) };
    }
    const most = Math.max(sd.a.count, sd.b.count);
    const mult = [m.noiseMultiplier / (sd.a.count / most), m.noiseMultiplier / (sd.b.count / most)];
    return { x: waveletInterpolate(sd.a.x, sd.b.x, mult, m.props, m.loop), y: waveletInterpolate(sd.a.y, sd.b.y, mult, m.props, m.loop) };
  });
  // widths at each end, from that end's own geometry and width model
  const endWidths = (/** @type {'a' | 'b'} */ which, /** @type {RawPoint[][]} */ sig) => {
    const geometry = sides.map((sd, i) => {
      const e = sd[which];
      if (!e.raw) return null;
      const ex = m.method === 'wavelet' ? waveletEnd(sd, which) : /** @type {NonNullable<typeof ends[number]>} */ (ends[i])[which];
      return { x: ex.x, y: ex.y, s: e.s, raw: e.raw };
    });
    const real = /** @type {{ x: Float64Array, y: Float64Array, s: Float64Array, raw: RawPoint[] }[]} */ (geometry.filter(Boolean));
    const w = pipeline.widths(real, sig);
    let k = 0;
    return geometry.map((g, i) => (g ? w[k++] : new Float64Array(sides[i].n)));
  };
  /** The wavelet method's smoothed end itself: the frame at p = 0 or 1 without swelling. @param {typeof sides[number]} sd @param {'a' | 'b'} which */
  const waveletEnd = (sd, which) => {
    const most = Math.max(sd.a.count, sd.b.count);
    const mult = [m.noiseMultiplier / (sd.a.count / most), m.noiseMultiplier / (sd.b.count / most)];
    const p = which === 'a' ? 0 : 1;
    return { x: waveletInterpolate(sd.a.x, sd.b.x, mult, [p], 0)[0], y: waveletInterpolate(sd.a.y, sd.b.y, mult, [p], 0)[0] };
  };
  const wa = endWidths('a', a);
  const wb = endWidths('b', b);
  // Optional source edits are applied to the selected method's actual endpoint.
  // Their displacement fades to zero at the target, preserving its endpoint and
  // the existing wavelet/linear/corrected interpolation in the absence of edits.
  if (pipeline.edit) {
    const source = a.map((raw, stroke) => {
      const i = sides.findIndex(sd => 'stroke' in sd.pair.a && sd.pair.a.stroke === stroke);
      const endpoint = m.method === 'wavelet' ? waveletEnd(sides[i], 'a') : ends[i].a;
      return {x:endpoint.x.slice(),y:endpoint.y.slice(),s:sides[i].a.s};
    });
    const before = source.map(st => ({x:st.x.slice(),y:st.y.slice()}));
    const widths = a.map((_,stroke)=>wa[sides.findIndex(sd=>'stroke' in sd.pair.a && sd.pair.a.stroke===stroke)]);
    pipeline.edit(source, widths, a, selA);
    sides.forEach((sd,i)=> {
      if (!('stroke' in sd.pair.a)) return;
      const k=sd.pair.a.stroke;
      m.props.forEach((p,f)=> {for(let t=0;t<sd.n;t++) {
        coords[i].x[f][t]+=(source[k].x[t]-before[k].x[t])*(1-p);
        coords[i].y[f][t]+=(source[k].y[t]-before[k].y[t])*(1-p);
      }});
    });
  }
  return m.props.map((p, f) => ({
    p,
    strokes: coords.map((c, i) => ({
      points: Array.from(c.x[f], (x, t) => [x, c.y[f][t], lerp([wa[i][t], wb[i][t]], p)]),
    })),
  }));
}
