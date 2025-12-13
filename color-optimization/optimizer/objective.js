import { applyCvdLinear } from "../core/cvd.js";
import { deltaE2000 } from "../core/metrics.js";
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
  GAMUTS,
} from "../core/colorSpaces.js";
import { clamp, logistic } from "../core/util.js";
import { computeBounds } from "./bounds.js";

const PARAM_PENALTY_WEIGHT = 20;
const GAMUT_PENALTY_WEIGHT = 80;
const LOW_L_PENALTY = 400;

export function prepareData(palette, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const decoded = palette.map((hex) => decodeColor(hex, colorSpace));
  const ranges = csRanges[colorSpace];
  const normalized = decoded.map((vals) => normalizeWithRange(vals, ranges, colorSpace));

  const bounds = computeBounds(normalized, colorSpace, config);
  const currHex = normalized.map((row) =>
    encodeColor(unscaleWithRange(row, ranges, colorSpace), colorSpace)
  );
  const cvdStates = config.colorblindSafe ? ["deutan", "protan", "tritan", "none"] : ["none"];
  const currLinear = decoded.map((row) => convertColorValues(row, colorSpace, "rgb"));
  const currLabsByState = {};
  cvdStates.forEach((state) => {
    currLabsByState[state] = currLinear.map((lin) => {
      const sim = state === "none" ? lin : applyCvdLinear(lin, state);
      return xyzToLab(linearRgbToXyz(sim));
    });
  });
  return {
    currCols: normalized,
    currHex,
    currRaw: decoded,
    currLabsByState,
    cvdStates,
    bounds,
    colorSpace,
    gamutPreset: config.gamutPreset || "srgb",
    ranges,
    colorblindWeights: config.colorblindWeights,
    colorblindSafe: config.colorblindSafe,
    nColsToAdd: config.nColsToAdd,
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

  if (cn.includes("h") && bounds.boundsH) {
    for (let i = 0; i < m.length; i++) {
      const span = (bounds.boundsH[1] - bounds.boundsH[0] + 1) % 1 || 1;
      let h = clamp(logistic(m[i].h), 0, 1);
      h = (bounds.boundsH[0] + h * span) % 1;
      const offset = ((h - bounds.boundsH[0] + 1) % 1);
      if (offset > span) {
        h = (bounds.boundsH[0] + span) % 1;
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
  const newLabsByState = {};
  const perColorDistances = Array.from({ length: scaled.length }, () => ({ sum: 0, count: 0 }));
  cvdStates.forEach((state) => {
    newLabsByState[state] = scaled.map((row) => {
      const lin = convertColorValues(row, colorSpace, "rgb");
      const sim = state === "none" ? lin : applyCvdLinear(lin, state);
      return xyzToLab(linearRgbToXyz(sim));
    });
  });
  const dists = {};

  for (const state of cvdStates) {
    const nLabs = newLabsByState[state];
    const cLabs = prep.currLabsByState[state];

    const pairwise = [];
    for (let i = 0; i < cLabs.length; i++) {
      for (let j = 0; j < nLabs.length; j++) {
        const d = deltaE2000(cLabs[i], nLabs[j]);
        pairwise.push(d);
        perColorDistances[j].sum += d;
        perColorDistances[j].count += 1;
      }
    }
    for (let i = 0; i < nLabs.length; i++) {
      for (let j = i + 1; j < nLabs.length; j++) {
        const d = deltaE2000(nLabs[i], nLabs[j]);
        pairwise.push(d);
        perColorDistances[i].sum += d;
        perColorDistances[i].count += 1;
        perColorDistances[j].sum += d;
        perColorDistances[j].count += 1;
      }
    }
    const eps = 1e-6;
    const hm = 1 / (pairwise.reduce((acc, v) => acc + 1 / Math.max(v, eps), 0) / pairwise.length);
    dists[state] = hm;
  }

  const weights = colorblindWeights;
  let wd = 0;
  for (const k of Object.keys(weights)) {
    wd += (dists[k] || 0) * (weights[k] || 0);
  }

  const penaltyWeight = 1e-3;
  const penalty = par.reduce((acc, v) => acc + v * v, 0);
  const penaltyTotal = paramPenalty + gamutPenalty + penaltyWeight * penalty;
  const value = -wd + penaltyTotal;

  if (returnInfo) {
    const details = scaled.map((row, idx) => {
      const dist = perColorDistances[idx];
      const avgDist = dist.count ? dist.sum / dist.count : 0;
      const gamutDist = Math.sqrt(perRowGamut[idx].distSq || 0);
      const totalContribution = avgDist + perRowPenalties[idx].penalty + perRowGamut[idx].penalty;
      return {
        hex: newHex[idx],
        channels: row,
        distance: avgDist,
        penalty: perRowPenalties[idx].penalty + perRowGamut[idx].penalty,
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
      paramPenalty,
      gamutPenalty,
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
