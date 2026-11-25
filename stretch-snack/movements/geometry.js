// Joint positions use metres, with Y up and Z forward.
/** @param {number[]} a @param {number[]} b */
export const add = (a, b) => a.map((x, i) => x + b[i]);
/** @param {number[]} a @param {number[]} b @param {number} t */
export const mixPoint = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
/** @param {number[]} point @param {number} yaw */
export const turn = ([x, y, z], yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), y, z * Math.cos(yaw) - x * Math.sin(yaw)];
/** @param {number[]} point @param {number} angle */
export const lean = ([x, y, z], angle) => [
  x * Math.cos(angle) + y * Math.sin(angle),
  y * Math.cos(angle) - x * Math.sin(angle),
  z,
];
/** Rotate about the left–right axis. Positive pitch brings the top of the trunk forward.
 * @param {number[]} point @param {number} angle */
export const pitchPoint = ([x, y, z], angle) =>
  [x, y * Math.cos(angle) - z * Math.sin(angle), y * Math.sin(angle) + z * Math.cos(angle)];
/** @param {number[]} vector @param {number} length */
export function scaledTo(vector, length) {
  const scale = length / Math.hypot(...vector);
  return vector.map(value => value * scale);
}
// Intersection of the two bone-length spheres. The bend direction picks the
// elbow or knee on the anatomically intended side of the shoulder–hand or hip–foot line.
/** @param {number[]} start @param {number[]} end @param {number} upper @param {number} lower @param {number[]} bend */
export function middleJoint(start, end, upper, lower, bend) {
  const ray = end.map((value, i) => value - start[i]);
  const distance = Math.hypot(...ray);
  const direction = ray.map(value => value / distance);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const dot = bend.reduce((sum, value, i) => sum + value * direction[i], 0);
  const perpendicular = scaledTo(bend.map((value, i) => value - dot * direction[i]),
    Math.sqrt(Math.max(0, upper * upper - along * along)));
  return start.map((value, i) => value + along * direction[i] + perpendicular[i]);
}

/** @param {number[]} a @param {number[]} b */
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const digitLengths = [0.069, 0.077, 0.071, 0.057];
const segmentFractions = [0.45, 0.31, 0.24];

/** @param {number[]} palm @param {number[]} axis @param {number} side @param {number} roll @param {number} close @param {number} spread */
export function handGeometry(palm, axis, side, roll, close, spread) {
  // Form a local palm frame, including pronation for the palm-turn exercise.
  const lateral = scaledTo([1 - axis[0] * axis[0], -axis[0] * axis[1], -axis[0] * axis[2]], 1);
  const normal = cross(lateral, axis);
  const cosRoll = Math.cos(roll), sinRoll = Math.sin(roll);
  const across = lateral.map((v, i) => v * cosRoll - normal[i] * sinRoll);
  const inward = normal.map((v, i) => v * cosRoll + lateral[i] * sinRoll);
  const angles = [0.03 + 1.01 * close, 0.08 + 2.27 * close, 0.13 + 2.94 * close];
  const segments = angles.map((angle, i) => ({
    forward: segmentFractions[i] * Math.cos(angle), inward: segmentFractions[i] * Math.sin(angle),
  }));
  const fingerJoints = [];
  for (let j = 0; j < 4; j++) {
    const length = digitLengths[side > 0 ? j : 3 - j];
    const offset = (j - 1.5) * 0.015;
    const base = palm.map((v, k) => v + across[k] * offset + axis[k] * (0.002 + 0.18 * (length - 0.057)));
    const angle = (j - 1.5) * spread;
    const cosSpread = Math.cos(angle), sinSpread = Math.sin(angle);
    const forward = axis.map((v, k) => v * cosSpread + across[k] * sinSpread);
    const joints = [base];
    let previous = base;
    for (const segment of segments) {
      previous = previous.map((v, i) => v + length * (forward[i] * segment.forward + inward[i] * segment.inward));
      joints.push(previous);
    }
    fingerJoints.push(joints);
  }
  const thumb = palm.map((v, i) => v - side * across[i] * (0.042 - 0.035 * close)
    + axis[i] * (0.018 + 0.015 * close) + inward[i] * (0.003 + 0.018 * close));
  return {fingerJoints, fingers: fingerJoints.map(joints => [joints[0], joints[3]]), thumb};
}

/** @param {number} t */
export function eased(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

// Anchor to the posed thigh after its final hip and knee have been solved.
// The wrist sits on the thick proximal thigh; the fingers follow its slope.
export function lapContact(leg) {
  const along = leg.knee.map((v, i) => v - leg.hip[i]);
  return {
    wrist: add(mixPoint(leg.hip, leg.knee, 0.35), [leg.s * 0.008, 0.152, 0.008 - 0.24 * along[1]]),
    axis: scaledTo([0.25 * along[0], along[1] - 0.018, along[2]], 1),
  };
}

export function restOnThigh(arm, leg) {
  const {wrist, axis} = lapContact(leg);
  arm.wrist = wrist;
  arm.elbow = middleJoint(arm.shoulder, wrist, 0.26, 0.245, [arm.s * 0.5, -0.6, -0.9]);
  arm.palm = add(wrist, axis.map(v => v * 0.045));
  Object.assign(arm, handGeometry(arm.palm, axis, arm.s, -0.3 * arm.s, 0, 0.045));
}
