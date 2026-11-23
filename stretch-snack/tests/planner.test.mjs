import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easierVariant, placeOptions, reviewRoutine, submit, transferSeconds } from '../core/plan.js';
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
  assert.deepEqual(result.segments, [{location: 'plane-seat', steps: [0, 1, 2]}]);
  assert.equal(result.returnToLocation, null);
  assert.ok(result.steps.every(s => byId.get(s.id).pose === 'seated' && byId.get(s.id).discretion === 'quiet'));
  assert.ok(!result.eligibleIds.includes('seated-chest-open'));
  assert.ok(!result.eligibleIds.includes('seated-knee-extend'));
});

test('favorites never defeat an exclusion, discomfort, unavailable equipment, or selected location', () => {
  const req = {...quiet, targets: ['calves'], seconds: 30, avoidIds: ['seated-heel-lift'],
    favoriteIds: ['standing-step-up', 'seated-heel-lift', 'seated-toe-lift', 'seated-towel-grip']};
  const feedback = {'seated-toe-lift': 'uncomfortable'};
  const fallback = submit({...req, feedback});
  assert.deepEqual(fallback.steps, [{id: 'seated-ankle-circle', seconds: 30, location: quiet.location}]);
  assert.deepEqual(fallback.unmetFavorites, req.favoriteIds);
  const result = submit({...req, feedback, avoidIds: [...req.avoidIds, ...fallback.eligibleIds.filter(id => byId.get(id).targets.includes('calves'))]});
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.unmetTargets, ['calves']);
  assert.deepEqual(result.unmetFavorites, req.favoriteIds);
});

test('physical constraints survive a custom edit and apply in suggested locations too', () => {
  const prefs = {...open, limitations: ['stay-seated', 'no-leg-movement', 'back-support'], availableLocations: ['roomy-seat']};
  const result = submit(prefs);
  assert.ok(result.steps.length && result.steps.every(step => step.location === 'roomy-seat'));
  assert.ok(result.eligibleIds.length);
  for (const id of result.eligibleIds) {
    assert.deepEqual(result.eligibleLocations[id], ['roomy-seat']);
    const move = byId.get(id);
    assert.equal(move.pose, 'seated');
    assert.ok(!move.uses.includes('legs') && !move.uses.includes('unsupported-back'));
  }
  rejects({...prefs, steps: [{id: 'standing-step-up', seconds: 20}]}, 'steps[0].id');
  assert.deepEqual(submit({...open, limitations: ['poor-balance']}).eligibleIds, []);
  assert.deepEqual(submit({...open, limitations: ['stay-seated', 'stay-standing']}).eligibleIds, []);
});

test('a trip adds a requested target only when easier places cannot provide it', () => {
  const req = {...quiet, discretion: 'any', availableLocations: ['open-area', 'plane-lavatory', 'train-seat'], targets: ['lower-back']};
  const local = submit(req);
  assert.deepEqual(local.places, [{location: 'plane-seat', rank: 0, visitSeconds: 0}, {location: 'plane-lavatory', rank: 2, visitSeconds: 60}]);
  assert.ok(local.steps.every(step => step.location === 'plane-seat'));
  const away = {...req, avoidIds: moves.filter(m => m.targets.includes('lower-back') && m.id !== 'standing-side-bend').map(m => m.id)};
  const result = submit(away);
  assert.deepEqual(result.steps, [{id: 'standing-side-bend', location: 'plane-lavatory', seconds: 105}]);
  assert.deepEqual(result.transitionSeconds, [60]);
  assert.deepEqual(result.unmetTargets, []);
  assert.equal(result.returnToLocation, 'plane-seat');
  for (const blocked of [{...away, seconds: 64}, {...away, limitations: ['back-support']}, {...away, availableLocations: []}]) {
    assert.deepEqual(submit(blocked).unmetTargets, ['lower-back']);
    assert.deepEqual(submit(blocked).segments, []);
  }
  assert.equal(submit({...away, seconds: 65}).steps[0].seconds, 65);
});

test('a named movement can justify a single visit; equivalent seated motions avoid it', () => {
  const req = {...quiet, availableLocations: ['plane-lavatory'], targets: ['calves'],
    equipmentByLocation: {'plane-lavatory': ['support']}};
  const here = submit(req);
  assert.ok(here.steps.length && here.steps.every(step => step.location === 'plane-seat'));
  assert.deepEqual(here.unmetFavorites, []);
  assert.deepEqual(easierVariant(here, 'standing-toe-lift', 'plane-lavatory'), {id: 'seated-toe-lift', location: 'plane-seat'});
  assert.equal(easierVariant(here, 'seated-toe-lift', 'plane-seat'), null);
  const named = submit({...req, favoriteIds: ['standing-toe-lift']});
  assert.deepEqual(named.unmetFavorites, []);
  assert.ok(named.steps.some(step => step.id === 'standing-toe-lift' && step.location === 'plane-lavatory'));
  const noSeatedVariant = submit({...req, favoriteIds: ['standing-toe-lift'], avoidIds: ['seated-toe-lift']});
  assert.deepEqual(noSeatedVariant.unmetFavorites, []);
  assert.ok(noSeatedVariant.steps.some(step => step.id === 'standing-toe-lift' && step.location === 'plane-lavatory'));
  assert.equal(easierVariant(noSeatedVariant, 'standing-toe-lift', 'plane-lavatory'), null);
});

test('plan visits each selected place once in effort order and accounts for all travel', () => {
  const req = {location: 'train-seat', availableLocations: ['stall','roomy-seat'], discretion: 'any',
    favoriteIds: ['seated-chest-open','standing-side-bend'], targets: ['neck'], seconds: 220};
  const result = submit(req);
  assert.deepEqual(result, submit({...req, availableLocations: ['roomy-seat', 'stall']}));
  assert.deepEqual(result, submit({...req, steps: result.steps}));
  assert.deepEqual(result.segments.map(segment => segment.location), ['train-seat','roomy-seat','stall']);
  assert.deepEqual(result.segments.flatMap(segment => segment.steps), result.steps.map((_,i) => i));
  assert.deepEqual(result.transitionSeconds.filter(Boolean), [30,60]);
  assert.equal(result.totalSeconds, 220);
  assert.ok(result.steps.every((step,i) => step.seconds >= result.transitionSeconds[i] + 5));
  assert.deepEqual(result.unmetFavorites, []);
  assert.deepEqual(easierVariant(result, 'seated-neck-turn', 'roomy-seat'), {id: 'seated-neck-turn', location: 'train-seat'});
});

test('a mixed request can visit the nearest feasible site when the current site offers no movement', () => {
  const req = {...quiet, availableLocations: ['plane-lavatory'], limitations: ['stay-standing']};
  const result = submit(req);
  assert.deepEqual(result.segments.map(segment => segment.location), ['plane-lavatory']);
  assert.equal(result.transitionSeconds[0], 60);
  assert.equal(result.returnToLocation, 'plane-seat');
  assert.deepEqual(submit({...req, seconds: 64}).steps, []);
});

test('long transfers between remote places leave replayable steps even with ample time', () => {
  const req = {location:'stall', availableLocations:['train-seat','open-area'], allowFloor:true, discretion:'any',
    targets:['lower-back'], favoriteIds:['seated-heel-lift','supine-pelvic-tilt'], seconds:900,
    avoidIds:moves.filter(m => m.targets.includes('lower-back') && m.id !== 'supine-pelvic-tilt').map(m => m.id)};
  const result = submit(req);
  assert.deepEqual(result.segments.map(segment => segment.location), ['train-seat','open-area']);
  assert.deepEqual(result.transitionSeconds, [30,135]);
  assert.equal(result.steps[1].seconds,180);
  assert.deepEqual(submit({...req, steps: result.steps}), result);
});

test('custom and saved plans preserve chosen places, review their fit and reject infeasible transfers', () => {
  const req = {...quiet, seconds: 150, availableLocations: ['plane-lavatory']};
  const here = {id: 'seated-toe-lift', location: 'plane-seat', seconds: 20};
  const away = {id: 'standing-neck-turn', location: 'plane-lavatory', seconds: 65};
  const plan = submit({...req, steps: [here, away]});
  assert.deepEqual(plan.steps, [here,away]);
  assert.deepEqual(plan.transitionSeconds, [0,60]);
  const report = reviewRoutine({...req, steps: [here, {...away,seconds:60}]});
  assert.equal(report.rows[1].transitionSeconds, 60);
  assert.equal(report.rows[1].needsTransferTime, true);
  rejects({...req, steps: [here, {...away,seconds:60}]}, 'steps[1].seconds');
  rejects({...req, steps: [here, away, here]}, 'steps[2].location');
  rejects({...req, steps: [away, here]}, 'steps[1].location');
  const changed = reviewRoutine({...req, availableLocations: [], steps: [away]});
  assert.equal(changed.fits, false);
  assert.match(changed.rows[0].issues[0], /selected, reachable/);
  rejects({...req, availableLocations: [], steps: [away]}, 'steps[0].location');
  assert.deepEqual(submit({...req, steps: [{id: away.id, seconds: 70}]}).steps, [{...away, seconds: 70}]);
  assert.deepEqual(placeOptions('train-seat',['roomy-seat','open-area','stall']).map(p => p.location), ['train-seat','roomy-seat','stall']);
  assert.equal(transferSeconds('plane-seat','plane-lavatory','plane-seat','standing','seated'), 60);
  assert.equal(transferSeconds('stall','train-seat','open-area','seated','supine'), 135);
  assert.equal(transferSeconds('open-area','open-area','open-area','supine','standing'), 15);
});

test('direct clearance measurements, reach, and height affect fit and never travel to another location', () => {
  const req = {location: 'roomy-seat', discretion: 'any', forwardCm: 48, sideCm: 50};
  assert.ok(submit(req).eligibleIds.includes('seated-knee-extend'));
  assert.ok(!submit({...req, heightCm: 190}).eligibleIds.includes('seated-knee-extend'));
  assert.ok(submit(req).eligibleIds.includes('seated-chest-open'));
  assert.ok(!submit({...req, armspanCm: 180}).eligibleIds.includes('seated-chest-open'));
  const inSeat = submit({...quiet, discretion: 'any', sideCm: 0, availableLocations: ['plane-lavatory']});
  assert.deepEqual(inSeat.eligibleLocations['standing-side-bend'], ['plane-lavatory']);
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
  assert.deepEqual(result.steps, steps.map(step => ({...step, location: open.location})));
  assert.deepEqual(result.transitionSeconds, [0, 15]);
  assert.equal(result.totalSeconds, 40);
  rejects({...open, seconds: 39, steps}, 'steps');
  rejects({...open, steps: [steps[0], {...steps[1], seconds: 15}]}, 'steps[1].seconds');
  rejects({...open, steps: [{...steps[0], reps: 0}]}, 'steps[0].reps');
});

test('invalid public requests fail with structured errors', () => {
  for (const [req, path] of [[null, '$'], [{extra: 1}, 'extra'], [{seconds: null}, 'seconds'],
    [{location: 'constructor'}, 'location'], [{targets: 'neck'}, 'targets'], [{targets: ['neck','neck']}, 'targets'],
    [{allowFloor: 'y'}, 'allowFloor'], [{equipmentByLocation:null}, 'equipmentByLocation'],
    [{equipmentByLocation: {bogus: []}}, 'equipmentByLocation.bogus'],
    [{equipmentByLocation: {stall:['towel']}}, 'equipmentByLocation.stall[0]'], [{steps: [{id: 'fake', seconds: 30}]}, 'steps[0].id'],
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
  assert.deepEqual(submit(revised).steps, revised.steps.map(step => ({...step, location: open.location})));
});
