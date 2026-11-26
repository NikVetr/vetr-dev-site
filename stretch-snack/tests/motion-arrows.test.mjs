import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {movementPose, movementCycleSeconds, mixPoint} from '../pose.js';
import {motionArrows, motionPhases} from '../motion-arrows.js';

const byId = (/** @type {string} */ id) => {
  const move = moves.find(m => m.id === id);
  assert.ok(move, id);
  return move;
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
const norm = (a) => Math.hypot(...a);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / (norm(a) * norm(b))))) * 180 / Math.PI;
const fingertip = (arm) => mixPoint(arm.fingers[1][1], arm.fingers[2][1], 0.5);

// Each arrow runs the way its joint travels during the phase, ending near where that joint stops.
const traced = {
  'seated-overhead-reach': (p, side) => p.arms[side].palm,
  'seated-knee-extend': (p, side) => p.legs[side].ankle,
  'seated-neck-tilt': (p) => p.crown,
  'standing-arm-circle': (p, side) => p.arms[side].palm,
  'supine-heel-slide': (p, side) => p.legs[side].ankle,
  'seated-shoulder-squeeze': (p, side) => p.arms[side].shoulder,
  'seated-wrist-bend': (p, side) => fingertip(p.arms[side]),
};

test('arrows follow the traced joint from the start to the end of each moving phase', () => {
  for (const [id, joint] of Object.entries(traced)) {
    const move = byId(id);
    for (const k of [0, 1]) {
      const phases = motionPhases(move, k);
      assert.ok(phases.length, id + ' has moving phases');
      const base = k * movementCycleSeconds(move);
      for (const phase of phases) {
        const from = movementPose(move, base + phase.start), to = movementPose(move, base + phase.end);
        for (const path of phase.paths) {
          const chord = sub(path.at(-1), path[0]);
          // A circling joint's arrow stops short of closing its loop.
          const closed = norm(chord) < 0.6 * Math.max(...path.map(q => norm(sub(q, path[0]))));
          // Match the arrow with whichever side's joint it traces.
          const fits = [0, 1].map(side => {
            const travel = sub(joint(to, side), joint(from, side));
            return norm(travel) < 0.005 ? Infinity : closed ? 0 : angle(chord, travel);
          });
          assert.ok(Math.min(...fits) < 12, `${id} k${k} ${phase.start.toFixed(2)}s: arrow turns ${Math.min(...fits).toFixed(1)}° from the joint`);
          const gap = Math.min(...[0, 1].filter(side => fits[side] < 12).map(side => norm(sub(path.at(-1), joint(to, side)))));
          if (!closed) assert.ok(gap < 0.3, `${id} arrow ends ${gap.toFixed(2)} m from its joint`);
        }
      }
    }
  }
});

test('the left and right repetitions have mirrored arrows', () => {
  for (const id of ['seated-overhead-reach', 'seated-knee-extend', 'seated-neck-tilt']) {
    const move = byId(id);
    const [left, right] = [0, 1].map(k => motionPhases(move, k));
    assert.equal(left.length, right.length, id);
    left.forEach((phase, i) => {
      const a = sub(phase.paths[0].at(-1), phase.paths[0][0]), b = sub(right[i].paths[0].at(-1), right[i].paths[0][0]);
      assert.ok(angle([-a[0], a[1], a[2]], b) < 12, id + ' mirrored chord');
    });
  }
});

test('arrows hold still within a phase and appear or vanish only while faint', () => {
  for (const id of ['seated-overhead-reach', 'seated-knee-extend', 'seated-ankle-circle', 'standing-worlds-greatest-stretch', 'seated-finger-lift']) {
    const move = byId(id);
    const frames = 30 * 2 * movementCycleSeconds(move);
    let previous, clock;
    for (let f = 0; f <= frames; f++) {
      const shown = motionArrows(move, f / 30, {previous: clock});
      clock = shown.clock;
      const now = shown.arrows;
      if (previous) {
        const kept = now.filter(arrow => previous.some(old => old.points === arrow.points));
        for (const arrow of now) {
          const old = previous.find(o => o.points === arrow.points);
          if (old) assert.ok(Math.abs(arrow.strength - old.strength) < 0.35, id + ' fades smoothly');
          else assert.ok(arrow.strength < 0.25, `${id} arrow appears faint at frame ${f} (${arrow.strength.toFixed(2)})`);
        }
        for (const old of previous)
          if (!kept.some(arrow => arrow.points === old.points)) assert.ok(old.strength < 0.25, `${id} arrow vanishes faint at frame ${f}`);
      }
      previous = now;
    }
  }
});

test('Still shows the most recent movement whole and unanimated', () => {
  const move = byId('seated-overhead-reach');
  const first = motionArrows(move, 2, {still: true}), again = motionArrows(move, 2, {still: true});
  assert.equal(first.arrows.length, 1);
  assert.deepEqual(first.arrows, again.arrows);
  const [arrow] = first.arrows;
  assert.equal(arrow.strength, 1);
  assert.equal(arrow.flow, 0);
  // At 2 s the arm has finished rising: the arrow points up.
  assert.ok(arrow.points.at(-1)[1] - arrow.points[0][1] > 0.4);
});

test('demonstration time running backwards turns the arrow around at a phase end', () => {
  const move = byId('seated-knee-extend');
  const [outward] = motionPhases(move, 0);
  // A program easing out of its hold replays the outward phase backwards from its peak.
  let clock = motionArrows(move, outward.end).clock;
  for (let t = outward.end - 0.02; t > outward.end - 0.6; t -= 1 / 30) clock = motionArrows(move, t, {previous: clock}).clock;
  const middle = (outward.start + outward.end) / 2;
  const back = motionArrows(move, middle, {previous: {...clock, seconds: middle + 1 / 30}});
  assert.equal(back.clock.reverse, true);
  assert.deepEqual(back.arrows[0].points[0], outward.paths[0].at(-1));
  // Normal playback through the middle of the phase keeps it pointing forward.
  const forward = motionArrows(move, middle, {previous: {key: clock.key, seconds: middle - 1 / 30, reverse: false}});
  assert.equal(forward.clock.reverse, false);
});

test('holds without travel have no arrow', () => {
  for (const id of ['seated-glute-squeeze', 'seated-neck-press-front']) assert.equal(motionPhases(byId(id), 0).length, 0, id);
});
