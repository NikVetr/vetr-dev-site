import assert from 'node:assert/strict';
import test from 'node:test';
import { moves } from '../core/catalog.js';
import { rig } from '../form-motion/model.js';
import { createRetarget } from '../form-motion/retarget.js';
import { movementPose } from '../pose.js';

const index = name => rig.boneNames.indexOf('mixamorig:' + name);
function apply(matrices, i, p) {
  const k = i * 16;
  return [0, 1, 2].map(r =>
    matrices[k+r]*p[0] + matrices[k+4+r]*p[1] + matrices[k+8+r]*p[2] + matrices[k+12+r]);
}
function closePoint(a, b, message) {
  assert.ok(Math.hypot(...a.map((v, i) => v-b[i])) < 1e-5, message);
}
const unit = v => v.map(x => x / Math.hypot(...v));
const difference = (end, start) => end.map((v, i) => v - start[i]);
const dot = (a, b) => a.reduce((sum, x, k) => sum + x*b[k], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function palmCoordinates(forward, across) {
  const y = unit(forward);
  const z = unit(cross(across, y)), x = cross(y, z);
  return v => [dot(v,x), dot(v,y), dot(v,z)];
}

test('native joints meet the pose targets, with fitted finger proportions preserved', () => {
  const animate = createRetarget(rig);
  for (const move of moves) {
    for (const t of [0, 1.3, 2, 4, 6]) {
      const pose = movementPose(move,t), matrices = animate(pose,move);
      for (const [side, prefix] of ['Right', 'Left'].entries()) {
        const arm = pose.arms[side], leg = pose.legs[side];
        for (const [part, start, end] of [
          ['Arm', arm.shoulder, arm.elbow], ['ForeArm', arm.elbow, arm.wrist],
          ['UpLeg', leg.hip, leg.knee], ['Leg', leg.knee, leg.ankle], ['Foot', leg.ankle, leg.toe],
        ]) {
          const i = index(prefix + part);
          closePoint(apply(matrices, i, rig.restHeads[i]),start, move.id + ' ' + part + ' head');
          closePoint(apply(matrices, i, rig.restTails[i]),end, move.id + ' ' + part + ' tail');
        }
        const chains = side === 1 ? arm.fingerJoints : [...arm.fingerJoints].reverse();
        const digits = ['Index','Middle','Ring','Pinky'];
        const knuckles = digits.map(digit => {
          const i = index(prefix + 'Hand' + digit + '1');
          return apply(matrices, i, rig.restHeads[i]);
        });
        const knuckleCenter = knuckles[1].map((v,k) => (v+knuckles[2][k])/2);
        const onHand = palmCoordinates(difference(knuckleCenter,arm.wrist), difference(knuckles[3],knuckles[0]));
        const onGuide = palmCoordinates(difference(arm.palm,arm.wrist), difference(chains[3][0],chains[0][0]));
        digits.forEach((digit, d) => {
          for (const j of [0,1,2]) {
            const i = index(prefix + 'Hand' + digit + (j+1));
            const head = apply(matrices, i, rig.restHeads[i]), tail = apply(matrices, i, rig.restTails[i]);
            closePoint(onHand(unit(difference(tail,head))), onGuide(unit(difference(chains[d][j+1],chains[d][j]))), move.id + ' ' + digit);
            assert.ok(Math.abs(Math.hypot(...difference(tail,head)) - Math.hypot(...difference(rig.restHeads[i],rig.restTails[i]))) < 1e-5);
          }
        });
      }
    }
  }
});

test('the resting hand clears the front thigh during alternating overhead reaches', () => {
  const move = moves.find(m => m.id === 'seated-overhead-reach');
  const animate = createRetarget(rig);
  for (const [t, side] of [[2,1], [6,0]]) {
    const pose = movementPose(move,t), matrices = animate(pose,move);
    const i = index(['Right','Left'][side] + 'HandMiddle3');
    const tip = apply(matrices, i, rig.restTails[i]);
    assert.ok(tip[1] >= pose.legs[side].hip[1] + 0.08);
    assert.ok(Math.abs(tip[1] - pose.arms[side].wrist[1]) < 0.035);
  }
});

test('all 52 bone frames keep their volume and turn continuously through both sides of every movement', () => {
  const animate = createRetarget(rig);
  for (const move of moves) {
    let previous;
    for (let frame = 0; frame <= 80; frame++) {
      const mat = animate(movementPose(move,frame / 10), move);
      assert.equal(mat.length, 52*16);
      for (let b = 0; b < 52; b++) {
        const k = b*16;
        const [a,c,d] = [k,k+4,k+8].map(i => mat.subarray(i,i+3));
        const det = a[0]*(c[1]*d[2]-c[2]*d[1]) - a[1]*(c[0]*d[2]-c[2]*d[0]) + a[2]*(c[0]*d[1]-c[1]*d[0]);
        assert.ok(det > 0.65 && det < 1.35, move.id + ' ' + rig.boneNames[b] + ' determinant ' + det);
        if (!previous) continue;
        for (const i of [k,k+4,k+8]) {
          const dp = mat[i]*previous[i] + mat[i+1]*previous[i+1] + mat[i+2]*previous[i+2];
          const lengths = Math.hypot(mat[i],mat[i+1],mat[i+2])*Math.hypot(previous[i],previous[i+1],previous[i+2]);
          assert.ok(dp / lengths > Math.cos(Math.PI / 7), move.id + ' discontinuous ' + rig.boneNames[b] + ' frame ' + frame);
        }
      }
      previous = mat.slice();
    }
  }
});

test('forearm pronation is shared across the elbow and wrist', () => {
  const animate = createRetarget(rig);
  for (const [motion, t, maxDegrees] of [['neck-turn',0,65], ['palm-turn',2,100]]) {
    const move = {motion: String(motion), pose: 'seated'};
    const palette = animate(movementPose(move, Number(t)), move);
    for (const prefix of ['Right', 'Left']) {
      for (const [a, b] of [['Arm','ForeArm'], ['ForeArm','Hand']]) {
        const ia = index(prefix+a)*16, ib = index(prefix+b)*16;
        let trace = 0;
        for (const offset of [0, 4, 8]) {
          const va = unit(Array.from(palette.subarray(ia+offset, ia+offset+3)));
          const vb = unit(Array.from(palette.subarray(ib+offset, ib+offset+3)));
          trace += va.reduce((sum,x,i) => sum + x*vb[i],0);
        }
        assert.ok((trace - 1)/2 > Math.cos(Number(maxDegrees)*Math.PI/180),prefix + a + ' ' + b);
      }
    }
  }
});
