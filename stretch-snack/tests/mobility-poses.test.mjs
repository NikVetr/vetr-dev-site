import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../core/catalog.js';
import {movementCycleSeconds, movementPose} from '../pose.js';

const mobility = moves.filter((move) => move.family === 'mobility');
function at(id, phase) {
  const move = mobility.find((move) => move.animation === id);
  return movementPose(move, movementCycleSeconds(move) * phase);
}
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const span = (p) => distance(p.legs[0].ankle, p.legs[1].ankle);

// The rollover starts and finishes seated; the mat posture label describes
// the middle of a moving repetition, not a static reclined resting posture.
test('rollover rocks onto the upper back, opens the straddle after unrolling, and returns to the seat', () => {
  const start = at('rollover-straddle', 0),
    overhead = at('rollover-straddle', 0.33),
    straddle = at('rollover-straddle', 0.75),
    end = at('rollover-straddle', 1);
  assert.ok(start.crown[1] > 0.8 && span(start) < 0.35);
  assert.ok(overhead.legs[0].hip[1] > overhead.neck[1] + 0.16);
  assert.ok(overhead.legs[0].ankle[2] < overhead.neck[2] - 0.08);
  assert.ok(overhead.crown[1] > overhead.neck[1] + 0.055, 'weight stays off the crown');
  assert.ok(straddle.legs[0].hip[1] < 0.14 && span(straddle) > 1.3);
  assert.ok(straddle.arms.every((r) => r.wrist[2] > 0.6));
  assert.deepEqual(start.crown, end.crown);
  assert.deepEqual(start.legs, end.legs);
});

test('the floor drills use different hand, leg and ground contacts', () => {
  const hop = at('groiner', 0.51),
    single = at('spiderman-lunge', 0.51),
    climber = at('mountain-climber', 0.51);
  for (const l of hop.legs) {
    const arm = hop.arms.find((r) => r.s === l.s);
    assert.ok(Math.abs(l.ankle[0]) > Math.abs(arm.wrist[0]) + 0.08);
    assert.ok(Math.abs(l.ankle[2] - arm.wrist[2]) < 0.08 && l.ankle[1] < 0.1);
  }
  assert.ok(single.legs[0].ankle[2] > 0.35 && single.legs[1].ankle[2] < -0.8);
  assert.ok(climber.legs[0].ankle[1] > single.legs[0].ankle[1] + 0.038);
  const wristStart = at('wrist-rock', 0),
    wristEnd = at('wrist-rock', 0.5);
  assert.ok(distance(wristStart.arms[0].wrist, wristEnd.arms[0].wrist) < 1e-6);
  assert.ok(wristEnd.arms[0].shoulder[2] > wristStart.arms[0].shoulder[2] + 0.095);
  const frog = at('rocking-frog', 0.52),
    release = at('rocking-frog', 1);
  for (const [i, r] of frog.arms.entries()) {
    assert.ok(r.elbow[1] < 0.09 && r.wrist[1] < 0.065);
    assert.ok(distance(r.wrist, release.arms[i].wrist) < 0.01);
  }
  assert.ok(frog.legs[0].hip[2] < release.legs[0].hip[2] - 0.13);
});

test('walking drills alternate with the arriving foot ahead of the supporting foot', () => {
  for (const id of ['toy-soldier', 'walking-quad-pull', 'walking-knee-hug']) {
    const start = at(id, 0),
      end = at(id, 1),
      next = at(id, 2);
    assert.ok(start.legs[0].ankle[2] < start.legs[1].ankle[2] - 0.18, id);
    assert.ok(end.legs[0].ankle[2] > end.legs[1].ankle[2] + 0.18, id);
    assert.deepEqual(start.legs, next.legs);
  }
  for (const phase of [0.5, 1.5]) {
    const p = at('walking-quad-pull', phase),
      l = p.legs.find((l) => l.s === p.side),
      r = p.arms.find((r) => r.s === p.side);
    assert.ok(distance(l.ankle, r.palm) < 0.12, 'hand reaches the raised ankle');
  }
});

test('the lunge turns over the planted hand and the inchworm walks into and out of a long plank', () => {
  for (const cycle of [0, 1]) {
    const reach = at('worlds-greatest-stretch', cycle + 0.63),
      front = reach.legs.find((l) => l.s === reach.side),
      back = reach.legs.find((l) => l.s !== reach.side);
    const hand = reach.arms.find((r) => r.s !== reach.side),
      sky = reach.arms.find((r) => r.s === reach.side);
    assert.ok(hand.wrist[1] < 0.075 && sky.wrist[1] > 1.0);
    assert.ok(distance(back.hip, back.ankle) > 0.79);
    const release = at('worlds-greatest-stretch', cycle + 0.75).legs.find((l) => l.s === front.s);
    assert.ok(distance(release.hip, release.ankle) > distance(front.hip, front.ankle) + 0.17);
  }
  const plank = at('inchworm', 0.51),
    advancing = at('inchworm', 0.64),
    end = at('inchworm', 1);
  assert.ok(plank.arms.every((r) => r.wrist[1] < 0.07));
  assert.ok(plank.legs.every((l) => distance(l.ankle, l.hip) > 0.76));
  assert.ok(Math.abs(advancing.legs[0].ankle[2] - advancing.legs[1].ankle[2]) > 0.25);
  assert.ok(end.crown[1] > 1.6);
});

test('all mobility variants keep the joints clear of the floor throughout each working side', () => {
  assert.equal(mobility.length, 35);
  for (const move of mobility) {
    const period = movementCycleSeconds(move);
    for (let sample = 0; sample <= 160; sample++) {
      const p = movementPose(move, (sample * period) / 80);
      const points = [
        p.crown,
        ...p.arms.flatMap((r) => [r.elbow, r.palm]),
        ...p.legs.flatMap((l) => [l.knee, l.ankle, l.toe])
      ];
      assert.ok(
        points.every((v) => v.every(Number.isFinite) && v[1] >= -0.001),
        move.id + ' at ' + sample
      );
    }
  }
});
