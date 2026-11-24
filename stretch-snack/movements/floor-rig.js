// Articulated targets in metres, Y up. In prone and four-point work the crown
// points along +Z. Local right-to-left, pelvis-to-head and forward form a frame.
import {add, mixPoint as mix, cross, scaledTo, middleJoint, handGeometry} from './geometry.js';

export const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const mul = (a, k) => a.map((x) => x * k);
export const unit = (a) => scaledTo(a, 1);
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
export const midHip = (p) => mix(p.legs[0].hip, p.legs[1].hip, 0.5);

function transverse(v, axis) {
  const normal = sub(v, mul(axis, dot(v, axis)));
  if (Math.hypot(...normal) > 0.0001) return unit(normal);
  return unit(cross(axis, Math.abs(axis[1]) < 0.8 ? Y : Z));
}
function frame(up, across) {
  const y = unit(up),
    x = transverse(across, y);
  return [x, y, cross(x, y)];
}
function local(axes, point) {
  return axes.map((v) => dot(v, point));
}
function world(axes, [x, y, z]) {
  return add(mul(axes[0], x), add(mul(axes[1], y), mul(axes[2], z)));
}
export function head(p, up, across) {
  const axes = frame(up, across);
  const at = (v) => add(p.spine.chest, world(axes, v));
  p.skull = at([0, 0.214, -0.002]);
  p.crown = at([0, 0.285, 0]);
  p.face = at([0, 0.205, 0.076]);
  p.eyes = [-1, 1].map((s) => at([s * 0.034, 0.237, 0.077]));
}
// Carries the upper limbs with the rib cage. Re-solve the legs after moving
// the hips when the feet or knees should stay planted.
export function trunk(p, hipMid, up, across = X, faceDirection = undefined) {
  const oldHip = midHip(p),
    oldChest = mix(p.arms[0].shoulder, p.arms[1].shoulder, 0.5);
  const old = frame(p.spine?.chestUp ?? sub(oldChest, oldHip), sub(p.arms[1].shoulder, p.arms[0].shoulder));
  const axes = frame(up, across),
    at = (v) => add(hipMid, world(axes, v));
  const carry = (v) => at(local(old, sub(v, oldHip)));
  for (const l of p.legs) l.hip = at([l.s * 0.11, 0, 0]);
  for (const arm of p.arms) {
    for (const key of ['elbow', 'wrist', 'palm', 'thumb']) arm[key] = carry(arm[key]);
    arm.fingerJoints = arm.fingerJoints.map((chain) => chain.map(carry));
    arm.fingers = arm.fingerJoints.map((chain) => [chain[0], chain[3]]);
    arm.shoulder = at([arm.s * 0.182, 0.47, 0]);
  }
  p.centre = at([0, 0.24, 0]);
  p.neck = at([0, 0.47, 0]);
  p.spine = {pelvicUp: axes[1], chestUp: axes[1], chest: p.neck};
  head(p, axes[1], faceDirection ? cross(axes[1], faceDirection) : axes[0]);
}
function fit(origin, target, upper, lower, bend) {
  const r = sub(target, origin),
    d = Math.hypot(...r);
  const ray = d > 0.001 ? mul(r, 1 / d) : [0, -1, 0];
  const end = add(origin, mul(ray, Math.min(upper + lower - 0.001, Math.max(0.035, d))));
  return [middleJoint(origin, end, upper, lower, transverse(bend, ray)), end];
}
// Build digits in a hand-local frame to keep sideward reaches well-defined.
export function aimHand(arm, axis, across = undefined, close = 0.06) {
  const dir = unit(axis);
  // A palm reaching laterally normally has its fingers pointing outward,
  // thumb forward. Keeping that transverse component avoids an axis flip.
  const lateral = transverse(across ?? [1, 0, -0.4 * arm.s], dir);
  const normal = cross(lateral, dir);
  const fromLocal = (v) => add(arm.wrist, add(mul(lateral, v[0]), add(mul(normal, -v[1]), mul(dir, v[2]))));
  const digits = handGeometry([0, 0, 0.048], Z, arm.s, 0, close, 0.045);
  arm.palm = fromLocal([0, 0, 0.048]);
  arm.thumb = fromLocal(digits.thumb);
  arm.fingerJoints = digits.fingerJoints.map((chain) => chain.map(fromLocal));
  arm.fingers = arm.fingerJoints.map((c) => [c[0], c[3]]);
}
export function armAt(arm, wrist, axis = Z, bend = [arm.s, -0.45, -0.4], across = undefined) {
  [arm.elbow, arm.wrist] = fit(arm.shoulder, wrist, 0.26, 0.245, bend);
  aimHand(arm, axis, across);
}
export function armDirections(arm, upper, fore, handDirection = fore, across = undefined) {
  arm.elbow = add(arm.shoulder, scaledTo(upper, 0.26));
  arm.wrist = add(arm.elbow, scaledTo(fore, 0.245));
  aimHand(arm, handDirection, across);
}
export function shoe(leg, dir, across = X) {
  leg.toe = add(leg.ankle, scaledTo(dir, Math.hypot(0.054, 0.136)));
  leg.across = transverse(across, unit(dir));
  leg.heelHeight = undefined;
}
export function legAt(leg, ankle, bend = Z, toeDirection = [0, -0.37, 0.93], across = X) {
  [leg.knee, leg.ankle] = fit(leg.hip, ankle, 0.423, 0.414, bend);
  shoe(leg, toeDirection, across);
}
export function legDirections(leg, thigh, shin, toeDirection, across = X) {
  leg.knee = add(leg.hip, scaledTo(thigh, 0.423));
  leg.ankle = add(leg.knee, scaledTo(shin, 0.414));
  shoe(leg, toeDirection, across);
}
export function floorBase(move, seconds, basePose) {
  const {pose} = move;
  if (['standing', 'seated', 'supine'].includes(pose)) return basePose({pose, motion: 'rest'}, seconds);
  const p = basePose({pose: 'standing', motion: 'rest'}, seconds);
  let hip,
    up = Y,
    across = X;
  switch (pose) {
    case 'hands-and-knees':
      hip = [0, 0.487, -0.16];
      up = [0, 0.04, 1];
      break;
    case 'prone':
      hip = [0, 0.116, 0];
      up = Z;
      break;
    case 'side-lying':
      hip = [0, 0.19, 0];
      up = Z;
      across = Y;
      break;
    case 'kneeling':
      hip = [0, 0.482, -0.1];
      break;
    case 'long-sitting':
      hip = [0, 0.132, -0.24];
      break;
    default:
      throw new Error('Unknown floor posture ' + pose);
  }
  trunk(p, hip, up, across);
  for (const l of p.legs) {
    const s = l.s;
    if (pose === 'hands-and-knees' || pose === 'kneeling')
      legDirections(l, [s * 0.02, -1, 0.06], [s * 0.02, 0.035, -1], [0, -0.09, -1]);
    if (pose === 'long-sitting') legAt(l, [s * 0.13, 0.076, 0.594], [0, 1, 0.1], [0, 1, 0.25]);
    if (pose === 'prone') legDirections(l, [s * 0.025, -0.12, -1], [s * 0.01, 0.015, -1], [0, -0.1, -1]);
    if (pose === 'side-lying') legDirections(l, [0.55, -0.06, -1], [-0.7, 0.02, -1], [0.8, 0.04, -0.5], Y);
  }
  for (const h of p.arms) {
    const s = h.s;
    if (pose === 'hands-and-knees') armAt(h, [s * 0.192, 0.036, 0.32], Z, [s * 0.22, 0, -1], X);
    if (pose === 'kneeling') armAt(h, [s * 0.15, 0.56, 0.095], [s * 0.08, -0.85, 0.35]);
    if (pose === 'long-sitting') armAt(h, [s * 0.14, 0.19, -0.015], [s * 0.03, -0.2, 1], [s * 0.45, -0.1, -1]);
    if (pose === 'prone') armAt(h, [s * 0.246, 0.036, -0.005], [s * 0.07, -0.025, -1], [s * 0.5, -0.7, -0.26], X);
    if (pose === 'side-lying') armDirections(h, [1, 0.13, -0.15], [1, 0.07, 0.2], [1, 0.015, 0.1], Y);
  }
  return p;
}
