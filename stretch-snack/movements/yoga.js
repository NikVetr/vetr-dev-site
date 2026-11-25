// Yoga poses use the same articulated joints, support surfaces and scale as
// the rest of the trainer. Ground contacts are prescribed independently of
// the pelvis so a hinge, squat or reach cannot carry a supporting foot away.
import {add, mixPoint as mix, turn, pitchPoint, lean, cross, restOnThigh, lapContact} from './geometry.js';
import {
  floorBase,
  trunk,
  head,
  armAt,
  armDirections,
  legAt,
  legDirections,
  midHip,
  mul,
  sub,
  unit,
  X,
  Y,
  Z
} from './floor-rig.js';
import {rockBack} from './floor.js';
import {pad, rod} from '../equipment.js';
import {wallSection} from './fixtures-props.js';

const flat = [0, -0.37, 0.93],
  instep = [0, -0.1, -1];
const upperAngle = (t) => [0, Math.cos(t), Math.sin(t)];
function reach(h, amount, sideways = false, over = 2.93) {
  const theta = 0.08 + over * amount,
    s = h.s;
  const dir = (t) =>
    sideways
      ? [s * Math.sin(t), -Math.cos(t), 0.12 * Math.sin(t) + 0.035]
      : [s * (0.08 + 0.1 * Math.sin(t)), -Math.cos(t), Math.sin(t)];
  armDirections(h, dir(theta), dir(theta + 0.13), dir(theta + 0.16));
}
// Enter either arm role from the same relaxed posture when changing sides.
function triangleArm(h, p, lowerTarget) {
  const k = p.a,
    high = h.s !== p.side;
  const start = add(h.shoulder, [h.s * 0.028, -0.457, 0.11]);
  const target = high ? add(h.shoulder, [h.s * 0.04, 0.49, 0.05]) : lowerTarget;
  const wrist = add(mix(start, target, k), [0, 0, (high ? 0.29 : 0.04) * Math.sin(Math.PI * k)]);
  const theta = 0.22 + (high ? 2.62 : 0.24) * k;
  const axis = [h.s * 0.1, -Math.cos(theta), Math.sin(theta)];
  armAt(h, wrist, axis, [h.s * 0.64, -0.18, -0.84], X);
}
function levelArms(p, k) {
  p.arms.forEach((h) => reach(h, k, true, 1.47));
}
function twistChest(p, hip, angle, up = Y) {
  // The thighs and pelvis keep facing forward as the rib cage turns.
  const hips = p.legs.map((l) => l.hip);
  trunk(p, hip, up, turn(X, angle));
  p.legs.forEach((l, i) => (l.hip = hips[i]));
}
function stance(p, hip, feet, up = Y) {
  trunk(p, hip, up);
  p.legs.forEach((l, i) => legAt(l, feet[i], Z, flat));
}
function belly(p, pose) {
  const a = p.a,
    hip = midHip(p),
    h = p.arms[0];
  const up = pose === 'supine' ? [0, 0, -1] : Y,
    front = pose === 'supine' ? Y : Z;
  const wrist = add(add(hip, mul(up, 0.19)), add(mul(front, 0.135 + 0.014 * a), [-0.095, 0, 0]));
  armAt(h, wrist, unit(add([0.47, 0, 0], mul(up, 0.86))), [h.s * 0.92, -0.22, -0.1]);
  p.activation = a;
}
function upper(p, id, pose) {
  const {a, side} = p,
    hip = midHip(p);
  switch (id) {
    case 'mountain':
      if (pose === 'seated') {
        p.arms.forEach((h) => {
          const wrist = h.wrist;
          h.shoulder = add(h.shoulder, [0, 0.018 * a, -0.018 * a]);
          armAt(h, wrist, sub(h.palm, wrist), [h.s * 0.7, -0.4, -0.36]);
        });
      } else trunk(p, hip, upperAngle(-0.028 * a));
      break;
    case 'belly-breath':
      belly(p, pose);
      break;
    case 'crescent-bend': {
      const up = lean(Y, -side * 0.46 * a);
      const hips = p.legs.map((l) => l.hip);
      trunk(p, hip, up);
      p.legs.forEach((l, i) => (l.hip = hips[i]));
      for (const h of p.arms) {
        const k = h.s === side ? a : 0;
        const theta = 0.09 + 2.94 * k;
        const direction = (v) =>
          lean([h.s * (0.06 + 0.65 * Math.sin(v)), -Math.cos(v), 0.78 * Math.sin(v)], -side * 0.46 * a);
        armDirections(h, direction(theta), direction(theta + 0.11), direction(theta + 0.17));
      }
      break;
    }
    case 'eagle-arms': {
      for (const h of p.arms) {
        const s = h.s,
          depth = 0.046 * side * s * a;
        const elbowDir = unit(mix([s * 0.17, -0.91, 0.33], [-s * 0.77, 0.16, 0.89 + depth], a));
        const fore = unit(mix([s * 0.05, -0.52, 0.82], [s * 0.28, 0.98, -0.15 + depth], a));
        armDirections(h, elbowDir, fore, fore, [0.29, 0, -s * 0.96]);
      }
      break;
    }
    case 'arm-frame': {
      // Raise the upper arms, then fold the forearms across the crown.
      for (const h of p.arms) {
        const s = h.s,
          theta = 0.3 + 2.6 * a;
        const upper = [s * 0.13, -Math.cos(theta), Math.sin(theta)];
        const fore = unit([
          -s * (0.3 + 0.7 * a),
          0.58 * Math.sin(theta),
          0.55 * Math.cos(theta) + 0.32 * a + side * s * 0.09 * a
        ]);
        armDirections(h, upper, fore, fore, mul(cross(upper, fore), s));
      }
      break;
    }
    case 'arms-up':
      p.arms.forEach((h) => {
        if (pose !== 'seated') return reach(h, a);
        const theta = 0.08 + 2.93 * a;
        const direction = angle => [h.s * 0.30, -Math.cos(angle), Math.sin(angle)];
        armDirections(h, direction(theta), direction(theta + 0.13), direction(theta + 0.16));
      });
      break;
    case 'reach-cat-cow': {
      const bend = 1 - 2 * a;
      trunk(p, hip, upperAngle(0.18 * bend));
      p.centre = add(p.centre, [0, 0, -0.03 * bend]);
      head(p, upperAngle(0.4 * bend), X);
      for (const h of p.arms) {
        const theta = 1.42 - 2.03 * a;
        armDirections(
          h,
          [h.s * (pose === 'seated' ? 0.31 : 0.17), -Math.cos(theta), Math.sin(theta)],
          [h.s * (pose === 'seated' ? 0.25 : 0.13), -Math.cos(theta + 0.18), Math.sin(theta + 0.18)]
        );
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

function chair(p, id) {
  const {a, side} = p,
    hip = midHip(p);
  switch (id) {
    case 'chair-back-twist': {
      // Sit across the seat so the backrest is beside the user's shoulder.
      trunk(p, [0, 0.51, 0.015], Y, turn(X, 1.57));
      for (const l of p.legs) legAt(l, [0.355, 0.082, 0.015 - l.s * 0.12], X, [0.93, -0.37, 0], [0, 0, -1]);
      const hips = p.legs.map((l) => l.hip);
      trunk(p, [0, 0.51, 0.015], Y, turn(X, 1.62 + 0.49 * a));
      p.legs.forEach((l, i) => (l.hip = hips[i]));
      p.arms.forEach((h) => armAt(h, [h.s * 0.083, 0.897, -0.156], [0, -0.76, -0.35], [0.55, -0.72, h.s * 0.52]));
      break;
    }
    case 'hand-twist': {
      twistChest(p, hip, side * 0.7 * a);
      for (const h of p.arms) {
        const same = h.s === side,
          rest = [h.s * 0.125, 0.647, 0.155];
        const contact = same ? [h.s * 0.277, 0.527, -0.038] : [side * 0.112, 0.673, 0.205];
        armAt(
          h,
          add(mix(rest, contact, a), [0, 0.095 * Math.sin(Math.PI * a), 0]),
          mix([0, -0.22, 1], same ? [h.s * 0.56, -0.46, 0.44] : [side * 0.28, -0.10, 0.94], a),
          [h.s * 0.85, -0.62, -0.43]
        );
      }
      break;
    }
    case 'knee-hug': {
      const active = p.legs.find(l => l.s === side);
      trunk(p, hip, upperAngle(0.19));
      for (const l of p.legs) {
        const k = l === active ? a : 0;
        legDirections(l, [l.s * 0.38, -0.075 + 0.91 * k, 1 - 0.39 * k], [0, -1, -0.1 - 0.36 * k], flat);
      }
      // Scoop from in front of the knee. As the thigh rises, its underside
      // turns toward the chest and the supporting hands follow that surface.
      const scoop = a * a, arc = Math.sin(Math.PI * scoop);
      const thigh = unit(sub(active.knee, active.hip));
      const under = unit([0, -thigh[2], thigh[1]]);
      const contact = add(mix(active.hip, active.knee, 0.76), mul(under, 0.113));
      for (const h of p.arms) {
        const start = [h.s * 0.09, 0.70, 0.33];
        const along = h.s === side ? 0.082 : -0.082;
        const target = add(add(contact, mul(thigh, along)), [h.s * 0.103, 0, 0.046]);
        const wrist = add(mix(start, target, scoop), [0, 0.06 * arc, 0.19 * arc]);
        const axis = mix([0, 0.05, 1], [-h.s * 0.90, -0.32, -0.12], scoop);
        const elbowOut = h.s === side ? 1.2 : -0.35;
        armAt(h, wrist, axis, [h.s * (0.7 + elbowOut * scoop), -0.5, 0.70], X);
      }
      break;
    }
    case 'forward-rest':
      trunk(p, hip, upperAngle(0.98 * a));
      p.arms.forEach((h, i) =>
        armAt(
          h,
          mix([h.s * 0.125, 0.656, 0.153], i ? [h.s * 0.13, 0.616, 0.335] : add(p.face, [-0.023, 0.04, 0.022]), a),
          i ? [0, -0.2 + 0.2 * a, 1] : [0.18, Math.sin(2.68 * a - 0.18), Math.cos(2.68 * a - 0.18)],
          i ? [0.85, -1, -0.22] : [h.s * 0.62, -1, 0.16],
          i ? [1, -0.40, -0.08] : undefined
        )
      );
      break;
    case 'wide-knee-lean':
      trunk(p, [0, 0.51, 0.085], upperAngle(0.58 * a));
      p.legs.forEach((l) => legAt(l, [l.s * 0.295, 0.083, 0.37], [l.s * 0.57, 0.1, 1], flat));
      p.arms.forEach((h, i) => restOnThigh(h, p.legs[i]));
      break;
    case 'heart-lift':
      trunk(p, [0, 0.51, 0.08], upperAngle(-0.18 * a));
      p.arms.forEach((h) => armAt(h, [h.s * 0.278, 0.515, 0.070], [h.s * 0.13, -0.26, -0.94], [h.s * 0.46, -0.1, -1]));
      break;
    case 'warrior-two':
    case 'triangle': {
      const triangle = id === 'triangle';
      trunk(p, [0, 0.51, 0.13], lean(Y, triangle ? side * 0.74 * a : 0));
      for (const l of p.legs) {
        const ext = (triangle ? l.s === side : l.s !== side) ? a : 0;
        legAt(
          l,
          [l.s * (0.15 + 0.6 * ext), 0.084, 0.45 - 0.24 * ext],
          [l.s * 0.31, 0.05, 1],
          [l.s * 0.74 * ext, -0.37, 0.93 - 0.31 * ext]
        );
      }
      if (!triangle) {
        levelArms(p, a);
        head(p, Y, turn(X, side * 0.9 * a));
      } else
        for (const h of p.arms) {
          const leg = p.legs.find(l => l.s === h.s);
          const {wrist, axis} = lapContact(leg), high = h.s !== side;
          const target = high ? add(h.shoulder, [h.s * 0.06, 0.49, 0.05]) : [h.s * 0.52, 0.36, 0.35];
          const direction = high ? [h.s * 0.07, 1, 0.17] : [h.s * 0.44, -0.73, 0.42];
          const arc = Math.sin(Math.PI * a);
          armAt(h, add(mix(wrist, target, a), [0, 0.07 * arc, 0.19 * arc]),
            mix(axis, direction, a), [h.s * 0.68, -0.4, -0.7]);
        }
      break;
    }
    default:
      return false;
  }
  return true;
}
function standing(p, id, t, basePose) {
  const {a, side} = p;
  const feet = p.legs.map((l) => [l.s * 0.13, 0.084, 0]);
  switch (id) {
    case 'chair-pose':
    case 'chair-pose-tiptoe':
    case 'garland-squat': {
      const deep = id === 'garland-squat',
        toe = id === 'chair-pose-tiptoe';
      const hip = [0, 0.9 - (deep ? 0.55 : toe ? 0.18 : 0.27) * a, -(deep ? 0.16 : 0.21) * a];
      trunk(p, hip, upperAngle((deep ? 0.24 : 0.35) * a));
      for (const l of p.legs) {
        const w = deep ? 0.085 : 0.012,
          angle = toe ? 0.6 * a : 0;
        const toedir = pitchPoint(flat, angle);
        const foot = add([l.s * (0.13 + w), 0.084, 0], sub(mul(unit(flat), 0.146), mul(unit(toedir), 0.146)));
        legAt(l, foot, [l.s * (deep ? 0.72 : 0.03), 0, 1], toedir);
      }
      if (toe) p.arms.forEach((h) => armAt(h, [h.s * 0.19, 1.07, 0.376], [0, -0.61, 0.79], [h.s * 0.6, -0.7, -0.25]));
      else if (deep)
        p.arms.forEach((h) =>
          armAt(h, add(p.neck, [h.s * 0.025, -0.02, 0.18]), [-h.s * 0.2, 1, 0.05], [h.s, -0.8, 0.25])
        );
      else p.arms.forEach((h) => reach(h, a));
      break;
    }
    case 'forward-fold':
    case 'wide-leg-fold':
    case 'pyramid': {
      const wide = id === 'wide-leg-fold',
        split = id === 'pyramid';
      const stride = split ? 0.32 * a : 0;
      const hip = [0, 0.9 - (wide ? 0.2 : split ? 0.1 : 0.095) * a, -0.08 * a];
      const up = upperAngle((wide ? 2.12 : split ? 1.02 : 1.91) * a);
      const placed = feet.map((f, i) => [
        f[0] + (i ? 1 : -1) * (wide ? 0.29 : 0) * a,
        f[1],
        (i ? 1 : -1) * side * stride
      ]);
      stance(p, hip, placed, up);
      for (const h of p.arms) {
        const aim = split ? [side * 0.12, 0.57, 0.3] : [h.s * (wide ? 0.18 : 0.13), wide ? 0.09 : 0.31, 0.18];
        armAt(h, mix([h.s * 0.21, 0.885, 0.062], aim, a), [h.s * 0.05, -1, 0.2], [h.s * 0.47, -0.33, -0.82]);
      }
      break;
    }
    case 'wall-dog': {
      const hip = [0, 0.89 - 0.045 * a, -0.12 - 0.28 * a];
      stance(
        p,
        hip,
        feet.map((f) => add(f, [0, 0, -0.29])),
        upperAngle(0.42 + 1.05 * a)
      );
      for (const h of p.arms) armAt(h, [h.s * 0.18, 1.25 - 0.325 * a, 0.448], [0, 1, 0.02], [h.s * 0.46, -0.8, 0], X);
      break;
    }
    case 'tree': {
      // Keep the right hand on the rail throughout, raising the free-side leg.
      p.arms[1] = basePose({pose: 'standing', motion: 'hip-side'}, 0).arms[1];
      const l = p.legs[0];
      legAt(
        l,
        mix([-0.128, 0.084, 0], [0.058, 0.455, 0.022], a),
        [-0.65 * a, 0.02, 1 - 0.55 * a],
        [-a * 0.13, -0.37 - 0.42 * a, 0.93 - 0.41 * a],
        unit([1, 0.28 * a, 0])
      );
      break;
    }
    case 'warrior-one':
    case 'warrior-two':
    case 'triangle': {
      const sagittal = id === 'warrior-one',
        triangle = id === 'triangle';
      const extent = (sagittal ? 0.4 : 0.48) * a,
        hip = [
          sagittal ? 0 : side * (triangle ? 0.05 : 0.19) * a,
          0.906 - (triangle ? 0.18 : 0.22) * a,
          sagittal ? 0.09 * a : 0
        ];
      // Keep both soles down throughout wide stances. A longer stride
      // lowers the pelvis before a nearly straight rear leg loses contact.
      for (const l of p.legs) {
        const dx = l.s * (0.02 + (sagittal ? 0 : extent)) - hip[0],
          dz = (sagittal ? (l.s === side ? 1 : -1) * extent : 0) - hip[2];
        hip[1] = Math.min(hip[1], 0.084 + Math.sqrt(0.834 ** 2 - dx * dx - dz * dz));
      }
      trunk(p, hip, triangle ? lean(Y, side * 0.98 * a) : Y);
      for (const l of p.legs) l.hip = add(hip, [l.s * 0.11, 0, 0]);
      for (const l of p.legs) {
        const along = l.s === side ? 1 : -1;
        const ankle = [l.s * (0.13 + (sagittal ? 0 : extent)), 0.084, sagittal ? along * extent : 0];
        const yaw =
          triangle || !sagittal ? (along > 0 ? side * 1.27 * a : side * 0.28 * a) : along > 0 ? 0 : l.s * 0.62 * a;
        legAt(l, ankle, turn(Z, yaw), turn(flat, yaw), turn(X, yaw));
      }
      if (sagittal) p.arms.forEach((h) => reach(h, a));
      else if (!triangle) {
        levelArms(p, a);
        head(p, Y, turn(X, side * 1.02 * a));
      } else
        for (const h of p.arms) {
          triangleArm(h, p, [h.s * 0.53, 0.37, 0.065]);
        }
      break;
    }
    case 'pelvis-circle': {
      const angle = (Math.PI * t) / 2,
        dx = 0.06 * Math.sin(angle) * side,
        dz = 0.051 * (1 - Math.cos(angle));
      stance(p, [dx, 0.876, dz - 0.052], feet, unit([-0.52 * dx, 1, -0.45 * dz]));
      break;
    }
    default:
      return false;
  }
  return true;
}
function floorYoga(p, id) {
  const {a, side} = p,
    hip = midHip(p);
  switch (id) {
    case 'downward-dog': {
      const lift = a,
        newHip = [0, 0.485 + 0.324 * lift, -0.16 - 0.045 * lift];
      const angle = 0.04 - 0.995 * lift;
      trunk(p, newHip, [0, Math.sin(angle), Math.cos(angle)]);
      for (const l of p.legs)
        legAt(
          l,
          [l.s * 0.13, 0.09 + 0.032 * (1 - a), -0.542],
          [l.s * 0.03, 0, 1],
          [0, -0.75 + 0.36 * a, 0.7 + 0.19 * a]
        );
      p.arms.forEach((h) => armAt(h, [h.s * 0.191, 0.037, 0.349], Z, [h.s * 0.21, 0, -1], X));
      break;
    }
    case 'child-pose':
      rockBack(p, 0.18 + 0.82 * a, 0.14, 0.02);
      break;
    case 'locust':
      trunk(p, hip, upperAngle(1.56 - 0.26 * a));
      for (const h of p.arms)
        armAt(h, [h.s * 0.23, 0.038 + 0.075 * a, -0.005], [0, 0.03, -1], [h.s * 0.34, -0.55, -0.72], X);
      break;
    case 'happy-baby': {
      const rock = 0.028 * a * side;
      for (const l of p.legs) {
        const s = l.s;
        const ankle = add(mix([s * 0.128, 0.083, 0.64], [s * 0.328, 0.594, -0.335], a), [
          rock,
          0.18 * Math.sin(Math.PI * a),
          0
        ]);
        const angle = Math.PI * a - 0.37;
        legAt(
          l,
          ankle,
          [s * (0.1 + 0.6 * a), 1 - 1.6 * a, -0.2 - 1.0 * a],
          [s * 0.04, Math.sin(angle), Math.cos(angle)]
        );
      }
      for (const [i, h] of p.arms.entries()) {
        const l = p.legs[i];
        armAt(
          h,
          mix(h.wrist, add(l.ankle, [h.s * 0.033, -0.025, -0.035]), a),
          mix([h.s * 0.03, 0, 1], [-h.s * 0.34, 0.68, 0.33], a),
          [h.s * 0.75, -0.18, 0.38]
        );
      }
      break;
    }
    case 'legs-up-wall': {
      // The heels keep light contact with the wall. A small ankle flexion
      // marks settling into the hold without continually lifting the legs.
      for (const l of p.legs) legAt(l, [l.s * 0.13, 0.94, 0.126], Z, [0, 0.19 + 0.14 * a, -1]);
      break;
    }
    case 'reclined-butterfly':
      p.legs.forEach((l) =>
        legAt(
          l,
          [l.s * 0.04, 0.09, 0.54],
          [l.s * (0.85 + 1.7 * a), 1 - 0.7 * a, 0],
          [l.s * 0.08, 0.65, 0.72],
          unit([0.77, -l.s * 0.64, 0])
        )
      );
      break;
    case 'pigeon': {
      const angle = 1.26 * a,
        sine = Math.sin(angle),
        cosine = Math.cos(angle);
      trunk(p, [0, 0.065 + 0.423 * cosine, -0.16 + 0.045 * a], upperAngle(1.52 - 0.55 * a));
      for (const l of p.legs) {
        const front = l.s === side,
          spread = front ? 0.36 : 0.04;
        const thigh = [l.s * spread * sine, -cosine, (front ? 1 : -1) * Math.sqrt(1 - spread ** 2) * sine];
        const shin = [front ? -l.s * 0.86 * a : 0, 0.035, -Math.sqrt(1 - (front ? 0.86 * a : 0) ** 2)];
        legDirections(l, thigh, shin, instep);
      }
      p.arms.forEach((h) => armAt(h, [h.s * 0.244, 0.035, 0.348], Z, [h.s * 0.28, 0, -1], X));
      break;
    }
    case 'gate-pose': {
      trunk(p, hip, lean(Y, side * 0.58 * a));
      for (const l of p.legs) l.hip = add(hip, [l.s * 0.11, 0, 0]);
      for (const l of p.legs) {
        const k = l.s === side ? a : 0;
        legAt(
          l,
          mix([l.s * 0.126, 0.08, -0.49], [l.s * 0.838, 0.084, -0.08], k),
          [l.s * 0.12, -0.61, 1],
          mix(instep, [l.s * 0.89, -0.36, 0.29], k)
        );
      }
      for (const h of p.arms) {
        triangleArm(h, p, [h.s * 0.45, 0.31, -0.025]);
      }
      break;
    }
    case 'pancake':
    case 'head-to-knee':
    case 'knee-cross-twist': {
      const wide = id === 'pancake',
        twist = id === 'knee-cross-twist';
      if (twist) twistChest(p, hip, side * 0.74 * a);
      else trunk(p, hip, unit([wide ? 0 : side * 0.13 * a, Math.cos(0.64 * a), Math.sin(0.64 * a)]));
      for (const l of p.legs) {
        const k = wide ? 0 : (twist ? l.s === side : l.s !== side) ? a : 0;
        const ankle = wide
          ? [l.s * 0.64, 0.076, 0.399]
          : mix([l.s * 0.13, 0.076, 0.592], twist ? [-l.s * 0.18, 0.084, 0.161] : [-l.s * 0.012, 0.083, -0.015], k);
        legAt(l, ankle, wide ? Y : unit([twist ? 0.04 : l.s * 0.95 * k, 1 - 0.83 * k * (twist ? 0 : 1), 0.18 * k]), [
          l.s * (wide ? 0.23 : 0.19 * k),
          1,
          0.22
        ]);
      }
      for (const h of p.arms) {
        const end = wide
          ? [h.s * 0.16, 0.04, 0.306]
          : twist
            ? h.s === side
              ? [h.s * 0.21, 0.036, -0.41]
              : add(p.legs.find((l) => l.s === side).knee, [h.s * 0.056, 0.014, -0.06])
            : [side * 0.12 + h.s * 0.056, 0.15, 0.39];
        armAt(
          h,
          mix([h.s * 0.14, 0.19, -0.015], end, a),
          twist && h.s === side
            ? [0, -Math.sin(0.2 + 2.75 * a), Math.cos(0.2 + 2.75 * a)]
            : [0, -Math.sin(0.2 + 0.19 * a), Math.cos(0.2 + 0.19 * a)],
          [h.s * 0.45, -0.28, -1]
        );
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

export function yogaPose(move, seconds, basePose) {
  const id = move.animation,
    pose = move.pose;
  const p = floorBase(move, seconds, basePose);
  const found =
    upper(p, id, pose) ||
    (pose === 'seated' ? chair(p, id) : pose === 'standing' ? standing(p, id, seconds, basePose) : false) ||
    floorYoga(p, id);
  return found ? p : undefined;
}
export function yogaActivation(p, move) {
  if (move.animation === 'belly-breath') return {label: 'Breathe into belly', points: [p.arms[0].palm]};
}

export function drawYogaProps(mesh, p, move, t) {
  switch (move.animation) {
    case 'wall-dog':
      wallSection(mesh, [0, 0, 0.478], X, 0.92, 1.65, p.arms[0].palm[1]);
      break;
    case 'legs-up-wall':
      wallSection(mesh, [0, 0, 0.165], X, 0.79, 1.13, 0.91);
      break;
    case 'chair-pose-tiptoe': {
      pad(mesh, [0, 1.004, 0.557], 0.35, 0.2, 0.019, 0.018, '#aaae9b');
      for (const s of [-1, 1]) rod(mesh, [s * 0.3, 0.01, 0.6], [s * 0.3, 1.005, 0.6], 0.019, '#9aaead');
      break;
    }
    default:
      return false;
  }
  return true;
}
