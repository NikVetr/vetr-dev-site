import { defaultPalette, plotOrder } from "./config.js";
import { channelOrder } from "./core/colorSpaces.js";
import { computeBoundsFromCurrent } from "./optimizer/bounds.js";
import { optimizePalette } from "./optimizer/optimizePalette.js";
import { getUIRefs } from "./ui/domRefs.js";
import { getWidths, parsePalette, readConfig } from "./ui/configRead.js";
import { copyResults, setResults } from "./ui/resultsBox.js";
import { createInitialState } from "./ui/state.js";
import { showError, setStatus } from "./ui/status.js";
import { drawStatusGraph } from "./ui/statusGraph.js";
import { createPanels, refreshSwatches, updateChannelHeadings } from "./ui/panels.js";

const state = createInitialState();
let ui = null;
let verboseLogs = [];

document.addEventListener("DOMContentLoaded", () => {
  ui = getUIRefs();
  createPanels(ui, plotOrder);
  setDefaultValues();
  attachEventListeners();
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
});

function setDefaultValues() {
  ui.paletteInput.value = defaultPalette;
  ui.paletteInput.classList.remove("muted-input");
  state.mutedInput = false;
  ui.colorSpace.value = "oklab";
  ui.colorwheelSpace.value = "oklab";
  if (ui.syncSpaces) ui.syncSpaces.checked = true;
  ui.colorsToAdd.value = "3";
  ui.optimRuns.value = "60";
  ui.nmIters.value = "260";
  ui.wH.value = "0";
  ui.wSC.value = "0";
  ui.wL.value = "0";
  ui.wNone.value = "6";
  ui.wDeutan.value = "6";
  ui.wProtan.value = "2";
  ui.wTritan.value = "0.1";
  ui.formatQuotes.checked = false;
  ui.formatCommas.checked = true;
  ui.formatLines.checked = false;
  ui.copyBtn.textContent = "Copy";
  verboseLogs = [];
  updateVerboseBox();
  updateWidthChips();
  updateWidthLabels();
  updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
  state.lastRuns = Math.max(1, parseInt(ui.optimRuns.value, 10) || 20);
  state.newColors = [];
  setResults([], ui);
  state.bestScores = [];
  state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
  drawStatusGraph(state, ui);
  logVerbose("palette", "", ui.paletteInput.value.trim());
}

function attachEventListeners() {
  ui.paletteInput.addEventListener("input", () => {
    state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
  });

  ui.colorSpace.addEventListener("change", () => {
    updateWidthLabels();
    if (ui.syncSpaces?.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    }
    updateBoundsAndRefresh();
  });

  ui.colorwheelSpace.addEventListener("change", () => {
    if (ui.syncSpaces?.checked && ui.colorwheelSpace.value !== ui.colorSpace.value) {
      ui.syncSpaces.checked = false;
    }
    updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
  });
  ui.syncSpaces?.addEventListener("change", () => {
    if (ui.syncSpaces.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
      refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
    }
  });

  ui.runBtn.addEventListener("click", () => runOptimization());
  ui.resetBtn.addEventListener("click", () => {
    setDefaultValues();
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
  });
  ui.copyBtn.addEventListener("click", () => copyResults(ui, state));
  ui.formatQuotes.addEventListener("change", () => setResults(state.newColors, ui));
  ui.formatCommas.addEventListener("change", () => setResults(state.newColors, ui));
  ui.formatLines.addEventListener("change", () => setResults(state.newColors, ui));

  [ui.wH, ui.wSC, ui.wL].forEach((el) => {
    el.addEventListener("input", () => {
      updateWidthChips();
      updateBoundsAndRefresh();
    });
  });

  window.addEventListener("resize", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
  });

  window.addEventListener("error", (e) => {
    if (ui && ui.errorText) {
      ui.errorText.textContent = e.message || "Unexpected error";
    }
  });

  ui.verboseToggle?.addEventListener("change", () => {
    ui.verboseBox.style.display = ui.verboseToggle.checked ? "block" : "none";
    updateVerboseBox();
  });
}

function updateWidthLabels() {
  const channels = channelOrder[ui.colorSpace.value];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1] || "s";
  ui.wHLabel.textContent = (channels[0] || "h").toUpperCase();
  ui.wSCLabel.textContent = scChannel.toUpperCase();
  ui.wLLabel.textContent = (channels[2] || "l").toUpperCase();
}

function updateWidthChips() {
  ui.wHVal.textContent = `${Math.round(parseFloat(ui.wH.value) * 100)}%`;
  ui.wSCVal.textContent = `${Math.round(parseFloat(ui.wSC.value) * 100)}%`;
  ui.wLVal.textContent = `${Math.round(parseFloat(ui.wL.value) * 100)}%`;
}

function updateBoundsAndRefresh() {
  state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
}

async function runOptimization() {
  if (state.running) return;
  const palette = parsePalette(ui.paletteInput.value);
  if (!palette.length) {
    showError("Please enter at least one valid hex color.", ui);
    return;
  }
  showError("", ui);
  const config = readConfig(ui, state);
  state.running = true;
  ui.runBtn.disabled = true;
  ui.runBtn.textContent = "Running…";
  setStatus("starting optimizer…", 0, ui, state);
  setResults([], ui);
  state.bestScores = [];
  state.bounds = computeBoundsFromCurrent(palette, config.colorSpace, config);
  drawStatusGraph(state, ui);

  try {
    const best = await optimizePalette(palette, config, {
      onProgress: async ({ run, pct, bestScore }) => {
        state.bestScores.push(bestScore);
        setStatus(`restart ${run}/${config.nOptimRuns}`, pct, ui, state);
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
        } else if (info.stage === "best") {
          logVerbose(`run ${info.run} best params`, "", paramPreview);
          logVerbose(`run ${info.run} best hex`, "", hexStr);
          if (info.score !== undefined) {
            logVerbose(`run ${info.run} best score`, "", info.score.toFixed(4));
          }
        }
      },
    });
    state.newColors = best.newHex || [];
    logVerbose("newColors", [], state.newColors);
    const convergence = best.meta?.reason || "finished";
    setStatus(`done. best score = ${(-best.value).toFixed(3)} (${convergence})`, 100, ui, state);
    setResults(state.newColors, ui);
  } catch (err) {
    showError(err.message || "Optimization failed.", ui);
    console.error(err);
  } finally {
    state.running = false;
    ui.runBtn.disabled = false;
    ui.runBtn.textContent = "Run optimization";
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
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
  updateVerboseBox();
}

function updateVerboseBox() {
  if (!ui?.verboseBox) return;
  if (!ui.verboseToggle?.checked) {
    ui.verboseBox.value = "";
    return;
  }
  ui.verboseBox.value = verboseLogs.join("\n");
}
