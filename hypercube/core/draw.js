// A frame as a draw list, in pixels, and that list as SVG. The page paints the same
// list on a canvas, so the screen, the PNG and the SVG agree.
//
// 'translucent' is R's base renderer (render.R, Cairo): every non-degenerate face
// filled in one colour and opacity, in R's order (decreasing mean depth; with one
// colour and opacity the picture does not depend on the order), then every edge
// in one stroke. 'opaque' is R's RGL renderer with --face-alpha=1: lit faces with
// depth testing, which for a convex projected cube shows exactly the faces on its
// front supporting plane (geometry.js), each printed with its planned dimension
// numeral, and the edges on that front surface.

import { DEFAULT_CAMERA, faceVisibility, isDefaultCamera, litColor, projectFrame, rotatePoints } from './geometry.js';
import { faceNumber, stageAt, stageLabel } from './plan.js';
import { escapeXml, r2 } from '../../intuitions/lib/plot.js';

/** @typedef {import('./plan.js').Plan} Plan */
/** @typedef {import('./geometry.js').Quat} Quat */
/**
 * @typedef {{ style: 'translucent' | 'opaque', faceAlpha: number, numerals: boolean, theme: 'light' | 'dark', size: number, camera: Quat }} DrawOptions
 * @typedef {{ text: string, fill: string, matrix: number[] }} Numeral numeral texture space (NUMERAL_TEXTURE) to screen
 * @typedef {{ face: number, points: number[], fill: string, opacity: number, depth: number, gap?: number, numeral?: Numeral }} FacePrimitive
 * @typedef {{
 *   size: number, background: string, scale: number,
 *   faces: FacePrimitive[], edges: { color: string, width: number, segments: number[], pairs: number[] },
 *   points: Float64Array, numeralsShown: boolean,
 * }} DrawList
 */

/** R's frame: plot.window(±b) with the default 4% axis extension each side, on 800 px. */
const FRAME_EXTENT = 1.08;
/** R's base renderer strokes edges at lwd = 2, 1.5 px on its 800 px frame. */
const EDGE_WIDTH_800 = 1.5;
/** Faces and edges thinner than this (cube units², squared length) are skipped. Float32 plans put
 *  degenerate ones near 1e-7; at 800 px the threshold is a small fraction of a pixel. */
const DEGENERATE_AREA = 1e-5;
const DEGENERATE_LENGTH2 = 1e-10;
/** Visibility tolerance for float32 plan coordinates (R's 1e-9 is for doubles). */
export const PLAN_TOLERANCE = 1e-5;
/** R's numeral texture: 256 px square, a 132 px numeral (#172C3A) centred on its glyph box, modulating
 *  the lit face. Numerals are drawn in that texture space; a digit's glyph centre is 0.36 em above its baseline. */
export const NUMERAL_TEXTURE = Object.freeze({ size: 256, fontSize: 132, baseline: 128 + 0.36 * 132 });
const NUMERAL_INK = [0x17 / 255, 0x2c / 255, 0x3a / 255];

export const THEMES = Object.freeze({
  light: { background: '#ffffff', edge: null },
  dark: { background: '#16181d', edge: '#5fbbe6' },
});

/** @param {string} hex @returns {number[]} */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
/** @param {number[]} c */
const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

/**
 * The draw list of one frame.
 * @param {Plan} plan @param {number} frame 1-based @param {DrawOptions} options
 * @returns {DrawList}
 */
export function drawFrame(plan, frame, options) {
  const { topology: topo, axisBounds: bounds } = plan;
  const { size, style } = options;
  const camera = options.camera ?? DEFAULT_CAMERA;
  const points = rotatePoints(projectFrame(plan.projection, plan.k, frame), camera);
  const scale = size / 2 / (FRAME_EXTENT * bounds);
  const half = size / 2;
  const px = (/** @type {number} */ v) => half + points[3 * v] * scale;
  const py = (/** @type {number} */ v) => half - points[3 * v + 1] * scale;
  const theme = THEMES[options.theme];
  const edgeColor = theme.edge ?? plan.colors.edge;
  const faces = topo.faces;
  const faceCount = faces.length / 4;
  /** @type {FacePrimitive[]} */
  const drawn = [];
  const quad = (/** @type {number} */ f) => {
    const out = [];
    for (let c = 0; c < 4; c++) out.push(px(faces[4 * f + c]), py(faces[4 * f + c]));
    return out;
  };
  const meanDepth = (/** @type {number} */ f) => (points[3 * faces[4 * f] + 2] + points[3 * faces[4 * f + 1] + 2] +
    points[3 * faces[4 * f + 2] + 2] + points[3 * faces[4 * f + 3] + 2]) / 4;
  /** @type {number[]} */
  const pairs = [];
  const numeralsShown = style === 'opaque' && options.numerals && isDefaultCamera(camera);

  if (style === 'translucent') {
    for (let f = 0; f < faceCount; f++) {
      if (Math.abs(area2d(points, faces, f)) <= DEGENERATE_AREA) continue;
      drawn.push({ face: f, points: quad(f), fill: plan.colors.face, opacity: options.faceAlpha, depth: meanDepth(f) });
    }
    drawn.sort((a, b) => b.depth - a.depth);
    for (let e = 0; e < topo.edges.length; e += 2) pairs.push(topo.edges[e], topo.edges[e + 1]);
  } else {
    const { visible, normals, gaps } = faceVisibility(points, topo, PLAN_TOLERANCE);
    const base = rgb(plan.colors.face);
    const onSurface = new Uint8Array(topo.edges.length / 2);
    const edgeIndex = edgeLookup(plan);
    for (let f = 0; f < faceCount; f++) {
      if (!visible[f] || Math.abs(area2d(points, faces, f)) <= DEGENERATE_AREA) continue;
      const v0 = faces[4 * f], v2 = faces[4 * f + 2];
      const cx = (points[3 * v0] + points[3 * v2]) / 2, cy = (points[3 * v0 + 1] + points[3 * v2 + 1]) / 2, cz = (points[3 * v0 + 2] + points[3 * v2 + 2]) / 2;
      const lit = litColor(base, normals[3 * f], normals[3 * f + 1], normals[3 * f + 2], cx, cy, cz, bounds);
      /** @type {FacePrimitive} */
      const item = { face: f, points: quad(f), fill: hex(lit), opacity: 1, depth: meanDepth(f), gap: gaps[f] };
      if (numeralsShown) {
        item.numeral = { text: String(faceNumber(plan, f, frame)), fill: hex(lit.map((c, i) => c * NUMERAL_INK[i])),
          matrix: numeralMatrix(item.points) };
      }
      drawn.push(item);
      for (let c = 0; c < 4; c++) onSurface[edgeIndex(faces[4 * f + c], faces[4 * f + (c + 1) % 4])] = 1;
    }
    // Front faces tile the cube's front surface without overlapping. Within the
    // tolerance a face just behind it also counts, so paint the deepest first: the
    // surface covers it, as the depth test would. Ties (coincident copies) go back to front.
    drawn.sort((a, b) => /** @type {number} */ (b.gap) - /** @type {number} */ (a.gap) || a.depth - b.depth);
    // A flat or edge-on cube has no front face to hide anything: every edge shows.
    const all = drawn.length === 0;
    for (let e = 0; e < topo.edges.length; e += 2) if (all || onSurface[e / 2]) pairs.push(topo.edges[e], topo.edges[e + 1]);
  }

  /** @type {number[]} */
  const segments = [];
  /** @type {number[]} */
  const kept = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1];
    const dx = points[3 * a] - points[3 * b], dy = points[3 * a + 1] - points[3 * b + 1];
    if (dx * dx + dy * dy <= DEGENERATE_LENGTH2) continue;
    segments.push(px(a), py(a), px(b), py(b));
    kept.push(a, b);
  }
  return {
    size, background: theme.background, scale, faces: drawn,
    edges: { color: edgeColor, width: EDGE_WIDTH_800 * size / 800, segments, pairs: kept },
    points, numeralsShown,
  };
}

/** Twice the signed screen area of a face (y up). @param {Float64Array} points @param {Int32Array} faces @param {number} f */
function area2d(points, faces, f) {
  const p0 = 3 * faces[4 * f], p1 = 3 * faces[4 * f + 1], p3 = 3 * faces[4 * f + 3];
  return (points[p1] - points[p0]) * (points[p3 + 1] - points[p0 + 1]) - (points[p1 + 1] - points[p0 + 1]) * (points[p3] - points[p0]);
}

/** @type {WeakMap<Plan, (a: number, b: number) => number>} */
const edgeLookups = new WeakMap();
/** Edge index of a vertex pair. @param {Plan} plan */
function edgeLookup(plan) {
  let lookup = edgeLookups.get(plan);
  if (!lookup) {
    const { edges, k } = plan.topology;
    /** @type {Map<number, number>} */
    const index = new Map();
    for (let e = 0; e < edges.length; e += 2) index.set(edges[e] * (1 << k) + edges[e + 1], e / 2);
    lookup = (a, b) => /** @type {number} */ (index.get(Math.min(a, b) * (1 << k) + Math.max(a, b)));
    edgeLookups.set(plan, lookup);
  }
  return lookup;
}

/**
 * The affine map from numeral-texture space (0..256, y down, as an image) to the
 * screen, as RGL maps the texture: u along the quad's first side, v along its
 * last, with u mirrored on a face seen from the back so the numeral never reads
 * mirrored. Returns [a, b, c, d, e, f] for (s, t) → (a s + c t + e, b s + d t + f).
 * @param {number[]} q the quad's four screen points (y down)
 */
function numeralMatrix(q) {
  const [x0, y0, x1, y1, , , x3, y3] = q;
  let ux = x1 - x0, uy = y1 - y0;
  const vx = x3 - x0, vy = y3 - y0;
  let ox = x0, oy = y0;
  // Screen y points down, so a counter-clockwise (front-facing) quad has a negative cross product here.
  if (ux * vy - uy * vx > 0) { ox += ux; oy += uy; ux = -ux; uy = -uy; }
  // Texture row t = 0 is the top of the image, at v = 1 (rgl flips images on upload).
  const n = NUMERAL_TEXTURE.size;
  return [ux / n, uy / n, -vx / n, -vy / n, ox + vx, oy + vy];
}

/**
 * The draw list as an SVG document.
 * @param {DrawList} list
 * @param {{ title?: string, caption?: string }} [meta] caption: drawn top left, as R's RGL label
 */
export function renderSvg(list, meta = {}) {
  const { size } = list;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`];
  if (meta.title) parts.push(`<title>${escapeXml(meta.title)}</title>`);
  parts.push(`<rect width="${size}" height="${size}" fill="${list.background}"/>`);
  const path = (/** @type {number[]} */ p) => `M${r2(p[0])} ${r2(p[1])}L${r2(p[2])} ${r2(p[3])}L${r2(p[4])} ${r2(p[5])}L${r2(p[6])} ${r2(p[7])}Z`;
  const uniform = list.faces.length > 0 && list.faces.every((f) => f.fill === list.faces[0].fill && f.opacity === list.faces[0].opacity && !f.numeral);
  if (uniform) {
    const { fill, opacity } = list.faces[0];
    parts.push(`<g fill="${fill}" fill-opacity="${r4(opacity)}">${list.faces.map((f) => `<path d="${path(f.points)}"/>`).join('')}</g>`);
  } else {
    parts.push(`<g font-family="${FONT_FAMILY.replaceAll('"', "'")}" text-anchor="middle">`);
    for (const f of list.faces) {
      parts.push(`<path d="${path(f.points)}" fill="${f.fill}"${f.opacity < 1 ? ` fill-opacity="${r4(f.opacity)}"` : ''}/>`);
      if (f.numeral) {
        const m = f.numeral.matrix.map((v) => Math.round(v * 1e5) / 1e5);
        const { size: n, fontSize, baseline } = NUMERAL_TEXTURE;
        parts.push(`<text transform="matrix(${m.join(' ')})" x="${n / 2}" y="${r2(baseline)}" font-size="${fontSize}" fill="${f.numeral.fill}">${escapeXml(f.numeral.text)}</text>`);
      }
    }
    parts.push('</g>');
  }
  const s = list.edges.segments;
  if (s.length) {
    let d = '';
    for (let i = 0; i < s.length; i += 4) d += `M${r2(s[i])} ${r2(s[i + 1])}L${r2(s[i + 2])} ${r2(s[i + 3])}`;
    parts.push(`<path d="${d}" fill="none" stroke="${list.edges.color}" stroke-width="${r2(list.edges.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  if (meta.caption) {
    const c = captionLayout(list);
    parts.push(`<text x="${r2(c.x)}" y="${r2(c.y)}" font-family="${FONT_FAMILY.replaceAll('"', "'")}" font-size="${r2(c.fontSize)}" fill="${c.fill}">${escapeXml(meta.caption)}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

/** @param {number} v */
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** Numerals and the caption: Helvetica or Arial, as R's renderers had on macOS, else any sans. */
export const FONT_FAMILY = 'Helvetica, Arial, "DejaVu Sans", sans-serif';

/** Where an export's stage caption goes: top left, as R's RGL label. @param {{ size: number, background: string }} list */
export function captionLayout(list) {
  const fontSize = list.size * 0.045;
  return { x: list.size * 0.03, y: list.size * 0.03 + fontSize, fontSize, fill: list.background === THEMES.light.background ? '#1b1b1b' : '#e8e8e8' };
}

/** The stage of a frame, described. @param {Plan} plan @param {number} frame */
export function describeStage(plan, frame) {
  const stage = stageAt(plan, frame);
  return { index: stage.index, dimension: stage.dimension, phase: stage.phase, label: stageLabel(stage.dimension), start: stage.start, length: stage.length };
}
