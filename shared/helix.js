// The DNA double helix of Nik Vetr's R draw_DNA and polylines (polylines/R/functions.R,
// vendored in the name-tag drawer), as geometry: two sine strands, optionally run on
// straight past one end, base pairs between them, and each visible piece as a
// variable-width line. name-tags draws its tags' helices with it and the helix
// generator (helix/) its helices; R plots the pieces, these return them.

import { cumsum, seqBy, seqLength } from './rstats.js';

/**
 * @typedef {{ x: number[], y: number[], lwd: number[] }} Piece
 * @typedef {{
 *   dhBounds: number[], strandThickness: number, points?: number, amplitude?: number, phaseShift?: number,
 *   frequency?: number, bpInterval?: number, propDist: number, alternateSides?: boolean,
 *   partialDisplacement?: boolean, chiralityProp?: number, squareWave?: number, bpThickness?: number,
 *   extendStraight: 'n' | 'b' | 1 | 2, extendStraightBy: number, extensionTaper?: boolean, rot?: number,
 *   boxDim?: number[] | null, forcedBox?: number[] | null, boxDNA: boolean, topleft?: number[] | null,
 *   extensionRealUnits?: boolean, gaps?: number[][] | null, xyr: number,
 * }} DnaOptions
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
 * variable-width line as one (possibly self-intersecting) closed ring, `lwd`
 * wide across the line at each point. `xyr` is the plot's x/y aspect
 * correction (1 in true units).
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
 * draw_DNA's geometry, with R's argument defaults where an option is left out:
 * the strands' visible pieces (s1, s2), the base pairs (bp, with bpIndex the
 * strand point each starts from) and all pieces in R's drawing order.
 *
 * Two departures from R, neither of which changes a helix whose strands are half
 * a turn apart (R's phase_shift = pi, which name-tags uses): a base pair runs from
 * strand 1 towards strand 2 rather than towards the axis, and `extensionTaper`
 * chooses between the straight extension keeping the strand's end width (draw_DNA.R,
 * 2024) and narrowing to its thinnest (polylines since 2025).
 * @param {DnaOptions} o
 * @returns {{ s1: Piece[], s2: Piece[], bp: Piece[], bpIndex: number[], pieces: Piece[] }}
 */
export function dnaShape(o) {
  const nStrand = o.points ?? 1000;
  const amplitude = o.amplitude ?? 1;
  const phaseShift = o.phaseShift ?? Math.PI;
  const frequency = o.frequency ?? 1;
  const bpInterval = o.bpInterval ?? Math.PI / 6;
  const chiralityProp = o.chiralityProp ?? 0.4;
  const psw = o.squareWave ?? 0.2; // prop_square_wave
  const bpThickness = o.bpThickness ?? 1;
  const t = seqLength(o.dhBounds[0], o.dhBounds[1], nStrand);
  const y1 = t.slice();
  const y2 = t.slice();
  const x1 = t.map((ti) => amplitude * Math.sin(frequency * ti) * o.xyr);
  const x2 = t.map((ti) => amplitude * Math.sin(frequency * ti + phaseShift) * o.xyr);
  const z1 = t.map((ti) => amplitude * Math.sin(frequency * ti + Math.PI / 2));
  const z2 = t.map((ti) => amplitude * Math.sin(frequency * ti + phaseShift + Math.PI / 2));

  // straight extension at the far end: strand 1, strand 2 or both ('b'), or none ('n')
  const ext = o.extendStraight;
  const straightY = seqBy(o.dhBounds[1], o.dhBounds[1] + o.extendStraightBy, (o.dhBounds[1] - o.dhBounds[0]) / nStrand);
  const ns = ext === 'n' ? 0 : straightY.length;
  const last = nStrand - 1;
  const taper = o.extensionTaper ?? true;
  const z1s = taper ? seqLength(z1[last], Math.min(...z1), ns) : new Array(ns).fill(z1[last]);
  const z2s = taper ? seqLength(z2[last], Math.min(...z2), ns) : new Array(ns).fill(z2[last]);
  for (let i = 0; i < ns; i++) {
    y1.push(ext === 2 ? y1[last] : straightY[i]);
    y2.push(ext === 1 ? y2[last] : straightY[i]);
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

  // base pairs, from strand 1 towards strand 2, stopping wsStrand short of it; with
  // alternateSides every second one is moved wsStrand (or half that) towards strand 2
  const along = ext === 'b' || ext === 'n' ? y1 : t;
  const bpIdx = seqBy(bounds[0], bounds[1], bpInterval).map((pos) => whichMin(along.map((ti) => Math.abs(ti - pos))));
  const xlo = Math.min(...x1, ...x2);
  const xhi = Math.max(...x1, ...x2);
  const shift = (o.partialDisplacement ?? true) ? 2 : 1;
  let bp = bpIdx.map((k, j) => {
    const w = Math.max(Math.abs(x2[k] - x1[k]) - wsStrand, 0);
    const dir = x2[k] > x1[k] ? 1 : -1;
    let bx0 = x1[k];
    let bx1 = Math.min(Math.max(x1[k] + w * dir, xlo), xhi);
    if (o.alternateSides) {
      const d = (wsStrand * (dir === 1 ? 1 : 0) - wsStrand * (dir === -1 ? 1 : 0)) * (j % 2) / shift;
      bx0 += d;
      bx1 += d;
    }
    return { k, y0: y1[k], x0: bx0, y1: y2[k], x1: bx1, w, lwd0: lwd1[k], lwd1: lwd2[k] };
  }).filter((b) => b.w > 1e-6);

  // chirality: which strand is seen where they cross
  const seen = x1.map((v, i) => Math.abs(v - x2[i]) > chiralityProp);
  const onTop = x1.slice(1).map((v, i) => v - x1[i] > 0);
  onTop.unshift(onTop[0]);
  const seen1 = seen.map((s, i) => s || onTop[i]);
  const seen2 = seen.map((s, i) => s || !onTop[i]);

  // rotate clockwise by rot degrees about the centre
  const r = (o.rot ?? 0) / 360 * 2 * Math.PI;
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

  // shift to the origin, scale into the box (keeping or forcing the aspect ratio),
  // centre the helix without its extension on the origin, or place its top-left corner
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
  if (o.boxDim) {
    const f = Math.min(o.boxDim[0] / maxX, o.boxDim[1] / maxY);
    apply((x) => x * f, (y) => y * f);
  }
  if (o.forcedBox) {
    const fx = o.forcedBox[0] / maxX;
    const fy = o.forcedBox[1] / maxY;
    apply((x) => x * fx, (y) => y * fy);
  }
  const ccx = (Math.min(...x1.slice(0, nStrand), ...x2.slice(0, nStrand)) + Math.max(...x1.slice(0, nStrand), ...x2.slice(0, nStrand))) / 2;
  const ccy = (Math.min(...y1.slice(0, nStrand), ...y2.slice(0, nStrand)) + Math.max(...y1.slice(0, nStrand), ...y2.slice(0, nStrand))) / 2;
  apply((x) => x - ccx, (y) => y - ccy);
  if (o.topleft) {
    const [tx, ty] = o.topleft;
    const tlx = Math.min(...x1, ...x2);
    const tly = Math.max(...y1, ...y2);
    apply((x) => x - tlx + tx, (y) => y - tly + ty);
  }

  // stretch strand 1's or 2's straight extension to extendStraightBy in real units
  if (o.extensionRealUnits && ns > 0 && ext !== 'b') {
    const xs = ext === 1 ? x1 : x2;
    const ys = ext === 1 ? y1 : y2;
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
    return { x: seqLength(b.x0, b.x1, nbp), y: seqLength(b.y0, b.y1, nbp), lwd: rescale01(lw).map((v) => (v * v * (hi - lo) + lo) * bpThickness) };
  });
  return {
    s1: sets1.map((ss) => piece(ss, x1, y1, lwd1)),
    s2: sets2.map((ss) => piece(ss, x2, y2, lwd2)),
    bp: bpPieces,
    bpIndex: bp.map((b) => b.k),
    pieces: [...strandPieces, ...bpPieces],
  };
}
