import { defaultPalette, plotOrder } from "./config.js";
import { channelOrder } from "./core/colorSpaces.js";
import { contrastColor } from "./core/metrics.js";
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
let verboseRows = [];
let verboseTruncInfo = null;
let verboseBestScore = -Infinity;
let verboseBestRun = null;
const VERBOSE_MAX_ROWS = 4000;

function currentVizOpts() {
  return {
    clipToGamut: ui?.clipGamut ? ui.clipGamut.checked : false,
    gamutPreset: ui?.gamutPreset?.value || "srgb",
    gamutMode: ui?.gamutMode?.value || "auto",
  };
}

document.addEventListener("DOMContentLoaded", () => {
  ui = getUIRefs();
  createPanels(ui, plotOrder);
  setDefaultValues();
  buildPaletteButtons();
  attachEventListeners();
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
});

function setDefaultValues() {
  ui.paletteInput.value = "";
  ui.paletteInput.classList.add("muted-input");
  state.mutedInput = true;
  ui.colorSpace.value = "oklab";
  ui.colorwheelSpace.value = "oklab";
  if (ui.gamutMode) ui.gamutMode.value = "auto";
  if (ui.gamutPreset) ui.gamutPreset.value = "srgb";
  if (ui.clipGamut) ui.clipGamut.checked = false;
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
  verboseRows = [];
  verboseBestScore = -Infinity;
  verboseBestRun = null;
  renderVerboseTable();
  updateWidthChips();
  updateWidthLabels();
  updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
  state.lastRuns = Math.max(1, parseInt(ui.optimRuns.value, 10) || 20);
  state.newColors = [];
  state.rawCurrentColors = [];
  state.rawNewColors = [];
  state.rawBestColors = [];
  state.rawSpace = ui.colorSpace.value;
  state.newRawSpace = ui.colorSpace.value;
  setResults([], ui);
  state.bestScores = [];
  state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
  drawStatusGraph(state, ui);
  drawStatusMini(state, ui, currentVizOpts());
  logVerbose("palette", "", ui.paletteInput.value.trim());
  togglePlaceholder();
  updateBgControls();
  updatePaletteHighlight();
}

function attachEventListeners() {
  ui.paletteInput.addEventListener("input", () => {
    state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value), ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    togglePlaceholder();
    updatePaletteHighlight();
    drawStatusMini(state, ui, currentVizOpts());
  });
  ui.paletteInput.addEventListener("scroll", syncPaletteHighlightScroll);
  ui.paletteClear?.addEventListener("click", () => {
    ui.paletteInput.value = "";
    state.bounds = computeBoundsFromCurrent([], ui.colorSpace.value, { constrain: true, widths: getWidths(ui) });
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    togglePlaceholder();
    ui.paletteInput.focus();
    drawStatusMini(state, ui, currentVizOpts());
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
  ui.clipGamut?.addEventListener("change", () => {
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
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
  });
  ui.copyBtn.addEventListener("click", () => copyResults(ui, state));
  ui.formatQuotes.addEventListener("change", () => setResults(state.newColors, ui));
  ui.formatCommas.addEventListener("change", () => setResults(state.newColors, ui));
  ui.formatLines.addEventListener("change", () => setResults(state.newColors, ui));

  [ui.wH, ui.wSC, ui.wL].forEach((el) => {
    el.addEventListener("input", () => {
      updateWidthChips();
      updateBoundsAndRefresh();
      drawStatusMini(state, ui, currentVizOpts());
    });
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
  state.rawSpace = config.colorSpace;
  state.newRawSpace = config.colorSpace;
  state.running = true;
  ui.runBtn.disabled = true;
  ui.runBtn.textContent = "Running…";
  setStatus("starting optimizer…", 0, ui, state);
  setResults([], ui);
  state.bestScores = [];
  state.nmTrails = [];
  state.bestColors = [];
  state.rawBestColors = [];
  state.rawNewColors = [];
  verboseRows = [];
  verboseBestRun = null;
  verboseBestScore = -Infinity;
  renderVerboseTable();
  state.bounds = computeBoundsFromCurrent(palette, config.colorSpace, config);
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
    state.newColors = best.newHex || [];
    state.bestColors = state.newColors;
    state.rawNewColors = best.newRaw || [];
    state.rawBestColors = state.rawNewColors;
    state.newRawSpace = config.colorSpace;
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
    ui.runBtn.textContent = "RUN";
    if (ui.verboseToggle?.checked) renderVerboseTable();
    refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
    drawStatusMini(state, ui, currentVizOpts());
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
      const rowHtml = `<tr class="${runBreak ? "row-sep" : ""}">
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
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, currentVizOpts());
  drawStatusMini(state, ui, currentVizOpts());
}

function syncPaletteHighlightScroll() {
  if (!ui?.paletteInput || !ui?.paletteHighlight) return;
  ui.paletteHighlight.scrollTop = ui.paletteInput.scrollTop;
  ui.paletteHighlight.scrollLeft = ui.paletteInput.scrollLeft;
}
