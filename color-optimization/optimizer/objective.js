import { applyCvdLinear } from "../core/cvd.js";
import { deltaE2000 } from "../core/metrics.js";
import { aggregateDistances } from "../core/means.js";
import {
  channelOrder,
  convertColorValues,
  csRanges,
  decodeColor,
  encodeColor,
  linearRgbToXyz,
  xyzToLinearRgb,
  normalizeWithRange,
  unscaleWithRange,
  xyzToLab,
  xyzToOklab,
  GAMUTS,
} from "../core/colorSpaces.js";
import { clamp, logistic } from "../core/util.js";
import { computeBoundsFromCurrent } from "./bounds.js";

const PARAM_PENALTY_WEIGHT = 20;
const GAMUT_PENALTY_WEIGHT = 80;
const LOW_L_PENALTY = 400;
const PENALTY_NORMALIZATION = 14.1; // legacy weight-sum scale (previous defaults summed to ~14.1)

export function prepareData(palette, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const decoded = palette.map((hex) => decodeColor(hex, colorSpace));
  const ranges = csRanges[colorSpace];
  const normalized = decoded.map((vals) => normalizeWithRange(vals, ranges, colorSpace));

  // Important: use the same bounds logic as the UI (including synthetic midpoints when palette is empty).
  // Also: never let the optional background color dictate constraint bounds.
  const boundsPalette = Array.isArray(config?.boundsPalette) ? config.boundsPalette : palette;
  const bounds = computeBoundsFromCurrent(boundsPalette, colorSpace, config);
  const currHex = normalized.map((row) =>
    encodeColor(unscaleWithRange(row, ranges, colorSpace), colorSpace)
  );
  const cvdStates = config.colorblindSafe ? ["deutan", "protan", "tritan", "none"] : ["none"];
  const currCoordsByState = {};
  const clipToGamutOpt = config.clipToGamutOpt === true;
  const gamutPreset = config.gamutPreset || "srgb";
  const cvdModel = config.cvdModel || "legacy";
  const meanType = config.meanType || "harmonic";
  const meanP = Number.isFinite(config.meanP) ? config.meanP : undefined;
  const distanceMetric = config.distanceMetric || "de2000";
  cvdStates.forEach((state) => {
    currCoordsByState[state] = decoded.map((row) =>
      coordsForObjective(row, colorSpace, gamutPreset, state, clipToGamutOpt, cvdModel, distanceMetric)
    );
  });
  return {
    currCols: normalized,
    currHex,
    currRaw: decoded,
    currCoordsByState,
    cvdStates,
    bounds,
    colorSpace,
    gamutPreset,
    clipToGamutOpt,
    cvdModel,
    meanType,
    meanP,
    distanceMetric,
    ranges,
    colorblindWeights: config.colorblindWeights,
    colorblindSafe: config.colorblindSafe,
    nColsToAdd: config.nColsToAdd,
    penaltyScale: PENALTY_NORMALIZATION,
  };
}

export function meanDistance(par, prep, returnInfo) {
  const { currHex, bounds, colorSpace, colorblindWeights, colorblindSafe, nColsToAdd, ranges } = prep;
  const channels = channelOrder[colorSpace];
  const cn = channels;

  const m = [];
  for (let i = 0; i < nColsToAdd; i++) {
    const row = {};
    for (let j = 0; j < cn.length; j++) {
      row[cn[j]] = par[i * cn.length + j];
    }
    m.push(row);
  }

  if (cn.includes("l")) {
    if (m.length > 1) {
      for (let i = 1; i < m.length; i++) {
        m[i].l = Math.exp(m[i].l);
      }
      let acc = 0;
      for (let i = 0; i < m.length; i++) {
        acc += m[i].l;
        m[i].l = acc;
      }
    }
    for (let i = 0; i < m.length; i++) {
      const b = bounds.boundsByName?.l || bounds.boundsL;
      m[i].l = logistic(m[i].l) * (b[1] - b[0]) + b[0];
    }
  }

  const scChannel = cn.find((c) => c === "s" || c === "c");
  if (scChannel) {
    for (let i = 0; i < m.length; i++) {
      const b = bounds.boundsByName?.[scChannel] || bounds.boundsSc;
      m[i][scChannel] =
        clamp(logistic(m[i][scChannel]), 0, 1) * (b[1] - b[0]) +
        b[0];
      m[i][scChannel] = clamp(m[i][scChannel], b[0], b[1]);
    }
  }

  if (cn.includes("h")) {
    for (let i = 0; i < m.length; i++) {
      const h01 = clamp(logistic(m[i].h), 0, 1);
      const b = bounds.boundsH;
      if (!b) {
        m[i].h = h01;
        continue;
      }
      const rawSpan = (b[1] - b[0] + 1) % 1;
      const diff = b[1] - b[0];
      // If b spans a full circle (e.g. [0,1] or [0.2,1.2]), keep it unconstrained.
      // If rawSpan collapses to 0 but diff < 1, treat it as a tight arc (epsilon span).
      const span = rawSpan === 0 ? (diff >= 0.999 ? 1 : 1e-6) : rawSpan;
      let h = (b[0] + h01 * span) % 1;
      const offset = ((h - b[0] + 1) % 1);
      if (offset > span) {
        h = (b[0] + span) % 1;
      }
      m[i].h = h;
    }
  }

  for (let i = 0; i < m.length; i++) {
    cn.forEach((ch) => {
      if (ch === "l" || ch === scChannel || ch === "h") return;
      const b = bounds.boundsByName?.[ch] || [0, 1];
      m[i][ch] = clamp(logistic(m[i][ch]), 0, 1) * (b[1] - b[0]) + b[0];
      m[i][ch] = clamp(m[i][ch], b[0], b[1]);
    });
  }

  const scaled = m.map((row) => unscaleWithRange(row, ranges, colorSpace));
  const rawHex = scaled.map((row) => encodeColor(row, colorSpace));
  const newHex = rawHex;

  const cvdStates = prep.cvdStates;
  const perRowPenalties = scaled.map((row) => parameterPenaltyForRow(row, colorSpace));
  const perRowGamut = scaled.map((row) => gamutPenaltyForRow(row, colorSpace, prep.gamutPreset));
  const paramPenalty = perRowPenalties.reduce((acc, r) => acc + r.penalty, 0);
  const gamutPenalty = perRowGamut.reduce((acc, r) => acc + r.penalty, 0);
  const newCoordsByState = {};
  const perColorDistances = Array.from({ length: scaled.length }, () => ({ sum: 0, count: 0 }));
  cvdStates.forEach((state) => {
    newCoordsByState[state] = scaled.map((row) =>
      coordsForObjective(
        row,
        colorSpace,
        prep.gamutPreset,
        state,
        prep.clipToGamutOpt,
        prep.cvdModel,
        prep.distanceMetric
      )
    );
  });
  const dists = {};
  const distMetric = prep.distanceMetric || "de2000";
  const distFn = (a, b) => distanceBetween(a, b, distMetric);

  for (const state of cvdStates) {
    const nCoords = newCoordsByState[state];
    const cCoords = prep.currCoordsByState[state];

    const pairwise = [];
    for (let i = 0; i < cCoords.length; i++) {
      for (let j = 0; j < nCoords.length; j++) {
        const d = distFn(cCoords[i], nCoords[j]);
        pairwise.push(d);
        perColorDistances[j].sum += d;
        perColorDistances[j].count += 1;
      }
    }
    for (let i = 0; i < nCoords.length; i++) {
      for (let j = i + 1; j < nCoords.length; j++) {
        const d = distFn(nCoords[i], nCoords[j]);
        pairwise.push(d);
        perColorDistances[i].sum += d;
        perColorDistances[i].count += 1;
        perColorDistances[j].sum += d;
        perColorDistances[j].count += 1;
      }
    }
    dists[state] = aggregateDistances(pairwise, prep.meanType, prep.meanP);
  }

  const weights = colorblindWeights;
  let wd = 0;
  for (const k of Object.keys(weights)) {
    wd += (dists[k] || 0) * (weights[k] || 0);
  }

  const penaltyWeight = 1e-3;
  const penalty = par.reduce((acc, v) => acc + v * v, 0);
  const penaltyRaw = paramPenalty + gamutPenalty + penaltyWeight * penalty;
  const penaltyScale = prep.penaltyScale || 1;
  const penaltyTotal = penaltyRaw / penaltyScale;
  const value = -wd + penaltyTotal;

  if (returnInfo) {
    const details = scaled.map((row, idx) => {
      const dist = perColorDistances[idx];
      const avgDist = dist.count ? dist.sum / dist.count : 0;
      const gamutDist = Math.sqrt(perRowGamut[idx].distSq || 0);
      const rowPenalty = (perRowPenalties[idx].penalty + perRowGamut[idx].penalty) / penaltyScale;
      const totalContribution = avgDist + rowPenalty;
      return {
        hex: newHex[idx],
        channels: row,
        distance: avgDist,
        penalty: rowPenalty,
        gamutDistance: gamutDist,
        total: totalContribution,
      };
    });
    return {
      value,
      score: -value,
      newHex,
      newRaw: scaled.map((row) => ({ ...row })),
      distance: wd,
      penalty: penaltyTotal,
      paramPenalty: paramPenalty / penaltyScale,
      gamutPenalty: gamutPenalty / penaltyScale,
      details,
      colorSpace,
    };
  }
  return { value };
}

export function objectiveValue(par, prep) {
  return meanDistance(par, prep, false).value;
}

export function objectiveInfo(par, prep) {
  return meanDistance(par, prep, true);
}

function parameterPenaltyForRow(row, space) {
  const range = csRanges[space];
  if (!range) return { penalty: 0, gamutDistance: 0, distSq: 0 };
  const channels = channelOrder[space] || Object.keys(row);
  let penalty = 0;
  channels.forEach((ch) => {
    const val = row[ch];
    if (!Number.isFinite(val)) return;
    const min = range.min?.[ch];
    const max = range.max?.[ch];
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    let excess = 0;
    if (val < min) excess = min - val;
    else if (val > max) excess = val - max;
    if (excess > 0) {
      penalty += PARAM_PENALTY_WEIGHT * Math.pow(excess, 2);
    }
  });
  if ("l" in row && Number.isFinite(row.l) && range.min?.l !== undefined && range.max?.l !== undefined) {
    const span = Math.max(range.max.l - range.min.l, 1e-9);
    const lNorm = (row.l - range.min.l) / span;
    if (lNorm < 0.05) {
      penalty += (0.05 - lNorm) * LOW_L_PENALTY;
    }
  }
  return { penalty, distSq: 0, gamutDistance: 0 };
}

function gamutPenaltyForRow(row, space, gamutPreset = "srgb") {
  const gamut = GAMUTS[gamutPreset] || GAMUTS["srgb"];
  let lin = null;
  try {
    const xyz = convertColorValues(row, space, "xyz");
    lin = gamut?.fromXYZ ? gamut.fromXYZ(xyz.x, xyz.y, xyz.z) : xyzToLinearRgb(xyz);
  } catch (e) {
    return { penalty: GAMUT_PENALTY_WEIGHT * 25, distSq: 25 };
  }
  if (!lin) return 0;
  const dr = Math.max(0, -lin.r, lin.r - 1);
  const dg = Math.max(0, -lin.g, lin.g - 1);
  const db = Math.max(0, -lin.b, lin.b - 1);
  const distSq = dr * dr + dg * dg + db * db;
  return { penalty: GAMUT_PENALTY_WEIGHT * distSq, distSq };
}

function coordsForObjective(row, space, gamutPreset, cvdState, clipToGamutOpt, cvdModel, distanceMetric) {
  const xyz = convertColorValues(row, space, "xyz");
  const gamut = GAMUTS[gamutPreset] || GAMUTS["srgb"];
  let lin;
  if (clipToGamutOpt) {
    const from = gamut?.fromXYZ ? gamut.fromXYZ : (x, y, z) => xyzToLinearRgb({ x, y, z });
    const out = from(xyz.x, xyz.y, xyz.z);
    lin = { r: clamp(out.r, 0, 1), g: clamp(out.g, 0, 1), b: clamp(out.b, 0, 1) };
  } else {
    lin = xyzToLinearRgb(xyz);
  }
  const sim = cvdState === "none" ? lin : applyCvdLinear(lin, cvdState, 1, cvdModel);
  const xyzSim = clipToGamutOpt
    ? gamut.toXYZ(sim.r, sim.g, sim.b)
    : linearRgbToXyz(sim);
  const metric = (distanceMetric || "de2000").toLowerCase();
  if (metric === "oklab76") return xyzToOklab(xyzSim);
  return xyzToLab(xyzSim); // de2000 + lab76
}

function distanceBetween(a, b, metric) {
  const m = (metric || "de2000").toLowerCase();
  if (m === "de2000") return deltaE2000(a, b);
  const dl = (a.l || 0) - (b.l || 0);
  const da = (a.a || 0) - (b.a || 0);
  const db = (a.b || 0) - (b.b || 0);
  return Math.hypot(dl, da, db);
}
