import { channelOrder } from "../core/colorSpaces.js";

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

export function constraintModeForSpace(ui, space) {
  const channels = channelOrder[space] || [];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1];
  const first = channels[0];
  const third = channels[2];
  const out = {};
  if (first && ui.modeH) out[first] = ui.modeH.value || "hard";
  if (scChannel && ui.modeSC) out[scChannel] = ui.modeSC.value || "hard";
  if (third && ui.modeL) out[third] = ui.modeL.value || "hard";
  return out;
}

export function readConstraintConfig(ui, space) {
  return {
    constrain: true,
    widths: getWidths(ui),
    constraintTopology: ui.constraintTopology?.value || "contiguous",
    aestheticMode: ui.aestheticMode?.value || "none",
    constraintMode: constraintModeForSpace(ui, space),
  };
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
  return {
    colorSpace: ui.colorSpace.value,
    colorwheelSpace: ui.colorwheelSpace.value,
    gamutPreset: ui.gamutPreset?.value || "srgb",
    clipToGamutOpt: ui.clipGamutOpt?.checked || false,
    cvdModel: ui.cvdModel?.value || "legacy",
    distanceMetric: ui.distanceMetric?.value || "de2000",
    meanType: ui.meanType?.value || "harmonic",
    meanP: ui.meanP ? parseFloat(ui.meanP.value) : undefined,
    nColsToAdd: Math.max(1, parseInt(ui.colorsToAdd.value, 10) || 1),
    nOptimRuns: state.lastRuns,
    nmIterations: Math.max(10, parseInt(ui.nmIters.value, 10) || 260),
    seed,
    constraintTopology: ui.constraintTopology?.value || "contiguous",
    aestheticMode: ui.aestheticMode?.value || "none",
    constraintMode,
    constrain: true,
    widths,
    colorblindSafe: true,
    colorblindWeights,
  };
}
