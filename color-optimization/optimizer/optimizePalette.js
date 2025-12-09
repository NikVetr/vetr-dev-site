import { channelOrder } from "../core/colorSpaces.js";
import { randomNormalArray } from "../core/random.js";
import { nelderMead } from "./nelderMead.js";
import { objectiveInfo, objectiveValue, prepareData } from "./objective.js";

export async function optimizePalette(palette, config, { onProgress, onVerbose } = {}) {
  const colorSpace = config.colorSpace;
  const channels = channelOrder[colorSpace];
  const prep = prepareData(palette, colorSpace, config);
  const dim = config.nColsToAdd * channels.length;
  const logit = (p) => Math.log(p / (1 - p));
  let best = { value: Infinity, par: null, newHex: [] };

  for (let run = 0; run < config.nOptimRuns; run++) {
    const start = Array.from({ length: dim }, () => logit(Math.random()));
    const startInfo = objectiveInfo(start, prep);
    if (onVerbose) {
      onVerbose({
        stage: "start",
        run: run + 1,
        params: start,
        hex: startInfo.newHex,
      });
    }
    const res = nelderMead(
      (p) => objectiveValue(p, prep),
      start,
      { maxIterations: config.nmIterations, step: 1.2 }
    );
    const endInfo = objectiveInfo(res.x, prep);
    if (res.fx < best.value) {
      best = { value: res.fx, par: res.x, newHex: endInfo.newHex, meta: { reason: res.reason } };
      if (onVerbose) {
        onVerbose({
          stage: "best",
          run: run + 1,
          params: res.x,
          hex: endInfo.newHex,
          score: -res.fx,
        });
      }
    }
    const bestScore = best.value === Infinity ? 0 : -best.value;
    const pct = Math.round(((run + 1) / config.nOptimRuns) * 100);
    if (onProgress) {
      await onProgress({
        run: run + 1,
        pct,
        bestScore,
        startHex: startInfo.newHex,
        endHex: endInfo.newHex,
        bestHex: best.newHex || [],
      });
    }
  }
  return best;
}
