import assert from 'node:assert/strict';
import test from 'node:test';
import {drawEquipment} from '../equipment.js';
import {meshes, rig} from '../form-motion/model.js';
import {createRetarget} from '../form-motion/retarget.js';
import {movementPose, repetitionSeconds} from '../pose.js';
import {drawTrainer} from '../trainer.js';

const move = motion => ({motion,pose:'seated'});
const joint = Uint8Array.from(atob(meshes.body.joints), c => c.charCodeAt(0));
const hands = Array.from({length:joint.length/4}, (_,i) => i)
  .filter(i => rig.boneNames[joint[4*i]].includes('Hand'));

test('seated reach, elbow curl and leg extension share the same skinned rest and retain distinct peaks', () => {
  const animate = createRetarget(rig);
  const restMove = move('knee-extend'), rest = movementPose(restMove,0);
  const restSkin = animate(rest,restMove).slice();
  for (const motion of ['overhead-reach','elbow-bend','knee-extend']) {
    const exercise = move(motion);
    for (const t of [0,repetitionSeconds,2*repetitionSeconds]) {
      const pose = movementPose(exercise,t);
      assert.deepEqual(pose.arms,rest.arms);
      assert.deepEqual(animate(pose,exercise),restSkin);
    }
  }
  const peak = motion => movementPose(move(motion),repetitionSeconds / 2);
  assert.ok(peak('elbow-bend').arms[0].wrist[1] > rest.arms[0].wrist[1]+0.24);
  assert.ok(peak('chest-open').arms[1].wrist[0] > rest.arms[1].wrist[0]+0.20);
  assert.ok(peak('overhead-reach').arms[0].wrist[1] > rest.crown[1]);
  assert.ok(peak('knee-extend').legs[0].toe[2] > rest.legs[0].toe[2]+0.25);
});

// Intersect a vertical line through the hand with the actual rendered triangles.
// This catches fingertip/garment collisions even when both wrist joints clear.
function heightsAt(x,z,points,faces) {
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < faces.length; i+=3) {
    const a = points[faces[i]], b = points[faces[i+1]], c = points[faces[i+2]];
    if (x < Math.min(a[0],b[0],c[0]) || x > Math.max(a[0],b[0],c[0])) continue;
    const bx = b[0]-a[0], bz = b[2]-a[2], cx = c[0]-a[0], cz = c[2]-a[2];
    const det = bx*cz-bz*cx;
    if (Math.abs(det) < 1e-10) continue;
    const u = ((x-a[0])*cz - (z-a[2])*cx)/det, v = ((z-a[2])*bx - (x-a[0])*bz)/det;
    if (u < 0 || v < 0 || u+v > 1) continue;
    const y = a[1] + u*(b[1]-a[1]) + v*(c[1]-a[1]);
    low = Math.min(low,y);
    high = Math.max(high,y);
  }
  return [low,high];
}

function chairSurfaces() {
  const parts = [];
  drawEquipment({surface(rings) {
    const cols = rings[0].length, faces = [];
    for (let r = 1; r < rings.length; r++) {
      for (let c = 0; c < cols; c++) {
        const next = (c+1)%cols, row = cols*r;
        faces.push(row-cols+c,row-cols+next,row+c, row-cols+next,row+next,row+c);
      }
    }
    parts.push({points:rings.flat(),faces});
  }},movementPose(move('knee-extend'),0),move('knee-extend'),'plane-seat',0);
  return parts;
}

test('fitted hands clear the transit chair and stay within touching distance of a resting thigh', () => {
  const chair = chairSurfaces();
  const samples = hands.filter((_,i) => i % 6 === 0);
  const leggingsFaceCount = atob(meshes.leggings.faces).length/2;
  for (const motion of ['elbow-bend','palm-forward','overhead-reach','seated-march','knee-extend','hamstring-lean']) {
    for (const t of [0,0.5,2,6]) {
      const exercise = move(motion), pose = movementPose(exercise,t), parts = [];
      drawTrainer({indexed(points,faces) { parts.push({points,faces}); }},pose,exercise);
      const body = parts[0], leggings = parts.find(p => p.faces.length === leggingsFaceCount);
      let nearestLap = Infinity;
      for (const i of samples) {
        const [x,y,z] = body.points[i];
        for (const {points,faces} of chair) {
          const [low,high] = heightsAt(x,z,points,faces);
          assert.ok(y >= high-0.001 || y <= low+0.001, motion+' hand inside chair at '+t);
        }
        const [,thigh] = heightsAt(x,z,leggings.points,leggings.faces);
        if (Number.isFinite(thigh)) nearestLap = Math.min(nearestLap,y-thigh);
      }
      assert.ok(nearestLap > -0.005, motion+' hand inside thigh at '+t);
      if (t === 0 && ['knee-extend','overhead-reach','elbow-bend'].includes(motion)) {
        assert.ok(nearestLap < 0.015, motion+' resting palm above the lap');
      }
    }
  }
});
