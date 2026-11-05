// Figures for the geometry of correlation, as SVG strings (no DOM access). Arrows
// keep one colour, shape and letter on every panel: A blue circle, B orange
// triangle, C aqua square. The 3-D scenes go through lib/geom3d.js.

import { formatNumber } from '../lib/format.js';
import { arcPoints, circlePoints, renderScene, sphereOutline, sphereWireframe } from '../lib/geom3d.js';
import { cross, normalize, scale } from '../lib/linalg.js';
import { axisBottom, axisLeft, el, linePath, marker, niceTicks, scaleLinear, scaleLog, svgRoot, text } from '../lib/plot.js';
import { det3, LIMITS, PLANE_BASIS, zeroPairRange } from './compute.js';

/** @typedef {import('../lib/geom3d.js').Vec3} Vec3 */
/** @typedef {import('../lib/geom3d.js').Quat} Quat */
/** @typedef {import('../lib/geom3d.js').Camera} Camera */
/** @typedef {import('../lib/geom3d.js').Primitive} Primitive */
/** @typedef {import('../lib/plot.js').Shape} Shape */

const STYLE = {
  A: { stroke: 'a-stroke', mark: 'a-mark', shape: /** @type {Shape} */ ('circle') },
  B: { stroke: 'b-stroke', mark: 'b-mark', shape: /** @type {Shape} */ ('triangle') },
  C: { stroke: 'c-stroke', mark: 'c-mark', shape: /** @type {Shape} */ ('square') },
};
const ORIGIN = /** @type {Vec3} */ ([0, 0, 0]);
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const sub = (/** @type {number} */ n) => String(n).split('').map((d) => SUBSCRIPT[Number(d)]).join('');
const deg = (/** @type {number} */ v) => `${formatNumber(v, 1)}°`;

/**
 * A camera for a unit-sphere scene in a width × height box, with mild perspective.
 * @param {Quat} rotation @param {number} width @param {number} height
 * @returns {Camera}
 */
export function sceneCamera(rotation, width, height) {
  return { rotation, width, height, scale: Math.min(width, height) * 0.33, distance: 7 };
}

/** The unit sphere: wireframe, with its far side fainter, and its outline. @param {Quat} rotation @returns {Primitive[]} */
function sphere(rotation) {
  return [
    ...sphereWireframe(30).map((points) => /** @type {Primitive} */ ({ kind: 'path', points, closed: true, class: 'wire', backClass: 'wire back' })),
    { kind: 'path', points: sphereOutline(rotation), closed: true, class: 'sphere-outline' },
  ];
}

/**
 * An arrow from the origin with its tip marker and letter.
 * @param {Vec3} tip @param {'A' | 'B' | 'C'} name @param {{ label?: string, dashed?: boolean }} [options]
 * @returns {Primitive[]}
 */
function arrow(tip, name, { label = name, dashed = false } = {}) {
  const s = STYLE[name];
  return [
    { kind: 'line', from: ORIGIN, to: tip, class: `arrow ${s.stroke}${dashed ? ' dashed' : ''}` },
    { kind: 'point', at: tip, class: s.mark, shape: s.shape, size: 5.5 },
    { kind: 'label', at: /** @type {Vec3} */ (scale(tip, 1.2)), text: label, class: 'scene-label strong', dy: 4 },
  ];
}

/** A flat disc split into wedges, so each sorts by its own depth. @param {Vec3} u @param {Vec3} v @param {number} radius @param {string} cls @returns {Primitive[]} */
function disc(u, v, radius, cls) {
  const rim = circlePoints(ORIGIN, u, v, radius, 36);
  return rim.map((p, i) => ({ kind: 'patch', points: [ORIGIN, p, rim[(i + 1) % rim.length]], class: cls }));
}

/** The cone of directions at a fixed angle from `axis`: a fan of patches and its rim on the sphere. @param {Vec3} axis @param {number} r cos of the half-angle @param {string} name 'a' | 'b' @returns {Primitive[]} */
function cone(axis, r, name) {
  const u = normalize(Math.abs(axis[2]) < 0.9 ? cross(axis, [0, 0, 1]) : cross(axis, [1, 0, 0]));
  const v = /** @type {Vec3} */ (cross(axis, u));
  const radius = Math.sqrt(Math.max(0, 1 - r * r));
  const rim = circlePoints(/** @type {Vec3} */ (scale(axis, r)), /** @type {Vec3} */ (u), v, radius, 48);
  return [
    ...rim.map((p, i) => /** @type {Primitive} */ ({ kind: 'patch', points: [ORIGIN, p, rim[(i + 1) % rim.length]], class: `${name}-cone` })),
    { kind: 'path', points: rim, closed: true, class: `${name}-ring` },
  ];
}

/** An angle arc between two arrows with its label. @param {Vec3} from @param {Vec3} to @param {number} radius @param {string} label @returns {Primitive[]} */
function angleArc(from, to, radius, label) {
  const points = arcPoints(from, to, radius, 24);
  return [
    { kind: 'path', points, class: 'angle-arc' },
    { kind: 'label', at: /** @type {Vec3} */ (scale(points[12], 1.3)), text: label, class: 'scene-label', dy: 4 },
  ];
}

/** The observation axes, numbered at their positive ends. @returns {Primitive[]} */
function observationAxes() {
  return [0, 1, 2].flatMap((k) => {
    const end = /** @type {Vec3} */ ([0, 0, 0].map((_, i) => (i === k ? 1.3 : 0)));
    return [
      { kind: 'line', from: /** @type {Vec3} */ (scale(end, -1)), to: end, class: 'axis3' },
      { kind: 'label', at: /** @type {Vec3} */ (scale(end, 1.12)), text: `obs ${k + 1}`, class: 'scene-label small', dy: 4 },
    ];
  });
}

/** The plane of centred arrows (x + y + z = 0) and its great circle. @returns {Primitive[]} */
function centredPlane() {
  return [
    ...disc(PLANE_BASIS.e1, PLANE_BASIS.e2, 1.25, 'plane-patch'),
    { kind: 'path', points: circlePoints(ORIGIN, PLANE_BASIS.e1, PLANE_BASIS.e2, 1, 120), closed: true, class: 'great-circle', backClass: 'great-circle back' },
  ];
}

/**
 * Panel 1 with three observations: the two variables' arrows on the great circle.
 * @param {{ vectors: number[][], r: number, angle: number }} result
 * @param {Camera} camera @param {{ compact?: boolean }} [options]
 */
export function arrowsScene(result, camera, { compact = false } = {}) {
  const [a, b] = /** @type {Vec3[]} */ (result.vectors);
  const parts = [...sphere(camera.rotation), ...(compact ? [] : observationAxes()), ...centredPlane(), ...arrow(a, 'A'), ...arrow(b, 'B')];
  if (result.angle > 2 && result.angle < 178) parts.push(...angleArc(a, b, 0.32, `θ = ${deg(result.angle)}`));
  return renderScene(camera, parts, {
    label: `Observation space for three observations: the unit sphere, the plane of centred arrows and its great circle. Arrows A and B are ${deg(result.angle)} apart, so r = cos θ = ${formatNumber(result.r)}.`,
  });
}

/**
 * Panel 1 with two observations: the only two centred unit arrows, ±(√½, −√½).
 * @param {{ vectors: number[][], r: number }} result @param {{ width: number, height: number }} size
 */
export function twoObservationsFigure(result, { width, height }) {
  const radius = Math.min(width, height) * 0.36;
  const cx = width / 2;
  const cy = height / 2;
  const at = (/** @type {number[]} */ v, k = 1) => [cx + v[0] * radius * k, cy - v[1] * radius * k];
  const circle = Array.from({ length: 97 }, (_, i) => at([Math.cos((i / 96) * 2 * Math.PI), Math.sin((i / 96) * 2 * Math.PI)]));
  const h = Math.SQRT1_2;
  const spots = [[h, -h], [-h, h]];
  const [a, b] = result.vectors;
  const same = Math.abs(a[0] - b[0]) < 1e-9;
  const draw = (/** @type {number[]} */ v, /** @type {'A' | 'B'} */ name, /** @type {number} */ k) => {
    const [x, y] = at(v, k);
    return [el('line', { x1: cx, y1: cy, x2: x, y2: y, class: `arrow ${STYLE[name].stroke}` }), marker(STYLE[name].shape, x, y, 5.5, STYLE[name].mark)];
  };
  const [lx, ly] = at(spots[0], 1.32);
  const [mx, my] = at(spots[1], 1.32);
  return svgRoot({ width, height, label: `Observation space for two observations: every centred unit arrow is (√½, −√½) or (−√½, √½). A and B are ${same ? 'the same arrow, so r = 1' : 'opposite, so r = −1'}.` },
    el('line', { x1: cx - radius * 1.25, x2: cx + radius * 1.25, y1: cy, y2: cy, class: 'axis3' }),
    el('line', { x1: cx, x2: cx, y1: cy - radius * 1.25, y2: cy + radius * 1.25, class: 'axis3' }),
    text(cx + radius * 1.25, cy - 6, 'obs 1', { class: 'scene-label small', 'text-anchor': 'end' }),
    text(cx + 6, cy - radius * 1.25 + 10, 'obs 2', { class: 'scene-label small', 'text-anchor': 'start' }),
    el('path', { d: linePath(/** @type {[number, number][]} */ (circle)), class: 'great-circle' }),
    el('line', { x1: at(spots[0], 1.15)[0], y1: at(spots[0], 1.15)[1], x2: at(spots[1], 1.15)[0], y2: at(spots[1], 1.15)[1], class: 'centred-line' }),
    draw(a, 'A', 1), draw(b, 'B', same ? 0.78 : 1),
    text(lx, ly + 4, '(√½, −√½)', { class: 'scene-label', 'text-anchor': 'middle' }),
    text(mx, my + 4, '(−√½, √½)', { class: 'scene-label', 'text-anchor': 'middle' }),
    text(at(a, 1.12)[0] + 14, at(a, 1.12)[1] - 10, 'A', { class: 'scene-label strong' }),
    text(at(b, same ? 0.78 : 1.12)[0] - 14, at(b, same ? 0.78 : 1.12)[1] - 10, 'B', { class: 'scene-label strong' }));
}

/**
 * The data as a scatterplot with draggable points (data-drag="p0", …). The scale is
 * passed in so it can stay fixed during a drag.
 * @param {{ a: number[], b: number[] }} data
 * @param {{ width: number, height: number, domain?: { a: [number, number], b: [number, number] } }} size
 */
export function scatterFigure(data, { width, height, domain }) {
  const pad = (/** @type {number[]} */ v) => {
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const span = Math.max(hi - lo, 1);
    return /** @type {[number, number]} */ ([lo - span * 0.35, hi + span * 0.35]);
  };
  const dom = domain ?? { a: pad(data.a), b: pad(data.b) };
  const left = 40;
  const bottom = 34;
  const x = scaleLinear(dom.a, [left, width - 10]);
  const y = scaleLinear(dom.b, [height - bottom, 10]);
  const xt = niceTicks(dom.a[0], dom.a[1], 4);
  const yt = niceTicks(dom.b[0], dom.b[1], 4);
  const points = data.a.map((v, i) => {
    const px = x(v);
    const py = y(data.b[i]);
    return el('g', { 'data-drag': `p${i}` },
      el('circle', { cx: px, cy: py, r: 14, class: 'handle-hit', 'data-drag': `p${i}` }),
      el('circle', { cx: px, cy: py, r: 9, class: 'handle', 'data-drag': `p${i}` }),
      text(px, py + 4, String(i + 1), { class: 'handle-label', 'text-anchor': 'middle', 'data-drag': `p${i}` }));
  });
  return {
    svg: svgRoot({ width, height, label: `Scatterplot of the ${data.a.length} observations: ${data.a.map((v, i) => `(${formatNumber(v, 2)}, ${formatNumber(data.b[i], 2)})`).join(', ')}. Drag a point to change it.` },
      axisLeft({ scale: y, x: left, ticks: yt, format: (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1), gridTo: width - 10 }),
      axisBottom({ scale: x, y: height - bottom, ticks: xt, format: (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1), label: 'A', labelGap: 30 }),
      text(left - 30, 14, 'B', { class: 'axis-label' }),
      points),
    x, y, domain: dom,
  };
}

/**
 * Panel 2: B's cone at the chosen correlation meets the great circle at C's only
 * two possible positions; A's angles to them are θ₁ and θ₂.
 * @param {{ b: number[], a: number[], meets: number[][], rBC: number, withA: number[], anglesWithA: number[] }} result
 * @param {Camera} camera @param {{ compact?: boolean }} [options]
 */
export function coneScene(result, camera, { compact = false } = {}) {
  const b = /** @type {Vec3} */ (result.b);
  const a = /** @type {Vec3} */ (result.a);
  const [c1, c2] = /** @type {Vec3[]} */ (result.meets);
  const parts = [...sphere(camera.rotation), ...centredPlane(), ...cone(b, result.rBC, 'b'), ...arrow(b, 'B')];
  const twin = Math.abs(result.rBC) > 0.9999;
  parts.push(...arrow(c1, 'C', { label: twin ? 'C' : compact ? '' : `C${sub(1)}`, dashed: true }));
  if (!twin) parts.push(...arrow(c2, 'C', { label: compact ? '' : `C${sub(2)}`, dashed: true }));
  parts.push(...arrow(a, 'A'));
  if (!compact) {
    if (result.anglesWithA[0] > 3) parts.push(...angleArc(a, c1, 0.34, `θ${sub(1)}`));
    if (!twin && result.anglesWithA[1] > 3 && result.anglesWithA[1] < 177) parts.push(...angleArc(a, c2, 0.5, `θ${sub(2)}`));
  }
  if (compact) parts.splice(0, parts.length, ...parts.filter((p) => p.kind !== 'label'));
  return renderScene(camera, parts, {
    label: `Three observations: arrow B with the cone of arrows at correlation ${formatNumber(result.rBC)} to it. The cone meets the great circle of centred arrows at two points, C₁ and C₂; arrow A has correlation ${formatNumber(result.withA[0])} with C₁ and ${formatNumber(result.withA[1])} with C₂.`,
  });
}

/**
 * Where the cosine-rule panel puts its arrows: B up, A in the x–z plane at angle α,
 * and C on B's cone at angle β, turned φ degrees around it from A's side.
 * @param {number} rAB @param {number} rBC @param {number} phi degrees
 */
export function cosineArrows(rAB, rBC, phi) {
  const sa = Math.sqrt(Math.max(0, 1 - rAB * rAB));
  const sb = Math.sqrt(Math.max(0, 1 - rBC * rBC));
  const t = (phi * Math.PI) / 180;
  return {
    A: /** @type {Vec3} */ ([sa, 0, rAB]),
    B: /** @type {Vec3} */ ([0, 0, 1]),
    C: /** @type {Vec3} */ ([sb * Math.cos(t), sb * Math.sin(t), rBC]),
  };
}

/**
 * Panel 3: arrows A, B and C, B's cone, and the tetrahedron the arrows make with
 * the origin (its volume is √det R / 6).
 * @param {{ rAB: number, rBC: number, phi: number }} state
 * @param {Camera} camera
 */
export function cosineScene({ rAB, rBC, phi }, camera) {
  const { A, B, C } = cosineArrows(rAB, rBC, phi);
  const rAC = A[0] * C[0] + A[1] * C[1] + A[2] * C[2];
  const faces = [[ORIGIN, A, B], [ORIGIN, B, C], [ORIGIN, C, A], [A, B, C]];
  const parts = [
    ...sphere(camera.rotation),
    ...faces.map((points) => /** @type {Primitive} */ ({ kind: 'patch', points, class: 'box-patch' })),
    ...cone(B, rBC, 'b'),
    ...arrow(A, 'A'), ...arrow(B, 'B'), ...arrow(C, 'C'),
  ];
  const alpha = Math.acos(Math.max(-1, Math.min(1, rAB))) * (180 / Math.PI);
  const beta = Math.acos(Math.max(-1, Math.min(1, rBC))) * (180 / Math.PI);
  if (alpha > 3 && alpha < 177) parts.push(...angleArc(A, B, 0.3, 'α'));
  if (beta > 3 && beta < 177) parts.push(...angleArc(B, C, 0.46, 'β'));
  const det = Math.max(0, det3(rAB, rBC, rAC));
  return renderScene(camera, parts, {
    label: `Arrows A, B and C with r(A,B) = ${formatNumber(rAB)}, r(B,C) = ${formatNumber(rBC)} and r(A,C) = ${formatNumber(rAC)}. C lies on the cone of arrows at angle β to B. The tetrahedron the arrows make with the origin has volume ${formatNumber(Math.sqrt(det) / 6, 3)}, a sixth of the square root of det R.`,
  });
}

/**
 * Panel 4: k arrows with one common correlation. Each is a part along the common
 * direction (drawn upright) plus a part across it; the parts across are a regular
 * simplex, drawn on the plane where it projects to a regular polygon. For k ≤ 3 the
 * drawing is exact; beyond that the simplex needs more than two dimensions, so
 * the drawn arrows are shorter than 1 and their drawn angles are not the true ones.
 * @param {{ k: number, r: number, arrows: { along: number, across: number } }} model
 * @param {Camera} camera @param {{ compact?: boolean }} [options]
 */
export function simplexScene({ k, r, arrows }, camera, { compact = false } = {}) {
  const factor = k <= 3 ? 1 : Math.sqrt(2 / (k - 1));
  const tips = Array.from({ length: k }, (_, i) => {
    const t = (2 * Math.PI * i) / k + (k === 2 ? 0 : Math.PI / 2);
    return /** @type {Vec3} */ ([arrows.across * factor * Math.cos(t), arrows.across * factor * Math.sin(t), arrows.along]);
  });
  /** @type {Primitive[]} */
  const parts = [
    ...sphere(camera.rotation),
    ...disc([1, 0, 0], [0, 1, 0], 1.2, 'plane-patch'),
    { kind: 'line', from: [0, 0, -1.25], to: [0, 0, 1.25], class: 'axis-common' },
  ];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) parts.push({ kind: 'line', from: tips[i], to: tips[j], class: 'simplex-edge' });
  tips.forEach((tip) => parts.push(
    { kind: 'line', from: ORIGIN, to: tip, class: 'arrow ink-stroke' },
    { kind: 'point', at: tip, class: 'ink-mark', size: 4.5 },
  ));
  if (!compact) {
    tips.forEach((tip, i) => parts.push({ kind: 'label', at: /** @type {Vec3} */ ([tip[0] * 1.22, tip[1] * 1.22, tip[2] + 0.06]), text: String(i + 1), class: 'scene-label strong', dy: 4 }));
    parts.push({ kind: 'label', at: [0, 0, 1.36], text: 'common direction', class: 'scene-label small', dy: 4 });
  }
  return renderScene(camera, parts, {
    label: `${k} arrows with common correlation ${formatNumber(r)} (angle ${deg(Math.acos(r) * (180 / Math.PI))} between any two). Each has a part ${formatNumber(arrows.along)} along the common direction; the parts across it form a regular simplex${k > 3 ? ', drawn projected onto a plane' : ''}.`,
  });
}

/**
 * det R as a function of one entry (a downward parabola that is 0 at both ends of
 * the entry's interval), over the interval drawn as a bar, with the current value
 * and the centre (the value that maximises det R).
 * @param {{ lo: number, hi: number, centre: number, value: number | null, detAt: (r: number) => number, detMax: number, name: string }} model
 * @param {{ width: number, height: number }} size
 */
export function intervalFigure({ lo, hi, centre, value, detAt, detMax, name }, { width, height }) {
  const left = 46;
  const right = 14;
  const top = 12;
  const barY = height - 80;
  const plotBottom = barY - 22;
  const x = scaleLinear([-1, 1], [left, width - right]);
  // With no room (a point interval) det R is ≤ 0 everywhere; scale to how far it falls.
  let peak = detMax;
  if (!(peak > 1e-12)) for (let i = 0; i <= 40; i++) peak = Math.max(peak, -detAt(-1 + i / 20) / 3);
  if (!(peak > 1e-12)) peak = 1;
  const y = scaleLinear([-0.35 * peak, peak * 1.08], [plotBottom, top]);
  const n = 160;
  /** @type {[number, number][][]} */
  const inside = [[]];
  /** @type {[number, number][][]} */
  const outside = [[], []];
  // Outside the interval the curve is drawn down to the bottom of the plot only.
  for (let i = 0; i <= n; i++) {
    const r = -1 + (2 * i) / n;
    const d = detAt(r);
    if (d < -0.35 * peak) continue;
    const pt = /** @type {[number, number]} */ ([x(r), y(d)]);
    if (r < lo) outside[0].push(pt);
    else if (r > hi) outside[1].push(pt);
  }
  // The feasible arc, sampled within [lo, hi] so its ends sit exactly on det = 0.
  for (let i = 0; i <= 80; i++) {
    const r = lo + ((hi - lo) * i) / 80;
    inside[0].push([x(r), y(Math.max(0, detAt(r)))]);
  }
  if (outside[0].length) outside[0].push([x(lo), y(0)]);
  if (outside[1].length) outside[1].unshift([x(hi), y(0)]);
  const fill = inside[0].length > 1 ? el('path', { d: `${linePath(inside[0])}L${x(hi).toFixed(2)} ${y(0).toFixed(2)}L${x(lo).toFixed(2)} ${y(0).toFixed(2)}Z`, class: 'det-fill' }) : '';
  const yTicks = detMax > 1e-12 ? niceTicks(0, detMax, 3) : [0];
  const ends = [lo, hi];
  const endLabels = Math.abs(x(hi) - x(lo)) < 70
    ? [text((x(lo) + x(hi)) / 2, barY + 30, `${formatNumber(lo)} to ${formatNumber(hi)}`, { class: 'value-label', 'text-anchor': 'middle' })]
    : ends.map((v, i) => text(x(v), barY + 30, formatNumber(v), { class: 'value-label', 'text-anchor': i ? 'end' : 'start' }));
  const parts = [
    axisLeft({ scale: y, x: left, ticks: yTicks, format: (v) => (detMax > 1e-12 ? formatNumber(v, v < 0.1 && v > 0 ? 3 : 2) : '0'), gridTo: width - right }),
    el('line', { x1: left, x2: width - right, y1: y(0), y2: y(0), class: 'baseline' }),
    text(left - 6, top - 2, 'det R', { class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'hanging' }),
    fill,
    detMax > 1e-12 ? el('path', { d: linePath(inside[0]), class: 'ink-line' }) : '',
    ...outside.filter((o) => o.length > 1).map((o) => el('path', { d: linePath(o), class: 'det-outside' })),
    el('line', { x1: x(-1), x2: x(1), y1: barY, y2: barY, class: 'range-track' }),
    el('line', { x1: x(lo), x2: x(Math.max(hi, lo + 0.002)), y1: barY, y2: barY, class: 'range-bar' }),
    ...ends.map((v) => el('line', { x1: x(v), x2: x(v), y1: barY - 9, y2: barY + 9, class: 'range-end' })),
    marker('diamond', x(centre), barY, 5, 'hollow-mark'),
    endLabels,
    axisBottom({ scale: x, y: height - 40, ticks: [-1, -0.5, 0, 0.5, 1], format: (v) => formatNumber(v, v === 0 || Math.abs(v) === 1 ? 0 : 1), label: name, labelGap: 32 }),
  ];
  if (value !== null) {
    parts.push(el('line', { x1: x(value), x2: x(value), y1: y(Math.max(0, detAt(value))), y2: barY, class: 'marker-line' }),
      marker('circle', x(value), barY, 6, 'ink-mark'),
      marker('circle', x(value), y(Math.max(-0.35 * peak, detAt(value))), 4.5, 'ink-mark'));
  }
  return svgRoot({
    width, height,
    label: `det R as ${name} varies: positive between ${formatNumber(lo)} and ${formatNumber(hi)}, its largest at ${formatNumber(centre)}, negative outside${value === null ? '' : `; the current value is ${formatNumber(value)}`}.`,
  }, ...parts);
}

/**
 * Eigenvalues as bars, one per eigenvalue counted with multiplicity; a negative one
 * is drawn below the axis in the alert colour with a warning sign.
 * @param {{ value: number, multiplicity: number }[]} eigenvalues @param {number} top largest value the axis shows
 * @param {{ width: number, height: number }} size
 */
export function eigenFigure(eigenvalues, top, { width, height }) {
  const bars = eigenvalues.flatMap((e) => Array.from({ length: e.multiplicity }, () => e.value));
  const lowest = Math.min(0, ...bars);
  const left = 34;
  const y = scaleLinear([Math.min(lowest * 1.25, -0.06 * top), top * 1.05], [height - 24, 18]);
  const band = (width - left - 6) / bars.length;
  const bw = Math.min(46, band * 0.66);
  const parts = bars.map((v, i) => {
    const cx = left + band * (i + 0.5);
    const negative = v < -1e-12;
    const y0 = y(0);
    const y1 = y(v);
    return [
      el('rect', { x: cx - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)), rx: 3, class: negative ? 'eig-bar negative' : 'eig-bar' }),
      text(cx, negative ? y1 + 14 : y1 - 5, `${negative ? '⚠ ' : ''}${formatNumber(v)}`, { class: 'value-label small', 'text-anchor': 'middle' }),
    ].join('');
  });
  return svgRoot({ width, height, label: `Eigenvalues: ${bars.map((v) => formatNumber(v)).join(', ')}${lowest < -1e-12 ? '; one is negative, so no such arrows exist' : ''}.` },
    axisLeft({ scale: y, x: left, ticks: niceTicks(Math.max(0, lowest), top, 4), format: (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1), gridTo: width - 6 }),
    parts,
    el('line', { x1: left, x2: width - 6, y1: y(0), y2: y(0), class: 'baseline' }));
}

/**
 * The range of the common correlation when one pair is held at 0, against k, with
 * the all-equal lower limit −1/(k − 1) for comparison and the current (k, r).
 * @param {number} k @param {number} r @param {{ width: number, height: number }} size
 */
export function zeroPairFigure(k, r, { width, height }) {
  const left = 46;
  const right = 92;
  const top = 12;
  const bottom = 40;
  const ks = Array.from({ length: 98 }, (_, i) => i + 3);
  const x = scaleLog([3, 100], [left, width - right]);
  const y = scaleLinear([-0.75, 0.75], [height - bottom, top]);
  const hi = ks.map((kk) => /** @type {[number, number]} */ ([x(kk), y(zeroPairRange(kk)[1])]));
  const lo = ks.map((kk) => /** @type {[number, number]} */ ([x(kk), y(zeroPairRange(kk)[0])]));
  const equal = ks.map((kk) => /** @type {[number, number]} */ ([x(kk), y(-1 / (kk - 1))]));
  const [cLo, cHi] = zeroPairRange(k);
  const end = (/** @type {[number, number][]} */ line) => line[line.length - 1][1];
  const labels = [
    { y: end(hi), t: 'largest' }, { y: end(lo), t: 'smallest' }, { y: end(equal), t: '−1/(k − 1)' },
  ].sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  return svgRoot({ width, height, label: `With one pair held at 0, the common correlation of the other pairs must lie between the two curves: at k = ${k}, from ${formatNumber(cLo, 3)} to ${formatNumber(cHi, 3)}. The largest value falls from 0.707 at k = 3 toward 1/2.` },
    axisLeft({ scale: y, x: left, ticks: [-0.5, 0, 0.5], format: (v) => formatNumber(v, 1), gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: [3, 5, 10, 20, 50, 100], format: String, label: 'variables, k', labelGap: 32 }),
    el('line', { x1: left, x2: width - right, y1: y(0.5), y2: y(0.5), class: 'muted-line' }),
    el('path', { d: `${linePath(hi)}${[...lo].reverse().map(([px, py]) => `L${px.toFixed(2)} ${py.toFixed(2)}`).join('')}Z`, class: 'feasible-band' }),
    el('path', { d: linePath(hi), class: 'ink-line' }),
    el('path', { d: linePath(lo), class: 'ink-line' }),
    el('path', { d: linePath(equal), class: 'equal-line' }),
    el('line', { x1: x(k), x2: x(k), y1: y(cLo), y2: y(cHi), class: 'range-bar thin' }),
    marker(r >= cLo - 1e-12 && r <= cHi + 1e-12 ? 'circle' : 'diamond', x(k), y(Math.max(-0.75, Math.min(0.75, r))), 5.5, r >= cLo - 1e-12 && r <= cHi + 1e-12 ? 'ink-mark' : 'alert-mark'),
    labels.map((l) => text(width - right + 8, l.y + 4, l.t, { class: 'direct-label' })),
    text(left + 4, y(0.5) - 5, '1/2', { class: 'axis-label' }));
}

/**
 * Expected width of one entry's interval against the number of variables p: for a
 * matrix drawn uniformly from all correlation matrices, and for the sample matrix
 * of n observations of independent variables (0 from p = n + 1). The current
 * matrix's mean width is marked at its p.
 * @param {{ observations: number, dimensions: number[], uniform: number[], sample: number[] }} curve
 * @param {{ p: number, meanWidth: number }} here
 * @param {{ width: number, height: number }} size
 */
export function widthCurveFigure(curve, here, { width, height }) {
  const narrow = width < 520;
  const left = narrow ? 40 : 52;
  const right = narrow ? 56 : 104;
  const top = 12;
  const bottom = 42;
  const floor = 0.004;
  const x = scaleLog([2, LIMITS.maxDimension], [left, width - right]);
  const y = scaleLog([floor, 2.4], [height - bottom, top]);
  const line = (/** @type {number[]} */ values) => {
    /** @type {[number, number][]} */
    const pts = [];
    curve.dimensions.forEach((p, i) => { if (values[i] > floor) pts.push([x(p), y(values[i])]); });
    return pts;
  };
  const uniform = line(curve.uniform);
  const sample = line(curve.sample);
  const n = curve.observations;
  const lastSample = sample[sample.length - 1];
  const collapse = n + 1 <= LIMITS.maxDimension ? x(n + 1) : null;
  const ends = [
    { y: uniform[uniform.length - 1][1], t: 'uniform' },
    { y: collapse === null ? lastSample[1] : height - bottom - 6, t: narrow ? `n = ${n}` : `${n} observations` },
  ].sort((a, b) => a.y - b.y);
  if (ends[1].y - ends[0].y < 14) ends[1].y = ends[0].y + 14;
  const parts = [
    axisLeft({ scale: y, x: left, ticks: [0.01, 0.1, 1], format: (v) => String(v), gridTo: width - right }),
    axisBottom({ scale: x, y: height - bottom, ticks: narrow ? [2, 10, 50, 200] : [2, 5, 10, 20, 50, 100, 200], format: String, label: 'variables in the matrix, p', labelGap: 32 }),
    text(left - 8, top - 2, 'width', { class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'hanging' }),
    el('path', { d: linePath(uniform), class: 'ink-line' }),
    el('path', { d: linePath(sample), class: 'c-line' }),
  ];
  if (collapse !== null) {
    parts.push(el('line', { x1: lastSample[0], x2: collapse, y1: lastSample[1], y2: height - bottom, class: 'c-line' }),
      el('line', { x1: collapse, x2: Math.min(width - right, x(LIMITS.maxDimension)), y1: height - bottom, y2: height - bottom, class: 'c-line zero' }),
      el('line', { x1: x(n), x2: x(n), y1: top, y2: height - bottom, class: 'muted-line' }),
      text(x(n) + 4, top + 10, `p = n = ${n}`, { class: 'axis-label' }));
  }
  if (here.p >= 2) parts.push(marker('diamond', x(here.p), y(Math.max(floor, here.meanWidth)), 6, 'hollow-strong'));
  parts.push(...ends.map((e) => text(width - right + 8, e.y + 4, e.t, { class: 'direct-label' })));
  return svgRoot({
    width, height,
    label: `Expected width of one entry's interval against the number of variables, on log scales. Uniform over correlation matrices it falls from 2 at p = 2 to ${formatNumber(curve.uniform[curve.uniform.length - 1], 3)} at p = ${LIMITS.maxDimension}. For the sample matrix of ${n} observations it reaches 0 at p = ${n + 1}. This matrix (p = ${here.p}) has mean width ${formatNumber(here.meanWidth, 3)}.`,
  }, parts);
}
