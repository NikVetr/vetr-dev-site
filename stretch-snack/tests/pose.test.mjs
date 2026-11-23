import assert from 'node:assert/strict';
import test from 'node:test';
import { moves } from '../core/catalog.js';
import { movementPose } from '../pose.js';

test('each demonstration has finite joints and shows its movement or muscle contraction', () => {
  for (const move of moves) {
    const neutral = movementPose(move,0);
    for (const time of [1,2,4,6]) {
      const {arms,legs,face,crown,activation} = movementPose(move,time);
      const geometry = [arms,legs,face,crown];
      assert.doesNotMatch(JSON.stringify(geometry), /null/, move.id);
      if (time !== 2) continue;
      if (['glute-squeeze','knee-squeeze','quad-set'].includes(move.motion)) {
        assert.equal(neutral.activation, 0, move.id);
        assert.equal(activation, 1, move.id);
      } else {
        assert.notDeepEqual(geometry,[neutral.arms,neutral.legs,neutral.face,neutral.crown],move.id);
      }
    }
  }
});

test('support and floor contacts remain fixed through a repetition', () => {
  for (const move of moves.filter(move=>move.equipment.includes('support'))) {
    const neutral = movementPose(move,0);
    for (const time of [1,2,4,5,6]) {
      const pose = movementPose(move,time);
      assert.deepEqual(pose.arms[1].wrist,neutral.arms[1].wrist,move.id);
      if (move.motion === 'heel-lift') {
        assert.ok(Math.abs(pose.legs[0].toe[1] - neutral.legs[0].toe[1]) < 1e-8);
      }
    }
  }
});

const distance = (a, b) => Math.hypot(...a.map((v, i) => v-b[i]));
const lengths = ({arms,legs}, i) => [
  distance(arms[i].shoulder, arms[i].elbow), distance(arms[i].elbow, arms[i].wrist),
  distance(legs[i].hip, legs[i].knee), distance(legs[i].knee, legs[i].ankle),
];

test('shoulders, elbows, hips and knees articulate without stretching the limb segments', () => {
  for (const move of moves) {
    const neutral = movementPose(move, 0);
    for (let frame = 0; frame <= 160; frame++) {
      const sample = movementPose(move, frame / 20);
      for (const i of [0,1]) {
        const rest = lengths(neutral, i);
        lengths(sample, i).forEach((length, j) => assert.ok(Math.abs(length - rest[j]) < 0.001,
          move.id + ', segment ' + j + ', frame ' + frame));
      }
    }
  }
});

test('switching sides returns both arms and legs through a common neutral position', () => {
  for (const move of moves) {
    for (const boundary of [4,8]) {
      const before = movementPose(move, boundary - 0.001), after = movementPose(move, boundary + 0.001);
      for (const i of [0,1]) {
        for (const key of ['shoulder','elbow','wrist','palm','thumb'])
          assert.ok(distance(before.arms[i][key], after.arms[i][key]) < 0.0001, move.id + ' ' + key);
        for (const key of ['hip','knee','ankle','toe'])
          assert.ok(distance(before.legs[i][key], after.legs[i][key]) < 0.0001, move.id + ' ' + key);
      }
    }
  }
  for (const [time, working] of [[2,0], [6,1]]) {
    const reach = movementPose({motion:'overhead-reach', pose:'seated'}, time);
    assert.ok(reach.arms[working].wrist[1] > reach.crown[1]);
    assert.ok(reach.arms[1-working].wrist[1] < reach.arms[1-working].shoulder[1]);
  }
});

test('gripping hands and loaded feet retain their points of contact', () => {
  for (const move of moves.filter(m => m.equipment.includes('support'))) {
    const rest = movementPose(move,0);
    for (let time = 0; time <= 8; time += 0.1) {
      const pose = movementPose(move,time);
      const hand = pose.arms[1];
      assert.deepEqual(hand.palm,rest.arms[1].palm,move.id);
      assert.deepEqual(hand.fingers,rest.arms[1].fingers,move.id);
      const stanceLeg = pose.side < 0 ? 1 : 0;
      if (['hip-side','calf-stretch','knee-bend'].includes(move.motion)) {
        assert.deepEqual(pose.legs[stanceLeg].toe,rest.legs[stanceLeg].toe,move.id);
      }
      if (move.motion === 'heel-lift') {
        assert.ok(distance(pose.legs[0].toe, rest.legs[0].toe) < 1e-8, move.id);
      }
    }
  }
  const step = {motion:'step-up',pose:'standing'};
  const floor = movementPose(step,0), leading = movementPose(step,0.8);
  assert.deepEqual(leading.legs[1].ankle, floor.legs[1].ankle);
  assert.ok(leading.legs[0].ankle[1] > floor.legs[0].ankle[1] + 0.1);
  const both = movementPose(step,2), following = movementPose(step,1.5);
  assert.deepEqual(both.legs[0].ankle, following.legs[0].ankle);
  assert.ok(Math.abs(both.legs[1].ankle[1] - floor.legs[1].ankle[1] - 0.14) < 1e-8);
});

test('reclined arms rest beside the hips with open palms and fingers just above the mat', () => {
  for (const move of moves.filter(m => m.pose === 'supine')) {
    for (const time of [0, 1, 2, 4, 6]) {
      for (const arm of movementPose(move, time).arms) {
        for (const point of [arm.elbow, arm.wrist, arm.palm, arm.thumb, ...arm.fingerJoints.flat()]) {
          assert.ok(Math.abs(point[0]) > 0.22, move.id + ' hand should clear the thigh');
          assert.ok(point[1] > 0.005 && point[1] < 0.052, move.id + ' arms should rest on the mat');
        }
        const bases = arm.fingerJoints.map(chain => chain[0]);
        assert.ok(Math.abs(bases[3][1] - bases[0][1]) < 0.005, 'palm lies flat');
        arm.fingerJoints.forEach((chain, i) => assert.deepEqual(arm.fingers[i], [chain[0], chain[3]]));
      }
    }
  }
});

test('a loose fist flexes three finger joints and opens into a spread hand without shrinking the bones', () => {
  for (const motion of ['hand-open', 'towel-grip']) {
    const move = {pose:'seated', motion};
    const relaxed = movementPose(move, motion === 'hand-open' ? 2 : 0).arms[0];
    const closed = movementPose(move, motion === 'hand-open' ? 0 : 2).arms[0];
    for (let finger = 0; finger < 4; finger++) {
      const chain = closed.fingerJoints[finger];
      assert.equal(chain.length, 4);
      assert.deepEqual(closed.fingers[finger], [chain[0], chain[3]]);
      const proximal = chain[1].map((v,i) => v - chain[0][i]);
      const distal = chain[3].map((v,i) => v - chain[2][i]);
      assert.ok(proximal.reduce((sum,v,i) => sum + v*distal[i], 0) < 0, 'tip folds back toward the palm');
      for (let j = 0; j < 3; j++) {
        const openLength = distance(relaxed.fingerJoints[finger][j], relaxed.fingerJoints[finger][j+1]);
        assert.ok(Math.abs(distance(chain[j], chain[j+1]) - openLength) < 1e-8);
      }
    }
    if (motion === 'hand-open') {
      const span = hand => distance(hand.fingers[0][1],hand.fingers[3][1]);
      assert.ok(span(relaxed) > span(closed) + 0.01);
    }
  }
});
