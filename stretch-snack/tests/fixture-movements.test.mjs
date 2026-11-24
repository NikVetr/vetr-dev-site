import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {movementPose, movementActivation} from '../pose.js';
import {drawTrainer, setTrainerBody} from '../trainer.js';
import {meshes, rig} from '../form-motion/model.js';
import {
  bedTop,
  trayY,
  counterY,
  backCounterY,
  chairHeelHeight,
  fixtureBallCenter
} from '../movements/fixtures.js';
import {drawFixtureProps} from '../movements/fixtures-props.js';

const exercise = (id, pose = 'standing') =>
  moves.find((m) => m.family === 'fixtures' && m.pose === pose && m.animation === id);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const between = (n, lo, hi, label) => assert.ok(n >= lo && n <= hi, label + ' (' + n + ')');
const joints = Uint8Array.from(atob(meshes.body.joints), (c) => c.charCodeAt(0));
const bones = Array.from({length: joints.length / 4}, (_, i) => rig.boneNames[joints[i * 4]]);
function bodyVertices(p, move, match) {
  /** @type {number[][][]} */
  const parts = [];
  drawTrainer(
    {
      indexed(points) {
        parts.push(points);
      }
    },
    p,
    move
  );
  return parts[0].filter((pt, i) => match(bones[i], pt));
}

test('the load stays at the same contact during a wall press or wall push-up', () => {
  for (const id of [
    'head-press',
    'elbow-back-press',
    'wall-press-out',
    'wall-press-side',
    'wall-press-forward'
  ]) {
    const m = exercise(id, id === 'head-press' ? 'seated' : 'standing'),
      initial = movementPose(m, 0);
    assert.equal(initial.activation, 0);
    for (const t of [2, 6]) {
      const p = movementPose(m, t),
        cue = movementActivation(p, m);
      assert.equal(p.activation, 1);
      assert.deepEqual(p.arms, initial.arms);
      if (id === 'wall-press-forward') assert.deepEqual(cue.points, [p.arms[t === 2 ? 0 : 1].palm]);
    }
  }
  const m = exercise('wall-push-up'),
    start = movementPose(m, 0),
    peak = movementPose(m, 2);
  assert.ok(peak.neck[2] > start.neck[2] + 0.22);
  for (let i = 0; i < 2; i++) {
    assert.ok(distance(start.arms[i].palm, peak.arms[i].palm) < 1e-8);
    assert.ok(distance(start.legs[i].ankle, peak.legs[i].ankle) < 1e-8);
  }
});

test('the towel slides, counter hands stay planted, and the doorway switches high and low sides', () => {
  const slide = exercise('table-slide', 'seated'),
    counter = exercise('counter-step-back'),
    door = exercise('doorway-stretch');
  const begin = movementPose(slide, 0),
    end = movementPose(slide, 2);
  assert.ok(end.arms[0].palm[2] - begin.arms[0].palm[2] > 0.4);
  assert.ok(distance(end.arms[0].shoulder, end.arms[0].wrist) > 0.48);
  const palm = movementPose(counter, 0).arms[0].palm;
  for (const t of [0, 1, 2, 3, 4]) {
    const p = movementPose(counter, t);
    assert.ok(distance(p.arms[0].palm, palm) < 0.001);
    assert.ok(distance(p.arms[0].wrist, p.arms[0].shoulder) > 0.475);
  }
  assert.ok(movementPose(counter, 2).legs[0].ankle[2] < -0.4);
  for (const [t, high] of [
    [2, 0],
    [6, 1]
  ]) {
    const p = movementPose(door, t);
    assert.ok(p.arms[high].palm[1] > p.crown[1]);
    assert.ok(p.arms[1 - high].palm[1] < p.legs[0].hip[1] + 0.17);
  }
  const upper = exercise('ball-back'),
    lower = exercise('ball-low-back');
  assert.ok(
    fixtureBallCenter(movementPose(upper, 2), upper.animation)[1] >
      fixtureBallCenter(movementPose(lower, 2), lower.animation)[1] + 0.22
  );
});

test('fitted hands meet the towel, counter and rear table across trainer builds', () => {
  try {
    for (const shape of ['female', 'androgynous', 'male']) {
      setTrainerBody(shape);
      for (const [id, pose, surface] of /** @type {const} */ ([
        ['table-slide', 'seated', trayY + 0.008],
        ['back-arch-table', 'standing', backCounterY],
        ['counter-step-back', 'standing', counterY]
      ])) {
        const m = exercise(id, pose);
        for (const t of [0, 1, 2]) {
          const p = movementPose(m, t);
          const hand = bodyVertices(
            p,
            m,
            (bone, pt) =>
              bone.includes('Hand') &&
              (id === 'back-arch-table' ? pt[2] < -0.155 : pt[2] > (id === 'table-slide' ? 0.22 : 0.51))
          );
          between(Math.min(...hand.map((pt) => pt[1])) - surface, -0.002, 0.009, id + ' ' + shape);
        }
      }
    }
  } finally {
    setTrainerBody('female');
  }
});

test('the bed supports the resting arm and heel while the outside leg clears the edge and the floor', () => {
  const m = exercise('bed-edge-hip-stretch', 'supine'),
    start = movementPose(m, 0),
    end = movementPose(m, 2);
  const outer = end.legs[0];
  assert.ok(outer.knee[1] < bedTop && outer.knee[0] < -0.24);
  assert.ok(end.arms[0].palm[1] > bedTop + 0.11);
  between(end.arms[1].palm[1], bedTop + 0.005, bedTop + 0.052, 'resting palm');
  assert.ok(start.legs[0].ankle[1] > bedTop);
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    const p = movementPose(m, t);
    if (p.legs[0].ankle[1] < bedTop) assert.ok(p.legs[0].ankle[0] < -0.2);
    const foot = bodyVertices(p, m, (name) => /Right(Foot|ToeBase)/.test(name));
    assert.ok(Math.min(...foot.map((pt) => pt[1])) > 0.055);
  }
});

test('heels contact the raised chair or tap the floor on alternate repetitions', () => {
  try {
    for (const shape of ['female', 'androgynous', 'male']) {
      setTrainerBody(shape);
      const knee = exercise('knee-straighten-stretch', 'seated'),
        dead = exercise('dead-bug', 'supine');
      for (const t of [0, 1, 2]) {
        const heel = bodyVertices(movementPose(knee, t), knee, (name) => /Right(Foot|ToeBase)/.test(name));
        between(
          Math.min(...heel.map((pt) => pt[1])),
          chairHeelHeight - 0.0001,
          chairHeelHeight + 0.001,
          'propped heel'
        );
      }
      for (const [support, height] of /** @type {const} */ ([
        ['chair', chairHeelHeight],
        ['step', 0.185]
      ])) {
        const hamstring = {...exercise('hamstring-step'), raisedSupport: support};
        const p = movementPose(hamstring, 2);
        const raisedHeel = bodyVertices(p, hamstring, (name) => /Right(Foot|ToeBase)/.test(name));
        between(
          Math.min(...raisedHeel.map((pt) => pt[1])),
          height - 0.0001,
          height + 0.001,
          'selected support'
        );
        assert.ok(distance(p.legs[0].hip, p.legs[0].ankle) > 0.824);
      }
      for (const [t, side] of /** @type {const} */ ([
        [2, 'Right'],
        [6, 'Left']
      ])) {
        const p = movementPose(dead, t);
        const tapping = bodyVertices(
          p,
          dead,
          (name) => name.includes(side + 'Foot') || name.includes(side + 'ToeBase')
        );
        between(Math.min(...tapping.map((pt) => pt[1])), -0.001, 0.001, 'tapping heel');
        assert.ok(p.legs[t === 2 ? 1 : 0].ankle[1] > 0.47);
      }
    }
  } finally {
    setTrainerBody('female');
  }
});

test('all six fixture types produce finite nondegenerate surfaces in both camera directions', () => {
  for (const [id, pose] of [
    ['wrist-lift-bottle', 'seated'],
    ['wall-slide', 'standing'],
    ['table-slide', 'seated'],
    ['band-row', 'standing'],
    ['chair-squat', 'standing'],
    ['bed-edge-hip-stretch', 'supine']
  ]) {
    const m = exercise(id, pose),
      p = movementPose(m, 2);
    for (const yaw of [0.58, 2.1]) {
      let count = 0;
      const reject = () => assert.fail('unexpected mesh primitive');
      const mesh = {
        indexed: reject,
        triangles: reject,
        surface(rings) {
          assert.ok(rings.length >= 2);
          const coordinates = rings.flat();
          assert.ok(coordinates.flat().every(Number.isFinite));
          assert.ok(coordinates.some((point) => distance(point, coordinates[0]) > 0.002));
          count++;
        }
      };
      assert.equal(drawFixtureProps(mesh, p, m, 2, yaw), true);
      assert.ok(count >= 2);
    }
  }
});
