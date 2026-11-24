// The same skinned Form / Motion figure supplies the full view and hand inset.
import { meshes, rig, maleBind } from './form-motion/model.js';
import { createRetarget } from './form-motion/retarget.js';
import {readLocal} from './dom.js';

const bytes = (base64) => Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
function unpack(data, color) {
  const base = new Int16Array(bytes(data.positions).buffer);
  const delta = new Int16Array(bytes(data.shapeDelta).buffer);
  const rest = Float32Array.from(base, n => n / 10000);
  return {
    rest, base, delta, color, faces: new Uint16Array(bytes(data.faces).buffer),
    joints:bytes(data.joints), weights:bytes(data.weights),
    points: Array.from({ length: rest.length / 3 }, () => [0, 0, 0]),
  };
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
  retarget = createRetarget({boneNames:rig.boneNames, restHeads:bindPoints('restHeads'), restTails:bindPoints('restTails')}, body, rig.restHeads);
  selectedBody = name;
}

// Collect local hand geometry once. Point references stay live as the skin moves.
function handSurface(side) {
  const forearm = rig.boneNames.indexOf('mixamorig:' + side + 'ForeArm');
  const hand = rig.boneNames.indexOf('mixamorig:' + side + 'Hand');
  const finger = new Set(rig.boneNames.map((name, i) => name.startsWith('mixamorig:' + side + 'Hand') ? i : -1));
  const remap = new Int32Array(body.points.length).fill(-1);
  const points = [], faces = [];
  const elbow = rig.restHeads[forearm], wrist = rig.restHeads[hand];
  const axis = wrist.map((v, j) => v - elbow[j]);
  const length2 = axis.reduce((sum, v) => sum + v * v, 0);
  for (let i = 0; i < remap.length; i++) {
    const bone = body.joints[i * 4];
    const t = axis.reduce((sum, v, j) => sum + v * (body.rest[i * 3 + j] - elbow[j]), 0) / length2;
    if (!finger.has(bone) && !(bone === forearm && t > 0.5)) continue;
    remap[i] = points.length;
    points.push(body.points[i]);
  }
  for (let f = 0; f < body.faces.length; f += 3) {
    const a = remap[body.faces[f]], b = remap[body.faces[f + 1]], c = remap[body.faces[f + 2]];
    if (a >= 0 && b >= 0 && c >= 0) faces.push(a, b, c);
  }
  return {points, faces: Uint16Array.from(faces)};
}
const hands = [handSurface('Right'), handSurface('Left')];

function skin(part, matrices) {
  const {rest, weights, joints, points} = part;
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
    const point = points[i];
    point[0] = px; point[1] = py; point[2] = pz;
  }
}

export function drawTrainer(mesh, pose, move) {
  const transforms = retarget(pose, move);
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
