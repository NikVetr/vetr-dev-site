import { defaultPalette, plotOrder } from "./config.js";
import { channelOrder, decodeColor } from "./core/colorSpaces.js";
import { contrastColor, deltaE2000 } from "./core/metrics.js";
import { computeBoundsFromCurrent, computeBoundsFromRawValues } from "./optimizer/bounds.js";
import { optimizePalette } from "./optimizer/optimizePalette.js";
import { getUIRefs } from "./ui/domRefs.js";
import { getWidths, parsePalette, readConfig } from "./ui/configRead.js";
import { copyResults, setResults } from "./ui/resultsBox.js";
import { createInitialState } from "./ui/state.js";
import { showError, setStatus, setStatusState } from "./ui/status.js";
import { drawStatusGraph, drawStatusMini } from "./ui/statusGraph.js";
import { createPanels, refreshSwatches, updateChannelHeadings } from "./ui/panels.js";
import { attachVisualizationInteractions } from "./ui/interactions.js";
import { paletteGroups } from "./palettes.js";

const state = createInitialState();
let ui = null;
let verboseLogs = [];
let verboseRows = [];
let verboseTruncInfo = null;
let verboseBestScore = -Infinity;
let verboseBestRun = null;
const VERBOSE_MAX_ROWS = 4000;
const cvdScores = {
  none: 0,
  deutan: 0,
  protan: 0,
  tritan: 0,
};

let uniquenessValue = 0;
let lastOptSpace = null;

const DEFAULT_L_WIDTH = 0.65;

function currentVizOpts() {
  return {
    clipToGamut: ui?.clipGamut ? ui.clipGamut.checked : false,
    gamutPreset: ui?.gamutPreset?.value || "srgb",
    gamutMode: ui?.gamutMode?.value || "auto",
    cvdModel: ui?.cvdModel?.value || "legacy",
  };
}

document.addEventListener("DOMContentLoaded", () => {
  ui = getUIRefs();
  createPanels(ui, plotOrder);
  setDefaultValues();
  buildPaletteButtons();
  attachEventListeners();
  attachVisualizationInteractions(ui, state, plotOrder);
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
  updateResultNavigator();
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
  if (ui.modeH) ui.modeH.value = "hard";
  if (ui.modeSC) ui.modeSC.value = "hard";
  if (ui.modeL) ui.modeL.value = "hard";
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
  state.rawSpace = ui.colorSpace.value;
  state.newRawSpace = ui.colorSpace.value;
  setResults([], ui);
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

function constraintModeForSpace(space) {
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

function constraintConfigForSpace(space) {
  return {
    constrain: true,
    widths: getWidths(ui),
    constraintTopology: ui.constraintTopology?.value || "contiguous",
    aestheticMode: ui.aestheticMode?.value || "none",
    constraintMode: constraintModeForSpace(space),
  };
}

function computeInputBounds(space) {
  const config = constraintConfigForSpace(space);
  if (state.rawInputOverride?.space === space && state.rawInputOverride.values?.length) {
    return computeBoundsFromRawValues(state.rawInputOverride.values, space, config);
  }
  return computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), space, config);
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
  ui.paletteInput.addEventListener("input", () => {
    if (state.keepInputOverride) {
      state.keepInputOverride = false;
    } else {
      state.rawInputOverride = null;
      if (ui.rawInputValues) ui.rawInputValues.value = "";
    }
    state.bounds = computeInputBounds(ui.colorSpace.value);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    togglePlaceholder();
    updatePaletteHighlight();
    drawStatusMini(state, ui, currentVizOpts());
    setStatusState(ui, "Inputs changed", { stale: true });
  });
  ui.paletteInput.addEventListener("scroll", syncPaletteHighlightScroll);
  ui.paletteClear?.addEventListener("click", () => {
    ui.paletteInput.value = "";
    state.rawInputOverride = null;
    if (ui.rawInputValues) ui.rawInputValues.value = "";
    state.bounds = computeInputBounds(ui.colorSpace.value);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    togglePlaceholder();
    ui.paletteInput.focus();
    drawStatusMini(state, ui, currentVizOpts());
    setStatusState(ui, "Waiting to run");
  });
  ui.bgColor?.addEventListener("change", () => {
    updateBgControls();
  });
  ui.paletteMore?.addEventListener("click", () => {
    if (!ui.paletteGroups) return;
    ui.paletteGroups.classList.toggle("show-all");
    ui.paletteMore.textContent = ui.paletteGroups.classList.contains("show-all") ? "Less ▴" : "More ▾";
  });
  ui.bgEnabled?.addEventListener("change", () => updateBgControls());
  ui.bgColor?.addEventListener("change", () => updateBgControls());

  ui.colorSpace.addEventListener("change", () => {
    const nextSpace = ui.colorSpace.value;
    remapConstraintWidths(lastOptSpace, nextSpace);
    lastOptSpace = nextSpace;
    updateWidthLabels();
    if (ui.syncSpaces?.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    }
    updateClipWarning();
    updateBoundsAndRefresh();
    drawStatusMini(state, ui, currentVizOpts());
  });

  ui.colorwheelSpace.addEventListener("change", () => {
    if (ui.syncSpaces?.checked && ui.colorwheelSpace.value !== ui.colorSpace.value) {
      ui.syncSpaces.checked = false;
    }
    updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
  });
  ui.gamutMode?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
  });
  ui.gamutPreset?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
  });
  ui.cvdModel?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
  });
  ui.distanceMetric?.addEventListener("change", () => {
    // affects optimization only; no immediate redraw needed
  });
  ui.meanType?.addEventListener("change", () => {
    updateMeanControls(true);
  });
  ui.meanP?.addEventListener("input", () => {
    updateMeanControls(false);
  });
  ui.clipGamut?.addEventListener("change", () => {
    updateClipWarning();
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
  });
  ui.clipGamutOpt?.addEventListener("change", () => {
    // affects optimization only; no immediate redraw needed
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
  ui.syncSpaces?.addEventListener("change", () => {
    if (ui.syncSpaces.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
      refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
      drawStatusMini(state, ui, currentVizOpts());
    }
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
  });
  ui.copyBtn.addEventListener("click", () => copyResults(ui, state));
  ui.sendToInputBtn?.addEventListener("click", () => sendResultsToInput());
  const enforceWrapper = () => {
    const wrapR = ui.formatRC?.checked;
    const wrapPy = ui.formatPyList?.checked;
    if (wrapR || wrapPy) {
      if (ui.formatQuotes) ui.formatQuotes.checked = true;
      if (ui.formatCommas) ui.formatCommas.checked = true;
      if (ui.formatLines) ui.formatLines.checked = false;
    }
    setResults(state.newColors, ui);
  };
  ui.formatQuotes.addEventListener("change", () => enforceWrapper());
  ui.formatCommas.addEventListener("change", () => enforceWrapper());
  ui.formatLines.addEventListener("change", () => enforceWrapper());
  ui.formatRC?.addEventListener("change", () => {
    if (ui.formatRC.checked && ui.formatPyList) ui.formatPyList.checked = false;
    enforceWrapper();
  });
  ui.formatPyList?.addEventListener("change", () => {
    if (ui.formatPyList.checked && ui.formatRC) ui.formatRC.checked = false;
    enforceWrapper();
  });

  [ui.wH, ui.wSC, ui.wL].forEach((el) => {
    el.addEventListener("input", () => {
      updateWidthChips();
      updateClipWarning();
      updateBoundsAndRefresh();
      drawStatusMini(state, ui, currentVizOpts());
    });
  });

  [ui.modeH, ui.modeSC, ui.modeL, ui.constraintTopology, ui.aestheticMode].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      updateClipWarning();
      updateBoundsAndRefresh();
      drawStatusMini(state, ui, currentVizOpts());
    });
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
    el.addEventListener("change", () => normalizeAndUpdateWeights(key));
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
  setStatus("starting optimizer…", 0, ui, state);
  setStatusState(ui, "Running");
  setResults([], ui);
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
  if (state.rawInputOverride?.space === config.colorSpace && state.rawInputOverride.values?.length) {
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
      setResults(state.newColors, ui);
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
  const startHeaders = [
    "<th>Hex</th>",
    ...channels.map((c) => `<th>${c.toUpperCase()}</th>`),
    "<th>Dist</th>",
    "<th>Pen</th>",
    "<th>Gamut Dist</th>",
    "<th>Total</th>",
    "<th>Dist%</th>",
    "<th>Pen%</th>",
    "<th>Score</th>",
  ];
  const endHeaders = [
    '<th class="block-start">Hex</th>',
    ...channels.map((c) => `<th>${c.toUpperCase()}</th>`),
    "<th>Dist</th>",
    "<th>Pen</th>",
    "<th>Gamut Dist</th>",
    "<th>Total</th>",
    "<th>Dist%</th>",
    "<th>Pen%</th>",
    "<th>Score</th>",
  ];
  const diffHeaders = [
    ...channels.map((c, idx) => `<th${idx === 0 ? ' class="block-start"' : ""}>Δ${c.toUpperCase()}</th>`),
    '<th class="block-start">ΔDist</th>',
    "<th>ΔPen</th>",
    "<th>ΔGamut</th>",
    "<th>ΔTotal</th>",
    "<th>ΔDist%</th>",
    "<th>ΔPen%</th>",
    "<th>ΔScore</th>",
  ];
  const metaHeaders = [
    '<th class="block-start">Best Run</th>',
    "<th>Influence</th>",
    "<th>% Influence</th>",
    "<th>Rank</th>",
    "<th>Closest</th>",
    "<th>End Hex</th>",
    "<th>Closest Dist</th>",
  ];
  const totalCols =
    2 + startHeaders.length + endHeaders.length + diffHeaders.length + metaHeaders.length;
  const truncNote = verboseTruncInfo
    ? `<p class="muted warning">Verbose output truncated: removed ${verboseTruncInfo.droppedRows} row${
        verboseTruncInfo.droppedRows === 1 ? "" : "s"
      } this pass to stay under ${VERBOSE_MAX_ROWS} rows. Earliest shown run: ${
        verboseTruncInfo.firstKeptRun ?? "?"
      } (runs < ${verboseTruncInfo.firstKeptRun ?? "?"} are not displayed; estimated runs dropped: ${
        verboseTruncInfo.droppedRuns
      }).</p>`
    : "";
  const header = `
    <table class="verbose-table">
      <thead>
        <tr>
          <th rowspan="2">Run</th>
          <th rowspan="2">Idx</th>
          <th colspan="${startHeaders.length}">Start</th>
          <th colspan="${endHeaders.length}">End</th>
          <th colspan="${diffHeaders.length}">Difference (End - Start)</th>
          <th colspan="${metaHeaders.length}">Meta</th>
        </tr>
        <tr>
          ${startHeaders.join("")}
          ${endHeaders.join("")}
          ${diffHeaders.join("")}
          ${metaHeaders.join("")}
        </tr>
      </thead>
      <tbody>
  `;
  const grouped = {};
  verboseRows.forEach((row) => {
    const key = `${row.run}-${row.idx}`;
    if (!grouped[key]) grouped[key] = { run: row.run, idx: row.idx };
    if (row.stage === "start") grouped[key].start = row;
    if (row.stage === "end") grouped[key].end = row;
    if (row.stage === "best") grouped[key].best = row;
  });
  let bestRunSoFar = null;
  let bestScoreSoFar = -Infinity;
  const selectedRun =
    state.runRanking && state.selectedResultIdx
      ? state.runRanking[Math.max(0, Math.min(state.selectedResultIdx - 1, state.runRanking.length - 1))]?.run
      : null;
  const bestRunGlobal = state.runRanking && state.runRanking.length ? state.runRanking[0].run : null;
  const rows = Object.values(grouped)
    .sort((a, b) => a.run - b.run || a.idx - b.idx)
    .map((entry, i, arr) => {
      const start = entry.start || {};
      const end = entry.end || entry.best || {};
      const endScore = typeof end.score === "number" ? end.score : typeof start.score === "number" ? start.score : null;
      if (typeof endScore === "number" && endScore > bestScoreSoFar) {
        bestScoreSoFar = endScore;
        bestRunSoFar = entry.run;
      }
      const prev = arr[i - 1];
      const runBreak = !prev || prev.run !== entry.run;
      const spacer = "";
      const startCh = channels.map((c) => formatVal(start.channels?.[c]));
      const endCh = channels.map((c) => formatVal(end.channels?.[c]));
      const diffCh = channels.map((c) =>
        formatVal((end.channels?.[c] ?? 0) - (start.channels?.[c] ?? 0))
      );
      const diffCells = diffCh.map((v, idx3) => `<td${idx3 === 0 ? ' class="block-start"' : ""}>${v}</td>`);
      const deltaDistCell = `<td class="block-start">${formatVal((end.distance ?? 0) - (start.distance ?? 0))}</td>`;
      const startDistPct = relPart(start.distance, start.total);
      const startPenPct = relPart(start.penalty, start.total);
      const endDistPct = relPart(end.distance, end.total);
      const endPenPct = relPart(end.penalty, end.total);
      const diffDistPct = numDiff(endDistPct, startDistPct);
      const diffPenPct = numDiff(endPenPct, startPenPct);
      const isSelectedRun = selectedRun != null && entry.run === selectedRun;
      const isBestRun = bestRunGlobal != null && entry.run === bestRunGlobal;
      const rowHtml = `<tr class="${runBreak ? "row-sep" : ""} ${isSelectedRun ? "row-selected" : ""} ${isBestRun ? "row-best" : ""}">
        <td class="col-run">${entry.run}</td>
        <td class="col-run">${entry.idx}</td>
        <td class="col-start">${renderHex(start.hex, start.color)}</td>
        ${startCh.map((v) => `<td class="col-start">${v}</td>`).join("")}
        <td class="col-start">${formatVal(start.distance)}</td>
        <td class="col-start">${formatVal(start.penalty)}</td>
        <td class="col-start">${formatVal(start.gamutDistance)}</td>
        <td class="col-start">${formatVal(start.total)}</td>
        <td class="col-start">${formatVal(startDistPct)}</td>
        <td class="col-start">${formatVal(startPenPct)}</td>
        <td class="col-start">${formatVal(start.score)}</td>
        <td class="col-end block-start">${renderHex(end.hex, end.color)}</td>
        ${endCh.map((v) => `<td class="col-end">${v}</td>`).join("")}
        <td class="col-end">${formatVal(end.distance)}</td>
        <td class="col-end">${formatVal(end.penalty)}</td>
        <td class="col-end">${formatVal(end.gamutDistance)}</td>
        <td class="col-end">${formatVal(end.total)}</td>
        <td class="col-end">${formatVal(endDistPct)}</td>
        <td class="col-end">${formatVal(endPenPct)}</td>
        <td class="col-end">${formatVal(end.score)}</td>
        ${diffCells.join("")}
        ${deltaDistCell}
        <td>${formatVal((end.penalty ?? 0) - (start.penalty ?? 0))}</td>
        <td>${formatVal((end.gamutDistance ?? 0) - (start.gamutDistance ?? 0))}</td>
        <td>${formatVal((end.total ?? 0) - (start.total ?? 0))}</td>
        <td>${formatVal(diffDistPct)}</td>
        <td>${formatVal(diffPenPct)}</td>
        <td>${formatVal((end.score ?? 0) - (start.score ?? 0))}</td>
        <td class="col-meta block-start">${bestRunSoFar ?? ""}</td>
        <td class="col-meta">${formatVal(end.influence)}</td>
        <td class="col-meta">${formatVal(percentInfluence(end.influence, end.score))}</td>
        <td class="col-meta">${end.influenceRank ?? ""}</td>
        <td class="col-meta">${renderHex(end.closestHex, end.closestHex)}</td>
        <td class="col-meta">${renderHex(end.hex, end.color)}</td>
        <td class="col-meta">${formatVal(end.closestDist)}</td>
      </tr>`;
      return `${spacer}${rowHtml}`;
    });
  ui.verboseTable.innerHTML = `${truncNote}${header}${rows.join("")}</tbody></table>`;
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
  setResults(state.newColors, ui);
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
  drawStatusMini(state, ui, currentVizOpts());
}

function syncPaletteHighlightScroll() {
  if (!ui?.paletteInput || !ui?.paletteHighlight) return;
  ui.paletteHighlight.scrollTop = ui.paletteInput.scrollTop;
  ui.paletteHighlight.scrollLeft = ui.paletteInput.scrollLeft;
}
