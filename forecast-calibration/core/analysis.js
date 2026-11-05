// Calibration analysis: bins, simulated "possible worlds" for a calibrated
// forecaster, Monte Carlo p-values and log loss. Ported from playingPreds.R (2019)
// and 2021-SA-predictions.R; see api.md for the definitions.

import { createRng } from './rng.js';

/**
 * @typedef {import('./input.js').Prediction} Prediction
 * @typedef {import('./input.js').Settings} Settings
 * @typedef {{ probability: number, n: number, hits: number }} Level
 * @typedef {{ label: string, probabilityRange: [number, number], meanProbability: number, n: number, hits: number }} Bin
 */

/**
 * @param {Prediction[]} predictions validated by normalizeRequest
 * @param {Settings} settings
 */
export function analyze(predictions, settings) {
  const n = predictions.length;
  const levels = groupByProbability(predictions);
  const { bins, levelBin } = makeBins(levels, settings.bins);
  const score = scorer(levels, levelBin, bins, n);
  const observed = score(levels.map((level) => level.hits));

  // One set of simulated worlds serves every test, the envelope and the plot. In each
  // world, every prediction comes true with exactly its stated probability.
  const rng = createRng(settings.seed);
  const S = settings.simulations;
  const histograms = bins.map((bin) => new Float64Array(bin.n + 1));
  const exceeded = { weighted: 0, unweighted: 0, logLoss: 0 };
  /** @type {number[][]} */
  const worlds = [];
  let lossMean = 0;
  let lossM2 = 0;
  const levelHits = new Array(levels.length).fill(0);
  for (let s = 1; s <= S; s++) {
    for (let l = 0; l < levels.length; l++) {
      const { probability, n: count } = levels[l];
      let hits = 0;
      for (let k = 0; k < count; k++) if (rng() < probability) hits++;
      levelHits[l] = hits;
    }
    const world = score(levelHits);
    // Strictly greater, as in playingPreds.R: sum(obs < test) / length(test).
    if (world.weighted > observed.weighted) exceeded.weighted++;
    if (world.unweighted > observed.unweighted) exceeded.unweighted++;
    if (world.logLoss > observed.logLoss) exceeded.logLoss++;
    world.binHits.forEach((hits, b) => histograms[b][hits]++);
    if (s <= settings.plotWorlds) worlds.push(world.binHits);
    const delta = world.logLoss - lossMean;
    lossMean += delta / s;
    lossM2 += delta * (world.logLoss - lossMean);
  }

  const tail = (1 - settings.interval) / 2;
  return {
    n,
    settings: { ...settings },
    bins: bins.map((bin, b) => {
      const low = quantile(histograms[b], S, tail);
      const high = quantile(histograms[b], S, 1 - tail);
      const hits = observed.binHits[b];
      return {
        label: bin.label,
        probabilityRange: bin.probabilityRange,
        meanProbability: bin.meanProbability,
        n: bin.n,
        hits,
        frequency: hits / bin.n,
        interval: [low / bin.n, high / bin.n],
        position: hits < low ? 'below' : hits > high ? 'above' : 'inside',
      };
    }),
    calibration: {
      weighted: { statistic: observed.weighted, p: exceeded.weighted / S },
      unweighted: { statistic: observed.unweighted, p: exceeded.unweighted / S },
    },
    logLoss: {
      total: observed.logLoss,
      mean: observed.logLoss / n,
      coinFlip: n * Math.LN2,
      p: exceeded.logLoss / S,
      expected: logLossMoments(levels),
      simulated: { mean: lossMean, sd: S > 1 ? Math.sqrt(lossM2 / (S - 1)) : 0 },
    },
    worlds,
  };
}

/**
 * Closed-form mean and standard deviation of total log loss when each outcome is
 * Bernoulli(p_i): E = -sum[p log p + (1-p) log(1-p)], Var = sum p(1-p) (log(p/(1-p)))^2.
 * @param {Level[]} levels
 */
export function logLossMoments(levels) {
  let mean = 0;
  let variance = 0;
  for (const { probability: p, n } of levels) {
    mean -= n * (p * Math.log(p) + (1 - p) * Math.log1p(-p));
    variance += n * p * (1 - p) * Math.log(p / (1 - p)) ** 2;
  }
  return { mean, sd: Math.sqrt(variance) };
}

/**
 * @param {Prediction[]} predictions
 * @returns {Level[]}
 */
function groupByProbability(predictions) {
  /** @type {Map<number, Level>} */
  const levels = new Map();
  for (const { probability, outcome } of predictions) {
    const level = levels.get(probability) ?? { probability, n: 0, hits: 0 };
    level.n++;
    level.hits += outcome;
    levels.set(probability, level);
  }
  return [...levels.values()].sort((a, b) => a.probability - b.probability);
}

/**
 * "distinct" gives one bin per stated probability, as in the R scripts. An integer K
 * gives K equal-width bins [k/K, (k+1)/K); a probability within 1e-9 of an edge
 * belongs to the upper bin, so 0.29 lands in [29%, 30%) despite 0.29 * 100 < 29.
 * Empty bins are dropped.
 * @param {Level[]} levels
 * @param {'distinct' | number} binning
 * @returns {{ bins: Bin[], levelBin: number[] }}
 */
function makeBins(levels, binning) {
  const keys = levels.map((level) => (binning === 'distinct'
    ? level.probability
    : Math.min(Math.floor(level.probability * binning + 1e-9), binning - 1)));
  const uniqueKeys = [...new Set(keys)];
  const bins = uniqueKeys.map((key) => {
    const members = levels.filter((_, l) => keys[l] === key);
    const n = members.reduce((sum, level) => sum + level.n, 0);
    const hits = members.reduce((sum, level) => sum + level.hits, 0);
    const meanProbability = members.length === 1
      ? members[0].probability
      : members.reduce((sum, level) => sum + level.n * level.probability, 0) / n;
    /** @type {[number, number]} */
    const probabilityRange = binning === 'distinct' ? [key, key] : [key / binning, (key + 1) / binning];
    const label = binning === 'distinct'
      ? percent(key)
      : `[${percent(probabilityRange[0])}, ${percent(probabilityRange[1])})`;
    return { label, probabilityRange, meanProbability, n, hits };
  });
  return { bins, levelBin: keys.map((key) => uniqueKeys.indexOf(key)) };
}

/**
 * Scores one world from its hits per stated probability. Observed and simulated
 * worlds go through this same function, so equal outcomes give bit-identical
 * statistics and ties are exact.
 * @param {Level[]} levels
 * @param {number[]} levelBin
 * @param {Bin[]} bins
 * @param {number} n
 */
function scorer(levels, levelBin, bins, n) {
  const lossIfHit = levels.map((level) => -Math.log(level.probability));
  const lossIfMiss = levels.map((level) => -Math.log1p(-level.probability));
  /** @param {number[]} levelHits */
  return function score(levelHits) {
    const binHits = new Array(bins.length).fill(0);
    let logLoss = 0;
    levelHits.forEach((hits, l) => {
      binHits[levelBin[l]] += hits;
      logLoss += hits * lossIfHit[l] + (levels[l].n - hits) * lossIfMiss[l];
    });
    // Squared gap between realized frequency and mean stated probability per bin,
    // averaged with bin-size weights (n_b / n) and without.
    let weighted = 0;
    let unweighted = 0;
    bins.forEach((bin, b) => {
      const squared = (binHits[b] / bin.n - bin.meanProbability) ** 2;
      weighted += squared * (bin.n / n);
      unweighted += squared;
    });
    return { binHits, weighted, unweighted: unweighted / bins.length, logLoss };
  };
}

/**
 * Sample quantile of simulated hit counts, R's quantile(type = 1): the
 * ceiling(S * q)-th smallest value, with R's 4 * epsilon fuzz.
 * @param {Float64Array} histogram worlds per hit count
 * @param {number} total number of worlds
 * @param {number} q
 */
function quantile(histogram, total, q) {
  const nq = total * q;
  const j = Math.floor(nq + 4 * Number.EPSILON);
  const rank = Math.min(Math.max(j + (nq > j ? 1 : 0), 1), total);
  let cumulative = 0;
  for (let hits = 0; hits < histogram.length; hits++) {
    cumulative += histogram[hits];
    if (cumulative >= rank) return hits;
  }
  return histogram.length - 1;
}

/** @param {number} x */
export function percent(x) {
  return `${Number((x * 100).toFixed(4))}%`;
}
