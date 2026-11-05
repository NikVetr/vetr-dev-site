// The DNA double helix (R's draw_DNA and polylines in polylines_vendored.R,
// geometry only): two sine strands with a straight extension, base pairs
// between them, each piece a variable-width ribbon, merged into one filled
// outline. Only the arguments the name tags use are supported.

import { polygonArea, union } from './geometry.js';
import { cumsum, seqBy, seqLength } from './rmath.js';

/**
 * @typedef {import('./geometry.js').Polygon} Polygon
 * @typedef {{ x: number[], y: number[], lwd: number[] }} Piece
 */

const range = (/** @type {number[]} */ v) => [Math.min(...v), Math.max(...v)];

/** rescale01: (x - min) / range, or zeros for constant input. @param {number[]} x */
function rescale01(x) {
  const [lo, hi] = range(x);
  const r = hi - lo;
  return r === 0 ? x.map(() => 0) : x.map((v) => (v - lo) / r);
}

/** Index of the first minimum (which.min), 0-based. @param {number[]} v */
function whichMin(v) {
  let k = 0;
  for (let i = 1; i < v.length; i++) if (v[i] < v[k]) k = i;
  return k;
}

/** Runs of consecutive indices where `flag` holds (split(which(f), cumsum(!f)[f])). @param {boolean[]} flag */
function runsOf(flag) {
  /** @type {number[][]} */
  const runs = [];
  let cur = null;
  for (let i = 0; i < flag.length; i++) {
    if (flag[i]) {
      if (!cur) runs.push((cur = []));
      cur.push(i);
    } else cur = null;
  }
  return runs;
}

/**
 * polylines(x, y, lwd, complex = TRUE, draw = FALSE): the outline of a
 * variable-width line as one (possibly self-intersecting) closed ring.
 * `xyr` is the plot's x/y aspect correction (1 in true units).
 * @param {number[]} x0 @param {number[]} y0 @param {number[]} lwd @param {number} xyr
 * @returns {number[]} closed ring
 */
export function ribbon(x0, y0, lwd, xyr) {
  const eps = 1e-9;
  const nudge = (/** @type {number[]} */ v) => {
    const d = v.slice(1).map((vi, i) => vi - v[i]).map((di) => (di === 0 ? eps : di));
    const nz = d.map(Math.abs).filter((a) => a !== 0);
    const f = Math.min(...nz) / 1e3;
    return cumsum([v[0], ...d.map((di) => di + f)]);
  };
  const x = nudge(x0);
  const y = nudge(y0);
  const n = x.length;
  const m = x.slice(1).map((xi, i) => (y[i + 1] - y[i]) / (xi - x[i]));
  m.push(m[m.length - 1]);
  const mvi = m.map((mi) => -1 / (mi * (xyr * xyr)));
  const lens = x.map((_, i) => {
    const dy = (y[i] + lwd[i] / 2 * mvi[i]) - (y[i] - lwd[i] / 2 * mvi[i]);
    const dx = (x[i] + lwd[i] / 2) - (x[i] - lwd[i] / 2);
    return Math.sqrt(dy * dy * (xyr * xyr) + dx * dx);
  });
  const smallest = Math.min(...lens.filter((l) => l > 0));
  const lwds = lwd.map((w, i) => w * w / (lens[i] + smallest / 1e3));
  const sign = (/** @type {number[]} */ v) => {
    const s = v.slice(1).map((vi, i) => Math.sign(vi - v[i]));
    return [s[0], ...s];
  };
  const dxi = sign(x);
  const dyi = sign(y);
  /** @type {number[]} */
  const left = [];
  /** @type {number[]} */
  const right = [];
  for (let i = 0; i < n; i++) {
    const h = lwds[i] / 2;
    left.push(x[i] + h * -dyi[i], y[i] + h * Math.abs(mvi[i]) * dxi[i]);
    right.push(x[i] - h * -dyi[i], y[i] - h * Math.abs(mvi[i]) * dxi[i]);
  }
  const ring = left.slice();
  for (let i = n - 1; i >= 0; i--) ring.push(right[2 * i], right[2 * i + 1]);
  ring.push(left[0], left[1]);
  return ring;
}

/**
 * draw_DNA with rot = 90, amplitude 1 and the R defaults otherwise.
 * @param {{ dhBounds: number[], strandThickness: number, extendStraight: 1 | 2, extendStraightBy: number,
 *   topleft: number[], forcedBox?: number[] | null, boxDNA: boolean, extensionRealUnits: boolean,
 *   propDist: number, gaps?: number[][] | null, xyr: number }} o
 * @returns {{ s1: Piece[], s2: Piece[], bp: Piece[], pieces: Piece[] }}
 */
export function dnaShape(o) {
  const nStrand = 1000;
  const phaseShift = Math.PI;
  const bpInterval = Math.PI / 6;
  const chiralityProp = 0.4;
  const psw = 0.2; // prop_square_wave
  const t = seqLength(o.dhBounds[0], o.dhBounds[1], nStrand);
  const y1 = t.slice();
  const y2 = t.slice();
  const x1 = t.map((ti) => Math.sin(ti) * o.xyr);
  const x2 = t.map((ti) => Math.sin(ti + phaseShift) * o.xyr);
  const z1 = t.map((ti) => Math.sin(ti + Math.PI / 2));
  const z2 = t.map((ti) => Math.sin(ti + phaseShift + Math.PI / 2));

  // straight extension at the far end
  const straightY = seqBy(o.dhBounds[1], o.dhBounds[1] + o.extendStraightBy, (o.dhBounds[1] - o.dhBounds[0]) / nStrand);
  const ns = straightY.length;
  const last = nStrand - 1;
  const z1s = seqLength(z1[last], Math.min(...z1), ns);
  const z2s = seqLength(z2[last], Math.min(...z2), ns);
  for (let i = 0; i < ns; i++) {
    y1.push(o.extendStraight === 2 ? y1[last] : straightY[i]);
    y2.push(o.extendStraight === 1 ? y2[last] : straightY[i]);
    x1.push(x1[last]);
    x2.push(x2[last]);
    z1.push(z1s[i]);
    z2.push(z2s[i]);
  }
  const N = y1.length;
  const strind = Array.from({ length: ns }, (_, i) => nStrand + i);
  const bounds = range([...y1, ...y2]);

  // distort away from a perfect sine wave
  const square = (/** @type {number} */ v) => Math.abs(v) ** (1 - psw) * Math.sign(v) * psw + (1 - psw) * v;
  for (let i = 0; i < N; i++) {
    x1[i] = square(x1[i]);
    x2[i] = square(x2[i]);
  }
  const st = o.strandThickness;
  const lwd = (/** @type {number[]} */ z) => rescale01(z).map((r) => {
    const v = r * Math.sqrt(st);
    return v * v + st / 2;
  });
  const lwd1 = lwd(z1);
  const lwd2 = lwd(z2);
  let maxWidth = 0;
  for (let i = 0; i < N; i++) maxWidth = Math.max(maxWidth, Math.abs(x2[i] - x1[i]));
  const wsStrand = o.propDist * maxWidth;

  // base pairs
  const bpIdx = seqBy(bounds[0], bounds[1], bpInterval).map((pos) => whichMin(t.map((ti) => Math.abs(ti - pos))));
  const xlo = Math.min(...x1, ...x2);
  const xhi = Math.max(...x1, ...x2);
  let bp = bpIdx.map((k) => {
    const w = Math.max(Math.abs(x2[k] - x1[k]) - wsStrand, 0);
    const dir = x1[k] >= 0 ? -1 : 1;
    return { y0: y1[k], x0: x1[k], y1: y2[k], x1: Math.min(Math.max(x1[k] + w * dir, xlo), xhi), w, lwd0: lwd1[k], lwd1: lwd2[k] };
  }).filter((b) => b.w > 1e-6);

  // chirality: which strand is seen where they cross
  const seen = x1.map((v, i) => Math.abs(v - x2[i]) > chiralityProp);
  const onTop = x1.slice(1).map((v, i) => v - x1[i] > 0);
  onTop.unshift(onTop[0]);
  const seen1 = seen.map((s, i) => s || onTop[i]);
  const seen2 = seen.map((s, i) => s || !onTop[i]);

  // rotate by 90 degrees about the centre
  const r = 90 / 360 * 2 * Math.PI;
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const cx = (Math.min(...x1, ...x2) + Math.max(...x1, ...x2)) / 2;
  const cy = (bounds[0] + bounds[1]) / 2;
  const rot = (/** @type {number} */ x, /** @type {number} */ y) => [(x - cx) * cr + (y - cy) * sr, -(x - cx) * sr + (y - cy) * cr];
  for (let i = 0; i < N; i++) {
    [x1[i], y1[i]] = rot(x1[i], y1[i]);
    [x2[i], y2[i]] = rot(x2[i], y2[i]);
  }
  bp = bp.map((b) => {
    const [bx0, by0] = rot(b.x0, b.y0);
    const [bx1, by1] = rot(b.x1, b.y1);
    return { ...b, x0: bx0, y0: by0, x1: bx1, y1: by1 };
  });

  // shift to the origin, scale to the forced box, centre, then place by the top-left corner
  const mx = Math.min(...x1, ...x2);
  const my = Math.min(...y1, ...y2);
  /** @param {(x: number) => number} fx @param {(y: number) => number} fy */
  const apply = (fx, fy) => {
    for (let i = 0; i < N; i++) {
      x1[i] = fx(x1[i]); x2[i] = fx(x2[i]);
      y1[i] = fy(y1[i]); y2[i] = fy(y2[i]);
    }
    bp = bp.map((b) => ({ ...b, x0: fx(b.x0), x1: fx(b.x1), y0: fy(b.y0), y1: fy(b.y1) }));
  };
  apply((x) => x - mx, (y) => y - my);
  const rows = o.boxDNA ? nStrand : N;
  const maxX = Math.max(...x1.slice(0, rows), ...x2.slice(0, rows));
  const maxY = Math.max(...y1.slice(0, rows), ...y2.slice(0, rows));
  if (o.forcedBox) {
    const fx = o.forcedBox[0] / maxX;
    const fy = o.forcedBox[1] / maxY;
    apply((x) => x * fx, (y) => y * fy);
  }
  const ccx = (Math.min(...x1.slice(0, nStrand), ...x2.slice(0, nStrand)) + Math.max(...x1.slice(0, nStrand), ...x2.slice(0, nStrand))) / 2;
  const ccy = (Math.min(...y1.slice(0, nStrand), ...y2.slice(0, nStrand)) + Math.max(...y1.slice(0, nStrand), ...y2.slice(0, nStrand))) / 2;
  apply((x) => x - ccx, (y) => y - ccy);
  const tlx = Math.min(...x1, ...x2);
  const tly = Math.max(...y1, ...y2);
  apply((x) => x - tlx + o.topleft[0], (y) => y - tly + o.topleft[1]);

  // stretch the straight extension to a length in real units
  if (o.extensionRealUnits) {
    const xs = o.extendStraight === 1 ? x1 : x2;
    const ys = o.extendStraight === 1 ? y1 : y2;
    const ex = strind.map((i) => xs[i]);
    const ey = strind.map((i) => ys[i]);
    const ddx = ex[0] - ex[ns - 1];
    const ddy = ey[0] - ey[ns - 1];
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    const scale = len / o.extendStraightBy;
    const nx = cumsum([ex[0], ...ex.slice(1).map((v, i) => (v - ex[i]) / scale)]);
    const ny = cumsum([ey[0], ...ey.slice(1).map((v, i) => (v - ey[i]) / scale)]);
    strind.forEach((k, i) => { xs[k] = nx[i]; ys[k] = ny[i]; });
  }

  // visible strand pieces, cut at the gaps (x intervals)
  const gaps = o.gaps ?? null;
  /** @param {number[]} idx @param {number[]} xs */
  const splitAtGaps = (idx, xs) => {
    if (!gaps) return [idx];
    const keep = idx.filter((i) => !gaps.some(([a, b]) => xs[i] >= a && xs[i] <= b));
    /** @type {number[][]} */
    const runs = [];
    let prev = -2;
    for (const i of keep) {
      if (i !== prev + 1) runs.push([]);
      runs[runs.length - 1].push(i);
      prev = i;
    }
    return runs.filter((run) => run.length > 2);
  };
  const sets1 = runsOf(seen1);
  const sets2 = runsOf(seen2);
  const piece = (/** @type {number[]} */ ii, /** @type {number[]} */ xs, /** @type {number[]} */ ys, /** @type {number[]} */ ls) =>
    ({ x: ii.map((i) => xs[i]), y: ii.map((i) => ys[i]), lwd: ii.map((i) => ls[i]) });
  const strandPieces = [
    ...sets1.flatMap((ss) => splitAtGaps(ss, x1).map((ii) => piece(ii, x1, y1, lwd1))),
    ...sets2.flatMap((ss) => splitAtGaps(ss, x2).map((ii) => piece(ii, x2, y2, lwd2))),
  ];
  const nbp = nStrand / bp.length;
  const bpPieces = bp.map((b) => {
    const lw = seqLength(b.lwd0, b.lwd1 - (b.lwd1 - b.lwd0) * o.propDist, nbp);
    const [lo, hi] = range(lw);
    return { x: seqLength(b.x0, b.x1, nbp), y: seqLength(b.y0, b.y1, nbp), lwd: rescale01(lw).map((v) => v * v * (hi - lo) + lo) };
  });
  return {
    s1: sets1.map((ss) => piece(ss, x1, y1, lwd1)),
    s2: sets2.map((ss) => piece(ss, x2, y2, lwd2)),
    bp: bpPieces,
    pieces: [...strandPieces, ...bpPieces],
  };
}

/**
 * The helix as filled polygons: each piece's ribbon made valid (even-odd, as
 * GEOS's make-valid), all merged, slivers under 1e-12 square units dropped.
 * @param {Piece[]} pieces @param {number} xyr
 * @returns {Polygon[]}
 */
export function helixOutline(pieces, xyr) {
  const valid = pieces.flatMap((p) => union([ribbon(p.x, p.y, p.lwd, xyr)], 'evenodd'));
  return union(valid.flat(), 'nonzero').filter((poly) => polygonArea(poly) > 1e-12);
}


/**
 * find_gaps: x ranges of the runs of consecutive points lying below `y`,
 * widened by `widen` on each side.
 * @param {number[]} xs @param {number[]} ys @param {number} y @param {number} widen
 */
export function findGaps(xs, ys, y, widen) {
  /** @type {number[][]} */
  const gaps = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= ys.length; i++) {
    if (i < ys.length && ys[i] < y) {
      lo = Math.min(lo, xs[i]);
      hi = Math.max(hi, xs[i]);
    } else if (lo <= hi) {
      gaps.push([lo - widen, hi + widen]);
      lo = Infinity;
      hi = -Infinity;
    }
  }
  return gaps;
}

/**
 * draw_dna_decoration: the helix of a laid-out tag, left of the bottom line,
 * its straight end underlining that line with gaps where the line's
 * descenders cross it. In the tag's frame shifted by `adj` inches.
 * @param {import('./layout.js').Tag} tag @param {number[]} adj
 */
export function tagHelix(tag, adj) {
  const dec = /** @type {import('./layout.js').DnaDecoration} */ (tag.decoration);
  const bottom = dec.bbox[1] + adj[1];
  const xs = [];
  const ys = [];
  for (const glyph of tag.lines[1].glyphs) {
    for (const ring of glyph) {
      for (let k = 0; k < ring.length; k += 2) {
        xs.push(ring[k] + adj[0]);
        ys.push(ring[k + 1] + adj[1]);
      }
    }
  }
  const gaps = ys.some((y) => y < bottom) ? findGaps(xs, ys, bottom, 0.02) : null;
  const shape = dnaShape({
    dhBounds: dec.dh_bounds, strandThickness: dec.box_dim[1] * 0.08, extendStraight: dec.extend_straight,
    extendStraightBy: dec.extend_straight_by, topleft: [dec.topleft[0] + adj[0], dec.topleft[1] + adj[1]], forcedBox: dec.box_dim,
    boxDNA: true, extensionRealUnits: true, propDist: dec.prop_dist, gaps, xyr: 1,
  });
  return { polygons: helixOutline(shape.pieces, 1), gaps };
}
