import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {movementPose, movementActivation} from '../pose.js';
import {rig, meshes} from '../form-motion/model.js';
import {drawTrainer} from '../trainer.js';
import {upperBackBallCenter} from '../movements/upper-props.js';

const exercise = (animation, pose) => moves.find(move => move.animation === animation && move.pose === pose);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('the pendulum leaves one hand around the rail while each arm takes a turn', () => {
  const move = exercise('pendulum', 'standing'),
    start = movementPose(move, 0);
  for (let i = 0; i <= 80; i++) {
    const p = movementPose(move, i / 10);
    const supports = p.arms.filter(arm => arm.holdingRail);
    assert.ok(supports.length >= 1);
    if (i % 40 === 0) assert.equal(supports.length, 2);
    for (const arm of supports) {
      const initial = start.arms[arm.s === 1 ? 1 : 0];
      assert.ok(distance(initial.palm, arm.palm) < 0.0001);
      const middle = arm.fingerJoints[arm.s === 1 ? 1 : 2];
      assert.ok(middle[0][1] > 1.075 && middle[1][2] > 0.34 && middle[3][1] < 1.034);
    }
  }
  const a = movementPose(move, 2),
    b = movementPose(move, 6);
  assert.ok(a.arms[0].wrist[1] < a.arms[1].wrist[1] - 0.24);
  assert.ok(b.arms[1].wrist[1] < b.arms[0].wrist[1] - 0.24);
  assert.deepEqual(a.legs, b.legs);
});

test('isometric pressure appears at the load-bearing elbow or hand', () => {
  for (const id of ['elbow-back-press', 'hand-press-out']) {
    const move = exercise(id, 'seated');
    assert.equal(movementPose(move, 0).activation, 0);
    for (const t of [2, 6]) {
      const p = movementPose(move, t),
        cue = movementActivation(p, move);
      assert.equal(p.activation, 1);
      const active = t === 2 ? 0 : 1;
      assert.deepEqual(
        cue.points,
        id === 'elbow-back-press' ? p.arms.map(a => a.elbow) : [p.arms[active].wrist]
      );
      if (id === 'hand-press-out') {
        const helper = p.arms[1 - active],
          working = p.arms[active];
        assert.ok(distance(helper.palm, working.wrist) < 0.09);
        assert.ok(helper.elbow[2] > 0.17); // cross the chest in front of the torso
      }
    }
  }
});

const bodyJoints = Uint8Array.from(atob(meshes.body.joints), c => c.charCodeAt(0));
const handVertices = Array.from({length: bodyJoints.length / 4}, (_, i) => i).filter(i =>
  rig.boneNames[bodyJoints[4 * i]].includes('Hand')
);

test('the trainer unloads the hips with both hands planted against the seat cushion', () => {
  const move = exercise('seat-press', 'seated'),
    start = movementPose(move, 0);
  assert.ok(movementPose(move, 2).legs[0].hip[1] > start.legs[0].hip[1] + 0.01);
  for (const t of [0, 1, 2, 3, 4]) {
    const p = movementPose(move, t),
      parts = [];
    drawTrainer(
      {
        indexed(points) {
          parts.push(points);
        },
      },
      p,
      move
    );
    for (const arm of p.arms) {
      const overSeat = handVertices
        .map(i => parts[0][i])
        .filter(([x, , z]) => Math.sign(x) === arm.s && Math.abs(x) < 0.236 && z > -0.1 && z < 0.26);
      const lowest = Math.min(...overSeat.map(v => v[1]));
      assert.ok(lowest >= 0.448 && lowest < 0.456, 'the skin meets the 0.449 m cushion top');
    }
  }
});

test('supine arms travel around the body with the mat and ball in their intended locations', () => {
  const angel = exercise('floor-angel', 'supine'),
    raise = exercise('lying-arm-raise', 'supine');
  for (const t of [0, 1, 2, 3, 4]) {
    const p = movementPose(angel, t),
      parts = [];
    drawTrainer(
      {
        indexed(points) {
          parts.push(points);
        },
      },
      p,
      angel
    );
    assert.ok(handVertices.every(i => parts[0][i][1] >= 0));
  }
  assert.ok(movementPose(raise, 2).arms[0].palm[2] < movementPose(raise, 2).crown[2] - 0.15);
  const ball = exercise('ball-back', 'supine');
  const start = upperBackBallCenter(movementPose(ball, 0)),
    end = upperBackBallCenter(movementPose(ball, 2));
  assert.equal(start[1], 0.032);
  assert.ok(end[0] > start[0] && end[0] < 0); // below one shoulder blade, clear of the midline
});
