import { channelOrder } from "../core/colorSpaces.js";
import { sanitizeExplicitBounds } from "../core/constraintBounds.js";

export function parsePalette(raw) {
  const matches = raw.match(/#[0-9a-fA-F]{6}/g) || [];
  return matches.map((h) => h.toUpperCase());
}

export function getWidths(ui) {
  const h = parseFloat(ui.wH.value);
  const sc = parseFloat(ui.wSC.value);
  const l = parseFloat(ui.wL.value);
  return [h, sc, l].map((v) => (isFinite(v) ? v : 0));
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function readModeValue(el) {
  if (!el) return "hard";
  if (el.type === "checkbox") return el.checked ? "soft" : "hard";
  return el.value || "hard";
}

function inputCountForSpace(ui, space, state) {
  return state?.rawInputOverride?.space === space && Array.isArray(state.rawInputOverride.values)
    ? state.rawInputOverride.values.length
    : parsePalette(ui.paletteInput.value).length;
}

function activeTweakIndicesForCount(state, count) {
  if (!Array.isArray(state?.tweakInputIndices) || !count) return [];
  return state.tweakInputIndices
    .map((idx) => Math.floor(idx))
    .filter((idx, pos, arr) => idx >= 0 && idx < count && arr.indexOf(idx) === pos);
}

function perInputWidthsForSpace(ui, space, state) {
  const topology = ui.constraintTopology?.value || "contiguous";
  const perInput = state?.perInputConstraints;
  if (topology !== "discontiguous" || !perInput?.enabled) return null;
  const channels = channelOrder[space] || [];
  const first = channels[0];
  const third = channels[2];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1];
  const count = inputCountForSpace(ui, space, state);
  if (!count) return null;
  const defaults = {
    h: clamp01(parseFloat(ui.wH.value)),
    sc: clamp01(parseFloat(ui.wSC.value)),
    l: clamp01(parseFloat(ui.wL.value)),
  };
  const activeTweaks = new Set(activeTweakIndicesForCount(state, count));
  const autoTweakOnly = Boolean(perInput.autoEnabledForTweaks);
  const widths = perInput.widths || {};
  const buildSlot = (slot, fallback) => {
    const arr = Array.isArray(widths[slot]) ? widths[slot] : [];
    return Array.from({ length: count }, (_, i) => {
      if (autoTweakOnly && !activeTweaks.has(i)) return 0;
      const v = arr[i];
      return Number.isFinite(v) ? clamp01(v) : fallback;
    });
  };
  const out = {};
  if (first) out[first] = buildSlot("h", defaults.h);
  if (scChannel) out[scChannel] = buildSlot("sc", defaults.sc);
  if (third) out[third] = buildSlot("l", defaults.l);
  return out;
}

function perInputModesForSpace(ui, space, state) {
  const topology = ui.constraintTopology?.value || "contiguous";
  const perInput = state?.perInputConstraints;
  if (topology !== "discontiguous" || !perInput?.enabled) return null;
  const count = inputCountForSpace(ui, space, state);
  if (!count) return null;
  const modes = Array.isArray(perInput.modes) ? perInput.modes : [];
  const activeTweaks = new Set(activeTweakIndicesForCount(state, count));
  const autoTweakOnly = Boolean(perInput.autoEnabledForTweaks);
  return Array.from({ length: count }, (_, i) => {
    if (autoTweakOnly && !activeTweaks.has(i)) return "hard";
    return modes[i] === "soft" ? "soft" : "hard";
  });
}

function individualConstraintsReplaceGlobal(ui, state) {
  const topology = ui.constraintTopology?.value || "contiguous";
  const perInput = state?.perInputConstraints;
  return topology === "discontiguous" && Boolean(perInput?.enabled) && !perInput.autoEnabledForTweaks;
}

function globalConstraintExcludeInputIndicesForSpace(ui, space, state) {
  const topology = ui.constraintTopology?.value || "contiguous";
  const perInput = state?.perInputConstraints;
  if (topology !== "discontiguous" || !perInput?.enabled || !perInput.autoEnabledForTweaks) return [];
  return activeTweakIndicesForCount(state, inputCountForSpace(ui, space, state));
}

function customWidthsForSpace(ui, space, state) {
  const topology = ui.constraintTopology?.value || "contiguous";
  if (topology !== "custom") return null;
  const custom = state?.customConstraints;
  if (!custom?.values?.length || custom.space !== space) return null;
  const channels = channelOrder[space] || [];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1];
  const defaults = {};
  if (channels[0]) defaults[channels[0]] = clamp01(parseFloat(ui.wH.value));
  if (scChannel) defaults[scChannel] = clamp01(parseFloat(ui.wSC.value));
  if (channels[2]) defaults[channels[2]] = clamp01(parseFloat(ui.wL.value));
  const widths = custom.widths || {};
  const count = custom.values.length;
  const out = {};
  channels.forEach((ch) => {
    const arr = Array.isArray(widths[ch]) ? widths[ch] : [];
    out[ch] = Array.from({ length: count }, (_, i) => {
      const v = arr[i];
      return Number.isFinite(v) ? clamp01(v) : (defaults[ch] ?? 0);
    });
  });
  return out;
}

export function constraintModeForSpace(ui, space) {
  const channels = channelOrder[space] || [];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1];
  const first = channels[0];
  const third = channels[2];
  const out = {};
  if (first && ui.modeH) out[first] = readModeValue(ui.modeH);
  if (scChannel && ui.modeSC) out[scChannel] = readModeValue(ui.modeSC);
  if (third && ui.modeL) out[third] = readModeValue(ui.modeL);
  return out;
}

function defaultSoftConstraintModeForSpace(space) {
  const out = {};
  (channelOrder[space] || []).forEach((ch) => {
    out[ch] = "soft";
  });
  return out;
}

export function readConstraintConfig(ui, space, state) {
  const topology = ui.constraintTopology?.value || "contiguous";
  const explicitBounds =
    topology !== "custom" && state?.sliderConstraintBounds?.space === space
      ? sanitizeExplicitBounds(state.sliderConstraintBounds.bounds, channelOrder[space] || [])
      : null;
  const config = {
    constrain: true,
    widths: getWidths(ui),
    constraintTopology: topology,
    aestheticMode: ui.aestheticMode?.value || "none",
    constraintMode: constraintModeForSpace(ui, space),
    tweakConstraintMode: defaultSoftConstraintModeForSpace(space),
    individualConstraintsReplaceGlobal: individualConstraintsReplaceGlobal(ui, state),
    globalConstraintExcludeInputIndices: globalConstraintExcludeInputIndicesForSpace(ui, space, state),
    explicitBounds,
    perInputWidths: customWidthsForSpace(ui, space, state) || perInputWidthsForSpace(ui, space, state),
    perInputModes: perInputModesForSpace(ui, space, state),
    customConstraintPoints:
      state?.customConstraints?.space === space && Array.isArray(state.customConstraints.values)
        ? state.customConstraints.values.map((v) => ({ ...v }))
        : null,
  };
  return config;
}

export function readConfig(ui, state) {
  const rawSeed = (ui.seedInput?.value || "").trim().toLowerCase();
  let seed = null;
  if (rawSeed && rawSeed !== "random") {
    const parsed = parseInt(rawSeed, 10);
    seed = Number.isFinite(parsed) ? parsed : null;
  }
  const colorblindWeights = {
    none: (parseFloat(ui.wNone.value) || 0) / 100,
    deutan: (parseFloat(ui.wDeutan.value) || 0) / 100,
    protan: (parseFloat(ui.wProtan.value) || 0) / 100,
    tritan: (parseFloat(ui.wTritan.value) || 0) / 100,
  };
  state.lastRuns = Math.max(1, parseInt(ui.optimRuns.value, 10) || 20);
  const widths = getWidths(ui);
  const constraintMode = constraintModeForSpace(ui, ui.colorSpace.value);
  const explicitBounds =
    (ui.constraintTopology?.value || "contiguous") !== "custom" && state?.sliderConstraintBounds?.space === ui.colorSpace.value
      ? sanitizeExplicitBounds(state.sliderConstraintBounds.bounds, channelOrder[ui.colorSpace.value] || [])
      : null;
  const nmIterations = Math.max(10, parseInt(ui.nmIters.value, 10) || 260);
  const trajectorySteps = Math.max(1, Math.min(nmIterations, parseInt(ui.pathSteps?.value, 10) || 48));
  const inputCount = parsePalette(ui.paletteInput.value).length;
  const tweakInputIndices = activeTweakIndicesForCount(state, inputCount);
  return {
    colorSpace: ui.colorSpace.value,
    colorwheelSpace: ui.colorwheelSpace.value,
    gamutPreset: ui.gamutPreset?.value || "srgb",
    clipToGamutOpt: ui.clipGamutOpt?.checked || false,
    cvdModel: ui.cvdModel?.value || "legacy",
    distanceMetric: ui.distanceMetric?.value || "de2000",
    meanType: ui.meanType?.value || "harmonic",
    meanP: ui.meanP ? parseFloat(ui.meanP.value) : undefined,
    nColsToAdd: Math.max(0, parseInt(ui.colorsToAdd.value, 10) || 0),
    tweakInputIndices,
    nOptimRuns: state.lastRuns,
    nmIterations,
    trajectorySteps,
    seed,
    constraintTopology: ui.constraintTopology?.value || "contiguous",
    aestheticMode: ui.aestheticMode?.value || "none",
    constraintMode,
    tweakConstraintMode: defaultSoftConstraintModeForSpace(ui.colorSpace.value),
    individualConstraintsReplaceGlobal: individualConstraintsReplaceGlobal(ui, state),
    globalConstraintExcludeInputIndices: globalConstraintExcludeInputIndicesForSpace(ui, ui.colorSpace.value, state),
    explicitBounds,
    perInputWidths: customWidthsForSpace(ui, ui.colorSpace.value, state) || perInputWidthsForSpace(ui, ui.colorSpace.value, state),
    perInputModes: perInputModesForSpace(ui, ui.colorSpace.value, state),
    customConstraintPoints:
      state?.customConstraints?.space === ui.colorSpace.value && Array.isArray(state.customConstraints.values)
        ? state.customConstraints.values.map((v) => ({ ...v }))
        : null,
    constrain: true,
    widths,
    colorblindSafe: true,
    colorblindWeights,
  };
}
