// The same skinned Form / Motion figure supplies the full view and hand inset.
import { meshes, rig, maleBind } from './form-motion/model.js';
import { createRetarget } from './form-motion/retarget.js';
import {readLocal} from './dom.js';

const bytes = (base64) => Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
function unpack(data, color) {
  const base = new Int16Array(bytes(data.positions).buffer);
  const delta = new Int16Array(bytes(data.shapeDelta).buffer);
  const rest = Float32Array.from(base, n => n / 10000);
  const joints = bytes(data.joints), weights = bytes(data.weights);
  return {
    rest, base, delta, color, faces: new Uint16Array(bytes(data.faces).buffer),
    joints, weights, shoulder: shoulderBlend(joints, weights),
    points: Array.from({ length: rest.length / 3 }, () => [0, 0, 0]),
  };
}
// Linear blend skinning pulls the shoulder cap toward the joint when the arm
// rises; overhead it lost about 30% of its girth. Fully dual-quaternion skin
// over-inflates the back of the shoulder and tears the tank. Vertices shared by
// an upper arm and the trunk or collarbones therefore take 60% of the
// dual-quaternion position. Everywhere else, including hands and hips, keeps
// linear skinning and its tested contacts.
const armBones = new Set(['LeftArm','RightArm'].map(n => rig.boneNames.indexOf('mixamorig:' + n)));
const trunkBones = new Set(['Spine','Spine1','Spine2','Neck','LeftShoulder','RightShoulder']
  .map(n => rig.boneNames.indexOf('mixamorig:' + n)));
const shoulderStrength = 0.6;
/** @param {Uint8Array} joints @param {Uint8Array} weights */
function shoulderBlend(joints, weights) {
  const blend = new Float32Array(joints.length / 4);
  for (let i = 0; i < blend.length; i++) {
    let arm = 0, trunk = 0;
    for (let k = 4 * i; k < 4 * i + 4; k++) {
      if (armBones.has(joints[k])) arm += weights[k] / 255;
      else if (trunkBones.has(joints[k])) trunk += weights[k] / 255;
    }
    blend[i] = shoulderStrength * Math.min(1, 4 * arm * trunk);
  }
  return blend;
}
const body = unpack(meshes.body, '#e3e0d9');
let retarget = createRetarget(rig, body);
const garments = [unpack(meshes.tank, '#64788a'), unpack(meshes.leggings, '#39424c')];
const parts = [body, ...garments];
const shapes = {female: 0, androgynous: 0.5, male: 1};
let selectedBody = 'female';

export function restoreTrainerBody() {
  const saved = readLocal('trainer-body', 'female');
  setTrainerBody(typeof saved === 'string' && Object.hasOwn(shapes,saved) ? saved : 'female');
  return selectedBody;
}

/** Change the fitted skin, clothing and rest skeleton together, once per selection.
 * @param {string} name */
export function setTrainerBody(name) {
  if (!Object.hasOwn(shapes, name)) throw new RangeError('Unknown trainer body: ' + name);
  if (name === selectedBody) return;
  const t = shapes[name];
  for (const part of parts) {
    const {rest, base, delta} = part;
    for (let i = 0; i < rest.length; i++) rest[i] = (base[i] + t * delta[i]) / 10000;
  }
  const bindPoints = key => rig[key].map((point, i) =>
    point.map((v, axis) => v + t * (maleBind[key][i][axis] - v)));
  heads = bindPoints('restHeads');
  retarget = createRetarget({boneNames:rig.boneNames, restHeads:heads, restTails:bindPoints('restTails')}, body, rig.restHeads);
  selectedBody = name;
}

// Collect local hand geometry once. Point references stay live as the skin moves.
function handSurface(side) {
  const forearm = rig.boneNames.indexOf('mixamorig:' + side + 'ForeArm');
  const hand = rig.boneNames.indexOf('mixamorig:' + side + 'Hand');
  const finger = new Set(rig.boneNames.map((name, i) => name.startsWith('mixamorig:' + side + 'Hand') ? i : -1));
  const remap = new Int32Array(body.points.length).fill(-1);
  const points = [], faces = [], detailPoints = [];
  const elbow = rig.restHeads[forearm], wrist = rig.restHeads[hand];
  const axis = wrist.map((v, j) => v - elbow[j]);
  const length2 = axis.reduce((sum, v) => sum + v * v, 0);
  for (let i = 0; i < remap.length; i++) {
    const bone = body.joints[i * 4];
    const t = axis.reduce((sum, v, j) => sum + v * (body.rest[i * 3 + j] - elbow[j]), 0) / length2;
    if (!finger.has(bone) && !(bone === forearm && t > 0.5)) continue;
    remap[i] = points.length;
    points.push(body.points[i]);
    // Fit the fingers, wrist and a short cuff. The rest of the forearm may
    // run naturally out of the close-up. References follow each body shape.
    if (finger.has(bone) || t > .90) detailPoints.push(body.points[i]);
  }
  for (let f = 0; f < body.faces.length; f += 3) {
    const a = remap[body.faces[f]], b = remap[body.faces[f + 1]], c = remap[body.faces[f + 2]];
    if (a >= 0 && b >= 0 && c >= 0) faces.push(a, b, c);
  }
  return {points, detailPoints, faces: Uint16Array.from(faces)};
}
const hands = [handSurface('Right'), handSurface('Left')];

// Dual-quaternion terms for each skin matrix M = R S, a rotation times a small
// stretch along its bone. A shoulder vertex blends each bone's stretch linearly
// about its head, then blends the rotations as dual quaternions. A vertex bound
// to one bone still receives exactly M.
const bones = rig.boneNames.length;
let heads = rig.restHeads;
// Per bone: stretch S (9, row-major), head (3), real and dual quaternions (4 + 4).
const rigid = new Float64Array(bones * 20);

/** Polar decomposition of a near-rotation by averaging with its inverse transpose.
 * @param {Float32Array} m @param {number} o @returns {number[]} rotation columns */
function polar(m, o) {
  let a = [m[o], m[o+1], m[o+2], m[o+4], m[o+5], m[o+6], m[o+8], m[o+9], m[o+10]];
  for (let n = 0; n < 6; n++) {
    const [a0,a1,a2,a3,a4,a5,a6,a7,a8] = a;
    // Inverse transpose columns: (c1 x c2, c2 x c0, c0 x c1) / det.
    const i0 = a4*a8-a5*a7, i1 = a5*a6-a3*a8, i2 = a3*a7-a4*a6;
    const det = a0*i0 + a1*i1 + a2*i2;
    const inv = [i0, i1, i2, a7*a2-a8*a1, a8*a0-a6*a2, a6*a1-a7*a0, a1*a5-a2*a4, a2*a3-a0*a5, a0*a4-a1*a3];
    a = a.map((v, k) => (v + inv[k] / det) / 2);
  }
  return a;
}

/** @param {Float32Array} m column-major skin palette */
function rigidPalette(m) {
  for (let b = 0; b < bones; b++) {
    const o = 16 * b, r = polar(m, o), out = 20 * b;
    // S = R^T M: row i is column i of R dotted with each column of M.
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      rigid[out + 3*i + j] = r[3*i]*m[o+4*j] + r[3*i+1]*m[o+4*j+1] + r[3*i+2]*m[o+4*j+2];
    const [hx, hy, hz] = heads[b];
    rigid[out+9] = hx; rigid[out+10] = hy; rigid[out+11] = hz;
    // R element (row k, column c) is r[3c + k].
    const m00 = r[0], m10 = r[1], m20 = r[2], m01 = r[3], m11 = r[4], m21 = r[5], m02 = r[6], m12 = r[7], m22 = r[8];
    let w, x, y, z;
    const trace = m00 + m11 + m22;
    if (trace > 0) {
      const s = 2 * Math.sqrt(trace + 1);
      w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4;
    }
    // Translation that keeps M exact for the bone's own vertices: t = shift + M h - R h.
    const tx = m[o+12] + (m[o]-m00)*hx + (m[o+4]-m01)*hy + (m[o+8]-m02)*hz;
    const ty = m[o+13] + (m[o+1]-m10)*hx + (m[o+5]-m11)*hy + (m[o+9]-m12)*hz;
    const tz = m[o+14] + (m[o+2]-m20)*hx + (m[o+6]-m21)*hy + (m[o+10]-m22)*hz;
    // Dual part: t R / 2, with t as a pure quaternion.
    rigid.set([w, x, y, z,
      -(tx*x + ty*y + tz*z) / 2, (w*tx + ty*z - tz*y) / 2, (w*ty + tz*x - tx*z) / 2, (w*tz + tx*y - ty*x) / 2], out + 12);
  }
}

/** @param {ReturnType<typeof unpack>} part @param {Float32Array} matrices */
function skin(part, matrices) {
  const {rest, weights, joints, points, shoulder} = part;
  for (let i = 0; i < points.length; i++) {
    const x = rest[3 * i], y = rest[3 * i + 1], z = rest[3 * i + 2];
    let px = 0, py = 0, pz = 0;
    for (let k = 4 * i; k < 4 * i + 4; k++) {
      const weight = weights[k] / 255;
      if (!weight) break;
      const j = 16 * joints[k];
      px += weight * (matrices[j] * x + matrices[j+4] * y + matrices[j+8] * z + matrices[j+12]);
      py += weight * (matrices[j+1] * x + matrices[j+5] * y + matrices[j+9] * z + matrices[j+13]);
      pz += weight * (matrices[j+2] * x + matrices[j+6] * y + matrices[j+10] * z + matrices[j+14]);
    }
    const point = points[i], mix = shoulder[i];
    point[0] = px; point[1] = py; point[2] = pz;
    if (!mix) continue;
    let qx = 0, qy = 0, qz = 0, rw = 0, rx = 0, ry = 0, rz = 0, dw = 0, dx = 0, dy = 0, dz = 0, first = -1;
    for (let k = 4 * i; k < 4 * i + 4; k++) {
      let weight = weights[k] / 255;
      if (!weight) break;
      const b = 20 * joints[k];
      const sx = x - rigid[b+9], sy = y - rigid[b+10], sz = z - rigid[b+11];
      qx += weight * (rigid[b]*sx + rigid[b+1]*sy + rigid[b+2]*sz + rigid[b+9]);
      qy += weight * (rigid[b+3]*sx + rigid[b+4]*sy + rigid[b+5]*sz + rigid[b+10]);
      qz += weight * (rigid[b+6]*sx + rigid[b+7]*sy + rigid[b+8]*sz + rigid[b+11]);
      // Keep each rotation in the hemisphere of the first influence.
      if (first < 0) first = b;
      else if (rigid[first+12]*rigid[b+12] + rigid[first+13]*rigid[b+13]
        + rigid[first+14]*rigid[b+14] + rigid[first+15]*rigid[b+15] < 0) weight = -weight;
      rw += weight * rigid[b+12]; rx += weight * rigid[b+13]; ry += weight * rigid[b+14]; rz += weight * rigid[b+15];
      dw += weight * rigid[b+16]; dx += weight * rigid[b+17]; dy += weight * rigid[b+18]; dz += weight * rigid[b+19];
    }
    const n = Math.hypot(rw, rx, ry, rz);
    rw /= n; rx /= n; ry /= n; rz /= n; dw /= n; dx /= n; dy /= n; dz /= n;
    // Rotate q by the real part, then translate by 2 (rw d - dw r + r x d).
    const cx = ry*qz - rz*qy + rw*qx, cy = rz*qx - rx*qz + rw*qy, cz = rx*qy - ry*qx + rw*qz;
    const ux = qx + 2 * (ry*cz - rz*cy) + 2 * (rw*dx - dw*rx + ry*dz - rz*dy);
    const uy = qy + 2 * (rz*cx - rx*cz) + 2 * (rw*dy - dw*ry + rz*dx - rx*dz);
    const uz = qz + 2 * (rx*cy - ry*cx) + 2 * (rw*dz - dw*rz + rx*dy - ry*dx);
    point[0] = px + mix * (ux - px); point[1] = py + mix * (uy - py); point[2] = pz + mix * (uz - pz);
  }
}

export function drawTrainer(mesh, pose, move) {
  const transforms = retarget(pose, move);
  rigidPalette(transforms);
  for (const part of parts) {
    skin(part, transforms);
    mesh.indexed(part.points, part.faces, part.color);
  }
}

// Called after the full figure has been posed for this frame.
export function drawHandDetail(mesh, side) {
  const hand = hands[side === 1 ? 1 : 0];
  mesh.indexed(hand.points, hand.faces, body.color);
}

export function handDetailPoints(side) {
  return hands[side === 1 ? 1 : 0].detailPoints;
}
