import { defaultPalette, plotOrder } from "./config.js";
import { channelOrder } from "./core/colorSpaces.js";
import { computeBoundsFromCurrent } from "./optimizer/bounds.js";
import { optimizePalette } from "./optimizer/optimizePalette.js";
import { getUIRefs } from "./ui/domRefs.js";
import { getWidths, parsePalette, readConfig } from "./ui/configRead.js";
import { copyResults, setResults } from "./ui/resultsBox.js";
import { createInitialState } from "./ui/state.js";
import { showError, setStatus } from "./ui/status.js";
import { drawStatusGraph, drawStatusMini } from "./ui/statusGraph.js";
import { createPanels, refreshSwatches, updateChannelHeadings } from "./ui/panels.js";
import { paletteGroups } from "./palettes.js";

const state = createInitialState();
let ui = null;
let verboseLogs = [];

document.addEventListener("DOMContentLoaded", () => {
  ui = getUIRefs();
  createPanels(ui, plotOrder);
  setDefaultValues();
  buildPaletteButtons();
  attachEventListeners();
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
});

function setDefaultValues() {
  ui.paletteInput.value = "";
  ui.paletteInput.classList.add("muted-input");
  state.mutedInput = true;
  ui.colorSpace.value = "oklab";
  ui.colorwheelSpace.value = "oklab";
  if (ui.syncSpaces) ui.syncSpaces.checked = true;
  ui.colorsToAdd.value = "3";
  ui.optimRuns.value = "100";
  ui.nmIters.value = "260";
  ui.wH.value = "0";
  ui.wSC.value = "0";
  ui.wL.value = "0";
  ui.wNone.value = "6";
  ui.wDeutan.value = "6";
  ui.wProtan.value = "2";
  ui.wTritan.value = "0.1";
  if (ui.bgColor) ui.bgColor.value = "#ffffff";
  if (ui.bgEnabled) ui.bgEnabled.checked = true;
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
  drawStatusMini(state, ui);
  logVerbose("palette", "", ui.paletteInput.value.trim());
  togglePlaceholder();
  updateBgControls();
  updatePaletteHighlight();
}

function attachEventListeners() {
  ui.paletteInput.addEventListener("input", () => {
    state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
    togglePlaceholder();
    updatePaletteHighlight();
    drawStatusMini(state, ui);
  });
  ui.paletteInput.addEventListener("scroll", syncPaletteHighlightScroll);
  ui.paletteClear?.addEventListener("click", () => {
    ui.paletteInput.value = "";
    state.bounds = computeBoundsFromCurrent([], ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
    togglePlaceholder();
    ui.paletteInput.focus();
    drawStatusMini(state, ui);
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
    updateWidthLabels();
    if (ui.syncSpaces?.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    }
    updateBoundsAndRefresh();
    drawStatusMini(state, ui);
  });

  ui.colorwheelSpace.addEventListener("change", () => {
    if (ui.syncSpaces?.checked && ui.colorwheelSpace.value !== ui.colorSpace.value) {
      ui.syncSpaces.checked = false;
    }
    updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
    drawStatusMini(state, ui);
  });
  ui.syncSpaces?.addEventListener("change", () => {
    if (ui.syncSpaces.checked) {
      ui.colorwheelSpace.value = ui.colorSpace.value;
      updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
      refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
      drawStatusMini(state, ui);
    }
  });

  ui.runBtn.addEventListener("click", () => runOptimization());
  ui.resetBtn.addEventListener("click", () => {
    setDefaultValues();
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
    drawStatusMini(state, ui);
  });
  ui.copyBtn.addEventListener("click", () => copyResults(ui, state));
  ui.formatQuotes.addEventListener("change", () => setResults(state.newColors, ui));
  ui.formatCommas.addEventListener("change", () => setResults(state.newColors, ui));
  ui.formatLines.addEventListener("change", () => setResults(state.newColors, ui));

  [ui.wH, ui.wSC, ui.wL].forEach((el) => {
    el.addEventListener("input", () => {
      updateWidthChips();
      updateBoundsAndRefresh();
      drawStatusMini(state, ui);
    });
  });

  window.addEventListener("resize", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
    drawStatusMini(state, ui);
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
  drawStatusMini(state, ui);
}

async function runOptimization() {
  if (state.running) return;
  const palette = parsePalette(ui.paletteInput.value);
  if (!palette.length) {
    showError("Please enter at least one valid hex color.", ui);
    return;
  }
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
  state.running = true;
  ui.runBtn.disabled = true;
  ui.runBtn.textContent = "Running…";
  setStatus("starting optimizer…", 0, ui, state);
  setResults([], ui);
  state.bestScores = [];
  state.nmTrails = [];
  state.bestColors = [];
  state.bounds = computeBoundsFromCurrent(palette, config.colorSpace, config);
  drawStatusGraph(state, ui);
  drawStatusMini(state, ui);

  try {
    const best = await optimizePalette(paletteForOpt, config, {
      onProgress: async ({ run, pct, bestScore, startHex, endHex, bestHex }) => {
        state.bestScores.push(bestScore);
        state.nmTrails.push({ run, startHex, endHex });
        state.bestColors = bestHex || state.bestColors;
        setStatus(`restart ${run}/${config.nOptimRuns}`, pct, ui, state);
        drawStatusMini(state, ui);
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
    state.bestColors = state.newColors;
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
    drawStatusMini(state, ui);
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
  state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value);
  drawStatusMini(state, ui);
}

function syncPaletteHighlightScroll() {
  if (!ui?.paletteInput || !ui?.paletteHighlight) return;
  ui.paletteHighlight.scrollTop = ui.paletteInput.scrollTop;
  ui.paletteHighlight.scrollLeft = ui.paletteInput.scrollLeft;
}
