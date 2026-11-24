import {add, mixPoint as mix, turn, pitchPoint, middleJoint} from './geometry.js';
import {
  floorBase,
  trunk,
  head,
  armAt,
  armDirections,
  legAt,
  legDirections,
  midHip,
  shoe,
  sub,
  unit,
  X,
  Y,
  Z
} from './floor-rig.js';
import {rod, pad} from '../equipment.js';

const forwardFoot = [0, -0.1, -1],
  flatFoot = [0, -0.37, 0.93];
const lowHands = (p) => p.arms.forEach((h) => armAt(h, [h.s * 0.193, 0.035, 0.318], Z, [h.s * 0.25, -0.1, -1], X));
const sideLegs = (p) =>
  p.legs.forEach((l) => legAt(l, [-0.13, 0.083 + (l.s + 1) * 0.044, -0.677], [1, 0.05, 0], [0.92, 0.015, -0.39], Y));

// Flex the hips about two fixed kneecaps while the insteps stay on the mat.
export function rockBack(p, a, wide = 0, slide = 0) {
  const theta = 0.045 + 1.18 * a,
    hip = [0, 0.063 + 0.423 * Math.cos(theta), -0.137 - 0.423 * Math.sin(theta)];
  const up = unit([0, 0.045 - 0.2 * a, 1]);
  trunk(p, hip, up);
  p.legs.forEach((l) =>
    legDirections(l, [l.s * wide, -Math.cos(theta), Math.sin(theta)], [-l.s * wide * 0.65, 0.025, -1], forwardFoot)
  );
  p.arms.forEach((h) =>
    armAt(h, [h.s * (0.19 + 0.03 * wide), 0.036, 0.397 + slide], Z, [h.s * 0.85, 0.045 - 0.07 * a, -0.20], X)
  );
}

function quadruped(p, id, t) {
  const {a, side} = p;
  switch (id) {
    case 'rock-back':
    case 'kneeling-arm-slide':
      rockBack(p, a, 0, id === 'kneeling-arm-slide' ? 0.028 * a : 0);
      break;
    case 'kneeling-chin-tuck': {
      head(p, unit([0, -0.17 * a, 1]), X);
      const glide = [0, 0.018 * a, -0.008 * a];
      for (const k of ['skull', 'crown', 'face']) p[k] = add(p[k], glide);
      p.eyes = p.eyes.map((v) => add(v, glide));
      break;
    }
    case 'tummy-draw':
      p.activation = a;
      break;
    case 'cat-camel': {
      // Flexion rounds the lumbar region and tucks the head; extension
      // lowers the lumbar region while the knees and wrists stay fixed.
      const bend = -side * a;
      trunk(p, midHip(p), unit([0, 0.04 - 0.19 * bend, 1]));
      p.spine.pelvicUp = unit([0, 0.04 + 0.25 * bend, 1]);
      p.centre = add(p.centre, [0, 0.065 * bend, 0]);
      head(p, unit([0, -0.59 * bend, 1]), X);
      lowHands(p);
      break;
    }
    case 'bird-dog': {
      const legTurn = Math.floor(t / 8) % 2 === 1;
      for (const h of p.arms) {
        const k = h.s === side && !legTurn ? a : 0;
        if (k)
          armDirections(
            h,
            mix(unit(sub(h.elbow, h.shoulder)), [h.s * 0.06, 0.02, 1], k),
            mix(unit(sub(h.wrist, h.elbow)), [h.s * 0.05, 0.13, 1], k),
            mix(Z, [h.s * 0.05, 0.09, 1], k),
            X
          );
      }
      for (const l of p.legs) {
        const k = l.s === side && legTurn ? a : 0;
        legDirections(
          l,
          mix([l.s * 0.02, -1, 0.06], [l.s * 0.03, -0.07, -1], k),
          mix([l.s * 0.02, 0.035, -1], [l.s * 0.04, 0.08, -1], k),
          forwardFoot
        );
      }
      break;
    }
    case 'thread-needle': {
      // Give threading and opening a full sweep each before switching sides.
      const thread = Math.floor(t / 4) % 2 === 0 ? a : 0,
        open = thread === 0 ? a : 0;
      const side = Math.floor(t / 8) % 2 === 0 ? -1 : 1;
      p.side = side;
      const angle = side * (0.8 * open - 0.48 * thread);
      const across = [Math.cos(angle), Math.sin(angle), 0];
      const hip = midHip(p),
        up = unit([0, 0.04 - 0.39 * thread, 1]);
      trunk(p, hip, up, across);
      // Keep the pelvic girdle square on both knees as the rib cage rolls.
      for (const l of p.legs) l.hip = add(hip, [l.s * 0.11, 0, 0]);
      for (const h of p.arms) {
        const working = h.s === side,
          from = [h.s * 0.192, 0.036, 0.32];
        const overhead = add(h.shoulder, [h.s * 0.025, 0.49, 0.012]);
        const wrist = working
          ? add(mix(mix(from, [-h.s * 0.26, 0.045, 0.31], thread), overhead, open), [
              h.s * 0.34 * Math.sin(Math.PI * open),
              0,
              0
            ])
          : from;
        const yaw = working ? -side * 1.46 * thread : 0;
        const dir = turn(pitchPoint(Z, working ? -1.39 * open : 0), yaw);
        armAt(h, wrist, dir, [h.s * 0.45, -0.12, -1], turn(X, yaw));
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

function prone(p, id) {
  const {a, side} = p;
  const hip = midHip(p);
  switch (id) {
    case 'prone-blade-squeeze':
      for (const h of p.arms) {
        h.shoulder = add(h.shoulder, [-h.s * 0.019 * a, 0.021 * a, -0.015 * a]);
        armAt(h, [h.s * 0.246, 0.036, -0.005], [0, 0.01, -1], [h.s * 0.42, -0.65, -0.3], X);
      }
      p.activation = a;
      break;
    case 'tummy-draw':
      head(p, Z, [0.42, 0.91, 0]);
      p.activation = a;
      break;
    case 'prone-leg-lift':
    case 'prone-knee-lift':
    case 'quad-stretch': {
      if (id === 'prone-leg-lift') head(p, Z, [0.56, 0.83, 0]);
      for (const [i, l] of p.legs.entries()) {
        const k = l.s === side ? a : 0,
          lift = id === 'prone-knee-lift' ? 0.17 * k : id === 'prone-leg-lift' ? 0.25 * k : 0;
        const flex = id === 'prone-knee-lift' ? 1.62 * k : id === 'quad-stretch' ? 2.7 * k : 0;
        legDirections(
          l,
          [l.s * 0.027, -0.125 + lift, -1],
          [l.s * 0.015, Math.sin(flex + 0.01 + lift), -Math.cos(flex + 0.01 + lift)],
          [l.s * 0.018, Math.sin(flex - 0.11 + lift), -Math.cos(flex - 0.11 + lift)]
        );
        if (id === 'quad-stretch') {
          const h = p.arms[i];
          armAt(
            h,
            mix([h.s * 0.246, 0.036, -0.005], add(l.ankle, [h.s * 0.035, 0.016, 0.055]), k),
            mix([0, 0.01, -1], [-h.s * 0.45, -0.18, -0.88], k),
            [h.s * 0.7, 0.62, -0.36]
          );
        }
      }
      break;
    }
    case 'kneeling-plank': {
      // Knee and elbow positions are fixed. The shoulder follows a short
      // arc around the elbow as the pelvis rises into the knee–shoulder line.
      const theta = 1.382 + 0.047 * a,
        knee = [0, 0.065, -0.399];
      const shoulder = [0, 0.043 + 0.26 * Math.sin(theta), 0.499 - 0.26 * Math.cos(theta)];
      const hip = middleJoint(knee, shoulder, 0.423, 0.47, [0, -1, 0]);
      trunk(p, hip, sub(shoulder, hip));
      p.legs.forEach((l) => legDirections(l, sub(knee, hip), [l.s * 0.015, 0.025, -1], forwardFoot));
      for (const h of p.arms) {
        armDirections(h, [0, -Math.sin(theta), Math.cos(theta)], [h.s * 0.025, -0.015, 1], Z, X);
        h.forearmPlanted = true;
      }
      break;
    }
    case 'forearm-prop':
    case 'prone-press-up': {
      const press = id === 'prone-press-up',
        theta = press ? 0.25 + 0.68 * a : 0.055 + 0.33 * a;
      trunk(p, hip, [0, Math.sin(theta), Math.cos(theta)]);
      for (const h of p.arms) {
        if (press) armAt(h, [h.s * 0.202, 0.037, 0.53], Z, [h.s * 0.055, -0.22, -1], X);
        else {
          const dy = 0.04 - h.shoulder[1],
            dx = h.s * 0.009;
          armDirections(h, [dx, dy, Math.sqrt(0.26 ** 2 - dy ** 2 - dx ** 2)], [0, -0.007, 1], Z, X);
          h.forearmPlanted = true;
        }
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

function sideLying(p, id) {
  const {a} = p,
    top = p.arms[1],
    bottom = p.arms[0],
    leg = p.legs[1];
  p.side = id === 'sleeper-stretch' ? -1 : 1;
  sideLegs(p);
  armAt(top, [0.22, 0.045, 0.4], [0.65, 0, 0.6], [0.52, 0.15, -0.71], X);
  switch (id) {
    case 'clam':
      legAt(leg, [-0.13, 0.174, -0.677], [1, 1.65 * a + 0.05, 0], [0.92, 0.015, -0.39], Y);
      break;
    case 'side-leg-lift':
      for (const l of p.legs) {
        const up = l.s > 0 ? 0.035 + 0.37 * a : -0.035;
        legDirections(l, [0.06, up, -1], [-0.07, up + 0.038, -1], [0.91, 0.03, -0.41], Y);
      }
      break;
    case 'quad-stretch': {
      const theta = 0.76 + 1.53 * a;
      legDirections(
        leg,
        [0.026, 0.013, -1],
        [-Math.sin(theta), 0.024, -Math.cos(theta)],
        [Math.cos(theta), 0.018, -Math.sin(theta)],
        Y
      );
      armAt(
        top,
        mix([0.19, 0.32, 0.19], add(leg.ankle, [0.05, 0.022, 0.045]), a),
        unit(mix([0.6, 0, -1], [-0.84, -0.1, -0.34], a)),
        [0.1, 0.8, -0.48],
        Y
      );
      break;
    }
    case 'side-lying-rotation': {
      const theta = 0.08 + 1.28 * a;
      armDirections(
        top,
        [0.06, 0.12, -1],
        [Math.cos(theta), Math.sin(theta), 0.07],
        [Math.cos(theta), Math.sin(theta), 0.05],
        Z
      );
      break;
    }
    case 'open-book': {
      const theta = 2.83 * a,
        rib = 0.59 * theta;
      const hip = midHip(p),
        across = [-Math.sin(rib), Math.cos(rib), 0];
      trunk(p, hip, Z, across);
      for (const l of p.legs) l.hip = add(hip, [0, l.s * 0.11, 0]);
      head(p, Z, across);
      const end = [Math.cos(theta), Math.sin(theta) - 0.22 * a, 0.06];
      armAt(bottom, [0.455, 0.044, 0.48], [1, 0.03, 0.09], [0.15, 0.14, -0.95], Y);
      armDirections(top, end, [end[0], end[1], 0.16], end, Z);
      break;
    }
    case 'sleeper-stretch': {
      const theta = 0.16 + 0.6 * a;
      armDirections(
        bottom,
        [1, 0.095, 0.045],
        [0.03, Math.cos(theta), -Math.sin(theta)],
        [0.04, Math.cos(theta), -Math.sin(theta)],
        Z
      );
      armAt(top, add(bottom.wrist, [-0.012, 0.05, 0.045]), [0.62, -0.5, -0.22], [0.46, 0.55, -0.45], Y);
      break;
    }
    default:
      return false;
  }
  return true;
}

function longSitting(p, id) {
  const {a, side} = p;
  switch (id) {
    case 'long-sit-reach': {
      trunk(p, midHip(p), [0, Math.cos(0.6 * a), Math.sin(0.6 * a)]);
      for (const h of p.arms)
        armAt(h, [h.s * 0.125, 0.23 - 0.1 * a, 0.03 + 0.49 * a], [h.s * 0.02, -0.3, 1], [h.s * 0.46, -0.65, -0.72]);
      break;
    }
    case 'calf-stretch':
      for (const [i, l] of p.legs.entries()) {
        const k = l.s === side ? a : 0;
        shoe(l, [0, 0.97, 0.43 - 0.6 * k]);
        const h = p.arms[i];
        armAt(h, [h.s * 0.093 + 0.041 * side * a, 0.31, 0.145 - 0.052 * a], [0, 0.27, 1], [h.s * 0.6, -0.7, -0.5]);
      }
      break;
    case 'knee-hang':
      for (const l of p.legs) {
        const k = l.s === side ? a : 0;
        legAt(l, [l.s * 0.13, 0.115, 0.548 + 0.043 * k], Y, [0, 1, 0.2]);
      }
      break;
    case 'calf-roll': {
      const hip = add(midHip(p), [0, 0.022, 0.098 * a]);
      trunk(p, hip, [0, 0.72, -0.69]);
      for (const l of p.legs) {
        const other = l.s !== side ? a : 0;
        legAt(
          l,
          mix(add(hip, [l.s * 0.13, -0.015, 0.827]), [l.s * 0.2, 0.084, 0.308], other),
          Y,
          mix([0, 1, 0.2], flatFoot, other)
        );
      }
      for (const h of p.arms) armAt(h, [h.s * 0.245, 0.035, -0.562], [h.s * 0.09, 0, -1], [h.s * 0.32, 0.1, -0.8], X);
      break;
    }
    default:
      return false;
  }
  return true;
}

function halfKneel(p) {
  const {a, side} = p;
  // Slide one shin forward as the foot plants, then travel into the lunge.
  const k = a,
    shift = 0.12 * k * k,
    hip = midHip(p);
  trunk(p, add(hip, [0, 0, shift]), Y);
  for (const l of p.legs) {
    const front = l.s === side ? k : 0,
      angle = Math.PI * front;
    const ankle = [l.s * 0.13, 0.08 + 0.178 * Math.sin(angle), -0.49 + 0.91 * front];
    legAt(l, ankle, [l.s * 0.028, -0.12, 1], [0, -0.15 - 0.81 * Math.sin(angle) - 0.23 * front, -Math.cos(angle)]);
  }
}

export function floorPose(move, seconds, basePose) {
  const id = move.animation,
    pose = move.pose;
  const p = floorBase(id === 'kneeling-arm-slide' ? {pose: 'hands-and-knees'} : move, seconds, basePose);
  let found;
  if (pose === 'prone') found = prone(p, id);
  if (pose === 'side-lying') found = sideLying(p, id);
  if (pose === 'hands-and-knees' || id === 'kneeling-arm-slide') found = quadruped(p, id, seconds);
  if (pose === 'long-sitting') found = longSitting(p, id);
  if (pose === 'kneeling' && id === 'kneeling-lunge') {
    halfKneel(p);
    found = true;
  }
  return found ? p : undefined;
}

export function floorActivation(p, move) {
  if (move.animation === 'tummy-draw') return {label: 'Draw abdomen in', points: [add(p.centre, [0, -0.08, 0])]};
  if (move.animation === 'prone-blade-squeeze')
    return {
      label: 'Draw shoulder blades together',
      points: p.arms.map((h) => add(h.shoulder, [-h.s * 0.07, 0.065, -0.045]))
    };
}

const fabric = '#7fa4a1';
export function drawFloorProps(mesh, p, move, time) {
  const id = move.animation,
    l = p.legs.find((l) => l.s === p.side);
  if (move.pose === 'side-lying') {
    // A folded head support fills the gap left by the weight-bearing shoulder.
    pad(mesh, [0, 0.048, 0.683], 0.144, 0.15, 0.048, 0.029, fabric);
  }
  if (id === 'prone-blade-squeeze') pad(mesh, [0, 0.012, 0.722], 0.13, 0.082, 0.012, 0.012, fabric);
  else if (id === 'side-lying-rotation') pad(mesh, [0, 0.294, 0.214], 0.07, 0.104, 0.037, 0.025, fabric);
  else if (id === 'side-leg-lift') pad(mesh, [0.023, 0.177, -0.425], 0.1, 0.102, 0.053, 0.024, fabric);
  else if (id === 'calf-roll') {
    const x = p.side * 0.14 * p.a;
    rod(mesh, [x - 0.105, 0.073, 0.33], [x + 0.105, 0.073, 0.33], 0.073, '#9e805f');
  } else if (id === 'knee-hang') {
    // A single broad roll supports either heel without moving between sides.
    rod(mesh, [-0.23, 0.039, 0.557], [0.23, 0.039, 0.557], 0.039, fabric);
  } else if (id === 'calf-stretch' || (id === 'quad-stretch' && move.pose === 'side-lying')) {
    const wrapped = id === 'calf-stretch' ? l : p.legs[1];
    const grip = id === 'calf-stretch' ? p.arms : [p.arms[1]];
    const loop = id === 'calf-stretch' ? wrapped.toe : wrapped.ankle;
    for (const [i, h] of grip.entries()) rod(mesh, h.palm, add(loop, [(i - 0.5) * 0.055, 0, 0]), 0.011, fabric);
    rod(mesh, add(loop, [-0.035, 0, 0]), add(loop, [0.035, 0, 0]), 0.012, fabric);
  } else return move.pose === 'side-lying';
  return true;
}
