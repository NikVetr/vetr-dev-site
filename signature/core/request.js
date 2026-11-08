// Request validation. A request holds one signature, as strokes, csv, matrix or
// svg (see input.js), and optional settings sections; every setting has a
// default and unknown fields are rejected. Problems are collected and thrown
// together as one SignatureError, so the API, the CLI and the page reject the
// same requests with the same messages.

import { WAVELET_LOWPASS } from '../../shared/wavelet.js';
import { readSignature } from './input.js';

/**
 * @typedef {import('./input.js').Issue} Issue
 * @typedef {import('./input.js').Warning} Warning
 * @typedef {import('./resample.js').RawPoint} RawPoint
 * @typedef {{ stroke: number, from: number, to: number, strength: number }} LocalRegion
 */

export class SignatureError extends Error {
  /** @param {string} code @param {string} message @param {Issue[]} [issues] */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'SignatureError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** Lengths are in units of the signature's height unless a field says otherwise. */
export const DEFAULTS = Object.freeze({
  input: Object.freeze({ penUpGap: 50, yAxis: /** @type {'down' | 'up'} */ ('down') }),
  resample: Object.freeze({ step: /** @type {'auto' | number} */ ('auto') }),
  smooth: Object.freeze({
    fourier: Object.freeze({ strength: 1 }),
    wavelet: Object.freeze({
      filter: /** @type {import('../../shared/wavelet.js').Filter} */ ('mb4'), levels: /** @type {'auto' | number} */ ('auto'),
      rule: /** @type {'energy' | 'noise'} */ ('energy'), keepEnergy: 0.999, noiseMultiplier: 3, thresholdSmooth: false, strength: 1,
    }),
    local: Object.freeze(/** @type {LocalRegion[]} */ ([])),
  }),
  width: Object.freeze({
    source: /** @type {'auto' | 'speed' | 'curvature' | 'pressure' | 'constant'} */ ('auto'),
    min: 0.01, max: 0.035, exponent: 1 / 3, straightRadius: 1, geometryWeight: 0.25, smoothing: 0.05,
    taper: Object.freeze({ length: 0.06, floor: 0.25 }),
  }),
  output: Object.freeze({ color: '#1b1b1b', height: /** @type {number | null} */ (null), unit: /** @type {'px' | 'mm' | 'in' | 'pt'} */ ('px'), margin: 0.05, digits: 2 }),
  morph: /** @type {null | MorphSettings} */ (null),
});

/**
 * @typedef {{ method: 'wavelet' | 'linear' | 'corrected', strokes: 'all' | 'first', props: number[],
 *   noiseMultiplier: number, loop: number }} MorphOptions
 * @typedef {MorphOptions & { target: RawPoint[][] }} MorphSettings
 */

/** The morph's settings, apart from its target signature. */
export const MORPH_DEFAULTS = Object.freeze({
  method: /** @type {'wavelet' | 'linear' | 'corrected'} */ ('wavelet'), strokes: /** @type {'all' | 'first'} */ ('all'),
  props: Object.freeze([0, 0.25, 0.5, 0.75, 1]), noiseMultiplier: 50, loop: 0,
});

const int = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isInteger(v);
const num = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
const unit = (/** @type {unknown} */ v) => num(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= 1;
const oneOf = (/** @type {string[]} */ values) => /** @type {[(v: any) => boolean, string]} */ ([(v) => values.includes(v), `one of: ${values.join(', ')}`]);

/**
 * Field checks: [test, what the value must be]. Paths are those of DEFAULTS and MORPH_DEFAULTS.
 * @type {Record<string, [(v: any) => boolean, string]>}
 */
const RULES = {
  'input.penUpGap': [(v) => num(v) && v > 0, 'a number of milliseconds above 0 (a longer pause between samples lifts the pen)'],
  'input.yAxis': oneOf(['down', 'up']),
  'resample.step': [(v) => v === 'auto' || (num(v) && v > 0), '"auto" (a hundredth of the height) or a step above 0 in input units'],
  'smooth.fourier.strength': [(v) => num(v) && v >= 0, 'a number of at least 0 (0 is off; 1 is the R script\'s threshold)'],
  'smooth.wavelet.filter': oneOf(Object.keys(WAVELET_LOWPASS)),
  'smooth.wavelet.levels': [(v) => v === 'auto' || (int(v) && v >= 1 && v <= 12), '"auto" or an integer from 1 to 12'],
  'smooth.wavelet.rule': oneOf(['energy', 'noise']),
  'smooth.wavelet.keepEnergy': [(v) => num(v) && v > 0 && v <= 1, 'a number above 0 and at most 1'],
  'smooth.wavelet.noiseMultiplier': [(v) => num(v) && v >= 0, 'a number of at least 0'],
  'smooth.wavelet.thresholdSmooth': [(v) => typeof v === 'boolean', 'true or false'],
  'smooth.wavelet.strength': [(v) => num(v) && v >= 0, 'a number of at least 0 (0 is off)'],
  'width.source': oneOf(['auto', 'speed', 'curvature', 'pressure', 'constant']),
  'width.min': [(v) => num(v) && v > 0, 'a number above 0 (× the height)'],
  'width.max': [(v) => num(v) && v > 0, 'a number above 0 (× the height)'],
  'width.exponent': [(v) => num(v) && v >= 0 && v <= 2, 'a number from 0 to 2 (1/3 is the two-thirds power law)'],
  'width.straightRadius': [(v) => num(v) && v > 0, 'a number above 0 (× the height)'],
  'width.geometryWeight': [unit, 'a number from 0 to 1'],
  'width.smoothing': [(v) => num(v) && v > 0, 'a number above 0 (× the height)'],
  'width.taper.length': [(v) => num(v) && v >= 0, 'a number of at least 0 (× the height)'],
  'width.taper.floor': [unit, 'a number from 0 to 1'],
  'output.color': [(v) => typeof v === 'string' && /^(#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?|[a-z]+)$/.test(v), 'a colour such as "#1b1b1b" or "navy"'],
  'output.height': [(v) => v === null || (num(v) && v > 0), 'null (the input\'s units, as px) or the SVG\'s height above 0 in `unit`'],
  'output.unit': oneOf(['px', 'mm', 'in', 'pt']),
  'output.margin': [(v) => num(v) && v >= 0, 'a number of at least 0 (× the height)'],
  'output.digits': [(v) => int(v) && v >= 0 && v <= 6, 'an integer from 0 to 6'],
  'morph.method': oneOf(['wavelet', 'linear', 'corrected']),
  'morph.strokes': oneOf(['all', 'first']),
  'morph.props': [(v) => Array.isArray(v) && v.length >= 1 && v.length <= 2000 && v.every(unit), 'an array of 1 to 2000 numbers from 0 to 1 (0 is this signature, 1 the target)'],
  'morph.noiseMultiplier': [(v) => num(v) && v >= 0, 'a number of at least 0 (the R script used 50)'],
  'morph.loop': [(v) => num(v) && v >= 0 && v <= 10, 'a number from 0 to 10 (0 is the R script\'s straight interpolation)'],
};

const INPUT_FORMS = ['strokes', 'csv', 'matrix', 'svg'];

/**
 * Validates a request and fills in defaults. Throws one SignatureError listing every problem.
 * @param {unknown} request
 * @returns {{ strokes: RawPoint[][], settings: Settings, warnings: Warning[] }}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) {
    throw invalid([{ code: 'INVALID_REQUEST', path: '', message: 'the request must be a JSON object with a signature: strokes, csv, matrix or svg' }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  /** @type {Warning[]} */
  const warnings = [];
  const { morph, effects, warps, ...rest } = request;
  const sections = Object.fromEntries(Object.entries(rest).filter(([k]) => !INPUT_FORMS.includes(k)));
  const merged = /** @type {Record<string, any>} */ (merge(sections, { ...DEFAULTS, morph: undefined }, '', issues));
  delete merged.morph;
  if (effects !== undefined) merged.effects = readEdits(effects, 'effects', issues);
  if (warps !== undefined) merged.warps = readEdits(warps, 'warps', issues);
  merged.smooth.local = readLocal(rest.smooth?.local, issues);
  const strokes = readSignature(rest, '', merged.input, issues, warnings);
  merged.morph = null;
  if (morph !== undefined && morph !== null) {
    if (!isObject(morph)) issues.push({ code: 'INVALID_FIELD', path: 'morph', message: 'must be an object with a target signature (strokes, csv, matrix or svg) and any of method, strokes, props, noiseMultiplier, loop' });
    else {
      const { target, ...opts } = morph;
      const m = merge(opts, MORPH_DEFAULTS, 'morph', issues);
      const t = isObject(target) ? readSignature(target, 'morph.target', merged.input, issues, warnings) : null;
      if (!isObject(target)) issues.push({ code: 'MISSING_INPUT', path: 'morph.target', message: 'needs the signature to morph into: { strokes | csv | matrix | svg }' });
      else for (const k of Object.keys(target)) if (!INPUT_FORMS.includes(k)) issues.push({ code: 'UNKNOWN_FIELD', path: `morph.target.${k}`, message: `unknown field; a target has one of ${INPUT_FORMS.join(', ')}` });
      merged.morph = { ...m, target: t };
    }
  }
  if (merged.width.min > merged.width.max) issues.push({ code: 'INVALID_FIELD', path: 'width.min', message: `must be at most width.max (${merged.width.max})` });
  if (strokes && merged.width.source === 'speed' && strokes.flat().some((p) => p.t === undefined)) {
    issues.push({ code: 'MISSING_TIME', path: 'width.source', message: '"speed" needs a time t on every point; use "curvature" for input without timing' });
  }
  if (strokes && merged.width.source === 'pressure' && strokes.flat().some((p) => p.pressure === undefined)) {
    issues.push({ code: 'MISSING_PRESSURE', path: 'width.source', message: '"pressure" needs a pressure on every point' });
  }
  if (strokes) {
    merged.smooth.local.forEach((/** @type {LocalRegion} */ r, /** @type {number} */ i) => {
      if (r.stroke >= strokes.length) issues.push({ code: 'INVALID_FIELD', path: `smooth.local[${i}].stroke`, message: `the signature has ${strokes.length} strokes, numbered from 0` });
    });
  }
  if (issues.length) throw invalid(issues);
  return { strokes: /** @type {RawPoint[][]} */ (strokes), settings: /** @type {Settings} */ (merged), warnings };
}

/** @typedef {Omit<typeof DEFAULTS, 'morph'> & { morph: MorphSettings | null, effects?: import('./effects.js').Effect[], warps?: import('./effects.js').Warp[] }} Settings */

/** @param {unknown} value @param {Issue[]} issues @returns {LocalRegion[]} */
function readLocal(value, issues) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ code: 'INVALID_FIELD', path: 'smooth.local', message: 'must be an array of { stroke, from, to, strength }' });
    return [];
  }
  return value.map((r, i) => {
    const at = `smooth.local[${i}]`;
    if (!isObject(r)) {
      issues.push({ code: 'INVALID_FIELD', path: at, message: 'must be { stroke, from, to, strength }' });
      return { stroke: 0, from: 0, to: 0, strength: 1 };
    }
    for (const k of Object.keys(r)) if (!['stroke', 'from', 'to', 'strength'].includes(k)) issues.push({ code: 'UNKNOWN_FIELD', path: `${at}.${k}`, message: 'unknown field; a region has stroke, from, to, strength' });
    if (!(int(r.stroke) && r.stroke >= 0)) issues.push({ code: 'INVALID_FIELD', path: `${at}.stroke`, message: 'must be a stroke number from 0' });
    for (const k of ['from', 'to']) if (!unit(r[k])) issues.push({ code: 'INVALID_FIELD', path: `${at}.${k}`, message: 'must be a share of the stroke\'s length from 0 to 1' });
    if (unit(r.from) && unit(r.to) && r.from > r.to) issues.push({ code: 'INVALID_FIELD', path: `${at}.to`, message: 'must be at least from' });
    if (!(num(r.strength) && r.strength >= 0)) issues.push({ code: 'INVALID_FIELD', path: `${at}.strength`, message: 'must be a number of at least 0 (× the wavelet threshold; 0 leaves the region unsmoothed)' });
    return { stroke: r.stroke, from: r.from, to: r.to, strength: r.strength };
  });
}

/**
 * Copies `value` over `defaults`, section by section, checking each leaf.
 * @param {Record<string, any>} value @param {Record<string, any>} defaults @param {string} path @param {Issue[]} issues
 * @returns {Record<string, any>}
 */
function merge(value, defaults, path, issues) {
  /** @type {Record<string, any>} */
  const out = structuredClone(Object.fromEntries(Object.entries(defaults).filter(([, v]) => v !== undefined)));
  const known = Object.keys(defaults).filter((k) => !(path === '' && k === 'morph'));
  for (const key of Object.keys(value)) {
    const at = path ? `${path}.${key}` : key;
    if (at === 'smooth.local') continue;
    if (!Object.hasOwn(defaults, key) || defaults[key] === undefined) {
      const has = path === '' ? [...INPUT_FORMS, ...known, 'morph'] : known;
      issues.push({ code: 'UNKNOWN_FIELD', path: at, message: `unknown field; ${path || 'the request'} has ${has.join(', ')}` });
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

/** @param {Issue[]} issues */
function invalid(issues) {
  const shown = issues.slice(0, 3).map((i) => `${i.path || 'request'}: ${i.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new SignatureError('INVALID_REQUEST', `Invalid request: ${shown.join('; ')}`, issues);
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {'effects'|'warps'} kind @param {Issue[]} issues */
function readEdits(value,kind,issues) {
  if(!Array.isArray(value) || value.length>100) {
    issues.push({code:'INVALID_FIELD',path:kind,message:'must be an array of at most 100 edits'}); return [];
  }
  const defaults = kind==='effects' ? {kind:'smooth',from:0,to:1,strength:1,falloff:0.03,hairpin:'preserve'} : {x:0,y:0,dx:0,dy:0,radius:1};
  return value.map((v,i)=> {
    const at=`${kind}[${i}]`;
    if(!isObject(v)) {issues.push({code:'INVALID_FIELD',path:at,message:'must be an edit object'});return defaults;}
    const out={...defaults,...v};
    for(const k of Object.keys(v)) if(!(k in defaults)) issues.push({code:'UNKNOWN_FIELD',path:`${at}.${k}`,message:'unknown edit field'});
    for(const k of Object.keys(defaults)) {
      const q=out[k];
      const valid=k==='kind' ? ['smooth','thickness'].includes(q) : k==='hairpin' ? ['preserve','round','loop'].includes(q)
        : num(q) && (['from','to','falloff'].includes(k) ? unit(q) : k==='radius' ? q>0 : k==='strength' ? q>=0 && q<=4 && (out.kind!=='thickness'||q>0) : true);
      if(!valid) issues.push({code:'INVALID_FIELD',path:`${at}.${k}`,message:'invalid edit value (shares 0–1, strength 0–4; thickness and radius must be positive)'});
    }
    if(kind==='effects' && out.from>out.to) issues.push({code:'INVALID_FIELD',path:`${at}.to`,message:'must be at least from'});
    return out;
  });
}
