// Braid mode: R's braid_segment (braided_lines.R, 2025) in true units with y up. k strands
// of equal width share the braid's width; strand i's centre swings across it as
// sin(2π f t + φi), φi = 2π i / k, and its depth is cos of the same angle. The braid
// is cut across at R's smoothness grid and wherever two strands swap depth, so the
// depth order is constant between cuts; there each strand is a quadrilateral, painted
// back to front. Here the painting is resolved into each strand's visible region, and
// each strand's visible centreline for line drawings. R lets each quadrilateral reach
// 0.1% into the next cut to hide the seams between them; merged regions have none.

import { difference, union } from '../../shared/polygon.js';
import { seqLength } from '../../shared/rstats.js';

/**
 * @typedef {import('../../shared/polygon.js').Polygon} Polygon
 * @typedef {import('./request.js').BraidSettings} BraidSettings
 * @typedef {import('./draw.js').Drawing} Drawing
 */

/**
 * The braid's frame and cuts, computed as braid_segment does with x0 = y0 = 0 and the end
 * `length` away at `rotation` degrees clockwise from the +x axis.
 * @param {BraidSettings} b
 */
export function braidFrame(b) {
  const n = b.colors.length;
  const r = b.rotation / 180 * Math.PI;
  const x1 = b.length * Math.cos(r);
  const y1 = -b.length * Math.sin(r);
  const L = Math.sqrt(x1 * x1 + y1 * y1);
  const U = [x1 / L, y1 / L];
  const pl = Math.sqrt(y1 * y1 + x1 * x1);
  const P = [-y1 / pl, x1 / pl]; // unit normal to the left of travel
  const W = [b.width * P[0], b.width * P[1]];
  const edge = [W[0] / n / 2, W[1] / n / 2];
  const ampScalar = n <= 1 ? 0 : (n - 1) / (2 * n);
  const amp = [ampScalar * W[0], ampScalar * W[1]];
  const phases = Array.from({ length: n }, (_, i) => i / n * 2 * Math.PI);
  const f = b.twists / L;
  // depth swaps: cos(A) = cos(B) where A + B = 2πk
  /** @type {number[]} */
  const swaps = [];
  if (n > 1 && b.twists !== 0) {
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const sum = phases[i] + phases[j];
        const kFrom = Math.floor(sum / (2 * Math.PI));
        const kTo = Math.ceil((4 * Math.PI * f * L + sum) / (2 * Math.PI));
        const step = kTo >= kFrom ? 1 : -1; // R's `:` counts down for a negative twist
        for (let k = kFrom; step > 0 ? k <= kTo : k >= kTo; k += step) {
          const t = (2 * Math.PI * k - sum) / (4 * Math.PI * f);
          if (t > 1e-6 && t < L - 1e-6) swaps.push(t);
        }
      }
    }
  }
  const breaks = [...new Set([...seqLength(0, L, b.minSegments + 1), ...swaps, 0, L])].sort((p, q) => p - q);
  const angle = (/** @type {number} */ t, /** @type {number} */ i) => 2 * Math.PI * f * t + phases[i];
  /** Strand i's centre at t. @param {number} t @param {number} i */
  const centre = (t, i) => {
    const s = Math.sin(angle(t, i));
    return [t * U[0] + s * amp[0], t * U[1] + s * amp[1]];
  };
  /** Strands back to front at t (a stable sort, as R's order()). @param {number} t */
  const depthOrder = (t) => phases.map((_, i) => i).sort((p, q) => Math.cos(angle(t, p)) - Math.cos(angle(t, q)));
  return { n, L, U, P, edge, amp, phases, f, breaks, angle, centre, depthOrder, ampScalar };
}

/** @param {number[]} c0 @param {number[]} c1 @param {number[]} e @returns {number[]} */
const quad = (c0, c1, e) => [c0[0] - e[0], c0[1] - e[1], c1[0] - e[0], c1[1] - e[1], c1[0] + e[0], c1[1] + e[1],
  c0[0] + e[0], c0[1] + e[1], c0[0] - e[0], c0[1] - e[1]];

/**
 * The braid as a drawing: each strand's visible region, its visible centreline, and the
 * geometry (centrelines at the cuts, depth order between cuts, and the crossings).
 * @param {BraidSettings} b
 * @returns {Drawing}
 */
export function braidDrawing(b) {
  const fr = braidFrame(b);
  const { n, breaks, centre, edge } = fr;
  const half = Math.hypot(edge[0], edge[1]); // half a strand's width
  const pts = breaks.map((t) => Array.from({ length: n }, (_, i) => centre(t, i)));
  // offsets across the braid, for the line drawing
  const across = breaks.map((t) => Array.from({ length: n }, (_, i) => Math.sin(fr.angle(t, i)) * fr.ampScalar * b.width));
  // strand i's quadrilaterals, and those of the strands in front of it in each cut
  /** @type {number[][][]} */
  const own = Array.from({ length: n }, () => []);
  /** @type {number[][][]} */
  const covers = Array.from({ length: n }, () => []);
  /** @type {number[][][]} */
  const lines = Array.from({ length: n }, () => []);
  /** @type {(number[] | null)[]} */
  const open = Array(n).fill(null); // the line each strand is drawing, if visible at the last cut
  /** @type {{ from: number, to: number, order: number[] }[]} */
  const layers = [];
  for (let s = 0; s + 1 < breaks.length; s++) {
    const order = fr.depthOrder((breaks[s] + breaks[s + 1]) / 2);
    layers.push({ from: breaks[s], to: breaks[s + 1], order });
    const quads = Array.from({ length: n }, (_, i) => quad(pts[s][i], pts[s + 1][i], edge));
    order.forEach((i, depth) => {
      own[i].push(quads[i]);
      for (const j of order.slice(depth + 1)) covers[i].push(quads[j]);
      // where along this cut strand i's centre is not under a strand in front of it
      /** @type {number[][]} */
      const hidden = [];
      for (const j of order.slice(depth + 1)) {
        const span = coveredSpan(across[s][i] - across[s][j], across[s + 1][i] - across[s + 1][j], half);
        if (span) hidden.push(span);
      }
      const shown = uncovered(hidden);
      for (const [u0, u1] of shown) {
        const lerp = (/** @type {number} */ u) => [pts[s][i][0] + u * (pts[s + 1][i][0] - pts[s][i][0]), pts[s][i][1] + u * (pts[s + 1][i][1] - pts[s][i][1])];
        let line = u0 === 0 ? open[i] : null;
        if (!line) {
          line = lerp(u0);
          lines[i].push(line);
        }
        line.push(...lerp(u1));
        open[i] = line;
      }
      if (shown.at(-1)?.[1] !== 1) open[i] = null;
    });
  }
  // A quadrilateral lies within its cut, so the strands in front of strand i in each cut,
  // taken together, cover exactly what the painting hides of it: one difference per strand.
  // Clipper can leave the result in pieces that share an edge on a cut; a union joins them.
  const regions = own.map((q, i) => union(covers[i].length ? difference(q, 'nonzero', covers[i], 'nonzero').flat() : q, 'nonzero'));
  const ids = b.colors.map((_, i) => `strand-${i + 1}`);
  return {
    fills: regions.map((polys, i) => ({ id: ids[i], label: `Strand ${i + 1}`, color: b.colors[i], shapes: [polys] })),
    lines: lines.map((ls, i) => ({ id: ids[i], label: `Strand ${i + 1}`, color: b.colors[i], lines: ls.filter((l) => l.length >= 4) })),
    strokeWidth: b.width / n / 2,
    flatten: false,
    geometry: (/** @type {(x: number, y: number) => number[]} */ at) => ({
      strandWidth: b.width / n,
      breaks,
      strands: b.colors.map((color, i) => ({ color, phase: fr.phases[i], centerline: pts.map((p) => at(p[i][0], p[i][1])) })),
      layers,
      crossings: crossings(fr, b).map((c) => ({ ...c, point: at(c.point[0], c.point[1]) })),
    }),
  };
}

/**
 * The share [u0, u1] of a cut over which |d0 + u (d1 - d0)| < h, or null.
 * @param {number} d0 @param {number} d1 @param {number} h
 */
function coveredSpan(d0, d1, h) {
  const slope = d1 - d0;
  if (slope === 0) return Math.abs(d0) < h ? [0, 1] : null;
  const a = (-h - d0) / slope;
  const c = (h - d0) / slope;
  const u0 = Math.max(0, Math.min(a, c));
  const u1 = Math.min(1, Math.max(a, c));
  return u1 > u0 ? [u0, u1] : null;
}

/** The parts of [0, 1] outside the given spans. @param {number[][]} spans */
function uncovered(spans) {
  const sorted = spans.slice().sort((p, q) => p[0] - q[0]);
  /** @type {number[][]} */
  const out = [];
  let at = 0;
  for (const [u0, u1] of sorted) {
    if (u0 > at) out.push([at, u0]);
    at = Math.max(at, u1);
  }
  if (at < 1) out.push([at, 1]);
  return out;
}

/**
 * Where two strands' centres meet (sin A = sin B, so A + B = (2m + 1)π), which of the
 * two is in front there (the larger cos), and the point.
 * @param {ReturnType<typeof braidFrame>} fr @param {BraidSettings} b
 */
function crossings(fr, b) {
  /** @type {{ at: number, over: number, under: number, point: number[] }[]} */
  const out = [];
  if (fr.n < 2 || b.twists === 0) return out;
  for (let i = 0; i < fr.n - 1; i++) {
    for (let j = i + 1; j < fr.n; j++) {
      const sum = fr.phases[i] + fr.phases[j];
      const scale = 4 * Math.PI * fr.f;
      const m0 = Math.ceil(((scale > 0 ? 0 : scale * fr.L) + sum) / (2 * Math.PI) - 0.5);
      const m1 = Math.floor(((scale > 0 ? scale * fr.L : 0) + sum) / (2 * Math.PI) - 0.5);
      for (let m = m0; m <= m1; m++) {
        const t = ((2 * m + 1) * Math.PI - sum) / scale;
        if (t <= 0 || t >= fr.L) continue;
        const front = Math.cos(fr.angle(t, i)) > Math.cos(fr.angle(t, j));
        out.push({ at: t, over: front ? i : j, under: front ? j : i, point: fr.centre(t, i) });
      }
    }
  }
  return out.sort((p, q) => p.at - q.at);
}
