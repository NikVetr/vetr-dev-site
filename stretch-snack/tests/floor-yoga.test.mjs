import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {movementPose} from '../pose.js';

const pose = (id, time) =>
  movementPose(
    moves.find((move) => move.id === id),
    time
  );
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const times = Array.from({length: 33}, (_, i) => i * 0.25);

test("the child's forehead clears the mat and the wrists stay planted as the hips sit back", () => {
  for (const id of ['hands-and-knees-rock-back', 'kneeling-kneeling-arm-slide', 'kneeling-child-pose']) {
    const start = pose(id, 0),
      end = pose(id, 2);
    assert.ok(end.legs[0].hip[1] < start.legs[0].hip[1] - 0.18, id);
    assert.ok(end.legs[0].hip[2] < start.legs[0].hip[2] - 0.22, id);
    for (const t of times) {
      const p = pose(id, t);
      assert.ok(p.face[1] > 0.012, id);
      for (const h of p.arms) assert.ok(Math.abs(h.wrist[1] - 0.036) < 0.006, id);
      for (const l of p.legs) assert.ok(Math.abs(l.knee[1] - 0.063) < 0.01, id);
    }
  }
});

test('the knee plank lifts the hips with both elbows and both knees supported', () => {
  const id = 'prone-kneeling-plank',
    start = pose(id, 0);
  assert.ok(pose(id, 2).legs[0].hip[1] > start.legs[0].hip[1] + 0.05);
  for (const t of times) {
    const p = pose(id, t);
    for (const [i, h] of p.arms.entries()) {
      assert.ok(Math.abs(h.elbow[1] - 0.043) < 0.005);
      assert.ok(distance(h.wrist, start.arms[i].wrist) < 0.001);
      assert.ok(distance(p.legs[i].knee, start.legs[i].knee) < 0.001);
    }
  }
});

test('both hands support downward dog and the full stride keeps both feet grounded in the warrior and triangle poses', () => {
  const id = 'hands-and-knees-downward-dog',
    start = pose(id, 0);
  for (const t of times) {
    const p = pose(id, t);
    for (const [i, h] of p.arms.entries()) assert.ok(distance(h.wrist, start.arms[i].wrist) < 0.001);
    for (const id of ['standing-warrior-one', 'standing-warrior-two', 'standing-triangle', 'standing-wall-dog']) {
      for (const l of pose(id, t).legs) assert.ok(Math.abs(l.ankle[1] - 0.084) < 0.003, id);
    }
  }
  assert.ok(pose(id, 2).legs[0].hip[1] > start.legs[0].hip[1] + 0.27);
});

test('the hands reach the working feet and the toes clear the wall', () => {
  const id = 'prone-quad-stretch';
  for (const [t, i] of [
    [2, 0],
    [6, 1]
  ]) {
    const p = pose(id, t);
    assert.ok(distance(p.arms[i].palm, p.legs[i].ankle) < 0.05);
  }
  const baby = pose('supine-happy-baby', 2);
  for (const [i, h] of baby.arms.entries()) assert.ok(distance(h.palm, baby.legs[i].ankle) < 0.1);
  for (const t of times) {
    const p = pose('long-sitting-calf-roll', t);
    for (const h of p.arms) assert.ok(Math.abs(h.wrist[1] - 0.035) < 0.008);
    for (const l of pose('supine-legs-up-wall', t).legs) assert.ok(l.toe[2] < l.ankle[2]);
  }
});

test('the forearm prop keeps elbows and wrists at mat height throughout the lift', () => {
  for (const t of times)
    for (const h of pose('prone-forearm-prop', t).arms) {
      assert.ok(Math.abs(h.elbow[1] - 0.04) < 0.002);
      assert.ok(Math.abs(h.wrist[1] - 0.039) < 0.002);
    }
});

test('the swinging foot clears the floor through both half-kneeling transitions', () => {
  for (const t of times)
    for (const l of pose('kneeling-kneeling-lunge', t).legs) {
      assert.ok(Math.min(l.toe[1], l.ankle[1], l.knee[1]) > 0.025);
    }
});

test('the clam opens the upper knee while the ankles stay stacked, and the upper forearm rotates with its elbow tucked', () => {
  for (const id of ['side-lying-clam', 'side-lying-side-lying-rotation']) {
    const rest = pose(id, 0),
      peak = pose(id, 2);
    if (id === 'side-lying-clam') {
      assert.ok(peak.legs[1].knee[1] > rest.legs[1].knee[1] + 0.1);
      assert.ok(distance(peak.legs[1].ankle, rest.legs[1].ankle) < 0.01);
    } else {
      assert.ok(distance(peak.arms[1].elbow, rest.arms[1].elbow) < 0.001);
      assert.ok(peak.arms[1].wrist[1] > rest.arms[1].wrist[1] + 0.12);
    }
  }
});
