// Helix mode: draw_DNA (draw_DNA.R, 2024) on the shared helix geometry, as a drawing in
// true units with y up. Strand 1's visible pieces are painted first, then strand 2's,
// then the base pairs, as R plots them; each piece is the filled outline of a
// variable-width line (R's polylines), made simple under R's nonzero fill.

import { dnaShape, ribbon } from '../../shared/helix.js';
import { offset, union } from '../../shared/polygon.js';

/**
 * @typedef {import('../../shared/polygon.js').Polygon} Polygon
 * @typedef {import('./request.js').HelixSettings} HelixSettings
 * @typedef {import('./draw.js').Drawing} Drawing
 */

const EXTEND = /** @type {const} */ ({ none: 'n', strand1: 1, strand2: 2, both: 'b' });

/**
 * draw_DNA's arguments for helix settings: dh_bounds from the turns and start angle,
 * base_pair_interval from base pairs per turn, extend_straight_by from turns.
 * @param {HelixSettings} h
 */
export function drawDnaOptions(h) {
  const f = h.frequency;
  const start = h.startAngle / 180 * Math.PI;
  return {
    dhBounds: [start / f, (start + h.turns * 2 * Math.PI) / f],
    points: h.points,
    amplitude: h.amplitude,
    phaseShift: h.phaseShift / 180 * Math.PI,
    frequency: f,
    bpInterval: 2 * Math.PI / (f * h.basePairsPerTurn), // Infinity for no base pairs
    propDist: h.basePairGap,
    alternateSides: h.alternateSides,
    partialDisplacement: h.partialDisplacement,
    chiralityProp: h.crossingGap,
    squareWave: h.squareWave,
    bpThickness: h.basePairThickness,
    strandThickness: h.strandThickness,
    extendStraight: EXTEND[h.extension.strands],
    extendStraightBy: h.extension.length * 2 * Math.PI / f,
    extensionTaper: h.extension.taper,
    rot: h.rotation,
    boxDim: h.box.fit === 'contain' ? [h.box.width, h.box.height] : null,
    forcedBox: h.box.fit === 'stretch' ? [h.box.width, h.box.height] : null,
    boxDNA: !h.box.includeExtension,
    xyr: 1,
  };
}

/**
 * The helix as a drawing, plus its geometry: both strands' centrelines with
 * their widths and visible runs, and the base pairs.
 * @param {HelixSettings} h
 * @returns {Drawing}
 */
export function helixDrawing(h) {
  const shape = dnaShape(drawDnaOptions(h));
  // R draws a base pair once per position it asks for; past the helix's end (a
  // one-strand extension) several ask for its last point, so keep the first of each
  const seenIndex = new Set();
  const basePairs = h.basePairsPerTurn > 0 ? shape.bp.filter((_, i) => {
    const k = shape.bpIndex[i];
    if (seenIndex.has(k)) return false;
    seenIndex.add(k);
    return true;
  }) : [];
  const fill = (/** @type {import('../../shared/helix.js').Piece} */ p) => {
    const simple = union([ribbon(p.x, p.y, p.lwd, 1)], 'nonzero');
    return h.edgeWidth > 0 ? offset(simple, h.edgeWidth / 2) : simple;
  };
  const parts = [
    { id: 'strand-1', label: 'Strand 1', color: h.colors.strand1, pieces: shape.s1 },
    { id: 'strand-2', label: 'Strand 2', color: h.colors.strand2, pieces: shape.s2 },
    { id: 'base-pairs', label: 'Base pairs', color: h.colors.basePairs, pieces: basePairs },
  ];
  return {
    fills: parts.map((p) => ({ id: p.id, label: p.label, color: p.color, shapes: p.pieces.map(fill) })),
    lines: parts.map((p) => ({
      id: p.id, label: p.label, color: p.color,
      // strands along their centrelines; base pairs as R's segment from end to end
      lines: p.id === 'base-pairs'
        ? p.pieces.map((b) => [b.x[0], b.y[0], b.x[b.x.length - 1], b.y[b.y.length - 1]])
        : p.pieces.map((s) => s.x.flatMap((x, i) => [x, s.y[i]])),
    })),
    strokeWidth: h.strandThickness,
    flatten: true,
    geometry: (/** @type {(x: number, y: number) => number[]} */ at) => ({
      strands: [shape.s1, shape.s2].map((pieces, i) => ({
        color: i ? h.colors.strand2 : h.colors.strand1,
        pieces: pieces.map((s) => s.x.map((x, k) => [...at(x, s.y[k]), s.lwd[k]])),
      })),
      basePairs: basePairs.map((b) => {
        const n = b.x.length - 1;
        return { from: at(b.x[0], b.y[0]), to: at(b.x[n], b.y[n]), widths: [b.lwd[0], b.lwd[n]], points: n + 1 };
      }),
    }),
  };
}
