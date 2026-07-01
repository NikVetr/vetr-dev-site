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
  GAMUTS,
} from "../core/colorSpaces.js";
import { clamp, logistic } from "../core/util.js";
import { projectToGamutWithinHardConstraints } from "../core/hardConstraints.js";
import { computeBoundsFromCurrent, computeBoundsFromRawValues } from "./bounds.js";

const PARAM_PENALTY_WEIGHT = 20;
const GAMUT_PENALTY_WEIGHT = 80;
const LOW_L_PENALTY = 400;
const CONSTRAINT_PENALTY_WEIGHT = 8;
const HARD_SET_PENALTY_MULT = 6;
const PENALTY_NORMALIZATION = 14.1; // legacy weight-sum scale (previous defaults summed to ~14.1)
const TAU = Math.PI * 2;

function defaultTweakConstraintMode(channels = []) {
  const out = {};
  channels.forEach((ch) => {
    out[ch] = "soft";
  });
  return out;
}

function modeForConstraintRow(channelConfig, ch, rowRole, tweakConstraintMode = {}, pointIndex = null) {
  if (rowRole?.skipConstraints) return "none";
  if (rowRole?.kind === "tweak") return rowRole.constraintMode || tweakConstraintMode[ch] || "soft";
  if (Number.isFinite(pointIndex) && Array.isArray(channelConfig?.pointModes)) {
    return channelConfig.pointModes[pointIndex % channelConfig.pointModes.length] || channelConfig.mode || "hard";
  }
  return channelConfig?.mode || "hard";
}

function usesOrderedLightnessRows(optimizedRows = []) {
  return !(Array.isArray(optimizedRows) && optimizedRows.some((row) => row?.kind === "tweak"));
}

export function prepareData(palette, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const decoded = palette.map((hex) => decodeColor(hex, colorSpace));
  const tweakSet = new Set(
    (Array.isArray(config?.tweakInputIndices) ? config.tweakInputIndices : [])
      .map((idx) => Math.floor(idx))
      .filter((idx) => idx >= 0 && idx < decoded.length)
  );
  const tweakInputIndices = [...tweakSet].sort((a, b) => a - b);
  const fixedDecoded = decoded.filter((_, idx) => !tweakSet.has(idx));
  const optimizedRows = tweakInputIndices
    .map((inputIndex) => ({
      kind: "tweak",
      inputIndex,
      pointIndex: inputIndex,
      constraintMode: Array.isArray(config?.perInputModes) && (config.perInputModes[inputIndex] === "hard" || config.perInputModes[inputIndex] === "soft")
        ? config.perInputModes[inputIndex]
        : null,
      sourceRaw: decoded[inputIndex] ? { ...decoded[inputIndex] } : null,
      sourceNorm: decoded[inputIndex] ? normalizeWithRange(decoded[inputIndex], csRanges[colorSpace], colorSpace) : null,
    }))
    .concat(
      Array.from({ length: Math.max(0, config.nColsToAdd || 0) }, (_, addIndex) => ({ kind: "add", addIndex }))
    );
  const ranges = csRanges[colorSpace];
  const normalized = fixedDecoded.map((vals) => normalizeWithRange(vals, ranges, colorSpace));

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
    currCoordsByState[state] = fixedDecoded.map((row) =>
      coordsForObjective(row, colorSpace, gamutPreset, state, clipToGamutOpt, cvdModel, distanceMetric)
    );
  });
  const hueAnchorRad = channels.includes("h") ? computeHueAnchorRad(decoded) : 0;
  return {
    currCols: normalized,
    currHex,
    currRaw: fixedDecoded,
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
    individualConstraintsReplaceGlobal: Boolean(config.individualConstraintsReplaceGlobal),
    constraintMode: config.constraintMode || {},
    tweakConstraintMode: config.tweakConstraintMode || defaultTweakConstraintMode(channels),
    aestheticMode: config.aestheticMode || "none",
    colorblindWeights: config.colorblindWeights,
    colorblindSafe: config.colorblindSafe,
    nColsToAdd: Math.max(0, config.nColsToAdd || 0),
    nOptimized: optimizedRows.length,
    optimizedRows,
    tweakInputIndices,
    hasPerInputConstraints: Boolean(config.perInputWidths || config.perInputModes),
    penaltyScale: PENALTY_NORMALIZATION,
  };
}

export function meanDistance(par, prep, returnInfo) {
  const { currHex, bounds, colorSpace, colorblindWeights, colorblindSafe, ranges } = prep;
  const channels = channelOrder[colorSpace];
  const cn = channels;
  const lightKey = cn.includes("l") ? "l" : cn.includes("jz") ? "jz" : null;
  const constraintSets = bounds?.constraintSets;
  const globalConstraintSets = bounds?.globalConstraintSets || constraintSets;
  const constraintTopology = prep.constraintTopology || constraintSets?.topology || "contiguous";
  const useLayeredIndividualConstraints =
    constraintTopology === "discontiguous" &&
    prep.hasPerInputConstraints &&
    !prep.individualConstraintsReplaceGlobal &&
    constraintSets &&
    globalConstraintSets &&
    constraintSets !== globalConstraintSets;
  const globalRowRoles = useLayeredIndividualConstraints
    ? (prep.optimizedRows || []).map((role) =>
        shouldSkipGlobalConstraintsForRow(role, constraintSets, globalConstraintSets, prep.tweakConstraintMode)
          ? { skipConstraints: true }
          : null
      )
    : null;
  const individualRowRoles = useLayeredIndividualConstraints
    ? individualConstraintRolesForOptimizedRows(prep.optimizedRows, prep.tweakInputIndices)
    : prep.optimizedRows;

  const m = [];
  const zRows = [];
  const nOptimized = Math.max(0, prep.nOptimized ?? prep.nColsToAdd ?? 0);
  for (let i = 0; i < nOptimized; i++) {
    const row = {};
    for (let j = 0; j < cn.length; j++) {
      row[cn[j]] = par[i * cn.length + j];
    }
    m.push(row);
    zRows.push({ ...row });
  }

  if (lightKey) {
    const useOrderedLightness = m.length > 1 && usesOrderedLightnessRows(prep.optimizedRows);
    if (useOrderedLightness) {
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
      const rowRole = prep.optimizedRows?.[i];
      const channelMode = globalConstraintSets?.channels?.[lightKey]?.mode || "hard";
      const useHard = channelMode === "hard" && constraintTopology === "contiguous";
      const b = useHard ? (bounds.boundsByName?.[lightKey] || bounds.boundsL) : [0, 1];
      if (useOrderedLightness) {
        m[i][lightKey] = logistic(m[i][lightKey]) * (b[1] - b[0]) + b[0];
      } else {
        m[i][lightKey] = clamp(logistic(m[i][lightKey]), 0, 1) * (b[1] - b[0]) + b[0];
      }
    }
  }

  const scChannel = cn.find((c) => c === "s" || c === "c");
  if (scChannel) {
    for (let i = 0; i < m.length; i++) {
      const rowRole = prep.optimizedRows?.[i];
      const channelMode = globalConstraintSets?.channels?.[scChannel]?.mode || "hard";
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
    const globalHueMode = globalConstraintSets?.channels?.h?.mode || hueMode;
    const useHard = globalHueMode === "hard" && constraintTopology === "contiguous";
    const arc = useHard && bounds?.boundsH ? hueArcFromBounds(bounds.boundsH) : null;
    for (let i = 0; i < m.length; i++) {
      const decodedHue = decodeHueParam(m[i].h, arc, prep.hueAnchorRad);
      m[i].h = decodedHue.h01;
      m[i].__huePhi = decodedHue.phi;
    }
  }

  for (let i = 0; i < m.length; i++) {
    const rowRole = prep.optimizedRows?.[i];
    cn.forEach((ch) => {
      if (ch === lightKey || ch === scChannel || ch === "h") return;
      const channelMode = globalConstraintSets?.channels?.[ch]?.mode || "hard";
      const useHard = channelMode === "hard" && constraintTopology === "contiguous";
      const b = useHard ? (bounds.boundsByName?.[ch] || [0, 1]) : [0, 1];
      m[i][ch] = clamp(logistic(m[i][ch]), 0, 1) * (b[1] - b[0]) + b[0];
      if (useHard) m[i][ch] = clamp(m[i][ch], b[0], b[1]);
    });
  }

  if (constraintTopology === "discontiguous" || constraintTopology === "custom") {
    if (useLayeredIndividualConstraints) {
      applyDiscontiguousHardConstraints(m, zRows, globalConstraintSets, globalRowRoles, prep.tweakConstraintMode);
      applyDiscontiguousHardConstraints(m, zRows, constraintSets, individualRowRoles, prep.tweakConstraintMode);
    } else {
      applyDiscontiguousHardConstraints(m, zRows, constraintSets, prep.optimizedRows, prep.tweakConstraintMode);
    }
  }

  const scaled = m.map((row) => unscaleWithRange(row, ranges, colorSpace));
  const displayRaw = prep.clipToGamutOpt
    ? scaled.map((row) => projectToGamutWithinHardConstraints(row, prep))
    : scaled;
  const rawHex = displayRaw.map((row) => encodeColor(row, colorSpace));
  const newHex = rawHex;

  const cvdStates = prep.cvdStates;
  const objectiveRows = prep.clipToGamutOpt ? displayRaw : scaled;
  const perRowPenalties = scaled.map((row) => parameterPenaltyForRow(row, colorSpace));
  const perRowGamut = scaled.map((row) => gamutPenaltyForRow(row, colorSpace, prep.gamutPreset));
  const perRowConstraint = scaled.map((row, idx) => {
    if (useLayeredIndividualConstraints) {
      const globalPenalty = constraintPenaltyForRow(m[idx], idx, zRows[idx], globalConstraintSets, constraintTopology, globalRowRoles?.[idx], prep.tweakConstraintMode).penalty;
      const individualPenalty = constraintPenaltyForRow(m[idx], idx, zRows[idx], constraintSets, constraintTopology, individualRowRoles?.[idx], prep.tweakConstraintMode).penalty;
      return { penalty: globalPenalty + individualPenalty };
    }
    return constraintPenaltyForRow(m[idx], idx, zRows[idx], constraintSets, constraintTopology, prep.optimizedRows?.[idx], prep.tweakConstraintMode);
  });
  const paramPenalty = perRowPenalties.reduce((acc, r) => acc + r.penalty, 0);
  const gamutPenalty = perRowGamut.reduce((acc, r) => acc + r.penalty, 0);
  const constraintPenalty = perRowConstraint.reduce((acc, r) => acc + r.penalty, 0);
  const newCoordsByState = {};
  const perColorDistances = Array.from({ length: scaled.length }, () => ({ sum: 0, count: 0 }));
  cvdStates.forEach((state) => {
    newCoordsByState[state] = objectiveRows.map((row) =>
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
      newRaw: displayRaw.map((row) => ({ ...row })),
      optimizerRaw: scaled.map((row) => ({ ...row })),
      optimizedRows: prep.optimizedRows ? prep.optimizedRows.map((row) => ({ ...row })) : [],
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

function individualConstraintRolesForOptimizedRows(optimizedRows = [], tweakInputIndices = []) {
  const excludedPointIndices = (Array.isArray(tweakInputIndices) ? tweakInputIndices : [])
    .map((idx) => Math.floor(idx))
    .filter((idx) => Number.isFinite(idx) && idx >= 0);
  if (!excludedPointIndices.length) return optimizedRows;
  return (optimizedRows || []).map((role) => {
    if (role?.kind === "tweak" && Number.isFinite(role.pointIndex)) return role;
    return { ...(role || {}), excludePointIndices: excludedPointIndices };
  });
}

function candidatePointIndicesForConstraintRole(role, numPoints) {
  if (!numPoints) return [];
  if (role?.kind === "tweak" && Number.isFinite(role.pointIndex)) {
    return [Math.max(0, Math.min(numPoints - 1, Math.floor(role.pointIndex)))];
  }
  const excluded = new Set(
    (Array.isArray(role?.excludePointIndices) ? role.excludePointIndices : [])
      .map((idx) => Math.floor(idx))
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < numPoints)
  );
  return Array.from({ length: numPoints }, (_, i) => i).filter((idx) => !excluded.has(idx));
}

function applyDiscontiguousHardConstraints(rows, zRows, constraintSets, rowRoles = [], tweakConstraintMode = {}) {
  if (!constraintSets?.channels || !rows?.length) return;
  const channels = Object.keys(constraintSets.channels);
  const pointWindowsByChannel = {};
  let numPoints = 0;

  channels.forEach((ch) => {
    const c = constraintSets.channels[ch];
    if (!c) return;
    if (Array.isArray(c.pointWindows) && c.pointWindows.length > 0) {
      pointWindowsByChannel[ch] = c.pointWindows;
      numPoints = Math.max(numPoints, c.pointWindows.length);
    }
  });

  if (numPoints === 0) return;

  rows.forEach((row, idx) => {
    const zRow = zRows?.[idx] || {};
    let bestIndex = null;
    let bestZSq = Infinity;
    let bestTieSq = Infinity;

    const role = rowRoles?.[idx] || {};
    const candidateIndices = candidatePointIndicesForConstraintRole(role, numPoints);
    if (!candidateIndices.length) return;
    const rowHasHard = channels.some((ch) => {
      const c = constraintSets.channels[ch];
      if (!c) return false;
      return !Array.isArray(c.pointModes)
        ? modeForConstraintRow(c, ch, role, tweakConstraintMode) === "hard"
        : candidateIndices.some((i) => modeForConstraintRow(c, ch, role, tweakConstraintMode, i) === "hard");
    });
    if (!rowHasHard) return;

    candidateIndices.forEach((i) => {
      let zSq = 0;
      let tieSq = 0;
      let used = false;
      channels.forEach((ch) => {
        const c = constraintSets.channels[ch];
        if (!c || modeForConstraintRow(c, ch, role, tweakConstraintMode, i) !== "hard") return;
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
          const excess = Math.max(0, dHue - Math.max(w.radius, 0));
          zSq += Math.pow(excess / sigma, 2);
          tieSq += Math.pow(dHue / sigma, 2);
        } else {
          const u = clamp(row[ch], 0, 1);
          if (!Number.isFinite(u)) return;
          const sigma = Math.max(w.radius / 1.96, 1e-3);
          const min = Number.isFinite(w.min) ? w.min : Math.max(0, w.center - w.radius);
          const max = Number.isFinite(w.max) ? w.max : Math.min(1, w.center + w.radius);
          const excess = u < min ? min - u : u > max ? u - max : 0;
          const dLin = Math.abs(u - w.center);
          zSq += Math.pow(excess / sigma, 2);
          tieSq += Math.pow(dLin / sigma, 2);
        }
      });
      if (used && (zSq < bestZSq || (Math.abs(zSq - bestZSq) <= 1e-12 && tieSq < bestTieSq))) {
        bestZSq = zSq;
        bestTieSq = tieSq;
        bestIndex = i;
      }
    });

    if (bestIndex == null) return;

    channels.forEach((ch) => {
      const c = constraintSets.channels[ch];
      if (!c || modeForConstraintRow(c, ch, role, tweakConstraintMode, bestIndex) !== "hard") return;
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

function shouldSkipGlobalConstraintsForRow(rowRole, individualSets, globalSets, tweakConstraintMode = {}) {
  if (rowRole?.kind !== "tweak" || !Number.isFinite(rowRole.pointIndex)) return false;
  if (!individualSets?.channels || !globalSets?.channels) return false;
  const channels = Object.keys(globalSets.channels);
  let hasSharedHardConstraint = false;
  const globalPointCount = channels.reduce((count, ch) => {
    const c = globalSets.channels[ch];
    return Array.isArray(c?.pointWindows) ? Math.max(count, c.pointWindows.length) : count;
  }, 0);
  if (!globalPointCount) return false;
  const compatibleGlobalIndex = (globalIdx) => channels.every((ch) => {
    const globalChannel = globalSets.channels[ch];
    const individualChannel = individualSets.channels[ch];
    if (!globalChannel || !individualChannel) return true;
    if (modeForConstraintRow(globalChannel, ch, null, tweakConstraintMode, globalIdx) !== "hard") return true;
    if (modeForConstraintRow(individualChannel, ch, rowRole, tweakConstraintMode, rowRole.pointIndex) !== "hard") return true;
    const globalWindows = globalChannel.pointWindows;
    const individualWindows = individualChannel.pointWindows;
    if (!Array.isArray(globalWindows) || !globalWindows.length || !Array.isArray(individualWindows) || !individualWindows.length) return true;
    const globalWindow = globalWindows[globalIdx % globalWindows.length];
    const individualWindow = individualWindows[Math.floor(rowRole.pointIndex) % individualWindows.length];
    if (!globalWindow || !individualWindow) return true;
    hasSharedHardConstraint = true;
    return pointWindowsOverlap(globalChannel, globalWindow, individualChannel, individualWindow);
  });
  for (let i = 0; i < globalPointCount; i++) {
    if (compatibleGlobalIndex(i)) return false;
  }
  return hasSharedHardConstraint;
}

function pointWindowsOverlap(globalChannel, globalWindow, individualChannel, individualWindow) {
  if (globalChannel.type === "hue" || individualChannel.type === "hue") {
    const gCenter = Number.isFinite(globalWindow.center) ? globalWindow.center : 0;
    const iCenter = Number.isFinite(individualWindow.center) ? individualWindow.center : 0;
    const gRadius = Math.max(Number.isFinite(globalWindow.radius) ? globalWindow.radius : 0, 0);
    const iRadius = Math.max(Number.isFinite(individualWindow.radius) ? individualWindow.radius : 0, 0);
    return circularDistance(gCenter, iCenter) <= gRadius + iRadius + 1e-10;
  }
  const gMin = Number.isFinite(globalWindow.min) ? globalWindow.min : Math.max(0, globalWindow.center - globalWindow.radius);
  const gMax = Number.isFinite(globalWindow.max) ? globalWindow.max : Math.min(1, globalWindow.center + globalWindow.radius);
  const iMin = Number.isFinite(individualWindow.min) ? individualWindow.min : Math.max(0, individualWindow.center - individualWindow.radius);
  const iMax = Number.isFinite(individualWindow.max) ? individualWindow.max : Math.min(1, individualWindow.center + individualWindow.radius);
  return Math.max(gMin, iMin) <= Math.min(gMax, iMax) + 1e-10;
}

function constraintPenaltyForRow(row, idx, zRow, constraintSets, topology, rowRole = null, tweakConstraintMode = {}) {
  if (!constraintSets || !constraintSets.channels) return { penalty: 0 };
  if (rowRole?.skipConstraints) return { penalty: 0 };
  const channels = Object.keys(constraintSets.channels);
  let penalty = 0;

  // For discontiguous mode, compute combined penalty based on distance to nearest point window
  // (not independent per-channel checks which would allow invalid cross-combinations)
  if (topology === "discontiguous" || topology === "custom") {
    const pointWindowsByChannel = {};
    let numPoints = 0;
    channels.forEach((ch) => {
      const c = constraintSets.channels[ch];
      if (!c) return;
      if (Array.isArray(c.pointWindows) && c.pointWindows.length > 0) {
        pointWindowsByChannel[ch] = c.pointWindows;
        numPoints = Math.max(numPoints, c.pointWindows.length);
      }
    });

    if (numPoints > 0) {
      // For each point, compute combined z² across all channels. Hard windows
      // only penalize violations outside the window; soft windows penalize
      // distance from the center.
      let minZSq = Infinity;
      const candidateIndices = candidatePointIndicesForConstraintRole(rowRole, numPoints);
      candidateIndices.forEach((i) => {
        let zSq = 0;
        let hardInCandidate = false;
        channels.forEach((ch) => {
          const c = constraintSets.channels[ch];
          if (!c) return;
          const mode = modeForConstraintRow(c, ch, rowRole, tweakConstraintMode, i);
          if (mode !== "hard" && mode !== "soft") return;
          if (mode === "hard") hardInCandidate = true;
          const windows = pointWindowsByChannel[ch];
          const w = windows ? windows[i % windows.length] : null;
          if (!w) return;

          if (c.type === "hue") {
            const phi = row.__huePhi;
            if (!Number.isFinite(phi)) return;
            const dHue = circularDistance(phi, w.center);
            const sigma = Math.max(w.radius / 1.96, 1e-3);
            const excess = mode === "hard" ? Math.max(0, dHue - Math.max(w.radius, 0)) : dHue;
            zSq += Math.pow(excess / sigma, 2);
          } else {
            const u = clamp(row[ch], 0, 1);
            if (!Number.isFinite(u)) return;
            const sigma = Math.max(w.radius / 1.96, 1e-3);
            if (mode === "hard") {
              const min = Number.isFinite(w.min) ? w.min : Math.max(0, w.center - w.radius);
              const max = Number.isFinite(w.max) ? w.max : Math.min(1, w.center + w.radius);
              const excess = u < min ? min - u : u > max ? u - max : 0;
              zSq += Math.pow(excess / sigma, 2);
            } else {
              const dLin = Math.abs(u - w.center);
              zSq += Math.pow(dLin / sigma, 2);
            }
          }
        });
        const weightedZSq = (hardInCandidate ? HARD_SET_PENALTY_MULT : 1) * zSq;
        if (weightedZSq < minZSq) minZSq = weightedZSq;
      });

      if (Number.isFinite(minZSq) && minZSq > 0) {
        penalty += CONSTRAINT_PENALTY_WEIGHT * minZSq;
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
