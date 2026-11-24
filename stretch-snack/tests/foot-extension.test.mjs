import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {meshes, rig} from '../form-motion/model.js';
import {movementPose} from '../pose.js';
import {drawTrainer, setTrainerBody} from '../trainer.js';

// Follow anatomical vertices through the same weighted skinning used by the
// preview. These include the separate ankle and toe bones and their seam.
const bytes = data => Uint8Array.from(atob(data), ch => ch.charCodeAt(0));
const positions = new Int16Array(bytes(meshes.body.positions).buffer);
const joints = bytes(meshes.body.joints);
const landmarks = ['Right', 'Left'].map(side => {
  const ankle = rig.boneNames.indexOf('mixamorig:' + side + 'Foot');
  const toes = rig.boneNames.indexOf('mixamorig:' + side + 'ToeBase');
  const heel = [], tip = [];
  for (let i = 0; i < joints.length / 4; i++) {
    const z = positions[i * 3 + 2] / 10000;
    if (joints[i * 4] === ankle && z < rig.restHeads[ankle][2] - 0.018) heel.push(i);
    if (joints[i * 4] === toes && z > rig.restTails[toes][2] - 0.013) tip.push(i);
  }
  assert.ok(heel.length && tip.length);
  return {heel, tip};
});

function footFrame(id, seconds, side) {
  const move = moves.find(m => m.id === id), pose = movementPose(move, seconds);
  let skin;
  drawTrainer({indexed(points) {skin ??= points;}}, pose, move);
  const {tip, heel} = landmarks[side];
  const average = (indices, axis) => indices.reduce((sum, i) => sum + skin[i][axis], 0) / indices.length;
  const pitch = Math.atan2(average(tip, 1) - average(heel, 1), average(tip, 2) - average(heel, 2));
  const leg = pose.legs[side];
  const shin = Math.atan2(leg.ankle[2] - leg.knee[2], leg.knee[1] - leg.ankle[1]);
  return {pose, pitch, shin, heelHeight: Math.min(...heel.map(i => skin[i][1])), toeHeight: Math.min(...tip.map(i => skin[i][1]))};
}

test('the raised foot rotates with the shin in a knee extension and resisted press on either side', () => {
  for (const id of ['seated-knee-extend','seated-band-leg-press']) {
    for (const [offset, side] of [[0,0],[4,1]]) {
      const rest = footFrame(id, offset, side), mid = footFrame(id, offset + 1, side), peak = footFrame(id, offset + 2, side);
      assert.ok(mid.pitch > rest.pitch + 0.40 && peak.pitch > mid.pitch + 0.40, id);
      assert.ok(peak.pitch - rest.pitch > 1.15, id);
      assert.ok(Math.abs((peak.shin - rest.shin) - (peak.pitch - rest.pitch)) < 0.24, id);
      assert.ok(peak.toeHeight - peak.heelHeight > 0.16, id);
      assert.deepEqual(peak.pose.legs[1-side], rest.pose.legs[1-side]);
      assert.ok(Math.abs(footFrame(id, offset + 4, side).pitch - rest.pitch) < 1e-6);
      if (id === 'seated-band-leg-press') {
        const toe = peak.pose.legs[side].toe;
        const [left,right] = peak.pose.bandFootLoop;
        assert.ok(left[0] < toe[0] && right[0] > toe[0]);
        assert.ok(left[2] > toe[2] + 0.01, 'the band wraps onto the forward-facing sole');
      }
    }
  }
});

test('each heel-supported extension rolls the forefoot up with its heel against the ground', () => {
  for (const id of ['supine-heel-slide','seated-hamstring-lean','seated-quad-set','seated-calf-stretch']) {
    for (const [offset, side] of [[0,0],[4,1]]) {
      const start = footFrame(id, offset, side);
      for (const phase of [0,0.25,0.75,1.25,2,2.5,3.25,3.75,4]) {
        const frame = footFrame(id, offset + phase, side);
        assert.ok(Math.abs(frame.heelHeight) < 0.005, id + ' heel contact');
        if (phase === 2) assert.ok(frame.toeHeight > start.toeHeight + 0.065, id + ' forefoot lift');
      }
    }
  }
});

test('all fitted heels meet the floor as the toes rise, with the front of the sole clear', () => {
  try {
    for (const shape of ['female','androgynous','male']) {
      setTrainerBody(shape);
      for (const id of ['standing-toe-lift','seated-toe-lift','seated-hamstring-lean','supine-heel-slide']) {
        for (const [offset,side] of [[0,0],[4,1]]) {
          for (const phase of [0,0.5,1,1.5,2]) {
            const frame = footFrame(id, offset + phase, side);
            assert.ok(Math.abs(frame.heelHeight) < 0.003, shape + ' ' + id + ' grounded heel');
            assert.ok(frame.toeHeight > -0.001, shape + ' ' + id + ' forefoot clearance');
          }
        }
      }
    }
  } finally {
    setTrainerBody('female');
  }
});

test('the supported hip extension carries the lifted shoe backwards with a nearly straight leg and a fixed stance foot', () => {
  const id = 'standing-hip-back';
  for (const [offset, side] of [[0,0],[4,1]]) {
    const rest = footFrame(id, offset, side);
    for (const phase of [0.5,1,1.5,2]) {
      const frame = footFrame(id, offset + phase, side), leg = frame.pose.legs[side];
      assert.deepEqual(frame.pose.legs[1-side].toe, rest.pose.legs[1-side].toe);
      const upper = leg.hip.map((n,i) => n - leg.knee[i]), lower = leg.ankle.map((n,i) => n - leg.knee[i]);
      const dot = upper.reduce((sum,n,i) => sum + n*lower[i], 0);
      assert.ok(dot / (Math.hypot(...upper)*Math.hypot(...lower)) < Math.cos(155*Math.PI/180));
      assert.ok(frame.toeHeight > 0);
      if (phase === 2) assert.ok(frame.pitch < rest.pitch - 0.25);
    }
  }
});
