// Request validation. The request mirrors the R version's default_request()
// with camelCase names; every field but `image` is optional and unknown fields
// are rejected. Problems are collected and thrown together, so the API, the
// CLI and the page reject the same requests with the same messages.

import { WAVELET_LOWPASS } from './wavelet.js';

/**
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {typeof DEFAULTS} Settings
 * @typedef {{ width: number, height: number, data: Uint8Array }} Image
 */

export class RasterToVectorError extends Error {
  /** @param {string} code @param {string} message @param {Issue[]} [issues] */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'RasterToVectorError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** The R version's defaults. */
export const DEFAULTS = Object.freeze({
  preprocess: Object.freeze({ maxDim: /** @type {number | null} */ (null), scale: 1, pad: 3 }),
  quantize: Object.freeze({
    k: /** @type {'auto' | number} */ ('auto'), kRange: Object.freeze([3, 4, 5, 6, 7, 8, 9, 10]), offset: 0, nTop: 300, digits: 2,
    alphaThreshold: 0.1, seeding: /** @type {'weighted' | 'unweighted'} */ ('weighted'), space: /** @type {'rgb' | 'oklab'} */ ('rgb'), seed: 1,
  }),
  clean: Object.freeze({ minRun: 3, passes: 1 }),
  trace: Object.freeze({ method: /** @type {'marching_squares' | 'original'} */ ('marching_squares'), minLength: 9, kconvInit: 1 }),
  smooth: Object.freeze({
    method: /** @type {'wavelet' | 'fourier' | 'hadamard' | 'none'} */ ('wavelet'),
    wavelet: Object.freeze({ filter: /** @type {import('./wavelet.js').Filter} */ ('mb4'), nLevels: /** @type {'auto' | number} */ ('auto'), thresholdMultiplier: 3, noise: /** @type {'sd' | 'mad'} */ ('sd') }),
    fourier: Object.freeze({ threshold: /** @type {'original' | 'universal'} */ ('original') }),
  }),
  order: Object.freeze({ threshold: 0.95 }),
  output: Object.freeze({ holes: /** @type {'transparent' | 'all' | 'none'} */ ('transparent'), transparentAlpha: 0.2, digits: 2 }),
});

/** R options that are refused, with the reason given in the issue. */
const NOT_PORTED = /** @type {Record<string, string>} */ ({
  'quantize.cores': 'forked k-means restarts (parallel::mclapply) are R only; the restarts run in one thread here, as R does with cores = 1, so leave the field out',
});

/** @param {string} path */
const notPorted = (path) => ({ code: 'NOT_PORTED', path, message: `not ported: ${NOT_PORTED[path]}` });

const int = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isInteger(v);
const num = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Field checks: [test, what the value must be]. Paths are those of DEFAULTS.
 * @type {Record<string, [(v: any) => boolean, string]>}
 */
const RULES = {
  'preprocess.maxDim': [(v) => v === null || (int(v) && v >= 8), 'null or an integer of at least 8'],
  'preprocess.scale': [(v) => int(v) && v >= 1, 'an integer of at least 1'],
  'preprocess.pad': [(v) => int(v) && v >= 0, 'an integer of at least 0'],
  'quantize.k': [(v) => v === 'auto' || (int(v) && v >= 1), '"auto" or an integer of at least 1'],
  'quantize.kRange': [(v) => Array.isArray(v) && v.length > 0 && v.every((k) => int(k) && k >= 2) && new Set(v).size === v.length, 'a non-empty array of distinct integers of at least 2'],
  'quantize.offset': [(v) => int(v) && v >= 0, 'an integer of at least 0 (added to the chosen k\'s position in kRange)'],
  'quantize.nTop': [(v) => int(v) && v >= 1, 'an integer of at least 1'],
  'quantize.digits': [(v) => int(v) && v >= 0 && v <= 6, 'an integer from 0 to 6'],
  'quantize.alphaThreshold': [(v) => num(v) && v >= 0 && v <= 1, 'a number from 0 to 1'],
  'quantize.seeding': [(v) => v === 'weighted' || v === 'unweighted', 'one of: weighted, unweighted'],
  'quantize.space': [(v) => v === 'rgb' || v === 'oklab', 'one of: rgb, oklab'],
  'quantize.seed': [(v) => int(v) && Math.abs(v) <= 2147483647, 'an integer from -2147483647 to 2147483647, as set.seed() takes'],
  'clean.minRun': [(v) => int(v) && v >= 1, 'an integer of at least 1 (1 leaves the labels as they are)'],
  'clean.passes': [(v) => int(v) && v >= 1, 'an integer of at least 1 (R runs one pass for 0, as 1:0 counts down; use minRun: 1 for no cleanup)'],
  'trace.method': [(v) => v === 'marching_squares' || v === 'original', 'one of: marching_squares, original'],
  'trace.minLength': [(v) => int(v) && v >= 3, 'an integer of at least 3 (shorter closed chains are not polygons)'],
  'trace.kconvInit': [(v) => int(v) && v >= 1, 'an integer of at least 1'],
  'smooth.method': [(v) => ['wavelet', 'fourier', 'hadamard', 'none'].includes(v), 'one of: wavelet, fourier, hadamard, none'],
  'smooth.wavelet.filter': [(v) => Object.hasOwn(WAVELET_LOWPASS, v), `one of: ${Object.keys(WAVELET_LOWPASS).join(', ')}`],
  'smooth.wavelet.nLevels': [(v) => v === 'auto' || (int(v) && v >= 1), '"auto" or an integer of at least 1'],
  'smooth.wavelet.thresholdMultiplier': [(v) => num(v) && v >= 0, 'a number of at least 0'],
  'smooth.wavelet.noise': [(v) => v === 'sd' || v === 'mad', 'one of: sd, mad'],
  'smooth.fourier.threshold': [(v) => v === 'original' || v === 'universal', 'one of: original, universal'],
  'order.threshold': [(v) => num(v) && v > 0 && v <= 1, 'a number greater than 0 and at most 1'],
  'output.holes': [(v) => ['transparent', 'all', 'none'].includes(v), 'one of: transparent, all, none'],
  'output.transparentAlpha': [(v) => num(v) && v >= 0 && v <= 1, 'a number from 0 to 1'],
  'output.digits': [(v) => int(v) && v >= 0 && v <= 10, 'an integer from 0 to 10'],
};

/**
 * Validates a request and fills in defaults. Throws one RasterToVectorError
 * listing every problem.
 * @param {unknown} request
 * @returns {{ image: Image, settings: Settings }}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) {
    throw invalid([{ code: 'INVALID_REQUEST', path: '', message: 'the request must be a JSON object with an "image"' }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  const image = readImage(request.image, issues);
  const settings = merge(request, { image: null, ...DEFAULTS }, '', issues);
  delete settings.image;
  if (issues.length) throw invalid(issues);
  return { image: /** @type {Image} */ (image), settings: /** @type {Settings} */ (settings) };
}

/**
 * Copies `value` over `defaults`, section by section, checking each leaf.
 * @param {Record<string, any>} value @param {Record<string, any>} defaults @param {string} path @param {Issue[]} issues
 * @returns {Record<string, any>}
 */
function merge(value, defaults, path, issues) {
  /** @type {Record<string, any>} */
  const out = structuredClone(defaults);
  for (const key of Object.keys(value)) {
    const at = path ? `${path}.${key}` : key;
    if (at === 'image') continue;
    if (Object.hasOwn(NOT_PORTED, at)) {
      issues.push(notPorted(at));
    } else if (!Object.hasOwn(defaults, key)) {
      const known = Object.keys(defaults).filter((k) => k !== 'image');
      issues.push({ code: 'UNKNOWN_FIELD', path: at, message: `unknown field; ${path || 'the request'} has ${known.join(', ')}` });
    } else if (isObject(defaults[key])) {
      if (isObject(value[key])) out[key] = merge(value[key], defaults[key], at, issues);
      else issues.push({ code: 'INVALID_FIELD', path: at, message: `must be an object with any of ${Object.keys(defaults[key]).join(', ')}` });
    } else {
      const [ok, what] = RULES[at];
      if (ok(value[key])) out[key] = Array.isArray(value[key]) ? [...value[key]] : value[key];
      else issues.push({ code: 'INVALID_FIELD', path: at, message: `must be ${what}` });
    }
  }
  return out;
}

/**
 * @param {unknown} value @param {Issue[]} issues
 * @returns {Image | null}
 */
function readImage(value, issues) {
  const path = 'image';
  if (value === undefined) {
    issues.push({ code: 'MISSING_FIELD', path, message: 'the request needs an "image": {width, height, data} with data RGBA bytes, row by row' });
    return null;
  }
  if (typeof value === 'string') {
    issues.push({ code: 'INVALID_IMAGE', path, message: 'a file path is read only by cli.mjs; in code, pass {width, height, data} with data RGBA bytes' });
    return null;
  }
  if (!isObject(value)) {
    issues.push({ code: 'INVALID_IMAGE', path, message: 'must be {width, height, data} with data width × height × 4 RGBA bytes (0 to 255), row by row from the top left' });
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!['width', 'height', 'data'].includes(key)) issues.push({ code: 'UNKNOWN_FIELD', path: `${path}.${key}`, message: 'unknown field; an image has width, height, data' });
  }
  const before = issues.length;
  for (const side of ['width', 'height']) {
    if (!(int(value[side]) && value[side] >= 1)) issues.push({ code: 'INVALID_IMAGE', path: `${path}.${side}`, message: 'must be an integer of at least 1' });
  }
  const { data } = value;
  const arrayLike = data instanceof Uint8Array || data instanceof Uint8ClampedArray || Array.isArray(data);
  if (!arrayLike) {
    issues.push({ code: 'INVALID_IMAGE', path: `${path}.data`, message: 'must be an array, Uint8Array or Uint8ClampedArray of RGBA bytes' });
  } else if (issues.length === before) {
    const need = value.width * value.height * 4;
    if (data.length !== need) {
      issues.push({ code: 'INVALID_IMAGE', path: `${path}.data`, message: `holds ${data.length} values; ${value.width} × ${value.height} RGBA pixels need ${need}` });
    } else if (Array.isArray(data) && !data.every((v) => int(v) && v >= 0 && v <= 255)) {
      issues.push({ code: 'INVALID_IMAGE', path: `${path}.data`, message: 'must hold integers from 0 to 255' });
    }
  }
  if (issues.length > before) return null;
  return { width: value.width, height: value.height, data: Uint8Array.from(data) };
}

/** @param {Issue[]} issues */
function invalid(issues) {
  const shown = issues.slice(0, 3).map((i) => `${i.path || 'request'}: ${i.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new RasterToVectorError('INVALID_REQUEST', `Invalid request: ${shown.join('; ')}`, issues);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value);
}
