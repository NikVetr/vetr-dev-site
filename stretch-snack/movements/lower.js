// World coordinates are metres: Y is up, Z is forward. Feet are posed about
// the supporting heel or ball, and planted targets survive hip/trunk travel.
import {add, mixPoint as mix, turn, pitchPoint as pitch, lean, middleJoint, handGeometry, restOnThigh, eased} from './geometry.js';

const names = {
  seated: new Set(
    'toe-curl foot-dome toe-spread ankle-tilt ankle-alphabet heel-toe-tap leg-cross-press tummy-draw ball-low-back seated-forward-bend side-bend figure-four plantar-stretch towel-scrunch calf-stretch band-leg-press knee-open knee-open-band band-ankle-out band-ankle-in sit-to-stand back-arch foot-press-up seated-side-tap heel-dig'.split(
      ' '
    )
  ),
  standing: new Set(
    'toe-curl foot-dome toe-spread ankle-tilt tummy-draw hip-back leg-curl march tandem-stand one-leg-stand side-step clock-tap quad-stretch soleus-stretch leg-swing side-walk heel-toe-walk heel-walk toe-walk back-lunge hip-flexor-stretch hip-hinge calf-stretch-step pelvic-tilt hip-flexor-stretch-step side-lunge-stretch'.split(
      ' '
    )
  ),
  supine: new Set(
    'tummy-draw knee-hug knee-hug-both bridge supine-march knee-squeeze hamstring-lift piriformis-pull cross-twist knee-fallout straight-leg-raise towel-knee-lift quad-set ball-low-back heel-dig'.split(
      ' '
    )
  )
};
const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map(v => v * k);
const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));
const midpoint = (a, b) => mix(a, b, 0.5);
const arch = t => Math.sin(Math.PI * t);
const centerHip = p => midpoint(p.legs[0].hip, p.legs[1].hip);
const weighted = (from, to, t) => (t === 1 ? to : mix(from, to, t));

function moveUpper(p, transform) {
  for (const key of ['centre', 'skull', 'face', 'crown', 'neck']) p[key] = transform(p[key]);
  p.eyes = p.eyes.map(transform);
  for (const arm of p.arms) {
    for (const key of ['shoulder', 'elbow', 'wrist', 'palm', 'thumb']) arm[key] = transform(arm[key]);
    arm.fingerJoints = arm.fingerJoints.map(chain => chain.map(transform));
    arm.fingers = arm.fingerJoints.map(chain => [chain[0], chain[3]]);
  }
}

// Move the torso as a rigid segment during a hip hinge; the limbs are solved
// separately. The optional vectors allow lumbar and pelvic rotation to differ.
function torso(p, displacement, forward = 0, side = 0, yaw = 0, pelvicPitch = 0) {
  const origin = centerHip(p);
  const rotate = v => turn(lean(pitch(v, forward), side), yaw);
  const transform = v => add(add(origin, displacement), rotate(sub(v, origin)));
  moveUpper(p, transform);
  for (const leg of p.legs) leg.hip = add(add(origin, displacement), turn(sub(leg.hip, origin), yaw));
  p.spine = {
    pelvicUp: turn(pitch(Y, pelvicPitch), yaw),
    chestUp: rotate(Y),
    chest: midpoint(p.arms[0].shoulder, p.arms[1].shoulder)
  };
}

// Clamp unreachable joint targets before analytic two-bone IK. The tiny bend
// margin keeps knee and elbow hinge directions defined even at full extension.
function fitEnd(origin, target, length) {
  const ray = sub(target, origin),
    d = Math.hypot(...ray);
  return d > length - 0.001 ? add(origin, mul(ray, (length - 0.001) / d)) : target;
}
function placeLeg(leg, target, bend = Z, upper = 0.423, lower = 0.414) {
  leg.ankle = fitEnd(leg.hip, target, upper + lower);
  leg.knee = middleJoint(leg.hip, leg.ankle, upper, lower, bend);
}
function orientFoot(leg, angle = 0, yaw = 0, roll = 0) {
  const orient = v => turn(lean(pitch(v, angle), -roll), yaw);
  leg.toe = add(leg.ankle, orient([0, -0.054, 0.136]));
  leg.across = orient(X);
}
function heelPivot(ankle, angle, yaw = 0, roll = 0) {
  // Native heel contact relative to the ankle.
  const lever = [0, 0.075, 0.026];
  return add(ankle, sub(turn(lean(pitch(lever, angle), -roll), yaw), lever));
}
function palmAt(arm, target, axis, t = 1, close = 0.12, guide = [arm.s * 0.7, -0.55, -0.35]) {
  if (!t) return;
  const direction = unit(weighted(unit(sub(arm.palm, arm.wrist)), unit(axis), t));
  const wrist = fitEnd(arm.shoulder, weighted(arm.wrist, sub(target, mul(direction, 0.055)), t), 0.505);
  // Enter from the actual relaxed elbow and hand. Replacing the bend plane
  // or finger shape on the first active frame would visibly snap at swaps.
  const originalPole = unit(sub(arm.elbow, mix(arm.shoulder, arm.wrist, 0.52)));
  const pole = unit(weighted(originalPole, unit(guide), t));
  const oldPalm = arm.palm,
    oldThumb = arm.thumb,
    oldDigits = arm.fingerJoints;
  arm.wrist = wrist;
  arm.elbow = middleJoint(arm.shoulder, wrist, 0.26, 0.245, pole);
  arm.palm = add(wrist, mul(direction, 0.045));
  const hand = handGeometry(arm.palm, direction, arm.s, -arm.s * 0.18, close, 0.045);
  if (t < 1) {
    const offset = sub(arm.palm, oldPalm);
    hand.thumb = mix(add(oldThumb, offset), hand.thumb, t);
    hand.fingerJoints = hand.fingerJoints.map((chain, i) =>
      chain.map((point, j) => mix(add(oldDigits[i][j], offset), point, t))
    );
    hand.fingers = hand.fingerJoints.map(chain => [chain[0], chain[3]]);
  }
  Object.assign(arm, hand);
  arm.holdingRail = false;
}
function railHand(arm, front = false, z = 0.27) {
  const axis = unit(front ? [arm.s * 0.08, -0.08, 1] : [1, 0, 0.3]);
  arm.wrist = front ? [arm.s * 0.21, 1.086, 0.269] : [0.275, 1.084, z];
  arm.elbow = middleJoint(arm.shoulder, arm.wrist, 0.26, 0.245, [arm.s * 0.8, -0.65, -0.6]);
  arm.palm = add(arm.wrist, mul(axis, 0.045));
  Object.assign(arm, handGeometry(arm.palm, axis, arm.s, 0.12 * arm.s, 0.71, 0.045));
  if (!front) arm.thumb = [0.299, 1.05, z + 0.044];
  arm.holdingRail = true;
}
function chairHands(p) {
  for (const arm of p.arms) palmAt(arm, [arm.s * 0.272, 0.485, 0.001], [arm.s * 0.56, -0.63, 0.54]);
}

const letterPaths = [
  [
    [-0.8, -0.65],
    [0, 0.85],
    [0.8, -0.65],
    [0.42, 0.05],
    [-0.42, 0.05]
  ],
  [
    [-0.55, -0.72],
    [-0.55, 0.8],
    [0.2, 0.8],
    [0.53, 0.58],
    [0.5, 0.28],
    [0, 0.06],
    [-0.55, 0.06],
    [0, 0.06],
    [0.65, -0.15],
    [0.57, -0.55],
    [0.23, -0.72],
    [-0.55, -0.72]
  ],
  [
    [0.62, 0.56],
    [0.24, 0.8],
    [-0.35, 0.72],
    [-0.65, 0.29],
    [-0.65, -0.27],
    [-0.33, -0.7],
    [0.25, -0.76],
    [0.62, -0.5]
  ]
];
function letterPoint(cycle, phase) {
  const points = letterPaths[Math.floor(cycle / 2) % letterPaths.length];
  const t = Math.min(points.length - 1.00001, Math.max(0, Math.min(1, (phase - 0.12) / 0.76)) * (points.length - 1));
  return mix(points[Math.floor(t)], points[Math.floor(t) + 1], t % 1);
}

function seatedFoot(p, id, t) {
  const {side} = p,
    {phase, cycle, hold, setup, load} = t;
  for (const leg of p.legs) {
    const active = leg.s === side;
    const rest = leg.ankle;
    let ankle = rest,
      angle = 0,
      yaw = 0,
      roll = 0;
    if (id === 'leg-cross-press' || id === 'foot-press-up') {
      const stacked = id === 'foot-press-up';
      ankle = add(rest, [
        -leg.s * (stacked ? 0.1 : 0.141) * setup,
        !active && stacked ? 0.076 * setup : 0.022 * arch(setup),
        (active ? 1 : -1) * (stacked ? 0.02 : 0.043) * setup
      ]);
      if (active && stacked) angle = -0.065 * load;
    } else if (active) {
      if (id === 'toe-curl') angle = -0.32 * setup;
      else if (id === 'ankle-tilt') {
        angle = -0.42 * setup;
        roll = side * 0.34 * Math.sin(2 * Math.PI * phase) * setup;
        yaw = side * 0.17 * Math.sin(2 * Math.PI * phase) * setup;
      } else if (id === 'ankle-alphabet') {
        const [x, y] = letterPoint(cycle, phase);
        const up = eased(Math.min(phase, 1 - phase) / 0.12);
        ankle = add(rest, [0, 0.072 * up, 0.028 * up]);
        angle = -(0.23 + 0.31 * y) * up;
        yaw = 0.36 * x * up;
      } else if (id === 'heel-toe-tap') {
        // Land the heel, then the ball, on one marked point.
        const heel = eased(Math.min(phase, Math.max(0, 0.5 - phase)) / 0.12);
        const toe = eased(Math.min(Math.max(0, phase - 0.44), 1 - phase) / 0.14);
        angle = -0.5 * heel + 0.6 * toe;
        ankle = add(rest, [0, 0.02 * (arch(heel) + arch(toe)) + 0.082 * toe, 0.14 * heel - 0.014 * toe]);
      } else if (id === 'band-ankle-in' || id === 'band-ankle-out') {
        const sign = id === 'band-ankle-out' ? side : -side;
        yaw = 0.52 * sign * hold;
        roll = -0.15 * sign * hold;
        angle = -0.12 * hold;
      }
    }
    if (angle && id !== 'ankle-alphabet' && id !== 'heel-toe-tap') ankle = heelPivot(ankle, angle, yaw, roll);
    placeLeg(leg, ankle, Z, 0.39, 0.402);
    orientFoot(leg, angle, yaw, roll);
    if (['toe-curl','ankle-tilt','band-ankle-in','band-ankle-out','foot-dome','toe-spread','towel-scrunch'].includes(id))
      leg.heelHeight = 0;
  }
  p.arms.forEach((arm, i) => restOnThigh(arm, p.legs[i]));
  p.activation = id === 'leg-cross-press' || id === 'foot-press-up' ? load : hold;
}

function seated(p, id, t) {
  const {hold, setup, load} = t,
    {side, a} = p;
  const working = p.legs.find(l => l.s === side);
  const other = p.legs.find(l => l.s !== side);
  if (
    [
      'toe-curl',
      'foot-dome',
      'toe-spread',
      'ankle-tilt',
      'ankle-alphabet',
      'heel-toe-tap',
      'leg-cross-press',
      'foot-press-up',
      'band-ankle-in',
      'band-ankle-out',
      'towel-scrunch'
    ].includes(id)
  ) {
    seatedFoot(p, id, t);
    return;
  }
  if (id === 'back-arch' || id === 'ball-low-back') {
    const ball = id === 'ball-low-back';
    torso(p, [0, 0, ball ? -0.016 * hold : 0.039], ball ? -0.067 * hold : -0.18 * hold, ball ? side * 0.037 * hold : 0);
    for (const leg of p.legs) {
      placeLeg(leg, leg.ankle, Z, 0.39, 0.402);
      orientFoot(leg);
    }
    if (!ball)
      for (const arm of p.arms)
        palmAt(arm, add(p.legs.find(l => l.s === arm.s).hip, [arm.s * 0.082, 0.18, -0.05]), [arm.s * 0.22, -0.88, -0.22]);
  } else if (id === 'seated-forward-bend') {
    torso(p, [0, 0, 0.052], 0.76 * hold);
    for (const leg of p.legs) {
      placeLeg(leg, [leg.s * 0.177, 0.079, 0.4], [leg.s * 0.26, 0, 1], 0.39, 0.402);
      orientFoot(leg);
      const arm = p.arms.find(r => r.s === leg.s);
      palmAt(arm, add(mix(leg.knee, leg.ankle, 0.43 * hold), [leg.s * 0.10, 0.075, 0.122]), [
        0,
        -0.33 - hold,
        0.84 * (1 - hold)
      ], 1, 0.08, [leg.s, -0.22, 0.10]);
    }
  } else if (id === 'side-bend') {
    torso(p, [0, 0, 0], 0, side * 0.29 * hold);
    for (const arm of p.arms) {
      const reach = arm.s === side ? hold : 0;
      palmAt(arm, [arm.s * (0.335 + 0.018 * reach), 0.49 - 0.10 * reach, 0.09], [arm.s * 0.09, -0.96, 0.13]);
    }
  } else if (id === 'figure-four' || id === 'plantar-stretch') {
    const plantar = id === 'plantar-stretch';
    torso(p, [0, 0, 0.07], (plantar ? 0.37 : 0.32) * load);
    for (const leg of p.legs) {
      const rest = add(leg.ankle, [0, 0, 0.07]);
      const acrossKnee = [other.s * 0.11, 0.548, 0.422];
      const end = leg === working ? mix(rest, acrossKnee, setup) : rest;
      if (leg === working) end[1] += 0.086 * arch(setup);
      const bend = leg === working ? [side * 1.6 * setup, 0.24 * setup, 1] : Z;
      placeLeg(leg, end, bend, 0.39, 0.402);
      orientFoot(
        leg,
        leg === working ? -(plantar ? 0.68 : 0.32) * setup : 0,
        leg === working ? -side * 1.4 * setup : 0
      );
    }
    p.arms.forEach((arm, i) => restOnThigh(arm, p.legs[i]));
    palmAt(
      p.arms.find(r => r.s === side),
      add(working.knee, [side * 0.03, 0.117, 0.013]),
      [0, -0.36, 0.85],
      setup
    );
    // Wait until the foot is in reach before taking hold.
    const catchFoot = setup * setup;
    const free = p.arms.find(r => r.s !== side);
    const target = add(plantar ? working.toe : working.ankle, [0, plantar ? 0.045 : 0.080, plantar ? 0.018 : 0.043]);
    target[1] = Math.max(target[1], free.wrist[1] - 0.10 * setup) + 0.07 * arch(catchFoot);
    palmAt(free, target, [side * 0.27, -0.61, 0.57], catchFoot, plantar ? 0.42 : 0.16);
  } else if (id === 'calf-stretch' || id === 'band-leg-press') {
    const band = id === 'band-leg-press';
    torso(p, [0, 0, 0.18], 0.07);
    for (const leg of p.legs) {
      const work = leg === working ? hold : 0;
      const end = [leg.s * 0.124, 0.078 + (band ? 0.275 : 0) * work, 0.49 + (band ? 0.46 : 0.35) * work];
      let angle = -0.44 * work;
      placeLeg(leg, band ? end : heelPivot(end, angle), Z, 0.39, 0.402);
      if (band) {
        // Once the shin swings forward, the heel leads the press and the
        // sole faces the band. The resting foot stays flat.
        angle = -Math.max(0, Math.atan2(leg.ankle[2] - leg.knee[2], leg.knee[1] - leg.ankle[1]));
      }
      orientFoot(leg, angle);
      if (!band) leg.heelHeight = 0;
      if (band && leg === working) {
        p.bandFootLoop = p.arms.map(arm => add(leg.toe, pitch([arm.s * 0.045, -0.016, -0.008], angle)));
      }
    }
    if (band) for (const arm of p.arms) palmAt(arm, [arm.s * 0.244, 0.698, 0.27], [arm.s * 0.05, -0.2, 0.92], 1, 0.77);
    else chairHands(p);
  } else if (id === 'knee-open' || id === 'knee-open-band') {
    const band = id === 'knee-open-band';
    for (const leg of p.legs) {
      const roll = band || leg === working ? hold : 0;
      placeLeg(
        leg,
        [leg.s * (band ? 0.13 : 0.07), 0.079, 0.36],
        [leg.s * ((band ? 0.15 : 0.03) + (band ? 0.68 : 1.12) * roll), 0, 1],
        0.39,
        0.402
      );
      orientFoot(leg, 0, leg.s * 0.1 * roll);
    }
  } else if (id === 'sit-to-stand') {
    const rise = eased((hold - 0.12) / 0.88);
    const tilt = 0.55 * (1 - rise) * setup;
    torso(p, [0, 0.39 * rise, 0.08 + 0.18 * setup + 0.04 * rise], tilt, 0, 0, tilt);
    for (const leg of p.legs) {
      placeLeg(leg, [leg.s * 0.123, 0.08, 0.32]);
      orientFoot(leg);
      const arm = p.arms.find(r => r.s === leg.s);
      // Reach forward during the transfer so the hands clear the rising knees.
      palmAt(arm, add(arm.shoulder, [arm.s * 0.015, -0.18 - 0.12 * rise, 0.36]), [0, -0.16, 1]);
    }
  } else if (id === 'seated-side-tap') {
    torso(p, [0, 0, 0.09]);
    for (const leg of p.legs) {
      const work = leg === working ? a : 0;
      placeLeg(
        leg,
        [leg.s * (0.125 + 0.27 * work), 0.079 + 0.043 * arch(work), 0.44 - 0.04 * work],
        [leg.s * work * 0.55, 0, 1],
        0.39,
        0.402
      );
      orientFoot(leg, 0.12 * work, leg.s * work * 0.16);
    }
    chairHands(p);
  }
}

const walks = new Set(['side-walk', 'heel-toe-walk', 'heel-walk', 'toe-walk']);
// A short racetrack lets the figure turn and walk back without sliding the
// support foot or resetting abruptly. Feet advance on alternate beats.
function station(distance) {
  const length = 0.68,
    radius = 0.145,
    arc = radius * Math.PI,
    perimeter = 2 * (length + arc);
  const d = ((distance % perimeter) + perimeter) % perimeter;
  if (d < length) return {point: [-radius, 0, d - length / 2], yaw: 0};
  if (d < length + arc) {
    const yaw = (d - length) / radius;
    return {point: [-radius * Math.cos(yaw), 0, length / 2 + radius * Math.sin(yaw)], yaw};
  }
  if (d < 2 * length + arc) return {point: [radius, 0, length / 2 - (d - length - arc)], yaw: Math.PI};
  const yaw = Math.PI + (d - 2 * length - arc) / radius;
  return {point: [-radius * Math.cos(yaw), 0, -length / 2 + radius * Math.sin(yaw)], yaw};
}
function walking(p, id, seconds) {
  const beat = Math.floor(seconds),
    fraction = seconds - beat,
    travel = eased(fraction);
  const lateral = id === 'side-walk';
  const swing = (beat % 2 ? 1 : -1) * (lateral && beat % 8 < 4 ? -1 : 1);
  p.side = swing;
  const shoeAngle = id === 'heel-walk' ? -0.44 : id === 'toe-walk' ? 0.5 : 0;
  const tandem = id === 'heel-toe-walk';
  const stepLength = tandem ? 0.214 : 0.135;
  // Each footfall changes one planted position. On reversing, the outside
  // foot leads so the feet never cross on a sideways walk.
  const lateralStations = [
    [-0.28, -0.12],
    [-0.28, 0.08],
    [-0.08, 0.08],
    [-0.08, 0.28],
    [0.12, 0.28],
    [-0.08, 0.28],
    [-0.08, 0.08],
    [-0.28, 0.08],
    [-0.28, -0.12]
  ];
  const ankleAt = (s, n) => {
    const {point, yaw} = station(n * stepLength);
    const lift = id === 'toe-walk' ? 0.06 : 0;
    return add(point, turn([s * (tandem ? 0.012 : 0.08), 0.081 + lift, 0], yaw));
  };
  const feet = p.legs.map(leg => {
    const moving = leg.s === swing;
    if (lateral) {
      const index = leg.s < 0 ? 0 : 1,
        frame = beat % 8;
      return [
        lateralStations[frame][index] + (lateralStations[frame + 1][index] - lateralStations[frame][index]) * travel,
        0.081 + (moving ? 0.053 * arch(travel) : 0),
        0
      ];
    }
    const end = moving ? mix(ankleAt(leg.s, beat - 1), ankleAt(leg.s, beat + 1), travel) : ankleAt(leg.s, beat);
    end[1] += moving ? 0.053 * arch(travel) : 0;
    return end;
  });
  const mid = midpoint(...feet);
  const yaw = lateral ? 0 : station((beat - 0.5 + travel) * stepLength).yaw;
  torso(p, [mid[0], (id === 'toe-walk' ? 0.045 : 0) - 0.043 + 0.014 * arch(travel), mid[2]], 0, 0, yaw);
  p.legs.forEach((leg, i) => {
    placeLeg(leg, feet[i], turn(Z, yaw));
    const shoeYaw = lateral ? 0 : station((leg.s === swing ? beat - 1 + 2 * travel : beat) * stepLength).yaw;
    orientFoot(leg, shoeAngle, shoeYaw);
  });
  for (const arm of p.arms) {
    const axis = turn([arm.s * 0.04, -0.96, 0.15], yaw);
    palmAt(
      arm,
      add(
        arm.shoulder,
        turn(
          [
            arm.s * 0.025,
            -0.465,
            0.085 * arm.s * (lateral ? Math.sin(Math.PI * ((beat % 2) + travel)) : swing * (2 * travel - 1))
          ],
          yaw
        )
      ),
      axis
    );
  }
  if (id === 'heel-walk' && seconds < 2.32) {
    // The first few heel steps start beside the lower end of the rail. The
    // palm releases gradually before the walker enters the turning section.
    const grip = 1 - eased((seconds - 0.42) / 1.9);
    const hand = p.arms[0];
    palmAt(hand, [-0.317, 1.083, -0.175], [-0.42, -0.28, 0.85], grip, 0.68);
  }
}

function standing(p, id, t, move) {
  const {hold, setup, load, phase, seconds} = t,
    {side, a} = p;
  if (walks.has(id)) {
    walking(p, id, seconds);
    return;
  }
  let shift = [0, 0, 0],
    hinge = 0,
    pelvic = 0;
  if (id === 'hip-hinge') {
    shift = [0, -0.059 * hold, -0.125 * hold];
    hinge = 0.67 * hold;
    pelvic = hinge;
  }
  if (id === 'pelvic-tilt') {
    pelvic = -0.18 * hold;
    hinge = 0.042 * hold; // Lumbar rounding accompanies the pelvic tuck.
  }
  if (id === 'back-lunge') shift = [-side * 0.027 * hold, -0.148 * hold, -0.062 * hold];
  if (id === 'soleus-stretch') shift = [0, -0.056 * setup - 0.074 * load, 0.015 * load];
  if (id === 'hip-flexor-stretch' || id === 'hip-flexor-stretch-step') {
    shift = [0, -0.055 * setup, 0.045 * load];
    pelvic = -0.17 * load;
  }
  if (id === 'side-lunge-stretch') shift = [side * 0.188 * hold, -0.07 - 0.081 * hold, 0];
  if (id === 'calf-stretch-step') shift = [0, 0.103 - 0.05 * hold, 0];
  if (id === 'leg-swing') shift = [-side * 0.072 * setup, 0.089 - 0.011 * setup, 0];
  if (id === 'hip-back') shift = [-side * 0.047 * setup, 0, 0];
  if (['leg-curl', 'march', 'one-leg-stand', 'clock-tap', 'quad-stretch', 'side-step'].includes(id))
    shift = [-side * 0.047 * setup, -0.016 * setup, 0];
  if (id === 'tandem-stand') shift = [0, -0.02 * setup, 0.015 * setup];
  torso(p, shift, hinge, 0, 0, pelvic);
  for (const leg of p.legs) {
    const active = leg.s === side;
    let ankle = [leg.s * 0.128, 0.082, 0],
      bend = Z,
      angle = 0,
      yaw = 0,
      roll = 0;
    if (id === 'calf-stretch-step') {
      angle = -0.35 * hold;
      // The forefoot remains on the tread as the heel descends off its edge.
      const toBall = [0, -0.054, 0.136];
      ankle = add([leg.s * 0.128, 0.187, 0], sub(toBall, pitch(toBall, angle)));
    } else if (id === 'side-lunge-stretch') ankle[0] = leg.s * 0.32;
    else if (id === 'tandem-stand') {
      ankle = [leg.s * (0.128 - 0.115 * setup), 0.082 + 0.036 * arch(setup), (active ? 0.119 : -0.112) * setup];
    } else if (id === 'leg-swing') {
      const swingAngle = active ? 0.3 * Math.sin(2 * Math.PI * phase) * setup : 0;
      ankle = [
        active ? leg.s * (0.115 + 0.108 * setup) : leg.s * 0.115,
        0.187 - (active ? 0.04 * setup : 0) + 0.81 * (1 - Math.cos(swingAngle)),
        0.81 * Math.sin(swingAngle)
      ];
      angle = -swingAngle * 0.6;
    } else if (id === 'soleus-stretch' || id === 'hip-flexor-stretch' || id === 'hip-flexor-stretch-step') {
      const step = id === 'hip-flexor-stretch-step',
        stride = id === 'soleus-stretch' ? 0.135 : 0.225;
      ankle = add(ankle, [
        0,
        0.038 * arch(setup) + (step && !active ? 0.105 * setup : 0),
        (active ? -1 : 1) * stride * setup
      ]);
    } else if (active) {
      switch (id) {
        case 'ankle-tilt':
          angle = -0.43 * setup;
          yaw = side * 0.13 * Math.sin(2 * Math.PI * phase) * setup;
          roll = side * 0.34 * Math.sin(2 * Math.PI * phase) * setup;
          ankle = heelPivot(add(ankle, [0, 0.035 * arch(setup), 0.12 * setup]), angle, yaw, roll);
          leg.heelHeight = 0.035 * arch(setup);
          break;
        case 'hip-back': {
          // Trace a long arc from the hip. A little clearance on departure
          // keeps the toes off the floor while the heel travels backwards.
          const swing = 0.43 * hold;
          ankle = add(leg.hip, [side * 0.018, -0.828 * Math.cos(swing) + 0.004 * arch(hold), -0.828 * Math.sin(swing)]);
          angle = 0.30 * hold ** 2;
          break;
        }
        case 'leg-curl':
        case 'quad-stretch': {
          const flex = (id === 'quad-stretch' ? 2.52 : 1.47) * hold;
          placeLeg(leg, ankle);
          leg.ankle = add(leg.knee, pitch(sub(leg.ankle, leg.knee), flex));
          orientFoot(leg, flex);
          continue;
        }
        case 'one-leg-stand':
          ankle = add(ankle, [0, 0.093 * hold, -0.081 * hold]);
          break;
        case 'march':
          ankle = add(ankle, [0, 0.136 * a, 0.048 * a]);
          break;
        case 'side-step':
          ankle = add(ankle, [side * 0.228 * a, 0.057 * arch(a), 0]);
          break;
        case 'clock-tap': {
          const pos = Math.min(2.99999, phase * 3),
            beat = Math.floor(pos),
            step = (1 - Math.cos(2 * Math.PI * (pos % 1))) / 2;
          const target = [
            [side * 0.014, 0, 0.215],
            [side * 0.21, 0, 0],
            [side * 0.021, 0, -0.195]
          ][beat];
          ankle = add(ankle, add(mul(target, step), [0, 0.05 * arch(step) + 0.016 * step, 0]));
          angle = 0.17 * step;
          break;
        }
        case 'back-lunge':
          ankle = add(ankle, [0, 0.076 * setup + 0.057 * arch(setup), -0.407 * setup]);
          angle = 0.65 * setup;
          break;
      }
    }
    placeLeg(leg, ankle, bend);
    orientFoot(leg, angle, yaw, roll);
    if (id === 'calf-stretch-step') leg.toe = [leg.s * 0.128, 0.133, 0.136];
  }
  if (move.equipment?.includes('support')) {
    // March has two forward grips. A crossbar also lets either hand remain
    // supported while its partner reaches behind for the quadriceps stretch.
    if (id === 'march' || id === 'quad-stretch') for (const arm of p.arms) railHand(arm, true);
    else {
      const graspZ = id === 'soleus-stretch' ? 0.09 : id === 'leg-swing' || id === 'calf-stretch-step' ? 0.13 : 0.19;
      railHand(p.arms[1], false, graspZ);
    }
  }
  if (id === 'quad-stretch') {
    const leg = p.legs.find(l => l.s === side),
      arm = p.arms.find(r => r.s === side);
    const grip = add(leg.ankle, [side * 0.022, 0.023, 0.016]);
    palmAt(arm, grip, [side * 0.08, -0.67, -0.7], hold, 0.7, [side * 0.85, -0.6, -0.3]);
  }
  if (id === 'hip-hinge' || id === 'pelvic-tilt')
    for (const arm of p.arms) {
      if (arm.holdingRail) continue;
      const leg = p.legs.find(l => l.s === arm.s);
      const target =
        id === 'pelvic-tilt'
          ? add(leg.hip, [leg.s * 0.045, 0.1, 0.052])
          : add(mix(leg.hip, leg.knee, 0.28 + 0.61 * hold), [leg.s * 0.022, 0.029, 0.06]);
      palmAt(arm, target, [arm.s * 0.045, -0.95, 0.18]);
    }
}

function floorTrunk(p, tilt, shift) {
  const pivot = midpoint(p.arms[0].shoulder, p.arms[1].shoulder);
  const transform = v => add(add(pivot, shift), pitch(sub(v, pivot), tilt));
  // Shoulders and head rest on the mat. Flexion is distributed below them.
  p.centre = transform(p.centre);
  for (const l of p.legs) l.hip = transform(l.hip);
  p.spine = {pelvicUp: pitch([0, 0, -1], tilt), chestUp: [0, 0, -1], chest: pivot};
}
function straightFloorLeg(leg, amount, angle = 0) {
  const destination = add(leg.hip, [leg.s * 0.018, 0.83 * Math.sin(angle) - 0.038, 0.825 * Math.cos(angle)]);
  placeLeg(leg, mix(leg.ankle, destination, amount), Y, 0.42, 0.41);
  orientFoot(leg, -(1.28 + angle) * amount);
}
function floor(p, id, t) {
  const {side, a} = p,
    {hold, setup, load, phase} = t;
  const working = p.legs.find(l => l.s === side);
  const [left, right] = p.legs;
  if (id === 'bridge') floorTrunk(p, -0.46 * hold, [0, 0, 0]);
  if (id === 'ball-low-back') floorTrunk(p, -0.055, [0.015 * side * hold, 0, 0]);
  if (id === 'cross-twist') {
    floorTrunk(p, 0, [0, 0, 0]);
    p.centre = add(p.centre, [-side * 0.017 * hold, 0.016 * hold, 0]);
    for (const l of p.legs) {
      l.hip[0] -= side * 0.038 * hold;
      l.hip[1] += (l === working ? 0.089 : 0) * hold;
    }
  }
  for (const leg of p.legs) {
    const active = leg === working;
    let end = leg.ankle,
      bend = Y,
      angle = 0,
      yaw = 0,
      roll = 0;
    if (id === 'straight-leg-raise' || id === 'hamstring-lift') {
      if (id === 'straight-leg-raise' && !active) {
        straightFloorLeg(leg, 1 - setup);
      } else {
        const elevation = active ? (id === 'hamstring-lift' ? 1.35 : 0.28) * load : 0;
        straightFloorLeg(leg, 1, elevation);
      }
      continue;
    }
    if (id === 'quad-set' || id === 'towel-knee-lift') {
      straightFloorLeg(leg, 1);
      if (id === 'towel-knee-lift') {
        // The roll supports the middle of the same thigh as the lifting shoe.
        const onRoll = 0.5 + 0.5 * (active ? 1 : -1) * setup;
        const dy = -0.02 + 0.068 * onRoll;
        const knee = add(leg.hip, [leg.s * 0.008, dy, Math.sqrt(0.42 ** 2 - 0.008 ** 2 - dy ** 2)]);
        const shin = Math.asin(Math.min(0.99, (0.073 - knee[1]) / 0.41)) + (active ? 0.28 * load : 0);
        leg.knee = knee;
        leg.ankle = add(knee, [0, 0.41 * Math.sin(shin), 0.41 * Math.cos(shin)]);
        orientFoot(leg, -1.29 - shin);
      }
      continue;
    }
    if (id === 'heel-dig' && !active) {
      straightFloorLeg(leg, setup);
      continue;
    }
    if (id === 'knee-hug' || id === 'knee-hug-both' || id === 'piriformis-pull') {
      let lift = active ? hold : 0;
      if (id === 'knee-hug-both') {
        const offset = active ? 0 : 0.09;
        lift = eased(Math.min(phase - offset, 1 - phase - (0.09 - offset)) / 0.29);
      }
      if (lift) {
        const piriformis = id === 'piriformis-pull';
        const highKnee = add(leg.hip, [leg.s * (piriformis ? 0.109 : 0.019), 0.331, -0.241]);
        const highAnkle = add(highKnee, [
          piriformis ? -leg.s * 0.313 : leg.s * 0.012,
          -(piriformis ? 0.18 : 0.28),
          piriformis ? 0.19 : 0.3
        ]);
        end = mix(end, highAnkle, lift);
        bend = [leg.s * (piriformis ? 0.75 : 0.08) * lift, 1, -0.52 * lift];
        angle = -0.76 * lift;
      }
    }
    if (id === 'supine-march' && active) {
      end = add(end, [0, 0.112 * a, -0.087 * a]);
      angle = -0.16 * a;
    }
    if (id === 'knee-squeeze') bend = [-leg.s * 0.28 * hold, 1, 0];
    if (id === 'knee-fallout') {
      bend = [leg.s * 1.28 * hold, 1, 0];
      yaw = leg.s * 0.18 * hold;
      roll = leg.s * 0.17 * hold;
    }
    if (id === 'cross-twist') {
      if (!active) {
        straightFloorLeg(leg, setup);
        continue;
      }
      end = add(end, [-side * 0.205 * hold, 0.023 * hold, -0.16 * hold]);
      bend = [-side * 2.8 * hold, 1 - 0.2 * hold, 0];
      roll = -side * 0.66 * hold;
    }
    placeLeg(leg, end, bend, 0.42, 0.41);
    orientFoot(leg, angle, yaw, roll);
  }
  if (['knee-hug', 'knee-hug-both', 'piriformis-pull', 'hamstring-lift', 'cross-twist'].includes(id)) {
    for (const arm of p.arms) {
      const same = arm.s === side;
      let target,
        direction = [arm.s * 0.14, -0.32, 0.75],
        amount = hold;
      if (id === 'knee-hug-both') {
        const knee = arm.s === left.s ? left.knee : right.knee;
        target = add(knee, [arm.s * 0.048, 0.032, -0.01]);
      } else if (id === 'hamstring-lift') {
        target = add(mix(working.hip, working.knee, 0.43), [arm.s * 0.047, -0.016, -0.046]);
        direction = [-arm.s * 0.61, 0.48, 0.4];
        amount = load;
      } else if (id === 'cross-twist') {
        target = same
          ? add(arm.shoulder, [arm.s * 0.51, -0.054, -0.015])
          : add(working.knee, [-side * 0.025, 0.062, 0]);
        direction = same ? [arm.s * 0.97, -0.012, 0.1] : [side * 0.78, -0.21, 0.29];
      } else {
        const point = id === 'piriformis-pull' && !same ? working.ankle : working.knee;
        target = add(point, [arm.s * 0.047, 0.036, same ? -0.02 : 0.015]);
      }
      palmAt(arm, target, direction, amount, 0.46, [arm.s, 0.26, -0.26]);
    }
  }
}

const staticHolds = {
  'tummy-draw': 'Lower abdomen',
  'leg-cross-press': 'Thighs',
  'foot-press-up': 'Front shin',
  'knee-squeeze': 'Inner thighs',
  'quad-set': 'Front thigh',
  'heel-dig': 'Back of thigh'
};

/** Working muscle areas of the near-motionless contractions. */
export function lowerActivation(p, move) {
  const id = move.animation,
    label = staticHolds[id];
  if (!label) return;
  const active = p.legs.find(l => l.s === p.side);
  if (id === 'tummy-draw')
    return {
      label,
      points: [add(mix(centerHip(p), p.centre, 0.61), move.pose === 'supine' ? [0, 0.1, 0] : [0, 0.002, 0.1])]
    };
  if (id === 'foot-press-up') return {label, points: [add(mix(active.knee, active.ankle, 0.48), [0, 0, 0.04])]};
  const legs = id === 'knee-squeeze' || id === 'leg-cross-press' ? p.legs : [active];
  return {
    label,
    points: legs.map(l =>
      add(mix(l.hip, l.knee, 0.6), [
        id === 'knee-squeeze' ? -l.s * 0.038 : l.s * 0.017,
        id === 'heel-dig' ? -0.03 : 0.035,
        0.012
      ])
    )
  };
}

/** Return an authored pose or undefined when another movement group is responsible. */
export function lowerPose(move, seconds, basePose) {
  const id = move.animation;
  if (!names[move.pose]?.has(id)) return;
  const p = basePose({motion: 'rest', pose: move.pose}, seconds);
  const cycles = seconds / 4,
    cycle = Math.floor(cycles),
    phase = cycles - cycle;
  const approach = Math.min(phase, 1 - phase);
  const hold = eased(approach / 0.38);
  const t = {seconds, cycle, phase, hold, setup: eased(approach / 0.32), load: eased((approach - 0.16) / 0.27)};
  p.activation = hold;
  for (const leg of p.legs) leg.across = X;
  if (move.pose === 'seated') seated(p, id, t);
  if (move.pose === 'standing') standing(p, id, t, move);
  if (move.pose === 'supine') floor(p, id, t);
  return p;
}

export {moveUpper, torso, placeLeg, orientFoot};
