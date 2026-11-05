// Where is the probability mass? In k dimensions a standard normal's density is
// highest at the mode, but the volume at radius r grows like r^(k−1), so the mass
// (density × volume, the chi distribution) sits in a thin shell at radius ≈ √k.
// Four views:
//   shell   the chi distribution as density × volume, its shell, and the mass of a
//           ball around the mode, in closed form
//   cube    the original script's criterion: the cube whose minimum density × volume
//           is largest, for six families, against Monte Carlo radii
//   modes   one-dimensional mixtures where the mode or the mean misleads, and the
//           highest-density region as a water level falls
//   sphere  one coordinate of a uniform point on the unit sphere: a Beta-type
//           density that crowds the equator, with an optional Monte Carlo sample
// The R scripts are density_x_volume.R, mode_pathologies.R and
// marginal_dist_of_unit_hypersphere.R in ~/repos/minor_scripts/postdoc/; api.md says
// what was corrected.

import { dnorm, pnorm, pnormUpper, standardNormal } from '../lib/normal.js';
import { checkChoice, checkInteger, checkNumber, checkSample, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { betaI, gammaP, halfGammaRatio, lgamma, logGammaP, qgamma } from '../lib/special.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {import('../lib/params.js').SampleSpec} SampleSpec */
/** @typedef {'shell' | 'cube' | 'modes' | 'sphere'} View */
/** @typedef {'normal' | 'laplace' | 'uniform' | 'logistic' | 't3' | 'cauchy'} Family */
/** @typedef {{ weight: number, location: number, scale: number, shape: 'normal' | 'laplace' }} Component */
/**
 * @typedef {{ view: 'shell', k: number, coverage: number, radius: number }} ShellParams
 * @typedef {{ view: 'cube', family: Family, sample: SampleSpec | null }} CubeParams
 * @typedef {{ view: 'modes', components: Component[], level: number }} ModesParams
 * @typedef {{ view: 'sphere', k: number, band: number, sample: SampleSpec | null }} SphereParams
 * @typedef {ShellParams | CubeParams | ModesParams | SphereParams} Params
 */

export const ENTRY = 'typical-set';
export const VIEWS = /** @type {const} */ (['shell', 'cube', 'modes', 'sphere']);
export const FAMILIES = /** @type {const} */ (['normal', 'laplace', 'uniform', 'logistic', 't3', 'cauchy']);
const SHAPES = /** @type {const} */ (['normal', 'laplace']);
const LN10 = Math.LN10;

export const LIMITS = Object.freeze({
  maxK: 1000,
  maxRadius: 60,
  maxComponents: 3,
  location: 100,
  scale: /** @type {[number, number]} */ ([0.001, 100]),
  weight: /** @type {[number, number]} */ ([0.001, 1000]),
  cubeSample: 5000,
  sphereSample: 20000,
});

/** The cube view's dimensions, 1 to 1,024 in powers of 2. */
export const CUBE_DIMENSIONS = Object.freeze(Array.from({ length: 11 }, (_, i) => 2 ** i));

/**
 * The three mixtures drawn in mode_pathologies.R, with its relative masses as weights.
 * @type {Readonly<Record<'spike' | 'bimodal' | 'bathtub', readonly Readonly<Component>[]>>}
 */
export const PRESETS = Object.freeze({
  // dexp(|x|, rate = 50) on both sides (mass 2) plus 90 × N(6, 1).
  spike: Object.freeze([
    Object.freeze({ weight: 2, location: 0, scale: 0.02, shape: /** @type {const} */ ('laplace') }),
    Object.freeze({ weight: 90, location: 6, scale: 1, shape: /** @type {const} */ ('normal') }),
  ]),
  // 40 × N(−6, 1) + 40 × N(6, 1): the mean and median sit where there is no mass.
  bimodal: Object.freeze([
    Object.freeze({ weight: 40, location: -6, scale: 1, shape: /** @type {const} */ ('normal') }),
    Object.freeze({ weight: 40, location: 6, scale: 1, shape: /** @type {const} */ ('normal') }),
  ]),
  // The "bathtub" animation: 0.9 × N(−10, 10²) + 0.1 × N(10, 1).
  bathtub: Object.freeze([
    Object.freeze({ weight: 0.9, location: -10, scale: 10, shape: /** @type {const} */ ('normal') }),
    Object.freeze({ weight: 0.1, location: 10, scale: 1, shape: /** @type {const} */ ('normal') }),
  ]),
});

/**
 * @type {Readonly<{ shell: Readonly<Omit<ShellParams, 'view'>>, cube: Readonly<Omit<CubeParams, 'view'>>,
 *   modes: Readonly<{ components: readonly Readonly<Component>[], level: number }>, sphere: Readonly<Omit<SphereParams, 'view'>> }>}
 */
export const DEFAULTS = Object.freeze({
  shell: Object.freeze({ k: 10, coverage: 0.9, radius: 1 }),
  cube: Object.freeze({ family: /** @type {Family} */ ('normal'), sample: null }),
  modes: Object.freeze({ components: PRESETS.bathtub, level: 0.5 }),
  sphere: Object.freeze({ k: 10, band: 0.1, sample: null }),
});

const FIELDS = {
  shell: ['view', 'k', 'coverage', 'radius'],
  cube: ['view', 'family', 'sample'],
  modes: ['view', 'components', 'level'],
  sphere: ['view', 'k', 'band', 'sample'],
};

// ---------- Parameters ----------

/**
 * Validates params and fills in defaults for the chosen view (default "shell").
 * Throws one IntuitionsError listing every problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'shell';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  const v = /** @type {View} */ (view);
  /** @type {Issue[]} */
  const issues = [];
  rejectUnknown(params, FIELDS[v], 'params', issues);
  const has = (/** @type {string} */ key) => Object.hasOwn(params, key);
  const d = /** @type {Record<string, any>} */ (DEFAULTS[v]);
  const number = (/** @type {string} */ key, /** @type {number} */ min, /** @type {number} */ max) => (has(key) ? checkNumber(params[key], `params.${key}`, min, max, d[key], issues) : d[key]);
  const integer = (/** @type {string} */ key, /** @type {number} */ min, /** @type {number} */ max) => (has(key) ? checkInteger(params[key], `params.${key}`, min, max, d[key], issues) : d[key]);
  const sample = (/** @type {number} */ max) => (has('sample') ? checkSample(params.sample, max, 'points', issues) : null);

  /** @type {Params} */
  let resolved;
  if (v === 'shell') resolved = { view: v, k: integer('k', 1, LIMITS.maxK), coverage: number('coverage', 0.5, 0.99), radius: number('radius', 0, LIMITS.maxRadius) };
  else if (v === 'cube') resolved = { view: v, family: has('family') ? checkChoice(params.family, 'params.family', FAMILIES, d.family, issues) : d.family, sample: sample(LIMITS.cubeSample) };
  else if (v === 'modes') resolved = { view: v, components: has('components') ? checkComponents(params.components, issues) : d.components.map((/** @type {Component} */ c) => ({ ...c })), level: number('level', 0, 1) };
  else resolved = { view: v, k: integer('k', 2, LIMITS.maxK), band: number('band', 0.001, 1), sample: sample(LIMITS.sphereSample) };
  if (issues.length) throw invalidRequest(issues);
  return resolved;
}

/**
 * Mixture components: 1 to 3 objects {weight, location, scale, shape}.
 * @param {unknown} value @param {Issue[]} issues
 * @returns {Component[]}
 */
function checkComponents(value, issues) {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.maxComponents) {
    issues.push({ code: 'wrong_type', path: 'params.components', message: `must be an array of 1 to ${LIMITS.maxComponents} components {weight, location, scale, shape}` });
    return PRESETS.bathtub.map((c) => ({ ...c }));
  }
  return value.map((c, i) => {
    const path = `params.components[${i}]`;
    if (!isObject(c)) {
      issues.push({ code: 'wrong_type', path, message: 'must be an object {weight, location, scale, shape}' });
      return { weight: 1, location: 0, scale: 1, shape: /** @type {const} */ ('normal') };
    }
    rejectUnknown(c, ['weight', 'location', 'scale', 'shape'], path, issues);
    /** @param {string} key @param {number} min @param {number} max @param {number} fallback */
    const num = (key, min, max, fallback) => (Object.hasOwn(c, key)
      ? checkNumber(c[key], `${path}.${key}`, min, max, fallback, issues)
      : (issues.push({ code: 'missing_field', path: `${path}.${key}`, message: 'is missing' }), fallback));
    return {
      weight: num('weight', ...LIMITS.weight, 1),
      location: num('location', -LIMITS.location, LIMITS.location, 0),
      scale: num('scale', ...LIMITS.scale, 1),
      shape: Object.hasOwn(c, 'shape') ? checkChoice(c.shape, `${path}.shape`, SHAPES, 'normal', issues) : 'normal',
    };
  });
}

// ---------- The chi distribution: a standard normal's distance from its mode ----------

/** log density of the chi distribution with k degrees of freedom. @param {number} r @param {number} k */
export function chiLogDensity(r, k) {
  if (r <= 0) return k === 1 && r === 0 ? 0.5 * Math.log(2 / Math.PI) : -Infinity;
  return (k - 1) * Math.log(r) - (r * r) / 2 - (k / 2 - 1) * Math.LN2 - lgamma(k / 2);
}
/** P(R ≤ r) for R ~ chi(k): the share of a k-dimensional standard normal within r of its mode. @param {number} r @param {number} k */
export const chiCdf = (r, k) => gammaP(k / 2, (r * r) / 2);
/** The chi quantile. @param {number} p @param {number} k */
export const chiQuantile = (p, k) => Math.sqrt(2 * qgamma(p, k / 2));
/** E R = √2 Γ((k + 1)/2) / Γ(k/2). @param {number} k */
export const chiMean = (k) => Math.SQRT2 * halfGammaRatio(k / 2);

/** Dimensions for the sweep: 1 to 1,000, about 20 per decade. */
const SWEEP_K = [...new Set(Array.from({ length: 61 }, (_, i) => Math.round(10 ** (i / 20))))];

/** @param {ShellParams} p */
function shell({ k, coverage, radius }) {
  const tail = (1 - coverage) / 2;
  const summary = (/** @type {number} */ dim) => {
    const mean = chiMean(dim);
    return {
      mode: Math.sqrt(dim - 1),
      mean,
      sd: Math.sqrt(Math.max(0, dim - mean * mean)),
      lo: chiQuantile(tail, dim),
      hi: chiQuantile(1 - tail, dim),
      hdrRadius: chiQuantile(coverage, dim),
    };
  };
  const here = summary(k);
  const rMax = Math.max(4.5, chiQuantile(1 - 1e-6, k), radius * 1.05);
  const points = 241;
  const radii = Array.from({ length: points }, (_, i) => (rMax * i) / (points - 1));
  const logSurfaceConstant = Math.log10(2) + (k / 2) * Math.log10(Math.PI) - lgamma(k / 2) / LN10;
  const sweeps = SWEEP_K.map(summary);
  const logBall = logGammaP(k / 2, (radius * radius) / 2);
  return {
    view: 'shell',
    k,
    coverage,
    mode: here.mode,
    mean: here.mean,
    sd: here.sd,
    median: chiQuantile(0.5, k),
    shell: { lo: here.lo, hi: here.hi, width: here.hi - here.lo },
    hdrRadius: here.hdrRadius,
    ball: { radius, mass: Math.exp(logBall), log10Mass: radius > 0 ? logBall / LN10 : null },
    log10DensityRatio: -(here.mode * here.mode) / (2 * LN10),
    curve: {
      radius: radii,
      log10Density: radii.map((r) => -(k / 2) * Math.log10(2 * Math.PI) - (r * r) / (2 * LN10)),
      log10Surface: radii.map((r) => (r === 0 ? (k === 1 ? logSurfaceConstant : null) : logSurfaceConstant + (k - 1) * Math.log10(r))),
      mass: radii.map((r) => Math.exp(chiLogDensity(r, k))),
    },
    sweep: {
      k: SWEEP_K,
      mode: sweeps.map((s) => s.mode),
      mean: sweeps.map((s) => s.mean),
      sd: sweeps.map((s) => s.sd),
      lo: sweeps.map((s) => s.lo),
      hi: sweeps.map((s) => s.hi),
      hdrRadius: sweeps.map((s) => s.hdrRadius),
    },
  };
}

// ---------- The cube criterion of density_x_volume.R, by family ----------

const LAPLACE_B = Math.SQRT1_2; // unit variance
const LOGISTIC_S = Math.sqrt(3) / Math.PI; // unit variance

/** The root of u tanh u = ½, where a·d(a) peaks for the logistic (a = 2su). */
function logisticRoot() {
  let u = 0.75;
  for (let i = 0; i < 50; i++) {
    const t = Math.tanh(u);
    const step = (u * t - 0.5) / (t + u * (1 - t * t));
    u -= step;
    if (Math.abs(step) < 1e-16) break;
  }
  return u;
}

/**
 * Each family as the script defines it (normal, unit-variance Laplace, uniform and
 * logistic; t with 3 degrees of freedom and the Cauchy at scale 1): the half-width a*
 * that maximises a·d(a), P(|X| ≤ a), the SD, and an inversion sampler.
 * @type {Record<Family, { halfWidth: number, within: (a: number) => number, sd: number | null, draw: (rng: () => number) => number }>}
 */
const FAMILY = {
  normal: { halfWidth: 1, within: (a) => 1 - 2 * pnorm(-a), sd: 1, draw: (rng) => standardNormal(rng) },
  laplace: {
    halfWidth: LAPLACE_B, within: (a) => -Math.expm1(-a / LAPLACE_B), sd: 1,
    draw: (rng) => { const u = rng() + 2 ** -33 - 0.5; return -LAPLACE_B * Math.sign(u) * Math.log1p(-2 * Math.abs(u)); },
  },
  uniform: { halfWidth: Math.sqrt(3), within: (a) => Math.min(1, a / Math.sqrt(3)), sd: 1, draw: (rng) => Math.sqrt(3) * (2 * rng() - 1) },
  logistic: {
    halfWidth: 2 * LOGISTIC_S * logisticRoot(), within: (a) => Math.tanh(a / (2 * LOGISTIC_S)), sd: 1,
    draw: (rng) => { const u = rng() + 2 ** -33; return LOGISTIC_S * Math.log(u / (1 - u)); },
  },
  t3: {
    halfWidth: 1,
    within: (a) => { const th = Math.atan(a / Math.sqrt(3)); return (2 / Math.PI) * (th + Math.sin(th) * Math.cos(th)); },
    sd: Math.sqrt(3),
    draw: (rng) => {
      const z = standardNormal(rng);
      let v = 0;
      for (let i = 0; i < 3; i++) v += standardNormal(rng) ** 2;
      return z / Math.sqrt(v / 3);
    },
  },
  cauchy: { halfWidth: 1, within: (a) => (2 / Math.PI) * Math.atan(a), sd: null, draw: (rng) => Math.tan(Math.PI * (rng() + 2 ** -33 - 0.5)) },
};

/** R's default (type 7) quantile of sorted values. @param {Float64Array} sorted @param {number} p */
function quantileSorted(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** @param {CubeParams} p */
function cube({ family, sample }) {
  const f = FAMILY[family];
  const a = f.halfWidth;
  const inside = f.within(a);
  let mc = null;
  if (sample) {
    const rng = mulberry32(sample.seed);
    const median = [];
    const lo = [];
    const hi = [];
    for (const k of CUBE_DIMENSIONS) {
      const radii = new Float64Array(sample.n);
      for (let i = 0; i < sample.n; i++) {
        let sum = 0;
        for (let j = 0; j < k; j++) sum += f.draw(rng) ** 2;
        radii[i] = Math.sqrt(sum);
      }
      radii.sort();
      median.push(quantileSorted(radii, 0.5));
      lo.push(quantileSorted(radii, 0.05));
      hi.push(quantileSorted(radii, 0.95));
    }
    mc = { n: sample.n, seed: sample.seed, median, lo, hi };
  }
  return {
    view: 'cube',
    family,
    halfWidth: a,
    sd: f.sd,
    withinHalfWidth: inside,
    dimensions: [...CUBE_DIMENSIONS],
    distance: CUBE_DIMENSIONS.map((k) => a * Math.sqrt(k)),
    log10CubeMass: CUBE_DIMENSIONS.map((k) => (k * Math.log(inside)) / LN10),
    exact: family === 'normal' ? {
      median: CUBE_DIMENSIONS.map((k) => chiQuantile(0.5, k)),
      lo: CUBE_DIMENSIONS.map((k) => chiQuantile(0.05, k)),
      hi: CUBE_DIMENSIONS.map((k) => chiQuantile(0.95, k)),
    } : null,
    sample: mc,
  };
}

// ---------- Mixtures where the mode or the mean misleads ----------

/** Density and CDF of one component. @param {Component} c */
function componentFunctions(c) {
  const { location: m, scale: s } = c;
  if (c.shape === 'normal') return { pdf: (/** @type {number} */ x) => dnorm(x, m, s), cdf: (/** @type {number} */ x) => pnorm(x, m, s), sd: s };
  return {
    pdf: (/** @type {number} */ x) => Math.exp(-Math.abs(x - m) / s) / (2 * s),
    cdf: (/** @type {number} */ x) => (x < m ? 0.5 * Math.exp((x - m) / s) : 1 - 0.5 * Math.exp(-(x - m) / s)),
    sd: Math.SQRT2 * s,
  };
}

/**
 * The normalised mixture: its density, CDF, mean and SD.
 * @param {Component[]} components
 */
export function mixture(components) {
  const total = components.reduce((sum, c) => sum + c.weight, 0);
  const parts = components.map((c) => ({ ...componentFunctions(c), w: c.weight / total, c }));
  const mean = parts.reduce((sum, p) => sum + p.w * p.c.location, 0);
  const second = parts.reduce((sum, p) => sum + p.w * (p.sd * p.sd + p.c.location * p.c.location), 0);
  return {
    weights: parts.map((p) => p.w),
    pdf: (/** @type {number} */ x) => parts.reduce((sum, p) => sum + p.w * p.pdf(x), 0),
    cdf: (/** @type {number} */ x) => (x === -Infinity ? 0 : x === Infinity ? 1 : parts.reduce((sum, p) => sum + p.w * p.cdf(x), 0)),
    mean,
    sd: Math.sqrt(Math.max(0, second - mean * mean)),
    // Each component's own reach, for the grid: ±10 scales for the heavier Laplace tail.
    spans: parts.map((p) => [p.c.location - (p.c.shape === 'laplace' ? 10 : 6) * p.c.scale, p.c.location + (p.c.shape === 'laplace' ? 10 : 6) * p.c.scale]),
  };
}

/**
 * A grid over the mixture: evenly spaced across its whole range, plus a dense patch
 * around each component so a narrow spike is resolved.
 * @param {ReturnType<typeof mixture>} mix @param {Component[]} components
 */
function mixtureGrid(mix, components) {
  const lo = Math.min(...mix.spans.map((s) => s[0]));
  const hi = Math.max(...mix.spans.map((s) => s[1]));
  const xs = Array.from({ length: 601 }, (_, i) => lo + ((hi - lo) * i) / 600);
  for (const c of components) for (let i = -40; i <= 40; i++) xs.push(c.location + (i / 10) * c.scale);
  return [...new Set(xs.filter((x) => x >= lo && x <= hi))].sort((a, b) => a - b);
}

/**
 * The largest value of f in [a, b], by golden-section search (f unimodal there).
 * @param {(x: number) => number} f @param {number} a @param {number} b
 */
function goldenMax(f, a, b) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a);
  let x2 = a + g * (b - a);
  let f1 = f(x1);
  let f2 = f(x2);
  for (let i = 0; i < 200 && b - a > 1e-13 * (1 + Math.abs(a)); i++) {
    if (f1 < f2) {
      a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2);
    } else {
      b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1);
    }
  }
  return (a + b) / 2;
}

/** The point in [a, b] where g changes sign, by bisection. @param {(x: number) => number} g @param {number} a @param {number} b */
function bisect(g, a, b) {
  const ga = g(a) > 0;
  for (let i = 0; i < 100 && b - a > 1e-14 * (1 + Math.abs(a)); i++) {
    const mid = (a + b) / 2;
    if ((g(mid) > 0) === ga) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/**
 * The region where the density exceeds `threshold`, as intervals (null ends are
 * infinite), with the mass of each.
 * @param {ReturnType<typeof mixture>} mix @param {number[]} grid @param {number[]} dens @param {number} threshold
 */
function regionAbove(mix, grid, dens, threshold) {
  if (threshold <= 0) return [{ lo: null, hi: null, mass: 1 }];
  const g = (/** @type {number} */ x) => mix.pdf(x) - threshold;
  /** @type {{ lo: number | null, hi: number | null, mass: number }[]} */
  const regions = [];
  /** @type {number | null} */
  let start = dens[0] > threshold ? -Infinity : null;
  let open = dens[0] > threshold;
  for (let i = 1; i < grid.length; i++) {
    const above = dens[i] > threshold;
    if (above && !open) start = bisect(g, grid[i - 1], grid[i]);
    if (!above && open) {
      const end = bisect(g, grid[i - 1], grid[i]);
      regions.push({ lo: /** @type {number} */ (start), hi: end, mass: 0 });
    }
    open = above;
  }
  if (open) regions.push({ lo: /** @type {number} */ (start), hi: Infinity, mass: 0 });
  return regions.map((r) => ({
    lo: Number.isFinite(r.lo) ? r.lo : null,
    hi: Number.isFinite(r.hi) ? r.hi : null,
    mass: mix.cdf(/** @type {number} */ (r.hi)) - mix.cdf(/** @type {number} */ (r.lo)),
  }));
}

/** @param {ModesParams} p */
function modes({ components, level }) {
  const mix = mixture(components);
  const grid = mixtureGrid(mix, components);
  const dens = grid.map(mix.pdf);
  // Local maxima on the grid, each refined; the highest first.
  /** @type {{ x: number, density: number }[]} */
  const maxima = [];
  for (let i = 0; i < grid.length; i++) {
    const left = i === 0 ? -Infinity : dens[i - 1];
    const right = i === grid.length - 1 ? -Infinity : dens[i + 1];
    if (dens[i] > left && dens[i] >= right) {
      const x = goldenMax(mix.pdf, grid[Math.max(0, i - 1)], grid[Math.min(grid.length - 1, i + 1)]);
      if (!maxima.some((m) => Math.abs(m.x - x) < 1e-6 * (1 + Math.abs(x)))) maxima.push({ x, density: mix.pdf(x) });
    }
  }
  maxima.sort((a, b) => b.density - a.density);
  const peak = maxima[0].density;
  const median = bisect((x) => mix.cdf(x) - 0.5, grid[0], grid[grid.length - 1]);
  const threshold = level * peak;
  const regions = regionAbove(mix, grid, dens, threshold).map((r) => ({
    ...r,
    containsMode: (r.lo === null || r.lo <= maxima[0].x) && (r.hi === null || r.hi >= maxima[0].x),
  }));
  const levels = Array.from({ length: 101 }, (_, i) => i / 100);
  return {
    view: 'modes',
    weights: mix.weights,
    mean: mix.mean,
    sd: mix.sd,
    median,
    mode: maxima[0].x,
    peak,
    modes: maxima,
    densityAtMean: mix.pdf(mix.mean) / peak,
    densityAtMedian: mix.pdf(median) / peak,
    level,
    threshold,
    regions,
    covered: regions.reduce((sum, r) => sum + r.mass, 0),
    curve: { x: grid, density: dens },
    coverage: { level: levels, covered: levels.map((l) => regionAbove(mix, grid, dens, l * peak).reduce((sum, r) => sum + r.mass, 0)) },
  };
}

// ---------- One coordinate of a uniform point on the sphere ----------

/**
 * Density of x₁ for a uniform point on the unit sphere in k dimensions,
 * Γ(k/2) / (√π Γ((k − 1)/2)) (1 − x²)^((k − 3)/2): (x₁ + 1)/2 is Beta((k − 1)/2, (k − 1)/2).
 * @param {number} x in (−1, 1) @param {number} k ≥ 2
 */
export function sphereMarginal(x, k) {
  return Math.exp(lgamma(k / 2) - lgamma((k - 1) / 2) - 0.5 * Math.log(Math.PI) + ((k - 3) / 2) * Math.log1p(-x * x));
}

/** @param {SphereParams} p */
function sphere({ k, band, sample }) {
  const points = 400;
  const xs = Array.from({ length: points }, (_, i) => -1 + ((i + 0.5) * 2) / points);
  let mc = null;
  if (sample) {
    const rng = mulberry32(sample.seed);
    const bins = 80;
    const counts = new Array(bins).fill(0);
    let inside = 0;
    let sumSquares = 0;
    for (let i = 0; i < sample.n; i++) {
      // A uniform point on the sphere: k standard normals, scaled to length 1.
      const first = standardNormal(rng);
      let norm = first * first;
      for (let j = 1; j < k; j++) norm += standardNormal(rng) ** 2;
      const x = first / Math.sqrt(norm);
      counts[Math.min(bins - 1, Math.floor(((x + 1) / 2) * bins))] += 1;
      if (Math.abs(x) < band) inside += 1;
      sumSquares += x * x;
    }
    const width = 2 / bins;
    mc = {
      n: sample.n,
      seed: sample.seed,
      edges: Array.from({ length: bins + 1 }, (_, i) => -1 + i * width),
      density: counts.map((c) => c / (sample.n * width)),
      bandShare: inside / sample.n,
      sd: Math.sqrt(sumSquares / sample.n),
    };
  }
  return {
    view: 'sphere',
    k,
    band,
    sd: 1 / Math.sqrt(k),
    // x₁² is Beta(½, (k − 1)/2), so P(|x₁| < band) = I_{band²}(½, (k − 1)/2).
    bandMass: betaI(band * band, 0.5, (k - 1) / 2),
    normalBandMass: 1 - 2 * pnormUpper(band * Math.sqrt(k)),
    curve: { x: xs, density: xs.map((x) => sphereMarginal(x, k)) },
    sample: mc,
  };
}

// ---------- Entry point ----------

/**
 * The entry's computation. Same params, same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  if (p.view === 'shell') return shell(p);
  if (p.view === 'cube') return cube(p);
  if (p.view === 'modes') return modes(p);
  return sphere(p);
}
