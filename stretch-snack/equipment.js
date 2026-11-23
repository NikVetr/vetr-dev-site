import {drawHandNeckProps} from './movements/hand-neck-props.js';
import {drawUpperProps} from './movements/upper-props.js';
import {drawLowerProps} from './movements/lower-props.js';
// Props share the trainer's depth buffer and world coordinates in metres.
import { mixPoint } from './movements/geometry.js';

const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const circle = (n) =>
  Array.from({ length: n }, (_, i) => [Math.cos((i * 2 * Math.PI) / n), Math.sin((i * 2 * Math.PI) / n)]);
const round = circle(12),
  bodyRound = circle(20);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const len = Math.hypot(...a) || 1;
  return a.map((v) => v / len);
};
const along = (a, v, t) => [a[0] + v[0] * t, a[1] + v[1] * t, a[2] + v[2] * t];
function perpendicular(reference, axis) {
  const candidate = along(reference, axis, -dot(reference, axis));
  if (dot(candidate, candidate) > Math.max(1e-12, dot(reference, reference) * 0.001)) return unit(candidate);
  return unit(cross(axis, Math.abs(axis[2]) < 0.9 ? Z : Y));
}
function ring(at, x, z, rx, rz, samples) {
  return samples.map(([c, s]) => along(along(at, x, c * rx), z, s * rz));
}

// Sweep a continuous tapered skin through each bend. Bisection at elbows and
// knees keeps each joint joined as the two shafts change direction.
function sweep(mesh, points, radii, color, reference = X, samples = round, colors = undefined) {
  let lateral = reference;
  const rings = points.map((p, i) => {
    const last = i ? unit(sub(p, points[i - 1])) : null;
    const next = i + 1 < points.length ? unit(sub(points[i + 1], p)) : null;
    const axis = last && next ? unit(add(last, next)) : last || next;
    lateral = perpendicular(lateral, axis);
    return ring(p, lateral, cross(lateral, axis), radii[i][0], radii[i][1], samples);
  });
  mesh.surface(rings, color, colors);
}
export function rod(mesh, a, b, r, color) {
  sweep(
    mesh,
    [a, b],
    [
      [r, r],
      [r, r],
    ],
    color,
  );
}
export function ellipsoid(mesh, at, x, y, z, rx, ry, rz, color) {
  const latitudes = [-0.999, -0.82, -0.48, 0, 0.48, 0.82, 0.999];
  mesh.surface(
    latitudes.map((h) => {
      const factor = Math.sqrt(1 - h * h);
      return ring(along(at, y, h * ry), x, z, rx * factor, rz * factor, round);
    }),
    color,
  );
}

// Rounded seat pads and exercise equipment share the trainer's depth buffer.
export function pad(mesh, center, w, d, h, r, color) {
  const outline = [];
  for (const [cx, cz, start] of [
    [w - r, d - r, 0],
    [-w + r, d - r, 90],
    [-w + r, -d + r, 180],
    [w - r, -d + r, 270],
  ]) {
    for (let i = 0; i <= 3; i++) {
      const a = ((start + i * 30) * Math.PI) / 180;
      outline.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  const layers = [
    [-h, 0.01],
    [-h, 0.96],
    [-h * 0.65, 1],
    [h * 0.62, 1],
    [h, 0.96],
    [h, 0.01],
  ];
  mesh.surface(
    layers.map(([dy, k]) => outline.map(([x, z]) => add(center, [x * k, dy, z * k]))),
    color,
  );
}
// A firm chair back contacts the ball just to one side of the spine. It rolls
// a short distance along that same track as the upper body shifts.
export const backBallRadius = 0.029;
export function backBallCenter(pose) {
  return [-0.082, 0.83 + 0.01 * pose.a, -0.16];
}
export function drawEquipment(mesh, p, move, location, seconds) {
  const metal = '#9aaead',
    cushion = '#adbfba',
    accent = '#c98a48';
  if (move.pose === 'seated') {
    pad(mesh, [0, 0.419, 0.071], 0.245, 0.241, 0.03, 0.046, cushion);
    for (const s of [-1, 1]) {
      for (const z of [-0.13, 0.235])
        rod(mesh, [s * 0.226, 0.009, z * 1.18], [s * 0.204, 0.409, z], 0.013, metal);
      rod(mesh, [s * 0.205, 0.41, -0.13], [s * 0.203, 0.889, -0.21], 0.012, metal);
    }
    // Backrest tilts gently with the chair frame.
    mesh.surface(
      [
        [0.51, 0.17, 0.018],
        [0.53, 0.218, 0.024],
        [0.64, 0.22, 0.027],
        [0.85, 0.229, 0.029],
        [0.9, 0.217, 0.023],
        [0.912, 0.159, 0.014],
      ].map(([y, w, d]) => ring([0, y, -0.174 - (y - 0.51) * 0.12], X, Z, w, d, bodyRound)),
      cushion,
    );
    if (!move.family && move.motion === 'ball-back')
      ellipsoid(mesh, backBallCenter(p), X, Y, Z, backBallRadius, backBallRadius, backBallRadius, accent);
    if (['plane-seat', 'train-seat'].includes(location))
      for (const s of [-1, 1]) {
        rod(mesh, [s * 0.266, 0.427, 0.16], [s * 0.266, 0.605, 0.16], 0.012, metal);
        rod(mesh, [s * 0.266, 0.615, -0.145], [s * 0.266, 0.615, 0.19], 0.016, cushion);
      }
  }
  if (move.pose === 'supine') pad(mesh, [0, -0.017, 0.012], 0.385, 1.035, 0.017, 0.054, '#a3c4bc');
  if (move.motion === 'step-up') pad(mesh, [0, 0.07, 0.426], 0.282, 0.203, 0.07, 0.018, cushion);
  if (move.equipment?.includes('support') && move.animation !== 'pendulum') {
    rod(mesh, [0.32, 0.009, 0.4], [0.32, 1.055, 0.4], 0.015, metal);
    rod(mesh, [0.32, 1.055, 0.015], [0.32, 1.055, 0.55], 0.02, metal);
  }
  if (move.family === 'hand-neck') return drawHandNeckProps(mesh, p, move, seconds);
  if (move.family === 'upper') return drawUpperProps(mesh, p, move, seconds);
  if (move.family === 'lower') return drawLowerProps(mesh, p, move, seconds);
  if (move.motion === 'band-open') rod(mesh, p.arms[0].palm, p.arms[1].palm, 0.007, accent);
  if (move.motion === 'foot-roll' || move.motion === 'towel-grip') {
    // The prop travels between the releasing and receiving sides at rest.
    const local = seconds % 4,
      index = p.side === 1 ? 1 : 0;
    const blend = Math.max(0, 1 - Math.min(local, 4 - local) / 0.42);
    const t = 0.5 * blend * blend * (3 - 2 * blend);
    if (move.motion === 'towel-grip') {
      const grip = mixPoint(p.arms[index].palm, p.arms[1 - index].palm, t);
      drawTowel(mesh, grip);
    } else {
      const ankle = mixPoint(p.legs[index].ankle, p.legs[1 - index].ankle, t);
      const center = [ankle[0], 0.04, ankle[2] + 0.075 - 0.065 * p.a];
      if (move.equipment?.includes('roller'))
        rod(mesh, add(center, [-0.093, 0, 0]), add(center, [0.093, 0, 0]), 0.04, accent);
      else ellipsoid(mesh, center, X, Y, Z, 0.04, 0.04, 0.04, accent);
    }
  }
}

export function drawTowel(mesh, grip) {
  rod(mesh, add(grip, [-0.047, -0.01, 0.008]), add(grip, [0.047, -0.01, 0.008]), 0.021, '#9db9aa');
}
