// The geometry of correlation. Centre a variable's n observations and scale them
// to length 1: the variable becomes an arrow in n-dimensional observation space,
// and the correlation of two variables is the cosine of the angle between their
// arrows. A correlation matrix is then the table of cosines of a set of arrows, so
// it is positive semidefinite (PSD) exactly when such arrows exist. Five views,
// each in closed form:
//   arrows           data with 2 or 3 observations as arrows; r = cos θ
//   cone             fixing r_BC puts arrow C on a cone around B; with 3
//                    observations it meets the circle of possible arrows twice
//   cosine-rule      the range of r_AC allowed by r_AB and r_BC, and det R
//   equicorrelation  how negative k arrows can all be (a regular simplex), or how
//                    positive when one pair is held at 0
//   entry-range      one entry's interval given the rest of a matrix, and its
//                    expected width as the dimension grows
// The original R scripts are in ~/repos/minor_scripts/postdoc/ and
// ~/repos/dissertation_work/one-off_scripts/; see api.md for what was corrected.

import { addScaled, cross, dot, normalize, scale, symmetricEigen } from '../lib/linalg.js';
import { standardNormal } from '../lib/normal.js';
import { checkInteger, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { halfGammaRatio } from '../lib/special.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {import('../lib/linalg.js').Vector} Vector */
/** @typedef {[number, number, number]} Vec3 */
/** @typedef {'arrows' | 'cone' | 'cosine-rule' | 'equicorrelation' | 'entry-range'} View */
/**
 * @typedef {{ view: 'arrows', a: number[], b: number[] }} ArrowsParams
 * @typedef {{ view: 'cone', b: number[], a: number[], rBC: number }} ConeParams
 * @typedef {{ view: 'cosine-rule', rAB: number, rBC: number, rAC: number | null }} CosineParams
 * @typedef {{ view: 'equicorrelation', k: number, r: number, zeroPair: boolean }} EquiParams
 * @typedef {{ view: 'entry-range', matrix: number[][], cell: [number, number], observations: number }} EntryParams
 * @typedef {ArrowsParams | ConeParams | CosineParams | EquiParams | EntryParams} Params
 */

export const ENTRY = 'correlation-geometry';
export const VIEWS = /** @type {const} */ (['arrows', 'cone', 'cosine-rule', 'equicorrelation', 'entry-range']);

export const LIMITS = Object.freeze({
  value: 1000, // largest |data value|
  maxK: 100,
  maxP: 20,
  observations: /** @type {[number, number]} */ ([3, 200]),
  maxDimension: 200, // the expected-width curves run from 2 to this many variables
});

/** Tolerances: an eigenvalue above −PSD_TOL counts as ≥ 0; one below RANK_TOL as 0. */
const PSD_TOL = 1e-9;
const RANK_TOL = 1e-10;
const DEG = 180 / Math.PI;

export const DEFAULTS = Object.freeze({
  arrows: Object.freeze({ a: Object.freeze([1, 2, 4]), b: Object.freeze([1, 3, 2]) }),
  cone: Object.freeze({ b: Object.freeze([1, 0, -1]), a: Object.freeze([-1, 2, -1]), rBC: 0.6 }),
  'cosine-rule': Object.freeze({ rAB: 0.8, rBC: 0.7, rAC: null }),
  equicorrelation: Object.freeze({ k: 3, r: -0.25, zeroPair: false }),
  'entry-range': Object.freeze({
    matrix: Object.freeze([[1, 0.7, 0.5, 0.3], [0.7, 1, 0.6, 0.2], [0.5, 0.6, 1, 0.4], [0.3, 0.2, 0.4, 1]].map((row) => Object.freeze(row))),
    cell: Object.freeze([0, 3]),
    observations: 6,
  }),
});

const FIELDS = {
  arrows: ['view', 'a', 'b'],
  cone: ['view', 'b', 'a', 'rBC'],
  'cosine-rule': ['view', 'rAB', 'rBC', 'rAC'],
  equicorrelation: ['view', 'k', 'r', 'zeroPair'],
  'entry-range': ['view', 'matrix', 'cell', 'observations'],
};

// ---------- Parameters ----------

/**
 * Validates params and fills in defaults for the chosen view (default "arrows").
 * Throws one IntuitionsError listing every problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  /** @type {Issue[]} */
  const issues = [];
  const view = params.view ?? 'arrows';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  const v = /** @type {View} */ (view);
  rejectUnknown(params, FIELDS[v], 'params', issues);
  const has = (/** @type {string} */ key) => Object.hasOwn(params, key);
  const d = /** @type {Record<string, any>} */ (DEFAULTS[v]);
  const correlation = (/** @type {string} */ key) => (has(key) ? checkNumber(params[key], `params.${key}`, -1, 1, d[key], issues) : d[key]);

  /** @type {Params} */
  let resolved;
  if (v === 'arrows') {
    const a = has('a') ? checkData(params.a, 'params.a', [2, 3], issues) : [...d.a];
    const b = has('b') ? checkData(params.b, 'params.b', [2, 3], issues) : [...d.b];
    if (a.length !== b.length) issues.push({ code: 'wrong_type', path: 'params.b', message: `must have as many values as a (${a.length})` });
    resolved = { view: v, a, b };
  } else if (v === 'cone') {
    resolved = {
      view: v,
      b: has('b') ? checkData(params.b, 'params.b', [3], issues) : [...d.b],
      a: has('a') ? checkData(params.a, 'params.a', [3], issues) : [...d.a],
      rBC: correlation('rBC'),
    };
  } else if (v === 'cosine-rule') {
    resolved = { view: v, rAB: correlation('rAB'), rBC: correlation('rBC'), rAC: has('rAC') && params.rAC !== null ? correlation('rAC') : null };
  } else if (v === 'equicorrelation') {
    let zeroPair = d.zeroPair;
    if (has('zeroPair')) {
      if (typeof params.zeroPair === 'boolean') zeroPair = params.zeroPair;
      else issues.push({ code: 'wrong_type', path: 'params.zeroPair', message: 'must be true or false' });
    }
    const k = has('k') ? checkInteger(params.k, 'params.k', 2, LIMITS.maxK, d.k, issues) : d.k;
    if (zeroPair && k < 3) issues.push({ code: 'out_of_range', path: 'params.k', message: 'must be at least 3 when one pair is held at 0' });
    resolved = { view: v, k, r: correlation('r'), zeroPair };
  } else {
    const matrix = has('matrix') ? checkMatrix(params.matrix, issues) : d.matrix.map((/** @type {number[]} */ row) => [...row]);
    const p = matrix.length;
    let cell = /** @type {[number, number]} */ ([...d.cell]);
    if (has('cell')) {
      const value = params.cell;
      if (!Array.isArray(value) || value.length !== 2) {
        issues.push({ code: 'wrong_type', path: 'params.cell', message: 'must be [row, column], two variable indices counting from 0' });
      } else {
        cell = /** @type {[number, number]} */ (value.map((c, i) => checkInteger(c, `params.cell[${i}]`, 0, Math.max(0, p - 1), 0, issues)));
        if (value[0] === value[1]) issues.push({ code: 'out_of_range', path: 'params.cell', message: 'must name two different variables; the diagonal is always 1' });
      }
    } else if (p < 4) cell = [0, p - 1];
    const observations = has('observations') ? checkInteger(params.observations, 'params.observations', ...LIMITS.observations, d.observations, issues) : d.observations;
    resolved = { view: v, matrix, cell, observations };
  }
  if (issues.length) throw invalidRequest(issues);
  return resolved;
}

/**
 * A variable's observations: 2 or 3 finite numbers (as `lengths` allows) that
 * are not all equal.
 * @param {unknown} value @param {string} path @param {number[]} lengths @param {Issue[]} issues
 */
function checkData(value, path, lengths, issues) {
  if (!Array.isArray(value) || !lengths.includes(value.length)) {
    issues.push({ code: 'wrong_type', path, message: `must be an array of ${lengths.join(' or ')} numbers, one per observation` });
    return lengths.map(() => 0);
  }
  const data = value.map((x, i) => checkNumber(x, `${path}[${i}]`, -LIMITS.value, LIMITS.value, 0, issues));
  if (data.every((x) => x === data[0]) && value.every((x) => typeof x === 'number')) {
    issues.push({ code: 'no_spread', path, message: 'has no spread: every value is the same, so after centring it has no direction' });
  }
  return data;
}

/**
 * A correlation matrix: square, 2–20 rows, 1s on the diagonal, symmetric,
 * entries from −1 to 1, and positive semidefinite (checked last, only when the
 * rest is right).
 * @param {unknown} value @param {Issue[]} issues
 */
function checkMatrix(value, issues) {
  const path = 'params.matrix';
  if (!Array.isArray(value) || value.length < 2 || value.length > LIMITS.maxP || !value.every((row) => Array.isArray(row) && row.length === value.length)) {
    issues.push({ code: 'wrong_type', path, message: `must be a square array of 2 to ${LIMITS.maxP} rows, each with one number per variable` });
    return DEFAULTS['entry-range'].matrix.map((row) => [...row]);
  }
  const before = issues.length;
  const m = value.map((row, i) => row.map((/** @type {unknown} */ x, /** @type {number} */ j) => checkNumber(x, `${path}[${i}][${j}]`, -1, 1, i === j ? 1 : 0, issues)));
  const p = m.length;
  for (let i = 0; i < p; i++) {
    if (Math.abs(m[i][i] - 1) > 1e-12) issues.push({ code: 'out_of_range', path: `${path}[${i}][${i}]`, message: `is ${m[i][i]}; a correlation matrix has 1 on its diagonal` });
    for (let j = i + 1; j < p; j++) {
      if (Math.abs(m[i][j] - m[j][i]) > 1e-12) issues.push({ code: 'not_symmetric', path: `${path}[${j}][${i}]`, message: `is ${m[j][i]} but [${i}][${j}] is ${m[i][j]}; they must be equal` });
    }
  }
  if (issues.length > before) return m;
  const smallest = symmetricEigen(m).values[p - 1];
  if (smallest < -PSD_TOL) {
    issues.push({ code: 'not_positive_semidefinite', path, message: `is not positive semidefinite (its smallest eigenvalue is ${Number(smallest.toPrecision(3))}), so no set of arrows has these correlations` });
  }
  return m;
}

// ---------- Shared geometry ----------

/** A variable's centred, unit-length arrow. @param {number[]} data */
export function arrowOf(data) {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  return normalize(data.map((x) => x - mean));
}

/** cos⁻¹ in degrees, safe at ±1. @param {number} r */
export const angleOf = (r) => Math.acos(Math.max(-1, Math.min(1, r))) * DEG;

/**
 * An orthonormal basis of the plane x + y + z = 0, where every centred arrow with
 * three observations lies; positions on its great circle are angles in this basis.
 */
export const PLANE_BASIS = Object.freeze({
  e1: /** @type {Vec3} */ ([Math.SQRT1_2, -Math.SQRT1_2, 0]),
  e2: /** @type {Vec3} */ ([1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)]),
  normal: /** @type {Vec3} */ ([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]),
});

/** The centred unit arrow at `degrees` around the great circle. @param {number} degrees @returns {Vec3} */
export function circleArrow(degrees) {
  const t = degrees / DEG;
  return /** @type {Vec3} */ (addScaled(scale(PLANE_BASIS.e1, Math.cos(t)), PLANE_BASIS.e2, Math.sin(t)));
}

/** Position of a centred 3-observation arrow around the great circle, in [0, 360). @param {Vector} u */
export function circleAngle(u) {
  const a = Math.atan2(dot(u, PLANE_BASIS.e2), dot(u, PLANE_BASIS.e1)) * DEG;
  return a < 0 ? a + 360 : a;
}

// ---------- Views ----------

/** @param {ArrowsParams} p */
function arrows({ a, b }) {
  const n = a.length;
  const vectors = [arrowOf(a), arrowOf(b)];
  const r = Math.max(-1, Math.min(1, dot(vectors[0], vectors[1])));
  return {
    view: 'arrows',
    n,
    means: [a, b].map((d) => d.reduce((x, y) => x + y, 0) / n),
    vectors,
    r,
    angle: angleOf(r),
    circleAngles: n === 3 ? vectors.map(circleAngle) : null,
  };
}

/**
 * Arrow C has correlation rBC with arrow B, so it lies on the cone of half-angle
 * cos⁻¹ rBC around B. With 3 observations every arrow is on the great circle of
 * centred directions, which the cone meets at two points: B turned by ± that angle
 * within the circle's plane. A third arrow A then has one of only two correlations
 * with C.
 * @param {ConeParams} p
 */
function cone(p) {
  const b = /** @type {Vec3} */ (arrowOf(p.b));
  const a = /** @type {Vec3} */ (arrowOf(p.a));
  const radius = Math.sqrt(Math.max(0, 1 - p.rBC * p.rBC));
  // In the plane of centred arrows, the arrow a quarter turn on from B.
  const bPerp = cross(PLANE_BASIS.normal, b);
  const meets = [addScaled(scale(b, p.rBC), bPerp, radius), addScaled(scale(b, p.rBC), bPerp, -radius)];
  const withA = meets.map((c) => Math.max(-1, Math.min(1, dot(a, c))));
  return {
    view: 'cone',
    b,
    a,
    rBC: p.rBC,
    halfAngle: angleOf(p.rBC),
    circle: { centre: scale(b, p.rBC), radius },
    meets,
    rAB: dot(a, b),
    withA,
    anglesWithA: withA.map(angleOf),
    circleAngles: { a: circleAngle(a), b: circleAngle(b), meets: meets.map(circleAngle) },
  };
}

/**
 * The interval of r_AC that keeps [[1, a, c], [a, 1, b], [c, b, 1]] PSD: the cosine
 * rule cos(α ± β) with a = cos α, b = cos β.
 * @param {number} a r_AB @param {number} b r_BC
 */
export function cosineRuleInterval(a, b) {
  const halfWidth = Math.sqrt(Math.max(0, (1 - a * a) * (1 - b * b)));
  return { lo: a * b - halfWidth, hi: a * b + halfWidth, centre: a * b, halfWidth };
}

/** det of the 3 × 3 correlation matrix. @param {number} a r_AB @param {number} b r_BC @param {number} c r_AC */
export const det3 = (a, b, c) => 1 - a * a - b * b - c * c + 2 * a * b * c;

/** @param {CosineParams} p */
function cosineRule({ rAB, rBC, rAC }) {
  const { lo, hi, centre, halfWidth } = cosineRuleInterval(rAB, rBC);
  return {
    view: 'cosine-rule',
    rAB,
    rBC,
    angles: { AB: angleOf(rAB), BC: angleOf(rBC) },
    interval: [lo, hi],
    centre,
    halfWidth,
    forcedSign: lo > 0 ? 'positive' : hi < 0 ? 'negative' : null,
    detMax: halfWidth * halfWidth,
    rAC: rAC === null ? null : { value: rAC, det: det3(rAB, rBC, rAC), feasible: rAC >= lo - 1e-12 && rAC <= hi + 1e-12, angle: angleOf(rAC) },
  };
}

/**
 * The range of the common correlation c of k variables when one pair is held at 0:
 * the roots of 2(k − 2)c² − (k − 3)c − 1 = 0.
 * @param {number} k at least 3
 */
export function zeroPairRange(k) {
  const root = Math.sqrt(k * k + 2 * k - 7);
  return [(k - 3 - root) / (4 * (k - 2)), (k - 3 + root) / (4 * (k - 2))];
}

/**
 * Eigenvalues (with multiplicities, largest first) of the k × k matrix with every
 * off-diagonal entry r, or, with zeroPair, with entry (1, 2) set to 0.
 * @param {number} k @param {number} r @param {boolean} zeroPair
 */
export function equicorrelationEigenvalues(k, r, zeroPair) {
  /** @type {{ value: number, multiplicity: number }[]} */
  let values;
  if (!zeroPair) values = [{ value: 1 + (k - 1) * r, multiplicity: 1 }, { value: 1 - r, multiplicity: k - 1 }];
  else {
    // e1 − e2 has eigenvalue 1; contrasts among variables 3…k have 1 − r; the rest
    // is the 2 × 2 block on (e1 + e2, e3 + … + ek).
    const trace = 2 + r * (k - 3);
    const det = 1 + r * (k - 3) - 2 * (k - 2) * r * r;
    const root = Math.sqrt(Math.max(0, trace * trace - 4 * det));
    values = [{ value: 1, multiplicity: 1 }, { value: (trace + root) / 2, multiplicity: 1 }, { value: (trace - root) / 2, multiplicity: 1 }];
    if (k > 3) values.push({ value: 1 - r, multiplicity: k - 3 });
  }
  return values.sort((a, b) => b.value - a.value);
}

/** @param {EquiParams} p */
function equicorrelation({ k, r, zeroPair }) {
  const eigenvalues = equicorrelationEigenvalues(k, r, zeroPair);
  const smallest = eigenvalues[eigenvalues.length - 1].value;
  const feasible = smallest >= -1e-12;
  const range = zeroPair ? zeroPairRange(k) : [-1 / (k - 1), 1];
  const det = eigenvalues.reduce((product, e) => product * e.value ** e.multiplicity, 1);
  return {
    view: 'equicorrelation',
    k,
    r,
    zeroPair,
    range,
    feasible,
    eigenvalues,
    smallestEigenvalue: smallest,
    det,
    angle: angleOf(r),
    widestAngle: angleOf(range[0]),
    // Each arrow is a part along the common direction plus a part in the
    // perpendicular space; the perpendicular parts are the vertices of a regular
    // simplex. At r = −1/(k − 1) the common part is 0 and the arrows are that simplex.
    arrows: !zeroPair && feasible ? { along: Math.sqrt(Math.max(0, (1 + (k - 1) * r) / k)), across: Math.sqrt(Math.max(0, ((1 - r) * (k - 1)) / k)) } : null,
  };
}

/**
 * The interval for entry (i, j) of a PSD correlation matrix with the other
 * entries fixed: centre ± √((1 − a)(1 − b)), where, with S the other variables,
 * a = r_iᵀS⁺r_i and b = r_jᵀS⁺r_j are the shares of i and j explained by them and
 * the centre r_iᵀS⁺r_j is the value that maximises det R. S⁺ is the pseudo-inverse,
 * so the interval is right when the others are linearly dependent too.
 * @param {number[][]} R @param {number} i @param {number} j
 */
export function entryInterval(R, i, j) {
  const others = R.map((_, k) => k).filter((k) => k !== i && k !== j);
  const S = others.map((a) => others.map((b) => R[a][b]));
  const ri = others.map((k) => R[k][i]);
  const rj = others.map((k) => R[k][j]);
  let a = 0;
  let b = 0;
  let c = 0;
  let detOthers = 1;
  if (others.length) {
    const { values, vectors } = symmetricEigen(S);
    values.forEach((lambda, k) => {
      detOthers *= Math.max(0, lambda);
      if (lambda <= RANK_TOL) return;
      const pi = dot(vectors[k], ri);
      const pj = dot(vectors[k], rj);
      a += (pi * pi) / lambda;
      b += (pj * pj) / lambda;
      c += (pi * pj) / lambda;
    });
  }
  const residuals = [Math.max(0, 1 - a), Math.max(0, 1 - b)];
  const halfWidth = Math.sqrt(residuals[0] * residuals[1]);
  return { lo: Math.max(-1, c - halfWidth), hi: Math.min(1, c + halfWidth), centre: c, halfWidth, residuals, detOthers };
}

/**
 * Expected width of one entry's interval in a p × p matrix drawn uniformly from all
 * correlation matrices (LKJ with η = 1). In the C-vine, the shares of i and j left
 * unexplained by the other p − 2 are independent products of (1 − ρ²) over
 * independent partial correlations ρ ~ 2·Beta(β, β) − 1, β = 1 + (p − 1 − k)/2 at
 * level k, and E√(1 − ρ²) = (Γ(β + ½)/Γ(β))²/β.
 * @param {number} p
 */
export function expectedWidthUniform(p) {
  let factor = 1;
  for (let k = 1; k <= p - 2; k++) {
    const beta = 1 + (p - 1 - k) / 2;
    factor *= halfGammaRatio(beta) ** 2 / beta;
  }
  return 2 * factor * factor;
}

/**
 * Expected width of one entry's interval in the sample correlation matrix of n
 * observations of p independent normal variables. The centred arrows point in
 * independent uniform directions in n − 1 dimensions, so the share of one arrow
 * left outside the span of p − 2 others is Beta((n − p + 1)/2, (p − 2)/2), and 0
 * once p − 2 ≥ n − 1.
 * @param {number} p @param {number} n
 */
export function expectedWidthSample(p, n) {
  const m = p - 2;
  const d = n - 1;
  if (m >= d) return 0;
  if (m === 0) return 2;
  const a = (d - m) / 2;
  // E√U = B(a + ½, m/2) / B(a, m/2) = [Γ(a + ½)/Γ(a)] / [Γ(a + m/2 + ½)/Γ(a + m/2)]
  const root = halfGammaRatio(a) / halfGammaRatio(a + m / 2);
  return 2 * root * root;
}

/** @param {EntryParams} p */
function entryRange({ matrix, cell, observations }) {
  const n = matrix.length;
  const [i, j] = cell;
  const { values } = symmetricEigen(matrix);
  const det = values.reduce((product, value) => product * value, 1);
  const here = entryInterval(matrix, i, j);
  const width = here.hi - here.lo;
  /** @type {(number | null)[][]} */
  const widths = matrix.map(() => matrix.map(() => null));
  let total = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const e = entryInterval(matrix, a, b);
      widths[a][b] = widths[b][a] = e.hi - e.lo;
      total += e.hi - e.lo;
    }
  }
  const dimensions = Array.from({ length: LIMITS.maxDimension - 1 }, (_, k) => k + 2);
  return {
    view: 'entry-range',
    p: n,
    cell,
    value: matrix[i][j],
    eigenvalues: values,
    det,
    singular: values[n - 1] < PSD_TOL,
    interval: [here.lo, here.hi],
    centre: here.centre,
    width,
    position: width > 1e-12 ? Math.max(0, Math.min(1, (matrix[i][j] - here.lo) / width)) : null,
    unexplained: here.residuals,
    detOthers: here.detOthers,
    detMax: here.detOthers * here.halfWidth * here.halfWidth,
    widths,
    meanWidth: total / ((n * (n - 1)) / 2),
    expectedWidth: {
      observations,
      dimensions,
      uniform: dimensions.map(expectedWidthUniform),
      sample: dimensions.map((d) => expectedWidthSample(d, observations)),
    },
  };
}

// ---------- Matrices for the page ----------

/** A Beta(a, b) draw for 2a and 2b whole numbers, as a ratio of sums of squared normals. @param {() => number} rng @param {number} a @param {number} b */
function betaHalfInteger(rng, a, b) {
  const chi = (/** @type {number} */ dof) => {
    let sum = 0;
    for (let i = 0; i < dof; i++) sum += standardNormal(rng) ** 2;
    return sum;
  };
  const x = chi(Math.round(2 * a));
  return x / (x + chi(Math.round(2 * b)));
}

/** Exact 1s on the diagonal and exact symmetry. @param {number[][]} R */
const tidy = (R) => R.map((row, i) => row.map((x, j) => (i === j ? 1 : j < i ? R[j][i] : Math.max(-1, Math.min(1, x)))));

/**
 * A p × p correlation matrix drawn uniformly from all of them (LKJ, η = 1) by the
 * onion method, as in the R scripts' rlkj(): each new variable's arrow has a
 * Beta-distributed share inside the span of the earlier ones, in a uniform direction.
 * @param {number} p @param {number} seed
 */
export function uniformMatrix(p, seed) {
  const rng = mulberry32(seed);
  const U = Array.from({ length: p }, () => new Array(p).fill(0));
  let alpha = 1 + (p - 2) / 2;
  const r12 = 2 * betaHalfInteger(rng, alpha, alpha) - 1;
  U[0][0] = 1;
  U[0][1] = r12;
  U[1][1] = Math.sqrt(1 - r12 * r12);
  for (let m = 2; m < p; m++) {
    alpha -= 0.5;
    const y = betaHalfInteger(rng, m / 2, alpha);
    const z = normalize(Array.from({ length: m }, () => standardNormal(rng)));
    for (let k = 0; k < m; k++) U[k][m] = Math.sqrt(y) * z[k];
    U[m][m] = Math.sqrt(1 - y);
  }
  return tidy(U.map((_, a) => U.map((__, b) => U.reduce((sum, row) => sum + row[a] * row[b], 0))));
}

/**
 * The sample correlation matrix of n observations of p independent standard
 * normal variables. With p ≥ n it is singular.
 * @param {number} p @param {number} n @param {number} seed
 */
export function sampleMatrix(p, n, seed) {
  const rng = mulberry32(seed);
  const columns = Array.from({ length: p }, () => arrowOf(Array.from({ length: n }, () => standardNormal(rng))));
  return tidy(columns.map((a) => columns.map((b) => dot(a, b))));
}

// ---------- Entry point ----------

/**
 * The entry's computation. Same params, same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  if (p.view === 'arrows') return arrows(p);
  if (p.view === 'cone') return cone(p);
  if (p.view === 'cosine-rule') return cosineRule(p);
  if (p.view === 'equicorrelation') return equicorrelation(p);
  return entryRange(p);
}
