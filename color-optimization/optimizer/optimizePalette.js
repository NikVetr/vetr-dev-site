import {
  channelOrder,
  convertColorValues,
  isInGamut,
  hexToRgb,
  rgbToXyz,
  xyzToLinearRgb,
  linearRgbToXyz,
  GAMUTS,
  normalizeWithRange,
  unscaleWithRange,
  projectToGamut,
} from "../core/colorSpaces.js";
import { applyCvdLinear } from "../core/cvd.js";
import { clamp } from "../core/util.js";
import { random, setRandomSeed } from "../core/random.js";
import { nelderMead } from "./nelderMead.js";
import { objectiveInfo, objectiveValue, prepareData } from "./objective.js";
import { aggregateDistances } from "../core/means.js";
import { coordsFromXyzForDistanceMetric, distanceBetweenCoords } from "../core/distance.js";

function logitClamped(p) {
  const t = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(t / (1 - t));
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

const TAU = Math.PI * 2;

function hueArcFromBounds(boundsH) {
  if (!Array.isArray(boundsH) || boundsH.length < 2) return null;
  const diff = boundsH[1] - boundsH[0];
  const rawSpan = (diff + 1) % 1;
  const span = rawSpan === 0 ? (diff >= 0.999 ? 1 : 1e-6) : rawSpan;
  return {
    startRad: boundsH[0] * TAU,
    spanRad: span * TAU,
    full: span >= 0.999,
  };
}

function channelBoundsForStart(prepLike, ch, scChannel, lightKey) {
  const bounds = prepLike?.bounds || {};
  const constraintSets = bounds.constraintSets;
  const topology = prepLike?.constraintTopology || constraintSets?.topology || "contiguous";
  const channelMode = constraintSets?.channels?.[ch]?.mode || "hard";
  const useHard = channelMode === "hard" && topology === "contiguous";
  if (!useHard) return [0, 1];
  if (ch === lightKey) return bounds.boundsByName?.[ch] || bounds.boundsL || [0, 1];
  if (scChannel && ch === scChannel) return bounds.boundsByName?.[ch] || bounds.boundsSc || [0, 1];
  return bounds.boundsByName?.[ch] || [0, 1];
}

function buildRandomParams(dim) {
  return Array.from({ length: dim }, () => logitClamped(random()));
}

export function buildGamutUniformParams(nColors, colorSpace, gamutPreset, ranges, prepLike = {}) {
  const channels = channelOrder[colorSpace];
  const samples = [];
  const lightKey = channels.includes("l") ? "l" : channels.includes("jz") ? "jz" : null;
  const scChannel = channels.find((c) => c === "s" || c === "c") || null;
  const hueAnchorRad = Number.isFinite(prepLike?.hueAnchorRad) ? prepLike.hueAnchorRad : 0;
  const gamut = GAMUTS[gamutPreset] || GAMUTS["srgb"];
  const constraintSets = prepLike?.bounds?.constraintSets;
  const topology = prepLike?.constraintTopology || constraintSets?.topology || "contiguous";
  const hueArc = (() => {
    const hueMode = constraintSets?.channels?.h?.mode || "hard";
    const useHard = hueMode === "hard" && topology === "contiguous";
    return useHard ? hueArcFromBounds(prepLike?.bounds?.boundsH) : null;
  })();

  const isHueAllowed = (h01) => {
    if (!hueArc || hueArc.full) return true;
    const phi = wrap01(h01) * TAU;
    const start = hueArc.startRad;
    const end = hueArc.startRad + hueArc.spanRad;
    if (end <= TAU) return phi >= start && phi <= end;
    return phi >= start || phi <= end - TAU;
  };

  const withinBounds = (norm) => {
    for (const ch of channels) {
      if (ch === "h") {
        const h01 = wrap01(norm.h ?? 0);
        if (!isHueAllowed(h01)) return false;
        continue;
      }
      const [b0, b1] = channelBoundsForStart(prepLike, ch, scChannel, lightKey);
      const v = norm[ch];
      if (!Number.isFinite(v)) return false;
      if (v < b0 || v > b1) return false;
    }
    return true;
  };

  const tryAddSample = (vals) => {
    if (!vals) return false;
    const norm = normalizeWithRange(vals, ranges, colorSpace);
    if (!withinBounds(norm)) return false;
    samples.push({ vals, norm });
    return true;
  };

  const maxAttempts = Math.max(400, nColors * 400);
  let attempts = 0;
  while (samples.length < nColors && attempts < maxAttempts) {
    attempts += 1;
    const norm = {};
    channels.forEach((ch) => {
      if (ch === "h") {
        if (hueArc && !hueArc.full) {
          const t = random();
          const phi = hueArc.startRad + hueArc.spanRad * t;
          norm.h = wrap01(phi / TAU);
        } else {
          norm.h = random();
        }
        return;
      }
      const [b0, b1] = channelBoundsForStart(prepLike, ch, scChannel, lightKey);
      norm[ch] = b0 + random() * (b1 - b0);
    });
    const vals = unscaleWithRange(norm, ranges, colorSpace);
    if (!isInGamut(vals, colorSpace, gamutPreset)) continue;
    if (tryAddSample(vals)) continue;
  }

  if (gamut && samples.length < nColors) {
    const rgbAttempts = Math.max(200, nColors * 200);
    let tries = 0;
    while (samples.length < nColors && tries < rgbAttempts) {
      tries += 1;
      try {
        const r = random();
        const g = random();
        const bl = random();
        const xyz = gamut.toXYZ(r, g, bl);
        const vals = convertColorValues(xyz, "xyz", colorSpace);
        if (tryAddSample(vals)) continue;
      } catch (e) {
        // fall through to fallback sampling
      }
    }
  }

  while (samples.length < nColors) {
    const norm = {};
    channels.forEach((ch) => {
      if (ch === "h") {
        if (hueArc && !hueArc.full) {
          const t = random();
          const phi = hueArc.startRad + hueArc.spanRad * t;
          norm.h = wrap01(phi / TAU);
        } else {
          norm.h = random();
        }
        return;
      }
      const [b0, b1] = channelBoundsForStart(prepLike, ch, scChannel, lightKey);
      norm[ch] = b0 + random() * (b1 - b0);
    });
    const vals = unscaleWithRange(norm, ranges, colorSpace);
    const projected = projectToGamut(vals, colorSpace, gamutPreset, colorSpace);
    const projectedNorm = normalizeWithRange(projected, ranges, colorSpace);
    samples.push({ vals: projected, norm: projectedNorm });
  }

  const ordered = lightKey && nColors > 1
    ? (() => {
      const [b0, b1] = channelBoundsForStart(prepLike, lightKey, scChannel, lightKey);
      const withY = samples.map((row) => {
        const denom = b1 - b0 || 1;
        const t = clamp01((row.norm[lightKey] - b0) / denom);
        return { ...row, y: logitClamped(t) };
      }).sort((a, b) => a.y - b.y);
      const minGap = 1e-4;
      let prevY = null;
      withY.forEach((row, idx) => {
        if (idx === 0) {
          row.yAdj = row.y;
          prevY = row.yAdj;
          return;
        }
        const nextY = Math.max(row.y, prevY + minGap);
        row.yAdj = nextY;
        prevY = nextY;
      });
      return withY;
    })()
    : samples;

  const params = [];
  ordered.forEach((row, rowIdx) => {
    channels.forEach((ch) => {
      if (ch === lightKey) {
        if (lightKey && nColors > 1) {
          if (rowIdx === 0) {
            params.push(row.yAdj);
          } else {
            const prevY = ordered[rowIdx - 1].yAdj;
            const diff = Math.max(row.yAdj - prevY, 1e-6);
            params.push(Math.log(diff));
          }
        } else {
          const [b0, b1] = channelBoundsForStart(prepLike, ch, scChannel, lightKey);
          const denom = b1 - b0 || 1;
          const t = clamp01((row.norm[ch] - b0) / denom);
          params.push(logitClamped(t));
        }
        return;
      }

      if (ch === "h") {
        const h01 = wrap01(row.norm.h ?? 0);
        if (!hueArc || hueArc.full) {
          params.push(h01 * TAU - hueAnchorRad);
          return;
        }
        let phi = h01 * TAU;
        const start = hueArc.startRad;
        const end = hueArc.startRad + hueArc.spanRad;
        while (phi < start) phi += TAU;
        while (phi > end) phi -= TAU;
        if (phi < start) phi = start;
        if (phi > end) phi = end;
        const t = hueArc.spanRad > 0 ? (phi - start) / hueArc.spanRad : 0.5;
        params.push(logitClamped(clamp01(t)));
        return;
      }

      const [b0, b1] = channelBoundsForStart(prepLike, ch, scChannel, lightKey);
      const denom = b1 - b0 || 1;
      const t = clamp01((row.norm[ch] - b0) / denom);
      params.push(logitClamped(t));
    });
  });
  return params;
}

function generateStartWithInfo(dim, prep) {
  if (prep.clipToGamutOpt) {
    const params = buildGamutUniformParams(prep.nColsToAdd, prep.colorSpace, prep.gamutPreset, prep.ranges, prep);
    const info = objectiveInfo(params, prep);
    return { params, info };
  }
  const params = buildRandomParams(dim);
  const info = objectiveInfo(params, prep);
  return { params, info };
}

export async function optimizePalette(palette, config, { onProgress, onVerbose } = {}) {
  const colorSpace = config.colorSpace;
  const channels = channelOrder[colorSpace];
  if ("seed" in config) {
    setRandomSeed(config.seed);
  }
  const prep = prepareData(palette, colorSpace, config);
  const conditioningHexes = palette || [];
  const dim = config.nColsToAdd * channels.length;
  let best = { value: Infinity, par: null, newHex: [], newRaw: [] };
  let bestScoreSoFar = -Infinity;

  const verboseMeta = {
    distanceMetric: prep.distanceMetric,
    meanType: prep.meanType,
    meanP: prep.meanP,
    colorblindWeights: prep.colorblindWeights,
    cvdModel: prep.cvdModel,
    clipToGamutOpt: prep.clipToGamutOpt,
    gamutPreset: prep.gamutPreset,
  };

  for (let run = 0; run < config.nOptimRuns; run++) {
    const startState = generateStartWithInfo(dim, prep);
    const start = startState.params;
    const startInfo = startState.info || objectiveInfo(start, prep);
    const startDetails = attachMeta(
      startInfo.details,
      startInfo.newHex,
      startInfo.newRaw,
      colorSpace,
      conditioningHexes,
      prep
    );
    if (onVerbose) {
      onVerbose({
        ...verboseMeta,
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
    const endDetails = attachMeta(
      endInfo.details,
      endInfo.newHex,
      endInfo.newRaw,
      colorSpace,
      conditioningHexes,
      prep
    );
    if (onVerbose) {
      onVerbose({
        ...verboseMeta,
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
          ...verboseMeta,
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
    const metaDetails = computeInfluences(best.newHex, conditioningHexes, prep);
    if (onVerbose) {
      onVerbose({
        ...verboseMeta,
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

function computeInfluences(hexes, conditioningHexes = [], prepLike = {}) {
  const newHexes = hexes || [];
  const currHexes = conditioningHexes || [];
  const offset = currHexes.length;
  if (newHexes.length === 0) return [];

  const metric = (prepLike.distanceMetric || "de2000").toLowerCase();
  const meanType = prepLike.meanType || "harmonic";
  const meanP = prepLike.meanP;
  const coordsForHex = (h) => {
    const rgb = hexToRgb(h);
    const xyz = rgbToXyz(rgb);
    return coordsFromXyzForDistanceMetric(xyz, metric);
  };
  const currCoords = currHexes.map(coordsForHex);
  const newCoords = newHexes.map(coordsForHex);

  if (currCoords.length + newCoords.length < 2) return newHexes.map((h) => ({ hex: h }));

  const pairwise = [];
  // Match the optimization distance structure: cross(curr,new) + within(new), not within(curr).
  for (let i = 0; i < currCoords.length; i++) {
    for (let j = 0; j < newCoords.length; j++) {
      const d = distanceBetweenCoords(currCoords[i], newCoords[j], metric);
      pairwise.push({ i, j: offset + j, d });
    }
  }
  for (let i = 0; i < newCoords.length; i++) {
    for (let j = i + 1; j < newCoords.length; j++) {
      const d = distanceBetweenCoords(newCoords[i], newCoords[j], metric);
      pairwise.push({ i: offset + i, j: offset + j, d });
    }
  }

  const allAgg = aggregateDistances(pairwise.map((p) => p.d), meanType, meanP);
  const closestByState = computeClosestByState(newHexes, currHexes, prepLike);
  const influences = [];
  for (let localIdx = 0; localIdx < newHexes.length; localIdx++) {
    const i = offset + localIdx;
    const remaining = pairwise.filter((p) => p.i !== i && p.j !== i).map((p) => p.d);
    const aggWithout = remaining.length ? aggregateDistances(remaining, meanType, meanP) : allAgg;
    const closestState = closestByState[localIdx] || {};
    influences.push({
      hex: newHexes[localIdx],
      influence: allAgg - aggWithout,
      closestHex: closestState.closestHex || "",
      closestDist: Number.isFinite(closestState.closestDist) ? closestState.closestDist : null,
      closestDistByState: closestState.closestDistByState || {},
      closestHexByState: closestState.closestHexByState || {},
    });
  }

  const ranked = [...influences].sort((a, b) => (b.influence || 0) - (a.influence || 0));
  ranked.forEach((item, idx) => {
    const target = influences.find((inf) => inf.hex === item.hex && inf.influence === item.influence);
    if (target) target.influenceRank = idx + 1;
  });
  return influences;
}

function coordsFromHexForState(hex, state, prepLike, metric) {
  const rgb = hexToRgb(hex);
  const xyz = rgbToXyz(rgb);
  const cvdModel = prepLike.cvdModel || "legacy";
  const clipToGamutOpt = prepLike.clipToGamutOpt === true;
  const gamutPreset = prepLike.gamutPreset || "srgb";
  const gamut = GAMUTS[gamutPreset] || GAMUTS["srgb"];
  let lin;
  if (clipToGamutOpt) {
    const out = gamut.fromXYZ(xyz.x, xyz.y, xyz.z);
    lin = { r: clamp(out.r, 0, 1), g: clamp(out.g, 0, 1), b: clamp(out.b, 0, 1) };
  } else {
    lin = xyzToLinearRgb(xyz);
  }
  const sim = state === "none" ? lin : applyCvdLinear(lin, state, 1, cvdModel);
  const xyzSim = clipToGamutOpt ? gamut.toXYZ(sim.r, sim.g, sim.b) : linearRgbToXyz(sim);
  return coordsFromXyzForDistanceMetric(xyzSim, metric);
}

function computeClosestByState(newHexes = [], conditioningHexes = [], prepLike = {}) {
  const states = ["none", "deutan", "protan", "tritan"];
  const allHexes = [...conditioningHexes, ...newHexes];
  const offset = conditioningHexes.length;
  const metric = prepLike.distanceMetric || "de2000";
  if (allHexes.length < 2) {
    return newHexes.map(() => ({
      closestDistByState: {},
      closestHexByState: {},
      closestHex: "",
      closestDist: null,
    }));
  }
  const coordsByState = {};
  states.forEach((state) => {
    coordsByState[state] = allHexes.map((hex) => coordsFromHexForState(hex, state, prepLike, metric));
  });
  return newHexes.map((hex, localIdx) => {
    const idx = offset + localIdx;
    const out = {
      closestDistByState: {},
      closestHexByState: {},
      closestHex: "",
      closestDist: null,
    };
    states.forEach((state) => {
      const coords = coordsByState[state];
      let minDist = Infinity;
      let closestIdx = null;
      for (let j = 0; j < coords.length; j++) {
        if (j === idx) continue;
        const d = distanceBetweenCoords(coords[idx], coords[j], metric);
        if (d < minDist) {
          minDist = d;
          closestIdx = j;
        }
      }
      out.closestDistByState[state] = Number.isFinite(minDist) ? minDist : null;
      out.closestHexByState[state] = closestIdx != null ? allHexes[closestIdx] : "";
      if (state === "none") {
        out.closestDist = Number.isFinite(minDist) ? minDist : null;
        out.closestHex = closestIdx != null ? allHexes[closestIdx] : "";
      }
    });
    return out;
  });
}

function harmonicMean(arr) {
  const eps = 1e-9;
  if (!arr.length) return 0;
  const sum = arr.reduce((acc, v) => acc + 1 / Math.max(v, eps), 0);
  return arr.length / sum;
}

function attachMeta(details, hexes, raws, space, conditioningHexes = [], prepLike = {}) {
  if (!details || !details.length) return details;
  const inf = computeInfluences(hexes, conditioningHexes, prepLike);
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
      closestDistByState: meta.closestDistByState,
      closestHexByState: meta.closestHexByState,
    };
  });
}
