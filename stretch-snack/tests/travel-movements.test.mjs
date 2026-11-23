import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moves } from '../core/catalog.js';
import { reviewRoutine, submit } from '../core/plan.js';

// An ineligible favorite must also be rejected if imported as an explicit step.
function checkFit(id, request, expected) {
  const prefs = {...request, favoriteIds: [id], seconds: 30};
  const result = submit(prefs);
  assert.equal(result.eligibleIds.includes(id), expected, id + ' eligibility');
  assert.equal(result.steps.some(step => step.id === id), expected, id + ' planning');
  const edit = {...prefs, steps: [{id, seconds: 30}]};
  assert.equal(reviewRoutine(edit).fits, expected, id + ' saved routine review');
  if (expected) assert.deepEqual(submit(edit).steps, [{id, seconds:30, location:request.location}]);
  else assert.throws(() => submit(edit), /steps\[0\].id|Mobility setting|Needs|Equipment needed|discretion/);
}

test('discreet seat movements serve the requested region even with no equipment', () => {
  for (const [target, id] of [
    ['neck', 'seated-chin-tuck'], ['knees', 'seated-knee-squeeze'], ['knees', 'seated-foot-slide'],
    ['hips', 'seated-glute-squeeze'], ['calves', 'seated-ankle-circle'], ['lower-back', 'seated-pelvic-tilt'],
  ]) {
    const prefs = {location: 'plane-seat', targets: [target], discretion: 'quiet'};
    checkFit(id, prefs, true);
    assert.deepEqual(submit(prefs).unmetTargets, []);
  }
  assert.equal(moves.find(m => m.id === 'seated-pelvic-tilt').motion, 'seated-pelvic-tilt');
  assert.equal(moves.find(m => m.id === 'supine-pelvic-tilt').motion, 'pelvic-tilt');
});

test('the chair, ball, and ability to position it all matter for upper-back massage', () => {
  const req = {location: 'roomy-seat', equipment: ['ball', 'firm-back'], discretion: 'moderate'};
  const id = 'seated-ball-back';
  checkFit(id, req, true);
  for (const equipment of [['ball'], ['firm-back'], ['ball', 'support']]) checkFit(id, {...req, equipment}, false);
  for (const setting of ['back-support', 'no-arm-movement', 'limited-grip']) {
    checkFit(id, {...req, limitations: [setting]}, false);
  }
  for (const location of ['plane-seat', 'train-seat']) {
    checkFit(id, {...req, location, discretion: 'quiet', limitations: ['no-leg-movement', 'poor-balance']}, true);
  }
  const otherChair = submit({...req, location: 'stall', availableLocations: ['roomy-seat'], favoriteIds: [id]});
  assert.ok(!otherChair.eligibleIds.includes(id));
  const confirmed = submit({...req, location: 'stall', availableLocations: ['roomy-seat'], equipmentByLocation: {'roomy-seat': ['firm-back']}, favoriteIds: [id]});
  assert.deepEqual(confirmed.eligibleLocations[id], ['roomy-seat']);
  assert.deepEqual(confirmed.unmetFavorites, []);
});

test('rail-supported weight shifts and heel-planted toe lifts have distinct balance demands', () => {
  const req = {location: 'open-area', equipment: ['support']};
  for (const id of ['standing-weight-shift', 'standing-toe-lift']) {
    checkFit(id, req, true);
    checkFit(id, {...req, equipment: []}, false);
    for (const setting of ['limited-grip', 'no-arm-movement', 'poor-balance']) {
      checkFit(id, {...req, limitations: [setting]}, false);
    }
  }
  checkFit('standing-weight-shift', {...req, location: 'plane-lavatory'}, true);
  checkFit('standing-weight-shift', {...req, sideCm: 4, heightCm: 195}, false);
  checkFit('standing-toe-lift', {...req, location: 'plane-lavatory'}, true);
  checkFit('standing-toe-lift', {location: 'plane-lavatory', equipment: []}, false);
  assert.ok(!submit({...req, location: 'plane-seat', availableLocations: ['plane-lavatory']}).eligibleIds.includes('standing-toe-lift'));
  checkFit('seated-toe-lift', {location: 'plane-seat', limitations: ['limited-grip', 'poor-balance']}, true);
  checkFit('standing-back-arch', {...req, discretion: 'moderate', limitations: ['no-arm-movement']}, false);
});

test('leg extensions need clearance; contractions and the hamstring hinge respect mobility settings', () => {
  const chair = {location: 'roomy-seat', discretion: 'moderate', forwardCm: 48};
  for (const id of ['seated-hamstring-lean', 'seated-quad-set']) {
    checkFit(id, chair, true);
    checkFit(id, {...chair, forwardCm: 45}, false);
    checkFit(id, {...chair, heightCm: 195}, false);
  }
  checkFit('seated-hamstring-lean', {...chair, limitations: ['back-support']}, false);
  assert.ok(!moves.find(m => m.id === 'seated-hamstring-lean').targets.includes('lower-back'));
  for (const id of ['seated-knee-squeeze', 'seated-glute-squeeze', 'seated-quad-set']) {
    checkFit(id, {...chair, limitations: ['no-leg-movement']}, false);
  }
  checkFit('seated-pelvic-tilt', {...chair, limitations: ['back-support']}, false);
  const middleSeat = {location: 'plane-seat', sideCm: 0, limitations: ['no-overhead']};
  for (const id of ['seated-self-hug','seated-palm-forward']) {
    checkFit(id, middleSeat, true);
    checkFit(id, {...middleSeat, limitations: ['no-arm-movement']}, false);
  }
});

test('a seated starting position, a nearby support and a towel each affect eligibility', () => {
  const chair = {location:'roomy-seat', discretion:'any'};
  checkFit('seated-sit-to-stand', chair, true);
  for (const limitation of ['stay-seated', 'poor-balance', 'back-support'])
    checkFit('seated-sit-to-stand', {...chair, limitations:[limitation]}, false);
  const floor = {location:'open-area', allowFloor:true, discretion:'any'};
  checkFit('supine-head-nod', floor, false);
  checkFit('supine-head-nod', {...floor, equipment:['towel']}, true);
  checkFit('standing-heel-walk', floor, false);
  checkFit('standing-heel-walk', {...floor, equipment:['support']}, true);
});

test('two-foot movements can use an unassisted stance on land and a confirmed rail in transit', () => {
  for (const id of ['standing-toe-curl','standing-pelvic-tilt']) {
    const transit = {location:'plane-lavatory', discretion:'any'};
    checkFit(id, {location:'open-area', discretion:'any'}, true);
    checkFit(id, transit, false);
    checkFit(id, {...transit, equipment:['support']}, true);
    checkFit(id, {...transit, equipment:['support'], limitations:['limited-grip']}, false);
  }
});
