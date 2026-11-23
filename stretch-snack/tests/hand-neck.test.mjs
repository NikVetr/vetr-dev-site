import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../core/catalog.js';
import {movementPose, movementActivation} from '../pose.js';
import {drawHandNeckProps} from '../movements/hand-neck-props.js';
import {rig, meshes} from '../form-motion/model.js';
import {createRetarget} from '../form-motion/retarget.js';
import {drawTrainer} from '../trainer.js';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum,v,i) => sum + v * b[i], 0);
const unit = a => a.map(v => v / Math.hypot(...a));
const sample = (animation, pose, seconds) => movementPose(moves.find(m => m.animation === animation && m.pose === pose), seconds);
const chains = (arm) => arm.s === 1 ? arm.fingerJoints : [...arm.fingerJoints].reverse();

function nativeTip(palette, bone) {
  const id = rig.boneNames.indexOf('mixamorig:' + bone);
  const [x,y,z] = rig.restTails[id], k = id * 16;
  return [0,1,2].map(i => palette[k+i]*x + palette[k+4+i]*y + palette[k+8+i]*z + palette[k+12+i]);
}

test('the visible thumb meets each fitted fingertip in sequence, then reverses on each hand', () => {
  const retarget = createRetarget(rig);
  const names = ['Index','Middle','Ring','Pinky'];
  for (const move of moves.filter(m => m.animation === 'thumb-touch')) {
    for (const [side,prefix] of ['Right','Left'].entries()) {
      for (const [index, digit] of [0,1,2,3,3,2,1,0].entries()) {
        const pose = movementPose(move, 18 * side + 2 + 2 * index), mat = retarget(pose,move);
        const thumb = nativeTip(mat,prefix + 'HandThumb3'), finger = nativeTip(mat,prefix + 'Hand' + names[digit] + '3');
        assert.ok(distance(thumb,finger) < .009, move.id + ' ' + prefix + names[digit]);
        assert.ok(distance(thumb, pose.arms[side].thumb) < .0001, 'constraint reaches the actual thumb mesh');
      }
    }
  }
});

test('tendon glides articulate hook, full and flat fists differently and straighten between each', () => {
  for (const offset of [0,12]) {
    const index = t => {
      const p = sample('tendon-glide','seated',offset+t), arm = p.arms[offset ? 1 : 0], finger = chains(arm)[0];
      const palm = unit(sub(arm.palm,arm.wrist));
      return finger.slice(1).map((end,i) => dot(palm,unit(sub(end,finger[i]))));
    };
    assert.ok(index(2)[0] > .99 && index(2)[2] < -.9, 'hook keeps the first segment straight');
    assert.ok(index(6)[0] < .4 && index(6)[1] < -.9, 'full fist bends the knuckles');
    assert.ok(index(10)[0] < .15 && Math.abs(index(10)[2] - index(10)[1]) < .04, 'flat fist keeps the last joint straighter');
    for (const t of [0,4,8]) assert.ok(index(t).every(v => v > .98));
  }
});

test('a wrist wave rotates with a stationary thumb-up forearm, while single lifts move just the chosen digit', () => {
  const low = sample('wrist-wave','standing',6), high = sample('wrist-wave','standing',2);
  for (const [i,arm] of high.arms.entries()) {
    const lower = low.arms[i];
    assert.deepEqual(arm.wrist,lower.wrist);
    assert.deepEqual(arm.elbow,lower.elbow);
    assert.ok(arm.palm[1] - lower.palm[1] > .045);
    assert.ok(arm.thumb[1] > arm.palm[1]);
  }
  for (const [side,start] of [0,12].entries()) {
    const resting = sample('finger-lift','seated',start).arms[side];
    for (let i=0; i<5; i++) {
      const raised = sample('finger-lift','seated',start+2+2*i).arms[side];
      for (let d=0; d<4; d++) {
        const delta = chains(raised)[d][3][1] - chains(resting)[d][3][1];
        if (d === i) assert.ok(delta > .020);
        else assert.ok(Math.abs(delta) < .00001);
      }
      if (i===4) assert.ok(raised.thumb[1] > resting.thumb[1] + .018);
    }
  }
});

test('presses hold the head still while indicating effort; the supported nod maintains occipital contact', () => {
  const headBone = rig.boneNames.indexOf('mixamorig:Head');
  const joints = Uint8Array.from(atob(meshes.body.joints), c => c.charCodeAt(0));
  const headPoints = Array.from({length:joints.length/4}, (_,i) => i).filter(i=>joints[i*4] === headBone);
  for (const move of moves.filter(m => m.family === 'hand-neck')) {
    const neutral = movementPose(move,0);
    const effort = movementActivation(neutral,move);
    if (effort) {
      assert.equal(neutral.activation,0);
      const hold = movementPose(move,2);
      assert.equal(hold.activation,1,move.id);
      assert.deepEqual(hold.skull,neutral.skull);
      assert.deepEqual(hold.eyes,neutral.eyes);
    }
    if (move.pose !== 'supine') continue;
    for (const t of [0,2,4,6]) {
      const pose = movementPose(move,t);
      const props = [];
      assert.ok(drawHandNeckProps({surface: rings => props.push(rings.flat())},pose,move,t));
      const top = Math.max(...props.flat().map(p => p[1]));
      const parts = [];
      drawTrainer({indexed: points => parts.push(points)},pose,move);
      const lowest = Math.min(...headPoints.map(i => parts[0][i][1]));
      assert.ok(Math.abs(lowest - top) < .003, move.id + ' towel clearance ' + (lowest - top));
    }
  }
});

test('the ball rolls along the thigh under the palm and changes hands at the midline', () => {
  for (const offset of [0,8]) {
    const first = sample('hand-ball-roll','seated',offset+1.6), last = sample('hand-ball-roll','seated',offset+4);
    const i = offset ? 1 : 0;
    const travel = last.handBall.center[2] - first.handBall.center[2];
    const handTravel = last.arms[i].wrist[2] - first.arms[i].wrist[2];
    assert.ok(travel > .06 && handTravel > 1.8 * travel);
    assert.ok(Math.abs(first.handBall.center[0] - first.legs[i].knee[0]) < .012);
  }
  const before = sample('hand-ball-roll','seated',7.9999), after = sample('hand-ball-roll','seated',8.0001);
  assert.ok(distance(before.handBall.center, after.handBall.center) < .0001);
  for (const i of [0,1]) assert.ok(distance(before.arms[i].palm, after.arms[i].palm) < .0001);
});

test('assisted finger bends brace the selected knuckle and anchored neck stretches tip away from the tucked hand', () => {
  for (const posture of ['seated','standing']) {
    for (const [side,start] of [0,20].entries()) {
      for (let i=0; i<4; i++) {
        const p = sample('finger-block',posture,start+4+4*i);
        const guide = chains(p.arms[side])[i];
        const brace = mixAlong(guide[0],guide[1],.017);
        const other = p.arms[1-side];
        assert.ok(distance(other.thumb,brace) < .017);
        assert.ok(distance(chains(other)[0][3],brace) < .011);
        assert.ok(dot(unit(sub(guide[1],guide[0])),unit(sub(guide[3],guide[2]))) < 0);
      }
    }
  }
  for (const [side,time] of [4,12].entries()) {
    const p = sample('anchored-neck-stretch','seated',time);
    assert.ok(p.skull[0] * p.arms[side].s < -.03);
    assert.ok(p.arms[side].palm[1] < p.legs[side].hip[1]);
    assert.ok(p.arms[1-side].palm[1] > p.legs[1-side].hip[1] + .09);
  }
});

function mixAlong(a,b,length) {
  const direction = unit(sub(b,a));
  return a.map((v,i) => v + length * direction[i]);
}
