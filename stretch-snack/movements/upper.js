// All authored arm directions use anatomical coordinates: X across the body,
// Y towards the head and Z towards the chest. The same geometry can lie on a mat.
import {add, mixPoint, scaledTo, middleJoint, handGeometry, pitchPoint, eased} from './geometry.js';

/** @typedef {ReturnType<typeof import('../pose.js').basePose>} Pose */
/** @typedef {Pose['arms'][number]} Arm */
/** @typedef {(v: number[])=>number[]} Frame */
/** @type {Frame} */
const upright = v => v;
/** @type {Frame} */
const recline = ([x, y, z]) => [x, z, -y];
/** @param {number[]} v @param {number[]} u */
const subtract = (v, u) => v.map((coordinate, i) => coordinate - u[i]);
/** @param {number[]} a @param {number[]} b */
const length = (a, b) => Math.hypot(...subtract(a, b));
const upperLength = 0.26,
  foreLength = 0.245;
const movements = new Set([
  'cross-arm',
  'shoulder-shrug',
  'elbow-back-press',
  'hand-press-out',
  'pendulum',
  'low-row',
  'seat-press',
  'lying-arm-raise',
  'scaption',
  'lying-arm-rotation',
  'chair-back-extension',
  'towel-extension',
  'roller-extension',
  'towel-spine-opener',
  'lying-reach',
  'floor-angel',
  'ball-back',
  'shoulder-knead',
  'chest-stroke',
  'hands-back-stretch',
  'elbow-opener',
  'towel-up-back',
]);

/** @param {Arm} arm @param {Frame} frame @param {number[]} axis */
function handAt(arm, frame, axis, roll = 0, close = 0, spread = 0.035) {
  const direction = scaledTo(axis, 1);
  const palm = scaledTo(direction, 0.045);
  const geometry = handGeometry(palm, direction, arm.s, roll, close, spread);
  /** @param {number[]} point */
  const world = point => add(arm.wrist, frame(point));
  arm.palm = world(palm);
  arm.thumb = world(geometry.thumb);
  arm.fingerJoints = geometry.fingerJoints.map(chain => chain.map(world));
  arm.fingers = arm.fingerJoints.map(chain => [chain[0], chain[3]]);
}

// Targets relative to the shoulder make the same seated and standing stretch
// use the same joint angles. Keep a little elbow bend at maximum reach.
/** @param {Arm} arm @param {Frame} frame @param {number[]} offset @param {number[]} pole @param {number[]} axis */
function reach(arm, frame, offset, pole, axis, roll = 0, close = 0) {
  const vector = scaledTo(offset, Math.min(upperLength + foreLength - 0.004, Math.hypot(...offset)));
  arm.wrist = add(arm.shoulder, frame(vector));
  arm.elbow = middleJoint(arm.shoulder, arm.wrist, upperLength, foreLength, frame(pole));
  handAt(arm, frame, axis, roll, close);
}

/** @param {Arm} arm @param {Frame} frame @param {number[]} upper @param {number[]} fore */
function swing(arm, frame, upper, fore, axis = fore, roll = 0) {
  arm.elbow = add(arm.shoulder, frame(scaledTo(upper, upperLength)));
  arm.wrist = add(arm.elbow, frame(scaledTo(fore, foreLength)));
  handAt(arm, frame, axis, roll);
}

/** @param {Pose} p @param {boolean} floor @param {number[]} pivot @param {number} pitch */
function changeChest(p, floor, pivot, pitch, lift = 0, slide = 0) {
  // Positive angle bends towards the front of the torso, also when supine.
  const up = floor ? [0, 0, -1] : [0, 1, 0];
  /** @param {number[]} point */
  const transform = point => add(add(pivot, pitchPoint(subtract(point, pivot), pitch)), [slide, lift, 0]);
  const chest = transform(p.neck);
  for (const key of /** @type {const} */ (['skull', 'crown', 'face', 'neck'])) p[key] = transform(p[key]);
  p.eyes = p.eyes.map(transform);
  p.centre = mixPoint(p.centre, transform(p.centre), 0.55);
  for (const arm of p.arms) arm.shoulder = transform(arm.shoulder);
  p.spine = {pelvicUp: up, chestUp: pitchPoint(up, pitch), chest};
}

/** @param {Pose} p @param {string} id @param {number} a */
function floorSupport(p, id, a) {
  // Both props lift the thorax off the mat. The head descends over the roll;
  // the legs stay planted as the upper spine extends around the contact.
  const radius = id === 'roller-extension' ? 0.061 : 0.035;
  const pivot = [0, p.centre[1], -0.31];
  const opening = id === 'towel-spine-opener';
  changeChest(p, true, pivot, opening ? 0.09 : 0.22 - 0.24 * a, radius * (opening ? 1.08 : 1.45));
}

/** @param {Pose} p @param {number} a */
function pressSeat(p, a) {
  const lift = 0.016 * a;
  changeChest(p, false, p.centre, 0, lift);
  for (const leg of p.legs) {
    const thigh = length(leg.hip, leg.knee),
      shin = length(leg.knee, leg.ankle);
    leg.hip[1] += lift;
    leg.knee = middleJoint(leg.hip, leg.ankle, thigh, shin, [leg.s * 0.045, 0.18, 1]);
  }
  for (const arm of p.arms) {
    const s = arm.s;
    arm.shoulder[1] -= 0.039 + 0.006 * a;
    const elbowPole = [s * 0.8, -0.35, -0.5];
    reach(
      arm,
      upright,
      subtract([s * 0.205, 0.485, 0.033], arm.shoulder),
      elbowPole,
      [s * 0.08, -0.045, 1],
      s * 0.12
    );
  }
}

/** @param {Pose} p @param {Frame} frame @param {number} t */
function crossedStretch(p, frame, t) {
  const working = p.arms[p.side === 1 ? 1 : 0],
    helper = p.arms[p.side === 1 ? 0 : 1];
  for (const arm of [working, helper]) {
    const s = arm.s;
    const prep = [s * 0.035, -0.27, 0.26];
    let target, aim, pole;
    if (arm === working) {
      target = [-s * 0.396, -0.045, 0.238];
      aim = [-s * 0.91, 0.03, 0.32];
      pole = [s * 0.25, -0.7, 0.55];
    } else {
      const elbow = working.elbow;
      target = subtract(add(elbow, [s * 0.036, -0.044, 0.025]), helper.shoulder);
      aim = [-s * 0.58, 0.72, -0.33];
      pole = [s * 0.52, -0.91, 0.19];
    }
    reach(
      arm,
      frame,
      mixPoint(prep, target, t),
      mixPoint([s * 0.55, -0.78, 0.05], pole, t),
      mixPoint([s * 0.08, -0.04, 0.99], aim, t),
      s * 0.2,
      arm === helper ? 0.18 * t : 0
    );
  }
}

/** @param {Pose} p @param {Frame} frame @param {number} a @param {number} hold */
function resistedRotation(p, frame, a, hold) {
  const working = p.arms[p.side === 1 ? 1 : 0],
    helper = p.arms[p.side === 1 ? 0 : 1];
  const s = working.s;
  const target = [-s * 0.113, -0.228, 0.238];
  reach(
    working,
    frame,
    mixPoint([s * 0.015, -0.29, 0.17], target, hold),
    mixPoint([s * 0.5, -0.99, 0.05], [s * 0.45, -1, -0.65], hold),
    [s * 0.06, 0.01, 1],
    s * 0.2,
    0.63 * hold
  );
  const h = helper.s;
  const grip = mixPoint(working.elbow, working.wrist, 0.83);
  const to = subtract(add(grip, [s * 0.011, -0.025, 0.046]), helper.shoulder);
  reach(
    helper,
    frame,
    mixPoint([h * 0.015, -0.29, 0.17], to, hold),
    mixPoint([h * 0.5, -0.99, 0.05], [h * 0.57, -0.07, 1.15], hold),
    mixPoint([h * 0.06, 0.01, 1], [s * 0.65, 0.53, -0.1], hold),
    h * 0.2,
    0.42 * hold
  );
  p.activation = eased((a - 0.44) / 0.46);
}

/** @param {Pose} p @param {number} seconds */
function pendulum(p, seconds) {
  const phase = (seconds % 4) / 4;
  p.side = Math.floor(seconds / 4) % 2 ? 1 : -1;
  // Put both hands down before changing sides. Each free swing begins from
  // the same support edge where the hand will return.
  const release = eased(Math.min(phase, 1 - phase) / 0.32);
  const swingPhase = 4 * Math.PI * phase;
  const circle = eased((phase - 0.32) / 0.28);
  const sway = 0.015 * Math.sin(swingPhase) * release;
  const hips = mixPoint(p.legs[0].hip, p.legs[1].hip, 0.5);
  changeChest(p, false, hips, 0.67 + 0.018 * Math.sin(swingPhase) * release, 0, sway * circle);
  for (const arm of p.arms) {
    const s = arm.s,
      free = s === p.side ? release : 0;
    const palmYaw = Math.sin(swingPhase - 0.25) * circle;
    const down = [s * (0.04 + 0.065 * palmYaw), -0.485, 0.084 * Math.cos(swingPhase - 0.25)];
    const target = mixPoint([s * 0.275, 1.084, 0.27], add(arm.shoulder, down), free);
    const pole = [s * (0.81 - 0.51 * free), -0.65, -0.6];
    arm.wrist = target;
    arm.elbow = middleJoint(arm.shoulder, target, upperLength, foreLength, pole);
    const axis = mixPoint([s * 0.03, 0, 1], [s * 0.05, -0.97, 0.23], free);
    handAt(arm, upright, axis, s * 0.12, 0.71 * (1 - free), 0.045);
    arm.holdingRail = free < 0.001;
  }
}

/** @param {Arm} arm @param {Frame} frame @param {number} open */
function neckCradle(arm, frame, open) {
  const s = arm.s;
  // Keep the palms at the occiput while the elbow poles fan apart.
  const wrist = [s * -0.095, 0.17, -0.109];
  reach(
    arm,
    frame,
    wrist,
    [s * (0.53 + 0.99 * open), 0.18, 0.95 - 1.59 * open],
    [-s * 0.57, 0.74, -0.28],
    -s * 0.3
  );
}

/** @param {{animation?:string,pose:string,motion:string}} move @param {number} seconds @param {typeof import('../pose.js').basePose} basePose */
export function upperPose(move, seconds, basePose) {
  const id = move.animation;
  if (!id || !movements.has(id) || (id === 'ball-back' && move.pose !== 'supine')) return;
  const floor = move.pose === 'supine',
    frame = floor ? recline : upright;
  const p = basePose({motion: 'neutral', pose: move.pose}, seconds);
  const phase = (seconds / 4) % 1;
  const a = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const hold = eased(Math.min(phase, 1 - phase) / 0.3);
  const engage = eased(Math.min(phase, 1 - phase) / 0.41);
  p.a = a;
  if (id === 'pendulum') {
    pendulum(p, seconds);
    return p;
  }
  if (id === 'cross-arm') {
    crossedStretch(p, frame, engage);
    return p;
  }
  if (id === 'hand-press-out') {
    resistedRotation(p, frame, a, hold);
    return p;
  }
  if (id === 'seat-press') {
    pressSeat(p, a);
    return p;
  }
  if (move.pose === 'seated' && ['hands-back-stretch', 'towel-up-back', 'chair-back-extension'].includes(id)) {
    // Slide forward for space behind the hands or back to the chair's top edge.
    const shift = id === 'chair-back-extension' ? -0.109 : 0.17;
    for (const leg of p.legs) for (const key of /** @type {const} */ (['hip', 'knee', 'ankle', 'toe'])) leg[key][2] += shift;
    for (const key of /** @type {const} */ (['centre', 'neck', 'face', 'crown', 'skull'])) p[key][2] += shift;
    for (const eye of p.eyes) eye[2] += shift;
    for (const arm of p.arms) arm.shoulder[2] += shift;
  }
  if (id === 'chair-back-extension') changeChest(p, false, [0, 0.89, -0.19], -0.33 * a);
  if (['roller-extension', 'towel-extension', 'towel-spine-opener'].includes(id)) floorSupport(p, id, a);
  if (id === 'ball-back') {
    changeChest(p, true, [0, 0.115, -0.28], 0.065 - 0.055 * a, 0.018 + 0.008 * (1 - a), 0.024 * a);
    // Arms remain relaxed beside the trunk, translating with the small roll.
    for (const arm of p.arms) {
      const s = arm.s;
      reach(arm, frame, [s * 0.097, -0.466, -0.075], [s * 0.8, 0, -0.57], [s * 0.05, -1, 0.03]);
    }
    return p;
  }
  for (const arm of p.arms) {
    const s = arm.s,
      active = s === p.side;
    switch (id) {
      case 'shoulder-shrug': {
        arm.shoulder[1] += 0.043 * hold;
        const neutral = subtract(arm.wrist, arm.shoulder);
        reach(
          arm,
          frame,
          add(neutral, [0, 0.032 * hold, 0]),
          [s * 0.5, -0.6, -0.9],
          move.pose === 'seated' ? [s * 0.03, -0.1, 1] : [s * 0.1, -0.98, 0.18]
        );
        break;
      }
      case 'elbow-back-press': {
        // Bend the elbow with its tip against the inside of the chair back.
        arm.shoulder[2] -= 0.008 * hold;
        swing(arm, frame, [s * 0.06, -0.84, -0.55], [s * 0.01, -0.06, 1]);
        p.activation = hold;
        break;
      }
      case 'low-row': {
        arm.shoulder[2] += 0.024 - 0.053 * a;
        swing(arm, frame, [s * 0.13, -0.06 - 0.9 * a, 0.97 - 1.42 * a], [s * 0.02, -0.1 + 0.27 * a, 0.99]);
        break;
      }
      case 'lying-arm-raise': {
        const angle = 0.25 + 2.64 * a;
        const meet = [-s * 0.169, -0.482 * Math.cos(angle), 0.482 * Math.sin(angle)];
        meet[2] += s * 0.013;
        reach(
          arm,
          frame,
          meet,
          [s * 0.83, -0.15, 0.22],
          [-s * 0.28, -Math.cos(angle), Math.sin(angle)],
          s * 0.2,
          0.29
        );
        break;
      }
      case 'scaption': {
        const angle = 0.11 + 1.43 * a;
        const shaft = [s * 0.84 * Math.sin(angle), -Math.cos(angle), 0.54 * Math.sin(angle)];
        const fore = [shaft[0] * 0.92, shaft[1] + 0.08, shaft[2] + 0.14];
        swing(arm, frame, shaft, fore, fore, -s * 0.95);
        break;
      }
      case 'lying-arm-rotation': {
        const angle = 1.19 * Math.sin(2 * Math.PI * phase + 0.7) * hold * (active ? 1 : 0);
        swing(arm, frame, [s * 0.96, 0.065, -0.27], [s * 0.04, Math.sin(angle), Math.cos(angle)]);
        break;
      }
      case 'chair-back-extension': {
        reach(
          arm,
          frame,
          [-s * 0.292, -0.109, 0.168 + s * 0.019],
          [s * 0.55, -0.85, 0.27],
          [-s * 0.71, 0.59, -0.31]
        );
        break;
      }
      case 'towel-extension':
      case 'roller-extension':
      case 'towel-spine-opener':
      case 'elbow-opener':
        neckCradle(arm, frame, id.includes('opener') ? (floor ? 0.76 : 1) * a : 0.62);
        break;
      case 'lying-reach': {
        arm.shoulder[1] += 0.032 * a;
        swing(arm, frame, [s * 0.04, 0.03, 0.99], [-s * 0.06, 0.12, 0.99]);
        break;
      }
      case 'floor-angel': {
        const angle = 0.09 + 0.92 * a;
        swing(
          arm,
          frame,
          [s * Math.cos(angle), Math.sin(angle), -0.205],
          [s * 0.06, 0.99, -0.09],
          [s * 0.04, 0.99, -0.015],
          (s * Math.PI) / 2
        );
        break;
      }
      case 'shoulder-knead':
      case 'chest-stroke': {
        const progress = active ? eased(Math.min(phase, 1 - phase) / 0.34) : 0;
        const rub = Math.pow(Math.sin(Math.PI * phase * 3), 2);
        const knead = id === 'shoulder-knead';
        const target = knead
          ? [-s * (0.28 + 0.025 * rub), 0.054 + 0.009 * rub, 0.093]
          : [-s * (0.167 + 0.116 * rub), -0.087 + 0.077 * rub, 0.133 - 0.029 * rub];
        const neutral = subtract(arm.wrist, arm.shoulder);
        const pole = mixPoint(
          scaledTo(subtract(arm.elbow, arm.shoulder), 1),
          [s * 0.38, -0.72, 0.63],
          progress
        );
        const restAim = scaledTo(subtract(arm.palm, arm.wrist), 1);
        const angle = Math.atan2(restAim[1], restAim[2]) * (1 - progress) + (knead ? -2.2 : -2.13) * progress;
        const sweep = Math.asin(restAim[0]) * (1 - progress) - s * (knead ? 0.71 : 1.1) * progress;
        const aim = [Math.sin(sweep), Math.cos(sweep) * Math.sin(angle), Math.cos(sweep) * Math.cos(angle)];
        reach(
          arm,
          frame,
          mixPoint(neutral, target, progress),
          pole,
          aim,
          s * (0.14 * (1 - progress) + (knead ? 1.65 : 0.85) * progress),
          knead ? progress * (0.22 + 0.39 * rub) : 0
        );
        break;
      }
      case 'hands-back-stretch': {
        arm.shoulder[2] -= 0.021 * hold;
        reach(
          arm,
          frame,
          [-s * 0.154, -0.347 - 0.038 * hold, -0.206 - 0.016 * hold],
          [s * 0.76, -0.34, -0.7],
          [-s * 0.42, -0.88, -0.05],
          s * 0.32,
          0.46
        );
        break;
      }
      case 'towel-up-back': {
        const high = s === 1;
        const target = high
          ? [-s * 0.092, 0.127 + 0.056 * a, -0.155]
          : [-s * 0.117, -0.245 + 0.056 * a, -0.185];
        const pole = high ? [s * 0.72, 0.88, 0.22] : [s * 0.72, -0.51, -0.68];
        reach(
          arm,
          frame,
          target,
          pole,
          high ? [-s * 0.25, -0.93, -0.21] : [-s * 0.3, 0.93, 0.2],
          s * 0.21,
          0.56
        );
        break;
      }
    }
  }
  return p;
}

/** @param {Pose} p @param {import('../pose.js').Movement} move */
export function upperActivation(p, move) {
  if (move.animation === 'elbow-back-press')
    return {label: 'Press elbows back', points: p.arms.map(a => a.elbow)};
  if (move.animation === 'hand-press-out')
    return {label: 'Press outward', points: [p.arms[p.side === 1 ? 1 : 0].wrist]};
}
