import test from 'node:test';
import assert from 'node:assert/strict';
import { seatingScene } from '../cards/seating.mjs';
import { closestApproach, validateSwarm } from '../seating-swarm.mjs';

test('continuous clearance detects a crossing even when all frame endpoints are apart', () => {
  const crossing = closestApproach([-10, 0], [10, 0], [0, -10], [0, 10]);
  assert.equal(crossing.time, 0.5);
  assert.equal(crossing.distance, 0);
  const parallel = closestApproach([0, 0], [20, 0], [0, 5], [20, 5]);
  assert.equal(parallel.distance, 5);
});

test('all 39 guests move between actual assignments without touching guests, tables or canvas edges', async () => {
  const scene = await seatingScene();
  assert.equal(scene.guests.length, 39);
  assert.equal(new Set(scene.guests).size, 39);
  for (const [i, guest] of scene.guests.entries()) {
    const start = /** @type {number[]} */ (scene.startSeats.get(guest));
    const end = /** @type {number[]} */ (scene.endSeats.get(guest));
    assert.equal(scene.tables[start[0]].seats[start[1]], guest);
    // Seat rotation is presentation only: original and final table memberships are exact.
    assert.ok(scene.initial[end[0]].includes(guest));
    const path = scene.paths[i];
    assert.deepEqual(path[0], scene.starts[i]);
    const middle = path[Math.floor(path.length / 2)];
    assert.ok(Math.hypot(middle[0] - path[0][0], middle[1] - path[0][1]) > 1, `${guest} should join the swarm`);
    const last = path[path.length - 1];
    assert.ok(Math.hypot(last[0] - scene.ends[i][0], last[1] - scene.ends[i][1]) < 0.02);
  }
  const { guestGap, tableGap, maxStep } = validateSwarm(scene.paths, {
    radius: scene.radius + .35, width: 200, height: 300,
    obstacles: scene.obstacles.map(o => ({ ...o, radius: o.radius + .5 })),
  });
  assert.ok(guestGap > .2);
  assert.ok(tableGap > .2);
  assert.ok(maxStep < 10, 'routes should not jump across the room');
});
