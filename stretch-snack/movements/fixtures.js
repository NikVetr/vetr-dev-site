// Fixed targets are in metres. A hand on a wall, a heel on a chair and the
// counter edge keep their world positions as the trainer moves against them.
import {add, mixPoint, scaledTo, restOnThigh, eased} from './geometry.js';
import {moveUpper, torso, placeLeg, orientFoot} from './lower.js';
import {handAt, reach, swing, changeChest} from './upper.js';

const upright = (v) => v;
const lying = ([x, y, z]) => [x, z, -y];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const pressMotions = [
  'head-press',
  'elbow-back-press',
  'wall-press-side',
  'wall-press-out',
  'wall-press-forward'
];
export function rearWallZ(id) {
  if (id === 'wall-squat') return -0.163;
  if (id === 'ball-back') return -0.191;
  if (id === 'ball-low-back') return -0.155;
  return -0.137;
}
export const bedTop = 0.52;
export const chairHeelHeight = 0.433;
export const stepHeight = 0.185;
export const backCounterY = 0.919;
export const counterY = 1.023;
export const trayY = 0.712;

function plantPalm(arm, palm, direction, guide = [arm.s * 0.75, -0.6, -0.3], roll = 0, curl = 0) {
  const wrist = sub(palm, scaledTo(direction, 0.045));
  reach(arm, upright, sub(wrist, arm.shoulder), guide, direction, roll, curl);
}
function feet(p, targets) {
  for (const [i, leg] of p.legs.entries()) {
    placeLeg(leg, targets[i]);
    orientFoot(leg);
  }
}
function planted(p, z = 0, x = 0.128) {
  feet(
    p,
    p.legs.map((leg) => [leg.s * x, 0.084, z])
  );
}
function wallPress(p, id, hold) {
  p.activation = hold;
  if (id === 'head-press') {
    // Recline the whole torso slightly until the occiput meets the head pad.
    torso(p, [0, 0, -0.014], -0.075);
    return;
  }
  for (const arm of p.arms) {
    const s = arm.s;
    if (id === 'elbow-back-press') {
      swing(arm, upright, [s * 0.055, -0.22, -0.097], [s * 0.025, -0.006, 0.244]);
    } else if (id === 'wall-press-forward') {
      swing(arm, upright, [s * 0.034, -0.256, -0.015], [s * 0.012, 0, 0.245]);
      handAt(arm, upright, [s * 0.035, 0, 1], 0, 0.92);
    } else if (s === -1) {
      const handOnly = id === 'wall-press-out';
      swing(
        arm,
        upright,
        [s * (handOnly ? 0.027 : 0.081), -0.26, -0.019],
        [s * (handOnly ? 0.07 : 0.006), 0.008, 0.245]
      );
      handAt(arm, upright, [s * 0.025, 0, 1], s * 1.48, 0.14);
    }
  }
}
function forearmSlide(p, a) {
  // Elbow and wrist travel in one vertical plane. The upper arm sweeps out
  // and up while both little-finger edges slide along the panel.
  for (const arm of p.arms) {
    const theta = 0.32 + 2.25 * a,
      depth = 0.158,
      r = Math.sqrt(0.26 ** 2 - depth ** 2);
    arm.elbow = add(arm.shoulder, [arm.s * r * Math.sin(theta), -r * Math.cos(theta), depth]);
    arm.wrist = add(arm.elbow, [0, 0.245, 0]);
    handAt(arm, upright, [0, 1, 0], -arm.s * 1.45);
  }
}
function forwardSupport(p, id, a) {
  if (id === 'wall-push-up') {
    const angle = 0.06 + 0.205 * a;
    // Ankle-pivoted push-up keeps ear, hip and ankle in line.
    torso(p, [0, 0.826 * (Math.cos(angle) - 1), 0.826 * Math.sin(angle)], angle, 0, 0, angle);
    planted(p);
    for (const arm of p.arms)
      plantPalm(arm, [arm.s * 0.24, 1.397, 0.543], [0, 1, 0], [arm.s * 0.95, -0.65, -0.68]);
  } else if (id === 'calf-stretch-wall') {
    for (const arm of p.arms)
      plantPalm(arm, [arm.s * 0.225, 1.397, 0.453], [0, 1, 0], [arm.s * 0.78, -0.75, -0.48]);
  } else if (id === 'counter-step-back') {
    const hinge = 0.22 + 0.97 * a;
    // Set the hip travel from the fixed counter edge and a nearly extended
    // elbow. The step occurs beneath the pelvis, then the trunk hinges.
    const hipY = 0.867 - 0.023 * a,
      socketLift = 0.042 * a;
    const shoulderY = hipY + (0.47 + socketLift) * Math.cos(hinge);
    const reachZ = Math.sqrt(0.488 ** 2 - 0.039 ** 2 - (counterY + 0.035 - shoulderY) ** 2);
    const hipZ = 0.5 - reachZ - (0.47 + socketLift) * Math.sin(hinge);
    torso(p, [0, hipY - 0.91, hipZ], hinge, 0, 0, 0.78 * hinge);
    for (const leg of p.legs) {
      const stride = eased((a - (leg.s < 0 ? 0 : 0.32)) / 0.68);
      placeLeg(leg, [leg.s * 0.13, 0.084 + 0.06 * Math.sin(Math.PI * stride), -0.045 - 0.421 * stride]);
      orientFoot(leg);
    }
    for (const arm of p.arms) {
      arm.shoulder = add(arm.shoulder, [
        arm.s * 0.008 * a,
        socketLift * Math.cos(hinge),
        socketLift * Math.sin(hinge)
      ]);
      plantPalm(arm, [arm.s * 0.222, counterY + 0.033, 0.545], [arm.s * 0.03, -0.035, 1]);
    }
  } else if (id === 'table-slide') {
    torso(p, [0, 0, 0], 0.11 + 0.4 * a);
    for (const arm of p.arms)
      plantPalm(arm, [arm.s * 0.122, trayY + 0.041, 0.277 + 0.453 * a], [arm.s * 0.04, -0.025, 1]);
  }
}
function doorway(p, id, a) {
  if (id === 'band-row') {
    for (const arm of p.arms) {
      arm.shoulder[2] -= 0.018 * a;
      plantPalm(
        arm,
        [arm.s * (0.14 + 0.063 * a), 1.1 + 0.016 * a, 0.377 - 0.327 * a],
        [arm.s * 0.06, 0.07, 1],
        [arm.s * 0.23, -0.69, -0.96],
        -arm.s * 1.1,
        0.76
      );
    }
  } else {
    // At each transfer both hands return to shoulder height on the jambs.
    torso(p, [0, -0.026 * a, 0.09 * a], 0.07 * a);
    const leading = p.side;
    for (const leg of p.legs) {
      placeLeg(leg, [
        leg.s * 0.126,
        0.084 + (leg.s === leading ? 0.027 * Math.sin(Math.PI * a) : 0),
        leg.s === leading ? 0.152 * a : 0
      ]);
      orientFoot(leg);
    }
    for (const arm of p.arms) {
      const high = arm.s === p.side;
      plantPalm(
        arm,
        [arm.s * 0.389, 1.36 + (high ? 0.41 : -0.325) * a, 0.003],
        [arm.s * 0.04, 1, -0.12],
        [arm.s * 0.8, -0.35, -0.72],
        -arm.s * 1.4
      );
    }
  }
}
function corner(p, a) {
  torso(p, [0, -0.04, 0.09 * a], 0.09 * a);
  feet(
    p,
    p.legs.map((l) => [l.s * 0.128, 0.084, l.s < 0 ? 0.2 : -0.15])
  );
  for (const arm of p.arms) {
    const wrist = [arm.s * 0.369, 1.442, 0.167],
      elbow = [arm.s * 0.394, 1.194, 0.142];
    // The palm and elbow lie on the same diagonal wall.
    reach(arm, upright, sub(wrist, arm.shoulder), sub(elbow, arm.shoulder), [0, 0.995, 0.1], arm.s * 0.73);
  }
}
export function fixtureBallCenter(p, id) {
  return [-0.081, (id === 'ball-low-back' ? 1.006 : 1.264) - 0.028 * p.a, rearWallZ(id) + 0.038];
}
function backSupport(p, id, a) {
  if (id === 'wall-squat') {
    torso(p, [0, -0.065 - 0.17 * a, -0.038], 0);
    planted(p, 0.28, 0.158);
    for (const arm of p.arms) swing(arm, upright, [arm.s * 0.17, -1, 0.12], [arm.s * 0.04, -0.85, 0.34]);
  } else if (id === 'back-arch-table') {
    torso(p, [0, -0.018, 0.055 * a], -0.13 * a);
    planted(p);
    changeChest(p, false, p.centre, -0.185 * a);
    for (const arm of p.arms)
      plantPalm(
        arm,
        [arm.s * 0.21, backCounterY + 0.022, -0.19],
        [arm.s * 0.15, -0.06, -1],
        [arm.s * 0.75, -0.48, -0.72],
        arm.s * 0.12
      );
  } else {
    torso(p, [0, -0.027 - 0.079 * a, -0.002], -0.013);
    planted(p, 0.107);
  }
}
function bottle(p, a) {
  // Forward lean allows the forearm to rest along the thigh with the wrist
  // beyond the patella. The wrist stays put as the bottle rotates with the hand.
  torso(p, [0, 0, 0], 0.56);
  restOnThigh(p.arms[1], p.legs[1]);
  const arm = p.arms[0];
  reach(
    arm,
    upright,
    sub([-0.137, 0.563, 0.411], arm.shoulder),
    [-0.19, -0.83, -0.42],
    [-0.045, -0.22 + 0.99 * a, 1],
    -0.08,
    0.74
  );
}
function supportedLeg(p, id, a, raisedSupport) {
  if (id === 'knee-straighten-stretch') {
    torso(p, [0, 0, 0.037 - 0.035 * a], 0.061 * a);
    const l = p.legs[0];
    // Slide back over the seat a few cm against a planted heel. The bent
    // knee descends while the hip–heel distance increases.
    placeLeg(l, [-0.127, chairHeelHeight + 0.073, 0.786], [0, 1, 0.09], 0.3903, 0.402);
    orientFoot(l, -0.55);
    l.heelHeight = chairHeelHeight;
    const other = p.legs[1];
    placeLeg(other, [0.129, 0.078, 0.389], [0, 0.12, 1], 0.3903, 0.402);
    orientFoot(other);
    p.arms.forEach((arm, i) => restOnThigh(arm, p.legs[i]));
  } else if (id === 'hamstring-step') {
    const chair = raisedSupport === 'chair';
    const surface = chair ? chairHeelHeight : stepHeight,
      heelZ = chair ? 0.736 : 0.56;
    const hipY = 0.877 - 0.027 * a,
      footY = surface + 0.078;
    const hipZ = heelZ - Math.sqrt(0.828 ** 2 - (hipY - footY) ** 2 - 0.031 ** 2);
    const hinge = 0.12 + 0.45 * a;
    torso(p, [0, hipY - 0.91, hipZ], hinge, 0, 0, hinge);
    const l = p.legs[0];
    placeLeg(l, [-0.141, footY, heelZ], [0, 0.46, 1]);
    orientFoot(l, -0.47);
    l.heelHeight = surface;
    const other = p.legs[1];
    placeLeg(other, [0.13, 0.084, -0.11]);
    orientFoot(other);
    const restPalm = add(mixPoint(l.hip, l.knee, 0.53), [-0.019, 0.105, 0.009]);
    plantPalm(p.arms[0], restPalm, [-0.025, -0.47, 0.94], [-0.74, -0.74, -0.5]);
    const free = p.arms[1];
    swing(free, upright, [0.13, -1, 0.06], [0.04, -0.9, 0.25]);
  } else if (id === 'chair-squat') {
    torso(p, [0, -0.02 - 0.345 * a, -0.025 - 0.177 * a], 0.09 + 0.51 * a, 0, 0, 0.09 + 0.39 * a);
    planted(p, 0.1, 0.143);
    for (const arm of p.arms) {
      const theta = 0.24 + 1.16 * a;
      swing(
        arm,
        upright,
        [arm.s * 0.1, -Math.cos(theta), Math.sin(theta)],
        [arm.s * 0.06, -Math.cos(theta + 0.18), Math.sin(theta + 0.18)]
      );
    }
  } else {
    torso(p, [0, 0, 0.029 * a], 0.085 * a, 0, 0, 0.16 * a);
    // The outer thigh clears the near side of the cushion. Ball of foot
    // supports the rear leg while the forward foot stays planted.
    const plantedLeg = p.legs[1];
    placeLeg(plantedLeg, [0.125, 0.078, 0.389], [0, 0, 1], Math.hypot(0.39, 0.015), 0.402);
    orientFoot(plantedLeg);
    const outer = p.legs[0];
    placeLeg(outer, [-0.19, 0.182, -0.423], [0, -0.78, 1], 0.39, 0.402);
    orientFoot(outer, 0.73);
    plantPalm(p.arms[1], [0.287, 0.48, 0.121], [0.14, -0.27, 1], [0.83, -0.7, -0.4], -0.2, 0.42);
  }
}
function floor(p, id, a) {
  if (id === 'bed-edge-hip-stretch') {
    const offset = [0, bedTop, 0];
    moveUpper(p, (pt) => add(pt, offset));
    for (const leg of p.legs)
      for (const key of ['hip', 'knee', 'ankle', 'toe']) leg[key] = add(leg[key], offset);
    p.legs[1].heelHeight = bedTop;
    const l = p.legs[0],
      open = eased(a / 0.48),
      lower = eased((a - 0.23) / 0.77);
    const thigh = sub(l.knee, l.hip),
      shin = sub(l.ankle, l.knee);
    const raisedThigh = mixPoint(thigh, [-0.183, 0.266, 0.318], open);
    const raisedShin = mixPoint(shin, [-0.047, -0.238, 0.325], open);
    // Move clear of the edge before letting the thigh and shin descend.
    l.knee = add(l.hip, scaledTo(mixPoint(raisedThigh, [-0.154, -0.129, 0.365], lower), 0.42));
    l.ankle = add(l.knee, scaledTo(mixPoint(raisedShin, [-0.039, -0.353, 0.173], lower), 0.41));
    orientFoot(l, 0.21 * lower);
    l.heelHeight = l.ankle[1] - 0.071;
    // Rest the near hand across the stomach, away from the unsupported edge.
    const arm = p.arms[0];
    reach(arm, lying, [0.07, -0.295, 0.1], [-0.7, -0.57, -0.13], [0.9, 0.14, -0.08], -0.25);
  } else {
    for (const arm of p.arms) swing(arm, lying, [arm.s * 0.082, -0.01, 1], [-arm.s * 0.05, 0.07, 1]);
    for (const leg of p.legs) {
      const angle = leg.s === p.side ? 0.844 * a : 0;
      leg.knee = add(leg.hip, [0, 0.42 * Math.cos(angle), 0.42 * Math.sin(angle)]);
      leg.ankle = add(leg.knee, [0, -0.41 * Math.sin(angle), 0.41 * Math.cos(angle)]);
      orientFoot(leg, -0.6 + 0.42 * Math.sin(angle));
      const ankleAtTap = leg.hip[1] + 0.42 * Math.cos(0.844) - 0.41 * Math.sin(0.844);
      leg.heelHeight = leg.ankle[1] - ankleAtTap;
    }
  }
}
function standingExtension(p, id, a) {
  if (id === 'shoulder-backbend') {
    for (const arm of p.arms) {
      const angle = 0.53 + 2.81 * a;
      swing(
        arm,
        upright,
        [arm.s * 0.16, -Math.cos(angle), Math.sin(angle)],
        [arm.s * 0.069, -Math.cos(angle + 0.09), Math.sin(angle + 0.09)]
      );
    }
  } else if (id === 'spine-backbend') {
    torso(p, [0, -0.025 * a, 0.04 * a]);
    planted(p);
    changeChest(p, false, p.centre, -0.3 * a);
    for (const arm of p.arms) {
      reach(
        arm,
        upright,
        [-arm.s * 0.055, 0.073, -0.087],
        [arm.s * 0.18, 0.94, 0.34],
        [-arm.s * 0.08, -0.96, 0.14]
      );
    }
  } else {
    // Face the wall between sides. Turning away keeps the same working
    // hand on that wall; the other hand drops and follows the turning chest.
    const yaw = -p.side * 1.18 * a;
    torso(p, [-p.side * 0.082 * a, -0.035 * a, -0.123 * a], 0, 0, yaw);
    planted(p);
    for (const arm of p.arms) {
      const active = arm.s === p.side;
      const target = [
        arm.s * (0.282 - (active ? 0 : 0.09) * a),
        1.382 - (active ? 0 : 0.403 * a),
        0.471 - (active ? 0.022 : 0.49) * a
      ];
      const axis = [arm.s * 0.67 * a, 1 - 0.9 * a, -0.07 + 0.1 * a];
      plantPalm(arm, target, axis, [arm.s * 0.77, -0.64, -0.48], arm.s * 0.09);
    }
  }
}
/** @param {import('../pose.js').Movement} move @param {number} seconds
 * @param {typeof import('../pose.js').basePose} basePose */
export function fixturePose(move, seconds, basePose) {
  const id = move.animation;
  const p = basePose(
    {pose: move.pose, motion: id === 'calf-stretch-wall' ? 'calf-stretch' : 'neutral'},
    seconds
  );
  for (const arm of p.arms) arm.holdingRail = false;
  const phase = (seconds % 4) / 4,
    a = p.a;
  const hold = eased(Math.min(phase, 1 - phase) / 0.23);
  if (pressMotions.includes(id)) wallPress(p, id, hold);
  else
    switch (id) {
      case 'wrist-lift-bottle':
        p.side = -1;
        bottle(p, a);
        break;
      case 'wall-slide':
        forearmSlide(p, a);
        break;
      case 'wall-push-up':
      case 'calf-stretch-wall':
      case 'counter-step-back':
      case 'table-slide':
        forwardSupport(p, id, a);
        break;
      case 'doorway-stretch':
      case 'band-row':
        doorway(p, id, a);
        break;
      case 'corner-stretch':
        corner(p, a);
        break;
      case 'ball-back':
      case 'ball-low-back':
      case 'back-arch-table':
      case 'wall-squat':
        backSupport(p, id, a);
        break;
      case 'knee-straighten-stretch':
      case 'hamstring-step':
      case 'chair-squat':
      case 'seated-hip-flexor':
        supportedLeg(p, id, a, move.raisedSupport);
        break;
      case 'bed-edge-hip-stretch':
      case 'dead-bug':
        floor(p, id, a);
        break;
      case 'shoulder-backbend':
      case 'spine-backbend':
      case 'wall-biceps-stretch':
        standingExtension(p, id, eased(Math.min(phase, 1 - phase) / 0.39));
        break;
      default:
        return undefined;
    }
  return p;
}
/** @param {ReturnType<typeof import('../pose.js').basePose>} p @param {import('../pose.js').Movement} move */
export function fixtureActivation(p, move) {
  switch (move.animation) {
    case 'head-press':
      return {label: 'Press gently back', points: [add(p.skull, [0, 0.015, -0.073])]};
    case 'elbow-back-press':
      return {label: 'Press elbows back', points: p.arms.map((arm) => arm.elbow)};
    case 'wall-press-side':
      return {label: 'Press elbow out', points: [p.arms[0].elbow]};
    case 'wall-press-out':
      return {label: 'Press hand out', points: [p.arms[0].palm]};
    case 'wall-press-forward':
      return {label: 'Press fist forward', points: [p.arms[p.side < 0 ? 0 : 1].palm]};
  }
}
