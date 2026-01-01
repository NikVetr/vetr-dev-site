import { defaultPalette, plotOrder } from "./config.js";
import { channelOrder, convertColorValues, decodeColor } from "./core/colorSpaces.js";
import { contrastColor, deltaE2000 } from "./core/metrics.js";
import { discriminabilityLabel, metricJnd } from "./core/resolvability.js";
import { defaultPForMean } from "./core/means.js";
import { computeBoundsFromCurrent, computeBoundsFromRawValues } from "./optimizer/bounds.js";
import { optimizePalette } from "./optimizer/optimizePalette.js";
import { getUIRefs } from "./ui/domRefs.js";
import { getWidths, parsePalette, readConfig, readConstraintConfig } from "./ui/configRead.js";
import { copyResults, setResults } from "./ui/resultsBox.js";
import { createInitialState } from "./ui/state.js";
import { showError, setStatus, setStatusState } from "./ui/status.js";
import { drawStatusGraph, drawStatusMini } from "./ui/statusGraph.js";
import { createPanels, refreshSwatches, updateChannelHeadings } from "./ui/panels.js";
import { attachVisualizationInteractions } from "./ui/interactions.js";
import { createHistoryManager } from "./ui/history.js";
import { paletteGroups } from "./palettes.js";

const state = createInitialState();
let ui = null;
let history = null;
let verboseLogs = [];
let verboseRows = [];
let verboseTruncInfo = null;
let verboseBestScore = -Infinity;
let verboseBestRun = null;
const VERBOSE_MAX_ROWS = 4000;
let verboseSortKey = "run";
let verboseSortDir = "asc";
const verboseGroupState = {
  end: false,
  start: false,
  diff: false,
};
const cvdScores = {
  none: 0,
  deutan: 0,
  protan: 0,
  tritan: 0,
};

let uniquenessValue = 0;
let lastOptSpace = null;

const DEFAULT_L_WIDTH = 0.65;
const DISC_STATES = ["none", "deutan", "protan", "tritan"];

function currentVizOpts() {
  return {
    clipToGamut: ui?.clipGamut ? ui.clipGamut.checked : false,
    gamutPreset: ui?.gamutPreset?.value || "srgb",
    gamutMode: ui?.gamutMode?.value || "auto",
    cvdModel: ui?.cvdModel?.value || "legacy",
  };
}

function captureHistorySnapshot() {
  return {
    ui: {
      paletteInput: ui?.paletteInput?.value || "",
      seedInput: ui?.seedInput?.value || "",
      colorSpace: ui?.colorSpace?.value || "oklab",
      colorwheelSpace: ui?.colorwheelSpace?.value || "oklab",
      gamutMode: ui?.gamutMode?.value || "auto",
      gamutPreset: ui?.gamutPreset?.value || "srgb",
      clipGamut: Boolean(ui?.clipGamut?.checked),
      clipGamutOpt: Boolean(ui?.clipGamutOpt?.checked),
      cvdModel: ui?.cvdModel?.value || "legacy",
      distanceMetric: ui?.distanceMetric?.value || "de2000",
      meanType: ui?.meanType?.value || "harmonic",
      meanP: ui?.meanP?.value || "",
      colorsToAdd: ui?.colorsToAdd?.value || "",
      optimRuns: ui?.optimRuns?.value || "",
      nmIters: ui?.nmIters?.value || "",
      constraintTopology: ui?.constraintTopology?.value || "contiguous",
      aestheticMode: ui?.aestheticMode?.value || "none",
      wH: ui?.wH?.value || "",
      wSC: ui?.wSC?.value || "",
      wL: ui?.wL?.value || "",
      modeH: readModeValue(ui?.modeH),
      modeSC: readModeValue(ui?.modeSC),
      modeL: readModeValue(ui?.modeL),
      wNone: ui?.wNone?.value || "",
      wDeutan: ui?.wDeutan?.value || "",
      wProtan: ui?.wProtan?.value || "",
      wTritan: ui?.wTritan?.value || "",
      bgColor: ui?.bgColor?.value || "#ffffff",
      bgEnabled: Boolean(ui?.bgEnabled?.checked),
      syncSpaces: Boolean(ui?.syncSpaces?.checked),
      uniqueness: ui?.uniqueness?.value || "",
      formatQuotes: Boolean(ui?.formatQuotes?.checked),
      formatCommas: Boolean(ui?.formatCommas?.checked),
      formatLines: Boolean(ui?.formatLines?.checked),
      formatRC: Boolean(ui?.formatRC?.checked),
      formatPyList: Boolean(ui?.formatPyList?.checked),
      formatIncludeInputs: Boolean(ui?.formatIncludeInputs?.checked),
      verboseToggle: Boolean(ui?.verboseToggle?.checked),
    },
    state: {
      newColors: state.newColors ? [...state.newColors] : [],
      rawNewColors: state.rawNewColors ? state.rawNewColors.map((v) => ({ ...v })) : [],
      newRawSpace: state.newRawSpace ?? null,
      rawInputOverride: state.rawInputOverride
        ? { space: state.rawInputOverride.space, values: state.rawInputOverride.values.map((v) => ({ ...v })) }
        : null,
      keepInputOverride: Boolean(state.keepInputOverride),
      mutedInput: Boolean(state.mutedInput),
      selectedResultIdx: state.selectedResultIdx ?? null,
      customConstraints: state.customConstraints
        ? {
          space: state.customConstraints.space,
          values: state.customConstraints.values.map((v) => ({ ...v })),
          widths: cloneCustomWidths(state.customConstraints.widths),
        }
        : null,
      perInputConstraints: state.perInputConstraints
        ? {
          enabled: Boolean(state.perInputConstraints.enabled),
          sync: { ...state.perInputConstraints.sync },
          widths: {
            h: Array.isArray(state.perInputConstraints.widths?.h) ? [...state.perInputConstraints.widths.h] : [],
            sc: Array.isArray(state.perInputConstraints.widths?.sc) ? [...state.perInputConstraints.widths.sc] : [],
            l: Array.isArray(state.perInputConstraints.widths?.l) ? [...state.perInputConstraints.widths.l] : [],
          },
        }
        : null,
    },
  };
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot || !ui) return;
  const snapUi = snapshot.ui || {};
  const snapState = snapshot.state || {};

  if (ui.paletteInput) ui.paletteInput.value = snapUi.paletteInput || "";
  if (ui.seedInput) ui.seedInput.value = snapUi.seedInput || "";
  if (ui.colorSpace) ui.colorSpace.value = snapUi.colorSpace || "oklab";
  if (ui.colorwheelSpace) ui.colorwheelSpace.value = snapUi.colorwheelSpace || ui.colorSpace.value;
  if (ui.gamutMode) ui.gamutMode.value = snapUi.gamutMode || "auto";
  if (ui.gamutPreset) ui.gamutPreset.value = snapUi.gamutPreset || "srgb";
  if (ui.clipGamut) ui.clipGamut.checked = Boolean(snapUi.clipGamut);
  if (ui.clipGamutOpt) ui.clipGamutOpt.checked = Boolean(snapUi.clipGamutOpt);
  if (ui.cvdModel) ui.cvdModel.value = snapUi.cvdModel || "legacy";
  if (ui.distanceMetric) ui.distanceMetric.value = snapUi.distanceMetric || "de2000";
  if (ui.meanType) ui.meanType.value = snapUi.meanType || "harmonic";
  if (ui.meanP) ui.meanP.value = snapUi.meanP || ui.meanP.value;
  if (ui.colorsToAdd) ui.colorsToAdd.value = snapUi.colorsToAdd || ui.colorsToAdd.value;
  if (ui.optimRuns) ui.optimRuns.value = snapUi.optimRuns || ui.optimRuns.value;
  if (ui.nmIters) ui.nmIters.value = snapUi.nmIters || ui.nmIters.value;
  if (ui.constraintTopology) ui.constraintTopology.value = snapUi.constraintTopology || "contiguous";
  if (ui.aestheticMode) ui.aestheticMode.value = snapUi.aestheticMode || "none";
  if (ui.wH) ui.wH.value = snapUi.wH || ui.wH.value;
  if (ui.wSC) ui.wSC.value = snapUi.wSC || ui.wSC.value;
  if (ui.wL) ui.wL.value = snapUi.wL || ui.wL.value;
  setModeValue(ui.modeH, snapUi.modeH || readModeValue(ui.modeH));
  setModeValue(ui.modeSC, snapUi.modeSC || readModeValue(ui.modeSC));
  setModeValue(ui.modeL, snapUi.modeL || readModeValue(ui.modeL));
  if (ui.wNone) ui.wNone.value = snapUi.wNone || ui.wNone.value;
  if (ui.wDeutan) ui.wDeutan.value = snapUi.wDeutan || ui.wDeutan.value;
  if (ui.wProtan) ui.wProtan.value = snapUi.wProtan || ui.wProtan.value;
  if (ui.wTritan) ui.wTritan.value = snapUi.wTritan || ui.wTritan.value;
  if (ui.bgColor) ui.bgColor.value = snapUi.bgColor || ui.bgColor.value;
  if (ui.bgEnabled) ui.bgEnabled.checked = Boolean(snapUi.bgEnabled);
  if (ui.syncSpaces) ui.syncSpaces.checked = Boolean(snapUi.syncSpaces);
  if (ui.uniqueness) ui.uniqueness.value = snapUi.uniqueness || ui.uniqueness.value;
  if (ui.formatQuotes) ui.formatQuotes.checked = Boolean(snapUi.formatQuotes);
  if (ui.formatCommas) ui.formatCommas.checked = Boolean(snapUi.formatCommas);
  if (ui.formatLines) ui.formatLines.checked = Boolean(snapUi.formatLines);
  if (ui.formatRC) ui.formatRC.checked = Boolean(snapUi.formatRC);
  if (ui.formatPyList) ui.formatPyList.checked = Boolean(snapUi.formatPyList);
  if (ui.formatIncludeInputs) ui.formatIncludeInputs.checked = Boolean(snapUi.formatIncludeInputs);
  if (ui.verboseToggle) ui.verboseToggle.checked = Boolean(snapUi.verboseToggle);

  state.newColors = snapState.newColors ? [...snapState.newColors] : [];
  state.rawNewColors = snapState.rawNewColors ? snapState.rawNewColors.map((v) => ({ ...v })) : [];
  state.newRawSpace = snapState.newRawSpace ?? null;
  state.rawInputOverride = snapState.rawInputOverride
    ? { space: snapState.rawInputOverride.space, values: snapState.rawInputOverride.values.map((v) => ({ ...v })) }
    : null;
  state.keepInputOverride = Boolean(snapState.keepInputOverride);
  state.mutedInput = Boolean(snapState.mutedInput);
  state.customConstraints = snapState.customConstraints
    ? {
      space: snapState.customConstraints.space,
      values: snapState.customConstraints.values.map((v) => ({ ...v })),
      widths: cloneCustomWidths(snapState.customConstraints.widths),
    }
    : null;
  state.perInputConstraints = snapState.perInputConstraints
    ? {
      enabled: Boolean(snapState.perInputConstraints.enabled),
      sync: { ...snapState.perInputConstraints.sync },
      widths: {
        h: Array.isArray(snapState.perInputConstraints.widths?.h) ? [...snapState.perInputConstraints.widths.h] : [],
        sc: Array.isArray(snapState.perInputConstraints.widths?.sc) ? [...snapState.perInputConstraints.widths.sc] : [],
        l: Array.isArray(snapState.perInputConstraints.widths?.l) ? [...snapState.perInputConstraints.widths.l] : [],
      },
    }
    : {
      enabled: false,
      sync: { h: false, sc: false, l: false },
      widths: { h: [], sc: [], l: [] },
    };

  if (ui.rawInputValues) {
    ui.rawInputValues.value = state.rawInputOverride ? JSON.stringify(state.rawInputOverride) : "";
  }

  if (ui.syncSpaces?.checked) {
    ui.colorwheelSpace.value = ui.colorSpace.value;
  }
  lastOptSpace = ui.colorSpace.value;

  updateWidthLabels();
  syncCustomConstraintsToSpace(ui.colorSpace.value);
  ensurePerInputConstraintState();
  updateConstraintTopologyUI();
  updateWidthChips();
  updateMeanControls(false);
  updateClipWarning();
  updateBgControls();
  togglePlaceholder();
  updatePaletteHighlight();
  updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);

  uniquenessValue = clampNum(parseFloat(ui.uniqueness?.value) || 0, 0, 100);
  if (ui.uniquenessVal) ui.uniquenessVal.textContent = `${Math.round(uniquenessValue)}%`;
  if (state.runRankingAll?.length) {
    applyUniquenessFilter();
    updateResultNavigator();
  }

  state.bounds = computeInputBounds(ui.colorSpace.value);
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
  enforceWrapper();
  drawStatusMini(state, ui, currentVizOpts());

  if (ui.verbosePanel) ui.verbosePanel.style.display = ui.verboseToggle?.checked ? "block" : "none";
}

function updateUndoRedoButtons() {
  if (!ui?.undoBtn || !ui?.redoBtn || !history) return;
  const disabled = state.running;
  ui.undoBtn.disabled = disabled || !history.canUndo();
  ui.redoBtn.disabled = disabled || !history.canRedo();
}

function weightedAggregateDistances(valuesByState, weights, kind, p, eps = 1e-9) {
  const entries = [];
  DISC_STATES.forEach((state) => {
    const v = valuesByState?.[state];
    if (!Number.isFinite(v)) return;
    const w = Number.isFinite(weights?.[state]) ? weights[state] : 0;
    entries.push({ v, w });
  });
  if (!entries.length) return NaN;

  let sumW = entries.reduce((acc, e) => acc + e.w, 0);
  const norm = sumW > 0 ? entries.map((e) => e.w / sumW) : entries.map(() => 1 / entries.length);
  const vals = entries.map((e) => Math.max(e.v, eps));
  const meanKind = String(kind || "harmonic").toLowerCase();

  if (meanKind === "minimum" || meanKind === "min") {
    return Math.min(...entries.map((e) => e.v));
  }

  if (meanKind === "arithmetic" || meanKind === "mean") {
    return vals.reduce((acc, v, i) => acc + v * norm[i], 0);
  }

  if (meanKind === "quadratic" || meanKind === "rms") {
    const m2 = vals.reduce((acc, v, i) => acc + v * v * norm[i], 0);
    return Math.sqrt(m2);
  }

  if (meanKind === "geometric") {
    const mlog = vals.reduce((acc, v, i) => acc + Math.log(v) * norm[i], 0);
    return Math.exp(mlog);
  }

  if (meanKind === "harmonic") {
    const inv = vals.reduce((acc, v, i) => acc + norm[i] / v, 0);
    return inv > 0 ? 1 / inv : 0;
  }

  const pp = Number.isFinite(p) ? p : defaultPForMean(meanKind);

  if (meanKind === "power") {
    if (Math.abs(pp) < 1e-12) {
      const mlog = vals.reduce((acc, v, i) => acc + Math.log(v) * norm[i], 0);
      return Math.exp(mlog);
    }
    const mp = vals.reduce((acc, v, i) => acc + Math.pow(v, pp) * norm[i], 0);
    return Math.pow(mp, 1 / pp);
  }

  if (meanKind === "lehmer") {
    const num = vals.reduce((acc, v, i) => acc + Math.pow(v, pp + 1) * norm[i], 0);
    const den = vals.reduce((acc, v, i) => acc + Math.pow(v, pp) * norm[i], 0);
    return den > 0 ? num / den : 0;
  }

  return vals.reduce((acc, v, i) => acc + v * norm[i], 0);
}

document.addEventListener("DOMContentLoaded", () => {
  ui = getUIRefs();
  createPanels(ui, plotOrder);
  setDefaultValues();
  buildPaletteButtons();
  history = createHistoryManager({
    capture: captureHistorySnapshot,
    apply: applyHistorySnapshot,
    onUpdate: updateUndoRedoButtons,
  });
  state.history = history;
  attachEventListeners();
  attachVisualizationInteractions(ui, state, plotOrder);
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
  updateResultNavigator();
  history.push(captureHistorySnapshot());
  updateUndoRedoButtons();
});

function setDefaultValues() {
  ui.paletteInput.value = "";
  ui.paletteInput.classList.add("muted-input");
  state.mutedInput = true;
  ui.colorSpace.value = "oklab";
  ui.colorwheelSpace.value = "oklab";
  if (ui.seedInput) ui.seedInput.value = "random";
  if (ui.gamutMode) ui.gamutMode.value = "auto";
  if (ui.gamutPreset) ui.gamutPreset.value = "srgb";
  if (ui.cvdModel) ui.cvdModel.value = "machado2009";
  if (ui.distanceMetric) ui.distanceMetric.value = "de2000";
  if (ui.meanType) ui.meanType.value = "harmonic";
  if (ui.meanP) ui.meanP.value = "-2";
  if (ui.constraintTopology) ui.constraintTopology.value = "contiguous";
  if (ui.aestheticMode) ui.aestheticMode.value = "none";
  if (ui.clipGamut) ui.clipGamut.checked = false;
  if (ui.clipGamutOpt) ui.clipGamutOpt.checked = true;
  if (ui.syncSpaces) ui.syncSpaces.checked = true;
  ui.colorsToAdd.value = "3";
  ui.optimRuns.value = "100";
  ui.nmIters.value = "260";
  applyConstraintWidthDefaults(ui.colorSpace.value);
  lastOptSpace = ui.colorSpace.value;
  setModeValue(ui.modeH, "hard");
  setModeValue(ui.modeSC, "hard");
  setModeValue(ui.modeL, "hard");
  ui.wNone.value = "50.0";
  ui.wDeutan.value = "40.0";
  ui.wProtan.value = "8.0";
  ui.wTritan.value = "2.0";
  if (ui.bgColor) ui.bgColor.value = "#ffffff";
  if (ui.bgEnabled) ui.bgEnabled.checked = true;
  ui.formatQuotes.checked = false;
  ui.formatCommas.checked = true;
  ui.formatLines.checked = false;
  ui.copyBtn.textContent = "Copy";
  if (ui.rawInputValues) ui.rawInputValues.value = "";
  verboseLogs = [];
  verboseRows = [];
  verboseBestScore = -Infinity;
  verboseBestRun = null;
  renderVerboseTable();
  updateWidthChips();
  normalizeAndUpdateWeights();
  updateWidthLabels();
  updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
  updateConstraintTopologyUI();
  updateClipWarning();
  updateMeanControls(true);
  if (ui.uniqueness) ui.uniqueness.value = "0";
  if (ui.uniquenessVal) ui.uniquenessVal.textContent = "0%";
  uniquenessValue = 0;
  state.lastRuns = Math.max(1, parseInt(ui.optimRuns.value, 10) || 20);
  state.newColors = [];
  state.rawCurrentColors = [];
  state.rawNewColors = [];
  state.rawBestColors = [];
  state.rawInputOverride = null;
  state.keepInputOverride = false;
  state.customConstraints = null;
  state.customConstraintSelection = null;
  state.perInputConstraints = {
    enabled: false,
    sync: { h: false, sc: false, l: false },
    widths: { h: [], sc: [], l: [] },
  };
  state.rawSpace = ui.colorSpace.value;
  state.newRawSpace = ui.colorSpace.value;
  setResults([], ui, state.currentColors);
  state.bestScores = [];
  state.nmTrails = [];
  state.bestColors = [];
  state.rawBestColors = [];
  state.bounds = computeInputBounds(ui.colorSpace.value);
  drawStatusGraph(state, ui);
  drawStatusMini(state, ui, currentVizOpts());
  setStatus("waiting to start…", 0, ui, state);
  setStatusState(ui, "Waiting to run");
  logVerbose("palette", "", ui.paletteInput.value.trim());
  togglePlaceholder();
  updateBgControls();
  updatePaletteHighlight();
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function cloneCustomWidths(widths) {
  if (!widths || typeof widths !== "object") return null;
  const out = {};
  Object.entries(widths).forEach(([key, arr]) => {
    if (Array.isArray(arr)) out[key] = [...arr];
  });
  return Object.keys(out).length ? out : null;
}

function readModeValue(el) {
  if (!el) return "hard";
  if (el.type === "checkbox") return el.checked ? "soft" : "hard";
  return el.value || "hard";
}

function setModeValue(el, mode) {
  if (!el) return;
  if (el.type === "checkbox") {
    el.checked = mode === "soft";
    return;
  }
  el.value = mode;
}

function parseWidthVal(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? clampNum(n, 0, 1) : 0;
}

function channelSlotsForSpace(space) {
  const channels = channelOrder[space] || [];
  const first = channels[0] || "h";
  const third = channels[2] || "l";
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1] || "s";
  return { first, scChannel, third };
}

function defaultWidthForChannel(ch) {
  return ch === "l" ? DEFAULT_L_WIDTH : 0;
}

function constraintConfigForSpace(space) {
  return readConstraintConfig(ui, space, state);
}

function computeInputBounds(space) {
  const config = constraintConfigForSpace(space);
  const topology = config.constraintTopology || "contiguous";
  if (topology === "custom" && config.customConstraintPoints?.length) {
    return computeBoundsFromRawValues(config.customConstraintPoints, space, config);
  }
  if (state.rawInputOverride?.space === space && state.rawInputOverride.values?.length) {
    return computeBoundsFromRawValues(state.rawInputOverride.values, space, config);
  }
  return computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), space, config);
}

function syncCustomConstraintsToSpace(space) {
  if (!state.customConstraints?.values?.length) return;
  if (state.customConstraints.space === space) return;
  const converted = state.customConstraints.values.map((v) => convertColorValues(v, state.customConstraints.space, space));
  state.customConstraints = { space, values: converted, widths: cloneCustomWidths(state.customConstraints.widths) };
}

function ensureCustomConstraintsInitialized() {
  if (state.customConstraints?.values?.length) return;
  const space = ui.colorSpace.value;
  let values = [];
  if (state.rawInputOverride?.space === space && Array.isArray(state.rawInputOverride.values)) {
    values = state.rawInputOverride.values.map((v) => ({ ...v }));
  } else {
    const palette = parsePalette(ui.paletteInput.value);
    values = palette.map((hex) => decodeColor(hex, space));
  }
  if (values.length) {
    state.customConstraints = { space, values };
  }
}

function perInputDefaults() {
  return {
    h: parseWidthVal(ui.wH.value),
    sc: parseWidthVal(ui.wSC.value),
    l: parseWidthVal(ui.wL.value),
  };
}

function ensurePerInputConstraintState() {
  if (!state.perInputConstraints) {
    state.perInputConstraints = { enabled: false, sync: { h: false, sc: false, l: false }, widths: { h: [], sc: [], l: [] } };
  }
  const per = state.perInputConstraints;
  per.sync = { h: false, sc: false, l: false };
  if (!per.widths) per.widths = { h: [], sc: [], l: [] };
  const count = parsePalette(ui.paletteInput.value).length;
  const defaults = perInputDefaults();
  ["h", "sc", "l"].forEach((slot) => {
    const arr = Array.isArray(per.widths[slot]) ? per.widths[slot] : [];
    const next = Array.from({ length: count }, (_, i) => {
      const v = arr[i];
      return Number.isFinite(v) ? clampNum(v, 0, 1) : defaults[slot];
    });
    per.widths[slot] = next;
  });
}

function renderPerInputConstraintUI() {
  if (!ui.constraintIndividualRow || !ui.constraintIndividualPanel || !ui.constraintIndividualList) return;
  const topology = ui.constraintTopology?.value || "contiguous";
  const supportsPerInput = topology === "discontiguous";
  const isExpanded = Boolean(state.perInputConstraints?.enabled) && supportsPerInput;
  ui.constraintIndividualRow.hidden = false;
  if (ui.constraintIndividualToggle) {
    ui.constraintIndividualToggle.setAttribute("aria-expanded", String(isExpanded));
    ui.constraintIndividualToggle.textContent = isExpanded ? "Hide per-color constraints" : "Per-color constraints";
  }
  ui.constraintIndividualPanel.hidden = !isExpanded;
  if (!isExpanded) {
    ui.constraintIndividualList.innerHTML = "";
    return;
  }
  ensurePerInputConstraintState();
  const defaults = perInputDefaults();
  const palette = parsePalette(ui.paletteInput.value);
  const labels = {
    h: ui.wHLabel?.textContent || "H",
    sc: ui.wSCLabel?.textContent || "S/C",
    l: ui.wLLabel?.textContent || "L",
  };
  ui.constraintIndividualList.innerHTML = "";
  const header = document.createElement("div");
  header.className = "constraint-individual-header";
  const colorHead = document.createElement("span");
  colorHead.textContent = "Color";
  header.appendChild(colorHead);
  ["h", "sc", "l"].forEach((slot) => {
    const label = document.createElement("span");
    label.textContent = labels[slot];
    header.appendChild(label);
  });
  ui.constraintIndividualList.appendChild(header);

  palette.forEach((hex, idx) => {
    const row = document.createElement("div");
    row.className = "constraint-individual-row";
    const id = document.createElement("div");
    id.className = "constraint-individual-id";
    const pill = document.createElement("span");
    pill.className = "constraint-color-pill";
    pill.style.background = hex;
    pill.style.color = contrastColor(hex);
    pill.textContent = hex;
    id.appendChild(pill);
    row.appendChild(id);

    ["h", "sc", "l"].forEach((slot) => {
      const wrap = document.createElement("div");
      wrap.className = "constraint-slider-wrap";
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.001";
      const val = state.perInputConstraints.widths?.[slot]?.[idx];
      const applied = Number.isFinite(val) ? val : defaults[slot];
      input.value = String(clampNum(applied, 0, 1));
      const tooltip = document.createElement("span");
      tooltip.className = "constraint-slider-tooltip";
      const updateTooltip = () => {
        const v = clampNum(parseFloat(input.value) || 0, 0, 1);
        tooltip.textContent = `${(v * 100).toFixed(1)}%`;
        tooltip.style.left = `${v * 100}%`;
      };
      let hideTimer = null;
      const showTip = () => {
        updateTooltip();
        wrap.classList.add("show-tooltip");
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => wrap.classList.remove("show-tooltip"), 900);
      };
      input.addEventListener("input", () => {
        const v = clampNum(parseFloat(input.value) || 0, 0, 1);
        if (!state.perInputConstraints.widths[slot]) state.perInputConstraints.widths[slot] = [];
        state.perInputConstraints.widths[slot][idx] = v;
        showTip();
        updateClipWarning();
        updateBoundsAndRefresh();
        drawStatusMini(state, ui, currentVizOpts());
      });
      input.addEventListener("pointerdown", () => showTip());
      input.addEventListener("pointerup", () => wrap.classList.remove("show-tooltip"));
      input.addEventListener("blur", () => wrap.classList.remove("show-tooltip"));
      input.addEventListener("change", () => history?.record());
      updateTooltip();
      wrap.appendChild(input);
      wrap.appendChild(tooltip);
      row.appendChild(wrap);
    });
    ui.constraintIndividualList.appendChild(row);
  });
}

function applyMainWidthToPerInputs(slot) {
  ensurePerInputConstraintState();
  const defaults = perInputDefaults();
  const next = defaults[slot];
  state.perInputConstraints.widths[slot] = state.perInputConstraints.widths[slot].map(() => next);
  if (state.perInputConstraints?.enabled) renderPerInputConstraintUI();
}

function updateConstraintTopologyUI() {
  const topology = ui.constraintTopology?.value || "contiguous";
  syncCustomConstraintsToSpace(ui.colorSpace.value);
  if (topology === "custom") {
    ensureCustomConstraintsInitialized();
  }
  const disableWidths = topology === "custom";
  [ui.wH, ui.wSC, ui.wL].forEach((slider) => {
    if (!slider) return;
    const row = slider.closest(".constraint-row");
    slider.disabled = disableWidths;
    if (row) {
      row.classList.toggle("is-disabled", disableWidths);
      row.setAttribute("aria-disabled", disableWidths ? "true" : "false");
      row.dataset.disabledMessage = disableWidths ? "Disabled while custom constraints are active." : "";
    }
  });
  renderPerInputConstraintUI();
}

function constraintWidthMapForSpace(space) {
  const { first, scChannel, third } = channelSlotsForSpace(space);
  return {
    [first]: parseWidthVal(ui.wH.value),
    [scChannel]: parseWidthVal(ui.wSC.value),
    [third]: parseWidthVal(ui.wL.value),
  };
}

function mappedWidthForChannel(ch, prevMap) {
  if (prevMap && Object.prototype.hasOwnProperty.call(prevMap, ch)) return prevMap[ch];
  if (ch === "c" && prevMap && Object.prototype.hasOwnProperty.call(prevMap, "s")) return prevMap.s;
  if (ch === "s" && prevMap && Object.prototype.hasOwnProperty.call(prevMap, "c")) return prevMap.c;
  return defaultWidthForChannel(ch);
}

function applyConstraintWidthsForSpace(space, prevMap) {
  const { first, scChannel, third } = channelSlotsForSpace(space);
  ui.wH.value = String(mappedWidthForChannel(first, prevMap));
  ui.wSC.value = String(mappedWidthForChannel(scChannel, prevMap));
  ui.wL.value = String(mappedWidthForChannel(third, prevMap));
}

function applyConstraintWidthDefaults(space) {
  applyConstraintWidthsForSpace(space, null);
  updateWidthChips();
}

function remapConstraintWidths(prevSpace, nextSpace) {
  const prev = prevSpace || nextSpace;
  const prevMap = prev ? constraintWidthMapForSpace(prev) : null;
  applyConstraintWidthsForSpace(nextSpace, prevMap);
  updateWidthChips();
}

function normalizeAndUpdateWeights(changedKey = null) {
  const keys = ["none", "deutan", "protan", "tritan"];
  const els = {
    none: ui.wNone,
    deutan: ui.wDeutan,
    protan: ui.wProtan,
    tritan: ui.wTritan,
  };
  const valEls = {
    none: ui.wNoneVal,
    deutan: ui.wDeutanVal,
    protan: ui.wProtanVal,
    tritan: ui.wTritanVal,
  };

  const changed = changedKey && keys.includes(changedKey) ? changedKey : null;
  const weightsFromScores = () => {
    const max = Math.max(...keys.map((k) => cvdScores[k]));
    const exps = {};
    let sum = 0;
    keys.forEach((k) => {
      const e = Math.exp(cvdScores[k] - max);
      exps[k] = e;
      sum += e;
    });
    const out = {};
    keys.forEach((k) => {
      out[k] = sum > 0 ? (exps[k] / sum) * 100 : 25;
    });
    return out;
  };

  const setScoreForTargetPct = (key, pct) => {
    const targetPct = clampNum(pct, 0, 100);
    const others = keys.filter((k) => k !== key);
    const otherScores = others.map((k) => cvdScores[k]);
    const maxOther = otherScores.length ? Math.max(...otherScores) : 0;
    const sumExpOther = others.reduce((acc, k) => acc + Math.exp(cvdScores[k] - maxOther), 0);
    const logSumOther = maxOther + Math.log(Math.max(sumExpOther, 1e-12));
    if (targetPct <= 0) {
      cvdScores[key] = (otherScores.length ? Math.min(...otherScores) : 0) - 20;
      return;
    }
    if (targetPct >= 100) {
      cvdScores[key] = (otherScores.length ? Math.max(...otherScores) : 0) + 20;
      return;
    }
    const t = clampNum(targetPct / 100, 1e-6, 1 - 1e-6);
    cvdScores[key] = Math.log(t / (1 - t)) + logSumOther;
  };

  if (changed) {
    setScoreForTargetPct(changed, parseFloat(els[changed]?.value || "0") || 0);
  } else {
    // initialize scores from current UI values
    const vals = keys.map((k) => clampNum(parseFloat(els[k]?.value || "0") || 0, 0, 100));
    const sum = vals.reduce((acc, v) => acc + v, 0);
    const safe = vals.map((v) => Math.max(v, 1e-6));
    const logs = safe.map((v) => Math.log(v));
    const mean = logs.reduce((acc, v) => acc + v, 0) / logs.length;
    keys.forEach((k, idx) => {
      cvdScores[k] = logs[idx] - mean;
    });
    if (sum <= 0) {
      keys.forEach((k) => (cvdScores[k] = 0));
    }
  }

  const weights = weightsFromScores();
  keys.forEach((k) => {
    const pct = weights[k];
    if (els[k]) els[k].value = pct.toFixed(1);
    if (valEls[k]) valEls[k].textContent = `${pct.toFixed(1)}%`;
  });
}

function attachEventListeners() {
  const recordHistory = (options) => history?.record(options);
  const scheduleHistory = (delay) => history?.schedule(delay);

  ui.paletteInput.addEventListener("input", () => {
    if (state.keepInputOverride) {
      state.keepInputOverride = false;
    } else {
      state.rawInputOverride = null;
      if (ui.rawInputValues) ui.rawInputValues.value = "";
    }
    state.bounds = computeInputBounds(ui.colorSpace.value);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    ensurePerInputConstraintState();
    renderPerInputConstraintUI();
    togglePlaceholder();
    updatePaletteHighlight();
    drawStatusMini(state, ui, currentVizOpts());
    setStatusState(ui, "Inputs changed", { stale: true });
    scheduleHistory(500);
  });
  ui.paletteInput.addEventListener("scroll", syncPaletteHighlightScroll);
  ui.paletteClear?.addEventListener("click", () => {
    ui.paletteInput.value = "";
    state.rawInputOverride = null;
    if (ui.rawInputValues) ui.rawInputValues.value = "";
    state.bounds = computeInputBounds(ui.colorSpace.value);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    ensurePerInputConstraintState();
    renderPerInputConstraintUI();
    togglePlaceholder();
    ui.paletteInput.focus();
    drawStatusMini(state, ui, currentVizOpts());
    setStatusState(ui, "Waiting to run");
    recordHistory();
  });
  ui.bgColor?.addEventListener("change", () => {
    updateBgControls();
    recordHistory();
  });
  ui.paletteMore?.addEventListener("click", () => {
    if (!ui.paletteGroups) return;
    ui.paletteGroups.classList.toggle("show-all");
    ui.paletteMore.textContent = ui.paletteGroups.classList.contains("show-all") ? "Less ▴" : "More ▾";
  });
  ui.bgEnabled?.addEventListener("change", () => {
    updateBgControls();
    recordHistory();
  });

  ui.colorSpace.addEventListener("change", () => {
    const nextSpace = ui.colorSpace.value;
    remapConstraintWidths(lastOptSpace, nextSpace);
    lastOptSpace = nextSpace;
    updateWidthLabels();
    syncCustomConstraintsToSpace(nextSpace);
    if (ui.syncSpaces?.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    }
    updateClipWarning();
    updateBoundsAndRefresh();
    drawStatusMini(state, ui, currentVizOpts());
    renderPerInputConstraintUI();
    recordHistory();
  });

  ui.colorwheelSpace.addEventListener("change", () => {
    if (ui.syncSpaces?.checked && ui.colorwheelSpace.value !== ui.colorSpace.value) {
      ui.syncSpaces.checked = false;
    }
    updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
    recordHistory();
  });
  ui.gamutMode?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
    recordHistory();
  });
  ui.gamutPreset?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
    recordHistory();
  });
  ui.cvdModel?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
    recordHistory();
  });
  ui.distanceMetric?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
    recordHistory();
  });
  ui.meanType?.addEventListener("change", () => {
    updateMeanControls(true);
    recordHistory();
  });
  ui.meanP?.addEventListener("input", () => {
    updateMeanControls(false);
  });
  ui.meanP?.addEventListener("change", () => {
    updateMeanControls(false);
    recordHistory();
  });
  ui.clipGamut?.addEventListener("change", () => {
    updateClipWarning();
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
    recordHistory();
  });
  ui.clipGamutOpt?.addEventListener("change", () => {
    // affects optimization only; no immediate redraw needed
    recordHistory();
  });
  ui.resultPrev?.addEventListener("click", () => changeResultSelection(-1));
  ui.resultNext?.addEventListener("click", () => changeResultSelection(1));
  ui.resultRank?.addEventListener("change", () => {
    const val = parseInt(ui.resultRank.value, 10);
    if (Number.isFinite(val)) {
      changeResultSelection(val, true);
    }
  });
  ui.uniqueness?.addEventListener("input", () => {
    uniquenessValue = clampNum(parseFloat(ui.uniqueness.value) || 0, 0, 100);
    if (ui.uniquenessVal) ui.uniquenessVal.textContent = `${Math.round(uniquenessValue)}%`;
    applyUniquenessFilter();
    if (state.runRanking?.length) applySelectedResult({ skipNavUpdate: true });
    updateResultNavigator();
  });
  ui.uniqueness?.addEventListener("change", () => {
    recordHistory();
  });
  ui.syncSpaces?.addEventListener("change", () => {
    if (ui.syncSpaces.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
      refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
      drawStatusMini(state, ui, currentVizOpts());
    }
    recordHistory();
  });

  ui.runBtn.addEventListener("click", () => runOptimization());
  ui.resetBtn.addEventListener("click", () => {
    setDefaultValues();
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
    state.runResults = [];
    state.runRanking = [];
    state.runRankingAll = [];
    state.selectedResultIdx = null;
    state.bestScores = [];
    state.nmTrails = [];
    state.bestColors = [];
    state.rawBestColors = [];
    drawStatusGraph(state, ui);
    drawStatusMini(state, ui, currentVizOpts());
    setStatus("waiting to start…", 0, ui, state);
    showError("", ui);
    updateResultNavigator();
    recordHistory();
  });
  ui.undoBtn?.addEventListener("click", () => history?.undo());
  ui.redoBtn?.addEventListener("click", () => history?.redo());
  ui.copyBtn.addEventListener("click", () => copyResults(ui, state));
  ui.sendToInputBtn?.addEventListener("click", () => sendResultsToInput());
  ui.formatQuotes.addEventListener("change", () => enforceWrapper());
  ui.formatCommas.addEventListener("change", () => enforceWrapper());
  ui.formatLines.addEventListener("change", () => enforceWrapper());
  ui.formatIncludeInputs?.addEventListener("change", () => enforceWrapper());
  ui.formatRC?.addEventListener("change", () => {
    if (ui.formatRC.checked && ui.formatPyList) ui.formatPyList.checked = false;
    enforceWrapper();
  });
  ui.formatPyList?.addEventListener("change", () => {
    if (ui.formatPyList.checked && ui.formatRC) ui.formatRC.checked = false;
    enforceWrapper();
  });
  [ui.formatQuotes, ui.formatCommas, ui.formatLines, ui.formatRC, ui.formatPyList, ui.formatIncludeInputs].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => recordHistory());
  });

  const widthInputs = [
    { el: ui.wH, slot: "h" },
    { el: ui.wSC, slot: "sc" },
    { el: ui.wL, slot: "l" },
  ];
  widthInputs.forEach(({ el, slot }) => {
    if (!el) return;
    el.addEventListener("input", () => {
      updateWidthChips();
      applyMainWidthToPerInputs(slot);
      updateClipWarning();
      updateBoundsAndRefresh();
      drawStatusMini(state, ui, currentVizOpts());
    });
    el.addEventListener("change", () => {
      recordHistory();
    });
  });

  [ui.modeH, ui.modeSC, ui.modeL, ui.constraintTopology, ui.aestheticMode].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      const skipHistory = el === ui.constraintTopology && state.suppressConstraintTopologyHistory;
      if (skipHistory) state.suppressConstraintTopologyHistory = false;
      if (el === ui.constraintTopology) {
        updateConstraintTopologyUI();
      }
      updateClipWarning();
      updateBoundsAndRefresh();
      drawStatusMini(state, ui, currentVizOpts());
      if (!skipHistory) recordHistory();
    });
  });

  ui.constraintIndividualToggle?.addEventListener("click", () => {
    ensurePerInputConstraintState();
    const wantsEnabled = !state.perInputConstraints.enabled;
    if (wantsEnabled && ui.constraintTopology?.value !== "discontiguous") {
      ui.constraintTopology.value = "discontiguous";
    }
    state.perInputConstraints.enabled = wantsEnabled;
    updateConstraintTopologyUI();
    updateBoundsAndRefresh();
    drawStatusMini(state, ui, currentVizOpts());
    recordHistory();
  });

  const weightMap = {
    none: ui.wNone,
    deutan: ui.wDeutan,
    protan: ui.wProtan,
    tritan: ui.wTritan,
  };
  Object.entries(weightMap).forEach(([key, el]) => {
    if (!el) return;
    el.addEventListener("input", () => normalizeAndUpdateWeights(key));
    el.addEventListener("change", () => {
      normalizeAndUpdateWeights(key);
      recordHistory();
    });
  });

  [ui.seedInput, ui.colorsToAdd, ui.optimRuns, ui.nmIters].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => recordHistory());
  });

  window.addEventListener("resize", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
  });

  window.addEventListener("error", (e) => {
    if (ui && ui.errorText) {
      ui.errorText.textContent = e.message || "Unexpected error";
    }
  });

  ui.verboseToggle?.addEventListener("change", () => {
    if (ui.verbosePanel) ui.verbosePanel.style.display = ui.verboseToggle.checked ? "block" : "none";
    renderVerboseTable();
    recordHistory();
  });

  document.addEventListener("keydown", (evt) => {
    if (state.running) return;
    const isMod = evt.metaKey || evt.ctrlKey;
    if (!isMod) return;
    const key = String(evt.key || "").toLowerCase();
    if (key !== "z") return;
    evt.preventDefault();
    if (evt.shiftKey) history?.redo();
    else history?.undo();
  });
}

function sendResultsToInput() {
  if (!ui?.paletteInput) return;
  const colors = state.newColors || [];
  if (!colors.length) return;
  const existing = parsePalette(ui.paletteInput.value);
  const toAdd = colors.filter((c) => !existing.includes(c));
  if (!toAdd.length) return;

  const appendText = toAdd.join(", ");
  const cur = ui.paletteInput.value;
  const sep = cur.trim().length ? (cur.endsWith("\n") ? "" : "\n") : "";
  ui.paletteInput.value = `${cur}${sep}${appendText}`;
  ui.paletteInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateWidthLabels() {
  const channels = channelOrder[ui.colorSpace.value];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1] || "s";
  ui.wHLabel.textContent = (channels[0] || "h").toUpperCase();
  ui.wSCLabel.textContent = scChannel.toUpperCase();
  ui.wLLabel.textContent = (channels[2] || "l").toUpperCase();
  renderPerInputConstraintUI();
}

function updateWidthChips() {
  ui.wHVal.textContent = `${(parseFloat(ui.wH.value) * 100).toFixed(1)}%`;
  ui.wSCVal.textContent = `${(parseFloat(ui.wSC.value) * 100).toFixed(1)}%`;
  ui.wLVal.textContent = `${(parseFloat(ui.wL.value) * 100).toFixed(1)}%`;
}

function updateClipWarning() {
  const el = ui?.clipGamutWarning;
  if (!el) return;
  const visualClip = ui.clipGamut?.checked === true;
  const widths = getWidths(ui);
  const anyConstraint = widths.some((v) => Number.isFinite(v) && v > 0);
  el.hidden = !(visualClip && anyConstraint);
}

function updateMeanControls(forceDefaultForKind = false) {
  if (!ui?.meanType) return;
  const kind = ui.meanType.value || "harmonic";
  const needsP = kind === "power" || kind === "lehmer";
  if (ui.meanPRow) ui.meanPRow.hidden = !needsP;
  if (needsP && ui.meanP && forceDefaultForKind) {
    ui.meanP.value = kind === "lehmer" ? "-2" : "-2";
  }
  if (ui.meanPVal && ui.meanP) {
    const v = parseFloat(ui.meanP.value);
    ui.meanPVal.textContent = Number.isFinite(v) ? v.toFixed(1) : "0.0";
  }
}

function enforceWrapper() {
  const wrapR = ui.formatRC?.checked;
  const wrapPy = ui.formatPyList?.checked;
  const isWrapped = wrapR || wrapPy;
  if (isWrapped) {
    if (ui.formatQuotes) ui.formatQuotes.checked = true;
    if (ui.formatCommas) ui.formatCommas.checked = true;
    if (ui.formatLines) ui.formatLines.checked = false;
  }
  [ui.formatQuotes, ui.formatCommas, ui.formatLines].forEach((el) => {
    if (!el) return;
    el.disabled = isWrapped;
    const label = el.parentElement;
    if (label) label.style.opacity = isWrapped ? "0.5" : "1";
  });
  setResults(state.newColors, ui, state.currentColors);
}

function harmonicMean(arr) {
  const eps = 1e-9;
  if (!arr.length) return 0;
  const sum = arr.reduce((acc, v) => acc + 1 / Math.max(v, eps), 0);
  return arr.length / sum;
}

function paletteDistanceHmLabs(labsA = [], labsB = []) {
  if (!labsA.length || !labsB.length) return 0;
  const dists = [];
  for (let i = 0; i < labsA.length; i++) {
    for (let j = 0; j < labsB.length; j++) {
      dists.push(deltaE2000(labsA[i], labsB[j]));
    }
  }
  return harmonicMean(dists);
}

function quantile(sortedArr, q) {
  if (!sortedArr.length) return Infinity;
  const qq = Math.max(0, Math.min(1, q));
  const pos = qq * (sortedArr.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedArr[lo];
  const t = pos - lo;
  return sortedArr[lo] * (1 - t) + sortedArr[hi] * t;
}

function computeUniquenessForRanking(rankingAll = []) {
  rankingAll.forEach((entry, idx) => {
    entry.fullRank = idx + 1;
    entry.uniqueness = idx === 0 ? Infinity : null;
    entry._labs = (entry.hex || []).map((h) => decodeColor(h, "lab"));
  });
  for (let i = 1; i < rankingAll.length; i++) {
    const cur = rankingAll[i];
    let minDist = Infinity;
    for (let j = 0; j < i; j++) {
      const prev = rankingAll[j];
      const d = paletteDistanceHmLabs(cur._labs || [], prev._labs || []);
      if (d < minDist) minDist = d;
    }
    cur.uniqueness = minDist;
  }
  return rankingAll;
}

function applyUniquenessFilter() {
  const all = state.runRankingAll || [];
  const totalAll = all.length;
  if (!totalAll) {
    state.runRanking = [];
    state.selectedResultIdx = null;
    updateResultNavigator();
    return;
  }

  const prevPick =
    state.runRanking?.length && state.selectedResultIdx
      ? state.runRanking[Math.max(0, Math.min(state.selectedResultIdx - 1, state.runRanking.length - 1))]
      : null;
  const preserveRun = prevPick?.run ?? null;

  const u = clampNum(
    Number.isFinite(uniquenessValue) ? uniquenessValue : (parseFloat(ui?.uniqueness?.value) || 0),
    0,
    100
  );
  uniquenessValue = u;
  if (ui?.uniqueness) ui.uniqueness.value = String(u);
  if (ui?.uniquenessVal) ui.uniquenessVal.textContent = `${Math.round(u)}%`;

  let filtered = all;
  if (u >= 100) {
    filtered = all.slice(0, 1);
  } else if (u <= 0) {
    filtered = all;
  } else {
    const finite = all
      .map((e) => e.uniqueness)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    const thr = quantile(finite, u / 100);
    filtered = all.filter(
      (e) => e.uniqueness === Infinity || (Number.isFinite(e.uniqueness) && e.uniqueness >= thr)
    );
  }

  state.runRanking = filtered;

  if (!filtered.length) {
    state.selectedResultIdx = null;
    updateResultNavigator();
    return;
  }
  const keepIdx = preserveRun != null ? filtered.findIndex((e) => e.run === preserveRun) : -1;
  state.selectedResultIdx = keepIdx >= 0 ? keepIdx + 1 : 1;
}

function updateBoundsAndRefresh() {
  state.bounds = computeInputBounds(ui.colorSpace.value);
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
  drawStatusMini(state, ui, currentVizOpts());
}

async function runOptimization() {
  if (state.running) return;
  const palette = parsePalette(ui.paletteInput.value);
  const paletteForOpt = [...palette];
  if (ui.bgEnabled?.checked) {
    const bgHex = (ui.bgColor?.value || "").trim();
    if (bgHex && /^#?[0-9a-fA-F]{6}$/.test(bgHex)) {
      const fixed = bgHex.startsWith("#") ? bgHex.toUpperCase() : `#${bgHex.toUpperCase()}`;
      paletteForOpt.push(fixed);
    }
  }
  showError("", ui);
  const config = readConfig(ui, state);
  // Constraints should be based on the user's input palette only (not the optional background).
  config.boundsPalette = palette;
  state.rawSpace = config.colorSpace;
  state.newRawSpace = config.colorSpace;
  state.running = true;
  ui.runBtn.disabled = true;
  ui.runBtn.textContent = "Running…";
  updateUndoRedoButtons();
  setStatus("starting optimizer…", 0, ui, state);
  setStatusState(ui, "Running");
  setResults([], ui, state.currentColors);
  state.bestScores = [];
  state.nmTrails = [];
  state.bestColors = [];
  state.rawBestColors = [];
  state.rawNewColors = [];
  state.runResults = [];
  state.runRanking = [];
  state.runRankingAll = [];
  state.selectedResultIdx = null;
  verboseRows = [];
  verboseBestRun = null;
  verboseBestScore = -Infinity;
  renderVerboseTable();
  updateResultNavigator();
  if (config.constraintTopology === "custom" && config.customConstraintPoints?.length) {
    state.bounds = computeBoundsFromRawValues(config.customConstraintPoints, config.colorSpace, config);
  } else if (state.rawInputOverride?.space === config.colorSpace && state.rawInputOverride.values?.length) {
    state.bounds = computeBoundsFromRawValues(state.rawInputOverride.values, config.colorSpace, config);
  } else {
    state.bounds = computeBoundsFromCurrent(palette, config.colorSpace, config);
  }
  drawStatusGraph(state, ui);
  drawStatusMini(state, ui, currentVizOpts());

  try {
    const best = await optimizePalette(paletteForOpt, config, {
      onProgress: async ({ run, pct, bestScore, startHex, endHex, startRaw, endRaw, bestHex, bestRaw }) => {
        state.bestScores.push(bestScore);
        state.nmTrails.push({
          run,
          startHex,
          endHex,
          startRaw: startRaw || null,
          endRaw: endRaw || null,
          rawSpace: config.colorSpace,
        });
        state.bestColors = bestHex || state.bestColors;
        state.rawBestColors = bestRaw || state.rawBestColors;
        setStatus(`restart ${run}/${config.nOptimRuns}`, pct, ui, state);
        drawStatusMini(state, ui, currentVizOpts());
        await nextFrame();
      },
      onVerbose: (info) => {
        const hexStr = (info.hex || []).join(" ");
        const paramPreview = (info.params || [])
          .map((v) => v.toFixed(3))
          .join(", ");
        if (info.stage === "start") {
          logVerbose(`run ${info.run} start params`, "", paramPreview);
          logVerbose(`run ${info.run} start hex`, "", hexStr);
          if (info.distance !== undefined || info.penalty !== undefined) {
            if (info.distance !== undefined) {
              logVerbose(`run ${info.run} start distance`, "", info.distance.toFixed(4));
            }
            if (info.penalty !== undefined) {
              logVerbose(`run ${info.run} start penalty`, "", info.penalty.toFixed(4));
            }
            if (info.paramPenalty !== undefined || info.gamutPenalty !== undefined) {
              logVerbose(
                `run ${info.run} start penalty breakdown`,
                "",
                `param=${(info.paramPenalty ?? 0).toFixed(4)}, gamut=${(info.gamutPenalty ?? 0).toFixed(4)}`
              );
            }
          }
          pushVerboseRows(info);
        } else if (info.stage === "end") {
          logVerbose(`run ${info.run} end params`, "", paramPreview);
          logVerbose(`run ${info.run} end hex`, "", hexStr);
        if (info.score !== undefined) {
          logVerbose(`run ${info.run} end score`, "", info.score.toFixed(4));
        }
        if (info.distance !== undefined || info.penalty !== undefined) {
          if (info.distance !== undefined) {
              logVerbose(`run ${info.run} end distance`, "", info.distance.toFixed(4));
            }
            if (info.penalty !== undefined) {
              logVerbose(`run ${info.run} end penalty`, "", info.penalty.toFixed(4));
            }
            if (info.paramPenalty !== undefined || info.gamutPenalty !== undefined) {
              logVerbose(
                `run ${info.run} end penalty breakdown`,
                "",
                `param=${(info.paramPenalty ?? 0).toFixed(4)}, gamut=${(info.gamutPenalty ?? 0).toFixed(4)}`
              );
            }
          }
          pushVerboseRows(info);
          storeRunResult(info);
        } else if (info.stage === "best") {
          logVerbose(`run ${info.run} best params`, "", paramPreview);
          logVerbose(`run ${info.run} best hex`, "", hexStr);
          if (info.score !== undefined) {
            logVerbose(`run ${info.run} best score`, "", info.score.toFixed(4));
          }
          if (info.distance !== undefined || info.penalty !== undefined) {
            if (info.distance !== undefined) {
              logVerbose(`run ${info.run} best distance`, "", info.distance.toFixed(4));
            }
            if (info.penalty !== undefined) {
              logVerbose(`run ${info.run} best penalty`, "", info.penalty.toFixed(4));
            }
            if (info.paramPenalty !== undefined || info.gamutPenalty !== undefined) {
              logVerbose(
                `run ${info.run} best penalty breakdown`,
                "",
                `param=${(info.paramPenalty ?? 0).toFixed(4)}, gamut=${(info.gamutPenalty ?? 0).toFixed(4)}`
              );
            }
          }
          pushVerboseRows(info);
        }
      },
    });
    state.runRankingAll = computeUniquenessForRanking(rankRunResults(state.runResults));
    applyUniquenessFilter();
    if (state.runRanking.length) {
      applySelectedResult({ skipNavUpdate: true });
    } else {
      state.newColors = best.newHex || [];
      state.bestColors = state.newColors;
      state.rawNewColors = best.newRaw || [];
      state.rawBestColors = state.rawNewColors;
      state.newRawSpace = config.colorSpace;
      setResults(state.newColors, ui, state.currentColors);
    }
    logVerbose("newColors", [], state.newColors);
    const convergence = best.meta?.reason || "finished";
    setStatus(`done. best score = ${(-best.value).toFixed(3)} (${convergence})`, 100, ui, state);
    setStatusState(ui, "Finished");
  } catch (err) {
    showError(err.message || "Optimization failed.", ui);
    console.error(err);
  } finally {
    state.running = false;
    ui.runBtn.disabled = false;
    ui.runBtn.textContent = "RUN";
    updateUndoRedoButtons();
    if (ui.verboseToggle?.checked) renderVerboseTable();
    if (!state.runRanking?.length && state.newColors?.length) {
      refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
      drawStatusMini(state, ui, currentVizOpts());
    } else if (state.runRanking?.length) {
      applySelectedResult({ skipNavUpdate: true });
    }
    updateResultNavigator();
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function logVerbose(key, prev, next) {
  const prevStr = Array.isArray(prev) ? prev.join(" ") : String(prev);
  const nextStr = Array.isArray(next) ? next.join(" ") : String(next);
  verboseLogs.push(`${key}: ${prevStr} -> ${nextStr}`);
  if (verboseLogs.length > 200) verboseLogs.shift();
  renderVerboseTable();
}

function renderVerboseTable() {
  if (!ui?.verbosePanel || !ui.verboseTable) return;
  if (!ui.verboseToggle?.checked) {
    ui.verbosePanel.style.display = "none";
    ui.verboseTable.innerHTML = "";
    return;
  }
  ui.verbosePanel.style.display = "block";
  if (state?.running || !verboseRows.length) {
    ui.verboseTable.innerHTML = "<p class=\"muted\">Verbose output will be generated once all runs have finished.</p>";
    return;
  }
  const channels = channelOrder[ui.colorSpace.value] || [];
  const truncNote = verboseTruncInfo
    ? `<p class="muted warning">Verbose output truncated: removed ${verboseTruncInfo.droppedRows} row${
        verboseTruncInfo.droppedRows === 1 ? "" : "s"
      } this pass to stay under ${VERBOSE_MAX_ROWS} rows. Earliest shown run: ${
        verboseTruncInfo.firstKeptRun ?? "?"
      } (runs < ${verboseTruncInfo.firstKeptRun ?? "?"} are not displayed; estimated runs dropped: ${
        verboseTruncInfo.droppedRuns
      }).</p>`
    : "";
  const grouped = {};
  verboseRows.forEach((row) => {
    const key = `${row.run}-${row.idx}`;
    if (!grouped[key]) grouped[key] = { run: row.run, idx: row.idx };
    if (row.stage === "start") grouped[key].start = row;
    if (row.stage === "end") grouped[key].end = row;
    if (row.stage === "best") grouped[key].best = row;
  });
  const selectedRun =
    state.runRanking && state.selectedResultIdx
      ? state.runRanking[Math.max(0, Math.min(state.selectedResultIdx - 1, state.runRanking.length - 1))]?.run
      : null;
  const bestRunGlobal = state.runRanking && state.runRanking.length ? state.runRanking[0].run : null;
  const entries = Object.values(grouped);
  const orderedForBest = [...entries].sort((a, b) => a.run - b.run || a.idx - b.idx);
  let bestRunSoFar = null;
  let bestScoreSoFar = -Infinity;
  orderedForBest.forEach((entry) => {
    const start = entry.start || {};
    const end = entry.end || entry.best || {};
    const endScore = typeof end.score === "number" ? end.score : typeof start.score === "number" ? start.score : null;
    if (typeof endScore === "number" && endScore > bestScoreSoFar) {
      bestScoreSoFar = endScore;
      bestRunSoFar = entry.run;
    }
    entry.bestRunSoFar = bestRunSoFar;
  });

  const fallbackWeights = {
    none: (parseFloat(ui.wNone?.value || "0") || 0) / 100,
    deutan: (parseFloat(ui.wDeutan?.value || "0") || 0) / 100,
    protan: (parseFloat(ui.wProtan?.value || "0") || 0) / 100,
    tritan: (parseFloat(ui.wTritan?.value || "0") || 0) / 100,
  };
  const fallbackMeanType = ui.meanType?.value || "harmonic";
  const fallbackMeanP = ui.meanP ? parseFloat(ui.meanP.value) : undefined;

  const rows = entries.map((entry) => {
    const start = entry.start || {};
    const end = entry.end || entry.best || {};
    const startDistPct = relPart(start.distance, start.total);
    const startPenPct = relPart(start.penalty, start.total);
    const endDistPct = relPart(end.distance, end.total);
    const endPenPct = relPart(end.penalty, end.total);
    const diff = {
      channels: Object.fromEntries(
        channels.map((c) => [c, (end.channels?.[c] ?? 0) - (start.channels?.[c] ?? 0)])
      ),
      dist: (end.distance ?? 0) - (start.distance ?? 0),
      pen: (end.penalty ?? 0) - (start.penalty ?? 0),
      gamut: (end.gamutDistance ?? 0) - (start.gamutDistance ?? 0),
      total: (end.total ?? 0) - (start.total ?? 0),
      distPct: numDiff(endDistPct, startDistPct),
      penPct: numDiff(endPenPct, startPenPct),
      score: (end.score ?? 0) - (start.score ?? 0),
    };
    const closestDistByState = { ...(end.closestDistByState || {}) };
    if (!Number.isFinite(closestDistByState.none) && Number.isFinite(end.closestDist)) {
      closestDistByState.none = end.closestDist;
    }
    const metric = end.distanceMetric || start.distanceMetric || ui.distanceMetric?.value || "de2000";
    const weights = end.colorblindWeights || start.colorblindWeights || fallbackWeights;
    const meanType = end.meanType || start.meanType || fallbackMeanType;
    const meanP = Number.isFinite(end.meanP) ? end.meanP : Number.isFinite(start.meanP) ? start.meanP : fallbackMeanP;
    const discWeightedDistance = weightedAggregateDistances(closestDistByState, weights, meanType, meanP);
    return {
      run: entry.run,
      idx: entry.idx,
      start,
      end,
      diff,
      startDistPct,
      startPenPct,
      endDistPct,
      endPenPct,
      bestRunSoFar: entry.bestRunSoFar,
      closestDistByState,
      metric,
      weights,
      meanType,
      meanP,
      discWeightedDistance,
      isSelected: selectedRun != null && entry.run === selectedRun,
      isBest: bestRunGlobal != null && entry.run === bestRunGlobal,
    };
  });

  const endColumnsAll = [
    {
      key: "end_hex",
      label: "Hex",
      type: "string",
      className: "col-end",
      get: (row) => row.end.hex || "",
      render: (row) => renderHex(row.end.hex, row.end.color),
    },
    ...channels.map((c) => ({
      key: `end_${c}`,
      label: c.toUpperCase(),
      type: "number",
      className: "col-end",
      get: (row) => row.end.channels?.[c],
      render: (row) => formatVal(row.end.channels?.[c]),
    })),
    { key: "end_dist", label: "Dist", type: "number", className: "col-end", get: (row) => row.end.distance, render: (row) => formatVal(row.end.distance) },
    { key: "end_pen", label: "Pen", type: "number", className: "col-end", get: (row) => row.end.penalty, render: (row) => formatVal(row.end.penalty) },
    { key: "end_gamut", label: "Gamut Dist", type: "number", className: "col-end", get: (row) => row.end.gamutDistance, render: (row) => formatVal(row.end.gamutDistance) },
    { key: "end_total", label: "Total", type: "number", className: "col-end", get: (row) => row.end.total, render: (row) => formatVal(row.end.total) },
    { key: "end_dist_pct", label: "Dist%", type: "number", className: "col-end", get: (row) => row.endDistPct, render: (row) => formatVal(row.endDistPct) },
    { key: "end_pen_pct", label: "Pen%", type: "number", className: "col-end", get: (row) => row.endPenPct, render: (row) => formatVal(row.endPenPct) },
    { key: "end_score", label: "Score", type: "number", className: "col-end", get: (row) => row.end.score, render: (row) => formatVal(row.end.score) },
  ];

  const startColumnsAll = [
    {
      key: "start_hex",
      label: "Hex",
      type: "string",
      className: "col-start",
      get: (row) => row.start.hex || "",
      render: (row) => renderHex(row.start.hex, row.start.color),
    },
    ...channels.map((c) => ({
      key: `start_${c}`,
      label: c.toUpperCase(),
      type: "number",
      className: "col-start",
      get: (row) => row.start.channels?.[c],
      render: (row) => formatVal(row.start.channels?.[c]),
    })),
    { key: "start_dist", label: "Dist", type: "number", className: "col-start", get: (row) => row.start.distance, render: (row) => formatVal(row.start.distance) },
    { key: "start_pen", label: "Pen", type: "number", className: "col-start", get: (row) => row.start.penalty, render: (row) => formatVal(row.start.penalty) },
    { key: "start_gamut", label: "Gamut Dist", type: "number", className: "col-start", get: (row) => row.start.gamutDistance, render: (row) => formatVal(row.start.gamutDistance) },
    { key: "start_total", label: "Total", type: "number", className: "col-start", get: (row) => row.start.total, render: (row) => formatVal(row.start.total) },
    { key: "start_dist_pct", label: "Dist%", type: "number", className: "col-start", get: (row) => row.startDistPct, render: (row) => formatVal(row.startDistPct) },
    { key: "start_pen_pct", label: "Pen%", type: "number", className: "col-start", get: (row) => row.startPenPct, render: (row) => formatVal(row.startPenPct) },
    { key: "start_score", label: "Score", type: "number", className: "col-start", get: (row) => row.start.score, render: (row) => formatVal(row.start.score) },
  ];

  const diffColumnsAll = [
    ...channels.map((c) => ({
      key: `diff_${c}`,
      label: `Δ${c.toUpperCase()}`,
      type: "number",
      className: "col-diff",
      get: (row) => row.diff.channels?.[c],
      render: (row) => formatVal(row.diff.channels?.[c]),
    })),
    { key: "diff_dist", label: "ΔDist", type: "number", className: "col-diff", get: (row) => row.diff.dist, render: (row) => formatVal(row.diff.dist) },
    { key: "diff_pen", label: "ΔPen", type: "number", className: "col-diff", get: (row) => row.diff.pen, render: (row) => formatVal(row.diff.pen) },
    { key: "diff_gamut", label: "ΔGamut", type: "number", className: "col-diff", get: (row) => row.diff.gamut, render: (row) => formatVal(row.diff.gamut) },
    { key: "diff_total", label: "ΔTotal", type: "number", className: "col-diff", get: (row) => row.diff.total, render: (row) => formatVal(row.diff.total) },
    { key: "diff_dist_pct", label: "ΔDist%", type: "number", className: "col-diff", get: (row) => row.diff.distPct, render: (row) => formatVal(row.diff.distPct) },
    { key: "diff_pen_pct", label: "ΔPen%", type: "number", className: "col-diff", get: (row) => row.diff.penPct, render: (row) => formatVal(row.diff.penPct) },
    { key: "diff_score", label: "ΔScore", type: "number", className: "col-diff", get: (row) => row.diff.score, render: (row) => formatVal(row.diff.score) },
  ];

  const metaColumns = [
    { key: "meta_best_run", label: "Best Run", type: "number", className: "col-meta", get: (row) => row.bestRunSoFar, render: (row) => row.bestRunSoFar ?? "" },
    { key: "meta_influence", label: "Influence", type: "number", className: "col-meta", get: (row) => row.end.influence, render: (row) => formatVal(row.end.influence) },
    { key: "meta_influence_pct", label: "% Influence", type: "number", className: "col-meta", get: (row) => percentInfluence(row.end.influence, row.end.score), render: (row) => formatVal(percentInfluence(row.end.influence, row.end.score)) },
    { key: "meta_rank", label: "Rank", type: "number", className: "col-meta", get: (row) => row.end.influenceRank, render: (row) => row.end.influenceRank ?? "" },
    { key: "meta_closest_hex", label: "Closest", type: "string", className: "col-meta", get: (row) => row.end.closestHex || "", render: (row) => renderHex(row.end.closestHex, row.end.closestHex) },
    { key: "meta_end_hex", label: "End Hex", type: "string", className: "col-meta", get: (row) => row.end.hex || "", render: (row) => renderHex(row.end.hex, row.end.color) },
    { key: "meta_closest_dist", label: "Closest Dist", type: "number", className: "col-meta", get: (row) => row.end.closestDist, render: (row) => formatVal(row.end.closestDist) },
    {
      key: "disc_none",
      label: "Disc (Tri)",
      type: "number",
      className: "col-meta",
      get: (row) => row.closestDistByState?.none,
      render: (row) => renderDiscCell(row.closestDistByState?.none, row.metric),
    },
    {
      key: "disc_deutan",
      label: "Disc (Deu)",
      type: "number",
      className: "col-meta",
      get: (row) => row.closestDistByState?.deutan,
      render: (row) => renderDiscCell(row.closestDistByState?.deutan, row.metric),
    },
    {
      key: "disc_protan",
      label: "Disc (Pro)",
      type: "number",
      className: "col-meta",
      get: (row) => row.closestDistByState?.protan,
      render: (row) => renderDiscCell(row.closestDistByState?.protan, row.metric),
    },
    {
      key: "disc_tritan",
      label: "Disc (Trit)",
      type: "number",
      className: "col-meta",
      get: (row) => row.closestDistByState?.tritan,
      render: (row) => renderDiscCell(row.closestDistByState?.tritan, row.metric),
    },
    {
      key: "disc_weighted",
      label: "Disc (Weighted)",
      type: "number",
      className: "col-meta",
      get: (row) => row.discWeightedDistance,
      render: (row) => renderDiscCell(row.discWeightedDistance, row.metric),
    },
  ];

  const endColumns = verboseGroupState.end ? endColumnsAll : [endColumnsAll[0]];
  const startColumns = verboseGroupState.start ? startColumnsAll : [startColumnsAll[0]];
  const diffColumns = verboseGroupState.diff ? diffColumnsAll : [diffColumnsAll[diffColumnsAll.length - 1]];

  const sortMap = {
    run: { type: "number", get: (row) => row.run },
    idx: { type: "number", get: (row) => row.idx },
  };
  const allColumns = [...endColumnsAll, ...metaColumns, ...startColumnsAll, ...diffColumnsAll];
  allColumns.forEach((col) => {
    sortMap[col.key] = { type: col.type || "number", get: col.get };
  });

  const sortSpec = sortMap[verboseSortKey] || sortMap.run;
  rows.sort((a, b) => {
    const va = sortSpec.get(a);
    const vb = sortSpec.get(b);
    if (sortSpec.type === "string") {
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      const cmp = sa.localeCompare(sb);
      if (cmp !== 0) return verboseSortDir === "desc" ? -cmp : cmp;
    } else {
      const aValid = Number.isFinite(va);
      const bValid = Number.isFinite(vb);
      if (!aValid && !bValid) {
        // fall through to tie-breaker
      } else if (!aValid) {
        return 1;
      } else if (!bValid) {
        return -1;
      } else if (va !== vb) {
        return verboseSortDir === "desc" ? vb - va : va - vb;
      }
    }
    return a.run - b.run || a.idx - b.idx;
  });

  const groupKeyForRow = (row) => {
    const val = sortSpec.get(row);
    if (sortSpec.type === "string") return String(val ?? "");
    if (!Number.isFinite(val)) return "";
    if (verboseSortKey === "run" || verboseSortKey === "idx") return String(val);
    return formatVal(val);
  };

  const renderSortHeader = (col, isGroupStart) => {
    const isActive = verboseSortKey === col.key;
    const dirClass = isActive ? (verboseSortDir === "desc" ? "sort-desc" : "sort-asc") : "";
    const ariaSort = isActive ? (verboseSortDir === "desc" ? "descending" : "ascending") : "none";
    const classes = [col.className || "", isGroupStart ? "block-start" : "", dirClass].filter(Boolean).join(" ");
    return `<th class="${classes}" aria-sort="${ariaSort}">
      <button class="sort-btn" type="button" data-sort-key="${col.key}" aria-label="Sort by ${col.label}">
        <span class="sort-label">${col.label}</span>
        <span class="sort-icons"><span class="sort-up">^</span><span class="sort-down">v</span></span>
      </button>
    </th>`;
  };

  const renderRowSpanSortHeader = (label, key) => {
    const isActive = verboseSortKey === key;
    const dirClass = isActive ? (verboseSortDir === "desc" ? "sort-desc" : "sort-asc") : "";
    const ariaSort = isActive ? (verboseSortDir === "desc" ? "descending" : "ascending") : "none";
    const classes = ["col-run", dirClass].filter(Boolean).join(" ");
    return `<th rowspan="2" class="${classes}" aria-sort="${ariaSort}">
      <button class="sort-btn" type="button" data-sort-key="${key}" aria-label="Sort by ${label}">
        <span class="sort-label">${label}</span>
        <span class="sort-icons"><span class="sort-up">^</span><span class="sort-down">v</span></span>
      </button>
    </th>`;
  };

  const renderGroupToggle = (groupKey) => {
    const expanded = verboseGroupState[groupKey];
    const label = expanded ? "v" : ">";
    return `<button class="group-toggle" type="button" data-group-toggle="${groupKey}" aria-expanded="${expanded ? "true" : "false"}">${label}</button>`;
  };

  const header = `
    <table class="verbose-table">
      <thead>
        <tr>
          ${renderRowSpanSortHeader("Run", "run")}
          ${renderRowSpanSortHeader("Idx", "idx")}
          <th colspan="${endColumns.length}" class="group-header block-start">End ${renderGroupToggle("end")}</th>
          <th colspan="${metaColumns.length}" class="group-header block-start">Meta</th>
          <th colspan="${startColumns.length}" class="group-header block-start">Start ${renderGroupToggle("start")}</th>
          <th colspan="${diffColumns.length}" class="group-header block-start">Difference ${renderGroupToggle("diff")}</th>
        </tr>
        <tr>
          ${endColumns.map((col, idx) => renderSortHeader(col, idx === 0)).join("")}
          ${metaColumns.map((col, idx) => renderSortHeader(col, idx === 0)).join("")}
          ${startColumns.map((col, idx) => renderSortHeader(col, idx === 0)).join("")}
          ${diffColumns.map((col, idx) => renderSortHeader(col, idx === 0)).join("")}
        </tr>
      </thead>
      <tbody>
  `;

  let prevGroupKey = null;
  const rowsHtml = rows.map((row) => {
    const groupKey = groupKeyForRow(row);
    const groupBreak = prevGroupKey !== null && groupKey !== prevGroupKey;
    prevGroupKey = groupKey;
    const rowClass = `${groupBreak ? "row-sep" : ""} ${row.isSelected ? "row-selected" : ""} ${row.isBest ? "row-best" : ""}`.trim();

    const renderCells = (cols) =>
      cols
        .map((col, idx) => {
          const className = [col.className || "", idx === 0 ? "block-start" : ""].filter(Boolean).join(" ");
          return `<td class="${className}">${col.render(row)}</td>`;
        })
        .join("");

    return `<tr class="${rowClass}">
      <td class="col-run">${row.run}</td>
      <td class="col-run">${row.idx}</td>
      ${renderCells(endColumns)}
      ${renderCells(metaColumns)}
      ${renderCells(startColumns)}
      ${renderCells(diffColumns)}
    </tr>`;
  });

  ui.verboseTable.innerHTML = `${truncNote}${header}${rowsHtml.join("")}</tbody></table>`;
  const table = ui.verboseTable.querySelector("table");
  if (table) {
    table.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-group-toggle]");
      if (toggle) {
        const key = toggle.getAttribute("data-group-toggle");
        if (key && key in verboseGroupState) {
          verboseGroupState[key] = !verboseGroupState[key];
          renderVerboseTable();
        }
        return;
      }
      const sortBtn = event.target.closest("[data-sort-key]");
      if (!sortBtn) return;
      const key = sortBtn.getAttribute("data-sort-key");
      if (!key) return;
      if (verboseSortKey === key) {
        verboseSortDir = verboseSortDir === "asc" ? "desc" : "asc";
      } else {
        verboseSortKey = key;
        verboseSortDir = "asc";
      }
      renderVerboseTable();
    });
  }
}

function pushVerboseRows(info) {
  const rows = [];
  const hexes = info.hex || [];
  let details = info.details || [];
  if (!details.length && (info.raw || info.newRaw)) {
    const raws = info.raw || info.newRaw || [];
    details = raws.map((r, idx) => ({
      hex: hexes[idx] || "",
      channels: r,
      distance: info.distance,
      penalty: info.penalty,
      gamutDistance: null,
      total: null,
      score: info.score,
    }));
  }
  details.forEach((det, idx) => {
    if (info.stage === "best" && typeof info.score === "number" && info.score > verboseBestScore) {
      verboseBestScore = info.score;
      verboseBestRun = info.run;
    }
    rows.push({
      run: info.run,
      stage: info.stage,
      idx: idx + 1,
      hex: hexes[idx] || det.hex || "",
      color: det.hex || hexes[idx] || "",
      channels: det.channels || {},
      distance: det.distance,
      penalty: det.penalty,
      gamutDistance: det.gamutDistance,
      total: det.total,
      score: info.score,
      bestRunSoFar: verboseBestRun,
      influence: det.influence,
      influenceRank: det.influenceRank,
      closestHex: det.closestHex,
      closestDist: det.closestDist,
      closestDistByState: det.closestDistByState,
      closestHexByState: det.closestHexByState,
      colorblindWeights: info.colorblindWeights,
      distanceMetric: info.distanceMetric,
      meanType: info.meanType,
      meanP: info.meanP,
      space: info.space || ui.colorSpace.value,
    });
  });
  let appended = verboseRows.concat(rows);
  if (appended.length > VERBOSE_MAX_ROWS) {
    const runMap = new Map();
    appended.forEach((r) => {
      if (!runMap.has(r.run)) runMap.set(r.run, []);
      runMap.get(r.run).push(r);
    });
    const runList = Array.from(runMap.keys()).sort((a, b) => a - b);
    const keepRuns = new Set();
    if (verboseBestRun != null && runMap.has(verboseBestRun)) {
      keepRuns.add(verboseBestRun);
    }
    let keptCount = keepRuns.size ? runMap.get(verboseBestRun).length : 0;
    for (let i = runList.length - 1; i >= 0 && keptCount < VERBOSE_MAX_ROWS; i--) {
      const run = runList[i];
      if (keepRuns.has(run)) continue;
      const len = runMap.get(run).length;
      if (keptCount + len > VERBOSE_MAX_ROWS) continue;
      keepRuns.add(run);
      keptCount += len;
    }
    let droppedRuns = runList.filter((r) => !keepRuns.has(r));
    const runsKept = Array.from(keepRuns).sort((a, b) => a - b);
    let rebuilt = [];
    if (runsKept.length) {
      runsKept.forEach((run) => {
        rebuilt.push(...runMap.get(run));
      });
    } else {
      rebuilt = appended.slice(-VERBOSE_MAX_ROWS);
    }
    // if still over the cap, drop whole earliest runs (prefer keeping best run)
    if (rebuilt.length > VERBOSE_MAX_ROWS && runsKept.length > 0) {
      const keptRunsAsc = [...runsKept];
      let droppedExtraRuns = [];
      let currLength = rebuilt.length;
      let idx = 0;
      while (currLength > VERBOSE_MAX_ROWS && idx < keptRunsAsc.length) {
        const candidate =
          keptRunsAsc[idx] === verboseBestRun && keptRunsAsc.length > idx + 1
            ? keptRunsAsc[idx + 1]
            : keptRunsAsc[idx];
        if (candidate === verboseBestRun && keptRunsAsc.length === 1) break;
        const len = runMap.get(candidate)?.length || 0;
        if (len === 0) {
          idx += 1;
          continue;
        }
        currLength -= len;
        droppedExtraRuns.push(candidate);
        rebuilt = rebuilt.filter((r) => r.run !== candidate);
        keptRunsAsc.splice(keptRunsAsc.indexOf(candidate), 1);
      }
      runsKept.length = 0;
      runsKept.push(...keptRunsAsc);
      droppedRuns.push(...droppedExtraRuns);
    }
    verboseTruncInfo = {
      droppedRuns: Math.max(droppedRuns.length, (rebuilt[0]?.run || 1) - 1),
      droppedRows: appended.length - rebuilt.length,
      firstKeptRun: rebuilt[0]?.run,
    };
    appended = rebuilt;
  } else {
    verboseTruncInfo = null;
  }
  verboseRows = appended;
  if (!state?.running && ui?.verboseToggle?.checked) {
    renderVerboseTable();
  }
}

function formatVal(v) {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0";
  const str = Number(v).toPrecision(3);
  // remove unnecessary plus signs
  return str.replace(/^\+/, "");
}

function renderDiscCell(distance, metric) {
  if (!Number.isFinite(distance)) return "";
  const label = discriminabilityLabel(distance, metric);
  const dist = formatVal(distance);
  const title = dist ? ` title="${dist}"` : "";
  return `<span class="disc-chip"${title}>${label}</span>`;
}

function renderHex(hex, color) {
  if (!hex) return "";
  const bg = color || hex;
  const fg = contrastColor(bg);
  return `<span class="verbose-hex" style="background:${bg};color:${fg};">${hex}</span>`;
}

function relPart(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || Math.abs(total) < 1e-12) return NaN;
  return part / total;
}

function numDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return a - b;
}

function percentInfluence(influence, score) {
  if (!Number.isFinite(influence) || !Number.isFinite(score) || score === 0) return NaN;
  return influence / score;
}

function computeWorstColorScore(runNumber) {
  if (!Number.isFinite(runNumber)) return null;
  const run = (state.runResults || []).find((r) => r.run === runNumber);
  if (run && Number.isFinite(run.worstDistance)) return run.worstDistance;
  const rows = verboseRows.filter((r) => r.run === runNumber && (r.stage === "end" || r.stage === "best"));
  const distances = rows.map((r) => r.distance).filter((v) => Number.isFinite(v));
  if (!distances.length) return null;
  return Math.min(...distances);
}

function storeRunResult(info) {
  if (!info || (info.stage !== "end" && info.stage !== "best")) return;
  const worst =
    info.details && info.details.length
      ? Math.min(...info.details.map((d) => (Number.isFinite(d.distance) ? d.distance : Infinity)))
      : null;
  const entry = {
    run: info.run,
    hex: info.hex ? [...info.hex] : [],
    raw: info.raw ? [...info.raw] : [],
    score: info.score,
    distance: info.distance,
    penalty: info.penalty,
    total: typeof info.distance === "number" && typeof info.penalty === "number" ? info.distance - info.penalty : null,
    space: info.space || ui.colorSpace.value,
    worstDistance: Number.isFinite(worst) ? worst : null,
  };
  state.runResults = (state.runResults || []).filter((r) => r.run !== entry.run);
  state.runResults.push(entry);
}

function rankRunResults(results = []) {
  return results
    .filter((r) => Number.isFinite(r?.score))
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) > 1e-9) return diff;
      return (a.run || 0) - (b.run || 0);
    });
}

function changeResultSelection(stepOrRank, absolute = false) {
  if (state.running) return;
  const total = state.runRanking?.length || 0;
  if (!total) {
    updateResultNavigator();
    return;
  }
  const current = state.selectedResultIdx || 1;
  let next = absolute ? stepOrRank : current + stepOrRank;
  next = Math.max(1, Math.min(total, next));
  state.selectedResultIdx = next;
  applySelectedResult();
}

function applySelectedResult(options = {}) {
  const { skipNavUpdate } = options;
  const ranking = state.runRanking || [];
  if (!ranking.length) {
    updateResultNavigator();
    return;
  }
  const idx = Math.min(Math.max((state.selectedResultIdx || 1) - 1, 0), ranking.length - 1);
  const pick = ranking[idx];
  if (!pick) {
    updateResultNavigator();
    return;
  }
  state.selectedResultIdx = idx + 1;
  state.newColors = pick.hex || [];
  state.rawNewColors = pick.raw || [];
  state.newRawSpace = pick.space || state.rawSpace;
  state.bestColors = pick.hex || state.bestColors;
  state.rawBestColors = pick.raw || state.rawBestColors;
  setResults(state.newColors, ui, state.currentColors);
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
  drawStatusMini(state, ui, currentVizOpts());
  drawStatusGraph(state, ui);
  setStatusState(ui, "Finished");
  if (!skipNavUpdate) updateResultNavigator();
}

function updateResultNavigator() {
  if (!ui?.resultNav) return;
  const total = state.runRanking?.length || 0;
  const totalAll = state.runRankingAll?.length || total;
  const rank = Math.min(Math.max(state.selectedResultIdx || 1, 1), Math.max(total, 1));
  const disabled = state.running || total === 0;
  ui.resultNav.classList.toggle("disabled", disabled);
  if (ui.uniqueness) ui.uniqueness.disabled = state.running;
  if (ui.resultRank) {
    ui.resultRank.value = total ? rank : 0;
    ui.resultRank.disabled = disabled;
    ui.resultRank.min = total ? 1 : 0;
    ui.resultRank.max = Math.max(total, 1);
  }
  if (ui.resultPrev) ui.resultPrev.disabled = disabled || rank <= 1;
  if (ui.resultNext) ui.resultNext.disabled = disabled || rank >= total;
  if (ui.resultTotal) ui.resultTotal.textContent = `(of ${total})`;
  const selected = total && state.selectedResultIdx ? state.runRanking[Math.min(total - 1, Math.max(0, state.selectedResultIdx - 1))] : null;
  if (ui.resultRankAll) {
    ui.resultRankAll.textContent =
      selected && selected.fullRank ? `#${selected.fullRank}/${totalAll}` : "#—/—";
  }
  if (ui.resultScore) {
    ui.resultScore.textContent = selected ? `Score: ${formatVal(selected.score)}` : "Score: —";
  }
  if (ui.resultWorst) {
    const worst = selected ? computeWorstColorScore(selected.run) : null;
    ui.resultWorst.textContent = Number.isFinite(worst) ? `Worst color: ${formatVal(worst)}` : "Worst color: —";
  }
}

function updateBgControls() {
  if (!ui?.bgEnabled || !ui.bgColor) return;
  const enabled = ui.bgEnabled.checked;
  const row = ui.bgColor.closest(".bg-row");
  if (row) {
    row.classList.toggle("disabled", !enabled);
  }
  ui.bgColor.disabled = !enabled;
}

function togglePlaceholder() {
  if (!ui?.paletteInput) return;
  const hasValue = ui.paletteInput.value.trim().length > 0;
  if (hasValue) {
    ui.paletteInput.classList.remove("muted-input");
  } else {
    ui.paletteInput.classList.add("muted-input");
  }
  updatePaletteHighlight();
}

function updatePaletteHighlight() {
  const high = ui?.paletteHighlight;
  if (!high || !ui?.paletteInput) return;
  const raw = ui.paletteInput.value;
  const tokens = [];
  let lastIndex = 0;
  const regex = /#[0-9a-fA-F]{0,6}/g;
  let m;
  while ((m = regex.exec(raw)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ text: raw.slice(lastIndex, m.index), cls: "ph-other" });
    }
    const text = m[0];
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      tokens.push({ text, cls: "ph-valid" });
    } else {
      tokens.push({ text, cls: "ph-invalid" });
    }
    lastIndex = m.index + text.length;
  }
  if (lastIndex < raw.length) {
    tokens.push({ text: raw.slice(lastIndex), cls: "ph-other" });
  }
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  high.innerHTML = tokens.map((t) => `<span class="${t.cls}">${escape(t.text)}</span>`).join("");
  syncPaletteHighlightScroll();
}

function buildPaletteButtons() {
  if (!ui?.paletteGroups) return;
  ui.paletteGroups.innerHTML = "";
  ui.paletteGroups.classList.remove("show-all");
  paletteGroups.forEach((group, groupIdx) => {
    const wrap = document.createElement("div");
    wrap.className = "palette-group";
    if (groupIdx > 0) wrap.classList.add("hidden-group");
    const title = document.createElement("span");
    title.className = "palette-group-title";
    title.textContent = group.title;
    wrap.appendChild(title);
    group.palettes.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "palette-btn";
      btn.textContent = p.name;
      btn.addEventListener("click", () => appendPalette(p.colors));
      wrap.appendChild(btn);
    });
    ui.paletteGroups.appendChild(wrap);
  });
}

function appendPalette(colors) {
  const paletteStr = colors.join(" ");
  const hasValue = ui.paletteInput.value.trim().length > 0;
  ui.paletteInput.value = `${hasValue ? ui.paletteInput.value.trim() + " " : ""}${paletteStr}`;
  togglePlaceholder();
  state.rawInputOverride = null;
  state.keepInputOverride = false;
  if (ui.rawInputValues) ui.rawInputValues.value = "";
  state.bounds = computeInputBounds(ui.colorSpace.value);
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
  ensurePerInputConstraintState();
  renderPerInputConstraintUI();
  drawStatusMini(state, ui, currentVizOpts());
  history?.record();
}

function syncPaletteHighlightScroll() {
  if (!ui?.paletteInput || !ui?.paletteHighlight) return;
  ui.paletteHighlight.scrollTop = ui.paletteInput.scrollTop;
  ui.paletteHighlight.scrollLeft = ui.paletteInput.scrollLeft;
}
