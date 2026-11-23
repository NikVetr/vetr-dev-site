// Skin matrices map native rest coordinates straight into the planner's metre-based
// world. Segment endpoints control the joints; the elbow/knee planes, knuckle rows,
// and face landmarks supply the axial rolls that a head-to-tail vector cannot encode.
/** @typedef {number[]} Vec */
/** @typedef {Vec[]} Basis */
/** @typedef {{rotation: Basis, shift: Vec}} Transform */
/** @typedef {{i:number, head:Vec, tail:Vec, direction:Vec}} Bone */
const X = [1, 0, 0];
const Y = [0, 1, 0];
const BACK = [0, 0, -1];
/** @param {Vec} a @param {Vec} b */
const add = (a, b) => a.map((v, i) => v + b[i]);
/** @param {Vec} a @param {Vec} b */
const sub = (a, b) => a.map((v, i) => v - b[i]);
/** @param {Vec} a @param {number} s */
const mul = (a, s) => a.map(v => v * s);
/** @param {Vec} a @param {Vec} b */
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
/** @param {Vec} a @param {Vec} b */
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
/** @param {Vec} a */
const norm = a => Math.hypot(...a);
/** @param {Vec} a */
const unit = a => mul(a, 1/norm(a));
/** @param {Vec} a @param {Vec} b @param {number} t */
const mix = (a, b, t) => a.map((v, i) => v + (b[i]-v)*t);
/** @param {Vec} a @param {Vec} b */
const mid = (a, b) => mix(a, b, 0.5);

/** @param {Vec} direction @param {Vec} rollReference */
function axes(direction, rollReference) {
  const y = unit(direction);
  let lateral = sub(rollReference, mul(y, dot(y, rollReference)));
  if (norm(lateral) < 1e-6) {
    const reference = Math.abs(y[0]) < 0.8 ? X : Y;
    lateral = sub(reference, mul(y, dot(reference, y)));
  }
  const x = unit(lateral);
  return [x, y, cross(x, y)];
}

// A linear map between anatomical frames. A small axial scale accommodates
// differences in limb proportions while fixing both endpoints to the movement.
/** @param {Basis} rest @param {Basis} target */
function orient(rest, target, axialScale = 1) {
  const columns = [];
  for (let i = 0; i < 3; i++) {
    columns.push(target[0].map((v, k) =>
      v*rest[0][i] + target[1][k]*rest[1][i]*axialScale + target[2][k]*rest[2][i]));
  }
  return columns;
}
/** @param {Basis} r @param {Vec} p */
const rotate = (r, p) => [0,1,2].map(k => r[0][k]*p[0] + r[1][k]*p[1] + r[2][k]*p[2]);

/** @param {Basis} restAxes @param {Basis} targetAxes @param {Vec} pivot @param {Vec} origin */
function betweenFrames(restAxes, targetAxes, pivot, origin, axialScale = 1) {
  const rotation = orient(restAxes, targetAxes, axialScale);
  return {rotation, shift: sub(origin, rotate(rotation, pivot))};
}
/** @param {Transform} mat @param {Vec} p */
const transform = (mat, p) => add(mat.shift, rotate(mat.rotation, p));

const digits = ['Index', 'Middle', 'Ring', 'Pinky'];
const spine = ['Hips', 'Spine', 'Spine1', 'Spine2'];

/** Create a retargeter for the fitted MakeHuman/Mixamo rig. The returned
 * column-major 4x4 palette is reused on each call. See movementPose in ../pose.js.
 * @param {{boneNames:string[], restHeads:number[][], restTails:number[][]}} rig */
export function createRetarget(rig) {
  const bones = new Map(rig.boneNames.map((name, i) => [name.split(':').pop(), {
    i, head: rig.restHeads[i], tail: rig.restTails[i],
    direction: sub(rig.restTails[i], rig.restHeads[i]),
  }]));
  /** @param {string} name */
  function bone(name) {
    const b = bones.get(name);
    if (!b) throw new Error('Form Motion rig is missing ' + name);
    return b;
  }
  const palette = new Float32Array(bones.size * 16);
  for (let i = 15; i < palette.length; i += 16) palette[i] = 1;
  /** @param {Bone} b @param {Transform} mat */
  function write(b, mat) {
    const offset = b.i*16;
    for (let i = 0; i < 3; i++) palette.set(mat.rotation[i], offset + i*4);
    palette.set(mat.shift, offset + 12);
  }
  // Cache the native frame for each segment at load time.
  /** @param {Bone} b @param {Vec} reference */
  function segment(b, reference) {
    const rest = axes(b.direction, reference);
    const length = norm(b.direction);
    /** @param {Vec} head @param {Vec} tail @param {Vec} roll */
    return (head, tail, roll) => {
      const direction = sub(tail, head);
      const mat = betweenFrames(rest, axes(direction, roll), b.head, head, norm(direction)/length);
      write(b, mat);
      return mat;
    };
  }

  const sides = ['Right','Left'].map((prefix, i) => {
    const arm = bone(prefix+'Arm'), fore = bone(prefix+'ForeArm'), hand = bone(prefix+'Hand');
    const thigh = bone(prefix+'UpLeg'), shin = bone(prefix+'Leg');
    const fingers = digits.map(name => [1,2,3].map(j => bone(prefix+'Hand'+name+j)));
    const thumb = [1,2,3].map(j => bone(prefix+'HandThumb'+j));
    const fingerBase = fingers.map(chain => chain[0].head);
    const sign = i === 0 ? -1 : 1;
    const across = mul(sub(fingerBase[3], fingerBase[0]), sign);
    const sourcePalm = axes(sub(mid(fingerBase[1],fingerBase[2]), hand.head), across);
    const elbowHinge = unit(cross(arm.direction,fore.direction));
    const kneeHinge = unit(cross(thigh.direction,shin.direction));
    const collar = bone(prefix+'Shoulder'), foot = bone(prefix+'Foot'), toe = bone(prefix+'ToeBase');
    const thumbAxes = axes(sub(thumb[2].tail, thumb[0].head), sourcePalm[2]);
    return {
      i, sign, arm, hand, thigh, collar, toe, sourcePalm, elbowHinge,
      forearmBendFrame: axes(fore.direction, elbowHinge),
      forearmAcross: axes(fore.direction, across)[0],
      clavicle: segment(collar, [0,0,1]), upperArm: segment(arm, elbowHinge), forearm: segment(fore, across),
      upperLeg: segment(thigh, kneeHinge), lowerLeg: segment(shin, kneeHinge), shoe: segment(foot, X),
      thumbAxes, thumbBase: thumb[0].head,
      thumb: thumb.map(b => ({direction: b.direction, aim: segment(b, thumbAxes[0])})),
      fingers: fingers.map(chain => chain.map(b => ({
        base: b.head, length: norm(b.direction), aim: segment(b, across),
      }))),
    };
  });

  const restHips = mid(sides[0].thigh.head,sides[1].thigh.head);
  const restChest = mid(sides[0].arm.head,sides[1].arm.head);
  const restBody = axes(sub(restChest,restHips),sub(sides[1].arm.head,sides[0].arm.head));
  const nativeAxes = axes(Y,X);
  const spineLinks = spine.map(name => ({b: bone(name), aim: segment(bone(name),X)}));
  const neck = bone('Neck'), head = bone('Head'), aimNeck = segment(neck,X);
  const restSkull = mix(head.head, head.tail, 0.28);

  /** @param {ReturnType<typeof import('../pose.js').movementPose>} pose @param {{pose:string,motion:string}} move */
  return (pose, move) => {
    const hip = mid(pose.legs[0].hip, pose.legs[1].hip);
    // Shoulder rolls move the clavicles independently of the sternum and neck.
    const chest = add(hip, mul(unit(sub(pose.centre, hip)), 0.47));
    const hipAxes = axes(move.pose === 'supine' ? BACK : Y, sub(pose.legs[1].hip,pose.legs[0].hip));
    const chestAxes = axes(sub(chest,hip),sub(pose.arms[1].shoulder,pose.arms[0].shoulder));
    const hipMat = betweenFrames(nativeAxes, hipAxes, restHips, hip);
    const chestMat = betweenFrames(restBody, chestAxes, restChest, chest);
    /** @param {Vec} p */
    const blendAt = p => Math.max(0,Math.min(1,(p[1]-restHips[1])/(restChest[1]-restHips[1])));
    /** @param {Vec} p */
    const torso = p => mix(transform(hipMat,p),transform(chestMat,p),blendAt(p));
    for (const {b, aim} of spineLinks) {
      aim(torso(b.head), torso(b.tail), mix(hipAxes[0],chestAxes[0],blendAt(b.head)));
    }

    const faceAxes = axes(sub(pose.crown,pose.skull), sub(pose.eyes[1],pose.eyes[0]));
    const headMat = betweenFrames(nativeAxes,faceAxes,restSkull,pose.skull);
    aimNeck(transform(chestMat,neck.head), transform(headMat,neck.tail), mix(chestAxes[0],faceAxes[0],0.45));
    write(head,headMat);

    for (const side of sides) {
      const arm = pose.arms[side.i], leg = pose.legs[side.i];
      side.clavicle(transform(chestMat,side.collar.head),arm.shoulder,chestAxes[2]);
      const upper = sub(arm.elbow,arm.shoulder), fore = sub(arm.wrist,arm.elbow);
      const bendNormal = cross(upper,fore);
      const hinge = norm(bendNormal) > 1e-5 ? bendNormal : rotate(chestMat.rotation,side.elbowHinge);
      side.upperArm(arm.shoulder,arm.elbow,hinge);
      const chains = side.i === 1 ? arm.fingerJoints : [...arm.fingerJoints].reverse();
      const palmAcross = mul(sub(chains[3][0],chains[0][0]),side.sign);
      const guidePalm = axes(sub(arm.palm, arm.wrist), palmAcross);
      let palmAxes = guidePalm;
      /** @type {Basis | undefined} */
      let knuckleRotation;
      if (move.motion === 'overhead-reach') {
        // The source's wrist-to-knuckle distance is about twice the guide's.
        // Rest the long hand across the lap until it clears the thigh on ascent.
        const height = arm.wrist[1] - leg.hip[1];
        const t = Math.min(1, Math.max(0, (0.20 - height) / 0.13));
        const weight = t * t * (3 - 2 * t);
        if (weight > 0) {
          palmAxes = axes(mix(guidePalm[1], unit([0, 0.13, 1]), weight), palmAcross);
          knuckleRotation = orient(guidePalm, palmAxes);
        }
      }
      // The rig has just one forearm bone. Share pronation between its two
      // ends; assigning the entire wrist roll to the elbow pinches the sleeve.
      const bendFrame = axes(fore,hinge);
      const naturalAcross = rotate(orient(side.forearmBendFrame,bendFrame),side.forearmAcross);
      const handAcross = axes(fore,palmAcross)[0];
      const axis = bendFrame[1];
      const principal = Math.atan2(dot(axis,cross(naturalAcross,handAcross)), dot(naturalAcross,handAcross));
      // Crossed arms can pass through the atan2 seam. Pick a winding close
      // to the neutral forearm, so seeking to a frame works without history.
      const guide = side.sign * Math.PI / 2;
      const twist = principal + 2 * Math.PI * Math.round((guide - principal) / (2 * Math.PI));
      const halfAcross = add(mul(naturalAcross,Math.cos(twist/2)),mul(cross(axis,naturalAcross),Math.sin(twist/2)));
      side.forearm(arm.elbow,arm.wrist,halfAcross);
      const handMat = betweenFrames(side.sourcePalm,palmAxes,side.hand.head,arm.wrist);
      write(side.hand,handMat);

      side.fingers.forEach((finger, i) => {
        const joints = chains[i];
        // Carry the native knuckle positions and phalanx lengths with the hand.
        // The exercise supplies their relative flexion and splay.
        let base = transform(handMat,finger[0].base);
        finger.forEach((joint, j) => {
          const direction = unit(sub(joints[j+1], joints[j]));
          const tip = add(base, mul(knuckleRotation ? rotate(knuckleRotation, direction) : direction, joint.length));
          joint.aim(base,tip,palmAcross);
          base = tip;
        });
      });
      let thumbBase = transform(handMat, side.thumbBase);
      const targetThumb = sub(arm.thumb, mix(arm.wrist, arm.palm, 0.55));
      const thumbAxes = axes(knuckleRotation ? rotate(knuckleRotation,targetThumb) : targetThumb, palmAxes[2]);
      const thumbRotation = orient(side.thumbAxes, thumbAxes);
      const flex = move.motion === 'hand-open' ? 1 - pose.a
        : move.motion === 'towel-grip' && pose.side === side.sign ? pose.a : 0;
      side.thumb.forEach((joint, j) => {
        const native = rotate(thumbRotation, joint.direction);
        const along = unit(native);
        const towardPalm = axes(along, palmAxes[2])[0];
        const angle = j * 0.24 * flex;
        const direction = add(mul(along, Math.cos(angle)), mul(towardPalm, Math.sin(angle)));
        const tip = add(thumbBase, mul(direction, norm(native)));
        joint.aim(thumbBase, tip, thumbAxes[0]);
        thumbBase = tip;
      });

      const kneeHinge = cross(sub(leg.knee,leg.hip),sub(leg.ankle,leg.knee));
      side.upperLeg(leg.hip,leg.knee,kneeHinge);
      side.lowerLeg(leg.knee,leg.ankle,kneeHinge);
      const shoeMat = side.shoe(leg.ankle,leg.toe,X);
      if (move.motion === 'heel-lift') {
        // The ball is the pivot; keep the front sole planted as the heel rises.
        write(side.toe,betweenFrames(nativeAxes,nativeAxes,side.toe.head,leg.toe));
      } else {
        write(side.toe,shoeMat);
      }
    }
    return palette;
  };
}
