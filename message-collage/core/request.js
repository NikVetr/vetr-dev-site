// Request defaults and validation. Everything that turns outside input into the settings the
// layout runs on lives here, so the API, the command line and the page reject exactly the same
// requests with the same messages. Field names and defaults are the R version's
// (R/request.R in NikVetr/message-collage), so a request can be run by both.

import { FAMILIES } from './catalogue.js';

/**
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {'plain' | 'bold' | 'italic' | 'bold-italic'} StyleName
 * @typedef {{
 *   messages: string[], fonts: string[], styles: StyleName[], size_range: [number, number],
 *   width_in: number, height_in: number, grid_res: number | null, fill: number,
 *   line_gap: number, message_gap: number, palette: string[], background: string,
 *   shuffle: boolean, seed: number, runs: number, rotation_deg: number,
 * }} Request
 */

export class CollageError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Issue[]} [issues]
   */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'CollageError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** R's face codes (par font): 1 plain, 2 bold, 3 italic, 4 bold-italic. */
export const STYLE_CODES = /** @type {const} */ ({ plain: 1, bold: 2, italic: 3, 'bold-italic': 4 });
export const STYLE_NAMES = /** @type {StyleName[]} */ (Object.keys(STYLE_CODES));

/** The R version's defaults, apart from the fonts, which are the bundled families. */
export const DEFAULTS = Object.freeze({
  fonts: Object.freeze(Object.keys(FAMILIES)),
  styles: Object.freeze([...STYLE_NAMES]),
  size_range: Object.freeze([1, 3]),
  width_in: 5,
  height_in: 5,
  grid_res: null,
  fill: 0.7,
  line_gap: 0.2,
  message_gap: 0.4,
  palette: Object.freeze(['#899DA4', '#C93312', '#FAEFD1', '#DC863B', // wesanderson Royal1
    '#9A8822', '#F5CDB4', '#F8AFA8', '#FDDDA0', '#74A089']), // wesanderson Royal2
  background: '#191b30',
  shuffle: true,
  seed: 1,
  runs: 1,
  rotation_deg: 0,
});

export const LIMITS = Object.freeze({
  messages: 1000,
  messageLength: 2000,
  side_in: [0.5, 60],
  grid_res: [1, 400],
  runs: 1000,
  seed: 2147483647,
});

const FIELDS = ['messages', ...Object.keys(DEFAULTS)];
const COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * R's trimws() then gsub("\\s+", " ", .): ends trimmed of [ \t\r\n], then every run of
 * whitespace (as R's regex engine classes it in a UTF-8 locale) made one space.
 * @param {string} text
 */
export function collapseWhitespace(text) {
  return text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
    .replace(/[\t\n\v\f\r \u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+/g, ' ');
}

/**
 * Messages from text, one per line; blank lines are skipped. The page's text box and the
 * command line's --messages file use this.
 * @param {string} text
 */
export function parseMessages(text) {
  return text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
}

/**
 * Validates a request and fills in defaults. Throws one CollageError listing every problem.
 * @param {unknown} request
 * @returns {Request}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object' }]);
  /** @type {Issue[]} */
  const issues = [];
  for (const key of Object.keys(request)) {
    if (!FIELDS.includes(key)) issues.push({ code: 'unknown_field', path: key, message: `unknown field; the fields are ${FIELDS.join(', ')}` });
  }
  const has = (/** @type {string} */ key) => Object.hasOwn(request, key) && request[key] !== null;
  const get = (/** @type {keyof typeof DEFAULTS} */ key) => (has(key) ? request[key] : DEFAULTS[key]);

  const messages = readMessages(request.messages, Object.hasOwn(request, 'messages'), issues);
  const fonts = readList(get('fonts'), 'fonts', issues, (name, path) => {
    if (typeof name !== 'string' || !Object.hasOwn(FAMILIES, name)) {
      issues.push({ code: 'unknown_font', path, message: `must be one of the bundled families: ${Object.keys(FAMILIES).join(', ')}` });
    }
  });
  const styles = readList(get('styles'), 'styles', issues, (name, path) => {
    if (typeof name !== 'string' || !Object.hasOwn(STYLE_CODES, name)) {
      issues.push({ code: 'unknown_style', path, message: `must be one of ${STYLE_NAMES.join(', ')}` });
    }
  });

  const sizeRange = get('size_range');
  if (!Array.isArray(sizeRange) || sizeRange.length !== 2 || !sizeRange.every(isFiniteNumber) || sizeRange[0] <= 0 || sizeRange[1] < sizeRange[0]) {
    issues.push({ code: 'invalid_value', path: 'size_range', message: 'must be two positive numbers [min, max] with min <= max' });
  }
  const number = (/** @type {keyof typeof DEFAULTS} */ key, /** @type {(x: number) => boolean} */ ok, /** @type {string} */ rule) => {
    const value = get(key);
    if (!isFiniteNumber(value) || !ok(value)) issues.push({ code: 'invalid_value', path: key, message: `must be ${rule}` });
    return value;
  };
  const [lo, hi] = LIMITS.side_in;
  number('width_in', (x) => x >= lo && x <= hi, `a number of inches from ${lo} to ${hi}`);
  number('height_in', (x) => x >= lo && x <= hi, `a number of inches from ${lo} to ${hi}`);
  number('fill', (x) => x > 0, 'a positive number');
  number('line_gap', (x) => x >= 0, 'a non-negative number');
  number('message_gap', (x) => x >= 0, 'a non-negative number');
  number('rotation_deg', (x) => x >= 0 && x <= 10, 'an angle from 0 to 10 degrees');
  if (has('grid_res')) number('grid_res', (x) => x >= LIMITS.grid_res[0] && x <= LIMITS.grid_res[1], `null or a number of cells per inch from ${LIMITS.grid_res[0]} to ${LIMITS.grid_res[1]}`);
  const runs = number('runs', (x) => Number.isInteger(x) && x >= 1 && x <= LIMITS.runs, `an integer from 1 to ${LIMITS.runs}`);
  number('seed', (x) => Number.isInteger(x) && Math.abs(x) <= LIMITS.seed, `an integer from -${LIMITS.seed} to ${LIMITS.seed}`);
  if (Number.isInteger(get('seed')) && Number.isInteger(runs) && get('seed') + runs > LIMITS.seed) {
    issues.push({ code: 'invalid_value', path: 'seed', message: `seed + runs must be at most ${LIMITS.seed} (each run is seeded with seed + its number, as R's integer seeds)` });
  }

  const palette = readList(get('palette'), 'palette', issues, (color, path) => {
    if (typeof color !== 'string' || !COLOR.test(color)) issues.push({ code: 'invalid_color', path, message: 'must be a colour as #rrggbb' });
  }, true);
  const background = get('background');
  if (typeof background !== 'string' || !COLOR.test(background)) issues.push({ code: 'invalid_color', path: 'background', message: 'must be a colour as #rrggbb' });
  if (typeof get('shuffle') !== 'boolean') issues.push({ code: 'wrong_type', path: 'shuffle', message: 'must be true or false' });

  if (issues.length) throw invalid(issues);
  return {
    messages: /** @type {string[]} */ (messages),
    fonts: [...fonts],
    styles: [...styles],
    size_range: [sizeRange[0], sizeRange[1]],
    width_in: get('width_in'),
    height_in: get('height_in'),
    grid_res: has('grid_res') ? request.grid_res : null,
    fill: get('fill'),
    line_gap: get('line_gap'),
    message_gap: get('message_gap'),
    palette: [...palette],
    background,
    shuffle: get('shuffle'),
    seed: get('seed'),
    runs,
    rotation_deg: get('rotation_deg'),
  };
}

/**
 * @param {unknown} value @param {boolean} given @param {Issue[]} issues
 * @returns {string[] | null} the messages with whitespace collapsed
 */
function readMessages(value, given, issues) {
  if (!given) {
    issues.push({ code: 'missing_field', path: 'messages', message: 'the request needs "messages", an array of message strings' });
    return null;
  }
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ code: 'wrong_type', path: 'messages', message: 'must be a non-empty array of strings' });
    return null;
  }
  if (value.length > LIMITS.messages) {
    issues.push({ code: 'too_many', path: 'messages', message: `has ${value.length} messages; at most ${LIMITS.messages} are allowed` });
    return null;
  }
  return value.map((text, i) => {
    const path = `messages[${i}]`;
    if (typeof text !== 'string') {
      issues.push({ code: 'wrong_type', path, message: 'must be a string' });
      return '';
    }
    const clean = collapseWhitespace(text);
    if (clean === '') issues.push({ code: 'empty_message', path, message: 'is empty' });
    else if ([...clean].length > LIMITS.messageLength) issues.push({ code: 'too_long', path, message: `has ${[...clean].length} characters; at most ${LIMITS.messageLength} are allowed` });
    return clean;
  });
}

/**
 * A non-empty array whose entries each pass `check` and, unless duplicates are allowed, are distinct.
 * @param {unknown} value @param {string} path @param {Issue[]} issues
 * @param {(entry: any, path: string) => void} check
 * @param {boolean} [allowDuplicates] the palette may repeat a colour, as in R
 * @returns {any[]}
 */
function readList(value, path, issues, check, allowDuplicates = false) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ code: 'wrong_type', path, message: 'must be a non-empty array' });
    return [];
  }
  value.forEach((entry, i) => {
    check(entry, `${path}[${i}]`);
    if (!allowDuplicates && value.indexOf(entry) !== i) issues.push({ code: 'duplicate', path: `${path}[${i}]`, message: `repeats "${entry}"` });
  });
  return value;
}

/** @param {unknown} x @returns {x is number} */
function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Issue[]} issues */
export function invalid(issues) {
  const shown = issues.slice(0, 3).map((issue) => `${issue.path || 'request'}: ${issue.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new CollageError('invalid_request', `Invalid request: ${shown.join('; ')}`, issues);
}
