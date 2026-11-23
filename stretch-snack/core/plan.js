import { checkRequestKeys, invalidRequest } from '../../shared/request.js';
import { equipment, limitations, locations, moves, reachableLocations, targets } from './catalog.js';

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
    'location', 'seconds', 'targets', 'limitations', 'equipment', 'discretion', 'avoidIds', 'favoriteIds',
    'feedback', 'heightCm', 'armspanCm', 'forwardCm', 'sideCm', 'allowFloor', 'availableLocations', 'steps',
  ]);
  const {
    location = 'plane-seat', seconds = 120, discretion = 'quiet', feedback = {}, allowFloor = false,
    heightCm = 170, armspanCm = 170, forwardCm, sideCm,
  } = request;
  option(location, Object.keys(locations), 'location');
  option(discretion, visibility, 'discretion');
  numberInRange(seconds, 15, 900, 'seconds', true);
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
  return {
    location: /** @type {keyof typeof locations} */ (location), seconds, discretion, feedback, heightCm, armspanCm, forwardCm, sideCm, allowFloor,
    limitations: choices(request.limitations, Object.keys(limitations), 'limitations'),
    targets: choices(request.targets, Object.keys(targets), 'targets'),
    equipment: choices(request.equipment, Object.keys(equipment), 'equipment'),
    avoidIds: choices(request.avoidIds, movementIds, 'avoidIds'),
    favoriteIds: choices(request.favoriteIds, movementIds, 'favoriteIds'),
    availableLocations: choices(request.availableLocations, Object.keys(locations), 'availableLocations'),
  };
}

/** @type {Record<string, string>} */
const conflicts = {
  'back-support': 'unsupported-back', 'no-twisting': 'twist', 'limited-grip': 'grip',
  'no-leg-movement': 'legs', 'no-arm-movement': 'arms', 'poor-balance': 'balance',
};

/** @param {Movement} move @param {Preferences} prefs @param {string} location */
function fitIssues(move, prefs, location) {
  const issues = [];
  const space = spaces[location];
  if (prefs.avoidIds.includes(move.id)) issues.push('You marked this movement “Leave out”.');
  if (prefs.feedback[move.id] === 'uncomfortable') issues.push('You marked this movement uncomfortable.');
  const blockedBy = prefs.limitations.filter(rule =>
    (conflicts[rule] && move.uses.includes(conflicts[rule])) ||
    (move.pose !== 'seated' && ['stay-seated', 'back-support', 'no-leg-movement', 'poor-balance'].includes(rule)) ||
    (move.pose !== 'standing' && rule === 'stay-standing') ||
    (move.pose === 'supine' && rule === 'no-floor') ||
    (move.overhead && rule === 'no-overhead'));
  if (blockedBy.length) issues.push('Mobility setting · ' + blockedBy.map(rule => limitations[rule]).join(', ') + '.');

  if ((move.pose === 'seated') !== space.seated) {
    issues.push(move.pose === 'seated' ? 'Needs a seat.' : 'Needs space outside your seat.');
  }
  if (move.pose === 'supine') {
    if (location !== 'open-area') issues.push('Needs an open, stationary space.');
    if (!prefs.allowFloor) issues.push('Floor use is off.');
  }
  if (move.stationary && !space.stationary) issues.push('Needs a stationary surface.');
  const missingEquipment = move.equipment.filter(key => !prefs.equipment.includes(key));
  if (missingEquipment.length) issues.push('Equipment needed · ' + missingEquipment.map(key => equipment[key]).join(', ') + '.');
  if (visibility.indexOf(move.discretion) > visibility.indexOf(prefs.discretion)) issues.push('Exceeds your discretion setting.');

  const forward = location === prefs.location ? prefs.forwardCm ?? space.forward : space.forward;
  const side = location === prefs.location ? prefs.sideCm ?? space.side : space.side;
  // A leg extension or stride scales with height, an arm reach with span.
  const forwardScale = (move.uses.includes('legs') ? prefs.heightCm : prefs.armspanCm) / 170;
  const sideScale = (move.motion === 'hip-side' || move.motion === 'weight-shift' || move.pose === 'supine' ? prefs.heightCm : prefs.armspanCm) / 170;
  if (move.forward * forwardScale > forward) issues.push('Needs about ' + Math.ceil(move.forward * forwardScale) + ' cm ahead of your knees.');
  if (move.side * sideScale > side) issues.push('Needs about ' + Math.ceil(move.side * sideScale) + ' cm beside each shoulder.');
  return issues;
}

/** @param {Movement} move @param {Preferences} prefs */
function desired(move, prefs) {
  return !prefs.targets.length || move.targets.some(target => prefs.targets.includes(target)) || prefs.favoriteIds.includes(move.id);
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
    + Number(move.pose === 'supine' && prefs.equipment.includes('mat'))
    + Number(lastPose === move.pose) * 2;
}

/** @param {Movement[]} eligible @param {Preferences} prefs */
function autoSteps(eligible, prefs) {
  let pool = eligible.filter(move => desired(move, prefs));
  const selected = [];
  const seenTargets = new Set();
  const seenMotions = new Set();
  const slots = Math.max(1, Math.floor(prefs.seconds / 24));
  // Select the first best-ranked item on ties so identical requests reproduce exactly.
  while (pool.length && selected.length < slots) {
    const lastPose = selected.at(-1)?.pose;
    let best = pool[0];
    let bestScore = -Infinity;
    for (const candidate of pool) {
      const score = rank(candidate, prefs, seenTargets, seenMotions, lastPose);
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    selected.push(best);
    best.targets.forEach(target => seenTargets.add(target));
    seenMotions.add(best.motion);
    pool = pool.filter(move => move.id !== best.id);
  }
  if (!selected.length) return [];
  const firstPose = selected[0].pose;
  // Group floor work together so there is at most one transfer.
  const ordered = [...selected.filter(move => move.pose === firstPose), ...selected.filter(move => move.pose !== firstPose)];
  const time = Math.min(prefs.seconds, ordered.length * 45);
  const base = Math.floor(time / ordered.length);
  const extraSeconds = time % ordered.length;
  return ordered.map((move, i) => ({id: move.id, seconds: base + Number(i < extraSeconds)}));
}

/** @param {unknown} steps */
function readSteps(steps) {
  if (!Array.isArray(steps)) throw invalidRequest('steps', 'Expected a list of timed movements.');
  return steps.map((step, i) => {
    const path = 'steps[' + i + ']';
    if (step === null || typeof step !== 'object' || Array.isArray(step)) throw invalidRequest(path, 'Expected a timed movement.');
    for (const key of Object.keys(step)) {
      if (!['id', 'seconds', 'reps'].includes(key)) throw invalidRequest(path + '.' + key, 'Unknown step field.');
    }
    if (typeof step.id !== 'string' || !step.id) throw invalidRequest(path + '.id', 'Expected a movement ID.');
    const seconds = numberInRange(step.seconds, 5, 180, path + '.seconds', true);
    if (step.reps === undefined) return {id: step.id, seconds};
    return {id: step.id, seconds, reps: numberInRange(step.reps, 1, 100, path + '.reps', true)};
  });
}

/** @param {ReturnType<typeof readSteps>} steps @param {Preferences} prefs */
function checkSteps(steps, prefs) {
  const rows = steps.map((step, i) => {
    const known = Object.hasOwn(byId, step.id);
    const issues = known ? fitIssues(byId[step.id], prefs, prefs.location) : ['This movement is no longer in the library.'];
    const previous = steps[i - 1];
    const transfer = known && previous && Object.hasOwn(byId, previous.id) && byId[previous.id].pose !== byId[step.id].pose;
    return {...step, issues, needsTransferTime: Boolean(transfer && step.seconds < postureChangeSeconds + 5)};
  });
  const totalSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);
  const overBudgetSeconds = Math.max(0, totalSeconds - prefs.seconds);
  return {rows, totalSeconds, overBudgetSeconds, fits: !overBudgetSeconds && rows.every(row => !row.issues.length && !row.needsTransferTime)};
}

/** Review explicit steps against the current preferences, without changing the plan. @param {any} request */
export function reviewRoutine(request) {
  const prefs = normalize(request);
  const report = checkSteps(readSteps(request.steps), prefs);
  return {...report, eligibleIds: moves.filter(move => !fitIssues(move, prefs, prefs.location).length).map(move => move.id)};
}

/** Plan or validate a routine. All fields are optional. See ../api.md. @param {any} [request] */
export function submit(request = {}) {
  const prefs = normalize(request);
  const eligible = moves.filter(move => !fitIssues(move, prefs, prefs.location).length);
  const steps = request.steps === undefined ? autoSteps(eligible, prefs) : readSteps(request.steps);
  if (request.steps !== undefined) {
    const report = checkSteps(steps, prefs);
    report.rows.forEach((row, i) => {
      if (row.issues.length) throw invalidRequest('steps[' + i + '].id', row.issues.join(' '));
      if (row.needsTransferTime) throw invalidRequest('steps[' + i + '].seconds', 'Allow at least 20 seconds when changing posture.');
    });
    if (report.overBudgetSeconds) throw invalidRequest('steps', 'The routine exceeds your time budget.');
  }
  const eligibleIds = eligible.map(move => move.id);
  const usedIds = steps.map(step => step.id);
  const served = new Set(steps.flatMap(step => byId[step.id].targets));
  const alternatives = [];
  for (const location of prefs.availableLocations) {
    if (!reachableLocations[prefs.location].includes(location)) continue;
    // Standing up to do the same neck turn adds no choice. Keep genuinely
    // different movements, equipment variants, and specifically named favorites.
    const additionalIds = moves.filter(move => {
      if (eligibleIds.includes(move.id) || fitIssues(move, prefs, location).length || !desired(move, prefs)) return false;
      return prefs.favoriteIds.includes(move.id) || !eligible.some(local =>
        local.motion === move.motion && local.equipment.join(',') === move.equipment.join(','));
    }).map(move => move.id);
    if (additionalIds.length) alternatives.push({location, additionalIds});
  }
  return {
    steps, eligibleIds, alternatives,
    transitionSeconds: steps.map((step, i) => i > 0 && byId[step.id].pose !== byId[steps[i - 1].id].pose ? postureChangeSeconds : 0),
    totalSeconds: steps.reduce((sum, step) => sum + step.seconds, 0),
    unmetTargets: prefs.targets.filter(target => !served.has(target)),
    unmetFavorites: prefs.favoriteIds.filter(id => !usedIds.includes(id)),
  };
}
