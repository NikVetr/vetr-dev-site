import { applyCvdLinear } from "../core/cvd.js";
import { aggregateDistances } from "../core/means.js";
import { coordsFromXyzForDistanceMetric, distanceBetweenCoords } from "../core/distance.js";
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
  projectToGamut,
  GAMUTS,
} from "../core/colorSpaces.js";
import { clamp, logistic } from "../core/util.js";
import { computeBoundsFromCurrent, computeBoundsFromRawValues } from "./bounds.js";

const PARAM_PENALTY_WEIGHT = 20;
const GAMUT_PENALTY_WEIGHT = 80;
const LOW_L_PENALTY = 400;
const CONSTRAINT_PENALTY_WEIGHT = 8;
const HARD_SET_PENALTY_MULT = 6;
const PENALTY_NORMALIZATION = 14.1; // legacy weight-sum scale (previous defaults summed to ~14.1)
const TAU = Math.PI * 2;

export function prepareData(palette, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const decoded = palette.map((hex) => decodeColor(hex, colorSpace));
  const ranges = csRanges[colorSpace];
  const normalized = decoded.map((vals) => normalizeWithRange(vals, ranges, colorSpace));

  // Important: use the same bounds logic as the UI (including synthetic midpoints when palette is empty).
  // Also: never let the optional background color dictate constraint bounds.
  const boundsPalette = Array.isArray(config?.boundsPalette) ? config.boundsPalette : palette;
  const useCustom = config?.constraintTopology === "custom" && Array.isArray(config?.customConstraintPoints) && config.customConstraintPoints.length;
  const bounds = useCustom
    ? computeBoundsFromRawValues(config.customConstraintPoints, colorSpace, config)
    : computeBoundsFromCurrent(boundsPalette, colorSpace, config);
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
  const hueAnchorRad = channels.includes("h") ? computeHueAnchorRad(decoded) : 0;
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
    hueAnchorRad,
    constraintTopology: config.constraintTopology || "contiguous",
    constraintMode: config.constraintMode || {},
    aestheticMode: config.aestheticMode || "none",
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
  const lightKey = cn.includes("l") ? "l" : cn.includes("jz") ? "jz" : null;
  const constraintSets = bounds?.constraintSets;
  const constraintTopology = prep.constraintTopology || constraintSets?.topology || "contiguous";

  const m = [];
  const zRows = [];
  for (let i = 0; i < nColsToAdd; i++) {
    const row = {};
    for (let j = 0; j < cn.length; j++) {
      row[cn[j]] = par[i * cn.length + j];
    }
    m.push(row);
    zRows.push({ ...row });
  }

  if (lightKey) {
    if (m.length > 1) {
      for (let i = 1; i < m.length; i++) {
        m[i][lightKey] = Math.exp(m[i][lightKey]);
      }
      let acc = 0;
      for (let i = 0; i < m.length; i++) {
        acc += m[i][lightKey];
        m[i][lightKey] = acc;
      }
    }
    for (let i = 0; i < m.length; i++) {
      const channelMode = constraintSets?.channels?.[lightKey]?.mode || "hard";
      const useHard = channelMode === "hard" && constraintTopology === "contiguous";
      const b = useHard ? (bounds.boundsByName?.[lightKey] || bounds.boundsL) : [0, 1];
      m[i][lightKey] = logistic(m[i][lightKey]) * (b[1] - b[0]) + b[0];
    }
  }

  const scChannel = cn.find((c) => c === "s" || c === "c");
  if (scChannel) {
    for (let i = 0; i < m.length; i++) {
      const channelMode = constraintSets?.channels?.[scChannel]?.mode || "hard";
      const useHard = channelMode === "hard" && constraintTopology === "contiguous";
      const b = useHard ? (bounds.boundsByName?.[scChannel] || bounds.boundsSc) : [0, 1];
      m[i][scChannel] =
        clamp(logistic(m[i][scChannel]), 0, 1) * (b[1] - b[0]) +
        b[0];
      if (useHard) m[i][scChannel] = clamp(m[i][scChannel], b[0], b[1]);
    }
  }

  if (cn.includes("h")) {
    const hueMode = constraintSets?.channels?.h?.mode || "hard";
    const useHard = hueMode === "hard" && constraintTopology === "contiguous";
    const arc = useHard && bounds?.boundsH ? hueArcFromBounds(bounds.boundsH) : null;
    for (let i = 0; i < m.length; i++) {
      const decodedHue = decodeHueParam(m[i].h, arc, prep.hueAnchorRad);
      m[i].h = decodedHue.h01;
      m[i].__huePhi = decodedHue.phi;
    }
  }

  for (let i = 0; i < m.length; i++) {
    cn.forEach((ch) => {
      if (ch === lightKey || ch === scChannel || ch === "h") return;
      const channelMode = constraintSets?.channels?.[ch]?.mode || "hard";
      const useHard = channelMode === "hard" && constraintTopology === "contiguous";
      const b = useHard ? (bounds.boundsByName?.[ch] || [0, 1]) : [0, 1];
      m[i][ch] = clamp(logistic(m[i][ch]), 0, 1) * (b[1] - b[0]) + b[0];
      if (useHard) m[i][ch] = clamp(m[i][ch], b[0], b[1]);
    });
  }

  if (constraintTopology === "discontiguous" || constraintTopology === "custom") {
    applyDiscontiguousHardConstraints(m, zRows, constraintSets);
  }

  const scaled = m.map((row) => unscaleWithRange(row, ranges, colorSpace));
  const displayRaw = prep.clipToGamutOpt
    ? scaled.map((row) => projectToGamut(row, colorSpace, prep.gamutPreset, colorSpace))
    : scaled;
  const rawHex = displayRaw.map((row) => encodeColor(row, colorSpace));
  const newHex = rawHex;

  const cvdStates = prep.cvdStates;
  const perRowPenalties = scaled.map((row) => parameterPenaltyForRow(row, colorSpace));
  const perRowGamut = scaled.map((row) => gamutPenaltyForRow(row, colorSpace, prep.gamutPreset));
  const perRowConstraint = scaled.map((row, idx) =>
    constraintPenaltyForRow(m[idx], idx, zRows[idx], constraintSets, constraintTopology)
  );
  const paramPenalty = perRowPenalties.reduce((acc, r) => acc + r.penalty, 0);
  const gamutPenalty = perRowGamut.reduce((acc, r) => acc + r.penalty, 0);
  const constraintPenalty = perRowConstraint.reduce((acc, r) => acc + r.penalty, 0);
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
  const distFn = (a, b) => distanceBetweenCoords(a, b, distMetric);

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
  const penaltyRaw = paramPenalty + gamutPenalty + constraintPenalty + penaltyWeight * penalty;
  const penaltyScale = prep.penaltyScale || 1;
  const penaltyTotal = penaltyRaw / penaltyScale;
  const value = -wd + penaltyTotal;

  if (returnInfo) {
    const details = scaled.map((row, idx) => {
      const dist = perColorDistances[idx];
      const avgDist = dist.count ? dist.sum / dist.count : 0;
      const gamutDist = Math.sqrt(perRowGamut[idx].distSq || 0);
      const rowPenalty =
        (perRowPenalties[idx].penalty + perRowGamut[idx].penalty + perRowConstraint[idx].penalty) / penaltyScale;
      const totalContribution = avgDist + rowPenalty;
      return {
        hex: newHex[idx],
        channels: row,
        distance: avgDist,
        penalty: rowPenalty,
        gamutDistance: gamutDist,
        constraintPenalty: perRowConstraint[idx].penalty / penaltyScale,
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
      constraintPenalty: constraintPenalty / penaltyScale,
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
  const lightKey = channels.includes("l") ? "l" : channels.includes("jz") ? "jz" : null;
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
  if (
    lightKey &&
    lightKey in row &&
    Number.isFinite(row[lightKey]) &&
    range.min?.[lightKey] !== undefined &&
    range.max?.[lightKey] !== undefined
  ) {
    const span = Math.max(range.max[lightKey] - range.min[lightKey], 1e-9);
    const lNorm = (row[lightKey] - range.min[lightKey]) / span;
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
  return coordsFromXyzForDistanceMetric(xyzSim, distanceMetric);
}

function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

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

function decodeHueParam(z, arc, anchorRad = 0) {
  if (!arc || arc.full) {
    const phi = anchorRad + z;
    return { phi, h01: wrap01(phi / TAU) };
  }
  const t = logistic(z);
  const phi = arc.startRad + arc.spanRad * t;
  return { phi, h01: wrap01(phi / TAU), t };
}

function logit(p) {
  const t = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(t / (1 - t));
}

function applyDiscontiguousHardConstraints(rows, zRows, constraintSets) {
  if (!constraintSets?.channels || !rows?.length) return;
  const channels = Object.keys(constraintSets.channels);
  const pointWindowsByChannel = {};
  let numPoints = 0;
  let hasHard = false;

  channels.forEach((ch) => {
    const c = constraintSets.channels[ch];
    if (!c) return;
    if (c.mode === "hard") hasHard = true;
    if (Array.isArray(c.pointWindows) && c.pointWindows.length > 0) {
      pointWindowsByChannel[ch] = c.pointWindows;
      numPoints = Math.max(numPoints, c.pointWindows.length);
    }
  });

  if (!hasHard || numPoints === 0) return;

  rows.forEach((row, idx) => {
    const zRow = zRows?.[idx] || {};
    let bestIndex = null;
    let bestZSq = Infinity;

    for (let i = 0; i < numPoints; i++) {
      let zSq = 0;
      let used = false;
      channels.forEach((ch) => {
        const c = constraintSets.channels[ch];
        if (!c) return;
        const windows = pointWindowsByChannel[ch];
        if (!windows) return;
        const w = windows[i % windows.length];
        if (!w) return;
        used = true;
        if (c.type === "hue") {
          const phi = row.__huePhi;
          if (!Number.isFinite(phi)) return;
          const sigma = Math.max(w.radius / 1.96, 1e-3);
          const dHue = circularDistance(phi, w.center);
          zSq += Math.pow(dHue / sigma, 2);
        } else {
          const z = zRow?.[ch];
          if (!Number.isFinite(z)) return;
          const u = clamp(logistic(z), 0, 1);
          const sigma = Math.max(w.radius / 1.96, 1e-3);
          const dLin = Math.abs(u - w.center);
          zSq += Math.pow(dLin / sigma, 2);
        }
      });
      if (used && zSq < bestZSq) {
        bestZSq = zSq;
        bestIndex = i;
      }
    }

    if (bestIndex == null) return;

    channels.forEach((ch) => {
      const c = constraintSets.channels[ch];
      if (!c || c.mode !== "hard") return;
      const windows = pointWindowsByChannel[ch];
      if (!windows) return;
      const w = windows[bestIndex % windows.length];
      if (!w) return;
      if (c.type === "hue") {
        const phi = row.__huePhi;
        if (!Number.isFinite(phi)) return;
        const radius = Math.max(w.radius, 1e-6);
        const delta = wrapToPi(phi - w.center);
        if (Math.abs(delta) > radius) {
          const clampedPhi = w.center + (delta >= 0 ? 1 : -1) * radius;
          row.__huePhi = clampedPhi;
          row.h = wrap01(clampedPhi / TAU);
        }
      } else {
        const min = Number.isFinite(w.min) ? w.min : Math.max(0, w.center - w.radius);
        const max = Number.isFinite(w.max) ? w.max : Math.min(1, w.center + w.radius);
        const clamped = clamp(row[ch], min, max);
        row[ch] = clamped;
        zRow[ch] = logit(clamped);
      }
    });
  });
}

function constraintPenaltyForRow(row, idx, zRow, constraintSets, topology) {
  if (!constraintSets || !constraintSets.channels) return { penalty: 0 };
  const channels = Object.keys(constraintSets.channels);
  let penalty = 0;

  // For discontiguous mode, compute combined penalty based on distance to nearest point window
  // (not independent per-channel checks which would allow invalid cross-combinations)
  if (topology === "discontiguous" || topology === "custom") {
    const pointWindowsByChannel = {};
    let numPoints = 0;
    let hasAnyHardConstraint = false;

    channels.forEach((ch) => {
      const c = constraintSets.channels[ch];
      if (!c) return;
      if (c.mode === "hard") hasAnyHardConstraint = true;
      if (Array.isArray(c.pointWindows) && c.pointWindows.length > 0) {
        pointWindowsByChannel[ch] = c.pointWindows;
        numPoints = Math.max(numPoints, c.pointWindows.length);
      }
    });

    if (numPoints > 0) {
      // For each point, compute combined z² across all channels
      let minZSq = Infinity;
      for (let i = 0; i < numPoints; i++) {
        let zSq = 0;
        channels.forEach((ch) => {
          const c = constraintSets.channels[ch];
          if (!c) return;
          const windows = pointWindowsByChannel[ch];
          const w = windows ? windows[i % windows.length] : null;
          if (!w) return;

          if (c.type === "hue") {
            const phi = row.__huePhi;
            if (!Number.isFinite(phi)) return;
            // Distance to this point's hue center
            const dHue = circularDistance(phi, w.center);
            const sigma = Math.max(w.radius / 1.96, 1e-3);
            zSq += Math.pow(dHue / sigma, 2);
          } else {
            const z = zRow?.[ch];
            if (!Number.isFinite(z)) return;
            const u = clamp(logistic(z), 0, 1);
            // Distance to this point's center
            const dLin = Math.abs(u - w.center);
            const sigma = Math.max(w.radius / 1.96, 1e-3);
            zSq += Math.pow(dLin / sigma, 2);
          }
        });
        if (zSq < minZSq) minZSq = zSq;
      }

      if (Number.isFinite(minZSq) && minZSq > 0) {
        const hardBoost = hasAnyHardConstraint ? HARD_SET_PENALTY_MULT : 1;
        penalty += hardBoost * CONSTRAINT_PENALTY_WEIGHT * minZSq;
      }
    }
    return { penalty };
  }

  // Contiguous mode: check each channel independently (original logic)
  channels.forEach((ch) => {
    const c = constraintSets.channels[ch];
    if (!c) return;
    const mode = c.mode || "hard";
    const usePenalty = mode === "soft";
    if (!usePenalty) return;
    if (c.type === "hue") {
      const phi = row.__huePhi;
      if (!Number.isFinite(phi)) return;
      if (c.arc) {
        const sigma = Math.max((c.arc.spanRad / 2) / 1.96, 1e-3);
        const center = c.arc.startRad + c.arc.spanRad / 2;
        const d = wrapToPi(phi - center);
        penalty += CONSTRAINT_PENALTY_WEIGHT * 0.5 * Math.pow(d / sigma, 2);
      }
      return;
    }
    const z = zRow?.[ch];
    if (!Number.isFinite(z)) return;
    if (Array.isArray(c.intervals) && c.intervals.length) {
      const L = clamp(c.intervals[0][0], 1e-6, 1 - 1e-6);
      const U = clamp(c.intervals[c.intervals.length - 1][1], 1e-6, 1 - 1e-6);
      const zL = logit(L);
      const zU = logit(U);
      const mu = (zL + zU) / 2;
      const sigma = Math.max((zU - zL) / (2 * 1.96), 1e-3);
      penalty += CONSTRAINT_PENALTY_WEIGHT * 0.5 * Math.pow((z - mu) / sigma, 2);
    }
  });
  return { penalty };
}

function wrapToPi(phi) {
  return ((phi + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function circularDistance(a, b) {
  const aNorm = ((a % TAU) + TAU) % TAU;
  const bNorm = ((b % TAU) + TAU) % TAU;
  const d = Math.abs(aNorm - bNorm);
  return Math.min(d, TAU - d);
}

function computeHueAnchorRad(rows) {
  if (!rows?.length) return 0;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  rows.forEach((row) => {
    if (!Number.isFinite(row.h)) return;
    const rad = (row.h * Math.PI) / 180;
    sumX += Math.cos(rad);
    sumY += Math.sin(rad);
    count += 1;
  });
  if (!count) return 0;
  if (Math.abs(sumX) < 1e-12 && Math.abs(sumY) < 1e-12) return 0;
  return Math.atan2(sumY, sumX);
}
