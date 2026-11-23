import assert from 'node:assert/strict';
import test from 'node:test';
import {movementCamera, cameraProjection, regions} from '../camera.js';
import {moves} from '../core/catalog.js';
import {movementPose} from '../pose.js';

test('the fixed view is common to a posture and angle and zoom can be selected independently', () => {
  const postures = new Map();
  for (const move of moves) {
    const fixed = movementCamera(move, {rotation:false, zoom:false});
    if (postures.has(move.pose)) assert.deepEqual(fixed, postures.get(move.pose));
    postures.set(move.pose, fixed);
    const guided = movementCamera(move);
    assert.deepEqual(movementCamera(move, {zoom:false}), {...fixed, yaw:guided.yaw, pitch:guided.pitch});
    assert.deepEqual(movementCamera(move, {rotation:false}), {...guided, yaw:fixed.yaw, pitch:fixed.pitch});
  }
});

test('guided framing keeps the working joints of every exercise visible on tall and wide screens', () => {
  for (const move of moves) {
    const region = regions[move.motion];
    assert.ok(region, move.id);
    for (const seconds of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const pose = movementPose(move, seconds);
      let joints;
      if (region === 'head') joints = [pose.neck, pose.face, pose.crown];
      else if (['shoulders','arms','hands','wrists'].includes(region))
        joints = pose.arms.flatMap(arm => [arm.elbow, arm.wrist, arm.palm, arm.thumb, ...arm.fingers.map(finger => finger[1])]);
      else if (['feet','shins','thighs'].includes(region))
        joints = pose.legs.flatMap(leg => [leg.knee, leg.ankle, leg.toe]);
      else if (region === 'pelvis') joints = pose.legs.map(leg => leg.hip);
      else joints = [pose.centre, ...pose.arms.map(arm => arm.shoulder)];
      if (move.id === 'standing-toe-lift') joints.push(pose.arms.find(arm => arm.s === 1).wrist);

      for (const rotation of [true, false]) {
        const camera = movementCamera(move, {rotation});
        for (const [width,height] of [[330,490],[900,440]]) {
          const {project} = cameraProjection(camera, width, height, true);
          for (const joint of joints) {
            const [x,y] = project(joint);
            assert.ok(x > width*.02 && x < width*.98 && y > height*.02 && y < height*.98,
              `${move.id} at ${seconds}s, ${width}×${height}, rotation ${rotation}: joint at ${x}, ${y}`);
          }
        }
      }
    }
  }
});
