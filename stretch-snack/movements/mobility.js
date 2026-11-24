// Articulated mobility drills. Distances are metres. Y is up and Z is forward.
import {add, mixPoint as mix, pitchPoint as pitch, lean, turn, eased, scaledTo, middleJoint} from './geometry.js';
import {trunk, head, armAt, legAt, legDirections, armDirections, mul, X, Y} from './floor-rig.js';

const flat = [0, -0.054, 0.136],
  toeDown = [0, -0.116, 0.078];
const sub = (a, b) => a.map((x, i) => x - b[i]);
const unit = (a) => scaledTo(a, 1);
const arch = (t) => 4 * t * (1 - t);
const gate = (start, end, phase) => eased((phase - start) / (end - start));
const phaseWindow = (a, b, c, d, t) => gate(a, b, t) * (1 - gate(c, d, t));
const extended = new Set([
  'rollover-straddle',
  'worlds-greatest-stretch',
  'inchworm',
  'squat-to-stand',
  'body-circle',
  'hip-car',
  'step-over'
]);
export function mobilityCycleSeconds(move) {
  if (move.animation === 'worlds-greatest-stretch') return 20;
  if (move.animation === 'inchworm') return 17;
  if (extended.has(move.animation)) return 12;
  return move.animation === 'mountain-climber' ? 4.1 : 8;
}

// Forward kinematics is preferable for a free limb. Floor or prop contacts use
// a pinned endpoint and a knee/elbow pole in the shared two-bone rig instead.
function armDirection(arm, direction, finger = direction, bend = [arm.s, -0.4, -0.7], distance = 0.494) {
  armAt(arm, add(arm.shoulder, scaledTo(direction, distance)), unit(finger), bend);
}
function restArms(p) {
  for (const r of p.arms)
    armDirection(r, [r.s * 0.11, -1, 0.095], [r.s * 0.09, -1, 0.17], [r.s * 0.68, -0.28, -0.87], 0.482);
}
function planted(leg, x, z, y = 0.081, yaw = 0) {
  legAt(leg, [x, y, z], [leg.s * 0.05, 0.08, 1], turn(flat, yaw), turn(X, yaw));
}
function stand(p, hip = [0, 0.906, 0], angle = 0, bend = 0, yaw = 0) {
  trunk(p, hip, turn(lean(pitch(Y, angle), bend), yaw), turn(lean(X, bend), yaw));
  for (const leg of p.legs) planted(leg, leg.s * 0.13, 0);
  restArms(p);
}
function sit(p, hip = [0, 0.114, 0], fold = 0, bend = 0) {
  trunk(p, hip, lean(pitch(Y, fold), bend), lean(X, bend));
  for (const l of p.legs) legDirections(l, [l.s * 0.025, -0.047, 1], [l.s * 0.025, -0.025, 1], [0, 0.95, 0.26]);
  restArms(p);
}
function handsBehind(p, z = -0.17) {
  for (const r of p.arms) armAt(r, [r.s * 0.24, 0.07, z], [r.s * 0.08, -0.06, -1], [r.s * 0.55, 0.58, -0.5]);
}
function flatHands(p, z = 0.39) {
  for (const r of p.arms) armAt(r, [r.s * 0.2, 0.064, z], [r.s * 0.055, -0.06, 1], [r.s * 0.35, -0.15, -1]);
}
function shoulders(p, id, {a, side, phase}) {
  if (id === 'underarm-shoulder-stretch') {
    sit(p, [0, 0.115, 0.075 * a], -0.31 - 0.19 * a);
    handsBehind(p, -0.19);
    return;
  }
  if (id === 'overhead-shoulder-stretch') {
    stand(p, [0, 0.899, 0.07 * a], 0.07 + 0.24 * a);
    for (const r of p.arms) armAt(r, [r.s * 0.22, 1.834, 0.2], [0, 0.32, 0.94], [r.s * 0.43, -0.24, -0.8]);
  } else if (id === 'wall-angel') {
    stand(p, [0, 0.893, -0.037], -0.045);
    for (const r of p.arms) {
      const up = -0.26 + 0.99 * a;
      const elbow = add(r.shoulder, [r.s * 0.26 * Math.cos(up), 0.26 * Math.sin(up), -0.035]);
      const fore = unit([r.s * (0.12 + 0.16 * a), 1, -0.095]);
      armAt(r, add(elbow, scaledTo(fore, 0.245)), fore, sub(elbow, r.shoulder));
    }
  } else if (id === 'band-pass-through') {
    stand(p);
    for (const r of p.arms) {
      const theta = 0.25 + 5.72 * a;
      // Broad grip allows both nearly straight arms to travel over the crown.
      const dir = [r.s * 0.68, -Math.cos(theta), Math.sin(theta)];
      armDirection(r, dir, [r.s * 0.28, -Math.cos(theta), Math.sin(theta)], [r.s, -0.05, -0.03], 0.5);
    }
  } else if (id === 'arm-circle') {
    stand(p);
    for (const r of p.arms) {
      const swing = side * 2 * Math.PI * gate(0, 1, phase),
        amplitude = 0.11 + 0.54 * a;
      const dir = [r.s, amplitude * Math.sin(swing), amplitude * Math.cos(swing)];
      armAt(r, add(r.shoulder, scaledTo(dir, 0.494)), dir, [0, -1, -0.32], [0, 1, 0]);
    }
  } else {
    const theta = side * 2 * Math.PI * gate(0, 1, phase),
      fold = (1 - Math.cos(theta)) * 0.5;
    stand(p, [0, 0.898 - 0.08 * fold, 0], 1.52 * fold, 0.45 * Math.sin(theta));
    for (const r of p.arms)
      armDirection(r, [0.73 * Math.sin(theta) + r.s * 0.18, Math.cos(theta), 0.3 + fold * 0.59], undefined, [
        r.s,
        -0.05,
        -0.32
      ]);
  }
}

function squats(p, id, {a, phase, side}) {
  if (id === 'cossack-squat') {
    stand(p, [side * 0.37 * a, 0.749 - 0.323 * a, -0.064 * a], 0.12 + 0.29 * a);
    for (const l of p.legs) {
      const yaw = l.s * 0.29;
      legAt(l, [l.s * 0.532, 0.083, 0], [l.s * 0.61, 0.12, 1], turn(flat, yaw), turn(X, yaw));
    }
    for (const r of p.arms)
      armDirection(r, [r.s * 0.12, -0.75 + 0.93 * a, 0.21 + 0.81 * a], undefined, [r.s, -0.8, -0.12], 0.46);
    return;
  }
  const pike = id === 'pike-fold';
  const fold = phaseWindow(0, 0.31, 0.76, 1, phase);
  // On release the knees flex and the hips lower before standing upright.
  const squat = pike ? phaseWindow(0.58, 0.76, 0.78, 1, phase) : phaseWindow(0.28, 0.48, 0.72, 0.94, phase);
  stand(p, [0, 0.9 - 0.42 * squat - 0.03 * fold, -0.11 * fold], (pike ? 1.91 : 1.64) * fold * (1 - 0.73 * squat));
  for (const l of p.legs) planted(l, l.s * (pike ? 0.075 : 0.17), 0);
  for (const r of p.arms) {
    const end = mix(r.wrist, [r.s * (pike ? 0.095 : 0.135), pike ? 0.115 : 0.19, 0.15], fold);
    armAt(r, end, [r.s * 0.04, -1, 0.16], [r.s * (1 - 0.85 * squat), -0.3, 0.4]);
  }
}

// Rotate an already flexed knee and its shoe together. Keeping the hinge plane
// continuous matters when a nearly straight leg passes through vertical.
function swingLeg(l, rotThigh, rotShin, rotFoot = rotShin) {
  legDirections(
    l,
    rotThigh(sub(l.knee, l.hip)),
    rotShin(sub(l.ankle, l.knee)),
    rotFoot(sub(l.toe, l.ankle)),
    rotFoot(l.across)
  );
}
function restToHand(r, target, direction, bend, t) {
  const normal = unit(sub(r.elbow, mix(r.shoulder, r.wrist, 0.51)));
  armAt(
    r,
    mix(r.wrist, target, t),
    mix(unit(sub(r.palm, r.wrist)), unit(direction), t),
    mix(normal, unit(bend), t)
  );
}
function walking(p, id, {side, phase}) {
  const advance = gate(0, 1, phase),
    t = phaseWindow(0.06, 0.38, 0.63, 0.94, phase);
  stand(p, [-side * 0.055 * t, 0.899, 0]);
  // The view tracks the trunk: one planted foot recedes while the other
  // advances and lands ahead. Their positions agree at the next stride.
  for (const l of p.legs) planted(l, l.s * 0.13, (l.s === side ? 1 : -1) * 0.11 * (2 * advance - 1));
  const l = p.legs.find((l) => l.s === side);
  if (id === 'walking-quad-pull') {
    swingLeg(
      l,
      (v) => pitch(v, 0.04 * t),
      (v) => pitch(v, 2.28 * t)
    );
    const r = p.arms.find((r) => r.s === side);
    restToHand(
      r,
      add(l.ankle, [side * 0.022, 0.015, 0.02]),
      [side * 0.03, -1, -0.34],
      [side * 0.7, -0.34, -0.5],
      t
    );
  } else {
    const angle = (id === 'toy-soldier' ? 1.13 : 1.7) * t;
    swingLeg(
      l,
      (v) => pitch(v, -angle),
      (v) => pitch(v, id === 'toy-soldier' ? -angle - 0.15 * t : 0)
    );
    for (const r of p.arms)
      if (id === 'walking-knee-hug' || r.s !== side) {
        const point =
          id === 'walking-knee-hug' ? add(l.knee, [r.s * 0.065, 0.009, 0.02]) : add(l.toe, [0, 0.03, 0]);
        restToHand(r, point, [r.s * 0.052, -0.36, 0.86], [r.s * 0.83, -0.56, -0.39], t);
      }
  }
}
function legCircles(p, id, {side, phase}) {
  const stepOver = id === 'step-over',
    lateral = id === 'side-leg-swing',
    car = id === 'hip-car';
  // Reverse the controlled hip rotation before putting the working leg down.
  const beat = car ? (phase < 0.5 ? 2 * phase : 2 - 2 * phase) : phase;
  const lift = phaseWindow(0, 0.23, 0.74, 1, beat),
    sweep = gate(0.24, 0.72, beat),
    squat = stepOver ? phaseWindow(0.57, 0.74, 0.79, 1, phase) : 0;
  stand(p, [-side * 0.038 * lift, 0.9 - 0.16 * squat, 0]);
  const l = p.legs.find((l) => l.s === side);
  if (id === 'leg-swing-wall' || lateral) {
    const swing = Math.sin(2 * Math.PI * gate(0, 1, phase)) * (lateral ? 0.7 : 0.83);
    const rot = (v) => (lateral ? lean(pitch(v, -0.11 * lift), -side * swing) : pitch(v, -swing));
    swingLeg(l, rot, rot, (v) => (lateral ? lean(v, -side * swing) : pitch(v, -swing * 0.65)));
    for (const r of p.arms) {
      if (lateral) armAt(r, [r.s * 0.23, 1.22, 0.42], [0, 0.98, 0.09], [r.s * 0.36, -0.8, -0.61]);
      else if (r.s === 1) armAt(r, [0.575, 1.22, 0.066], [0.06, 0.98, 0.1], [0.35, -0.8, -0.61]);
    }
  } else if (stepOver) {
    const swing = phaseWindow(0.03, 0.24, 0.37, 0.6, phase),
      open = phaseWindow(0.19, 0.47, 0.81, 1, phase);
    const end = add([side * 0.13, 0.081, 0], [side * 0.29 * open, 0.31 * swing, 0.12 * swing]);
    legAt(l, end, [side * (0.05 + 1.0 * open), 0.08, 1], flat);
    for (const r of p.arms)
      armAt(
        r,
        add(p.legs.find((l) => l.s === r.s).hip, [r.s * 0.05, 0.105, 0.06]),
        [r.s * 0.02, -0.9, 0.32],
        [r.s, -0.12, -0.24]
      );
  } else {
    const theta = side * 2.31 * sweep * lift,
      thigh = 1.56 * lift;
    swingLeg(
      l,
      (v) => turn(pitch(v, -thigh), theta),
      (v) => turn(pitch(v, 0.32 * lift), theta),
      (v) => turn(pitch(v, 0.27 * lift), theta)
    );
  }
}
function lunges(p, id, {a, side, phase}) {
  const isWorld = id === 'worlds-greatest-stretch';
  const reach = isWorld ? phaseWindow(0.39, 0.55, 0.63, 0.73, phase) : a;
  const forward = isWorld ? phaseWindow(0.03, 0.24, 0.78, 0.99, phase) : a;
  const straighten = isWorld ? phaseWindow(0.67, 0.77, 0.81, 0.94, phase) : 0;
  const deep = isWorld ? forward : 0;
  const z = 0.055 * forward - 0.23 * straighten;
  const hip = [
    0,
    0.895 -
      (isWorld ? 0.51 : 0.37) * forward +
      0.235 * straighten -
      (isWorld ? 0.07 * phaseWindow(0.18, 0.28, 0.32, 0.41, phase) : 0),
    z
  ];
  const pitchAngle = (isWorld ? 1.52 : 0.12) * forward - 0.2 * reach * deep;
  const up = lean(pitch(Y, pitchAngle), -side * 0.16 * reach * (1 - deep));
  const across = lean(X, -side * reach * (isWorld ? 1.04 : 0.12));
  trunk(p, hip, up, across);
  for (const l of p.legs) {
    const front = l.s === side;
    if (isWorld) l.hip = add(hip, [l.s * 0.11, 0, 0]); // Thoracic rotation over a level pelvis.
    const foot = [
      l.s * (0.13 + 0.1 * deep),
      0.081 + 0.04 * arch(forward) + (!front ? 0.045 * forward : 0),
      (front ? 0.41 : isWorld ? -0.72 : -0.5) * forward
    ];
    legAt(l, foot, [l.s * 0.03, 0.03, 1], front ? flat : mix(flat, toeDown, forward));
  }
  restArms(p);
  for (const r of p.arms) {
    const working = r.s === side;
    if (isWorld) {
      const floor = [r.s * 0.11, 0.065, 0.397];
      if (working) {
        floor[1] += 0.29 * phaseWindow(0.21, 0.31, 0.33, 0.395, phase); // instep leads with the elbow
        const theta = reach * Math.PI;
        const down = sub(floor, r.shoulder),
          away = [side, -0.02, -0.05];
        const ray = add(mul(unit(down), Math.cos(theta)), mul(away, Math.sin(theta)));
        const length = Math.hypot(...down) * (1 - reach) + 0.472 * reach;
        const target = add(r.shoulder, scaledTo(ray, length));
        restToHand(
          r,
          target,
          [side * 0.2 * Math.sin(theta), reach, 0.66 * (1 - reach) + 0.12],
          [r.s * 0.54, -0.44, -1],
          deep
        );
      } else restToHand(r, floor, [r.s * 0.06, -0.06, 1], [r.s * 0.54, -0.44, -1], deep);
    } else if (!working) {
      const angle = 3.04 * reach;
      const dir = [r.s * 0.11 - side * 0.14 * reach, -Math.cos(angle), Math.sin(angle) + 0.095];
      restToHand(r, add(r.shoulder, scaledTo(dir, 0.484)), dir, [r.s * 0.68, -0.28, -0.87], reach);
    }
  }
}

function hipSits(p, id, {a, side, phase}) {
  if (id === 'butterfly') {
    sit(p, [0, 0.122, 0], 0.09 + 0.48 * a);
    for (const l of p.legs) {
      legAt(l, [l.s * 0.043, 0.092, 0.39], [l.s, 0, 0.08], [0, 0.01, 1], unit([0.25, l.s * 0.97, 0]));
      const r = p.arms.find((r) => r.s === l.s);
      armAt(r, add(l.ankle, [l.s * 0.05, 0.034, 0.032]), [l.s * 0.05, -0.55, 0.86], [l.s, -0.22, -0.3]);
    }
  } else if (id === 'ball-glute') {
    const offset = side * 0.049 * a;
    sit(p, [offset, 0.151 + 0.038 * a, 0.014 * Math.sin(4 * Math.PI * phase) * a], -0.4, -side * 0.22 * a);
    for (const l of p.legs) planted(l, l.s * 0.2, 0.56);
    handsBehind(p, -0.22);
    p.mobilityBall = [side * 0.064 * a, 0.047, 0];
  } else {
    const switcher = id === 'hip-90-90-switch';
    sit(p, [0, 0.119, 0], switcher ? -0.29 : 0.03 + 0.2 * a);
    for (const l of p.legs) {
      // Both planted ankles remain apart as the femurs sweep down together.
      const front = l.s === side;
      const outward = side * a;
      legAt(
        l,
        [l.s * 0.36, 0.086, 0.32],
        [side * (front ? 1.1 : 2.05) * a, 1 - 0.95 * a, 0.12 + (front ? 0.6 : -0.6) * a],
        mix(unit(flat), unit([side * (front ? 0.7 : 0.93), -0.23, front ? 0.6 : -0.32]), a),
        unit([1 - 0.66 * a, l.s * 0.72 * a, 0])
      );
    }
    if (switcher) handsBehind(p, -0.2);
    else
      for (const r of p.arms)
        armAt(
          r,
          add(p.legs.find((l) => l.s === r.s).knee, [r.s * 0.05, 0.07, 0.003]),
          [r.s * 0.05, -0.38, 0.95],
          [r.s * 0.8, 0.15, -0.6]
        );
  }
}

function quad(p, hip = [0, 0.48, -0.16], up = [0, 0.04, 1]) {
  trunk(p, hip, up);
  for (const l of p.legs) legDirections(l, [l.s * 0.03, -1, 0.06], [l.s * 0.02, 0.015, -1], [0, -0.03, -1]);
  flatHands(p, 0.32);
}
function allFours(p, id, {a, side, phase}) {
  if (id === 'wrist-rock') {
    quad(p, [0, 0.47, -0.16 + 0.102 * a]);
    // The knees and insteps remain in place as the shoulders cross the wrists.
    for (const l of p.legs) legAt(l, [l.s * 0.13, 0.073, -0.55], [l.s * 0.08, -1, 0.33], [0, -0.07, -1]);
    return;
  }
  if (id === 'hydrant-circle') {
    quad(p);
    const l = p.legs.find((l) => l.s === side);
    const lift = phaseWindow(0, 0.16, 0.84, 1, phase);
    // Trace once in each direction before setting the same knee back down.
    const theta = 2 * Math.PI * (phase < 0.5 ? gate(0.12, 0.5, phase) : 1 - gate(0.5, 0.88, phase));
    legDirections(
      l,
      [side * (0.03 + 1.23 * lift), -1 + 0.51 * lift, 0.06 + 0.54 * lift * Math.sin(theta)],
      [side * (0.02 + 0.18 * lift), 0.015 + 0.61 * lift * Math.cos(theta), -1],
      [0, -0.03, -1]
    );
    return;
  }
  const set = id === 'rocking-frog' ? 1 : phaseWindow(0, 0.27, 0.73, 1, phase);
  const back = id === 'rocking-frog' ? a : phaseWindow(0.21, 0.43, 0.65, 0.83, phase);
  const hp = [0, 0.479 - 0.15 * set, -0.12 - 0.155 * back];
  // The elbows stay planted as the hips rock. Solve the sagittal shoulder
  // height from hip-to-shoulder and shoulder-to-grounded-elbow distances.
  const elbowZ = 0.145,
    elbowY = 0.052,
    elbowX = 0.21;
  const shoulder = middleJoint(
    hp,
    [0, elbowY, elbowZ],
    0.47,
    Math.sqrt(0.26 ** 2 - (elbowX - 0.182) ** 2),
    [0, 1, 0]
  );
  trunk(p, hp, mix([0, 0.03, 1], unit(sub(shoulder, hp)), set));
  for (const l of p.legs) {
    const k = [l.s * (0.131 + 0.215 * set), 0.057, -0.095];
    const kneeDir = sub(k, l.hip);
    legDirections(l, kneeDir, [l.s * 0.02, 0.014, -1], [0, -0.045, -1]);
  }
  // Lower from arms to forearms as the knees widen.
  for (const r of p.arms) {
    const elbow = [r.s * elbowX, elbowY, elbowZ],
      wrist = [r.s * elbowX, elbowY, elbowZ + 0.245];
    armAt(
      r,
      mix([r.s * 0.2, 0.061, 0.365], wrist, set),
      [r.s * 0.04, -0.05, 1],
      mix([r.s * 0.3, -1, -0.56], sub(elbow, r.shoulder), set)
    );
  }
}

function rolls(p, id, {a, side, phase}) {
  if (id === 'iron-cross') {
    trunk(p, [0, 0.125, 0], [0, 0, -1]);
    for (const r of p.arms) armDirection(r, [r.s, -0.11, 0.06], [r.s, -0.03, 0.08], [0, 0.54, 0.9]);
    const tilt = side * 0.98 * a;
    for (const l of p.legs) {
      legDirections(
        l,
        lean([l.s * 0.018, 1, 0.015], tilt),
        lean([0, 0.015, 1], tilt),
        lean([0, 0.93, 0.3], tilt),
        lean(X, tilt)
      );
    }
    return;
  }
  // Start upright with long legs. Rock onto the upper back, keeping the
  // crown clear; unroll onto the seat before opening into the forward straddle.
  const roll = phaseWindow(0, 0.3, 0.36, 0.65, phase);
  const wide = phaseWindow(0.49, 0.65, 0.81, 1, phase);
  const reach = phaseWindow(0.6, 0.74, 0.82, 0.97, phase);
  const angle = -2.05 * roll + 0.63 * reach;
  const hp = [0, 0.123 + 0.232 * roll * roll, -0.21 * roll];
  trunk(p, hp, pitch(Y, angle));
  // The thorax rounds on the mat; the head follows with gentle chin tuck.
  const shoulderHeight = 0.122 + 0.48 * (1 - roll);
  const chestAngle = Math.max(-1.6, angle + 0.36 * roll);
  const chest = add(hp, pitch([0, 0.47, 0], angle));
  if (roll > 0) {
    const raised = roll * Math.max(0, shoulderHeight - chest[1]);
    for (const r of p.arms) r.shoulder[1] += raised;
    p.neck = add(chest, [0, raised, 0]);
    p.spine.chest = p.neck;
    p.spine.chestUp = pitch(Y, chestAngle);
    p.centre = add(hp, pitch([0, 0.24, 0], angle));
  }
  head(p, pitch(Y, chestAngle + 0.43 * roll), X);
  for (const l of p.legs) {
    const thigh = pitch(turn([l.s * 0.03, 0.067, 1], l.s * 0.86 * wide), -2.53 * roll);
    const shin = pitch(turn([l.s * 0.03, -0.123, 1], l.s * 0.86 * wide), -2.08 * roll);
    legDirections(l, thigh, shin, pitch([l.s * 0.07, 0.87, 0.48], -2.08 * roll), turn(X, l.s * 0.86 * wide));
  }
  for (const r of p.arms) {
    const dir = [r.s * (0.93 - 0.68 * reach), -0.27 * (1 - roll) - 0.41 * reach, 0.055 + 0.94 * reach];
    armDirection(r, dir, dir, [r.s * 0.05, 0.73, -0.51]);
  }
}

function massage(p, id, {side, phase}) {
  const setup = phaseWindow(0, 0.19, 0.81, 1, phase),
    roll = phaseWindow(0.19, 0.44, 0.51, 0.81, phase),
    out = id === 'roller-it-band';
  const twist = out ? side * 1.31 * setup : 0;
  const shift = out ? [0, 0.245 + 0.048 * setup, 0.24 * roll] : [-side * 0.19 * roll, 0.225, 0];
  trunk(p, shift, [0, 0.09, 1], lean(X, twist));
  for (const l of p.legs) {
    const active = l.s === side;
    if (out) {
      const rest = add(l.hip, [l.s * 0.03, -0.103, -0.813]);
      const cross = active ? 0 : setup;
      const foot = mix(rest, [-side * 0.23, 0.081, -0.048 + shift[2]], cross);
      legAt(
        l,
        foot,
        [l.s * 0.28 - 0.28 * side * cross, 0.78, 0.5 - 0.88 * cross],
        mix([0, -0.06, -1], [-side * 0.45, -0.26, -0.85], cross),
        lean(X, twist)
      );
    } else {
      const amount = active ? setup : 0;
      legDirections(
        l,
        mix([l.s * 0.05, -0.13, -1], [side, -0.048, -0.09], amount),
        [l.s * 0.032, -0.091, -1],
        [0, -0.07, -1]
      );
    }
  }
  for (const r of p.arms) {
    const cross = out && r.s !== side ? setup : 0;
    const dy = Math.max(-0.255, 0.055 - r.shoulder[1]);
    const lateral = Math.sqrt(0.26 ** 2 - dy ** 2);
    const upper = [r.s * 0.46 * lateral, dy, -0.888 * lateral];
    const fore = unit([r.s * 0.06, 0.008, 1]);
    armDirections(r, upper, fore, fore);
    if (cross > 0)
      restToHand(r, [0, 0.058, 0.46 + shift[2]], [r.s * 0.06, -0.04, 1], [r.s * 0.25, -0.34, -0.95], cross);
  }
  // The contact advances along the muscle while the roller itself travels
  // only half as far across the mat as the body resting on it.
  const l = p.legs.find((l) => l.s === side);
  const contact = mix(l.hip, l.knee, 0.19 + 0.56 * roll);
  p.mobilityRoller = {at: [contact[0] * setup, 0.078, contact[2]], axis: out ? X : [0, 0, 1]};
}

function cushionLunge(p, _id, {side, phase}) {
  const set = phaseWindow(0, 0.29, 0.71, 1, phase),
    load = phaseWindow(0.24, 0.43, 0.64, 0.8, phase);
  // Start on both knees, bring the front foot forward, lift the rear instep
  // onto the chair, then tip the pelvis slightly under for the stretch.
  const hp = [0, 0.475, 0.033 + 0.07 * load];
  trunk(p, hp, pitch(Y, -0.045 * load));
  for (const l of p.legs) {
    const thigh = [l.s * 0.032, -1, -0.021 - 0.15 * set],
      knee = add(l.hip, scaledTo(thigh, 0.423));
    const rest = add(knee, scaledTo([l.s * 0.022, 0.041, -1], 0.414));
    if (l.s === side) {
      const end = mix(rest, [l.s * 0.146, 0.082, 0.47], set);
      end[0] += l.s * 0.22 * arch(set);
      end[1] += 0.18 * arch(set);
      legAt(l, end, mix(sub(knee, l.hip), [l.s * 0.06, 0.3, 1], set), pitch(flat, 2.77 * (1 - set)));
    } else {
      const angle = 1.01 * set;
      const shin = scaledTo([l.s * (0.022 + 0.83 * arch(set)), 0.041 + Math.sin(angle), -Math.cos(angle)], 0.414);
      const end = add(knee, shin);
      legAt(l, end, sub(knee, l.hip), pitch(flat, 2.77 - 0.41 * set));
    }
  }
  for (const r of p.arms)
    armAt(
      r,
      add(p.legs.find((l) => l.s === r.s).hip, [r.s * 0.05, 0.1, 0.07]),
      [r.s * 0.1, -0.9, 0.3],
      [r.s, -0.1, -0.33]
    );
}

function plank(p, id, {a, side, phase}) {
  const groin = id === 'groiner',
    climber = id === 'mountain-climber';
  const close = groin ? phaseWindow(0.09, 0.33, 0.65, 0.92, phase) : a;
  const hop = groin ? 0.092 * arch(close) : 0;
  const hp = [0, 0.346 + (groin ? 0.034 : -0.036) * close + hop, -0.07 + (groin ? 0.092 : 0.01) * close];
  trunk(p, hp, [0, 0.33 - 0.24 * close, 1]);
  flatHands(p, 0.41);
  for (const l of p.legs) {
    const lift = groin || l.s === side ? close : 0;
    const knee = [l.s * (groin ? 0.77 : 0.32) * lift, 0.95, 0.32 + 0.58 * lift];
    const end = [
      l.s * (0.124 + (groin ? 0.181 : 0.147) * lift),
      0.127 + (climber ? 0.075 * lift : 0.025 * arch(lift)) + hop - (groin ? 0.046 : 0) * lift,
      -0.837 + (climber ? 0.95 : 1.23) * lift
    ];
    // Bend towards the chest until each forefoot lands. The foot on the
    // opposite side stays behind in the single-leg version.
    legAt(l, end, knee, mix(toeDown, groin ? flat : [0, -0.098, 0.105], lift));
  }
}

function inchworm(p, _id, {phase}) {
  const folded = phaseWindow(0, 0.16, 0.88, 1, phase),
    plank = phaseWindow(0.13, 0.48, 0.57, 0.86, phase);
  const angle = 1.93 * folded - 0.61 * plank;
  const forward = 0.86 * gate(0.18, 0.88, phase);
  // Walk through the recording area with the backdrop tracking the performer;
  // subtracting travel preserves the contacts within each advancing step.
  const drift = -0.49 * forward;
  const hip = [0, 0.9 - 0.23 * folded - 0.3 * plank, drift + 0.006 + 0.77 * plank + 0.8 * gate(0.55, 0.89, phase)];
  trunk(p, hip, pitch(Y, angle));
  const advance = (t, bounds, side) => {
    let sum = 0;
    for (let i = 0; i < 2; i++) {
      const start = bounds[0] + ((i * 2 + (side > 0 ? 1 : 0)) * (bounds[1] - bounds[0])) / 4;
      sum += 0.4 * gate(start, start + (bounds[1] - bounds[0]) / 4, t);
    }
    return sum;
  };
  for (const l of p.legs) {
    const walk = advance(phase, [0.54, 0.85], l.s);
    legAt(
      l,
      [l.s * 0.14, 0.081 + 0.043 * plank + 0.034 * Math.sin((Math.PI * walk) / 0.4) ** 2, drift + walk],
      [l.s * 0.16, 0.12 + 0.86 * plank, 1],
      mix(flat, toeDown, plank)
    );
  }
  restArms(p);
  for (const r of p.arms) {
    const walk = advance(phase, [0.17, 0.48], r.s);
    armAt(
      r,
      mix(
        r.wrist,
        [r.s * 0.2, 0.062 + 0.054 * Math.sin((Math.PI * walk) / 0.4) ** 2, drift + 0.165 + walk],
        folded
      ),
      mix([r.s * 0.09, -1, 0.17], [r.s * 0.04, -0.04, 1], folded),
      [r.s * 0.55, -0.25, -0.85]
    );
  }
  // The gait repeats in place on screen as an unbounded walking path would.
  const track = gate(0.83, 1, phase) * (0.8 - 0.49 * 0.86);
  if (track) translatePose(p, [0, 0, -track]);
}
function translatePose(p, by) {
  const at = (point) => add(point, by);
  for (const key of ['centre', 'skull', 'face', 'crown', 'neck']) p[key] = at(p[key]);
  p.eyes = p.eyes.map(at);
  p.spine.chest = at(p.spine.chest);
  for (const l of p.legs) for (const k of ['hip', 'knee', 'ankle', 'toe']) l[k] = at(l[k]);
  for (const r of p.arms) {
    for (const k of ['shoulder', 'elbow', 'wrist', 'palm', 'thumb']) r[k] = at(r[k]);
    r.fingerJoints = r.fingerJoints.map((chain) => chain.map(at));
    r.fingers = r.fingerJoints.map((chain) => [chain[0], chain[3]]);
  }
}

/** @type {[Function,string][]} */
const groups = [
  [
    shoulders,
    'overhead-shoulder-stretch underarm-shoulder-stretch wall-angel band-pass-through arm-circle body-circle'
  ],
  [squats, 'pike-fold cossack-squat squat-to-stand'],
  [walking, 'walking-knee-hug walking-quad-pull toy-soldier'],
  [legCircles, 'leg-swing-wall side-leg-swing hip-car step-over'],
  [lunges, 'worlds-greatest-stretch lunge-reach'],
  [hipSits, 'butterfly ball-glute hip-90-90 hip-90-90-switch'],
  [allFours, 'hydrant-circle frog-stretch rocking-frog wrist-rock'],
  [rolls, 'iron-cross rollover-straddle'],
  [massage, 'roller-it-band roller-adductor'],
  [plank, 'groiner mountain-climber spiderman-lunge'],
  [cushionLunge, 'couch-stretch'],
  [inchworm, 'inchworm']
];
const exercises = new Map();
for (const [draw, ids] of groups) for (const id of ids.split(' ')) exercises.set(id, draw);

export function mobilityPose(move, seconds, basePose) {
  const draw = exercises.get(move.animation);
  if (!draw) return;
  const period = mobilityCycleSeconds(move),
    cycles = seconds / period,
    cycle = Math.floor(cycles),
    phase = cycles - cycle;
  const a = (1 - Math.cos(2 * Math.PI * phase)) / 2,
    side = cycle % 2 ? 1 : -1;
  const p = basePose({pose: 'standing', motion: 'rest'}, 0);
  p.a = a;
  p.side = side;
  p.activation = a;
  draw(p, move.animation, {a, side, phase});
  return p;
}
