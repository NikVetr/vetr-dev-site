// Request -> problem (R/problem.R): validate a request, collecting every issue, and build the
// seat-indexed matrices, tables and initial seating that the objective and the search use.
// Field names are R's in camelCase; issue codes, paths (0-based) and messages are R's.

import { gridLayout, spiralLayout, tableCloseness } from './layout.js';
import { TABLE_OBJECTIVES } from './objective.js';

/**
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {{ table: number, pairs: number, geography: number }} Weights
 * @typedef {{
 *   tableObjective: keyof typeof TABLE_OBJECTIVES, weights: Weights, constraintPenalty: number,
 *   iterations: number, logitScale: number, seed: number, tracePoints: number,
 *   record: 'none' | 'moves' | 'states', recordEvery: number }} Options
 * @typedef {{
 *   ids: (string | null)[], category: Float64Array, nGuests: number, nSeats: number,
 *   tableIds: string[], capacity: number[], xy: [number, number][], closeness: Float64Array,
 *   W: Float64Array, K: Float64Array, C: Float64Array | null, tablemates: boolean,
 *   together: [number, number][], apart: [number, number][],
 *   objective: (v: number[]) => number, weights: Weights, options: Options,
 *   initial: number[][] }} Problem
 *   Seats 0..nSeats-1: guests first, in request order, then empty seats (id null, category
 *   NaN, all-zero matrix rows). Matrices are nSeats x nSeats, row-major. initial lists each
 *   table's seats in seat order.
 */

export class SeatingError extends Error {
  /** @param {string} code @param {string} message @param {Issue[]} [issues] */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'SeatingError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** @param {number} nGuests @returns {Options} */
export function defaultOptions(nGuests) {
  return {
    tableObjective: 'sqrt_distance',
    weights: { table: 1, pairs: 1, geography: 1 },
    constraintPenalty: 1000,
    iterations: 50 * nGuests,
    logitScale: 1,
    seed: 1,
    tracePoints: 1000,
    record: 'none',
    recordEvery: 1,
  };
}

/** R's spelling of the options whose names differ here. */
export const R_OPTION_NAMES = /** @type {const} */ ({
  table_objective: 'tableObjective', constraint_penalty: 'constraintPenalty', logit_scale: 'logitScale',
  trace_points: 'tracePoints', record_every: 'recordEvery',
});

/**
 * A request in the R version's spelling (seat.R, seat_tables()) with its options renamed to
 * this one's; everything else is the same. Fields already spelled this way are kept, and
 * `"options": []`, how jsonlite writes an empty R list, becomes {}.
 * @param {any} request
 */
export function fromRRequest(request) {
  if (!isObject(request)) return request;
  if (Array.isArray(request.options) && request.options.length === 0) return { ...request, options: {} };
  if (!isObject(request.options)) return request;
  const options = Object.fromEntries(Object.entries(request.options).map(([k, v]) => [R_OPTION_NAMES[/** @type {keyof typeof R_OPTION_NAMES} */ (k)] ?? k, v]));
  return { ...request, options };
}

/** @param {unknown} x @returns {x is Record<string, any>} */
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
/** @param {unknown} x @returns {x is string} */
const isString = (x) => typeof x === 'string' && x.length > 0;
/** @param {unknown} x @returns {x is number} */
const isNumber = (x) => typeof x === 'number' && Number.isFinite(x);
const isCount = (/** @type {unknown} */ x, min = 0) => isNumber(x) && Number.isInteger(x) && x >= min;

const REQUEST_FIELDS = ['guests', 'tables', 'pairs', 'together', 'apart', 'geography', 'options'];

/**
 * Validates a request and builds the problem. Throws one SeatingError listing every issue.
 * @param {unknown} request see api.md
 * @returns {Problem}
 */
export function buildProblem(request) {
  /** @type {Issue[]} */
  const issues = [];
  const add = (/** @type {string} */ path, /** @type {string} */ code, /** @type {string} */ message) => issues.push({ code, path, message });
  /** @param {Record<string, any>} x @param {string} path @param {readonly string[]} known @param {string[]} [required] */
  const checkFields = (x, path, known, required = []) => {
    for (const f of Object.keys(x)) {
      if (known.includes(f)) continue;
      const renamed = path === 'options.' && R_OPTION_NAMES[/** @type {keyof typeof R_OPTION_NAMES} */ (f)];
      add(path + f, 'unknown_field', renamed ? `unknown field (R's ${f} is ${renamed} here)` : 'unknown field');
    }
    for (const f of required) if (!(f in x)) add(path + f, 'missing_field', 'required');
  };
  const failIfIssues = () => {
    if (!issues.length) return;
    const first = issues[0];
    const more = issues.length > 1 ? ` (and ${issues.length - 1} more issue${issues.length > 2 ? 's' : ''})` : '';
    throw new SeatingError('invalid_request', `Invalid request: ${first.path ? `${first.path}: ` : ''}${first.message}${more}`, issues);
  };
  /** @param {unknown} x @param {string} path @returns {x is Record<string, any>} */
  const mustBeObject = (x, path) => {
    if (isObject(x)) return true;
    add(path, 'wrong_type', 'must be an object');
    return false;
  };

  if (!mustBeObject(request, '')) failIfIssues();
  const req = /** @type {Record<string, any>} */ (request);
  checkFields(req, '', REQUEST_FIELDS, ['guests', 'tables']);
  failIfIssues();

  // Guests ---------------------------------------------------------------------------
  if (!Array.isArray(req.guests) || req.guests.length < 2) {
    add('guests', 'wrong_type', 'must be an array of at least 2 guest objects');
    failIfIssues();
  }
  /** @type {unknown[]} */
  const guests = req.guests;
  const n = guests.length;
  const ids = new Array(n).fill('');
  const category = new Float64Array(n).fill(NaN);
  guests.forEach((g, i) => {
    const p = `guests[${i}]`;
    if (!mustBeObject(g, p)) return;
    checkFields(g, `${p}.`, ['id', 'category'], ['id']);
    if ('id' in g) {
      if (isString(g.id)) ids[i] = g.id;
      else add(`${p}.id`, 'wrong_type', 'must be a non-empty string');
    }
    if ('category' in g) {
      if (isNumber(g.category)) category[i] = g.category;
      else add(`${p}.category`, 'wrong_type', 'must be a finite number');
    }
  });
  const seenIds = new Set();
  ids.forEach((id, i) => {
    if (id && seenIds.has(id)) add(`guests[${i}].id`, 'duplicate_id', `id "${id}" is used twice`);
    seenIds.add(id);
  });
  failIfIssues();

  // Options --------------------------------------------------------------------------
  const opts = defaultOptions(n);
  const given = req.options;
  if (given !== undefined && mustBeObject(given, 'options')) {
    checkFields(given, 'options.', Object.keys(opts));
    if (given.weights !== undefined && mustBeObject(given.weights, 'options.weights')) {
      checkFields(given.weights, 'options.weights.', Object.keys(opts.weights));
      for (const w of /** @type {const} */ (['table', 'pairs', 'geography'])) {
        if (!(w in given.weights)) continue;
        if (isNumber(given.weights[w])) opts.weights[w] = given.weights[w];
        else add(`options.weights.${w}`, 'wrong_type', 'must be a finite number');
      }
    }
    /** @type {Record<string, [(x: any) => boolean, string]>} */
    const rules = {
      tableObjective: [(x) => isString(x) && x in TABLE_OBJECTIVES, `one of ${Object.keys(TABLE_OBJECTIVES).join(', ')}`],
      constraintPenalty: [(x) => isNumber(x) && x > 0, 'a positive number'],
      iterations: [(x) => isCount(x, 0), 'a whole number >= 0'],
      logitScale: [(x) => isNumber(x) && x > 0, 'a positive number'],
      seed: [(x) => isCount(x, 0) && x <= 2147483647, 'a whole number from 0 to 2147483647'],
      tracePoints: [(x) => isCount(x, 1), 'a whole number >= 1'],
      record: [(x) => ['none', 'moves', 'states'].includes(x), 'one of none, moves, states'],
      recordEvery: [(x) => isCount(x, 1), 'a whole number >= 1'],
    };
    for (const [f, [ok, what]] of Object.entries(rules)) {
      if (!(f in given)) continue;
      if (ok(given[f])) /** @type {any} */ (opts)[f] = given[f];
      else add(`options.${f}`, 'out_of_range', `must be ${what}`);
    }
  }
  const geoGiven = isObject(req.geography) ? req.geography : null;
  const needsCategory = opts.tableObjective !== 'none' || geoGiven?.cost === 'category';
  const missingCategory = category.findIndex((c) => Number.isNaN(c));
  if (needsCategory && missingCategory >= 0) {
    add(`guests[${missingCategory}].category`, 'missing_field', 'every guest needs a category for this table objective or geography cost');
  }

  // Tables ---------------------------------------------------------------------------
  const tab = req.tables;
  /** @type {string[]} */
  let tableIds;
  /** @type {number[]} */
  let seatTable;
  /** @type {[number, number][] | null} */
  let xy = null;
  if (Array.isArray(tab)) {
    // x and y are given for every table or for none
    const hasXy = tab.some((t) => isObject(t) && ('x' in t || 'y' in t));
    tableIds = new Array(tab.length).fill('');
    const capacity = new Array(tab.length).fill(0);
    if (hasXy) xy = tab.map(() => [NaN, NaN]);
    tab.forEach((t, i) => {
      const p = `tables[${i}]`;
      if (!mustBeObject(t, p)) return;
      checkFields(t, `${p}.`, ['id', 'capacity', 'x', 'y'], ['id', 'capacity', ...(hasXy ? ['x', 'y'] : [])]);
      if (isString(t.id)) tableIds[i] = t.id;
      else if ('id' in t) add(`${p}.id`, 'wrong_type', 'must be a non-empty string');
      if (isCount(t.capacity, 1)) capacity[i] = t.capacity;
      else if ('capacity' in t) add(`${p}.capacity`, 'out_of_range', 'must be a whole number >= 1');
      if (xy) {
        for (const [k, f] of /** @type {const} */ ([[0, 'x'], [1, 'y']])) {
          if (isNumber(t[f])) xy[i][k] = t[f];
          else if (f in t) add(`${p}.${f}`, 'wrong_type', 'must be a finite number');
        }
      }
    });
    if (tab.length < 2) add('tables', 'out_of_range', 'needs at least 2 tables');
    const seenTables = new Set();
    tableIds.forEach((id, i) => {
      if (id && seenTables.has(id)) add(`tables[${i}].id`, 'duplicate_id', 'table id used twice');
      seenTables.add(id);
    });
    const seats = capacity.reduce((a, b) => a + b, 0);
    if (seats < n) add('tables', 'insufficient_capacity', `${seats} seats for ${n} guests`);
    failIfIssues();
    seatTable = capacity.flatMap((c, t) => new Array(c).fill(t));
    if (!xy) xy = spiralOrFail(tab.length, add, failIfIssues);
  } else if (isObject(tab)) {
    checkFields(tab, 'tables.', ['seats', 'layout'], ['seats']);
    const layout = tab.layout ?? 'spiral';
    if (!isCount(tab.seats, 1)) add('tables.seats', 'out_of_range', 'must be a whole number >= 1');
    if (!['spiral', 'grid'].includes(layout)) add('tables.layout', 'out_of_range', 'must be spiral or grid');
    failIfIssues();
    // The original rule: floor(n / seats) tables filled in guest order, the remaining guests
    // added one each to the first tables.
    const seats = tab.seats;
    const nTables = Math.max(1, Math.floor(n / seats));
    if (nTables < 2) add('tables.seats', 'out_of_range', `${n} guests at ${seats} per table is fewer than 2 tables`);
    failIfIssues();
    seatTable = Array.from({ length: n }, (_, i) => Math.floor(i / seats));
    for (let i = nTables * seats, t = 0; i < n; i++, t = (t + 1) % nTables) seatTable[i] = t;
    tableIds = Array.from({ length: nTables }, (_, t) => String(t + 1));
    xy = layout === 'spiral' ? spiralOrFail(nTables, add, failIfIssues) : gridLayout(nTables);
  } else {
    add('tables', 'wrong_type', 'must be {seats, layout} or an array of table objects');
    failIfIssues();
    throw new Error('unreachable');
  }
  const T = tableIds.length;
  const nSeats = seatTable.length;
  const capacity = new Array(T).fill(0);
  for (const t of seatTable) capacity[t]++;
  const seatMatrix = () => new Float64Array(nSeats * nSeats);

  // Pairwise matrices over seats -------------------------------------------------------
  const index = new Map(ids.map((id, i) => [id, i]));
  /** @param {unknown} id @param {string} path */
  const guestIndex = (id, path) => {
    const i = isString(id) ? index.get(id) : undefined;
    if (i === undefined) add(path, 'unknown_guest', 'not a guest id');
    return i;
  };
  /** @param {unknown} x @param {string} path @param {string} valueField */
  const readPairs = (x, path, valueField) => {
    const m = seatMatrix();
    if (!Array.isArray(x)) {
      add(path, 'wrong_type', 'must be an array of objects');
      return m;
    }
    const seen = new Set();
    x.forEach((pair, k) => {
      const p = `${path}[${k}]`;
      if (!mustBeObject(pair, p)) return;
      checkFields(pair, `${p}.`, ['a', 'b', valueField], ['a', 'b', valueField]);
      const a = 'a' in pair ? guestIndex(pair.a, `${p}.a`) : undefined;
      const b = 'b' in pair ? guestIndex(pair.b, `${p}.b`) : undefined;
      const v = pair[valueField];
      if (!isNumber(v)) {
        if (valueField in pair) add(`${p}.${valueField}`, 'wrong_type', 'must be a finite number');
        return;
      }
      if (a === undefined || b === undefined) return;
      if (a === b) {
        add(p, 'self_pair', 'a and b are the same guest');
        return;
      }
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(key)) add(p, 'duplicate_pair', 'pair listed twice');
      seen.add(key);
      m[a * nSeats + b] = v;
      m[b * nSeats + a] = v;
    });
    return m;
  };
  const W = req.pairs === undefined ? seatMatrix() : readPairs(req.pairs, 'pairs', 'score');

  // Constraints: +penalty for each must-together pair seated together, -penalty for each
  // must-apart pair seated together; reported as -penalty per violated pair.
  const K = seatMatrix();
  const maxCapacity = Math.max(...capacity);
  /** @param {unknown} x @param {string} path @param {1 | -1} sign @returns {[number, number][]} */
  const readGroups = (x, path, sign) => {
    if (x === undefined) return [];
    if (!Array.isArray(x)) {
      add(path, 'wrong_type', 'must be an array of guest-id arrays');
      return [];
    }
    /** @type {Map<string, [number, number]>} */
    const pairs = new Map();
    x.forEach((members, k) => {
      const p = `${path}[${k}]`;
      if (!Array.isArray(members)) {
        add(p, 'wrong_type', 'must be an array of guest ids');
        return;
      }
      const idx = members.map((id, j) => guestIndex(id, `${p}[${j}]`));
      const known = /** @type {number[]} */ (idx.filter((i) => i !== undefined));
      const duplicated = new Set(known).size < known.length;
      if (members.length < 2) add(p, 'out_of_range', 'needs at least 2 guests');
      if (duplicated) add(p, 'duplicate_guest', 'a guest is listed twice');
      if (sign > 0 && members.length > maxCapacity) add(p, 'infeasible_group', `${members.length} guests cannot share a table of at most ${maxCapacity} seats`);
      if (known.length < idx.length || members.length < 2 || duplicated) return;
      const sorted = [...known].sort((a, b) => a - b);
      for (let u = 0; u < sorted.length; u++) {
        for (let v = u + 1; v < sorted.length; v++) {
          const [a, b] = [sorted[u], sorted[v]];
          if (K[a * nSeats + b] === -sign * opts.constraintPenalty) add(p, 'conflicting_constraints', 'a pair is both together and apart');
          K[a * nSeats + b] = K[b * nSeats + a] = sign * opts.constraintPenalty;
          pairs.set(`${a},${b}`, [a, b]);
        }
      }
    });
    return [...pairs.values()];
  };
  const together = readGroups(req.together, 'together', 1);
  const apart = readGroups(req.apart, 'apart', -1);

  // Geography cost: penalty cost[i, j] * closeness(table_i, table_j) per ordered pair.
  /** @type {Float64Array | null} */
  let C = null;
  let tablemates = true;
  const geo = req.geography;
  if (geo !== undefined && mustBeObject(geo, 'geography')) {
    checkFields(geo, 'geography.', ['cost', 'tablemates'], ['cost']);
    if ('tablemates' in geo) {
      if (typeof geo.tablemates === 'boolean') tablemates = geo.tablemates;
      else add('geography.tablemates', 'wrong_type', 'must be true or false');
    }
    if (geo.cost === 'category') {
      C = seatMatrix();
      if (missingCategory < 0) {
        const nCategories = new Set(category).size;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i * nSeats + j] = nCategories - Math.abs(category[i] - category[j]);
      }
    } else if ('cost' in geo) {
      C = readPairs(geo.cost, 'geography.cost', 'cost');
    }
    if (C) for (let i = 0; i < nSeats; i++) C[i * nSeats + i] = 0;
  }
  failIfIssues();

  /** @type {number[][]} */
  const initial = Array.from({ length: T }, () => []);
  seatTable.forEach((t, i) => initial[t].push(i));
  return {
    ids: [...ids, ...new Array(nSeats - n).fill(null)],
    category: Float64Array.from({ length: nSeats }, (_, i) => (i < n ? category[i] : NaN)),
    nGuests: n,
    nSeats,
    tableIds,
    capacity,
    xy: /** @type {[number, number][]} */ (xy),
    closeness: tableCloseness(/** @type {[number, number][]} */ (xy)),
    W, K, C, tablemates, together, apart,
    objective: TABLE_OBJECTIVES[opts.tableObjective],
    weights: opts.weights,
    options: opts,
    initial,
  };
}

/**
 * @param {number} nTables @param {(path: string, code: string, message: string) => void} add
 * @param {() => void} failIfIssues
 */
function spiralOrFail(nTables, add, failIfIssues) {
  const xy = spiralLayout(nTables);
  if (xy.length < nTables) {
    add('tables', 'too_many_tables', `the spiral layout fits at most ${xy.length} tables; give table coordinates instead`);
    failIfIssues();
  }
  return xy;
}
