import assert from 'node:assert/strict';
import test from 'node:test';
import { moves } from '../core/catalog.js';
import { movementPose } from '../pose.js';

test('all catalog variants move at least one joint and keep coordinates finite', () => {
  for (const move of moves) {
    const neutral = movementPose(move,0);
    for (const time of [1,2,4,6]) {
      const {arms,legs,face,crown} = movementPose(move,time);
      const geometry = [arms,legs,face,crown];
      assert.doesNotMatch(JSON.stringify(geometry), /null/, move.id);
      if (time === 2) assert.notDeepEqual(geometry,[neutral.arms,neutral.legs,neutral.face,neutral.crown],move.id);
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
