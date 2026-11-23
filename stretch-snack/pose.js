import {handNeckPose, handNeckActivation, handNeckCycleSeconds} from './movements/hand-neck.js';
import {upperPose, upperActivation} from './movements/upper.js';
import {lowerPose, lowerActivation} from './movements/lower.js';
import {add, mixPoint, turn, lean, pitchPoint, scaledTo, middleJoint, handGeometry, eased} from './movements/geometry.js';
export {mixPoint} from './movements/geometry.js';

// Native heel pad to ankle, in the planted-foot frame. Rotating about this
// contact keeps the back of the sole on the ground when the toes rise.
const heelToAnkle = [0, 0.075, 0.026];
/** @param {number[]} ankle @param {number} angle */
function raiseToes(ankle, angle) {
  const rotated = pitchPoint(heelToAnkle, angle);
  return ankle.map((v, i) => v + rotated[i] - heelToAnkle[i]);
}

const bilateral = ['palm-turn', 'hand-open', 'wrist-bend', 'heel-lift', 'toe-lift',
  'shoulder-roll', 'shoulder-squeeze', 'chest-open', 'band-open', 'elbow-bend'];
export const repetitionSeconds = 4;

/** @param {{motion:string, pose:string}} move @param {number} seconds */
export function basePose(move, seconds) {
  const { motion, pose } = move;
  const seated = pose === 'seated';
  const supine = pose === 'supine';
  const cycles = seconds / repetitionSeconds;
  const cycle = Math.floor(cycles);
  const a = (1 - Math.cos(2 * Math.PI * cycles)) / 2;
  const sideCycle = motion === 'ankle-circle' ? Math.floor(cycle / 2) : cycle;
  const side = sideCycle % 2 ? 1 : -1;
  /** @param {number} s */
  const active = (s) => bilateral.includes(motion) || s === side;
  /** @param {string} name */
  const motionAmount = (name) => (motion === name ? a : 0);
  const squat = motionAmount('knee-bend');
  // Form / Motion gives held stretches distinct entry, hold and release phases.
  const phase = cycles - cycle;
  const ramp = Math.min(1, Math.min(phase, 1 - phase) / 0.31);
  const heldStretch = ramp ** 3 * (ramp * (6 * ramp - 15) + 10);
  const glutes = motion === 'glute-squeeze' ? heldStretch : 0;
  const kneesIn = motion === 'knee-squeeze' ? eased(heldStretch / 0.75) : 0;
  const seatedExtension = motion === 'hamstring-lean' || motion === 'quad-set';
  const straighten = seatedExtension ? eased(heldStretch / 0.76) : 0;
  const activation = glutes || (motion === 'knee-squeeze' || motion === 'quad-set' ? eased((heldStretch - 0.75) / 0.25) : 0);
  const calf = motion === 'calf-stretch' ? heldStretch : 0;
  const backStep = eased(calf / 0.52);
  const calfLoad = eased((calf - 0.26) / 0.74);
  // Pivot the entire foot about the ball for heel raises. The toe remains planted.
  const footLength = Math.hypot(0.136, 0.054);
  const footAngle = Math.atan2(0.054, 0.136) + 0.47 * motionAmount('heel-lift') - 0.5 * motionAmount('toe-lift');
  const footDrop = footLength * Math.sin(footAngle);
  const footReach = footLength * Math.cos(footAngle);
  const rise = motion === 'heel-lift' ? footDrop - 0.054 : 0;
  const standingToeLift = motion === 'toe-lift' && !seated;
  const soleHeight = standingToeLift ? -0.006 : 0;
  const stepTravel = motionAmount('step-up');
  const stepHeight = 0.14;
  const shift = side * motionAmount('weight-shift');
  const pelvis = [
    0.04 * shift,
    (seated ? 0.51 : 0.91 + rise + soleHeight) - 0.095 * squat - (0.025 * backStep + 0.033 * calfLoad) + eased((stepTravel - 0.45) / 0.55) * stepHeight,
    // Sit nearer the chair's front so the straight thigh can slope down past the cushion.
    (seatedExtension ? 0.20 : 0) - 0.09 * squat + 0.04 * calfLoad + stepTravel * 0.24 - (standingToeLift ? 0.022 * a : 0),
  ];
  const yaw = side * 0.43 * motionAmount('trunk-turn');
  const bend = side * (0.19 * motionAmount('side-bend') + 0.035 * motionAmount('ball-back'));
  // The seated tilts, rounding and hip hinge have distinct pelvic and thoracic
  // motion. Split the centreline at the lumbar spine instead of bending the
  // neck and shoulders around the hip as a single rigid board.
  let pelvicPitch = 0, lumbarPitch = 0, chestPitch = 0;
  if (motion === 'seated-pelvic-tilt') {
    pelvicPitch = 0.14 - 0.29 * a;
    lumbarPitch = 0.12 - 0.23 * a;
    chestPitch = -0.10 + 0.20 * a;
  } else if (motion === 'back-round' || motion === 'self-hug') {
    const round = motion === 'back-round' ? a : 0.45 * a;
    pelvicPitch = -0.14 * round;
    lumbarPitch = -0.07 * round;
    chestPitch = -0.035 + 0.50 * round;
  } else if (motion === 'back-arch') {
    lumbarPitch = -0.13 * a;
    chestPitch = -0.22 * a;
  } else if (motion === 'hamstring-lean') {
    pelvicPitch = lumbarPitch = chestPitch = 0.29 * eased((heldStretch - 0.50) / 0.50);
  } else if (motion === 'ball-back') {
    lumbarPitch = -0.07 * a;
    chestPitch = -0.12 * a;
  }
  /** @param {number[]} offset */
  const trunk = (offset) => {
    if (!lumbarPitch && !chestPitch) return add(pelvis, turn(lean(offset, bend), yaw));
    const lower = Math.min(0.24, offset[1]);
    const joint = add(pitchPoint([0, lower, 0], lumbarPitch),
      pitchPoint([offset[0], offset[1] - lower, offset[2]], chestPitch));
    return add(pelvis, turn(lean(joint, bend), yaw));
  };
  const rollAngle = 2 * Math.PI * eased(phase);
  const shrug = motion === 'shoulder-roll' ? (1 - Math.cos(rollAngle)) / 2 : 0;
  const squeeze = motionAmount('shoulder-squeeze');
  // Form / Motion's neck release: ease into the tilt, hold through the
  // middle 38% of the cycle, then return before changing sides.
  const tilt = motion === 'neck-tilt' ? heldStretch : 0;
  const headYaw = yaw + side * (0.66 * motionAmount('neck-turn') - 0.025 * tilt);
  const headTilt = bend - side * (0.15 + 0.19 * 0.85) * tilt;
  const chin = motion === 'chin-tuck' ? heldStretch : 0;
  const pitch = 0.02 * tilt + chestPitch + 0.035 * chin;
  const neck = trunk([0, 0.535 + 0.002 * chin, -0.034 * chin]);
  /** @param {number[]} offset */
  const head = (offset) => add(neck, turn(lean(pitchPoint(offset, pitch), headTilt), headYaw));
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
    let toeOffset = [0, -footDrop, footReach];
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
      if (['foot-slide', 'knee-squeeze', 'ankle-circle', 'hamstring-lean', 'quad-set'].includes(motion)) {
        const slideBack = working ? 0.165 * motionAmount('foot-slide') : 0;
        const slideOut = working ? 0.307 * straighten : 0;
        const circlePhase = cycle % 2 + phase;
        const circleLift = working && motion === 'ankle-circle' ? eased(Math.min(circlePhase, 2 - circlePhase) / 0.16) : 0;
        ankle = add(ankle, [0, 0.044 * circleLift, slideOut - slideBack]);
        knee = middleJoint(hip, ankle, Math.hypot(0.39, 0.015), 0.402, [-s * 0.21 * kneesIn, 0, 1]);
        if (circleLift) {
          // Each foot traces a slow circle in each direction before changing.
          const theta = 2 * Math.PI * eased((phase - 0.15) / 0.70);
          const sense = s * (cycle % 2 === 0 ? 1 : -1);
          toeOffset = turn(pitchPoint(toeOffset, -0.28 * (1 - Math.cos(theta))), sense * 0.34 * Math.sin(theta));
        } else if (slideOut > 0) {
          // Dorsiflex about the planted heel as the leg straightens.
          const liftAngle = -0.40 * straighten;
          ankle = raiseToes(ankle, liftAngle);
          knee = middleJoint(hip, ankle, Math.hypot(0.39, 0.015), 0.402, [0, 0, 1]);
          toeOffset = pitchPoint(toeOffset, liftAngle);
        }
      }
    } else {
      const abduction = working ? motionAmount('hip-side') : 0;
      const stride = working ? backStep : 0;
      const step = motion === 'step-up' ? eased(working ? stepTravel / 0.45 : (stepTravel - 0.45) / 0.55) : 0;
      ankle = [
        s * (0.128 + (motion === 'weight-shift' ? 0.04 : 0) + 0.235 * abduction),
        0.084 + soleHeight + 0.046 * abduction + rise + 0.042 * Math.sin(Math.PI * stride)
          + stepHeight * step + 0.11 * Math.sin(Math.PI * step),
        -0.22 * stride + step * 0.32 + (rise ? 0.136 - footReach : 0),
      ];
      if (motion === 'toe-lift') {
        ankle = raiseToes(ankle, -0.5 * a);
      }
      knee = middleJoint(hip, ankle, 0.423, 0.414, [0, 0, 1]);
    }
    const toe = add(ankle, toeOffset);
    return { s, hip, knee, ankle, toe };
  });
  // The fitted hands extend about 18 cm beyond the wrist. Rest them along
  // the thighs and carry them with a rising knee, leaving the chair arms free.
  const lap = seated ? legs.map(leg => {
    const along = leg.knee.map((v,i) => v - leg.hip[i]);
    return {
      wrist: add(mixPoint(leg.hip, leg.knee, 0.35), [leg.s * 0.008, 0.152, 0.008 - 0.24 * along[1]]),
      axis: scaledTo([0.25 * along[0], along[1] - 0.018, along[2]], 1),
    };
  }) : [];
  const arms = [-1, 1].map((s, i) => {
    const chestOpener = motionAmount('palm-forward');
    const hug = motionAmount('self-hug');
    const shoulder = trunk([
      s * (0.182 - 0.014 * squeeze - 0.012 * hug),
      0.47 + 0.032 * shrug - 0.010 * chestOpener - (s === side ? 0.006 : 0.014) * tilt,
      -0.033 * squeeze - 0.018 * chestOpener + 0.026 * hug - (motion === 'shoulder-roll' ? 0.026 * side * Math.sin(rollAngle) : 0),
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
    /** @type {number[] | undefined} */
    let handAim;
    const restingOnLap = seated && !handWork && !['self-hug', 'trunk-turn', 'palm-forward'].includes(motion);
    if (restingOnLap) {
      const rest = lap[i];
      wrist = rest.wrist;
      elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.5, -0.6, -0.9]);
      handAim = rest.axis;
      if (motion === 'elbow-bend' && a > 0) {
        const fore = pitchPoint(wrist.map((v,k) => v - elbow[k]), -1.40 * a);
        fore[0] *= 1 - 0.65 * a;
        const from = scaledTo(elbow.map((v,k) => v - shoulder[k]), 1);
        elbow = add(shoulder, scaledTo(mixPoint(from,[s * 0.10,-1,0.17],a),upper));
        wrist = add(elbow, scaledTo(fore,lower));
        handAim = pitchPoint(rest.axis, -1.38 * a);
      }
      if (motion === 'overhead-reach' || motion === 'chest-open') {
        // Start each reach at the same physical rest pose. Blend the upper
        // and lower *directions* so neither segment shortens on departure.
        const overhead = motion === 'overhead-reach';
        const reach = overhead && !active(s) ? 0 : a;
        if (reach > 0) {
          const amount = eased(reach / 0.55);
          const angle = 0.1 + 2.75 * reach;
          const flex = 1.34 - 1.16 * reach;
          const armAxis = overhead
            ? [s * Math.sin(angle) * 0.87, -Math.cos(angle), Math.sin(angle) * Math.sqrt(1 - 0.87 ** 2)]
            : scaledTo([s * (0.031 + 0.14 * reach), -0.25, -0.06 * reach], 1);
          const forwardAxis = [-s * Math.sqrt(1 - 0.87 ** 2), 0, 0.87];
          const foreAxis = overhead
            ? armAxis.map((v, k) => Math.cos(flex) * v + Math.sin(flex) * forwardAxis[k])
            : [s * Math.sin(1.4) * Math.sin(outward), -Math.cos(1.4), Math.sin(1.4) * Math.cos(outward)];
          const from = scaledTo(elbow.map((v,k) => v - shoulder[k]), 1);
          const fore = scaledTo(wrist.map((v,k) => v - elbow[k]), 1);
          elbow = add(shoulder, scaledTo(mixPoint(from,armAxis,amount),upper));
          wrist = add(elbow, scaledTo(mixPoint(fore,foreAxis,amount),lower));
          const handTravel = overhead ? eased((reach - 0.28) / 0.42) : amount;
          handAim = scaledTo(mixPoint(rest.axis,foreAxis,handTravel),1);
        }
      }
    }
    const support = !seated && !supine && s === 1 &&
      ['hip-side', 'calf-stretch', 'knee-bend', 'heel-lift', 'toe-lift', 'weight-shift', 'step-up'].includes(motion);
    if (support) {
      // Approach from inside the rail, with the palm above it and the fingers
      // flexing across its diameter. The rail runs along Z at X .32, Y 1.055.
      wrist = [0.275, 1.084, 0.27];
      elbow = middleJoint(shoulder, wrist, upper, lower, [0.8, -0.65, -0.6]);
    }
    if (motion === 'trunk-turn') {
      wrist = trunk([-s * 0.075, 0.33, 0.19 + s * 0.013]);
      elbow = middleJoint(shoulder, wrist, upper, lower, turn([s * 0.32, -1, 0.12], yaw));
      handAim = turn(scaledTo([-s * 0.92, 0.38, 0.06], 1), yaw);
    }
    if (motion === 'self-hug') {
      // The lower hand travels around the near side of the other forearm
      // before settling against the upper arm.
      const crossing = Math.sin(Math.PI * hug);
      const approach = eased((hug - 0.94) / 0.06);
      const pass = s < 0 ? 0.040 * eased(hug / 0.5) * (1 - approach) : 0;
      wrist = trunk(add(mixPoint([s * 0.15, 0.275, 0.19], [-s * 0.095, 0.455 + 0.025 * s, 0.232 - 0.022 * s], hug),
        [0, (0.070 + s * 0.025) * crossing, ((s < 0 ? 0.13 * hug : 0) - s * 0.026) * crossing
          + pass - (s < 0 ? 0.014 : 0.030) * approach]));
      elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.72, -0.85, 0.75]);
    } else if (motion === 'back-arch') {
      wrist = add(pelvis, [s * 0.183, 0.092, 0.053]);
      elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.85, 0, -0.9]);
    } else if (motion === 'palm-forward') {
      if (seated) {
        wrist = add(pelvis, [s * 0.211, 0.083, 0.213 - 0.012 * chestOpener]);
        elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.28, -1, -0.62]);
        handAim = scaledTo([s * 0.08, -0.58, 0.80], 1);
      } else {
        elbow = add(shoulder, scaledTo([s * 0.11, -1, 0.18], upper));
        wrist = add(elbow, scaledTo([s * 0.21, -1, 0.40], lower));
      }
    } else if (motion === 'hamstring-lean') {
      // Both hands slide across to rest on the bent thigh as the leg extends.
      const bent = lap[side < 0 ? 1 : 0];
      // The crossing hand settles over its partner instead of sharing space
      // with its knuckles. Lift a little while passing across the lap.
      const crossing = s === side;
      wrist = mixPoint(lap[i].wrist, add(bent.wrist, [s * 0.015, crossing ? 0.044 : -0.008, crossing ? 0.045 : 0.028]), straighten);
      if (crossing) wrist[1] += 0.030 * Math.sin(Math.PI * straighten);
      elbow = middleJoint(shoulder, wrist, upper, lower, [s * 0.95, -0.4, 0.10 + 0.75 * straighten]);
      handAim = scaledTo(mixPoint(lap[i].axis, bent.axis, straighten), 1);
    }
    if (motion === 'wrist-stretch') {
      const target = trunk(s === side ? [s * 0.04, 0.39, 0.415] : [s * 0.14, 0.51, 0.490]);
      wrist = mixPoint(wrist, target, a);
      if (s !== side) wrist[2] += 0.032 * Math.sin(Math.PI * a);
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
    else if (support) handAxis = scaledTo([1, 0, 0.30], 1);
    else if (handAim) handAxis = handAim;
    else if (motion === 'self-hug') handAxis = scaledTo(mixPoint([s * 0.02, 0.76, 0.66], [-s * 0.9, 0.24, -0.15], hug), 1);
    else if (motion === 'back-arch') handAxis = scaledTo([s * 0.08, -0.91, 0.32], 1);
    else handAxis = scaledTo(wrist.map((v, i) => v - elbow[i]), 1);
    if (motion === 'wrist-bend' || (motion === 'wrist-stretch' && s === side)) {
      const angle = motion === 'wrist-stretch' ? 1.05 * a : a * 0.58 * side;
      handAxis = [
        handAxis[0],
        handAxis[1] * Math.cos(angle) + handAxis[2] * Math.sin(angle),
        handAxis[2] * Math.cos(angle) - handAxis[1] * Math.sin(angle),
      ];
    } else if (motion === 'wrist-stretch') {
      handAxis = scaledTo(mixPoint(handAxis, [side * 0.88, 0.28, -0.22], a), 1);
    }
    const palm = add(
      wrist,
      handAxis.map((v) => v * 0.045),
    );
    const close = support ? 0.71 : motion === 'hand-open' ? 1 - a : motion === 'towel-grip' ? 0.24 + (active(s) ? 0.7 * a : 0) : 0;
    const spread = motion === 'hand-open' ? 0.025 + 0.115 * a : 0.045;
    const roll = motion === 'palm-turn' ? (a * 2.8 - 1.35) * s
      : motion === 'palm-forward' ? -s * (1.50 + 1.35 * a) : restingOnLap ? -0.30 * s : supine ? 0 : 0.12 * s;
    const hand = handGeometry(palm, handAxis, s, roll, close, spread);
    if (support) hand.thumb = [0.299, 1.050, 0.314]; // Opposes the fingers on the inner side of the rail.
    return {s, shoulder, elbow, wrist, palm, holdingRail:support, ...hand};
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
    spine: ['seated-pelvic-tilt', 'back-round', 'self-hug', 'back-arch', 'hamstring-lean', 'ball-back'].includes(motion) ? {
      pelvicUp: pitchPoint([0, 1, 0], pelvicPitch),
      chestUp: turn(lean(pitchPoint([0, 1, 0], chestPitch), bend), yaw),
      chest: trunk([0, 0.47, 0]),
    } : undefined,
    activation,
    a,
    side,
  };
}

/** @typedef {{pose:string, motion:string, family?:string, animation?:string, region?:string, uses?:string[], equipment?:string[]}} Movement */
/** @param {Movement} move */
export function movementCycleSeconds(move) {
  return move.family === 'hand-neck' ? handNeckCycleSeconds(move) : repetitionSeconds;
}
const animators = {'hand-neck':handNeckPose, upper:upperPose, lower:lowerPose};

/** @param {Movement} move @param {number} seconds */
export function movementPose(move, seconds) {
  if (!move.family) return basePose(move, seconds);
  const animate = animators[move.family];
  const posed = animate?.(move, seconds, basePose);
  if (!posed) throw new Error('Missing demonstration for ' + move.pose + '-' + move.animation);
  return posed;
}

/** @param {ReturnType<typeof movementPose>} pose @param {Movement} move */
export function movementActivation(pose, move) {
  switch (move.family) {
    case 'hand-neck': return handNeckActivation(pose, move);
    case 'upper': return upperActivation(pose, move);
    case 'lower': return lowerActivation(pose, move);
  }
}
