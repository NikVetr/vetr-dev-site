import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../core/catalog.js';
import {movementPose} from '../pose.js';
import {movementAtLocation} from '../core/plan.js';
import {drawLowerProps, lowerBackBallCenter} from '../movements/lower-props.js';
import {lowerActivation} from '../movements/lower.js';

const catalog = new Map(moves.map(move => [move.id, move]));
const frame = (id, time) => movementPose(catalog.get(id), time);
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('supported marching uses both crossbar grips and a thigh stretch keeps the other hand on the bar', () => {
  for (const id of ['standing-march', 'standing-quad-stretch']) {
    for (const [time, side] of [
      [2, 0],
      [6, 1]
    ]) {
      const p = frame(id, time),
        rest = frame(id, 0);
      for (const [i, arm] of p.arms.entries()) {
        if (id === 'standing-quad-stretch' && i === side) {
          assert.ok(!arm.holdingRail && dist(arm.palm, p.legs[i].ankle) < 0.07);
          continue;
        }
        assert.ok(arm.holdingRail);
        assert.deepEqual(arm.palm, rest.arms[i].palm);
        assert.ok(Math.abs(arm.palm[2] - 0.317) < 0.012 && Math.abs(arm.palm[1] - 1.055) < 0.035);
      }
      const lifted = p.legs[side].ankle,
        stance = p.legs[1 - side].ankle;
      assert.ok(lifted[1] - stance[1] > (id === 'standing-march' ? 0.12 : 0.6));
    }
  }
  const heelStart = frame('standing-heel-walk', 0),
    away = frame('standing-heel-walk', 3.2);
  assert.ok(Math.abs(heelStart.arms[0].palm[0] + 0.32) < 0.015 && Math.abs(heelStart.arms[0].palm[1] - 1.055) < 0.04);
  assert.ok(dist(heelStart.arms[0].palm, away.arms[0].palm) > 0.2);
});

test('hip transfers keep their supports planted and a figure four lands on the other knee', () => {
  const seated = frame('seated-sit-to-stand', 0),
    standing = frame('seated-sit-to-stand', 2);
  assert.ok(standing.legs[0].hip[1] - seated.legs[0].hip[1] > 0.35);
  for (const [i, l] of standing.legs.entries()) assert.ok(dist(l.ankle, seated.legs[i].ankle) < 0.001);
  const bridge = frame('supine-bridge', 2),
    rest = frame('supine-bridge', 0);
  assert.ok(bridge.legs[0].hip[1] - rest.legs[0].hip[1] > 0.19);
  for (const [i, l] of bridge.legs.entries()) {
    assert.deepEqual(l.ankle, rest.legs[i].ankle);
    assert.deepEqual(bridge.arms[i].shoulder, rest.arms[i].shoulder);
  }
  for (const [time, working] of [
    [2, 0],
    [6, 1]
  ]) {
    const seatedCross = frame('seated-figure-four', time),
      leg = seatedCross.legs[working];
    const thigh = seatedCross.legs[1 - working].knee;
    assert.ok(dist(leg.ankle, thigh) < 0.105 && leg.ankle[1] > thigh[1] + 0.035);
    const palm = frame('seated-plantar-stretch', time).arms[1 - working].palm;
    assert.ok(dist(palm, frame('seated-plantar-stretch', time).legs[working].toe) < 0.065);
  }
});

test('walking has a stationary stance foot on each beat, with real toe and heel contact', () => {
  for (const id of ['standing-side-walk', 'standing-heel-walk', 'standing-toe-walk', 'standing-heel-toe-walk']) {
    for (let beat = 0; beat < 8; beat++) {
      const a = frame(id, beat + 0.1),
        b = frame(id, beat + 0.8),
        stance = a.side === 1 ? 0 : 1,
        swing = 1 - stance;
      assert.ok(dist(a.legs[stance].ankle, b.legs[stance].ankle) < 0.001, id + ' stance');
      assert.ok(dist(a.legs[swing].ankle, b.legs[swing].ankle) > 0.09, id + ' step');
      if (id === 'standing-heel-walk') assert.ok(a.legs[stance].toe[1] > 0.08);
      if (id === 'standing-toe-walk') assert.ok(a.legs[stance].ankle[1] - a.legs[stance].toe[1] > 0.1);
      if (id === 'standing-side-walk') assert.ok(a.legs[0].ankle[0] < a.legs[1].ankle[0]);
    }
  }
});

test('quiet contractions highlight the working region, including the lower leg in a stacked-foot press', () => {
  for (const [id, label] of [
    ['seated-tummy-draw', 'Lower abdomen'],
    ['standing-tummy-draw', 'Lower abdomen'],
    ['supine-tummy-draw', 'Lower abdomen'],
    ['seated-leg-cross-press', 'Thighs'],
    ['seated-foot-press-up', 'Front shin'],
    ['supine-quad-set', 'Front thigh'],
    ['seated-heel-dig', 'Back of thigh'],
    ['supine-heel-dig', 'Back of thigh']
  ]) {
    const start = frame(id, 0),
      a = frame(id, 2),
      b = frame(id, 6);
    assert.equal(start.activation, 0);
    assert.equal(a.activation, 1);
    const cue = lowerActivation(a, catalog.get(id));
    assert.equal(cue.label, label);
    assert.ok(cue.points.every(pt => pt.every(Number.isFinite)));
    if (id === 'seated-foot-press-up') {
      assert.ok(a.legs[0].ankle[1] < a.legs[1].ankle[1] - 0.05);
      assert.ok(b.legs[1].ankle[1] < b.legs[0].ankle[1] - 0.05);
    }
  }
});

test('the low back balls use posture-specific contact and the seated band ends anchor to the front chair leg', () => {
  const at = id => lowerBackBallCenter(frame(id, 2), catalog.get(id));
  assert.ok(at('seated-ball-low-back')[1] > 0.65 && at('seated-ball-low-back')[1] < 0.72);
  assert.ok(at('supine-ball-low-back')[1] < 0.04 && at('supine-ball-low-back')[2] < 0);
  for (const time of [2, 6]) {
    const id = 'seated-band-ankle-in',
      p = frame(id, time),
      rows = [];
    assert.equal(drawLowerProps({surface: r => rows.push(r)}, p, catalog.get(id), time), true);
    const start = rows[0][0],
      center = start[0].map((_, k) => start.reduce((s, v) => s + v[k], 0) / start.length);
    assert.ok(Math.abs(center[0] - p.side * 0.2223) < 0.002);
    assert.ok(Math.abs(center[2] - 0.2702) < 0.015);
  }
});

test('a rail used only in transit stays in contact through the toe grip and pelvic tilt', () => {
  for (const id of ['standing-toe-curl','standing-pelvic-tilt']) {
    const supported = movementAtLocation(catalog.get(id), 'plane-lavatory');
    for (const time of [0,1,2,3,6]) {
      const gripping = movementPose(supported,time).arms[1];
      assert.ok(gripping.holdingRail);
      assert.deepEqual(gripping.wrist,[0.275,1.084,0.19]);
      assert.ok(!frame(id,time).arms[1].holdingRail);
    }
  }
});
