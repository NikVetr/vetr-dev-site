import { generateCode, designMatrix, FEATURE_SUPPORT } from './modules/generate.js';
import { norm } from './modules/geometry.js';
/** @param {string} path @param {string} message @returns {never} */
function invalid(path, message) {
  throw Object.assign(new Error(message), {
    code: 'invalid_request', issues: [{ code: 'invalid_value', path, message }],
  });
}

/** @param {any} value @param {string[]} keys @param {string} [path] */
function checkFields(value, keys, path = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'Expected an object.');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) invalid(path ? path + '.' + key : key, 'Unknown field.');
  }
}

/** @param {any} request */
export function submit(request) {
  const options = ['incSetup', 'incURL', 'incExample', 'incLabels'];
  checkFields(request, ['rows', 'cols', 'rects', 'renderer', 'aliases', 'colours', 'aspect', 'labelMode', ...options]);
  const state = { aliases: [], colours: [], aspect: null, renderer: 'layout', labelMode: 'alpha',
    incSetup: true, incURL: true, incExample: false, incLabels: false, ...request };
  for (const key of ['rows', 'cols']) {
    if (!Number.isSafeInteger(state[key]) || state[key] < 1) invalid(key, 'Expected a positive grid dimension.');
  }
  if (state.rows * state.cols > 1_000_000) invalid('rows', 'The grid exceeds one million cells.');
  if (!Array.isArray(state.rects)) invalid('rects', 'Expected an array of rectangles.');
  if (typeof state.renderer !== 'string' || !Object.hasOwn(FEATURE_SUPPORT, state.renderer)) invalid('renderer', 'Unknown renderer.');
  if (!['alpha', 'num'].includes(state.labelMode)) invalid('labelMode', 'Choose alpha or num.');
  if (state.aspect !== null && (!Number.isFinite(state.aspect) || state.aspect <= 0)) invalid('aspect', 'Expected a positive aspect ratio.');
  for (const key of options) if (typeof state[key] !== 'boolean') invalid(key, 'Expected a boolean.');
  for (const key of ['aliases', 'colours']) {
    if (!Array.isArray(state[key]) || !state[key].every(value => value === null || typeof value === 'string')) invalid(key, 'Expected an array of strings or null.');
  }
  const occupied = new Uint8Array(state.rows * state.cols);
  for (const [i, rect] of state.rects.entries()) {
    const path = 'rects[' + i + ']';
    checkFields(rect, ['r0', 'c0', 'r1', 'c1', 'color', 'fill', 'stroke', 'col'], path);
    for (const k of ['r0', 'r1', 'c0', 'c1']) {
      if (!Number.isInteger(rect[k]) || rect[k] < 0 || rect[k] > (k.startsWith('r') ? state.rows : state.cols)) invalid(path + '.' + k, 'Corner outside the grid.');
    }
    for (const k of ['color', 'fill', 'stroke', 'col']) {
      if (k in rect && typeof rect[k] !== 'string') invalid(path + '.' + k, 'Expected a color string.');
    }
    const { r0, r1, c0, c1 } = norm(rect);
    if (r0 === r1 || c0 === c1) invalid(path, 'Panel has zero area.');
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      const index = r * state.cols + c;
      if (occupied[index]) invalid(path, 'Panels overlap.');
      occupied[index] = 1;
    }
  }
  return { matrix: designMatrix(state), code: generateCode(state) };
}
