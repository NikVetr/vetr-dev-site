// The three-box fit of a two-line tag (R's rect_constraint.R): the top line
// is box b1, the decoration b2 and the bottom line b3, all in units of the
// inner box width. The parameters are w1, w2, h2; h1 = ar1 * w1 and
// w3 = h2 / ar3 follow from the lines' aspect ratios. The cost adds big
// quadratic penalties for breaking the layout's hard constraints and
// truncated-normal negative log densities for the preferred proportions;
// BFGS from `restarts` starts (the first fixed, the rest random) minimises it.

import { bfgs } from './optim.js';
import { dnorm, pnorm, rmod, rsum } from './rmath.js';

const sq = (/** @type {number} */ v) => v * v; // R's x^2 is x * x

/**
 * @typedef {typeof import('./request.js').DEFAULT_STYLE.optimizer} OptimizerStyle
 * @typedef {{ x: number, y: number, width: number, height: number }} Box
 * @typedef {{ objective: number, w1: number, w2: number, h2: number, h1: number, w3: number, h3: number, b1: Box, b2: Box, b3: Box, runs: import('./optim.js').BfgsResult[] }} Rectangles
 */

/** -log of a normal density truncated below at `lower`; 1e8 at or below it. @param {number} x @param {number} mean @param {number} sd @param {number} lower */
function truncnormNegLogPdf(x, mean, sd, lower) {
  if (x <= lower) return 1e8;
  const denom = 1 - pnorm(lower, mean, sd);
  return -Math.log(dnorm(x, mean, sd) / denom + 1e-15);
}

/**
 * The cost of boxes x = [w1, w2, h2].
 * @param {{ propDist: number, totalWidth: number, totalHeight: number, ar1: number, ar3: number, meanIar2f: number, opt: OptimizerStyle, iar2fWeight: number }} p
 */
export function boxCost({ propDist, totalWidth, totalHeight, ar1, ar3, meanIar2f, opt, iar2fWeight }) {
  const big = opt.big_penalty;
  return (/** @type {number[]} */ x) => {
    const [w1, w2, h2] = x;
    if (w1 <= 0 || w2 <= 0 || h2 <= 0) return 1e12 + rsum(x.map((v) => Math.max(-v, 0)));
    const h1 = ar1 * w1;
    const w3 = h2 / ar3;
    const currWidth = Math.max(w1, w2 + propDist * h2 + w3);
    const currHeight = h1 + propDist * h2 * 2 + h2;
    const slack1 = w2 + w3 - w1;
    const b2Iar = w2 / h2;
    const mod = rmod(b2Iar, meanIar2f);
    return rsum([
      big * sq(currWidth - totalWidth),
      (currHeight > totalHeight ? big : 1) * sq(currHeight - totalHeight),
      w1 <= w2 ? big * sq(w2 - w1) : 0,
      h1 <= h2 ? big * sq(h2 - h1) : 0,
      slack1 <= 0 ? big * sq(-slack1) : 0,
      truncnormNegLogPdf(w1 / w2, opt.ratio_mean_b1b2_w, opt.ratio_sd_b1b2_w, 1),
      truncnormNegLogPdf(h1 / h2, opt.ratio_mean_b1b2_h, opt.ratio_sd_b1b2_h, 1),
      truncnormNegLogPdf(w2 / w3, opt.ratio_mean_b2b3_w, opt.ratio_sd_b2b3_w, 0),
      truncnormNegLogPdf(w1 / (w2 + w3 + propDist * h2), opt.ratio_mean_b1_b2b3_w, opt.ratio_sd_b1_b2b3_w, 0),
      -dnorm(Math.min(mod, meanIar2f - mod), 0, opt.sd_iar2f, true) * iar2fWeight,
      truncnormNegLogPdf(b2Iar / meanIar2f, opt.mean_ntwists, opt.sd_ntwists, 0),
    ]);
  };
}

/**
 * place_rectangles_bfgs: with two_stage_iar2f, `nrep` BFGS fits without the
 * whole-twist term (the first from the fixed start, the rest from uniform
 * random starts), then one fit with it from the best of those.
 * @param {{ propDist: number, totalWidth: number, totalHeight: number, ar1: number, ar3: number, meanIar2f: number, opt: OptimizerStyle }} geometry
 * @param {number} nrep
 * @param {() => number} unif
 * @param {(trace: {geometry: Omit<Parameters<typeof boxCost>[0], "iar2fWeight">, stage: number, run: number, steps: {par:number[],value:number}[], result: import('./optim.js').BfgsResult}) => void} [onTrace]
 * @returns {Rectangles}
 */
export function placeRectangles(geometry, nrep, unif, onTrace) {
  const { propDist, totalWidth, totalHeight, ar1, ar3, meanIar2f, opt } = geometry;
  const control = { maxit: 1000 };
  const fixedStart = [opt.start_w1 * totalWidth, opt.start_w2 * totalWidth, opt.start_w2 / meanIar2f * totalHeight];
  /** @type {import('./optim.js').BfgsResult[]} */
  const runs = [];
  let start = fixedStart;
  if (opt.two_stage_iar2f) {
    const cost = boxCost({ ...geometry, iar2fWeight: 0 });
    let best = null;
    for (let r = 1; r <= nrep; r++) {
      const s = r > 1 ? [unif() * totalWidth, unif() * totalWidth, unif() * totalHeight] : fixedStart;
      /** @type {{par:number[],value:number}[]} */
      const steps = [];
      const run = bfgs(cost, s, { ...control, ...(onTrace ? { onStep: step => steps.push(step) } : {}) });
      onTrace?.({geometry:{...geometry,opt:{...opt}},stage:1,run:r,steps,result:{...run,par:run.par.slice()}});
      runs.push(run);
      if (!best || run.value < best.value) best = run; // which.min: the first minimum
    }
    start = /** @type {import('./optim.js').BfgsResult} */ (best).par.slice();
  }
  /** @type {{par:number[],value:number}[]} */
  const steps = [];
  const final = bfgs(boxCost({ ...geometry, iar2fWeight: opt.iar2f_weight }), start, { ...control, ...(onTrace ? { onStep: step => steps.push(step) } : {}) });
  onTrace?.({geometry:{...geometry,opt:{...opt}},stage:2,run:1,steps,result:{...final,par:final.par.slice()}});
  runs.push(final);
  const [w1, w2, h2] = final.par;
  const h1 = ar1 * w1;
  const w3 = h2 / ar3;
  const y2 = h1 + propDist * h2;
  return {
    objective: final.value, w1, w2, h2, h1, w3, h3: h2,
    b1: { x: 0, y: 0, width: w1, height: h1 },
    b2: { x: 0, y: y2, width: w2, height: h2 },
    b3: { x: w2 + propDist * h2, y: y2, width: w3, height: h2 },
    runs,
  };
}

/**
 * get_rect_info: the sizes the fit implies.
 * @param {Rectangles} r @param {number} propDist @param {number} meanIar2f
 */
export function rectInfo(r, propDist, meanIar2f) {
  return {
    totalWidth: Math.max(r.w2 + r.w3 + propDist * r.h2, r.w1),
    totalHeight: r.h1 + r.h2 * (propDist * 2 + 1),
    ar2Factor: (r.w2 / r.h2) / meanIar2f,
  };
}
