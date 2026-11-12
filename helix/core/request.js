// Request validation. Everything that turns outside input into a complete, checked request
// lives here, so the API, the command line and the page reject exactly the same things with
// the same messages. Every problem is collected, so a caller can fix them all at once.

/**
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {'none' | 'strand1' | 'strand2' | 'both'} ExtensionStrands
 * @typedef {{
 *   turns: number, startAngle: number, amplitude: number, frequency: number, phaseShift: number, points: number,
 *   basePairsPerTurn: number, basePairGap: number, basePairThickness: number, alternateSides: boolean,
 *   partialDisplacement: boolean, crossingGap: number, squareWave: number, strandThickness: number, edgeWidth: number,
 *   rotation: number,
 *   extension: { strands: ExtensionStrands, length: number, taper: boolean },
 *   box: { width: number, height: number, fit: 'contain' | 'stretch', includeExtension: boolean },
 *   colors: { strand1: string, strand2: string, basePairs: string },
 * }} HelixSettings
 * @typedef {{ colors: string[], length: number, width: number, twists: number, minSegments: number, rotation: number }} BraidSettings
 * @typedef {{
 *   style: 'filled' | 'outline' | 'strokes', unit: 'mm' | 'in' | 'px', margin: number, background: string | null,
 *   strokeWidth: number | null, outlineWidth: number | null,
 * }} OutputSettings
 * @typedef {{ mode: 'helix', helix: HelixSettings, output: OutputSettings, path?: import('./path.js').PathSettings }
 *   | { mode: 'braid', braid: BraidSettings, output: OutputSettings, path?: import('./path.js').PathSettings }} Request
 */

export class HelixError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Issue[]} [issues]
   */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'HelixError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** draw_DNA()'s defaults, with the box and strand thickness ten times R's (100 and 1 for 10 and 0.1). */
export const HELIX_DEFAULTS = Object.freeze({
  turns: 2.5,
  startAngle: 90,
  amplitude: 1,
  frequency: 1,
  phaseShift: 180,
  points: 1000,
  basePairsPerTurn: 12,
  basePairGap: 0.2,
  basePairThickness: 1,
  alternateSides: false,
  partialDisplacement: true,
  crossingGap: 0.4,
  squareWave: 0.2,
  strandThickness: 1,
  edgeWidth: 0,
  rotation: 0,
  extension: Object.freeze({ strands: /** @type {ExtensionStrands} */ ('none'), length: 1, taper: false }),
  box: Object.freeze({ width: 100, height: 100, fit: /** @type {'contain' | 'stretch'} */ ('contain'), includeExtension: true }),
  colors: Object.freeze({ strand1: '#000000', strand2: '#000000', basePairs: '#000000' }),
});

/** braid_segment()'s defaults, with the three colours of its example. */
export const BRAID_DEFAULTS = Object.freeze({
  colors: Object.freeze(['#E41A1C', '#377EB8', '#4DAF4A']),
  length: 100,
  width: 10,
  twists: 2,
  minSegments: 50,
  rotation: 0,
});

export const OUTPUT_DEFAULTS = Object.freeze({
  style: /** @type {'filled' | 'outline' | 'strokes'} */ ('filled'),
  unit: /** @type {'mm' | 'in' | 'px'} */ ('mm'),
  margin: 0,
  background: null,
  strokeWidth: null,
  outlineWidth: null,
});

const MAX_POLYGON_WORK = 40000; // braid strands × segments: each is one polygon difference

/**
 * Validates a request and fills in defaults. Throws one HelixError listing every problem.
 * @param {unknown} request
 * @returns {Request}
 */
export function normalizeRequest(request) {
  /** @type {Issue[]} */
  const issues = [];
  if (!isObject(request)) {
    throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object' }]);
  }
  const top = new Fields(request, '', issues);
  top.allow(['mode', 'helix', 'braid', 'output', 'path']);
  const path = !top.has('path') || top.raw('path') === null ? undefined : readPath(top.object('path'));
  const mode = top.choice('mode', ['helix', 'braid'], 'helix');
  const other = mode === 'helix' ? 'braid' : 'helix';
  if (Object.hasOwn(request, other)) {
    issues.push({ code: 'conflicting_fields', path: other, message: `is for mode "${other}", but the mode is "${mode}"` });
  }
  const output = readOutput(top.object('output'));
  if (mode === 'helix') {
    const helix = readHelix(top.object('helix'), issues);
    if (issues.length) throw invalid(issues);
    return { mode, helix, output, ...(path ? { path } : {}) };
  }
  const braid = readBraid(top.object('braid'), issues);
  if (issues.length) throw invalid(issues);
  return { mode, braid, output, ...(path ? { path } : {}) };
}

/** Optional freehand guide; absent/null preserves the original generator exactly.
 * @param {Fields} f @returns {import('./path.js').PathSettings}
 */
function readPath(f) {
  f.allow(['points', 'length', 'width', 'smoothing']);
  const raw = f.raw('points');
  /** @type {[number, number][]} */ const points = [];
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 2048) {
    f.problem('invalid_points', 'points', 'must contain 2 to 2048 coordinate pairs');
  } else {
    raw.forEach((p, i) => {
      if (!Array.isArray(p) || p.length !== 2 || p.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e6)) {
        f.problem('invalid_points', `points[${i}]`, 'must be two finite coordinates between -1000000 and 1000000');
      } else points.push([p[0], p[1]]);
    });
  }
  return { points, length: f.number('length', 100, {gt: 0, max: 1e6}), width: f.number('width', 10, {gt: 0, max: 1e6}), smoothing: f.number('smoothing', 1, {min: 0, max: 2}) };
}

/** @param {Fields} f @param {Issue[]} issues @returns {HelixSettings} */
function readHelix(f, issues) {
  const d = HELIX_DEFAULTS;
  f.allow(Object.keys(d));
  const ext = f.object('extension');
  ext.allow(Object.keys(d.extension));
  const box = f.object('box');
  box.allow(Object.keys(d.box));
  const colors = f.object('colors');
  colors.allow(Object.keys(d.colors));
  const h = {
    turns: f.number('turns', d.turns, { gt: 0, max: 100 }),
    startAngle: f.number('startAngle', d.startAngle, { min: -36000, max: 36000 }),
    amplitude: f.number('amplitude', d.amplitude, { gt: 0, max: 100 }),
    frequency: f.number('frequency', d.frequency, { gt: 0, max: 100 }),
    phaseShift: f.number('phaseShift', d.phaseShift, { min: 0, max: 360 }),
    points: f.integer('points', d.points, 10, 20000),
    basePairsPerTurn: f.number('basePairsPerTurn', d.basePairsPerTurn, { min: 0, max: 200 }),
    basePairGap: f.number('basePairGap', d.basePairGap, { min: 0, lt: 1 }),
    basePairThickness: f.number('basePairThickness', d.basePairThickness, { min: 0, max: 100 }),
    alternateSides: f.boolean('alternateSides', d.alternateSides),
    partialDisplacement: f.boolean('partialDisplacement', d.partialDisplacement),
    crossingGap: f.number('crossingGap', d.crossingGap, { min: 0, max: 1000 }),
    squareWave: f.number('squareWave', d.squareWave, { min: 0, max: 1 }),
    strandThickness: f.number('strandThickness', d.strandThickness, { gt: 0, max: 1e6 }),
    edgeWidth: f.number('edgeWidth', d.edgeWidth, { min: 0, max: 1e6 }),
    rotation: f.number('rotation', d.rotation, { min: -36000, max: 36000 }),
    extension: {
      strands: ext.choice('strands', ['none', 'strand1', 'strand2', 'both'], d.extension.strands),
      length: ext.number('length', d.extension.length, { min: 0, max: 100 }),
      taper: ext.boolean('taper', d.extension.taper),
    },
    box: {
      width: box.number('width', d.box.width, { gt: 0, max: 1e6 }),
      height: box.number('height', d.box.height, { gt: 0, max: 1e6 }),
      fit: box.choice('fit', ['contain', 'stretch'], d.box.fit),
      includeExtension: box.boolean('includeExtension', d.box.includeExtension),
    },
    colors: {
      strand1: colors.color('strand1', d.colors.strand1),
      strand2: colors.color('strand2', d.colors.strand2),
      basePairs: colors.color('basePairs', d.colors.basePairs),
    },
  };
  if (h.turns * h.basePairsPerTurn > 20000) {
    issues.push({ code: 'out_of_range', path: 'helix.basePairsPerTurn', message: 'turns × basePairsPerTurn must be at most 20000' });
  }
  return h;
}

/** @param {Fields} f @param {Issue[]} issues @returns {BraidSettings} */
function readBraid(f, issues) {
  const d = BRAID_DEFAULTS;
  f.allow(Object.keys(d));
  const b = {
    colors: f.colorList('colors', d.colors.slice(), 1, 24),
    length: f.number('length', d.length, { gt: 0, max: 1e6 }),
    width: f.number('width', d.width, { gt: 0, max: 1e6 }),
    twists: f.number('twists', d.twists, { min: -1000, max: 1000 }),
    minSegments: f.integer('minSegments', d.minSegments, 1, 5000),
    rotation: f.number('rotation', d.rotation, { min: -36000, max: 36000 }),
  };
  // segments grow with the crossings: about twists × strands² of them
  const work = b.colors.length * (b.minSegments + Math.abs(b.twists) * b.colors.length * b.colors.length);
  if (work > MAX_POLYGON_WORK) {
    issues.push({ code: 'out_of_range', path: 'braid', message: `strands × (minSegments + |twists| × strands²) is ${Math.round(work)}; it must be at most ${MAX_POLYGON_WORK}` });
  }
  return b;
}

/** @param {Fields} f @returns {OutputSettings} */
function readOutput(f) {
  const d = OUTPUT_DEFAULTS;
  f.allow(Object.keys(d));
  return {
    style: f.choice('style', ['filled', 'outline', 'strokes'], d.style),
    unit: f.choice('unit', ['mm', 'in', 'px'], d.unit),
    margin: f.number('margin', d.margin, { min: 0, max: 1e6 }),
    background: f.has('background') && f.raw('background') !== null ? f.color('background', '#ffffff') : null,
    strokeWidth: f.has('strokeWidth') && f.raw('strokeWidth') !== null ? f.number('strokeWidth', 1, { gt: 0, max: 1e6 }) : null,
    outlineWidth: f.has('outlineWidth') && f.raw('outlineWidth') !== null ? f.number('outlineWidth', 1, { gt: 0, max: 1e6 }) : null,
  };
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Reads the fields of one request object, recording problems at their paths. */
class Fields {
  /** @param {Record<string, unknown> | null} obj @param {string} path @param {Issue[]} issues */
  constructor(obj, path, issues) {
    this.obj = obj ?? {};
    this.path = path;
    this.issues = issues;
  }

  /** @param {string} key */
  at(key) { return this.path ? `${this.path}.${key}` : key; }

  /** @param {string} key */
  has(key) { return Object.hasOwn(this.obj, key); }

  /** @param {string} key */
  raw(key) { return this.obj[key]; }

  /** @param {string} code @param {string} key @param {string} message */
  problem(code, key, message) { this.issues.push({ code, path: this.at(key), message }); }

  /** @param {string[]} keys */
  allow(keys) {
    for (const key of Object.keys(this.obj)) {
      if (!keys.includes(key)) this.problem('unknown_field', key, `unknown field; the fields here are ${keys.join(', ')}`);
    }
  }

  /** A nested object (or {} when absent). @param {string} key */
  object(key) {
    if (!this.has(key)) return new Fields({}, this.at(key), this.issues);
    const v = this.raw(key);
    if (!isObject(v)) {
      this.problem('wrong_type', key, 'must be an object');
      return new Fields({}, this.at(key), this.issues);
    }
    return new Fields(v, this.at(key), this.issues);
  }

  /**
   * @param {string} key @param {number} fallback
   * @param {{ min?: number, max?: number, gt?: number, lt?: number }} limits
   */
  number(key, fallback, limits) {
    if (!this.has(key)) return fallback;
    const v = this.raw(key);
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.problem('wrong_type', key, 'must be a finite number');
      return fallback;
    }
    const { min, max, gt, lt } = limits;
    const bad = (min !== undefined && v < min) || (max !== undefined && v > max) || (gt !== undefined && v <= gt) || (lt !== undefined && v >= lt);
    if (bad) {
      const lo = gt !== undefined ? `more than ${gt}` : min !== undefined ? `at least ${min}` : '';
      const hi = lt !== undefined ? `less than ${lt}` : max !== undefined ? `at most ${max}` : '';
      this.problem('out_of_range', key, `must be ${[lo, hi].filter(Boolean).join(' and ')}`);
      return fallback;
    }
    return v;
  }

  /** @param {string} key @param {number} fallback @param {number} min @param {number} max */
  integer(key, fallback, min, max) {
    if (!this.has(key)) return fallback;
    const v = this.raw(key);
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      this.problem('wrong_type', key, 'must be a whole number');
      return fallback;
    }
    if (v < min || v > max) {
      this.problem('out_of_range', key, `must be from ${min} to ${max}`);
      return fallback;
    }
    return v;
  }

  /** @param {string} key @param {boolean} fallback */
  boolean(key, fallback) {
    if (!this.has(key)) return fallback;
    const v = this.raw(key);
    if (typeof v !== 'boolean') {
      this.problem('wrong_type', key, 'must be true or false');
      return fallback;
    }
    return v;
  }

  /**
   * @template {string} T
   * @param {string} key @param {readonly T[]} choices @param {T} fallback
   * @returns {T}
   */
  choice(key, choices, fallback) {
    if (!this.has(key)) return fallback;
    const v = this.raw(key);
    if (typeof v !== 'string' || !choices.includes(/** @type {T} */ (v))) {
      this.problem(typeof v === 'string' ? 'out_of_range' : 'wrong_type', key, `must be one of ${choices.map((c) => `"${c}"`).join(', ')}`);
      return fallback;
    }
    return /** @type {T} */ (v);
  }

  /** @param {string} key @param {string} fallback */
  color(key, fallback) {
    if (!this.has(key)) return fallback;
    const v = this.raw(key);
    if (typeof v !== 'string' || !HEX.test(v)) {
      this.problem(typeof v === 'string' ? 'invalid_color' : 'wrong_type', key, 'must be a colour as "#rgb" or "#rrggbb"');
      return fallback;
    }
    return v;
  }

  /** @param {string} key @param {string[]} fallback @param {number} min @param {number} max */
  colorList(key, fallback, min, max) {
    if (!this.has(key)) return fallback;
    const v = this.raw(key);
    if (!Array.isArray(v)) {
      this.problem('wrong_type', key, 'must be an array of colours, one per strand');
      return fallback;
    }
    if (v.length < min || v.length > max) {
      this.problem('out_of_range', key, `must list from ${min} to ${max} colours, one per strand`);
      return fallback;
    }
    let ok = true;
    v.forEach((c, i) => {
      if (typeof c !== 'string' || !HEX.test(c)) {
        this.issues.push({ code: typeof c === 'string' ? 'invalid_color' : 'wrong_type', path: `${this.at(key)}[${i}]`, message: 'must be a colour as "#rgb" or "#rrggbb"' });
        ok = false;
      }
    });
    return ok ? v.slice() : fallback;
  }
}

/** @param {Issue[]} issues */
function invalid(issues) {
  const shown = issues.slice(0, 3).map((issue) => `${issue.path || 'request'}: ${issue.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new HelixError('invalid_request', `Invalid request: ${shown.join('; ')}`, issues);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
