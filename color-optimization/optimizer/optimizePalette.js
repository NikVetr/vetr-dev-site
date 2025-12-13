import { channelOrder, decodeColor } from "../core/colorSpaces.js";
import { randomNormalArray } from "../core/random.js";
import { nelderMead } from "./nelderMead.js";
import { objectiveInfo, objectiveValue, prepareData } from "./objective.js";
import { deltaE2000 } from "../core/metrics.js";

export async function optimizePalette(palette, config, { onProgress, onVerbose } = {}) {
  const colorSpace = config.colorSpace;
  const channels = channelOrder[colorSpace];
  const prep = prepareData(palette, colorSpace, config);
  const dim = config.nColsToAdd * channels.length;
  const logit = (p) => Math.log(p / (1 - p));
  let best = { value: Infinity, par: null, newHex: [], newRaw: [] };
  let bestScoreSoFar = -Infinity;

  for (let run = 0; run < config.nOptimRuns; run++) {
    const start = Array.from({ length: dim }, () => logit(Math.random()));
    const startInfo = objectiveInfo(start, prep);
    const startDetails = attachMeta(startInfo.details, startInfo.newHex, startInfo.newRaw, colorSpace);
    if (onVerbose) {
      onVerbose({
        stage: "start",
        run: run + 1,
        params: start,
        hex: startInfo.newHex,
        raw: startInfo.newRaw,
        details: startDetails,
        distance: startInfo.distance,
        penalty: startInfo.penalty,
        paramPenalty: startInfo.paramPenalty,
        gamutPenalty: startInfo.gamutPenalty,
        score: startInfo.score,
        space: prep.colorSpace,
      });
    }
    const res = nelderMead(
      (p) => objectiveValue(p, prep),
      start,
      { maxIterations: config.nmIterations, step: 1.2 }
    );
    const endInfo = objectiveInfo(res.x, prep);
    const endDetails = attachMeta(endInfo.details, endInfo.newHex, endInfo.newRaw, colorSpace);
    if (onVerbose) {
      onVerbose({
        stage: "end",
        run: run + 1,
        params: res.x,
        hex: endInfo.newHex,
        raw: endInfo.newRaw,
        details: endDetails,
        score: -res.fx,
        distance: endInfo.distance,
        penalty: endInfo.penalty,
        paramPenalty: endInfo.paramPenalty,
        gamutPenalty: endInfo.gamutPenalty,
        space: prep.colorSpace,
      });
    }
    if (res.fx < best.value) {
      best = { value: res.fx, par: res.x, newHex: endInfo.newHex, newRaw: endInfo.newRaw, meta: { reason: res.reason } };
      bestScoreSoFar = -res.fx;
      if (onVerbose) {
        onVerbose({
          stage: "best",
          run: run + 1,
          params: res.x,
          hex: endInfo.newHex,
          raw: endInfo.newRaw,
          details: endDetails,
          score: -res.fx,
          distance: endInfo.distance,
          penalty: endInfo.penalty,
          paramPenalty: endInfo.paramPenalty,
          gamutPenalty: endInfo.gamutPenalty,
          space: prep.colorSpace,
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
        startRaw: startInfo.newRaw,
        endRaw: endInfo.newRaw,
        bestHex: best.newHex || [],
        bestRaw: best.newRaw || [],
      });
    }
  }
  // Final meta for best run (influences, closest)
  if (best.newHex?.length) {
    const metaDetails = computeInfluences(best.newHex, best.newRaw, colorSpace);
    if (onVerbose) {
      onVerbose({
        stage: "final-best",
        run: 0,
        params: best.par,
        hex: best.newHex,
        raw: best.newRaw,
        details: metaDetails,
        score: -best.value,
        distance: best.meta?.distance,
        penalty: best.meta?.penalty,
        paramPenalty: best.meta?.paramPenalty,
        gamutPenalty: best.meta?.gamutPenalty,
        space: colorSpace,
      });
    }
  }
  return best;
}

function computeInfluences(hexes, raws, space) {
  const labs = hexes.map((h, idx) => decodeColor(h, "lab"));
  const n = labs.length;
  if (n < 2) return hexes.map((h) => ({ hex: h }));
  const pairwise = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = deltaE2000(labs[i], labs[j]);
      pairwise.push({ i, j, d });
    }
  }
  const hm = harmonicMean(pairwise.map((p) => p.d));
  const influences = [];
  for (let i = 0; i < n; i++) {
    const remaining = pairwise.filter((p) => p.i !== i && p.j !== i).map((p) => p.d);
    const hmWithout = remaining.length ? harmonicMean(remaining) : hm;
    const closest = pairwise
      .filter((p) => p.i === i || p.j === i)
      .reduce(
        (best, p) => {
          const other = p.i === i ? p.j : p.i;
          if (p.d < best.dist) return { idx: other, dist: p.d };
          return best;
        },
        { idx: null, dist: Infinity }
      );
    influences.push({
      hex: hexes[i],
      influence: hm - hmWithout,
      closestHex: closest.idx != null ? hexes[closest.idx] : "",
      closestDist: isFinite(closest.dist) ? closest.dist : null,
    });
  }
  const ranked = [...influences].sort((a, b) => (b.influence || 0) - (a.influence || 0));
  ranked.forEach((item, idx) => {
    const target = influences.find((inf) => inf.hex === item.hex && inf.influence === item.influence);
    if (target) target.influenceRank = idx + 1;
  });
  return influences;
}

function harmonicMean(arr) {
  const eps = 1e-9;
  if (!arr.length) return 0;
  const sum = arr.reduce((acc, v) => acc + 1 / Math.max(v, eps), 0);
  return arr.length / sum;
}

function attachMeta(details, hexes, raws, space) {
  if (!details || !details.length) return details;
  const inf = computeInfluences(hexes, raws, space);
  const byHex = {};
  inf.forEach((entry) => {
    byHex[entry.hex] = entry;
  });
  return details.map((d, idx) => {
    const meta = byHex[d.hex] || byHex[hexes[idx]] || {};
    return {
      ...d,
      influence: meta.influence,
      influenceRank: meta.influenceRank,
      closestHex: meta.closestHex,
      closestDist: meta.closestDist,
    };
  });
}
