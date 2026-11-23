import assert from 'node:assert/strict';
import test from 'node:test';
import {movementCamera, cameraProjection, workingRegion} from '../camera.js';
import {moves} from '../core/catalog.js';
import {movementPose, movementCycleSeconds} from '../pose.js';

test('the fixed view is common to a posture and angle and zoom can be selected independently', () => {
  const postures = new Map();
  for (const move of moves) {
    const fixed = movementCamera(move, {rotation:false, zoom:false});
    const posture = move.animation === 'sit-to-stand' ? 'sit-to-stand' : move.pose;
    if (postures.has(posture)) assert.deepEqual(fixed, postures.get(posture));
    postures.set(posture, fixed);
    const guided = movementCamera(move);
    assert.deepEqual(movementCamera(move, {zoom:false}), {...fixed, yaw:guided.yaw, pitch:guided.pitch});
    assert.deepEqual(movementCamera(move, {rotation:false}), {...guided, yaw:fixed.yaw, pitch:fixed.pitch});
  }
});

test('guided framing keeps the working joints of every exercise visible on tall and wide screens', () => {
  for (const move of moves) {
    const region = workingRegion(move);
    assert.ok(region, move.id);
    for (const phase of [0, .25, .5, .75, 1, 1.25, 1.5, 1.75]) {
      const seconds = phase * movementCycleSeconds(move);
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
