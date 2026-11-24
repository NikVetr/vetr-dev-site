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

/** Lowest surface height after posing the shoe. @param {Transform} matrix @param {Vec[]} points */
function lowestY(matrix, points) {
  const [x, y, z] = matrix.rotation;
  let low = Infinity;
  for (const point of points) low = Math.min(low, x[1]*point[0] + y[1]*point[1] + z[1]*point[2]);
  return low + matrix.shift[1];
}

/** Measure the heel pad and the angle at which the forefoot meets the same floor,
 * using this body's actual fitted skin. Only recalculated when the body changes.
 * @param {Bone} foot @param {Bone} toe @param {{rest:Float32Array,joints:Uint8Array}} skin */
function groundContact(foot, toe, skin) {
  const heel = [], front = [];
  for (let i = 0; i < skin.rest.length; i += 3) {
    const bone = skin.joints[4*i/3];
    if (bone !== foot.i && bone !== toe.i || skin.rest[i+1] > foot.head[1]) continue;
    const region = skin.rest[i+2] < foot.head[2] + 0.012 ? heel : front;
    region.push([skin.rest[i],skin.rest[i+1],skin.rest[i+2]]);
  }
  if (!heel.length || !front.length) throw new Error('Trainer foot is missing its sole surface.');
  const rest = axes(foot.direction, X);
  let low = -0.7, high = 0.1;
  const axialScale = Math.hypot(0.054,0.136) / norm(foot.direction);
  for (let i = 0; i < 14; i++) {
    const pitch = (low + high) / 2;
    const mat = betweenFrames(rest, axes([0,Math.sin(pitch),Math.cos(pitch)],X),foot.head,[0,0,0],axialScale);
    if (lowestY(mat,front) < lowestY(mat,heel)) low = pitch;
    else high = pitch;
  }
  return {heel, flatPitch:high};
}

/** Create a retargeter for the fitted MakeHuman/Mixamo rig. The returned
 * column-major 4x4 palette is reused on each call. See movementPose in ../pose.js.
 * @param {{boneNames:string[], restHeads:number[][], restTails:number[][]}} rig
 * @param {{rest:Float32Array,joints:Uint8Array}} [skin]
 * @param {number[][]} [referenceHeads] Joint landmarks of the body used to author the movement. */
export function createRetarget(rig, skin, referenceHeads = rig.restHeads) {
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
      i, sign, arm, hand, thigh, collar, foot, toe, sourcePalm, elbowHinge,
      ground:skin ? groundContact(foot,toe,skin) : undefined,
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
  // Keep the fitted body's breadth as it turns. Elbows, hands, knees and feet
  // retain the exercise landmarks, including their contacts with the equipment.
  const halfBreadthChange = (right, left) =>
    ((left.head[0] - right.head[0]) - (referenceHeads[left.i][0] - referenceHeads[right.i][0])) / 2;
  const shoulderOffset = halfBreadthChange(sides[0].arm, sides[1].arm);
  const hipOffset = halfBreadthChange(sides[0].thigh, sides[1].thigh);
  const restBody = axes(sub(restChest,restHips),sub(sides[1].arm.head,sides[0].arm.head));
  const lumbarFraction = 0.24 / 0.47;
  const restLumbar = mix(restHips, restChest, lumbarFraction);
  const nativeAxes = axes(Y,X);
  const spineLinks = spine.map(name => ({b: bone(name), aim: segment(bone(name),X)}));
  const neck = bone('Neck'), head = bone('Head'), aimNeck = segment(neck,X);
  const restSkull = mix(head.head, head.tail, 0.28);

  /** @param {ReturnType<typeof import('../pose.js').movementPose>} pose @param {{pose:string,motion:string}} move */
  return (pose, move) => {
    const hip = mid(pose.legs[0].hip, pose.legs[1].hip);
    // Shoulder rolls move the clavicles independently of the sternum and neck.
    const chest = pose.spine?.chest ?? add(hip, mul(unit(sub(pose.centre, hip)), 0.47));
    const hipAxes = axes(pose.spine?.pelvicUp ?? (move.pose === 'supine' ? BACK : Y), sub(pose.legs[1].hip,pose.legs[0].hip));
    const chestAxes = axes(pose.spine?.chestUp ?? sub(chest,hip),sub(pose.arms[1].shoulder,pose.arms[0].shoulder));
    const hipMat = betweenFrames(nativeAxes, hipAxes, restHips, hip);
    const chestMat = betweenFrames(restBody, chestAxes, restChest, chest);
    const lumbarMat = pose.spine && betweenFrames(restBody, axes(sub(chest,hip), chestAxes[0]), restLumbar, pose.centre);
    /** @param {Vec} p */
    const blendAt = p => Math.max(0,Math.min(1,(p[1]-restHips[1])/(restChest[1]-restHips[1])));
    /** @param {Vec} p */
    const torso = p => {
      const t = blendAt(p);
      if (!lumbarMat) return mix(transform(hipMat,p), transform(chestMat,p), t);
      if (t < lumbarFraction) return mix(transform(hipMat,p), transform(lumbarMat,p), t / lumbarFraction);
      return mix(transform(lumbarMat,p), transform(chestMat,p), (t - lumbarFraction) / (1 - lumbarFraction));
    };
    for (const {b, aim} of spineLinks) {
      aim(torso(b.head), torso(b.tail), mix(hipAxes[0],chestAxes[0],blendAt(b.head)));
    }

    const faceAxes = axes(sub(pose.crown,pose.skull), sub(pose.eyes[1],pose.eyes[0]));
    const headMat = betweenFrames(nativeAxes,faceAxes,restSkull,pose.skull);
    aimNeck(transform(chestMat,neck.head), transform(headMat,neck.tail), mix(chestAxes[0],faceAxes[0],0.45));
    write(head,headMat);

    for (const side of sides) {
      const arm = pose.arms[side.i], leg = pose.legs[side.i];
      const shoulder = shoulderOffset ? add(arm.shoulder, mul(chestAxes[0], side.sign*shoulderOffset)) : arm.shoulder;
      side.clavicle(transform(chestMat,side.collar.head),shoulder,chestAxes[2]);
      const upper = sub(arm.elbow,arm.shoulder), fore = sub(arm.wrist,arm.elbow);
      const bendNormal = cross(upper,fore);
      const hinge = norm(bendNormal) > 1e-5 ? bendNormal : rotate(chestMat.rotation,side.elbowHinge);
      side.upperArm(shoulder,arm.elbow,hinge);
      const chains = side.i === 1 ? arm.fingerJoints : [...arm.fingerJoints].reverse();
      const palmAcross = mul(sub(chains[3][0],chains[0][0]),side.sign);
      const palmAxes = axes(sub(arm.palm, arm.wrist), palmAcross);
      // The rig has just one forearm bone. Share pronation between its two
      // ends; assigning the entire wrist roll to the elbow pinches the sleeve.
      const bendFrame = axes(fore,hinge);
      const naturalAcross = rotate(orient(side.forearmBendFrame,bendFrame),side.forearmAcross);
      const handAcross = axes(fore,palmAcross)[0];
      const axis = bendFrame[1];
      const principal = Math.atan2(dot(axis,cross(naturalAcross,handAcross)), dot(naturalAcross,handAcross));
      // Pick the twist closest to the neutral forearm for this hold. A palm
      // across a rail needs a different reference as the elbow bends.
      const guide = arm.holdingRail ? 0 : side.sign * Math.PI / 2;
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
          const tip = add(base, mul(direction, joint.length));
          joint.aim(base,tip,palmAcross);
          base = tip;
        });
      });
      let thumbBase = transform(handMat, side.thumbBase);
      const targetThumb = sub(arm.thumb, mix(arm.wrist, arm.palm, 0.55));
      const thumbAxes = axes(targetThumb, palmAxes[2]);
      const thumbRotation = orient(side.thumbAxes, thumbAxes);
      const flex = move.motion === 'hand-open' ? 1 - pose.a
        : move.motion === 'towel-grip' && pose.side === side.sign ? pose.a : 0;
      side.thumb.forEach((joint, j) => {
        if ('thumbJoints' in arm && Array.isArray(arm.thumbJoints)) {
          const ray = sub(arm.thumbJoints[j+1], arm.thumbJoints[j]);
          const tip = add(thumbBase, mul(unit(ray), norm(joint.direction)));
          joint.aim(thumbBase, tip, thumbAxes[0]);
          thumbBase = tip;
          return;
        }
        const native = rotate(thumbRotation, joint.direction);
        const along = unit(native);
        const towardPalm = axes(along, palmAxes[2])[0];
        const angle = j * 0.24 * flex;
        const direction = add(mul(along, Math.cos(angle)), mul(towardPalm, Math.sin(angle)));
        const tip = add(thumbBase, mul(direction, norm(native)));
        joint.aim(thumbBase, tip, thumbAxes[0]);
        thumbBase = tip;
      });

      let ankle = leg.ankle, toe = leg.toe;
      const ground = leg.heelHeight !== undefined && side.ground;
      if (ground) {
        // A level sole uses a slightly different ankle angle on each fitted
        // body. Apply that limit only when the heel is carrying the movement.
        const axis = sub(toe,ankle), horizontal = Math.hypot(axis[0],axis[2]);
        if (Math.atan2(axis[1],horizontal) < ground.flatPitch) {
          const length = norm(axis), reach = length*Math.cos(ground.flatPitch);
          toe = add(ankle, [reach*axis[0]/horizontal,length*Math.sin(ground.flatPitch),reach*axis[2]/horizontal]);
        }
      }
      const shoeMat = side.shoe(ankle,toe,leg.across ?? X);
      if (ground) {
        const dy = leg.heelHeight - lowestY(shoeMat,ground.heel);
        ankle = add(ankle,[0,dy,0]);
        shoeMat.shift[1] += dy;
        write(side.foot,shoeMat);
      }
      const kneeHinge = cross(sub(leg.knee,leg.hip),sub(ankle,leg.knee));
      const hipJoint = hipOffset ? add(leg.hip, mul(hipAxes[0], side.sign*hipOffset)) : leg.hip;
      side.upperLeg(hipJoint,leg.knee,kneeHinge);
      side.lowerLeg(leg.knee,ankle,kneeHinge);
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
