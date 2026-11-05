// Pooled vs stratified z-score outlier removal, in closed form. Two normal groups,
// A and B, are mixed. The stratified rule removes values beyond each group's own
// mean ± z SD; the pooled rule removes values beyond the pooled mean ± z pooled SD.
// Every share below is an exact normal-tail probability. Units are group A's SD,
// with the pooled mean at 0, as in the original R (prop_outliers_zscores_redux.R).

import { pnormInterval, pnormUpper } from '../lib/normal.js';
import { checkChoice, checkNumber, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {'meanDifference' | 'sdRatio' | 'proportionA' | 'z'} SweepParameter */
/**
 * @typedef {{ meanDifference: number, sdRatio: number, proportionA: number, z: number, sweep: SweepParameter }} Params
 */

export const ENTRY = 'zscore-outliers';

/** Allowed ranges; the sweep covers the whole range of the swept parameter. */
export const RANGES = Object.freeze({
  meanDifference: /** @type {[number, number]} */ ([0, 6]),
  sdRatio: /** @type {[number, number]} */ ([0.2, 5]),
  proportionA: /** @type {[number, number]} */ ([0.01, 0.99]),
  z: /** @type {[number, number]} */ ([0.5, 6]),
});

/** @type {Readonly<Params>} */
export const DEFAULTS = Object.freeze({ meanDifference: 1, sdRatio: 1, proportionA: 0.5, z: 2.5, sweep: 'meanDifference' });

const FIELDS = /** @type {const} */ (['meanDifference', 'sdRatio', 'proportionA', 'z', 'sweep']);
const SWEEPS = /** @type {const} */ (['meanDifference', 'sdRatio', 'proportionA', 'z']);
export const SWEEP_POINTS = 121;

/**
 * Validates params and fills in defaults. Throws one IntuitionsError listing every
 * problem.
 * @param {unknown} params
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  /** @type {Issue[]} */
  const issues = [];
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  rejectUnknown(params, FIELDS, 'params', issues);
  /** @param {keyof typeof RANGES} key */
  const number = (key) => (Object.hasOwn(params, key)
    ? checkNumber(params[key], `params.${key}`, RANGES[key][0], RANGES[key][1], DEFAULTS[key], issues)
    : DEFAULTS[key]);
  const resolved = {
    meanDifference: number('meanDifference'),
    sdRatio: number('sdRatio'),
    proportionA: number('proportionA'),
    z: number('z'),
    sweep: Object.hasOwn(params, 'sweep') ? checkChoice(params.sweep, 'params.sweep', SWEEPS, DEFAULTS.sweep, issues) : DEFAULTS.sweep,
  };
  if (issues.length) throw invalidRequest(issues);
  return resolved;
}

/**
 * The two groups and the pooled distribution. A has SD 1; the pooled mean is 0.
 * @param {Pick<Params, 'meanDifference' | 'sdRatio' | 'proportionA'>} params
 */
export function mixture({ meanDifference, sdRatio, proportionA }) {
  const wA = proportionA;
  const wB = 1 - proportionA;
  const meanA = -meanDifference * wB;
  const meanB = meanDifference * wA;
  const pooledSd = Math.sqrt(wA + wB * sdRatio * sdRatio + wA * wB * meanDifference * meanDifference);
  return {
    groups: [
      { group: 'A', proportion: wA, mean: meanA, sd: 1 },
      { group: 'B', proportion: wB, mean: meanB, sd: sdRatio },
    ],
    pooled: { mean: 0, sd: pooledSd },
  };
}

/**
 * Shares of one group removed under each rule, split by which rules remove them.
 * @param {number} mean
 * @param {number} sd
 * @param {number} z
 * @param {number} cut the pooled cutoff z * pooled SD (the pooled mean is 0)
 */
function groupShares(mean, sd, z, cut) {
  const ownLow = mean - z * sd;
  const ownHigh = mean + z * sd;
  /** @param {number} a @param {number} b */
  const p = (a, b) => pnormInterval(a, b, mean, sd);
  const stratified = 2 * pnormUpper(z);
  const pooledBelow = p(-Infinity, -cut);
  const pooledAbove = pnormUpper(cut, mean, sd);
  // Each piece is integrated directly, not found by subtraction, so tiny shares
  // keep their precision.
  const onlyPooled = p(ownLow, Math.min(-cut, ownHigh)) + p(Math.max(cut, ownLow), ownHigh);
  const onlyStratified = p(-cut, Math.min(cut, ownLow)) + p(Math.max(-cut, ownHigh), cut);
  const both = p(-Infinity, Math.min(ownLow, -cut)) + p(Math.max(ownHigh, cut), Infinity)
    + p(ownHigh, -cut) + p(cut, ownLow);
  return { cutoffs: [ownLow, ownHigh], stratified, pooled: pooledBelow + pooledAbove, pooledBelow, pooledAbove, both, onlyPooled, onlyStratified };
}

/**
 * Overall and per-group removal shares for one parameter set.
 * @param {Pick<Params, 'meanDifference' | 'sdRatio' | 'proportionA' | 'z'>} params
 */
function removal(params) {
  const { groups, pooled } = mixture(params);
  const cut = params.z * pooled.sd;
  const shares = groups.map((g) => groupShares(g.mean, g.sd, params.z, cut));
  /** @param {keyof ReturnType<typeof groupShares>} key */
  const overall = (key) => groups[0].proportion * /** @type {number} */ (shares[0][key]) + groups[1].proportion * /** @type {number} */ (shares[1][key]);
  return { groups, pooled, cut, shares, overall };
}

/**
 * Values of the swept parameter: evenly spaced, or log-spaced for the SD ratio.
 * @param {SweepParameter} parameter
 */
export function sweepValues(parameter) {
  const [lo, hi] = RANGES[parameter];
  return Array.from({ length: SWEEP_POINTS }, (_, i) => {
    const t = i / (SWEEP_POINTS - 1);
    return parameter === 'sdRatio' ? lo * (hi / lo) ** t : lo + (hi - lo) * t;
  });
}

/**
 * The entry's computation. Same params, same result.
 * @param {unknown} params see api.md
 */
export function compute(params) {
  const p = resolveParams(params);
  const { groups, pooled, cut, shares, overall } = removal(p);
  const pooledTotal = overall('pooled');

  const values = sweepValues(p.sweep);
  const sweep = { parameter: p.sweep, values, stratified: /** @type {number[]} */ ([]), pooledA: /** @type {number[]} */ ([]), pooledB: /** @type {number[]} */ ([]), pooledOverall: /** @type {number[]} */ ([]) };
  for (const value of values) {
    const point = removal({ ...p, [p.sweep]: value });
    sweep.stratified.push(point.shares[0].stratified);
    sweep.pooledA.push(point.shares[0].pooled);
    sweep.pooledB.push(point.shares[1].pooled);
    sweep.pooledOverall.push(point.overall('pooled'));
  }

  return {
    pooled: { mean: pooled.mean, sd: pooled.sd, cutoffs: [-cut, cut] },
    groups: groups.map((g, i) => ({
      group: g.group,
      proportion: g.proportion,
      mean: g.mean,
      sd: g.sd,
      cutoffs: shares[i].cutoffs,
      stratifiedRemoved: shares[i].stratified,
      pooledRemoved: shares[i].pooled,
      pooledRemovedBelow: shares[i].pooledBelow,
      pooledRemovedAbove: shares[i].pooledAbove,
      removedByBoth: shares[i].both,
      onlyPooled: shares[i].onlyPooled,
      onlyStratified: shares[i].onlyStratified,
      shareOfPooledRemovals: pooledTotal > 0 ? (g.proportion * shares[i].pooled) / pooledTotal : null,
    })),
    overall: {
      stratifiedRemoved: overall('stratified'),
      pooledRemoved: pooledTotal,
      removedByBoth: overall('both'),
      onlyPooled: overall('onlyPooled'),
      onlyStratified: overall('onlyStratified'),
    },
    sweep,
  };
}
