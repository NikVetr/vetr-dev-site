// Body coordinates are metres, with Y up and Z forward. The same articulated
// pose is used by the small preview, full-screen coach and directory artwork.
/** @param {number[]} a @param {number[]} b */
const add = (a, b) => a.map((x, i) => x + b[i]);
/** @param {number[]} a @param {number[]} b @param {number} t */
export const mixPoint = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
/** @param {number[]} point @param {number} yaw */
const turn = ([x, y, z], yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), y, z * Math.cos(yaw) - x * Math.sin(yaw)];
/** @param {number[]} point @param {number} angle */
const lean = ([x, y, z], angle) => [
  x * Math.cos(angle) + y * Math.sin(angle),
  y * Math.cos(angle) - x * Math.sin(angle),
  z,
];

/** @param {number[]} vector @param {number} length */
function scaledTo(vector, length) {
  const scale = length / Math.hypot(...vector);
  return vector.map(value => value * scale);
}
// Intersection of the two bone-length spheres. The bend direction picks the
// elbow or knee on the anatomically intended side of the shoulder–hand or hip–foot line.
/** @param {number[]} start @param {number[]} end @param {number} upper @param {number} lower @param {number[]} bend */
function middleJoint(start, end, upper, lower, bend) {
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
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const digitLengths = [0.069, 0.077, 0.071, 0.057];
const segmentFractions = [0.45, 0.31, 0.24];

/** @param {number[]} palm @param {number[]} axis @param {number} side @param {number} roll @param {number} close @param {number} spread */
function handGeometry(palm, axis, side, roll, close, spread) {
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
function eased(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}
const bilateral = ['palm-turn', 'hand-open', 'wrist-bend', 'heel-lift', 'toe-lift',
  'shoulder-roll', 'shoulder-squeeze', 'chest-open', 'band-open', 'elbow-bend'];

/** @param {{motion:string, pose:string}} move @param {number} seconds */
export function movementPose(move, seconds) {
  const { motion, pose } = move;
  const seated = pose === 'seated';
  const supine = pose === 'supine';
  const cycle = Math.floor(seconds / 4);
  const a = (1 - Math.cos((seconds * Math.PI) / 2)) / 2;
  const side = cycle % 2 ? 1 : -1;
  /** @param {number} s */
  const active = (s) => bilateral.includes(motion) || s === side;
  /** @param {string} name */
  const motionAmount = (name) => (motion === name ? a : 0);
  const squat = motionAmount('knee-bend');
  const calf = motionAmount('calf-stretch');
  // Pivot the entire foot about the ball for heel raises. The toe remains planted.
  const footLength = Math.hypot(0.136, 0.054);
  const footAngle = Math.atan2(0.054, 0.136) + 0.47 * motionAmount('heel-lift') - 0.5 * motionAmount('toe-lift');
  const footDrop = footLength * Math.sin(footAngle);
  const footReach = footLength * Math.cos(footAngle);
  const rise = motion === 'heel-lift' ? footDrop - 0.054 : 0;
  const stepTravel = motionAmount('step-up');
  const stepHeight = 0.14;
  const pelvis = [
    0,
    (seated ? 0.51 : 0.91 + rise) - 0.095 * squat - 0.058 * calf + eased((stepTravel - 0.45) / 0.55) * stepHeight,
    -0.09 * squat + 0.04 * calf + stepTravel * 0.24,
  ];
  const yaw = side * 0.43 * motionAmount('trunk-turn');
  const bend = side * 0.19 * motionAmount('side-bend');
  /** @param {number[]} offset */
  const trunk = (offset) => add(pelvis, turn(lean(offset, bend), yaw));
  const rollAngle = 2 * Math.PI * eased(seconds / 4 - cycle);
  const shrug = motion === 'shoulder-roll' ? (1 - Math.cos(rollAngle)) / 2 : 0;
  const squeeze = motionAmount('shoulder-squeeze');
  const headYaw = yaw + side * 0.66 * motionAmount('neck-turn');
  const headTilt = bend + side * 0.26 * motionAmount('neck-tilt');
  const neck = trunk([0, 0.535, 0]);
  /** @param {number[]} offset */
  const head = (offset) => add(neck, turn(lean(offset, headTilt), headYaw));
  const arms = [-1, 1].map((s) => {
    const shoulder = trunk([
      s * (0.182 - 0.014 * squeeze),
      0.47 + 0.032 * shrug,
      -0.033 * squeeze - (motion === 'shoulder-roll' ? 0.026 * side * Math.sin(rollAngle) : 0),
    ]);
    const handWork = ['palm-turn', 'wrist-bend', 'hand-open', 'towel-grip', 'band-open', 'wrist-stretch'].includes(
      motion,
    );
    const chest = motionAmount('chest-open');
    const band = motionAmount('band-open');
    const upper = 0.26, lower = 0.245;
    const elbowAngle = motion === 'elbow-bend' ? 0.27 + 2.1 * a : handWork ? 1.45 : seated ? 1.1 : 0.24;
    const outward = 0.58 * band + 0.83 * chest;
    let elbow = add(shoulder, turn(scaledTo([s * (0.031 + 0.14 * chest), -0.25, -0.06 * chest], upper), yaw));
    let wrist = add(elbow, turn([
      s * lower * Math.sin(elbowAngle) * Math.sin(outward),
      -lower * Math.cos(elbowAngle), lower * Math.sin(elbowAngle) * Math.cos(outward),
    ], yaw));
    const support = !seated && !supine && s === 1 &&
      ['hip-side', 'calf-stretch', 'knee-bend', 'heel-lift', 'step-up'].includes(motion);
    if (support) {
      wrist = [0.32, 1.075, 0.27];
      elbow = middleJoint(shoulder, wrist, upper, lower, [0.8, -0.65, -0.6]);
    }
    if (motion === 'overhead-reach') {
      // Both arms share the same resting pose. The working arm rises in a
      // plane slightly forward of the shoulder while its bent elbow unfolds.
      const reach = active(s) ? a : 0;
      const angle = 0.1 + 2.75 * reach;
      const flex = 1.0 - 0.82 * reach;
      const armAxis = [s * Math.sin(angle) * 0.87, -Math.cos(angle), Math.sin(angle) * Math.sqrt(1 - 0.87 ** 2)];
      const forwardAxis = [-s * Math.sqrt(1 - 0.87 ** 2), 0, 0.87];
      elbow = add(shoulder, armAxis.map(v => v * upper));
      wrist = add(elbow, armAxis.map((v, i) => lower * (Math.cos(flex) * v + Math.sin(flex) * forwardAxis[i])));
    }
    if (motion === 'trunk-turn') {
      wrist = trunk([-s * 0.075, 0.31, 0.145 + s * 0.016]);
      elbow = middleJoint(shoulder, wrist, upper, lower, turn([s * 0.58, -1, 0.3], yaw));
    }
    if (motion === 'wrist-stretch') {
      const target = trunk(s === side ? [s * 0.04, 0.39, 0.415] : [side * 0.012, 0.425, 0.36]);
      wrist = mixPoint(wrist, target, a);
      elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.45, -1, -0.05]);
    }
    if (motion === 'towel-grip') {
      wrist = trunk([s * 0.16, 0.21, 0.2]);
      elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.3, -1, 0]);
    }
    if (supine) {
      // Before the final rotation onto the mat, negative Z moves toward it.
      // Keep relaxed elbows a little wider than the wrists and clear of the hips.
      wrist = add(shoulder, [s * 0.10, -0.47, -0.088]);
      elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.85, 0, -0.55]);
    }
    let handAxis;
    if (supine) handAxis = scaledTo([s * 0.05, -1, -0.13], 1);
    else if (support) handAxis = [0, -0.6, 0.8];
    else handAxis = scaledTo(wrist.map((v, i) => v - elbow[i]), 1);
    if (motion === 'wrist-bend' || (motion === 'wrist-stretch' && s === side)) {
      const angle = motion === 'wrist-stretch' ? 1.05 * a : a * 0.58 * side;
      handAxis = [
        handAxis[0],
        handAxis[1] * Math.cos(angle) + handAxis[2] * Math.sin(angle),
        handAxis[2] * Math.cos(angle) - handAxis[1] * Math.sin(angle),
      ];
    } else if (motion === 'wrist-stretch') {
      handAxis = scaledTo(mixPoint(handAxis, [side * 0.4, 0.5, 0.77], a), 1);
    }
    const palm = add(
      wrist,
      handAxis.map((v) => v * 0.045),
    );
    const close = motion === 'hand-open' ? 1 - a : motion === 'towel-grip' ? 0.24 + (active(s) ? 0.7 * a : 0) : 0;
    const spread = motion === 'hand-open' ? 0.025 + 0.115 * a : 0.045;
    const roll = motion === 'palm-turn' ? (a * 2.8 - 1.35) * s : supine ? 0 : 0.12 * s;
    return {s, shoulder, elbow, wrist, palm, ...handGeometry(palm, handAxis, s, roll, close, spread)};
  });
  const legs = [-1, 1].map((s) => {
    if (supine) {
      const slide = active(s) ? motionAmount('heel-slide') : 0;
      const roll = side * motionAmount('knee-roll');
      const hip = [s * 0.11, 0.115, 0.01 - motionAmount('pelvic-tilt') * 0.014];
      const ankle = [s * 0.12, 0.071, 0.64 + 0.16 * slide];
      const knee = middleJoint(hip, ankle, 0.42, 0.41, [0.76 * roll, 1, 0]);
      return { s, hip, knee, ankle, toe: add(ankle, [0, -0.037, 0.14]) };
    }
    const hip = add(pelvis, [s * 0.11, 0, 0]);
    const working = active(s);
    let knee, ankle;
    if (seated) {
      const lift = working ? motionAmount('seated-march') : 0;
      const extend = working ? motionAmount('knee-extend') : 0;
      const thighAngle = -0.076 + lift * 0.25;
      knee = add(hip, [s * 0.015, 0.39 * Math.sin(thighAngle), 0.39 * Math.cos(thighAngle)]);
      ankle = add(knee, [0, -0.402 * Math.cos(extend * 1.24), 0.402 * Math.sin(extend * 1.24)]);
      if (motion === 'foot-roll' || motion === 'heel-lift') {
        const roll = working ? motionAmount('foot-roll') : 0;
        ankle = add(ankle, [0, rise + 0.055 * roll, (rise ? 0.136 - footReach : 0) + 0.13 * roll]);
        knee = middleJoint(hip, ankle, Math.hypot(0.39, 0.015), 0.402, [0, 0, 1]);
      }
    } else {
      const abduction = working ? motionAmount('hip-side') : 0;
      const stride = working ? eased(calf / 0.64) : 0;
      const step = motion === 'step-up' ? eased(working ? stepTravel / 0.45 : (stepTravel - 0.45) / 0.55) : 0;
      ankle = [
        s * (0.128 + 0.235 * abduction),
        0.084 + 0.046 * abduction + rise + 0.045 * Math.sin(Math.PI * stride)
          + stepHeight * step + 0.11 * Math.sin(Math.PI * step),
        -0.22 * stride + step * 0.32 + (rise ? 0.136 - footReach : 0),
      ];
      knee = middleJoint(hip, ankle, 0.423, 0.414, [0, 0, 1]);
    }
    const toe = add(ankle, [0, -footDrop, footReach]);
    return { s, hip, knee, ankle, toe };
  });
  let centre = trunk([0, 0.24, 0]);
  let face = head([0, 0.14, 0.076]);
  let skull = head([0, 0.149, -0.002]);
  let crown = head([0, 0.22, 0]);
  let eyes = [-1, 1].map((s) => head([s * 0.034, 0.172, 0.077]));
  if (supine) {
    // The legs were built against the mat; rotate the upper body into that frame.
    /** @param {number[]} point */
    const recline = ([x, y, z]) => [x, 0.119 + z, 0.92 - y];
    for (const arm of arms) {
      for (const key of /** @type {const} */ (['shoulder', 'elbow', 'wrist', 'palm', 'thumb']))
        arm[key] = recline(arm[key]);
      arm.fingerJoints = arm.fingerJoints.map(chain => chain.map(recline));
      arm.fingers = arm.fingerJoints.map(chain => [chain[0], chain[3]]);
    }
    eyes = eyes.map(recline);
    centre = recline(centre);
    face = recline(face);
    skull = recline(skull);
    crown = recline(crown);
  }
  return {
    arms,
    legs,
    centre,
    skull,
    face,
    crown,
    eyes,
    neck: mixPoint(arms[0].shoulder, arms[1].shoulder, 0.5),
    a,
    side,
  };
}
