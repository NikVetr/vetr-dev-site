// The swap chain (R/search.R) with exact incremental scoring. Each iteration picks two
// tables (worse-scoring tables more likely), swaps k random seats between them (k from 1 to
// the smaller table's size minus 1, weight dexp(k, 0.4)), and accepts with Barker probability
// 1 / (1 + exp(-delta * logitScale)) at a fixed temperature. The best seating visited is kept.
// The random draws are R's, made in R's order, and every sum is rounded as R rounds it, so a
// seed gives the R version's chain.

import { constraintOffset, groupSums, scoreAssignment, tableOfSeats, tableTerms } from './objective.js';
import { SeatingError } from './request.js';
import { rsum } from './rmath.js';
import { createRng } from './rng.js';

/**
 * @typedef {import('./request.js').Problem} Problem
 * @typedef {import('./objective.js').Terms} Terms
 * @typedef {{ iteration: number, tables: [string, string], swaps: [string | null, string | null][],
 *   positions: [number, number][], score: number, terms: Terms, best: number }} Move
 *   An accepted move: guest swaps[k][0], at seat positions[k][0] (0-based) of table
 *   tables[0], and guest swaps[k][1], at seat positions[k][1] of tables[1], exchange seats
 *   (null is an empty seat); score, terms and best are the values after the move.
 * @typedef {{ iteration: number, tables: number[][], score: number, terms: Terms, best: number }} State
 * @typedef {{ iteration: number, iterations: number, accepted: number, score: number, best: number, move: Move | null }} Progress
 */

/** Barker's rule as R computes it, exp(x) / (1 + exp(x)), 1 where that overflows. @param {number} x */
function barker(x) {
  const e = Math.exp(x);
  const out = e / (1 + e);
  return Number.isNaN(out) ? 1 : out;
}

/**
 * Runs the chain.
 * @param {Problem} problem
 * @param {{ onProgress?: (progress: Progress) => void }} [hooks] onProgress is called after
 *   every accepted move (with the move) and every 1% of the iterations (with move null)
 */
export function runSearch(problem, { onProgress } = {}) {
  const opt = problem.options;
  const rng = createRng(opt.seed);
  const nIter = opt.iterations;
  const n = problem.nSeats;
  const T = problem.tableIds.length;
  const tables = problem.initial.map((t) => [...t]);
  const tableOf = tableOfSeats(tables, n);
  const offset = constraintOffset(problem);

  const termsTab = tables.map((members) => tableTerms(problem, members));
  const tableScore = Float64Array.from(termsTab, (t) => t.table + t.pairs + t.constraints);

  // Geography state: M[i, t] = sum of cost[i, j] over seats j at table t, P = M Q,
  // g[i] = seat i's geography term, G[t] = sum of g over table t (all unweighted; n x T row-major).
  const C = problem.C;
  const Q = problem.closeness;
  const wGeo = problem.weights.geography;
  const M = new Float64Array(C ? n * T : 0);
  const P = new Float64Array(C ? n * T : 0);
  let G = new Float64Array(C ? T : 0);
  if (C) {
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < T; t++) M[i * T + t] = rsum(tables[t].map((j) => C[i * n + j]));
      // M %*% Q through reference BLAS: P[i, t] accumulated over l in order
      for (let t = 0; t < T; t++) {
        let acc = 0;
        for (let l = 0; l < T; l++) acc += Q[l * T + t] * M[i * T + l];
        P[i * T + t] = acc;
      }
      const own = tableOf[i];
      g[i] = -P[i * T + own] + (problem.tablemates ? 0 : M[i * T + own] * Q[own * T + own]);
    }
    G = groupSums(g, tableOf, T);
    for (let t = 0; t < T; t++) tableScore[t] = tableScore[t] + wGeo * G[t];
  }

  /** @returns {Terms} */
  const currentTerms = () => ({
    table: rsum(termsTab.map((t) => t.table)),
    pairs: rsum(termsTab.map((t) => t.pairs)),
    constraints: rsum(termsTab.map((t) => t.constraints)) - offset,
    geography: C ? wGeo * rsum(G) : 0,
  });

  let total = rsum(tableScore);
  let bestTotal = total;
  let bestTables = tables.map((t) => [...t]);
  let bestIteration = 0;
  let accepted = 0;

  // Trace of the current and best scores at iterations 0, 1, 1 + k, 1 + 2k, ... and the last.
  const traceEvery = Math.max(1, Math.floor(nIter / opt.tracePoints));
  const traceAt = [0];
  for (let i = 1; i <= nIter; i += traceEvery) traceAt.push(i);
  if (traceAt.at(-1) !== nIter) traceAt.push(nIter);
  /** @type {Record<'iteration' | 'score' | 'best' | 'table' | 'pairs' | 'constraints' | 'geography', number[]>} */
  const trace = { iteration: [], score: [], best: [], table: [], pairs: [], constraints: [], geography: [] };
  const traceRow = (/** @type {number} */ i) => {
    const terms = currentTerms();
    trace.iteration.push(i);
    trace.score.push(total - offset);
    trace.best.push(bestTotal - offset);
    for (const k of /** @type {const} */ (['table', 'pairs', 'constraints', 'geography'])) trace[k].push(terms[k]);
  };
  traceRow(0);
  let nextTrace = 1;

  const ids = problem.ids;
  /** @type {Move[] | null} */
  const moves = opt.record === 'moves' ? [] : null;
  /** @type {State[] | null} */
  const states = opt.record === 'states' ? [] : null;
  /** @param {number} i @returns {State} */
  const snapshot = (i) => ({ iteration: i, tables: tables.map((t) => [...t]), score: total - offset, terms: currentTerms(), best: bestTotal - offset });
  states?.push(snapshot(0));
  const reportEvery = Math.max(1, Math.floor(nIter / 100));

  const scale = 1 / 0.4;
  const newTableOf = new Int32Array(n);
  const d = new Float64Array(C ? n : 0);
  const dq = new Float64Array(C ? T : 0);
  let newG = new Float64Array(C ? T : 0);
  const newg = new Float64Array(C ? n : 0);
  const dOther = new Float64Array(T);

  for (let i = 1; i <= nIter; i++) {
    // two tables, the worse-scoring more likely (at most e times as likely as the best)
    let maxScore = -Infinity;
    for (const s of tableScore) if (s > maxScore) maxScore = s;
    const std = tableScore.map((s) => maxScore - s);
    let maxStd = -Infinity;
    for (const s of std) if (s > maxStd) maxStd = s;
    if (maxStd > 0) for (let t = 0; t < T; t++) std[t] = std[t] / maxStd;
    const ex = std.map(Math.exp);
    const exSum = rsum(ex);
    const [a, b] = rng.weighted(ex.map((x) => x / exSum), 2);
    const A = tables[a];
    const B = tables[b];

    // k seats at each, k weighted by dexp(k, 0.4)
    const maxSwap = Math.max(1, Math.min(A.length, B.length) - 1);
    const k = rng.weighted(Array.from({ length: maxSwap }, (_, j) => Math.exp(-(j + 1) / scale) / scale))[0] + 1;
    const posA = rng.uniform(A.length, k);
    const posB = rng.uniform(B.length, k);
    const fromA = posA.map((p) => A[p]);
    const fromB = posB.map((p) => B[p]);
    const newA = [...A];
    const newB = [...B];
    posA.forEach((p, j) => { newA[p] = fromB[j]; });
    posB.forEach((p, j) => { newB[p] = fromA[j]; });

    const newTerms = [tableTerms(problem, newA), tableTerms(problem, newB)];
    const prop = newTerms.map((t) => t.table + t.pairs + t.constraints);
    if (C) {
      for (let s = 0; s < n; s++) {
        d[s] = rsum(fromB.map((j) => C[s * n + j])) - rsum(fromA.map((j) => C[s * n + j]));
      }
      newTableOf.set(tableOf);
      for (const s of fromA) newTableOf[s] = b;
      for (const s of fromB) newTableOf[s] = a;
      for (let t = 0; t < T; t++) dq[t] = Q[a * T + t] - Q[b * T + t];
      for (let s = 0; s < n; s++) {
        const nt = newTableOf[s];
        newg[s] = -(P[s * T + nt] + d[s] * dq[nt]);
        if (!problem.tablemates) {
          newg[s] = newg[s] + (M[s * T + nt] + d[s] * ((nt === a ? 1 : 0) - (nt === b ? 1 : 0))) * Q[nt * T + nt];
        }
      }
      newG = groupSums(newg, newTableOf, T);
      prop[0] = prop[0] + wGeo * newG[a];
      prop[1] = prop[1] + wGeo * newG[b];
    }
    const diffAB = [prop[0] - tableScore[a], prop[1] - tableScore[b]];
    let diff = rsum(diffAB);
    if (C) {
      const others = [];
      for (let t = 0; t < T; t++) {
        if (t === a || t === b) continue;
        dOther[t] = wGeo * (newG[t] - G[t]);
        others.push(dOther[t]);
      }
      diff = diff + rsum(others);
    }

    const p = barker(diff * opt.logitScale);
    if (rng.weighted([p, 1 - p])[0] === 0) {
      tables[a] = newA;
      tables[b] = newB;
      for (const s of fromA) tableOf[s] = b;
      for (const s of fromB) tableOf[s] = a;
      termsTab[a] = newTerms[0];
      termsTab[b] = newTerms[1];
      tableScore[a] = tableScore[a] + diffAB[0];
      tableScore[b] = tableScore[b] + diffAB[1];
      if (C) {
        for (let t = 0; t < T; t++) if (t !== a && t !== b) tableScore[t] = tableScore[t] + dOther[t];
        for (let s = 0; s < n; s++) {
          M[s * T + a] = M[s * T + a] + d[s];
          M[s * T + b] = M[s * T + b] - d[s];
          for (let t = 0; t < T; t++) P[s * T + t] = P[s * T + t] + d[s] * dq[t];
        }
        G = newG;
      }
      total = total + diff;
      accepted++;
      if (total > bestTotal) {
        bestTotal = total;
        bestTables = tables.map((t) => [...t]);
        bestIteration = i;
      }
      /** @type {Move | null} */
      let move = null;
      if (moves || onProgress) {
        move = {
          iteration: i,
          tables: [problem.tableIds[a], problem.tableIds[b]],
          swaps: fromA.map((s, j) => [ids[s], ids[fromB[j]]]),
          positions: posA.map((pa, j) => [pa, posB[j]]),
          score: total - offset,
          terms: currentTerms(),
          best: bestTotal - offset,
        };
        moves?.push(move);
      }
      onProgress?.({ iteration: i, iterations: nIter, accepted, score: total - offset, best: bestTotal - offset, move });
    } else if (onProgress && i % reportEvery === 0) {
      onProgress({ iteration: i, iterations: nIter, accepted, score: total - offset, best: bestTotal - offset, move: null });
    }
    if (states && i % opt.recordEvery === 0) states.push(snapshot(i));
    if (nextTrace < traceAt.length && traceAt[nextTrace] === i) {
      traceRow(i);
      nextTrace++;
    }
  }

  // Invariant: the incrementally tracked best score equals a from-scratch evaluation.
  const best = scoreAssignment(problem, bestTables);
  if (Math.abs(best.score - (bestTotal - offset)) > 1e-6 * Math.max(1, Math.abs(best.score))) {
    throw new SeatingError('internal_error', `incremental score ${bestTotal - offset} differs from full evaluation ${best.score}`);
  }
  return { bestTables, best, bestIteration, finalTables: tables, accepted, trace, moves, states };
}
