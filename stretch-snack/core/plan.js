import { checkRequestKeys, invalidRequest } from '../../shared/request.js';
import {isFloor} from "./library/constraints.js";
import { programs, intensityLevels, equipment, fixedEquipment, limitations, locations, moves, reachableLocations, targets } from './catalog.js';

/** @typedef {(typeof moves)[number]} Movement */
/** @typedef {ReturnType<typeof normalize>} Preferences */
/** @type {Record<string, Movement>} */
const byId = Object.fromEntries(moves.map(move => [move.id, move]));
const movementIds = moves.map(move => move.id);
const visibility = ['quiet', 'moderate', 'any'];
export const postureChangeSeconds = 15;

// Approximate clearance beyond the knees and each shoulder, in centimeters.
// A measured clearance replaces the preset for the current location only.
/** @type {Record<string, {seated: boolean, stationary: boolean, forward: number, side: number}>} */
const spaces = {
  'plane-seat':     {seated: true,  stationary: false, forward: 12, side: 1},
  'train-seat':     {seated: true,  stationary: false, forward: 22, side: 6},
  'roomy-seat':     {seated: true,  stationary: true,  forward: 85, side: 80},
  'plane-lavatory': {seated: false, stationary: false, forward: 16, side: 10},
  stall:            {seated: false, stationary: false, forward: 30, side: 18},
  'open-area':      {seated: false, stationary: true,  forward: 250, side: 180},
};

/** @param {string} current @param {string} location */
function placeRank(current, location) {
  return location === current ? 0 : spaces[location].seated ? 1 : location === 'open-area' ? 3 : 2;
}

/** @param {keyof typeof locations} current @param {string[]} available */
export function placeOptions(current, available) {
  return [current, ...reachableLocations[current].filter(location => available.includes(location))]
    .map(location => {
      const rank = placeRank(current, location);
      return {location, rank, visitSeconds: 30 * rank};
    }).sort((a, b) => a.rank - b.rank);
}

/** Estimate time from an actual origin, including manual navigation in either direction.
 * @param {string} current @param {string} from @param {string} to @param {string} [fromPose] @param {string} [toPose] */
export function transferSeconds(current, from, to, fromPose, toPose) {
  if (from === to) return fromPose && toPose && fromPose !== toPose ? postureChangeSeconds : 0;
  const fromCost = 30 * placeRank(current, from);
  const toCost = 30 * placeRank(current, to);
  // Two choices reachable from our starting place may require going back through it.
  const direct = reachableLocations[/** @type {keyof typeof locations} */ (from)].includes(to);
  const travel = direct ? Math.max(fromCost, toCost) : fromCost + toCost;
  return travel + postureChangeSeconds * (Number(isFloor(fromPose)) + Number(isFloor(toPose)));
}

/** @param {unknown} value @param {string[]} choices @param {string} path */
function option(value, choices, path) {
  if (typeof value !== 'string' || !choices.includes(value)) throw invalidRequest(path, 'Choose one of: ' + choices.join(', ') + '.');
  return value;
}

/** @param {unknown} value @param {string[]} allowed @param {string} path @returns {string[]} */
function choices(value, allowed, path) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalidRequest(path, 'Expected a list of IDs.');
  const result = value.map((id, i) => option(id, allowed, path + '[' + i + ']'));
  if (new Set(result).size !== result.length) throw invalidRequest(path, 'Each selection must be unique.');
  return result;
}

/** @param {unknown} value @param {number} min @param {number} max @param {string} path */
function numberInRange(value, min, max, path, whole = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (whole && !Number.isInteger(value))) {
    throw invalidRequest(path, 'Expected ' + (whole ? 'a whole number' : 'a number') + ' between ' + min + ' and ' + max + '.');
  }
  return value;
}

/** @param {Record<string, any>} request */
function normalize(request) {
  checkRequestKeys(request, [
    'location', 'seconds', 'intensity', 'style', 'programId', 'targets', 'limitations', 'equipment', 'discretion', 'avoidIds', 'favoriteIds',
    'feedback', 'heightCm', 'armspanCm', 'forwardCm', 'sideCm', 'allowFloor', 'availableLocations', 'equipmentByLocation', 'steps',
  ]);
  const {
    location = 'plane-seat', seconds = 120, intensity = 'gentle', style = 'any', discretion = 'quiet', feedback = {}, allowFloor = false,
    heightCm = 170, armspanCm = 170, forwardCm, sideCm,
  } = request;
  option(location, Object.keys(locations), 'location');
  option(discretion, visibility, 'discretion');
  numberInRange(seconds, 15, 7200, 'seconds', true);
  option(intensity, intensityLevels, 'intensity');
  option(style, ['any','yoga','mobility'], 'style');
  if (request.programId !== undefined) {
    option(request.programId, programs.map(p=>p.id), 'programId');
    if (request.steps !== undefined) throw invalidRequest('steps','Supply a program or explicit steps.');
  }
  numberInRange(heightCm, 50, 280, 'heightCm');
  numberInRange(armspanCm, 40, 300, 'armspanCm');
  if (forwardCm !== undefined) numberInRange(forwardCm, 0, 1000, 'forwardCm');
  if (sideCm !== undefined) numberInRange(sideCm, 0, 1000, 'sideCm');
  if (typeof allowFloor !== 'boolean') throw invalidRequest('allowFloor', 'Expected true or false.');
  if (feedback === null || typeof feedback !== 'object' || Array.isArray(feedback)) {
    throw invalidRequest('feedback', 'Expected movement IDs mapped to feedback.');
  }
  for (const [id, rating] of Object.entries(feedback)) {
    option(id, movementIds, 'feedback.' + id);
    option(rating, ['helped', 'uncomfortable', 'poor-fit'], 'feedback.' + id);
  }
  const settings = request.equipmentByLocation === undefined ? {} : request.equipmentByLocation;
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    throw invalidRequest('equipmentByLocation', 'Expected fixed equipment mapped by place.');
  }
  /** @type {Record<string,string[]>} */
  const equipmentByLocation = {};
  for (const [place, fixtures] of Object.entries(settings)) {
    const path = 'equipmentByLocation.' + place;
    option(place, Object.keys(locations), path);
    equipmentByLocation[place] = choices(fixtures, fixedEquipment, path);
  }
  return {
    location: /** @type {keyof typeof locations} */ (location), seconds, discretion, intensity, style, feedback, heightCm, armspanCm, forwardCm, sideCm, allowFloor,
    limitations: choices(request.limitations, Object.keys(limitations), 'limitations'),
    targets: choices(request.targets, Object.keys(targets), 'targets'),
    equipment: choices(request.equipment, Object.keys(equipment), 'equipment'),
    equipmentByLocation,
    avoidIds: choices(request.avoidIds, movementIds, 'avoidIds'),
    favoriteIds: choices(request.favoriteIds, movementIds, 'favoriteIds'),
    availableLocations: choices(request.availableLocations, Object.keys(locations), 'availableLocations'),
  };
}

/** @type {Record<string, string>} */
const conflicts = {
  'back-support': 'unsupported-back', 'no-twisting': 'twist', 'limited-grip': 'grip',
  'stay-seated': 'stand-up', 'no-leg-movement': 'legs', 'no-arm-movement': 'arms', 'poor-balance': 'balance',
};

/** Some two-foot standing exercises need a handhold only on a moving floor.
 * @template {{uses?:string[],equipment?:string[],motion?:string}} T @param {T} move @param {string} [location] @param {any} [prefs] */
export function movementAtLocation(move, location, prefs) {
  if (move.motion === 'hamstring-step' && prefs)
    return {...move, raisedSupport:fixtureAvailable(prefs, location, 'step') ? 'step' : 'chair'};
  if (!move.uses?.includes('moving-handhold') || move.equipment?.includes('support') || !spaces[location] || spaces[location].stationary) return move;
  return {...move, equipment:[...(move.equipment ?? []), 'support'], uses:[...move.uses, 'arms','grip']};
}

// A bed can support gentle lying and long-sitting work. Equipment-supported rolls,
// inversions and weight-bearing drills require the floor.
const bedPostures = ['supine','prone','side-lying','long-sitting'];
function fixtureAvailable(prefs, location, key) {
  return prefs.equipmentByLocation?.[location]?.includes(key) || (location === prefs.location && prefs.equipment?.includes(key));
}
export function usesBed(move, prefs, location) {
  return location === 'open-area' && fixtureAvailable(prefs,location,'bed') && bedPostures.includes(move.pose)
    && (move.equipment.includes('bed') || ((!prefs.allowFloor || prefs.limitations?.includes('no-floor'))
      && move.intensity === 'gentle' && !move.restrictions.includes('hands-loaded')
      && !move.equipment.some(k=>['wall','mat','roller','ball'].includes(k))));
}

/** @param {Movement} move @param {Preferences} prefs @param {string} location */
function fitIssues(move, prefs, location) {
  move = movementAtLocation(move, location);
  const issues = [];
  const space = spaces[location];
  if (prefs.avoidIds.includes(move.id)) issues.push('You marked this movement “Leave out”.');
  if (prefs.feedback[move.id] === 'uncomfortable') issues.push('You marked this movement uncomfortable.');
  if (intensityLevels.indexOf(move.intensity) > intensityLevels.indexOf(prefs.intensity))
    issues.push('Requires '+move.intensity+' intensity.');
  const floor = isFloor(move.pose) || move.uses.includes('floor-contact');
  const bed = usesBed(move,prefs,location);
  const blockedBy = prefs.limitations.filter(rule =>
    move.restrictions.includes(rule) ||
    (conflicts[rule] && move.uses.includes(conflicts[rule])) ||
    (move.pose !== 'seated' && ['stay-seated', 'back-support', 'no-leg-movement', 'poor-balance'].includes(rule)) ||
    (move.pose !== 'standing' && rule === 'stay-standing') ||
    (floor && !bed && rule === 'no-floor') ||
    (move.overhead && rule === 'no-overhead'));
  if (blockedBy.length) issues.push('Mobility setting · ' + blockedBy.map(rule => limitations[/** @type {keyof typeof limitations} */ (rule)]).join(', ') + '.');

  if ((move.pose === 'seated') !== space.seated && !(move.pose === 'seated' && location === 'open-area' && fixtureAvailable(prefs,location,'chair'))) {
    issues.push(move.pose === 'seated' ? 'Needs a seat.' : 'Needs space outside your seat.');
  }
  if (floor) {
    if (location !== 'open-area') issues.push('Needs an open, stationary space.');
    if (!prefs.allowFloor && !bed) issues.push('Floor use is off.');
  }
  if (move.stationary && !space.stationary) issues.push('Needs a stationary surface.');
  const missingEquipment = move.equipment.filter(key => fixedEquipment.includes(key)
    ? !prefs.equipmentByLocation[location]?.includes(key) && !(location === prefs.location && prefs.equipment.includes(key))
    : !prefs.equipment.includes(key));
  if (move.anyEquipment.length && !move.anyEquipment.some(key=>fixtureAvailable(prefs,location,key)))
    issues.push('Equipment needed · '+move.anyEquipment.map(key=>equipment[key]).join(' or ')+'.');
  if (missingEquipment.length) issues.push('Equipment needed · ' + missingEquipment.map(key => equipment[/** @type {keyof typeof equipment} */ (key)]).join(', ') + '.');
  if (visibility.indexOf(move.discretion) > visibility.indexOf(prefs.discretion)) issues.push('Exceeds your discretion setting.');

  const forward = location === prefs.location ? prefs.forwardCm ?? space.forward : space.forward;
  const side = location === prefs.location ? prefs.sideCm ?? space.side : space.side;
  // A leg extension or stride scales with height, an arm reach with span.
  const forwardScale = (move.uses.includes('legs') ? prefs.heightCm : prefs.armspanCm) / 170;
  const sideScale = (move.motion === 'hip-side' || move.motion === 'weight-shift' || floor ? prefs.heightCm : prefs.armspanCm) / 170;
  if (move.forward * forwardScale > forward) issues.push('Needs about ' + Math.ceil(move.forward * forwardScale) + ' cm ahead of your knees.');
  if (move.side * sideScale > side) issues.push('Needs about ' + Math.ceil(move.side * sideScale) + ' cm beside each shoulder.');
  return issues;
}

/** @param {Movement} move @param {Preferences} prefs */
function desired(move, prefs) {
  return (prefs.style === 'any' || move.tags.includes(prefs.style)) &&
    (!prefs.targets.length || move.targets.some(target => prefs.targets.includes(target)) || prefs.favoriteIds.includes(move.id));
}

/** @param {Movement} move @param {Preferences} prefs @param {Set<string>} seenTargets @param {Set<string>} seenMotions @param {string|undefined} lastPose */
function rank(move, prefs, seenTargets, seenMotions, lastPose) {
  const requested = move.targets.filter(target => prefs.targets.includes(target));
  const novel = requested.filter(target => !seenTargets.has(target)).length;
  const named = prefs.favoriteIds.includes(move.id);
  // Cover distinct requests first, then use feedback and vary the movements.
  return Number(named) * 100 + novel * 18 + Number(requested.length > 0) * 5
    + Number(!seenTargets.has(move.targets[0])) * 4 + Number(!seenMotions.has(move.motion)) * 3
    + Number(prefs.feedback[move.id] === 'helped') * 5 - Number(prefs.feedback[move.id] === 'poor-fit') * 9
    + Number(isFloor(move.pose) && prefs.equipment.includes('mat'))
    + Number(lastPose === move.pose) * 2;
}

/** @param {Preferences} prefs */
function availableMovements(prefs) {
  const places = placeOptions(prefs.location, prefs.availableLocations);
  /** @type {Record<string,string[]>} */
  const eligibleLocations = {};
  for (const move of moves) {
    const fits = places.filter(place => !fitIssues(move, prefs, place.location).length);
    if (fits.length) eligibleLocations[move.id] = fits.map(place => place.location);
  }
  return {places, eligibleLocations, eligibleIds: Object.keys(eligibleLocations)};
}

/** Return a same-motion option in a strictly easier selected place, preferring the same variant there.
 * @param {ReturnType<typeof availableMovements>} plan @param {string} id @param {string} location */
export function easierVariant(plan, id, location) {
  if (!Object.hasOwn(byId, id) || !Object.hasOwn(spaces, location)) return null;
  const rank = placeRank(plan.places[0].location, location);
  for (const place of plan.places) {
    if (place.rank >= rank) break;
    if (plan.eligibleLocations[id]?.includes(place.location)) return {id, location: place.location};
    const variant = moves.find(move => move.motion === byId[id].motion && move.targets.some(target => byId[id].targets.includes(target)) && plan.eligibleLocations[move.id]?.includes(place.location));
    if (variant) return {id: variant.id, location: place.location};
  }
  return null;
}

/** @typedef {{id:string, location:string}} PlacedMove */
/** @param {PlacedMove[]} steps @param {string} current */
export function transfersFor(steps, current) {
  return steps.map((step, i) => {
    const previous = steps[i - 1];
    return transferSeconds(current, previous?.location ?? current, step.location,
      previous && byId[previous.id]?.pose, byId[step.id]?.pose);
  });
}

/** @param {PlacedMove[]} selected @param {ReturnType<typeof placeOptions>} places */
function groupedSteps(selected, places) {
  return places.flatMap(place => {
    const segment = selected.filter(step => step.location === place.location);
    // Arrive standing in a new open space. Otherwise keep the first chosen posture.
    const firstPose = place.rank > 0 && !spaces[place.location].seated ? 'standing' : byId[segment[0]?.id]?.pose;
    return [...segment.filter(step => byId[step.id].pose === firstPose), ...segment.filter(step => byId[step.id].pose !== firstPose)];
  });
}

/** @param {ReturnType<typeof availableMovements>} options @param {Preferences} prefs */
function autoSteps(options, prefs) {
  const {places, eligibleLocations, eligibleIds} = options;
  const pool = places.flatMap(place => {
    const easierTargets = new Set(eligibleIds.filter(other => placeRank(prefs.location, eligibleLocations[other][0]) < place.rank)
      .flatMap(other => byId[other].targets));
    return eligibleIds.filter(id => eligibleLocations[id][0] === place.location && desired(byId[id], prefs))
      .filter(id => prefs.favoriteIds.includes(id) || !easierVariant(options, id, place.location))
      .map(id => ({id, location: place.location, place, newTargets: byId[id].targets.filter(t => prefs.targets.includes(t) && !easierTargets.has(t))}));
  });
  // A mixed routine requests any feasible movement. If none fits here, use the
  // nearest selected place that leaves time for movement after the journey.
  const mixedPlace = !prefs.targets.length && places.find(place =>
    pool.some(candidate => candidate.location === place.location &&
      transferSeconds(prefs.location, prefs.location, place.location, undefined, byId[candidate.id].pose) + 5 <= prefs.seconds));
  /** @type {PlacedMove[]} */
  let selected = [];
  const seenTargets = new Set();
  const seenMotions = new Set();
  const slots = Math.max(1, Math.floor(prefs.seconds / 24));
  while (pool.length && selected.length < slots) {
    let best = -1;
    let bestScore = -Infinity;
    const lastPose = selected.length ? byId[selected[selected.length - 1].id].pose : undefined;
    for (const [i, candidate] of pool.entries()) {
      const {id, location, place, newTargets} = candidate;
      const move = byId[id];
      const named = prefs.favoriteIds.includes(id);
      const uniqueTarget = newTargets.some(target => !seenTargets.has(target));
      if (place.rank && !uniqueTarget && !named && (!mixedPlace || location !== mixedPlace.location)) continue;
      const attempt = groupedSteps([...selected, candidate], places);
      const active = prefs.seconds - transfersFor(attempt, prefs.location).reduce((a, b) => a + b, 0);
      // An explicitly requested target or favorite can use a shorter remaining slot.
      if (active < attempt.length * 5 || (attempt.length > Math.max(1, Math.floor(active / 24)) && !uniqueTarget && !named)) continue;
      const newVisit = place.rank && !selected.some(step => step.location === location);
      const score = rank(move, prefs, seenTargets, seenMotions, lastPose) - (newVisit ? place.visitSeconds / 10 : 0);
      if (score > bestScore) { best = i; bestScore = score; }
    }
    if (best < 0) break;
    const [{id, location}] = pool.splice(best, 1);
    selected.push({id, location});
    byId[id].targets.forEach(target => seenTargets.add(target));
    seenMotions.add(byId[id].motion);
  }
  if (!selected.length) return [];
  selected = groupedSteps(selected, places);
  const transfers = transfersFor(selected, prefs.location);
  const time = Math.min(prefs.seconds - transfers.reduce((a, b) => a + b, 0), selected.length * 45);
  const base = Math.floor(time / selected.length);
  return selected.map((step, i) => ({...step, seconds: transfers[i] + base + Number(i < time % selected.length)}));
}

/** @param {unknown} steps */
function readSteps(steps) {
  if (!Array.isArray(steps)) throw invalidRequest('steps', 'Expected a list of timed movements.');
  return steps.map((step, i) => {
    const path = 'steps[' + i + ']';
    if (step === null || typeof step !== 'object' || Array.isArray(step)) throw invalidRequest(path, 'Expected a timed movement.');
    for (const key of Object.keys(step)) {
      if (!['id', 'seconds', 'reps', 'location', 'prescription'].includes(key)) throw invalidRequest(path + '.' + key, 'Unknown step field.');
    }
    if (typeof step.id !== 'string' || !step.id) throw invalidRequest(path + '.id', 'Expected a movement ID.');
    const seconds = numberInRange(step.seconds, 5, 900, path + '.seconds', true);
    const location = step.location === undefined ? undefined : option(step.location, Object.keys(locations), path + '.location');
    if (step.prescription !== undefined && !prescriptionFor(step)) throw invalidRequest(path+'.prescription','Expected a matching program step.');
    return {id: /** @type {string} */ (step.id), seconds, location,
      ...(step.prescription ? {prescription:step.prescription} : {}),
      ...(step.reps === undefined ? {} : {reps: numberInRange(step.reps, 1, 100, path + '.reps', true)})};
  });
}

/** @param {ReturnType<typeof readSteps>} input @param {Preferences} prefs @param {ReturnType<typeof availableMovements>} options */
function checkSteps(input, prefs, options) {
  const steps = input.map(step => ({...step, location: step.location ?? options.eligibleLocations[step.id]?.[0] ?? prefs.location}));
  const transfers = transfersFor(steps, prefs.location);
  const seenPlaces = new Set();
  let highestRank = 0;
  const rows = steps.map((step, i) => {
    let locationIssue = '';
    const place = options.places.find(p => p.location === step.location);
    if (!place) locationIssue = 'This place is outside your selected, reachable places.';
    else if (i && step.location !== steps[i - 1].location && (place.rank < highestRank || seenPlaces.has(step.location))) {
      locationIssue = 'Keep each place together and visit easier places first.';
    }
    if (place) highestRank = Math.max(highestRank, place.rank);
    seenPlaces.add(step.location);
    const issues = Object.hasOwn(byId, step.id) ? fitIssues(byId[step.id], prefs, step.location) : ['This movement is no longer in the library.'];
    if (locationIssue) issues.unshift(locationIssue);
    const transitionSeconds = transfers[i];
    return {...step, issues, locationIssue, transitionSeconds, needsTransferTime: step.seconds < transitionSeconds + 5};
  });
  const totalSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);
  const overBudgetSeconds = Math.max(0, totalSeconds - prefs.seconds);
  return {rows, totalSeconds, overBudgetSeconds, fits: !overBudgetSeconds && rows.every(row => !row.issues.length && !row.needsTransferTime)};
}

// Resolve the original dose by a stable program/step reference, including after a save.
export function prescriptionFor(step) {
  if (typeof step.prescription !== 'string') return undefined;
  const [id, index, extra] = step.prescription.split('/');
  if (extra !== undefined || !/^(0|[1-9]\d*)$/.test(index)) return undefined;
  const dose = programs.find(p=>p.id===id)?.steps[Number(index)];
  return dose?.id === step.id ? dose : undefined;
}

function programSteps(id, prefs, options) {
  const program = programs.find(p=>p.id===id);
  const steps = program.steps.map((dose,i)=>({
    id:dose.id, location:options.eligibleLocations[dose.id]?.[0] ?? prefs.location,
    seconds:dose.seconds*(dose.sides ?? 1), prescription:id+'/'+i,
    ...(dose.reps ? {reps:dose.reps*(dose.sides ?? 1)} : {}),
  }));
  const travel = transfersFor(steps,prefs.location);
  return steps.map((step,i)=>({...step, seconds:step.seconds+travel[i]}));
}

/** Review explicit steps against the current preferences, without changing the plan. @param {any} request */
export function reviewRoutine(request) {
  const prefs = normalize(request);
  const options = availableMovements(prefs);
  return {...options, ...checkSteps(request.programId ? programSteps(request.programId,prefs,options) : readSteps(request.steps), prefs, options)};
}

/** Plan or validate a routine. All fields are optional. See ../api.md. @param {any} [request] */
export function submit(request = {}) {
  const prefs = normalize(request);
  const options = availableMovements(prefs);
  let steps;
  if (request.steps === undefined && request.programId === undefined) steps = autoSteps(options, prefs);
  else {
    const report = checkSteps(request.programId ? programSteps(request.programId,prefs,options) : readSteps(request.steps), prefs, options);
    steps = report.rows.map(({issues, locationIssue, needsTransferTime, transitionSeconds, ...step}, i) => {
      if (locationIssue) throw invalidRequest('steps[' + i + '].location', locationIssue);
      if (issues.length) throw invalidRequest('steps[' + i + '].id', issues.join(' '));
      if (needsTransferTime) throw invalidRequest('steps[' + i + '].seconds', 'Allow at least ' + (transitionSeconds + 5) + ' seconds for the transfer and movement.');
      return step;
    });
    if (report.overBudgetSeconds) throw invalidRequest('steps', 'The routine exceeds your time budget.');
  }
  const usedIds = steps.map(step => step.id);
  const served = new Set(steps.flatMap(step => byId[step.id].targets));
  /** @type {{location:string, steps:number[]}[]} */
  const segments = [];
  steps.forEach((step, index) => {
    const last = segments.at(-1);
    if (last?.location === step.location) last.steps.push(index);
    else segments.push({location: step.location, steps: [index]});
  });
  return {
    ...options, steps, segments, transitionSeconds: transfersFor(steps, prefs.location),
    totalSeconds: steps.reduce((sum, step) => sum + step.seconds, 0),
    returnToLocation: steps.length && spaces[prefs.location].seated && steps[steps.length - 1].location !== prefs.location ? prefs.location : null,
    unmetTargets: prefs.targets.filter(target => !served.has(target)),
    unmetFavorites: prefs.favoriteIds.filter(id => !usedIds.includes(id)),
  };
}
