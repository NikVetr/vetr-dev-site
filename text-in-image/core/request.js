// Request validation. Everything that turns outside input into validated
// settings lives here, so the API, the CLI and the page reject exactly the same
// things with the same messages. Field names follow the R version's
// default_request() (github.com/NikVetr/text-in-image), whose defaults these are.

export const R_REPOSITORY = 'https://github.com/NikVetr/text-in-image';

/**
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {{ width: number, height: number, data: ArrayLike<number> }} Image  RGBA, row-major, 0-255
 * @typedef {typeof DEFAULTS} Settings
 * @typedef {[number, number, number]} Rgb  0-255
 */

export class TextInImageError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Issue[]} [issues]
   */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'TextInImageError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

export const DEFAULTS = Object.freeze({
  seed: 1,
  quantize: /** @type {null | { method: 'oklab_kmeans', k: number, weight_pow: number, grid: number, restarts: number, transparent_color: string, transparency_thresh: number, denoise: 'none' }} */ (Object.freeze({
    method: 'oklab_kmeans', k: 15, weight_pow: 0.5, grid: 0.01, restarts: 5,
    transparent_color: 'white', transparency_thresh: 0.99, denoise: 'none',
  })),
  region: Object.freeze({ alpha_thresh: 0.2 }),
  font: Object.freeze({ family: 'Liberation Sans', face: 2 }),
  layout: Object.freeze({
    n_rounds: 5, line_height: 1.21, justify: true, rotation: 0,
    line_widths: /** @type {'band' | 'row'} */ ('band'), skip_gaps: true,
  }),
  color: Object.freeze({ ink_compensation: false, background: 'black' }),
  render: Object.freeze({ scale: 5, margin: 0.04 }),
});

const TOP_FIELDS = ['image', 'text', 'seed', 'quantize', 'region', 'font', 'layout', 'color', 'render'];

/** @typedef {(value: unknown) => { code: string, message: string } | null} Check */

/** @param {number} min @param {number} max @returns {Check} */
const integer = (min, max) => (v) => {
  if (!Number.isInteger(v)) return { code: 'wrong_type', message: `must be an integer from ${min} to ${max}` };
  return Number(v) < min || Number(v) > max ? { code: 'out_of_range', message: `must be an integer from ${min} to ${max}` } : null;
};
/** A number in [min, max], or (min, max] when `openMin`. @param {number} min @param {number} max @param {boolean} [openMin] @returns {Check} */
const number = (min, max, openMin = false) => (v) => {
  const range = `${openMin ? 'greater than' : 'from'} ${min} ${openMin ? 'and at most' : 'to'} ${max}`;
  if (typeof v !== 'number' || !Number.isFinite(v)) return { code: 'wrong_type', message: `must be a number ${range}` };
  return v < min || v > max || (openMin && v === min) ? { code: 'out_of_range', message: `must be a number ${range}` } : null;
};
/** @type {Check} */
const boolean = (v) => (typeof v === 'boolean' ? null : { code: 'wrong_type', message: 'must be true or false' });
/** @type {Check} */
const color = (v) => (typeof v === 'string' && parseColor(v)
  ? null
  : { code: 'wrong_type', message: 'must be a colour written #rrggbb or #rgb, or "black" or "white"' });
/** @param {string[]} allowed @param {Record<string, string>} [rOnly] values only the R version has @returns {Check} */
const oneOf = (allowed, rOnly = {}) => (v) => {
  if (typeof v === 'string' && Object.hasOwn(rOnly, v)) return { code: 'r_only', message: rOnly[v] };
  return allowed.includes(/** @type {string} */ (v)) ? null : { code: 'wrong_type', message: `must be ${allowed.map((a) => JSON.stringify(a)).join(' or ')}` };
};
/** The one value the JS version supports, where the R version allows others. @param {unknown} only @param {string} message @returns {Check} */
const only = (only, message) => (v) => (v === only ? null : { code: 'r_only', message });

const inR = `exists only in the R implementation (${R_REPOSITORY})`;
const FONT_ONLY = `the JS version bundles only Liberation Sans Bold (face 2); other fonts and faces need the R implementation (${R_REPOSITORY})`;

/** The checks of each section's fields. */
const SECTIONS = /** @type {Record<string, Record<string, Check>>} */ ({
  quantize: {
    method: oneOf(['oklab_kmeans'], {
      tsne_kde_kmeans: `the t-SNE + KDE + weighted k-means quantizer ${inR}; use "oklab_kmeans", or run the R version`,
    }),
    k: integer(1, 256),
    weight_pow: number(0, 10),
    grid: number(0, 1, true),
    restarts: integer(1, 100),
    transparent_color: color,
    transparency_thresh: number(0, 1),
    denoise: oneOf(['none'], { original: `the noisy-pixel denoiser ${inR}; use "none"` }),
  },
  region: { alpha_thresh: number(0, 1) },
  font: {
    family: only('Liberation Sans', FONT_ONLY),
    face: only(2, FONT_ONLY),
  },
  layout: {
    n_rounds: integer(1, 50),
    line_height: number(0, 10, true),
    justify: boolean,
    rotation: number(-360, 360),
    line_widths: oneOf(['band', 'row']),
    skip_gaps: boolean,
  },
  color: { ink_compensation: boolean, background: color },
  render: {
    scale: number(0, 50, true),
    margin: number(0, 1),
  },
});

/** Fields of the R request that the JS version does not have, and why. */
const R_ONLY_FIELDS = /** @type {Record<string, string>} */ ({
  'quantize.dist_w': `only weights the noisy-pixel denoiser, which ${inR}`,
  'render.backgrounds': 'the R version writes one PNG per background; here each SVG has one background, given to renderSvg(result, { background }) or the CLI\'s --background',
});

/**
 * Validates a request and fills in defaults. Throws one TextInImageError
 * listing every problem found, so a caller can fix them all at once.
 * @param {unknown} request
 * @returns {{ image: Image, text: string, settings: Settings }}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object' }]);
  /** @type {Issue[]} */
  const issues = [];
  for (const key of Object.keys(request)) {
    if (!TOP_FIELDS.includes(key)) issues.push({ code: 'unknown_field', path: key, message: `unknown field; the fields are ${TOP_FIELDS.join(', ')}` });
  }

  const image = checkImage(request.image, issues);
  const text = checkText(request.text, issues);
  const seed = Object.hasOwn(request, 'seed') ? request.seed : DEFAULTS.seed;
  const seedIssue = integer(0, 4294967295)(seed);
  if (seedIssue) issues.push({ ...seedIssue, path: 'seed' });

  /** @type {Record<string, any>} */
  const settings = { seed };
  for (const [name, checks] of Object.entries(SECTIONS)) {
    const given = request[name];
    const defaults = /** @type {Record<string, any> | null} */ (DEFAULTS[/** @type {keyof Settings} */ (name)]);
    if (name === 'quantize' && given === null) {
      settings.quantize = null; // use the image's colours as they are
      continue;
    }
    if (given === undefined) {
      settings[name] = { ...defaults };
      continue;
    }
    if (!isObject(given)) {
      issues.push({ code: 'wrong_type', path: name, message: name === 'quantize' ? 'must be an object or null' : 'must be an object' });
      continue;
    }
    if (name === 'quantize' && given.method === 'tsne_kde_kmeans') {
      // the other fields belong to that method, so only the method is reported
      issues.push({ code: 'r_only', path: 'quantize.method', message: /** @type {{ message: string }} */ (checks.method(given.method)).message });
      continue;
    }
    for (const key of Object.keys(given)) {
      const path = `${name}.${key}`;
      const check = checks[key];
      if (!check) {
        issues.push(Object.hasOwn(R_ONLY_FIELDS, path)
          ? { code: 'r_only', path, message: R_ONLY_FIELDS[path] }
          : { code: 'unknown_field', path, message: `unknown field; ${name} has ${Object.keys(checks).join(', ')}` });
        continue;
      }
      const issue = check(given[key]);
      if (issue) issues.push({ ...issue, path });
    }
    settings[name] = { ...defaults, ...given };
  }

  if (issues.length) throw invalid(issues);
  return { image: /** @type {Image} */ (image), text: /** @type {string} */ (text), settings: /** @type {Settings} */ (settings) };
}

/**
 * Reads "#rrggbb", "#rgb", "black" or "white".
 * @param {string} text
 * @returns {Rgb | null}
 */
export function parseColor(text) {
  if (text === 'black') return [0, 0, 0];
  if (text === 'white') return [255, 255, 255];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  const parts = long ? long.slice(1) : short ? short.slice(1).map((h) => h + h) : null;
  return parts ? /** @type {Rgb} */ (parts.map((h) => parseInt(h, 16))) : null;
}

/**
 * A valid request that cannot be carried out, found while processing it.
 * @param {string} path @param {string} message
 */
export function unusable(path, message) {
  return new TextInImageError('unusable_input', `Cannot fit the text: ${path}: ${message}`, [{ code: 'unusable_input', path, message }]);
}

/** @param {Issue[]} issues */
function invalid(issues) {
  const shown = issues.slice(0, 3).map((issue) => `${issue.path || 'request'}: ${issue.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new TextInImageError('invalid_request', `Invalid request: ${shown.join('; ')}`, issues);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} image @param {Issue[]} issues */
function checkImage(image, issues) {
  const shape = 'must be decoded RGBA pixels: {width, height, data} with data holding width x height x 4 values from 0 to 255, row by row';
  if (image === undefined) {
    issues.push({ code: 'missing_field', path: 'image', message: `is required; it ${shape}` });
    return null;
  }
  if (!isObject(image)) {
    issues.push({ code: 'wrong_type', path: 'image', message: shape });
    return null;
  }
  const start = issues.length;
  for (const key of Object.keys(image)) {
    if (!['width', 'height', 'data'].includes(key)) issues.push({ code: 'unknown_field', path: `image.${key}`, message: 'unknown field; an image has width, height and data' });
  }
  const before = issues.length;
  for (const key of ['width', 'height']) {
    const issue = integer(1, 100000)(image[key]);
    if (issue) issues.push({ ...issue, path: `image.${key}` });
  }
  const { data } = image;
  const typed = data instanceof Uint8Array || data instanceof Uint8ClampedArray;
  if (!typed && !Array.isArray(data)) {
    issues.push({ code: 'wrong_type', path: 'image.data', message: 'must be an array (or Uint8Array / Uint8ClampedArray) of RGBA values from 0 to 255' });
  } else if (issues.length === before) {
    if (data.length !== image.width * image.height * 4) {
      issues.push({ code: 'out_of_range', path: 'image.data', message: `has ${data.length} values but width x height x 4 is ${image.width * image.height * 4}` });
    } else if (!typed) {
      const bad = data.findIndex((v) => !Number.isInteger(v) || v < 0 || v > 255);
      if (bad !== -1) issues.push({ code: 'out_of_range', path: `image.data[${bad}]`, message: 'must be an integer from 0 to 255' });
    }
  }
  return issues.length === start ? /** @type {Image} */ (image) : null;
}

/** @param {unknown} text @param {Issue[]} issues */
function checkText(text, issues) {
  if (text === undefined) {
    issues.push({ code: 'missing_field', path: 'text', message: 'is required: a string, or an array of strings joined with spaces' });
    return null;
  }
  const joined = typeof text === 'string' ? text : Array.isArray(text) && text.every((t) => typeof t === 'string') ? text.join(' ') : null;
  if (joined === null) {
    issues.push({ code: 'wrong_type', path: 'text', message: 'must be a string, or an array of strings joined with spaces' });
    return null;
  }
  if (joined.trim() === '') {
    issues.push({ code: 'out_of_range', path: 'text', message: 'has nothing but whitespace' });
    return null;
  }
  return joined;
}
