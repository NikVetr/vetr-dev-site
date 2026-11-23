import assert from 'node:assert/strict';
import test from 'node:test';
import { movementPose } from '../pose.js';
import { drawTrainer } from '../trainer.js';

const at = (motion, t, pose = 'seated') => movementPose({motion, pose}, t);
const delta = (end, start) => end.map((v, i) => v - start[i]);
const unit = v => v.map(x => x / Math.hypot(...v));
const dot = (a, b) => a.reduce((total, x, i) => total + x*b[i], 0);
const close = (a, b) => assert.ok(Math.abs(a-b) < 1e-6);

test('heel slides keep the foot flat; ankle circles clear the floor and reverse before switching feet', () => {
  const rest = at('foot-slide',0);
  for (const [time, side] of [[2,0], [6,1]]) {
    const slide = at('foot-slide',time);
    assert.ok(slide.legs[side].ankle[2] < rest.legs[side].ankle[2] - 0.12);
    close(slide.legs[side].ankle[1], rest.legs[side].ankle[1]);
    close(slide.legs[side].toe[1], rest.legs[side].toe[1]);
    assert.deepEqual(slide.legs[1-side], rest.legs[1-side]);
  }
  for (const [start, side] of [[0,0], [8,1]]) {
    const first = at('ankle-circle',start+1.4), reverse = at('ankle-circle',start+5.4);
    const hold = at('ankle-circle',start+4), down = at('ankle-circle',start+8);
    assert.equal(first.side, reverse.side);
    assert.ok((first.legs[side].toe[0]-first.legs[side].ankle[0]) *
      (reverse.legs[side].toe[0]-reverse.legs[side].ankle[0]) < 0);
    assert.ok(hold.legs[side].ankle[1] > down.legs[side].ankle[1] + 0.035);
    assert.deepEqual(first.legs[1-side], reverse.legs[1-side]);
  }
});

test('extended legs reach a near-straight knee, with both hamstring-stretch hands on the opposite thigh', () => {
  for (const motion of ['hamstring-lean','quad-set']) {
    for (const [time, side] of [[2,0],[6,1]]) {
      const pose = at(motion,time), leg = pose.legs[side], opposite = pose.legs[1-side];
      const angle = Math.acos(dot(unit(delta(leg.hip,leg.knee)), unit(delta(leg.ankle,leg.knee))));
      assert.ok(angle > 165*Math.PI/180 && angle < Math.PI);
      if (motion === 'hamstring-lean') {
        assert.ok(pose.spine.chestUp[2] > 0.2);
        for (const hand of pose.arms) {
          assert.ok(Math.abs(hand.palm[0] - opposite.hip[0]) < 0.06);
          assert.ok(hand.palm[2] > opposite.hip[2] && hand.palm[2] < opposite.knee[2]);
        }
      } else {
        assert.deepEqual(at(motion, 1.4 + (side ? 4 : 0)).legs[side], leg);
        assert.equal(pose.activation, 1);
      }
    }
  }
});

test('the actual heel surface stays against the floor through supported standing toe lifts', () => {
  const move = {motion: 'toe-lift', pose:'standing'};
  for (const time of [0, 0.5, 1, 1.5, 2]) {
    const pose = movementPose(move,time);
    const surfaces = [];
    drawTrainer({indexed(points) { surfaces.push(points); }},pose,move);
    const skin = surfaces[0];
    assert.ok(skin?.length, 'trainer should draw its body mesh');
    for (const leg of pose.legs) {
      const hindfoot = skin.filter(([x,,z]) => x*leg.s > 0 && z < leg.ankle[2]+0.012);
      assert.ok(Math.abs(Math.min(...hindfoot.map(p=>p[1]))) < 0.005);
    }
  }
});

test('the chin retracts level and the seated pelvic rock changes the low-back curve with planted feet', () => {
  const rest = at('chin-tuck',0), tuck = at('chin-tuck',2);
  assert.ok(tuck.face[2] < rest.face[2] - 0.025);
  assert.ok(Math.abs(tuck.eyes[0][1] - rest.eyes[0][1]) < 0.01);
  const forward = at('seated-pelvic-tilt',0), back = at('seated-pelvic-tilt',2);
  assert.ok(forward.spine.pelvicUp[2] > 0 && back.spine.pelvicUp[2] < 0);
  assert.deepEqual(forward.legs, back.legs);
});
