import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planRounds } from '../../../seating/core/index.js';
import { roomGeometry, encodeRoutes } from '../cards/seating.mjs';
import { decodeRoutes, frameAt } from '../../../assets/players/seating.js';
import { closestApproach, planSwarm, validateSwarm } from '../seating-swarm.mjs';

test('continuous clearance detects a crossing even when all frame endpoints are apart', () => {
  const crossing = closestApproach([-10, 0], [10, 0], [0, -10], [0, 10]);
  assert.equal(crossing.time, .5);
  assert.equal(crossing.distance, 0);
  assert.equal(closestApproach([0, 0], [20, 0], [0, 5], [20, 5]).distance, 5);
});

test('reserved routes clear moving guests, a fixed seat and table obstacles continuously', () => {
  const starts = /** @type {import('../seating-swarm.mjs').Point[]} */ ([[20, 25], [20, 45], [80, 25], [80, 45], [50, 60]]);
  const ends = [starts[3], starts[2], starts[1], starts[0], starts[4]];
  const options = { radius: 2, width: 100, height: 80, obstacles: [{ x: 30, y: 35, radius: 5 }, { x: 70, y: 35, radius: 5 }] };
  const { paths } = planSwarm(starts, ends, { ...options, frames: 40 });
  paths.forEach((path, i) => { assert.deepEqual(path[0], starts[i]); assert.deepEqual(path.at(-1), ends[i]); });
  assert.ok(paths[4].every(p => p[0] === 50 && p[1] === 60));
  assert.ok(validateSwarm(paths, { ...options, radius: 2.2 }).guestGap > .2);
});

test('all four preview transitions connect real rounds with stationary fixed seats and no collisions', () => {
  const request = JSON.parse(readFileSync(new URL('../../../seating/examples/rounds-room.json', import.meta.url), 'utf8'));
  const result = planRounds(request);
  const geometry = roomGeometry(result, request.guests);
  const encoded = readFileSync(new URL('../../../assets/cards/seating-motion.json', import.meta.url), 'utf8');
  assert.ok(encoded.length < 1_000_000, 'the lazy-loaded preview data should remain under 1 MB');
  const plan = JSON.parse(encoded);
  assert.equal(plan.guests.length, 300);
  assert.equal(plan.tables.length, 50);
  assert.deepEqual(plan.rounds, geometry.rounds, 'preview endpoints must match the actual planner, without seat rotation');
  // JSON normalizes signed zero while preserving every finite objective value.
  assert.deepEqual(plan.provenance.objective, JSON.parse(JSON.stringify(result.objective)));
  for (const [leg, encodedPath] of plan.transitions.entries()) {
    const decoded = decodeRoutes(encodedPath, plan.guests.length, plan.samples, plan.coordinateScale);
    const paths = plan.guests.map((/** @type {{id:string}} */ guest, /** @type {number} */ i) => Array.from({ length: plan.samples }, (_, frame) => {
      const offset = (i * plan.samples + frame) * 2;
      return /** @type {import('../seating-swarm.mjs').Point} */ ([decoded[offset], decoded[offset + 1]]);
    }));
    for (const [i, guest] of plan.guests.entries()) {
      assert.deepEqual(paths[i][0], plan.rounds[leg][i]);
      assert.deepEqual(paths[i].at(-1), plan.rounds[leg + 1][i]);
      if (guest.fixed || JSON.stringify(plan.rounds[leg][i]) === JSON.stringify(plan.rounds[leg + 1][i])) assert.ok(paths[i].every((/** @type {number[]} */ p) => p[0] === paths[i][0][0] && p[1] === paths[i][0][1]), `${guest.id} keeps the exact seat`);
    }
    const clearance = validateSwarm(paths, { radius: plan.radius + .2, width: plan.width, height: plan.height, obstacles: geometry.obstacles.map(o => ({ ...o, radius: o.radius + .25 })) });
    assert.ok(clearance.guestGap > .2 && clearance.tableGap > .2);
    assert.ok(clearance.maxStep < 10, 'interpolated steps must remain small relative to the room');
    const active = Array.from({ length: plan.samples - 1 }, (_, frame) => paths.filter((/** @type {number[][]} */ path) => Math.hypot(path[frame + 1][0] - path[frame][0], path[frame + 1][1] - path[frame][1]) > .01).length);
    assert.ok(Math.max(...active) > 150, 'many real guests should move together, not one pair at a time');
  }
});


test('compact route data preserves signed motion and waiting, and rejects truncation', () => {
  const paths = /** @type {import('../seating-swarm.mjs').Point[][]} */ ([[[2, 4], [2, 4], [2, 4], [.01, 7.35], [10.03, 2.01]]]);
  const encoded = encodeRoutes(paths);
  assert.deepEqual([...decodeRoutes(encoded, 1, 5, 100)], paths[0].flat());
  assert.throws(() => decodeRoutes(encoded.slice(0, -4), 1, 5, 100), /Truncated/);
});


test('the labelled close and four-table views reveal exactly those table circles', () => {
  const plan = JSON.parse(readFileSync(new URL('../../../assets/cards/seating-motion.json', import.meta.url), 'utf8'));
  for (const [time, count, label] of /** @type {[number,number,string][]} */ ([[.5, 1, '1 table'], [7.4, 4, '4 tables'], [15, 50, '50 tables']])) {
    const { camera, view } = frameAt(plan, time);
    const halfWidth = plan.width / (2 * camera.scale), halfHeight = camera.height / (2 * camera.scale);
    const visible = plan.tables.filter((/** @type {number[]} */ [x, y, radius]) => {
      const dx = Math.max(0, Math.abs(x - camera.x) - halfWidth), dy = Math.max(0, Math.abs(y - camera.y) - halfHeight);
      return Math.hypot(dx, dy) <= radius + .25;
    });
    assert.equal(view, label);
    assert.equal(visible.length, count);
  }
});
