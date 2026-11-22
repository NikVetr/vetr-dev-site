import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRoutine, submit } from '../core/plan.js';
import { equipment, locations, moves, sources, targets } from '../core/catalog.js';

const byId = new Map(moves.map(move => [move.id, move]));
const open = {location: 'open-area', discretion: 'any', allowFloor: true, equipment: Object.keys(equipment)};
const quiet = {location: 'plane-seat', discretion: 'quiet'};
const rejects = (req, path) => assert.throws(() => submit(req), e =>
  e instanceof Error && 'code' in e && e.code === 'invalid_request' &&
      'issues' in e && Array.isArray(e.issues) && e.issues[0]?.path === path);

test('every variant has a distinct ID, valid equipment and targets, a technique cue and named source', () => {
  assert.equal(byId.size, moves.length);
  for (const move of moves) {
    assert.ok(move.caution && move.cue && move.evidence);
    assert.ok(move.sourceIds.length && move.sourceIds.every(id => sources[id].url.startsWith('https://')));
    assert.ok(move.targets.length && move.targets.every(id => Object.hasOwn(targets, id)));
    assert.ok(move.equipment.every(id => Object.hasOwn(equipment, id)));
  }
});

test('a quiet middle-seat plan is deterministic, local, under budget, and covers distinct requests', () => {
  const req = {...quiet, seconds: 90, targets: ['shoulders', 'calves', 'neck']};
  const result = submit(req);
  assert.deepEqual(result, submit(req));
  assert.equal(result.totalSeconds, 90);
  assert.deepEqual(result.unmetTargets, []);
  assert.deepEqual(result.alternatives, []);
  assert.ok(result.steps.every(s => byId.get(s.id).pose === 'seated' && byId.get(s.id).discretion === 'quiet'));
  assert.ok(!result.eligibleIds.includes('seated-chest-open'));
  assert.ok(!result.eligibleIds.includes('seated-knee-extend'));
});

test('favorites never defeat an exclusion, discomfort, unavailable equipment, or selected location', () => {
  const req = {...quiet, targets: ['calves'], seconds: 30, avoidIds: ['seated-heel-lift'],
    favoriteIds: ['standing-step-up', 'seated-heel-lift', 'seated-toe-lift', 'seated-towel-grip']};
  const result = submit({...req, feedback: {'seated-toe-lift': 'uncomfortable'}});
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.unmetTargets, ['calves']);
  assert.deepEqual(result.unmetFavorites, req.favoriteIds);
});

test('physical constraints survive a custom edit and apply in suggested locations too', () => {
  const prefs = {...open, limitations: ['stay-seated', 'no-leg-movement', 'back-support'], availableLocations: ['roomy-seat']};
  const result = submit(prefs);
  assert.deepEqual(result.steps, []);
  assert.ok(result.alternatives.length);
  for (const id of result.alternatives[0].additionalIds) {
    const move = byId.get(id);
    assert.equal(move.pose, 'seated');
    assert.ok(!move.uses.includes('legs') && !move.uses.includes('unsupported-back'));
  }
  rejects({...prefs, steps: [{id: 'standing-step-up', seconds: 20}]}, 'steps[0].id');
  assert.deepEqual(submit({...open, limitations: ['poor-balance']}).eligibleIds, []);
  assert.deepEqual(submit({...open, limitations: ['stay-seated', 'stay-standing']}).eligibleIds, []);
});

test('only explicitly available locations on the route can add suggestions', () => {
  const request = {...quiet, discretion: 'any', targets: ['lower-back']};
  const here = submit(request);
  const other = submit({...request, availableLocations: ['open-area', 'plane-lavatory', 'train-seat']});
  assert.deepEqual(other.steps, here.steps);
  assert.deepEqual(other.alternatives.map(o => o.location), ['plane-lavatory']);
  assert.deepEqual(other.alternatives[0].additionalIds, ['standing-side-bend']);
  assert.deepEqual(submit({...request, limitations: ['stay-seated'], availableLocations: ['plane-lavatory']}).alternatives, []);
  assert.deepEqual(submit({...quiet, targets: ['neck'], availableLocations: ['plane-lavatory']}).alternatives, []);
  assert.deepEqual(submit({...quiet, targets: ['neck'], favoriteIds: ['standing-neck-turn'],
    availableLocations: ['plane-lavatory']}).alternatives[0].additionalIds, ['standing-neck-turn']);
});

test('direct clearance measurements, reach, and height affect fit and never travel to another location', () => {
  const req = {location: 'roomy-seat', discretion: 'any', forwardCm: 48, sideCm: 50};
  assert.ok(submit(req).eligibleIds.includes('seated-knee-extend'));
  assert.ok(!submit({...req, heightCm: 190}).eligibleIds.includes('seated-knee-extend'));
  assert.ok(submit(req).eligibleIds.includes('seated-chest-open'));
  assert.ok(!submit({...req, armspanCm: 180}).eligibleIds.includes('seated-chest-open'));
  const inSeat = submit({...quiet, discretion: 'any', sideCm: 0, availableLocations: ['plane-lavatory']});
  assert.ok(inSeat.alternatives[0].additionalIds.includes('standing-side-bend'));
});

test('floor access is opt-in and compatible with the current location, preference and mobility rules', () => {
  const floor = m => byId.get(m).pose === 'supine';
  assert.ok(submit(open).eligibleIds.some(floor));
  for (const request of [{...open, allowFloor: false}, {...open, limitations: ['no-floor']}, {...open, limitations: ['stay-standing']}, {...open, location: 'stall'}]) {
    assert.ok(!submit(request).eligibleIds.some(floor));
  }
  assert.ok(!submit({...open, limitations: ['no-overhead'], location: 'roomy-seat'}).eligibleIds.includes('seated-overhead-reach'));
});

test('equipment and discretion are independent conditions, including a step AND a rail', () => {
  const id = 'standing-step-up';
  assert.ok(submit(open).eligibleIds.includes(id));
  for (const request of [{...open, equipment: ['step']}, {...open, equipment: ['support']}, {...open, discretion: 'moderate'},
    {...open, location: 'plane-lavatory'}, {...open, limitations: ['limited-grip']}]) {
    assert.ok(!submit(request).eligibleIds.includes(id));
  }
});

test('explicit choices outrank learned preferences, and recent feedback can change the next plan', () => {
  const base = {...quiet, seconds: 20, targets: ['hands']};
  const initial = submit(base).steps[0].id;
  const preferred = 'seated-wrist-bend';
  assert.notEqual(initial, preferred);
  assert.equal(submit({...base, feedback: {[preferred]: 'helped'}}).steps[0].id, preferred);
  assert.equal(submit({...base, favoriteIds: [preferred], feedback: {[preferred]: 'poor-fit'}}).steps[0].id, preferred);
  assert.notEqual(submit({...base, feedback: {[initial]: 'poor-fit'}}).steps[0].id, initial);
});

test('edits keep order, target repetitions and the time allowance for a floor transfer', () => {
  const steps = [{id: 'standing-shoulder-roll', seconds: 15, reps: 3}, {id: 'supine-pelvic-tilt', seconds: 25}];
  const result = submit({...open, seconds: 40, steps});
  assert.deepEqual(result.steps, steps);
  assert.deepEqual(result.transitionSeconds, [0, 15]);
  assert.equal(result.totalSeconds, 40);
  rejects({...open, seconds: 39, steps}, 'steps');
  rejects({...open, steps: [steps[0], {...steps[1], seconds: 15}]}, 'steps[1].seconds');
  rejects({...open, steps: [{...steps[0], reps: 0}]}, 'steps[0].reps');
});

test('invalid public requests fail with structured errors', () => {
  for (const [req, path] of [[null, '$'], [{extra: 1}, 'extra'], [{seconds: null}, 'seconds'],
    [{location: 'constructor'}, 'location'], [{targets: 'neck'}, 'targets'], [{targets: ['neck','neck']}, 'targets'],
    [{allowFloor: 'y'}, 'allowFloor'], [{steps: [{id: 'fake', seconds: 30}]}, 'steps[0].id'],
    [{feedback: {'wat': 'helped'}}, 'feedback.wat'], [{feedback: {'seated-neck-turn': 'fine'}}, 'feedback.seated-neck-turn']]) {
    rejects(req, path);
  }
});

test('all locations and time boundaries generate replayable routines honoring the offered time', () => {
  for (const location of Object.keys(locations)) {
    for (const seconds of [15, 23, 24, 49, 87, 120, 337, 900]) {
      const req = {...open, location, seconds};
      const result = submit(req);
      assert.ok(result.totalSeconds <= seconds);
      assert.ok(result.steps.every(s => result.eligibleIds.includes(s.id)));
      assert.deepEqual(submit({...req, steps: result.steps}), result);
    }
  }
});

test('saved routine review reports hard exclusions, missing movements, transfers and time separately', () => {
  const req = {...open, seconds: 45, avoidIds: ['standing-shoulder-roll'], feedback: {'standing-shoulder-roll': 'uncomfortable'},
    steps: [{id: 'standing-shoulder-roll', seconds: 25, reps: 3}, {id: 'supine-pelvic-tilt', seconds: 10},
      {id: 'retired-movement', seconds: 30}]};
  const report = reviewRoutine(req);
  assert.equal(report.overBudgetSeconds, 20);
  assert.equal(report.rows[0].reps, 3);
  assert.match(report.rows[0].issues.join(' '), /Leave out.*uncomfortable/);
  assert.equal(report.rows[1].needsTransferTime, true);
  assert.match(report.rows[2].issues[0], /no longer/);
  assert.equal(report.fits, false);
  assert.deepEqual(report.eligibleIds, submit({...req, steps: []}).eligibleIds);
  for (const id of ['standing-shoulder-roll', 'retired-movement']) assert.ok(!report.eligibleIds.includes(id));
  const revised = {...req, steps: [{id: 'standing-hand-open', seconds: 25, reps: 3}, {id: 'supine-pelvic-tilt', seconds: 20}]};
  assert.equal(reviewRoutine(revised).fits, true);
  assert.deepEqual(submit(revised).steps, revised.steps);
});
