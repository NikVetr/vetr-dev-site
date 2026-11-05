// Request validation: every problem is collected and thrown as one PhotomosaicError.

import { METRICS } from './color.js';

/** @typedef {{ code: string, path: string, message: string }} Issue */
/** @typedef {import('./color.js').Metric} Metric */
/**
 * @typedef {{
 *   target: { width: number, height: number, data: Uint8Array },
 *   means: Float64Array, names: (string | null)[],
 *   columns: number | null, maxUses: number, metric: Metric, seed: number }} Problem
 *   means holds each photo's r, g, b, a in turn.
 */

export class PhotomosaicError extends Error {
  /** @param {string} code @param {string} message @param {Issue[]} [issues] */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'PhotomosaicError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** The defaults: the R script's method. */
export const DEFAULTS = Object.freeze({ columns: null, maxUses: 1, metric: /** @type {Metric} */ ('hsl-r'), seed: 1 });

const FIELDS = ['target', 'photos', 'columns', 'maxUses', 'metric', 'seed'];

/** @param {unknown} x @returns {x is Record<string, any>} */
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
/** @param {unknown} x @param {number} min @param {number} [max] */
const isWhole = (x, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(x) && /** @type {number} */ (x) >= min && /** @type {number} */ (x) <= max;

/** @param {Issue[]} issues */
export function invalid(issues) {
  const first = issues[0];
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more issue${issues.length > 2 ? 's' : ''})` : '';
  return new PhotomosaicError('invalid_request', `Invalid request: ${first.path ? `${first.path}: ` : ''}${first.message}${more}`, issues);
}

/**
 * Checks a request and decodes its target. Throws one PhotomosaicError listing every issue.
 * @param {unknown} request see api.md
 * @returns {Problem}
 */
export function readRequest(request) {
  /** @type {Issue[]} */
  const issues = [];
  const add = (/** @type {string} */ path, /** @type {string} */ code, /** @type {string} */ message) => issues.push({ code, path, message });
  /** @param {Record<string, any>} x @param {string} prefix @param {string[]} known @param {string[]} required */
  const checkFields = (x, prefix, known, required) => {
    for (const f of Object.keys(x)) if (!known.includes(f)) add(prefix + f, 'unknown_field', 'unknown field');
    for (const f of required) if (!(f in x)) add(prefix + f, 'missing_field', 'required');
  };

  if (!isObject(request)) throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be an object' }]);
  checkFields(request, '', FIELDS, ['target', 'photos']);

  /** @type {Problem['target']} */
  let target = { width: 0, height: 0, data: new Uint8Array(0) };
  const t = request.target;
  if (t !== undefined && !isObject(t)) add('target', 'wrong_type', 'must be an object {width, height, data}');
  else if (t !== undefined) {
    checkFields(t, 'target.', ['width', 'height', 'data'], ['width', 'height', 'data']);
    const sizeOk = ['width', 'height'].every((f) => {
      if (!(f in t)) return false;
      if (isWhole(t[f], 1)) return true;
      add(`target.${f}`, 'out_of_range', 'must be a whole number >= 1');
      return false;
    });
    if ('data' in t) {
      if (typeof t.data !== 'string') add('target.data', 'wrong_type', 'must be a base64 string of the RGBA bytes');
      else {
        let bytes = null;
        try {
          const binary = atob(t.data);
          bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } catch {
          add('target.data', 'wrong_type', 'is not valid base64');
        }
        if (bytes && sizeOk) {
          const want = 4 * t.width * t.height;
          if (bytes.length !== want) add('target.data', 'wrong_length', `decodes to ${bytes.length} bytes; ${t.width} × ${t.height} RGBA needs ${want}`);
          else target = { width: t.width, height: t.height, data: bytes };
        }
      }
    }
  }

  const photos = request.photos;
  /** @type {(string | null)[]} */
  const names = [];
  let means = new Float64Array(0);
  if (photos !== undefined && (!Array.isArray(photos) || photos.length === 0)) add('photos', 'wrong_type', 'must be a non-empty array of {mean, name}');
  else if (photos !== undefined) {
    means = new Float64Array(4 * photos.length);
    photos.forEach((/** @type {unknown} */ p, /** @type {number} */ i) => {
      const path = `photos[${i}]`;
      names.push(null);
      if (!isObject(p)) {
        add(path, 'wrong_type', 'must be an object {mean, name}');
        return;
      }
      checkFields(p, `${path}.`, ['mean', 'name'], ['mean']);
      if ('name' in p) {
        if (typeof p.name === 'string') names[i] = p.name;
        else add(`${path}.name`, 'wrong_type', 'must be a string');
      }
      if (!('mean' in p)) return;
      if (Array.isArray(p.mean) && p.mean.length === 4 && p.mean.every((v) => typeof v === 'number' && v >= 0 && v <= 255)) means.set(p.mean, 4 * i);
      else add(`${path}.mean`, 'out_of_range', 'must be [red, green, blue, alpha], each from 0 to 255');
    });
  }

  const rules = /** @type {const} */ ([
    ['columns', (/** @type {unknown} */ x) => x === null || isWhole(x, 1), 'null (the R rule) or a whole number >= 1'],
    ['maxUses', (/** @type {unknown} */ x) => isWhole(x, 1), 'a whole number >= 1'],
    ['metric', (/** @type {unknown} */ x) => METRICS.includes(/** @type {any} */ (x)), `one of ${METRICS.join(', ')}`],
    ['seed', (/** @type {unknown} */ x) => isWhole(x, 0, 2147483647), 'a whole number from 0 to 2147483647'],
  ]);
  /** @type {Record<string, any>} */
  const settings = { ...DEFAULTS };
  for (const [f, ok, what] of rules) {
    if (!(f in request)) continue;
    if (ok(request[f])) settings[f] = request[f];
    else add(f, 'out_of_range', `must be ${what}`);
  }

  if (issues.length) throw invalid(issues);
  return { target, means, names, columns: settings.columns, maxUses: settings.maxUses, metric: settings.metric, seed: settings.seed };
}
