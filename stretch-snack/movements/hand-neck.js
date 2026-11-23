// Wrist, fingertip and head targets in the same metre-based frame as the fitted mannequin.
import {rig} from '../form-motion/model.js';
import {add, cross, eased, lean, middleJoint, mixPoint, pitchPoint, scaledTo, turn} from './geometry.js';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map(v => v * k);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const norm = a => Math.hypot(...a);
const unit = a => scaledTo(a, 1);
const shift = (at, dir, distance) => add(at, mul(dir, distance));
const pulse = phase => (1 - Math.cos(Math.PI * 2 * phase)) / 2;
const hold = (p, rise) => eased(Math.min(p, 1 - p) / rise);
const Y = [0, 1, 0], Z = [0, 0, 1];
const hands = ['tendon-glide', 'finger-spread', 'thumb-sweep', 'thumb-touch', 'wrist-wave', 'finger-lift',
  'finger-block', 'hand-ball-roll', 'ball-grip', 'prayer-stretch', 'wrist-extensor-stretch', 'wrist-press'];
const head = ['neck-nod', 'neck-diagonal', 'anchored-neck-stretch', 'neck-press-front', 'neck-press-side',
  'neck-press-turn', 'neck-press-back', 'head-press', 'head-nod'];
const cycles = {'tendon-glide': 12, 'finger-lift': 12, 'finger-block': 20, 'thumb-touch': 18};

function handBasis(forward, inward) {
  const axis = unit(forward);
  let lateral = cross(axis, inward);
  if (norm(lateral) < 0.00001) lateral = cross(axis, Math.abs(axis[2]) < .8 ? Z : Y);
  const across = unit(lateral);
  return [across, axis, cross(across, axis)];
}
// Rotate the whole palm frame along a single geodesic. Interpolating the up
// and palm-normal vectors separately rolls the hand over when they cross.
function rotatedPalm(old, next, amount) {
  if (amount <= 0) return old;
  if (amount >= 1) return next;
  const rotation = [0,1,2].map(i => [0,1,2].map(j => old.reduce((sum, a, k) => sum + next[k][i] * a[j], 0)));
  const trace = rotation[0][0] + rotation[1][1] + rotation[2][2];
  const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
  if (angle < .00001) return old;
  let axis = [rotation[2][1] - rotation[1][2], rotation[0][2] - rotation[2][0], rotation[1][0] - rotation[0][1]];
  if (norm(axis) < .0001) {
    const i = [0,1,2].reduce((a,b) => rotation[b][b] > rotation[a][a] ? b : a, 0);
    axis = rotation[i].map((v,j) => v + Number(i === j));
  }
  axis = unit(axis);
  const cos = Math.cos(amount * angle), sin = Math.sin(amount * angle);
  return old.map(v => add(add(mul(v, cos), mul(cross(axis, v), sin)), mul(axis, dot(axis, v) * (1 - cos))));
}

// Use the fitted knuckles, thumb root and phalanx lengths. This keeps a fingertip
// contact on the visible mesh when we switch between the full body and the inset.
function measureHand(prefix, side) {
  const joint = name => rig.boneNames.indexOf('mixamorig:' + prefix + 'Hand' + name);
  const wrist = rig.restHeads[joint('')];
  const names = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
  const roots = names.map(d => rig.restHeads[joint(d + '1')]);
  const axis = unit(sub(mixPoint(roots[1], roots[2], .5), wrist));
  const basis = handBasis(axis, cross(mul(sub(roots[3], roots[0]), side), axis));
  return names.map((digit, index) => ({
    root: basis.map(a => dot(a, sub(roots[index], wrist))),
    lengths: [1, 2, 3].map(i => {
      const j = joint(digit + i);
      return norm(sub(rig.restTails[j], rig.restHeads[j]));
    }),
  }));
}
const dimensions = [measureHand('Right', -1), measureHand('Left', 1)];

function poseHand(arm, target, forward, inward, setup = 1, bend = [arm.s * .65, -.8, -.25]) {
  const oldAxis = unit(sub(arm.palm, arm.wrist));
  const oldAcross = sub(arm.fingerJoints[3][0], arm.fingerJoints[0][0]);
  const [across, axis, normal] = rotatedPalm(handBasis(oldAxis, cross(oldAcross, oldAxis)), handBasis(forward, inward), setup);
  const travel = sub(mixPoint(arm.wrist, target, setup), arm.shoulder);
  arm.wrist = add(arm.shoulder, scaledTo(travel, Math.min(norm(travel), .5049)));
  const restBend = unit(sub(arm.elbow, arm.shoulder));
  arm.elbow = middleJoint(arm.shoulder, arm.wrist, .26, .245, mixPoint(restBend, unit(bend), setup));
  const local = (x, y, z) => arm.wrist.map((v, k) => v + across[k] * x + axis[k] * y + normal[k] * z);
  arm.palm = local(0, .080, 0);
  const digits = dimensions[arm.s === 1 ? 1 : 0];
  const chains = [];
  function finger(index, angles, splay = 0) {
    const knuckle = local(...digits[index].root);
    const chain = [knuckle];
    const direction = add(mul(axis, Math.cos(splay)), mul(across, Math.sin(splay)));
    for (const [i, length] of digits[index].lengths.entries()) {
      const ray = add(mul(direction, Math.cos(angles[i])), mul(normal, Math.sin(angles[i])));
      chain.push(shift(chain[i], ray, length));
    }
    chains[index] = chain;
    const i = arm.s > 0 ? index : 3 - index;
    arm.fingerJoints[i] = chain;
    arm.fingers[i] = [knuckle, chain[3]];
    return chain;
  }
  function thumbTo(desired) {
    const root = local(...digits[4].root);
    const [l1, l2, l3] = digits[4].lengths;
    const ray = sub(desired, root);
    const distance = Math.min(l1 + l2 + l3 - .0002, Math.max(.012, norm(ray)));
    const tip = shift(root, unit(ray), distance);
    // Place the metacarpal radially and the flexed IP out toward the palm surface.
    const remainder = Math.max(Math.abs(distance - l1) + .00005, Math.abs(l2 - l3) + .00005,
      Math.min(l2 + l3 - .00005, distance + l1 - .00005, (l2 + l3) * .84));
    const mcp = middleJoint(root, tip, l1, remainder, add(mul(across, -arm.s), mul(normal, .32)));
    const ip = middleJoint(mcp, tip, l2, l3, add(normal, mul(across, -.25 * arm.s)));
    arm.thumbJoints = [root, mcp, ip, tip];
    arm.thumb = tip;
  }
  for (let i = 0; i < 4; i++) finger(i, [.03, .09, .15], arm.s * (i - 1.5) * .022);
  const open = local(-arm.s * .073, .100, .018);
  thumbTo(open);
  return {finger, thumbTo, local, chains, open, axis, normal};
}

function segment(phase, count) {
  const at = Math.min(count - .000001, Math.max(0, phase) * count);
  return {index: Math.floor(at), amount: hold(at % 1, .49)};
}

function digitExercises(p, motion, phase) {
  const rep = cycles[motion];
  const pauseAtEnds = motion === 'thumb-touch' || motion === 'finger-lift';
  const travel = pauseAtEnds ? Math.max(0, Math.min(1, (phase * rep - 1) / (rep - 2))) : phase;
  const cycle = segment(travel, motion === 'finger-lift' ? 5 : motion === 'tendon-glide' ? 3 :
    motion === 'thumb-touch' ? 8 : 4);
  for (const arm of p.arms) {
    const s = arm.s;
    if (motion === 'finger-lift') {
      const hand = poseHand(arm, arm.wrist, [s * .008, -.13, .99], [0, -1, 0]);
      for (let i = 0; i < 4; i++) hand.finger(i, [0, .02, .035], s * (i - 1.5) * .022);
      if (s !== p.side) continue;
      if (cycle.index < 4) {
        const lift = -.40 * cycle.amount;
        hand.finger(cycle.index, [lift, lift + .02, lift + .035], s * (cycle.index - 1.5) * .022);
      } else hand.thumbTo(shift(hand.open, Y, .031 * cycle.amount));
      continue;
    }
    // Keep both hands up for the dexterity sequences. At each side change both
    // are open, so the reference hand can remain in view without teleporting.
    const wrist = add(p.neck, [s * .143, -.105, .252]);
    const palmNormal = [s * .12, -.06, 1];
    const hand = poseHand(arm, wrist, [s * .05, 1, .06], palmNormal);
    if (motion === 'thumb-touch') {
      // Keep the thumb slightly opposed between taps, ready for the next finger.
      hand.open = hand.local(-s * .059, .105, .030);
      hand.thumbTo(hand.open);
    }
    if (motion === 'finger-spread') {
      for (let i = 0; i < 4; i++) hand.finger(i, [.02, .035, .05], s * (i - 1.5) * (.012 + .21 * p.a));
      hand.thumbTo(hand.local(-s * (.050 + .033 * p.a), .109 - .022 * p.a, .01));
      continue;
    }
    if (s !== p.side) continue;
    if (motion === 'tendon-glide') {
      // Angles are cumulative from the palm axis (MCP, PIP, DIP phalanges).
      const angles = [[.025, 1.55, 2.86], [1.30, 2.85, 3.76], [1.48, 2.73, 2.78]][cycle.index];
      for (let i = 0; i < 4; i++) hand.finger(i, angles.map(v => v * cycle.amount));
    } else if (motion === 'thumb-sweep') {
      const path = mixPoint(hand.open, hand.local(s * .018, .079, .014), p.a);
      hand.thumbTo(shift(path, hand.normal, .021 * Math.sin(Math.PI * p.a)));
    } else if (motion === 'thumb-touch') {
      const index = cycle.index < 4 ? cycle.index : 7 - cycle.index;
      const angles = [1.18, 2.16, 2.75];
      const closed = hand.finger(index, angles, -.15 * s);
      const contact = shift(closed[3], hand.normal, .006);
      hand.finger(index, angles.map(v => v * cycle.amount), -.15 * s * cycle.amount);
      hand.thumbTo(mixPoint(hand.open, contact, cycle.amount));
    }
  }
}

function wristExercises(p, motion, phase, setup) {
  const s = p.side;
  const arm = p.arms[s < 0 ? 0 : 1], other = p.arms[s < 0 ? 1 : 0];
  const atChest = (x, y, z) => add(p.neck, [x, y, z]);
  if (motion === 'wrist-wave') {
    // Both forearms stay horizontal; thumb-side deviation is up, the little-finger side down.
    for (const a of p.arms) {
      const elbow = shift(a.shoulder, unit([a.s * .019, -.252, .048]), .26);
      const wrist = shift(elbow, Z, .245);
      const angle = .33 * Math.sin(phase * Math.PI * 2);
      poseHand(a, wrist, [0, Math.sin(angle), Math.cos(angle)], [-a.s, 0, 0]);
      a.elbow = elbow;
    }
  } else if (motion === 'prayer-stretch') {
    for (const a of p.arms) {
      const wrist = atChest(a.s * .018, -.086 - .105 * p.a, .255);
      poseHand(a, wrist, [0, 1, .02], [-a.s, 0, 0], 1, [a.s, -.16 + .85 * p.a, -.30]);
    }
  } else if (motion === 'wrist-extensor-stretch') {
    const direction = unit([0, -.95, .32]);
    const hand = poseHand(arm, atChest(s * .052, -.072, .470), direction, [0, -.28, -.95], setup, [s, -.76, 0]);
    const contact = hand.local(0, .095, -.024);
    const assist = unit([s * .78, -.60, -.15]);
    poseHand(other, shift(contact, assist, -.094), assist, [0, 0, -1], setup, [-s, -.6, -.24]);
  } else if (motion === 'finger-block') {
    const work = Math.max(0, Math.min(4, (phase * cycles['finger-block'] - 2) / 4));
    const index = Math.min(3, Math.floor(work));
    const localPhase = Math.min(1, work - index);
    const supported = poseHand(arm, atChest(s * .065, -.110, .239), [s * .15, .98, .09], [0, 0, 1], setup);
    const chain = supported.finger(index, [.03, 1.14 * pulse(localPhase), 1.86 * pulse(localPhase)]);
    const next = supported.chains[Math.min(3, index + 1)];
    const root = mixPoint(chain[0], next[0], eased((localPhase - .83) / .17));
    const forward = unit([s * .89, .42, .14]);
    const target = shift(root, supported.axis, .017);
    // The opposing index pad braces the back of the straight proximal segment.
    const helperDirection = [0, -.15, -.98];
    const trial = {...other, fingerJoints: other.fingerJoints.slice(), fingers: other.fingers.slice()};
    const aim = poseHand(trial, shift(target, forward, -.141), forward, helperDirection);
    const knuckleBrace = [.50, 1.30, 2.10];
    const indexTip = aim.finger(0, knuckleBrace)[3];
    const wrist = add(trial.wrist, sub(add(target, [0, 0, -.008]), indexTip));
    const helper = poseHand(other, wrist, forward, helperDirection, setup);
    helper.finger(0, knuckleBrace.map(v => v * setup));
    for (let i=1; i<4; i++) helper.finger(i, [.76, 1.76, 2.36].map(v => v * setup));
    helper.thumbTo(mixPoint(helper.open, add(target, [0, .004, .011]), setup));
  } else if (motion === 'wrist-press') {
    const hand = poseHand(arm, arm.wrist, [s * .025, -.1, 1], [0, -1, 0], setup);
    const target = hand.local(0, .103, -.024);
    const aim = unit([s * .86, -.12, .48]);
    poseHand(other, shift(target, aim, -.096), aim, [0, -1, 0], setup, [-s * .6, -.2, 1]);
    p.activation = hold(Math.max(0, Math.min(1, (phase - .20) /.60)), .083);
    p.effort = {label: 'Wrist press', points: [target]};
  }
}

const ballRadius = .030;
function ballHands(p, motion, phase, setup) {
  const s = p.side;
  const gripping = motion === 'ball-grip';
  // Both hands meet at midline to pass the ball before they change sides.
  // For the thigh roll, ball travel is half the palm travel (rolling contact).
  const travel = pulse(Math.max(0, Math.min(1, (phase - .16) / .68)));
  const ball = gripping ? add(p.neck, [s * .122 * setup, -.163, .248]) :
    [s * .120 * setup, .680 - .034 * setup - .014 * travel, .178 + .064 * travel];
  p.handBall = {center: ball, radius: ballRadius};
  for (const a of p.arms) {
    if (gripping) {
      const axis = unit([-a.s * .15, .24, .96]), normal = unit([a.s * .10, .96, -.22]);
      const anchor = a.s === s ? ball : add(p.neck, [a.s * .132 * setup, -.163 - .12 * setup, .248 - .07 * setup]);
      const wrist = shift(shift(anchor, normal, -.040), axis, -.112);
      wrist[0] += a.s * .035 * (1 - setup);
      const open = poseHand(a, wrist, axis, normal);
      const squeeze = a.s === s ? p.a : 0;
      for (let i = 0; i < 4; i++) open.finger(i, [.12 + .15*squeeze, .63 + .75*squeeze, 1.25 + 1.24*squeeze]);
      open.thumbTo(open.local(-a.s * (.046 - .012*squeeze), .115, .030 + .008*squeeze));
    } else {
      if (a.s !== s && setup > .99999) continue;
      const near = a.s === s;
      const axis = unit([-.08 * a.s, -.14, 1]);
      const offset = .100 + setup * (near ? .048 - .117 * travel : 0);
      const wrist = shift(shift(ball, Y, .044 + .014 * (travel + 1 - setup)), axis, -offset);
      wrist[0] += a.s * .071 * (1 - setup);
      poseHand(a, wrist, axis, [0, -1, 0], near ? 1 : 1 - setup);
    }
  }
}

function rotateHead(pose, origin, rotation) {
  const move = point => add(origin, rotation(sub(point, origin)));
  pose.skull = move(pose.skull);
  pose.crown = move(pose.crown);
  pose.face = move(pose.face);
  pose.eyes = pose.eyes.map(move);
}

function neckExercises(p, motion, phase, setup) {
  const s = p.side, pivot = mixPoint(p.neck, p.skull, .31);
  if (motion === 'head-nod' || motion === 'head-press') {
    const towel = [p.skull[0], .025, p.skull[2] + .004];
    p.headTowel = towel;
    if (motion === 'head-nod') rotateHead(p, add(p.skull, [0, -.072, -.056]), v => pitchPoint(v, .13 * p.a));
    else {
      p.activation = hold(phase, .24);
      p.effort = {label: 'Head press', points:[shift(towel, Y, .024)]};
    }
    return;
  }
  if (motion === 'neck-nod' || motion === 'neck-diagonal' || motion === 'anchored-neck-stretch') {
    const pitch = motion === 'neck-nod' ? .48 * p.a : motion === 'neck-diagonal' ? .24 * eased((p.a - .27) / .73) : 0;
    const tilt = motion === 'neck-diagonal' ? s * .28 * eased(p.a / .63) : motion === 'anchored-neck-stretch' ? -s * .31 * p.a : 0;
    rotateHead(p, pivot, v => turn(lean(pitchPoint(v, pitch), tilt), motion === 'neck-diagonal' ? s * .12 * p.a : 0));
    if (motion === 'anchored-neck-stretch') {
      const arm = p.arms[s === 1 ? 1 : 0], leg = p.legs[s === 1 ? 1 : 0];
      poseHand(arm, add(leg.hip, [s * .09, -.042, .080]), [-s * .15, -.03, .99], [0, -1, 0], setup, [s, -.3, -.7]);
    }
    return;
  }
  const cradled = motion === 'neck-press-back';
  for (const a of p.arms) {
    const forehead = motion === 'neck-press-front';
    const working = forehead ? a.s === -1 : a.s === s;
    if (forehead && !working) continue;
    const side = a.s;
    let contact, axis, normal;
    if (cradled) {
      contact = add(p.skull, [a.s * .048, .006 + a.s * .006, -.092]);
      axis = unit([-a.s * .94, .29, -.04]);
      normal = [0, 0, 1];
    } else if (motion === 'neck-press-front') {
      contact = add(p.skull, [side * .021, .057, .145]);
      axis = unit([-side * .65, .76, -.04]);
      normal = [0, 0, -1];
    } else {
      const turning = motion === 'neck-press-turn';
      contact = add(p.skull, [side * (turning ? .075 : .099), .044, turning ? .110 : .020]);
      axis = unit([-side * .09, .99, -.10]);
      normal = [-side, 0, turning ? -.60 : 0];
    }
    const ready = add(p.neck, [side * .159, -.113, .178]);
    const reach = cradled || forehead ? 1 : working ? setup : 0;
    const hand = poseHand(a, mixPoint(ready, shift(contact, axis, -.084), reach), axis, normal, 1, [a.s, -.52, .18]);
    const flex = cradled ? [.10, .22, .34] : [.075, .22, .44];
    for (let i=0; i<4; i++) hand.finger(i, flex.map(v => v * reach), a.s*(i-1.5)*.027);
    if (working) p.effort = {label: motion === 'neck-press-turn' ? 'Resist turning' : cradled ? 'Press back' :
      motion === 'neck-press-front' ? 'Press forward' : 'Press sideways', points:[contact]};
  }
  p.activation = hold(Math.max(0, Math.min(1, (phase - .20) /.60)), .083);
}

/** Duration for one side, including the full sequence of digits when needed. */
export function handNeckCycleSeconds(move) {
  return cycles[move.animation] || 8;
}

/** Expanded movement variants return undefined here when their anatomy belongs to another group. */
export function handNeckPose(move, seconds, basePose) {
  const motion = move.animation;
  if (!hands.includes(motion) && !head.includes(motion)) return;
  const rep = handNeckCycleSeconds(move);
  const t = seconds / rep;
  const phase = t - Math.floor(t);
  const setup = hold(phase, motion === 'finger-block' ? .10 : .20);
  const p = basePose({pose:move.pose, motion:''}, 0);
  // Alternating actions start and finish with the same fitted hands on each side.
  if (move.pose !== 'supine') {
    for (const arm of p.arms) {
      const axis = unit(sub(arm.palm, arm.wrist));
      const normal = unit(cross(sub(arm.fingerJoints[3][0], arm.fingerJoints[0][0]), axis));
      poseHand(arm, arm.wrist, axis, normal, 0);
    }
  }
  p.side = motion === 'neck-press-front' || Math.floor(t) % 2 === 0 ? -1 : 1;
  p.a = hold(phase, .32);
  if (head.includes(motion)) neckExercises(p, motion, phase, setup);
  else if (motion === 'ball-grip' || motion === 'hand-ball-roll') ballHands(p, motion, phase, setup);
  else if (['wrist-wave','prayer-stretch','wrist-extensor-stretch','finger-block','wrist-press'].includes(motion)) wristExercises(p, motion, phase, setup);
  else digitExercises(p, motion, phase);
  return p;
}

export function handNeckActivation(pose, move) {
  return pose.effort;
}
