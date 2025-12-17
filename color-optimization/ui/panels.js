import { plotOrder as plotOrderDefault } from "../config.js";
import { channelOrder, csRanges, decodeColor, effectiveRangeFromValues, rangeFromPreset, clampToRange } from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { contrastColor } from "../core/metrics.js";
import { normalize } from "../core/stats.js";
import { computeBoundsFromCurrent } from "../optimizer/bounds.js";
import { parsePalette, getWidths } from "./configRead.js";
import { channelGradientForSpace, drawWheel } from "./wheel.js";

export function createPanels(ui, plotOrder = plotOrderDefault) {
  ui.panelMap = {};
  ui.panels.innerHTML = "";
  plotOrder.forEach((type) => {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.dataset.cb = type;

    const title = document.createElement("h4");
    title.textContent = type === "none" ? "trichromacy" : `${type}-type simulation`;
    panel.appendChild(title);

    const labelRow = document.createElement("div");
    labelRow.className = "labels";

    const currentCol = document.createElement("div");
    currentCol.className = "swatch-column";
    const currHeader = document.createElement("div");
    currHeader.style.fontWeight = 600;
    currHeader.style.fontSize = "13px";
    currHeader.innerHTML = 'Input = <span class="legend-marker circle"></span>';
    currentCol.appendChild(currHeader);
    const currList = document.createElement("div");
    currentCol.appendChild(currList);

    const newCol = document.createElement("div");
    newCol.className = "swatch-column";
    const newHeader = document.createElement("div");
    newHeader.style.fontWeight = 600;
    newHeader.style.fontSize = "13px";
    newHeader.innerHTML = 'Output = <span class="legend-marker square"></span>';
    newCol.appendChild(newHeader);
    const newList = document.createElement("div");
    newCol.appendChild(newList);

    const channelWrapOuter = document.createElement("div");
    const channelHeadings = document.createElement("div");
    channelHeadings.className = "channel-headings";
    const headingSpans = [];
    ["H", "S/C", "L"].forEach((h) => {
      const span = document.createElement("div");
      span.textContent = h;
      channelHeadings.appendChild(span);
      headingSpans.push(span);
    });
    const channelWrap = document.createElement("div");
    channelWrap.className = "channel-bars";
    const channelBars = ["h", "s", "l"].map(() => {
      const bar = document.createElement("div");
      bar.className = "channel-bar";
      channelWrap.appendChild(bar);
      return { bar };
    });
    channelWrapOuter.appendChild(channelHeadings);
    channelWrapOuter.appendChild(channelWrap);

    labelRow.appendChild(currentCol);
    labelRow.appendChild(newCol);
    labelRow.appendChild(channelWrapOuter);
    panel.appendChild(labelRow);

    const wheel = document.createElement("div");
    wheel.className = "wheel";
    const canvas = document.createElement("canvas");
    wheel.appendChild(canvas);
    panel.appendChild(wheel);

    ui.panels.appendChild(panel);
    ui.panelMap[type] = {
      panel,
      currList,
      newList,
      channelBars,
      headingSpans,
      canvas,
    };
  });

  updateChannelHeadings(ui, ui.colorwheelSpace.value, plotOrder);
}

export function updateChannelHeadings(ui, vizSpace, plotOrder = plotOrderDefault) {
  const channels = channelOrder[vizSpace];
  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs) return;
    refs.headingSpans.forEach((span, idx) => {
      span.textContent = (channels[idx] || channels[channels.length - 1] || ["h", "s", "l"][idx] || "x").toUpperCase();
    });
  });
}

export function renderSwatchColumn(container, colors, type, shape) {
  container.innerHTML = "";
  if (!colors || !colors.length) {
    const empty = document.createElement("div");
    empty.style.color = "#94a3b8";
    empty.style.fontSize = "12px";
    empty.textContent = "—";
    container.appendChild(empty);
    return;
  }
  colors.forEach((c) => {
    const sw = document.createElement("div");
    sw.className = "swatch";
    const sim = applyCvdHex(c, type);
    const splitPct = type === "none" ? 1 : 0.1;
    if (type === "none") {
      sw.style.background = sim;
    } else {
      sw.style.background = `linear-gradient(90deg, ${c} 0%, ${c} ${splitPct * 100}%, ${sim} ${splitPct * 100}%, ${sim} 100%)`;
      const sep = document.createElement("div");
      sep.className = "swatch-separator";
      sep.style.left = `${splitPct * 100}%`;
      sep.style.background = contrastColor(sim);
      sw.appendChild(sep);
    }
    sw.style.color = contrastColor(sim);
    sw.style.justifyContent = "flex-end";
    sw.style.textAlign = "right";
    const label = document.createElement("span");
    label.className = "swatch-label";
    label.textContent = c;
    sw.appendChild(label);
    container.appendChild(sw);
  });
}

export function renderChannelBars(barObjs, current, added, type, state, ui, vizOpts = {}) {
  if (!barObjs) return;
  const barSpace = vizOpts.vizSpace || ui.colorwheelSpace.value || "hsl";
  const gamutMode = vizOpts.gamutMode || "auto";
  const clipToGamut = vizOpts.clipToGamut !== false;
  const gamutPreset = vizOpts.gamutPreset || "srgb";
  if (!csRanges[barSpace]) return;
  const hueBarOffsetDeg = 285;
  const rawCurrent = !clipToGamut && state.rawSpace === barSpace ? state.rawCurrentColors : null;
  const rawAdded = !clipToGamut && state.newRawSpace === barSpace ? state.rawNewColors : null;
  const combinedValues = [
    ...current.map((c, idx) => ({ color: c, shape: "circle", vals: rawCurrent?.[idx] || decodeColor(c, barSpace) })),
    ...added.map((c, idx) => ({ color: c, shape: "square", vals: rawAdded?.[idx] || decodeColor(c, barSpace) })),
  ];
  const valueSet = combinedValues.map((v) => v.vals);
  const presetRange = rangeFromPreset(barSpace, gamutPreset) || csRanges[barSpace];
  const baseRange = csRanges[barSpace];
  const ranges = gamutMode === "full"
    ? (clipToGamut ? presetRange : baseRange)
    : effectiveRangeFromValues(valueSet.concat([baseRange.min, baseRange.max]), barSpace);
  const hueBarOffsetNorm = hueBarOffsetDeg / (ranges.max.h - ranges.min.h || 360);
  const combined = combinedValues;

  const vizChannels = channelOrder[barSpace];
  const configs = vizChannels.map((key) => ({
    key,
    min: ranges.min[key],
    max: ranges.max[key],
  }));
  while (configs.length < 3) {
    configs.push({ key: vizChannels[vizChannels.length - 1] || "l", min: 0, max: 1 });
  }

  barObjs.forEach((obj, idx) => {
    const cfg = configs[idx];
    obj.bar.innerHTML = "";
    obj.bar.style.background = channelGradientForSpace(cfg.key, barSpace, type);
    obj.bar.dataset.key = cfg.key;
  });

  if (state.bounds && ui.colorSpace.value === barSpace) {
    const hueRange = ranges.max.h - ranges.min.h || 360;
    const baseRange = state.bounds.ranges || csRanges[barSpace];
    const isFull01 = (b) => Array.isArray(b) && b.length === 2 && b[0] <= 1e-6 && b[1] >= 1 - 1e-6;
    const overlays = configs.map((cfg, idx) => {
      const b = state.bounds.boundsByName?.[cfg.key];
      if (!b) return null;
      if (cfg.key !== "h" && isFull01(b)) return null;
      if (cfg.key === "h") {
        if (isFull01(b)) return null;
        return { idx, type: "h", range: b };
      }
      const baseMin = baseRange.min?.[cfg.key] ?? cfg.min;
      const baseMax = baseRange.max?.[cfg.key] ?? cfg.max;
      const minVal = b[0] * (baseMax - baseMin) + baseMin;
      const maxVal = b[1] * (baseMax - baseMin) + baseMin;
      const minN = clamp01(normalize(minVal, cfg.min, cfg.max));
      const maxN = clamp01(normalize(maxVal, cfg.min, cfg.max));
      return { idx, min: minN, max: maxN };
    }).filter(Boolean);

    overlays.forEach((o) => {
      const bar = o.idx >= 0 ? barObjs[o.idx]?.bar : null;
      if (!bar) return;
      if (o.type === "h" && o.range) {
        let [low, high] = o.range;
        low = (low - hueBarOffsetNorm + 1) % 1;
        high = (high - hueBarOffsetNorm + 1) % 1;
        const span = (high - low + 1) % 1 || 1;
        if (span >= 0.999) return;
        if (high < low) high += 1;
        const segments = high > 1 ? [[low, 1], [0, high - 1]] : [[low, high]];
        segments.forEach((seg) => {
          const overlayWhite = document.createElement("div");
          overlayWhite.style.position = "absolute";
          overlayWhite.style.left = "-3px";
          overlayWhite.style.right = "-3px";
          overlayWhite.style.top = `${seg[0] * 100}%`;
          overlayWhite.style.height = `${Math.max((seg[1] - seg[0]) * 100, 1)}%`;
          overlayWhite.style.background = "rgba(255,255,255,0.12)";
          overlayWhite.style.pointerEvents = "none";
          overlayWhite.style.borderTop = "2px dashed rgba(255,255,255,0.9)";
          overlayWhite.style.borderBottom = "2px dashed rgba(255,255,255,0.9)";
          const overlayBlack = overlayWhite.cloneNode(false);
          overlayBlack.style.background = "rgba(0,0,0,0.08)";
          overlayBlack.style.borderTop = "2px dashed rgba(0,0,0,0.75)";
          overlayBlack.style.borderBottom = "2px dashed rgba(0,0,0,0.75)";
          bar.appendChild(overlayWhite);
          bar.appendChild(overlayBlack);
        });
      } else if (o.min !== undefined && o.max !== undefined) {
        const heightPct = Math.max((o.max - o.min) * 100, 1);
        const overlayWhite = document.createElement("div");
        overlayWhite.style.position = "absolute";
        overlayWhite.style.left = "-3px";
        overlayWhite.style.right = "-3px";
        overlayWhite.style.top = `${o.min * 100}%`;
        overlayWhite.style.height = `${heightPct}%`;
        overlayWhite.style.background = "rgba(255,255,255,0.12)";
        overlayWhite.style.pointerEvents = "none";
        overlayWhite.style.borderTop = "2px dashed rgba(255,255,255,0.9)";
        overlayWhite.style.borderBottom = "2px dashed rgba(255,255,255,0.9)";
        const overlayBlack = overlayWhite.cloneNode(false);
        overlayBlack.style.background = "rgba(0,0,0,0.08)";
        overlayBlack.style.borderTop = "2px dashed rgba(0,0,0,0.75)";
        overlayBlack.style.borderBottom = "2px dashed rgba(0,0,0,0.75)";
        bar.appendChild(overlayWhite);
        bar.appendChild(overlayBlack);
      }
    });
  }

  combined.forEach((entry) => {
    const sim = applyCvdHex(entry.color, type);
    const decoded = clipToGamut ? clampToRange(entry.vals, presetRange, barSpace) : entry.vals;
    barObjs.forEach((obj, idx) => {
      const cfg = configs[idx];
      let val;
      if (cfg.key === "h") {
        const span = cfg.max - cfg.min || 360;
        const raw = decoded[cfg.key] ?? 0;
        val = (((raw - hueBarOffsetDeg - cfg.min) % span) + span) % span / span;
      } else {
        val = normalize(decoded[cfg.key] || 0, cfg.min, cfg.max);
      }
      const dot = document.createElement("div");
      dot.className = `channel-dot ${entry.shape === "square" ? "square" : ""}`;
      dot.style.top = `${val * 100}%`;
      dot.style.width = "12px";
      dot.style.height = "12px";
      dot.style.background = sim;
      dot.style.border = `2px solid ${contrastColor(sim)}`;
      obj.bar.appendChild(dot);
    });
  });
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function refreshSwatches(ui, state, plotOrder = plotOrderDefault, vizSpace, optSpace, gamutMode = "auto", vizOpts = {}) {
  const colors = parsePalette(ui.paletteInput.value);
  state.currentColors = colors;
  const colorSpace = optSpace || ui.colorSpace.value;
  state.rawSpace = colorSpace;
  state.rawCurrentColors = colors.map((hex) => decodeColor(hex, colorSpace));
  const resolvedVizSpace = vizSpace || ui.colorwheelSpace.value;
  state.bounds = computeBoundsFromCurrent(colors, colorSpace, { constrain: true, widths: getWidths(ui) });
  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs) return;
    refs.panel.style.display = "flex";
    renderSwatchColumn(refs.currList, colors, type, "circle");
    renderSwatchColumn(refs.newList, state.newColors, type, "square");
    renderChannelBars(refs.channelBars, state.currentColors, state.newColors, type, state, ui, {
      vizSpace: resolvedVizSpace,
      gamutMode,
      gamutPreset: vizOpts.gamutPreset,
      clipToGamut: vizOpts.clipToGamut,
    });
    drawWheel(type, ui, state, {
      vizSpace: resolvedVizSpace,
      gamutMode,
      gamutPreset: vizOpts.gamutPreset,
      clipToGamut: vizOpts.clipToGamut,
    });
  });
}
