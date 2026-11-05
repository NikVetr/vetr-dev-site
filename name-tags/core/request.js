// Request validation. Everything that turns outside input into validated
// settings lives here, so the API, the CLI and the page reject exactly the
// same things with the same messages. Field names and defaults follow the R
// version's nametag_defaults(), default_style() and default_hershey_ekg().

import { FONTS } from './font.js';
import { SCRIPT_CHARS } from './hershey-data.js';
import { splitNameLines, toLower } from './names.js';
import { TRAY_PRESETS, trayGeometry } from './tray.js';

/**
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {typeof DEFAULT_STYLE} Style
 * @typedef {typeof DEFAULT_HERSHEY_EKG} HersheyEkg
 * @typedef {{ name: string, logo: string | null }} NameEntry
 * @typedef {{ file: string | null, margin_div: number, center_adj_prop: readonly number[], use_file_colors: boolean }} LogoOptions
 * @typedef {{ names: NameEntry[], lines: string[][], tray: import('./tray.js').Tray, cells: number[] | null, font: { family: string },
 *   decoration: 'dna' | 'none' | 'hershey_ekg' | 'logo', logo: LogoOptions, style: Style, hershey_ekg: HersheyEkg, seed: number,
 *   output: { prefix: string } }} Settings
 */

export class NameTagsError extends Error {
  /** @param {string} code @param {string} message @param {Issue[]} [issues] */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'NameTagsError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

export const R_REPOSITORY = 'the R version (laser-cut name tags, nametag_submit())';

export const DEFAULT_STYLE = Object.freeze({
  inner_margin_div: 4.5,           // inner box = cell - cell width / inner_margin_div (both axes)
  name_center_adj_prop: Object.freeze([0.01, 0.01]), // nudge of the whole name, as a fraction of the cell
  degree_name_overlap: 0.4,
  name_cex_ratio_base: 0.55,       // bottom-line / top-line size ratio before fitting
  name_cex_ratio_factor: 1.1,
  cex_scale: 0.95,
  vws_scale: 0.6,                  // vertical space between lines, relative to the font's line gap
  vws_adj_yqpgj: 1.5,
  prop_dist: 0.2,                  // gap between b2 and its neighbours, as a fraction of b2's height
  smallcaps: true,                 // set names whose top line has descenders in small caps
  smallcaps_reference_face: /** @type {1 | 2} */ (2), // face whose stroke weight sets the small-caps scale; 1 gives full caps
  thin_smallcaps_first_letter: true,
  raise_J: true,                   // sit capital J on the baseline
  lower_Q: true,                   // drop a leading capital Q by 1/8 of its height
  optimizer: Object.freeze({
    restarts: 20,
    start_w1: 0.5, start_w2: 0.4,
    big_penalty: 1e3,
    ratio_mean_b1b2_w: 2.5, ratio_sd_b1b2_w: 10,
    ratio_mean_b1b2_h: 2.5, ratio_sd_b1b2_h: 0.75,
    ratio_mean_b2b3_w: 1, ratio_sd_b2b3_w: 10,
    ratio_mean_b1_b2b3_w: 0.925, ratio_sd_b1_b2b3_w: 0.05,
    sd_iar2f: 0.2, iar2f_weight: 1,
    mean_ntwists: 1.4, sd_ntwists: 0.35,
    two_stage_iar2f: true,
  }),
});

export const DEFAULT_HERSHEY_EKG = Object.freeze({
  font: 'HersheyScript',
  r_amp: 0.7,                  // R-wave height of the EKG trace
  sampling_rate: 800,
  stroke_points: 200,          // points per smoothed stroke
  smoothing_var_thresh: 0.9999,
  bottom_line_lwd: 0.01,       // base pen width, bottom line group (EKG units)
  top_line_lwd: 0.0075,        // base pen width, top line group
  lwd_pow: 2, tail_pow: 2, tail_prop_floor: 0.5,
  top_scale: 1.85,             // top line group size relative to the bottom line group
  top_raise: 0.75,             // top line group's vertical offset (EKG units); right-aligned with the bottom group
  lowercase_bottom_line: true,
});

export const DEFAULTS = Object.freeze({
  tray: 'keychain_big',
  cells: null,
  font: Object.freeze({ family: 'Inter' }),
  decoration: 'dna',
  logo: Object.freeze({ file: null, margin_div: 7, center_adj_prop: Object.freeze([0, -0.005]), use_file_colors: false }),
  style: DEFAULT_STYLE,
  hershey_ekg: DEFAULT_HERSHEY_EKG,
  seed: 1,
  ncores: 1,
  output: Object.freeze({ prefix: 'nametags' }),
});

const TOP_FIELDS = ['names', 'names_file', 'tray', 'cells', 'font', 'decoration', 'logo', 'style', 'hershey_ekg', 'seed', 'ncores', 'output'];
const DECORATIONS = ['dna', 'none', 'hershey_ekg', 'logo'];
const TRAY_FIELDS = ['name', 'page_in', 'cell_in', 'grid', 'spacing_in', 'first_center_in', 'centers_in'];
const MAX_NAMES = 5000;
const MAX_CELLS = 5000;

/** @typedef {(value: unknown) => string | null} Check  a message, or null when the value is fine */

/** @param {number} min @param {number} max @returns {Check} */
const integer = (min, max) => (v) => (Number.isInteger(v) && Number(v) >= min && Number(v) <= max ? null : `must be an integer from ${min} to ${max}`);
/** @param {number} min @param {boolean} [openMin] @param {number} [max] @returns {Check} */
const number = (min = -Infinity, openMin = false, max = Infinity) => (v) => {
  const ok = typeof v === 'number' && Number.isFinite(v) && (openMin ? v > min : v >= min) && v <= max;
  if (ok) return null;
  if (min === -Infinity) return 'must be a finite number';
  return `must be a number ${openMin ? 'greater than' : 'at least'} ${min}${max < Infinity ? ` and at most ${max}` : ''}`;
};
/** @type {Check} */
const boolean = (v) => (typeof v === 'boolean' ? null : 'must be true or false');
/** @param {number} n @returns {Check} */
const pair = (n) => (v) => (Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? null : `must be an array of ${n} finite numbers`);

const STYLE_CHECKS = /** @type {Record<string, Check>} */ ({
  inner_margin_div: number(1, true), name_center_adj_prop: pair(2), degree_name_overlap: number(),
  name_cex_ratio_base: number(0, true), name_cex_ratio_factor: number(0, true), cex_scale: number(0, true),
  vws_scale: number(0), vws_adj_yqpgj: number(0), prop_dist: number(0, false, 0.9), smallcaps: boolean,
  smallcaps_reference_face: (v) => (v === 1 || v === 2 ? null : 'must be 1 (plain) or 2 (bold)'),
  thin_smallcaps_first_letter: boolean, raise_J: boolean, lower_Q: boolean,
});
const OPTIMIZER_CHECKS = /** @type {Record<string, Check>} */ ({
  restarts: integer(1, 1000), start_w1: number(0, true), start_w2: number(0, true), big_penalty: number(0, true),
  ratio_mean_b1b2_w: number(), ratio_sd_b1b2_w: number(0, true), ratio_mean_b1b2_h: number(), ratio_sd_b1b2_h: number(0, true),
  ratio_mean_b2b3_w: number(), ratio_sd_b2b3_w: number(0, true), ratio_mean_b1_b2b3_w: number(), ratio_sd_b1_b2b3_w: number(0, true),
  sd_iar2f: number(0, true), iar2f_weight: number(0), mean_ntwists: number(), sd_ntwists: number(0, true), two_stage_iar2f: boolean,
});
const HERSHEY_CHECKS = /** @type {Record<string, Check>} */ ({
  font: (v) => (v === 'HersheyScript' ? null : `"HersheyScript" is the only Hershey font bundled; others are in ${R_REPOSITORY}`),
  r_amp: number(0, true), sampling_rate: integer(20, 10000), stroke_points: integer(8, 5000),
  smoothing_var_thresh: number(0, true, 1), bottom_line_lwd: number(0, true), top_line_lwd: number(0, true),
  lwd_pow: number(0), tail_pow: number(0), tail_prop_floor: number(0, false, 1), top_scale: number(0, true),
  top_raise: number(), lowercase_bottom_line: boolean,
});

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A data: URL of an SVG, PNG or JPEG image. @param {unknown} v */
export function logoType(v) {
  if (typeof v !== 'string') return null;
  const m = /^data:image\/(svg\+xml|png|jpeg|jpg)(;[^,]*)?,/i.exec(v);
  if (!m) return null;
  return m[1].toLowerCase() === 'svg+xml' ? 'svg' : m[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
}
const LOGO_MESSAGE = 'must be a data: URL of an SVG, PNG or JPEG image (the command line also takes a file path)';

/**
 * Fills defaults into a section and checks each field, collecting issues.
 * @template T
 * @param {unknown} given @param {T} defaults @param {Record<string, Check>} checks @param {string} path @param {Issue[]} issues
 * @returns {T}
 */
function section(given, defaults, checks, path, issues) {
  if (given === undefined) return defaults;
  if (!isObject(given)) {
    issues.push({ code: 'wrong_type', path, message: 'must be an object' });
    return defaults;
  }
  /** @type {Record<string, any>} */
  const out = { .../** @type {Record<string, any>} */ (defaults) };
  for (const [key, value] of Object.entries(given)) {
    const p = `${path}.${key}`;
    if (!Object.hasOwn(checks, key)) {
      issues.push({ code: 'unknown_field', path: p, message: `unknown field; the fields are ${Object.keys(checks).join(', ')}` });
      continue;
    }
    const problem = checks[key](value);
    if (problem) issues.push({ code: 'invalid_value', path: p, message: problem });
    else out[key] = value;
  }
  return /** @type {T} */ (out);
}

/**
 * Validates a request and fills in defaults. Throws one NameTagsError listing
 * every problem found, so a caller can fix them all at once.
 * @param {unknown} request
 * @returns {Settings}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object' }]);
  /** @type {Issue[]} */
  const issues = [];
  for (const key of Object.keys(request)) {
    if (!TOP_FIELDS.includes(key)) issues.push({ code: 'unknown_field', path: key, message: `unknown field; the fields are ${TOP_FIELDS.join(', ')}` });
  }
  if (Object.hasOwn(request, 'names_file')) {
    issues.push({ code: 'cli_only', path: 'names_file', message: 'a names file is read by the command line (cli.mjs), which passes its names on as "names"; give "names" here' });
  }

  // names, each a string or { name, logo }
  /** @type {NameEntry[]} */
  const names = [];
  /** @type {string[][]} */
  const lines = [];
  if (!Object.hasOwn(request, 'names')) {
    if (!Object.hasOwn(request, 'names_file')) issues.push({ code: 'missing_field', path: 'names', message: 'the request needs "names": an array of names' });
  } else if (!Array.isArray(request.names) || request.names.length === 0) {
    issues.push({ code: 'wrong_type', path: 'names', message: 'must be a non-empty array of names' });
  } else if (request.names.length > MAX_NAMES) {
    issues.push({ code: 'too_many', path: 'names', message: `at most ${MAX_NAMES} names` });
  } else {
    request.names.forEach((/** @type {unknown} */ entry, /** @type {number} */ i) => {
      const p = `names[${i}]`;
      let name = entry;
      let logo = null;
      if (isObject(entry)) {
        for (const k of Object.keys(entry)) if (k !== 'name' && k !== 'logo') issues.push({ code: 'unknown_field', path: `${p}.${k}`, message: 'unknown field; a name entry has name and logo' });
        name = entry.name;
        if (entry.logo !== undefined && entry.logo !== null) {
          if (logoType(entry.logo)) logo = entry.logo;
          else issues.push({ code: 'invalid_value', path: `${p}.logo`, message: LOGO_MESSAGE });
        }
      }
      if (typeof name !== 'string' || name.trim() === '') {
        issues.push({ code: 'invalid_value', path: isObject(entry) ? `${p}.name` : p, message: 'must be a non-empty string' });
        return;
      }
      if (name.length > 200) {
        issues.push({ code: 'invalid_value', path: p, message: 'a name may have at most 200 characters' });
        return;
      }
      const split = splitNameLines(name);
      if (typeof split === 'string') issues.push({ code: 'invalid_value', path: p, message: split });
      else {
        names.push({ name: name.trim(), logo });
        lines.push(split);
      }
    });
  }

  // tray
  let tray = null;
  const trayIn = request.tray ?? DEFAULTS.tray;
  if (typeof trayIn === 'string') {
    const preset = /** @type {Record<string, any>} */ (TRAY_PRESETS)[trayIn];
    if (!preset) issues.push({ code: 'invalid_value', path: 'tray', message: `unknown tray preset "${trayIn}"; presets: ${Object.keys(TRAY_PRESETS).join(', ')} (or give a tray object)` });
    else tray = trayGeometry({ name: trayIn, ...preset }).tray;
  } else if (isObject(trayIn)) {
    tray = readTray(trayIn, issues);
  } else {
    issues.push({ code: 'wrong_type', path: 'tray', message: 'must be a preset name or a tray object' });
  }

  // cells
  let cells = null;
  if (request.cells !== undefined && request.cells !== null) {
    if (!Array.isArray(request.cells) || !request.cells.every((c) => Number.isInteger(c))) {
      issues.push({ code: 'wrong_type', path: 'cells', message: 'must be an array of cell numbers (integers)' });
    } else if (names.length && request.cells.length !== request.names.length) {
      issues.push({ code: 'invalid_value', path: 'cells', message: `must give one cell number per name (${request.names.length})` });
    } else if (tray && request.cells.some((c) => c < 1 || c > tray.n_cells)) {
      issues.push({ code: 'out_of_range', path: 'cells', message: `cells must be between 1 and ${tray.n_cells}` });
    } else cells = /** @type {number[]} */ (request.cells);
  }

  const font = section(request.font, DEFAULTS.font, {
    family: (v) => (typeof v === 'string' && Object.hasOwn(FONTS, v) ? null : `must be one of the bundled families: ${Object.keys(FONTS).map((f) => JSON.stringify(f)).join(', ')}`),
    dir: () => `fonts are bundled here; a font directory is for ${R_REPOSITORY}`,
  }, 'font', issues);

  const decoration = request.decoration ?? DEFAULTS.decoration;
  if (!DECORATIONS.includes(decoration)) issues.push({ code: 'invalid_value', path: 'decoration', message: `must be ${DECORATIONS.map((d) => JSON.stringify(d)).join(', ')}` });

  const hershey = section(request.hershey_ekg, DEFAULT_HERSHEY_EKG, HERSHEY_CHECKS, 'hershey_ekg', issues);
  const logo = section(request.logo, DEFAULTS.logo, {
    file: (v) => (v === null || logoType(v) ? null : LOGO_MESSAGE),
    margin_div: number(1, true), center_adj_prop: pair(2), use_file_colors: boolean,
  }, 'logo', issues);
  if (decoration === 'hershey_ekg') {
    lines.forEach((l, i) => {
      const bottom = hershey.lowercase_bottom_line ? toLower(l[l.length - 1]) : l[l.length - 1];
      const bad = [...new Set([...l.slice(0, -1).join(''), ...bottom])].filter((c) => !Object.hasOwn(SCRIPT_CHARS, /** @type {number} */ (c.codePointAt(0))));
      if (bad.length) issues.push({ code: 'unsupported_character', path: `names[${i}]`, message: `the Hershey Script font has no glyph for ${bad.map((c) => JSON.stringify(c)).join(' ')}` });
    });
  }
  if (decoration === 'logo' && names.length && !logo.file && names.some((n) => !n.logo)) {
    issues.push({ code: 'missing_field', path: 'logo.file', message: 'decoration "logo" needs logo.file or a logo for every name' });
  }

  const styleIn = isObject(request.style) ? request.style : undefined;
  const { optimizer: optIn, ...styleRest } = styleIn ?? {};
  const style = section(request.style === undefined ? undefined : (styleIn ? styleRest : request.style), { ...DEFAULT_STYLE }, { ...STYLE_CHECKS }, 'style', issues);
  style.optimizer = section(optIn, DEFAULT_STYLE.optimizer, OPTIMIZER_CHECKS, 'style.optimizer', issues);

  const seed = request.seed ?? DEFAULTS.seed;
  const seedProblem = integer(-2147483647, 2147483647)(seed);
  if (seedProblem) issues.push({ code: 'invalid_value', path: 'seed', message: seedProblem });
  const ncores = request.ncores ?? 1;
  if (ncores !== 1) issues.push({ code: 'r_only', path: 'ncores', message: `restarts run one after another here; parallel restarts (which draw different random starts) are in ${R_REPOSITORY}` });

  const output = section(request.output, DEFAULTS.output, {
    prefix: (v) => (typeof v === 'string' && /^[\w.-]{1,100}$/.test(v) ? null : 'must be 1 to 100 letters, digits, ".", "-" or "_"'),
    dir: (v) => (typeof v === 'string' && v !== '' ? null : 'must be a directory path (used by the command line)'),
    pdf: (v) => (v === false ? null : `PDF export is in ${R_REPOSITORY}; open the SVG in Inkscape to save a PDF`),
  }, 'output', issues);

  if (tray) {
    const dims = [tray.cell_in[0] - tray.cell_in[0] / style.inner_margin_div, tray.cell_in[1] - tray.cell_in[0] / style.inner_margin_div];
    if (dims[1] <= 0) issues.push({ code: 'invalid_value', path: 'style.inner_margin_div', message: `leaves no inner box: the margin, cell width / inner_margin_div = ${(tray.cell_in[0] / style.inner_margin_div).toFixed(3)} in, is at least the cell height` });
  }

  if (issues.length) throw invalid(issues);
  return {
    names, lines, tray: /** @type {import('./tray.js').Tray} */ (tray), cells, font, decoration: /** @type {Settings['decoration']} */ (decoration),
    logo, style, hershey_ekg: hershey, seed: /** @type {number} */ (seed), output: { prefix: output.prefix },
  };
}

/** @param {Record<string, any>} t @param {Issue[]} issues */
function readTray(t, issues) {
  let ok = true;
  for (const k of Object.keys(t)) {
    if (!TRAY_FIELDS.includes(k)) {
      issues.push({ code: 'unknown_field', path: `tray.${k}`, message: `unknown field; the fields are ${TRAY_FIELDS.join(', ')}` });
      ok = false;
    }
  }
  /** @param {string} field @param {(v: number) => boolean} test @param {string} what */
  const need = (field, test, what) => {
    const v = t[field];
    if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && test(x))) {
      issues.push({ code: v === undefined ? 'missing_field' : 'invalid_value', path: `tray.${field}`, message: `must be 2 ${what}` });
      ok = false;
    }
  };
  if (t.name !== undefined && (typeof t.name !== 'string' || t.name === '')) {
    issues.push({ code: 'invalid_value', path: 'tray.name', message: 'must be a non-empty string' });
    ok = false;
  }
  need('page_in', (x) => x > 0, 'positive numbers');
  need('cell_in', (x) => x > 0, 'positive numbers');
  if (t.centers_in !== undefined) {
    for (const k of ['grid', 'spacing_in', 'first_center_in']) {
      if (t[k] !== undefined) {
        issues.push({ code: 'conflicting_fields', path: `tray.${k}`, message: 'give either centers_in or grid, spacing_in and first_center_in' });
        ok = false;
      }
    }
    const c = t.centers_in;
    if (!Array.isArray(c) || c.length === 0 || c.length > MAX_CELLS || !c.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x)))) {
      issues.push({ code: 'invalid_value', path: 'tray.centers_in', message: `must be 1 to ${MAX_CELLS} [x, y] pairs of numbers` });
      ok = false;
    }
  } else {
    need('grid', (x) => Number.isInteger(x) && x >= 1, 'positive integers (columns, rows)');
    need('spacing_in', (x) => x >= 0, 'non-negative numbers');
    need('first_center_in', () => true, 'numbers');
    if (Array.isArray(t.grid) && t.grid.length === 2 && t.grid[0] * t.grid[1] > MAX_CELLS) {
      issues.push({ code: 'out_of_range', path: 'tray.grid', message: `at most ${MAX_CELLS} cells` });
      ok = false;
    }
  }
  if (!ok) return null;
  const { tray, outside } = trayGeometry(/** @type {import('./tray.js').TrayInput} */ (t));
  if (outside.length) {
    issues.push({ code: 'out_of_range', path: 'tray', message: `tray cells ${outside.join(', ')} extend past the page` });
    return null;
  }
  return tray;
}

/** @param {Issue[]} issues */
function invalid(issues) {
  return new NameTagsError('invalid_request', `The request has ${issues.length} problem${issues.length === 1 ? '' : 's'}: ${issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ')}`, issues);
}
