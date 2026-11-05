// A small 3-D layer for SVG figures: a camera (a rotation quaternion and an
// orthographic or perspective projection), helpers that sample arcs, circles and
// a sphere wireframe, a painter's-algorithm renderer for points, lines, paths,
// translucent patches and labels, and a pointer-and-keyboard rotation control.
// Rendering returns markup strings, like plot.js, so the same scene draws a page
// figure, a thumbnail or a test fixture. Nothing moves unless the user drags or
// presses a key: there is no animation here.

import { cross, dot, normalize } from './linalg.js';
import { el, marker, svgRoot, text } from './plot.js';

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {[number, number, number, number]} Quat [w, x, y, z], unit length */
/**
 * World units map to `scale` pixels at the origin; `distance` is the eye's
 * distance from the origin in world units (Infinity for orthographic).
 * View space: x right, y up, z toward the viewer.
 * @typedef {{ rotation: Quat, width: number, height: number, scale: number, distance: number }} Camera
 */
/** @typedef {import('./plot.js').Shape} Shape */
/**
 * Scene primitives. A line or path may name a `backClass` for the parts behind the
 * plane through the origin that faces the viewer, so far sides read as far.
 * @typedef {{ kind: 'line', from: Vec3, to: Vec3, class: string, backClass?: string }
 *   | { kind: 'path', points: Vec3[], class: string, backClass?: string, closed?: boolean }
 *   | { kind: 'patch', points: Vec3[], class: string }
 *   | { kind: 'point', at: Vec3, class: string, shape?: Shape, size?: number }
 *   | { kind: 'label', at: Vec3, text: string, class?: string, dx?: number, dy?: number, anchor?: 'start' | 'middle' | 'end' }} Primitive
 */

const DEG = Math.PI / 180;

/** @param {Vec3} axis @param {number} degrees @returns {Quat} */
export function quatFromAxisAngle(axis, degrees) {
  const [x, y, z] = normalize(axis);
  const h = (degrees * DEG) / 2;
  const s = Math.sin(h);
  return [Math.cos(h), x * s, y * s, z * s];
}

/** The rotation that applies b, then a. @param {Quat} a @param {Quat} b @returns {Quat} */
export function quatMultiply(a, b) {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  const q = /** @type {Quat} */ ([
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ]);
  const n = Math.hypot(...q);
  return /** @type {Quat} */ (q.map((c) => c / n));
}

/** @param {Quat} q @param {Vec3} v @returns {Vec3} */
export function rotateVector(q, v) {
  const [w, x, y, z] = q;
  const u = /** @type {Vec3} */ ([x, y, z]);
  const t = cross(u, v).map((c) => 2 * c);
  const ut = cross(u, t);
  return [v[0] + w * t[0] + ut[0], v[1] + w * t[1] + ut[1], v[2] + w * t[2] + ut[2]];
}

/**
 * A view of a z-up world: turned `azimuth` degrees about the vertical, then seen
 * from `elevation` degrees above the horizon.
 * @param {number} azimuth @param {number} elevation
 */
export function orientation(azimuth, elevation) {
  return quatMultiply(quatFromAxisAngle([1, 0, 0], elevation - 90), quatFromAxisAngle([0, 0, 1], -azimuth));
}

/**
 * Turns a view by `degrees` about a screen axis: 'left' and 'right' about the
 * vertical, 'up' and 'down' about the horizontal.
 * @param {Quat} rotation @param {'left' | 'right' | 'up' | 'down'} direction @param {number} degrees
 */
export function turn(rotation, direction, degrees) {
  const axis = /** @type {Vec3} */ (direction === 'left' || direction === 'right' ? [0, 1, 0] : [1, 0, 0]);
  const sign = direction === 'right' || direction === 'down' ? 1 : -1;
  return quatMultiply(quatFromAxisAngle(axis, sign * degrees), rotation);
}

/**
 * Screen position (px, y down) and view depth of a world point.
 * @param {Camera} camera @param {Vec3} point
 */
export function project(camera, point) {
  const [x, y, z] = rotateVector(camera.rotation, point);
  const f = Number.isFinite(camera.distance) ? camera.distance / (camera.distance - z) : 1;
  return { x: camera.width / 2 + x * camera.scale * f, y: camera.height / 2 - y * camera.scale * f, z, f };
}

/**
 * Points along the shorter great-circle arc from one direction to another, at a
 * given radius from the origin.
 * @param {Vec3} from @param {Vec3} to @param {number} [radius] @param {number} [steps]
 * @returns {Vec3[]}
 */
export function arcPoints(from, to, radius = 1, steps = 32) {
  const a = normalize(from);
  const b = normalize(to);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  const s = Math.sin(angle);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const wa = s < 1e-9 ? 1 - t : Math.sin((1 - t) * angle) / s;
    const wb = s < 1e-9 ? t : Math.sin(t * angle) / s;
    return /** @type {Vec3} */ (a.map((c, k) => radius * (wa * c + wb * b[k])));
  });
}

/**
 * A closed circle: centre + radius·(cos t·u + sin t·v) for orthonormal u, v.
 * The first point is not repeated at the end.
 * @param {Vec3} centre @param {Vec3} u @param {Vec3} v @param {number} radius @param {number} [steps]
 * @returns {Vec3[]}
 */
export function circlePoints(centre, u, v, radius, steps = 96) {
  return Array.from({ length: steps }, (_, i) => {
    const t = (2 * Math.PI * i) / steps;
    return /** @type {Vec3} */ (centre.map((c, k) => c + radius * (Math.cos(t) * u[k] + Math.sin(t) * v[k])));
  });
}

/**
 * A unit-sphere wireframe: circles of latitude every `step` degrees and as many
 * meridians, about the z axis.
 * @param {number} [step]
 * @returns {Vec3[][]}
 */
export function sphereWireframe(step = 30) {
  /** @type {Vec3[][]} */
  const paths = [];
  for (let lat = -90 + step; lat < 90; lat += step) {
    const z = Math.sin(lat * DEG);
    paths.push(circlePoints([0, 0, z], [1, 0, 0], [0, 1, 0], Math.cos(lat * DEG), 72));
  }
  for (let lon = 0; lon < 180; lon += step) {
    const u = /** @type {Vec3} */ ([Math.cos(lon * DEG), Math.sin(lon * DEG), 0]);
    paths.push(circlePoints([0, 0, 0], u, [0, 0, 1], 1, 72));
  }
  return paths;
}

/**
 * The circle that outlines a sphere of `radius` at the origin for a view: the great
 * circle facing the viewer, in world coordinates (exact for orthographic views,
 * close for mild perspective).
 * @param {Quat} rotation @param {number} [radius]
 */
export function sphereOutline(rotation, radius = 1) {
  const back = /** @type {Quat} */ ([rotation[0], -rotation[1], -rotation[2], -rotation[3]]);
  return circlePoints([0, 0, 0], rotateVector(back, [1, 0, 0]), rotateVector(back, [0, 1, 0]), radius, 96);
}

/**
 * Draws primitives far to near (painter's algorithm). Paths are split into
 * segments so each sorts on its own; a patch sorts by its mean depth. Labels are
 * drawn last, on top, so they stay readable.
 * @param {Camera} camera
 * @param {Primitive[]} primitives
 * @param {{ label: string, description?: string, className?: string }} meta
 */
export function renderScene(camera, primitives, meta) {
  /** @type {{ z: number, markup: string }[]} */
  const items = [];
  /** @type {string[]} */
  const labels = [];
  const segment = (/** @type {Vec3} */ a, /** @type {Vec3} */ b, /** @type {string} */ cls, /** @type {string | undefined} */ back) => {
    const p = project(camera, a);
    const q = project(camera, b);
    const z = (p.z + q.z) / 2;
    items.push({ z, markup: el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: back && z < 0 ? back : cls }) });
  };
  for (const item of primitives) {
    if (item.kind === 'line') segment(item.from, item.to, item.class, item.backClass);
    else if (item.kind === 'path') {
      const n = item.points.length;
      for (let i = 0; i < (item.closed ? n : n - 1); i++) segment(item.points[i], item.points[(i + 1) % n], item.class, item.backClass);
    } else if (item.kind === 'patch') {
      const pts = item.points.map((v) => project(camera, v));
      const z = pts.reduce((sum, p) => sum + p.z, 0) / pts.length;
      items.push({ z, markup: el('path', { d: `${pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('')}Z`, class: item.class }) });
    } else if (item.kind === 'point') {
      const p = project(camera, item.at);
      items.push({ z: p.z + 1e-6, markup: marker(item.shape ?? 'circle', p.x, p.y, (item.size ?? 5) * p.f, item.class) });
    } else {
      const p = project(camera, item.at);
      labels.push(text(p.x + (item.dx ?? 0), p.y + (item.dy ?? 0), item.text, { class: item.class ?? 'scene-label', 'text-anchor': item.anchor ?? 'middle' }));
    }
  }
  items.sort((a, b) => a.z - b.z);
  return svgRoot({ width: camera.width, height: camera.height, label: meta.label, description: meta.description, className: meta.className },
    items.map((i) => i.markup), labels);
}

/**
 * Rotation by dragging (an arcball: the pointer drags a virtual sphere the size of
 * the element) and by keyboard: the arrow keys turn the view 10° (45° with Shift)
 * about the screen axes. The element must be focusable for the keys (tabindex="0").
 * `get` and `set` hold the rotation; `set` is called on every change and should
 * redraw. Returns a `turnBy` for on-screen buttons.
 * @param {HTMLElement} element
 * @param {{ get: () => Quat, set: (rotation: Quat) => void }} state
 */
export function attachRotation(element, { get, set }) {
  /** @type {{ id: number, from: Vec3, start: Quat } | null} */
  let drag = null;
  const ball = (/** @type {PointerEvent} */ event) => {
    const box = element.getBoundingClientRect();
    const radius = Math.min(box.width, box.height) / 2;
    const x = (event.clientX - box.left - box.width / 2) / radius;
    const y = -(event.clientY - box.top - box.height / 2) / radius;
    const d = x * x + y * y;
    return /** @type {Vec3} */ (d <= 1 ? [x, y, Math.sqrt(1 - d)] : [x / Math.sqrt(d), y / Math.sqrt(d), 0]);
  };
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, from: ball(event), start: get() };
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const to = ball(event);
    const axis = cross(drag.from, to);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(drag.from, to)))) / DEG;
    if (Math.hypot(...axis) < 1e-9) return;
    set(quatMultiply(quatFromAxisAngle(axis, angle), drag.start));
  });
  const end = () => { drag = null; };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  const keys = /** @type {Record<string, 'left' | 'right' | 'up' | 'down'>} */ ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' });
  element.addEventListener('keydown', (event) => {
    const direction = keys[event.key];
    if (!direction) return;
    event.preventDefault();
    set(turn(get(), direction, event.shiftKey ? 45 : 10));
  });
  return {
    /** @param {'left' | 'right' | 'up' | 'down'} direction @param {number} [degrees] */
    turnBy: (direction, degrees = 15) => set(turn(get(), direction, degrees)),
  };
}
