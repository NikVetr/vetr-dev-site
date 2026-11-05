// Request validation. Everything that turns outside input into checked settings
// lives here, so the API, the CLI and the page reject the same things with the
// same messages.

import { HypercubeError, isObject } from './errors.js';

/** @typedef {import('./errors.js').Issue} Issue */
/** @typedef {import('./geometry.js').Quat} Quat */
/**
 * @typedef {{
 *   k: number, frame: number | null, t: number | null, render: 'svg' | 'geometry', style: 'translucent' | 'opaque',
 *   faceAlpha: number | null, numerals: boolean, theme: 'light' | 'dark', size: number, camera: Quat, caption: boolean,
 * }} Settings frame/t: at most one is set; faceAlpha null means the plan's
 */

/** The plans shipped with the page, one per maximum dimension. */
export const SHIPPED_K = Object.freeze([3, 4, 5, 6, 7, 8, 9]);

export const DEFAULTS = Object.freeze({
  frame: 1, render: 'svg', style: 'translucent', numerals: true, theme: 'light', size: 800,
  camera: Object.freeze([1, 0, 0, 0]), caption: false,
});

const FIELDS = ['k', 'frame', 't', 'render', 'style', 'faceAlpha', 'numerals', 'theme', 'size', 'camera', 'caption'];
const CHOICES = /** @type {const} */ ({ render: ['svg', 'geometry'], style: ['translucent', 'opaque'], theme: ['light', 'dark'] });

/**
 * Checks a request and fills in defaults. Throws one HypercubeError
 * ('invalid_request') listing every problem. The frame's upper limit depends on
 * the plan and is checked by checkFrame.
 * @param {unknown} request
 * @returns {Settings}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object' }]);
  /** @type {Issue[]} */
  const issues = [];
  for (const key of Object.keys(request)) {
    if (!FIELDS.includes(key)) issues.push({ code: 'unknown_field', path: key, message: `unknown field; the fields are ${FIELDS.join(', ')}` });
  }
  const has = (/** @type {string} */ key) => Object.hasOwn(request, key);
  const integer = (/** @type {string} */ key, /** @type {number} */ min, /** @type {number} */ max) => {
    const value = request[key];
    if (!Number.isInteger(value)) issues.push({ code: 'wrong_type', path: key, message: 'must be an integer' });
    else if (value < min || value > max) issues.push({ code: 'out_of_range', path: key, message: `must be from ${min} to ${max}` });
    else return value;
    return null;
  };
  const choice = (/** @type {keyof typeof CHOICES} */ key) => {
    const options = /** @type {readonly string[]} */ (CHOICES[key]);
    if (!has(key)) return DEFAULTS[key];
    if (!options.includes(request[key])) issues.push({ code: 'invalid_choice', path: key, message: `must be one of ${options.map((o) => `"${o}"`).join(', ')}` });
    return options.includes(request[key]) ? request[key] : DEFAULTS[key];
  };
  const boolean = (/** @type {'numerals' | 'caption'} */ key) => {
    if (!has(key)) return DEFAULTS[key];
    if (typeof request[key] !== 'boolean') issues.push({ code: 'wrong_type', path: key, message: 'must be true or false' });
    return request[key] === true;
  };

  let k = 0;
  if (!has('k')) issues.push({ code: 'missing_field', path: 'k', message: `the request needs "k", the maximum dimension (plans exist for ${SHIPPED_K.join(', ')})` });
  else k = integer('k', 3, 12) ?? 0;

  /** @type {number | null} */
  let frame = null;
  /** @type {number | null} */
  let t = null;
  if (has('frame') && has('t')) issues.push({ code: 'conflicting_fields', path: 't', message: 'give either "frame" or "t", not both' });
  if (has('frame')) frame = integer('frame', 1, 1_000_000);
  else if (has('t')) {
    if (typeof request.t !== 'number' || !Number.isFinite(request.t)) issues.push({ code: 'wrong_type', path: 't', message: 'must be a finite number of seconds' });
    else if (request.t < 0) issues.push({ code: 'out_of_range', path: 't', message: 'must be 0 or more seconds' });
    else t = request.t;
  } else frame = DEFAULTS.frame;

  const render = choice('render');
  const style = choice('style');
  const theme = choice('theme');
  /** @type {number | null} */
  let faceAlpha = null;
  if (has('faceAlpha')) {
    if (style !== 'translucent') issues.push({ code: 'not_applicable', path: 'faceAlpha', message: 'applies only to style "translucent"; opaque faces have opacity 1' });
    else if (typeof request.faceAlpha !== 'number' || !Number.isFinite(request.faceAlpha)) issues.push({ code: 'wrong_type', path: 'faceAlpha', message: 'must be a number from 0 to 1' });
    else if (request.faceAlpha < 0 || request.faceAlpha > 1) issues.push({ code: 'out_of_range', path: 'faceAlpha', message: 'must be from 0 to 1' });
    else faceAlpha = request.faceAlpha;
  }
  if (has('numerals') && style !== 'opaque') issues.push({ code: 'not_applicable', path: 'numerals', message: 'applies only to style "opaque"' });
  const numerals = boolean('numerals');
  if (has('caption') && render !== 'svg') issues.push({ code: 'not_applicable', path: 'caption', message: 'applies only to render "svg"' });
  const caption = boolean('caption');
  const size = has('size') ? integer('size', 16, 4096) ?? DEFAULTS.size : DEFAULTS.size;

  /** @type {Quat} */
  let camera = /** @type {Quat} */ ([...DEFAULTS.camera]);
  if (has('camera')) {
    const q = request.camera;
    if (!Array.isArray(q) || q.length !== 4 || !q.every((c) => typeof c === 'number' && Number.isFinite(c))) {
      issues.push({ code: 'wrong_type', path: 'camera', message: 'must be a unit quaternion [w, x, y, z] of four finite numbers' });
    } else if (Math.abs(Math.hypot(...q) - 1) > 1e-6) {
      issues.push({ code: 'out_of_range', path: 'camera', message: `must have length 1 (within 1e-6); its length is ${Math.hypot(...q)}` });
    } else camera = /** @type {Quat} */ (q.map((c) => c / Math.hypot(...q)));
  }
  if (issues.length) throw invalid(issues);
  return { k, frame, t, render, style, faceAlpha, numerals, theme, size, camera, caption };
}

/**
 * The 1-based frame a request asks for. `t` wraps around the loop, at the plan's
 * steps per second.
 * @param {Settings} settings @param {number} frames @param {number} stepsPerSecond
 */
export function checkFrame(settings, frames, stepsPerSecond) {
  if (settings.t !== null) return (Math.floor(settings.t * stepsPerSecond + 1e-9) % frames) + 1;
  const frame = /** @type {number} */ (settings.frame);
  if (frame > frames) throw invalid([{ code: 'out_of_range', path: 'frame', message: `must be from 1 to ${frames}, the frames of the k = ${settings.k} plan` }]);
  return frame;
}

/** @param {Issue[]} issues */
function invalid(issues) {
  const list = issues.map((i) => `${i.path || 'request'}: ${i.message}`).join('; ');
  return new HypercubeError('invalid_request', `The request has ${issues.length === 1 ? 'a problem' : `${issues.length} problems`}: ${list}`, issues);
}
