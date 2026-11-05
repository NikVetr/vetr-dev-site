// Request validation and the "clue : answer" text format. Everything that turns
// outside input into validated entries, objective and search settings lives here, so
// the API, the CLI and the page reject exactly the same things with the same messages.

import { maskFromRgba, preparePicture, TERMS } from './score.js';
import { canvasSize } from './search.js';

/**
 * @typedef {{ code: string, path: string, message: string, line?: number }} Issue
 * @typedef {{ clue: string, answer: string }} EntryInput
 * @typedef {import('./grid.js').Word & EntryInput} Entry an entry with its grid word
 * @typedef {import('./grid.js').State} State
 * @typedef {import('./grid.js').Cell} Cell
 * @typedef {import('./score.js').Terms} Terms
 * @typedef {import('./score.js').Objective} Objective
 * @typedef {{ seed: number, nXwords: number, nIter: number, maxAttemptsWord: number, maxAttemptsXword: number }} Search
 * @typedef {{ width: number, height: number, cells: number }} TargetSummary
 */

export class CrosswordError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Issue[]} [issues]
   */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'CrosswordError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** The R generator's defaults. */
export const DEFAULTS = Object.freeze({
  weights: Object.freeze(/** @type {Terms} */ (Object.fromEntries(TERMS.map((t) => [t, 1])))),
  desiredAreaRatio: 1,
  desiredHvRatio: 1,
  pictureDistance: /** @type {'scan' | 'exact'} */ ('scan'),
  darkThreshold: 2.75,
  seed: 1,
  nXwords: 1,
  nIter: 50,
  maxAttemptsWord: 20,
  maxAttemptsXword: 5,
});

const REQUEST_FIELDS = ['entries', 'entriesText', 'target', 'objective', 'search', 'init'];
const ENTRY_FIELDS = ['clue', 'answer'];
const TARGET_FIELDS = ['mask', 'rgba', 'darkThreshold', 'png'];
const RGBA_FIELDS = ['width', 'height', 'data'];
const OBJECTIVE_FIELDS = ['weights', 'desiredAreaRatio', 'desiredHvRatio', 'pictureDistance'];
const SEARCH_LIMITS = /** @type {const} */ ({
  seed: [0, 4294967295], nXwords: [1, 100], nIter: [0, 100000], maxAttemptsWord: [1, 10000], maxAttemptsXword: [1, 1000],
});
const INIT_FIELDS = ['entries', 'grid', 'rows', 'cols', 'terms', 'score'];
const INIT_ENTRY_FIELDS = ['answer', 'row', 'col', 'dir', 'clue', 'number', 'length'];
const MAX_ENTRIES = 300;
const MAX_TARGET_SIDE = 4096;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * The grid word of an answer: lower case, spaces removed, one cell per grapheme
 * (user-perceived character). Hyphens and other marks keep their cell.
 * @param {string} answer
 * @returns {import('./grid.js').Word}
 */
export function gridWord(answer) {
  const text = answer.replaceAll(' ', '').toLowerCase();
  return { text, cells: Array.from(graphemes.segment(text), (s) => s.segment) };
}

/**
 * Validates a request and fills in defaults. Throws one CrosswordError listing every
 * problem found, so a caller can fix them all at once.
 * @param {unknown} request
 * @returns {{ entries: Entry[], objective: Objective, search: Search, target: TargetSummary | null, init: State | null }}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) {
    throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object' }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  unknownFields(request, REQUEST_FIELDS, '', 'the fields are', issues);

  /** @type {(EntryInput | null)[] | null} */
  let inputs = null;
  /** @type {(i: number) => { path: string, line?: number }} */
  let where = (i) => ({ path: `entries[${i}].answer` });
  let listPath = 'entries';
  if (Object.hasOwn(request, 'entries') && Object.hasOwn(request, 'entriesText')) {
    issues.push({ code: 'conflicting_fields', path: '', message: 'give either "entries" or "entriesText", not both' });
  } else if (Object.hasOwn(request, 'entriesText')) {
    if (typeof request.entriesText === 'string') {
      const lines = readEntriesText(request.entriesText, issues);
      inputs = lines.map((l) => l.entry);
      where = (i) => ({ path: 'entriesText', line: lines[i].line });
      listPath = 'entriesText';
    } else {
      issues.push({ code: 'wrong_type', path: 'entriesText', message: 'must be a string of "clue : answer" lines' });
    }
  } else if (Object.hasOwn(request, 'entries')) {
    inputs = readEntries(request.entries, issues);
  } else {
    issues.push({ code: 'missing_field', path: 'entries', message: 'the request needs "entries" (an array of {clue, answer}) or "entriesText" ("clue : answer" lines)' });
  }
  const entries = inputs ? checkWords(inputs, where, listPath, issues) : [];
  const entriesOk = inputs !== null && issues.length === 0;

  const target = Object.hasOwn(request, 'target') ? readTarget(request.target, issues) : null;
  const objective = readObjective(request.objective, issues);
  const search = readSearch(request.search, issues);
  const init = Object.hasOwn(request, 'init') && entriesOk ? readInit(request.init, entries, issues) : null;

  if (issues.length) throw invalid(issues);
  return {
    entries,
    objective: { ...objective, picture: target && preparePicture(target) },
    search,
    target: target && { width: target.width, height: target.height, cells: target.data.reduce((a, b) => a + b, 0) },
    init,
  };
}

/**
 * Reads "clue : answer" lines, the R generator's word-list format, into entries.
 * Throws a CrosswordError whose issues carry 1-based line numbers.
 * @param {string} text
 * @returns {EntryInput[]}
 */
export function parseEntries(text) {
  /** @type {Issue[]} */
  const issues = [];
  const lines = readEntriesText(text, issues);
  checkWords(lines.map((l) => l.entry), (i) => ({ path: 'entriesText', line: lines[i].line }), 'entriesText', issues);
  if (issues.length) throw invalid(issues);
  return lines.map((l) => l.entry);
}

/** Writes entries back out as "clue : answer" lines. @param {EntryInput[]} entries */
export function formatEntries(entries) {
  return entries.map((e) => `${e.clue} : ${e.answer}\n`).join('');
}

/** @param {Issue} issue */
export function issueLocation(issue) {
  if (issue.line) return `${issue.path} line ${issue.line}`;
  return issue.path || 'request';
}

/** @param {Issue[]} issues */
function invalid(issues) {
  const shown = issues.slice(0, 3).map((issue) => `${issueLocation(issue)}: ${issue.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new CrosswordError('invalid_request', `Invalid request: ${shown.join('; ')}`, issues);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Record<string, any>} object @param {string[]} fields @param {string} path @param {string} intro @param {Issue[]} issues */
function unknownFields(object, fields, path, intro, issues) {
  for (const key of Object.keys(object)) {
    if (!fields.includes(key)) {
      issues.push({ code: 'unknown_field', path: path ? `${path}.${key}` : key, message: `unknown field; ${intro} ${fields.join(', ')}` });
    }
  }
}

/**
 * Lines with exactly one colon are entries; blank lines are skipped; anything else
 * is an error.
 * @param {string} text
 * @param {Issue[]} issues
 * @returns {{ line: number, entry: EntryInput }[]}
 */
function readEntriesText(text, issues) {
  /** @type {{ line: number, entry: EntryInput }[]} */
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === '') return;
    const parts = raw.split(':');
    const problem = (/** @type {string} */ message) => issues.push({ code: 'bad_entry_line', path: 'entriesText', line: i + 1, message });
    if (parts.length !== 2) {
      problem(parts.length === 1
        ? 'has no ":"; write each entry as "clue : answer"'
        : `has ${parts.length - 1} ":" characters; each entry needs exactly one, between the clue and the answer`);
    } else if (parts[1].trim() === '') {
      problem('has no answer after the ":"');
    } else {
      out.push({ line: i + 1, entry: { clue: parts[0].trim(), answer: parts[1].trim() } });
    }
  });
  return out;
}

/**
 * The entries array, with null for each item too malformed to read, so issue paths
 * keep their indices.
 * @param {unknown} value @param {Issue[]} issues @returns {(EntryInput | null)[] | null}
 */
function readEntries(value, issues) {
  if (!Array.isArray(value)) {
    issues.push({ code: 'wrong_type', path: 'entries', message: 'must be an array of {clue, answer} objects' });
    return null;
  }
  return value.map((item, i) => {
    const path = `entries[${i}]`;
    if (!isObject(item)) {
      issues.push({ code: 'wrong_type', path, message: 'must be an object with an answer and a clue' });
      return null;
    }
    unknownFields(item, ENTRY_FIELDS, path, 'an entry has', issues);
    if (Object.hasOwn(item, 'clue') && typeof item.clue !== 'string') issues.push({ code: 'wrong_type', path: `${path}.clue`, message: 'must be a string' });
    if (typeof item.answer !== 'string') {
      issues.push({ code: item.answer === undefined ? 'missing_field' : 'wrong_type', path: `${path}.answer`, message: 'must be a string' });
      return null;
    }
    return { clue: typeof item.clue === 'string' ? item.clue : '', answer: item.answer };
  });
}

/**
 * Derives each grid word and checks the list: two cells or more per answer, no
 * answer twice (after lower-casing and removing spaces), 2 to 300 entries.
 * @param {(EntryInput | null)[]} inputs null for an unreadable item, already reported
 * @param {(i: number) => { path: string, line?: number }} where @param {string} listPath @param {Issue[]} issues
 * @returns {Entry[]}
 */
function checkWords(inputs, where, listPath, issues) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  const entries = inputs.flatMap((input, i) => {
    if (!input) return [];
    const word = gridWord(input.answer);
    if (word.cells.length < 2) {
      issues.push({ code: 'out_of_range', ...where(i), message: `answer "${input.answer}" needs at least two letters` });
    }
    const first = seen.get(word.text);
    if (first !== undefined) {
      const at = where(first);
      issues.push({
        code: 'duplicate_answer',
        ...where(i),
        message: `answer "${input.answer}" is the same grid word, "${word.text}", as the one at ${issueLocation({ code: '', message: '', ...at })}`,
      });
    } else {
      seen.set(word.text, i);
    }
    return [{ ...input, ...word }];
  });
  if (inputs.length < 2) issues.push({ code: 'out_of_range', path: listPath, message: `has ${inputs.length} entr${inputs.length === 1 ? 'y' : 'ies'}; a crossword needs at least two` });
  if (inputs.length > MAX_ENTRIES) issues.push({ code: 'out_of_range', path: listPath, message: `has ${inputs.length} entries; the most is ${MAX_ENTRIES}` });
  return entries;
}

/**
 * @param {unknown} value @param {Issue[]} issues
 * @returns {{ width: number, height: number, data: Uint8Array } | null}
 */
function readTarget(value, issues) {
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path: 'target', message: 'must be an object with "mask" or "rgba"' });
    return null;
  }
  unknownFields(value, TARGET_FIELDS, 'target', 'a target has', issues);
  const before = issues.length;
  if (Object.hasOwn(value, 'png')) {
    issues.push({ code: 'wrong_type', path: 'target.png', message: 'a PNG file path is read only by cli.mjs; in code, pass target.mask or target.rgba' });
  }
  const has = ['mask', 'rgba'].filter((k) => Object.hasOwn(value, k));
  if (has.length !== 1) {
    if (!Object.hasOwn(value, 'png')) {
      issues.push({ code: has.length ? 'conflicting_fields' : 'missing_field', path: 'target', message: 'give exactly one of "mask" (rows of "#" and ".") and "rgba" ({width, height, data})' });
    }
    return null;
  }
  let mask = null;
  if (has[0] === 'mask') {
    if (Object.hasOwn(value, 'darkThreshold')) {
      issues.push({ code: 'conflicting_fields', path: 'target.darkThreshold', message: 'applies only to target.rgba; a mask already says which pixels to fill' });
    }
    mask = readMask(value.mask, issues);
  } else {
    /** @type {number} */
    let threshold = DEFAULTS.darkThreshold;
    if (Object.hasOwn(value, 'darkThreshold')) {
      if (typeof value.darkThreshold === 'number' && value.darkThreshold >= 0 && value.darkThreshold <= 3) threshold = value.darkThreshold;
      else issues.push({ code: typeof value.darkThreshold === 'number' ? 'out_of_range' : 'wrong_type', path: 'target.darkThreshold', message: 'must be a number from 0 to 3 (the sum of red, green and blue, each from 0 to 1)' });
    }
    const rgba = readRgba(value.rgba, issues);
    if (rgba) mask = maskFromRgba(rgba.width, rgba.height, rgba.data, threshold);
  }
  if (mask && !mask.data.includes(1)) issues.push({ code: 'bad_target', path: `target.${has[0]}`, message: 'has no pixels to fill' });
  return issues.length > before ? null : mask;
}

/** @param {unknown} rows @param {Issue[]} issues */
function readMask(rows, issues) {
  const path = 'target.mask';
  if (!Array.isArray(rows) || !rows.length || !rows.every((r) => typeof r === 'string')) {
    issues.push({ code: 'wrong_type', path, message: 'must be a non-empty array of strings, one per pixel row, "#" to fill and "." to leave empty' });
    return null;
  }
  const width = rows[0].length;
  if (rows.length > MAX_TARGET_SIDE || width > MAX_TARGET_SIDE || width === 0) {
    issues.push({ code: 'out_of_range', path, message: `must be 1 to ${MAX_TARGET_SIDE} pixels on each side` });
    return null;
  }
  const bad = rows.findIndex((r) => r.length !== width || !/^[#.]*$/.test(r));
  if (bad !== -1) {
    issues.push({ code: 'bad_target', path: `${path}[${bad}]`, message: `every row must have ${width} characters, each "#" or "."` });
    return null;
  }
  const data = new Uint8Array(rows.length * width);
  rows.forEach((r, i) => {
    for (let j = 0; j < width; j++) data[i * width + j] = r[j] === '#' ? 1 : 0;
  });
  return { width, height: rows.length, data };
}

/** @param {unknown} value @param {Issue[]} issues */
function readRgba(value, issues) {
  const path = 'target.rgba';
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path, message: 'must be {width, height, data}, data being base64 of width × height × 4 bytes (RGBA, row by row)' });
    return null;
  }
  unknownFields(value, RGBA_FIELDS, path, 'rgba has', issues);
  const before = issues.length;
  for (const side of ['width', 'height']) {
    const v = value[side];
    if (!Number.isInteger(v) || v < 1 || v > MAX_TARGET_SIDE) {
      issues.push({ code: Number.isInteger(v) ? 'out_of_range' : 'wrong_type', path: `${path}.${side}`, message: `must be an integer from 1 to ${MAX_TARGET_SIDE}` });
    }
  }
  /** @type {Uint8Array | null} */
  let data = null;
  if (typeof value.data !== 'string') {
    issues.push({ code: 'wrong_type', path: `${path}.data`, message: 'must be a base64 string' });
  } else {
    try {
      data = Uint8Array.from(atob(value.data), (ch) => ch.charCodeAt(0));
    } catch {
      issues.push({ code: 'wrong_type', path: `${path}.data`, message: 'is not valid base64' });
    }
  }
  if (issues.length > before || !data) return null;
  if (data.length !== value.width * value.height * 4) {
    issues.push({ code: 'bad_target', path: `${path}.data`, message: `holds ${data.length} bytes; ${value.width} × ${value.height} RGBA pixels need ${value.width * value.height * 4}` });
    return null;
  }
  return { width: value.width, height: value.height, data };
}

/** @param {unknown} value @param {Issue[]} issues */
function readObjective(value, issues) {
  /** @type {Omit<Objective, 'picture'>} */
  const out = { weights: { ...DEFAULTS.weights }, desiredAreaRatio: DEFAULTS.desiredAreaRatio, desiredHvRatio: DEFAULTS.desiredHvRatio, pictureDistance: DEFAULTS.pictureDistance };
  if (value === undefined) return out;
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path: 'objective', message: `must be an object with any of ${OBJECTIVE_FIELDS.join(', ')}` });
    return out;
  }
  unknownFields(value, OBJECTIVE_FIELDS, 'objective', 'an objective has', issues);
  if (Object.hasOwn(value, 'weights')) {
    if (!isObject(value.weights)) {
      issues.push({ code: 'wrong_type', path: 'objective.weights', message: `must be an object with any of ${TERMS.join(', ')}` });
    } else {
      unknownFields(value.weights, TERMS, 'objective.weights', 'the terms are', issues);
      for (const term of TERMS) {
        if (!Object.hasOwn(value.weights, term)) continue;
        const w = value.weights[term];
        if (typeof w === 'number' && Number.isFinite(w)) out.weights[term] = w;
        else issues.push({ code: 'wrong_type', path: `objective.weights.${term}`, message: 'must be a finite number' });
      }
    }
  }
  for (const key of /** @type {const} */ (['desiredAreaRatio', 'desiredHvRatio'])) {
    if (!Object.hasOwn(value, key)) continue;
    const v = value[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[key] = v;
    else issues.push({ code: typeof v === 'number' ? 'out_of_range' : 'wrong_type', path: `objective.${key}`, message: 'must be a positive number' });
  }
  if (Object.hasOwn(value, 'pictureDistance')) {
    if (value.pictureDistance === 'scan' || value.pictureDistance === 'exact') out.pictureDistance = value.pictureDistance;
    else issues.push({ code: 'wrong_type', path: 'objective.pictureDistance', message: 'must be "scan" (as in R) or "exact"' });
  }
  return out;
}

/** @param {unknown} value @param {Issue[]} issues @returns {Search} */
function readSearch(value, issues) {
  /** @type {Search} */
  const out = { seed: DEFAULTS.seed, nXwords: DEFAULTS.nXwords, nIter: DEFAULTS.nIter, maxAttemptsWord: DEFAULTS.maxAttemptsWord, maxAttemptsXword: DEFAULTS.maxAttemptsXword };
  if (value === undefined) return out;
  const fields = Object.keys(SEARCH_LIMITS);
  if (!isObject(value)) {
    issues.push({ code: 'wrong_type', path: 'search', message: `must be an object with any of ${fields.join(', ')}` });
    return out;
  }
  unknownFields(value, fields, 'search', 'search has', issues);
  for (const key of /** @type {(keyof Search)[]} */ (fields)) {
    if (!Object.hasOwn(value, key)) continue;
    const [min, max] = SEARCH_LIMITS[key];
    const v = value[key];
    if (Number.isInteger(v) && v >= min && v <= max) out[key] = v;
    else issues.push({ code: Number.isInteger(v) ? 'out_of_range' : 'wrong_type', path: `search.${key}`, message: `must be an integer from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}` });
  }
  return out;
}

/**
 * A layout to refine instead of generating one: a crossword from a result (its
 * entries' answer, row, col and dir are used). It must place every entry's word
 * exactly once with no clashing letters. It is centred on a canvas of the size a
 * new crossword would get (or larger, if it does not fit).
 * @param {unknown} value @param {Entry[]} entries @param {Issue[]} issues
 * @returns {State | null}
 */
function readInit(value, entries, issues) {
  if (!isObject(value) || !Array.isArray(value.entries)) {
    issues.push({ code: 'wrong_type', path: 'init', message: 'must be a crossword from a result, with an "entries" array of {answer, row, col, dir}' });
    return null;
  }
  unknownFields(value, INIT_FIELDS, 'init', 'a crossword has', issues);
  const before = issues.length;
  const index = new Map(entries.map((e, i) => [e.text, i]));
  /** @type {(Cell[] | null)[]} */
  const locs = entries.map(() => null);
  value.entries.forEach((/** @type {unknown} */ item, /** @type {number} */ i) => {
    const path = `init.entries[${i}]`;
    if (!isObject(item)) {
      issues.push({ code: 'wrong_type', path, message: 'must be an object with answer, row, col and dir' });
      return;
    }
    unknownFields(item, INIT_ENTRY_FIELDS, path, 'an entry has', issues);
    const ok = typeof item.answer === 'string' && Number.isInteger(item.row) && item.row >= 0
      && Number.isInteger(item.col) && item.col >= 0 && (item.dir === 'across' || item.dir === 'down');
    if (!ok) {
      issues.push({ code: 'wrong_type', path, message: 'needs answer (a string), row and col (integers from 0) and dir ("across" or "down")' });
      return;
    }
    const w = index.get(gridWord(item.answer).text);
    if (w === undefined) {
      issues.push({ code: 'bad_init', path: `${path}.answer`, message: `"${item.answer}" is not one of the request's answers` });
    } else if (locs[w]) {
      issues.push({ code: 'bad_init', path: `${path}.answer`, message: `"${item.answer}" is placed twice` });
    } else {
      const across = item.dir === 'across';
      locs[w] = entries[w].cells.map((_, k) => /** @type {Cell} */ (across ? [item.row, item.col + k] : [item.row + k, item.col]));
    }
  });
  locs.forEach((l, w) => {
    if (!l && issues.length === before) issues.push({ code: 'bad_init', path: 'init.entries', message: `does not place "${entries[w].answer}"` });
  });
  if (issues.length > before) return null;

  const placed = /** @type {Cell[][]} */ (locs);
  const all = placed.flat();
  const minR = Math.min(...all.map(([r]) => r));
  const minC = Math.min(...all.map(([, c]) => c));
  const rows = Math.max(...all.map(([r]) => r)) - minR + 1;
  const cols = Math.max(...all.map(([, c]) => c)) - minC + 1;
  const size = Math.max(canvasSize(entries), rows, cols);
  const dr = Math.floor((size - rows) / 2) - minR;
  const dc = Math.floor((size - cols) / 2) - minC;
  const cells = new Array(size * size).fill('');
  placed.forEach((word, w) => {
    word.forEach(([r, c], k) => {
      const i = (r + dr) * size + c + dc;
      const ch = entries[w].cells[k];
      if (cells[i] !== '' && cells[i] !== ch) {
        issues.push({ code: 'bad_init', path: 'init.entries', message: `"${entries[w].answer}" puts "${ch}" on row ${r}, column ${c}, which already holds "${cells[i]}"` });
      }
      cells[i] = ch;
    });
  });
  if (issues.length > before) return null;
  return { rows: size, cols: size, cells, locs: placed.map((word) => word.map(([r, c]) => /** @type {Cell} */ ([r + dr, c + dc]))) };
}
