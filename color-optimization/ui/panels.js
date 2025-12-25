import { plotOrder as plotOrderDefault } from "../config.js";
import { channelOrder, csRanges, decodeColor, effectiveRangeFromValues, rangeFromPreset, clampToRange } from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { contrastColor } from "../core/metrics.js";
import { normalize } from "../core/stats.js";
import { computeBoundsFromCurrent, computeBoundsFromRawValues } from "../optimizer/bounds.js";
import { parsePalette, getWidths } from "./configRead.js";
import { channelGradientForSpace, drawWheel, computeGamutRange } from "./wheel.js";

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

export function renderSwatchColumn(container, colors, type, shape, cvdModel = "legacy") {
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
    const sim = applyCvdHex(c, type, 1, cvdModel);
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
  const cvdModel = ui?.cvdModel?.value || "legacy";
  const gamutMode = vizOpts.gamutMode || "auto";
  const clipToGamut = vizOpts.clipToGamut !== false;
  const gamutPreset = vizOpts.gamutPreset || "srgb";
  if (!csRanges[barSpace]) return;
  const hueBarOffsetDeg = 285;
  const overrideCurrent =
    !clipToGamut && state.rawInputOverride?.space === barSpace
      ? state.rawInputOverride.values
      : null;
  const rawCurrent = overrideCurrent || (!clipToGamut && state.rawSpace === barSpace ? state.rawCurrentColors : null);
  const rawAdded = !clipToGamut && state.newRawSpace === barSpace ? state.rawNewColors : null;
  const combinedValues = [
    ...current.map((c, idx) => ({
      role: "input",
      index: idx,
      color: c,
      shape: "circle",
      vals: rawCurrent?.[idx] || decodeColor(c, barSpace),
    })),
    ...added.map((c, idx) => ({
      role: "output",
      index: idx,
      color: c,
      shape: "square",
      vals: rawAdded?.[idx] || decodeColor(c, barSpace),
    })),
  ];
  const valueSet = combinedValues.map((v) => v.vals);
  const presetRange =
    barSpace === "jzazbz"
      ? (computeGamutRange(barSpace, gamutPreset) || rangeFromPreset(barSpace, gamutPreset) || csRanges[barSpace])
      : (rangeFromPreset(barSpace, gamutPreset) || csRanges[barSpace]);
  const baseRange = barSpace === "jzazbz" ? presetRange : csRanges[barSpace];
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
    obj.bar.style.background = channelGradientForSpace(cfg.key, barSpace, type, cvdModel, ranges);
    obj.bar.dataset.key = cfg.key;
    obj.meta = {
      barSpace,
      ranges,
      cfg,
      hueBarOffsetDeg,
      clipToGamut,
      gamutPreset,
    };
  });
  barObjs.meta = {
    barSpace,
    ranges,
    configs,
    hueBarOffsetDeg,
    clipToGamut,
    gamutPreset,
  };

  if (state.bounds && ui.colorSpace.value === barSpace) {
    const baseRange = state.bounds.ranges || csRanges[barSpace];
    const constraintSets = state.bounds.constraintSets;
    const factors = [0.6745, 1.2816, 1.96];
    const toBar = (u, cfg) => {
      const baseMin = baseRange.min?.[cfg.key] ?? cfg.min;
      const baseMax = baseRange.max?.[cfg.key] ?? cfg.max;
      const val = u * (baseMax - baseMin) + baseMin;
      return clamp01(normalize(val, cfg.min, cfg.max));
    };

    configs.forEach((cfg, idx) => {
      const bar = barObjs[idx]?.bar;
      if (!bar || !constraintSets?.channels) return;
      const constraint = constraintSets.channels[cfg.key];
      if (!constraint) return;
      const mode = constraint.mode || "hard";

      if (cfg.key === "h") {
        const segments = normalizeHueSegments(constraint.intervalsRad || [], hueBarOffsetNorm);
        if (!segments.length || isFullSegments(segments)) return;
        if (mode === "hard") {
          const excluded = complementSegments(segments);
          excluded.forEach(([a, b]) => addFadeSegment(bar, a, b));
          segments.forEach(([a, b]) => {
            addBoundary(bar, a);
            addBoundary(bar, b);
          });
          return;
        }
        const contourEdges = [];
        (constraint.intervalsRad || []).forEach(([aRad, bRad]) => {
          const center = (aRad + bRad) / 2;
          const sigma = Math.max((bRad - aRad) / (2 * 1.96), 1e-3);
          factors.forEach((k) => {
            const start = center - k * sigma;
            const end = center + k * sigma;
            normalizeHueSegments([[start, end]], hueBarOffsetNorm)
              .forEach(([a, b]) => contourEdges.push(a, b));
          });
        });
        contourEdges.forEach((edge) => addBoundary(bar, edge));
        return;
      }

      const intervals = constraint.intervals || [];
      if (!intervals.length || (intervals.length === 1 && intervals[0][0] <= 1e-6 && intervals[0][1] >= 1 - 1e-6)) {
        return;
      }
      if (mode === "hard") {
        const mapped = intervals.map(([a, b]) => [toBar(a, cfg), toBar(b, cfg)]).filter(([a, b]) => b > a + 1e-6);
        const excluded = complementSegments(mapped);
        excluded.forEach(([a, b]) => addFadeSegment(bar, a, b));
        mapped.forEach(([a, b]) => {
          addBoundary(bar, a);
          addBoundary(bar, b);
        });
        return;
      }
      const contourEdges = [];
      intervals.forEach(([a, b]) => {
        const center = (a + b) / 2;
        const sigma = Math.max((b - a) / (2 * 1.96), 1e-3);
        factors.forEach((k) => {
          const start = clamp01(center - k * sigma);
          const end = clamp01(center + k * sigma);
          contourEdges.push(toBar(start, cfg), toBar(end, cfg));
        });
      });
      contourEdges.forEach((edge) => addBoundary(bar, edge));
    });
  }

  combined.forEach((entry) => {
    const sim = applyCvdHex(entry.color, type, 1, cvdModel);
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
      if (entry.role) dot.dataset.role = entry.role;
      if (Number.isFinite(entry.index)) dot.dataset.index = String(entry.index);
      dot.dataset.channel = cfg.key;
      obj.bar.appendChild(dot);
    });
  });
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function addFadeSegment(bar, start, end) {
  const a = clamp01(start);
  const b = clamp01(end);
  const span = b - a;
  if (span <= 1e-6) return;
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-3px";
  el.style.right = "-3px";
  el.style.top = `${a * 100}%`;
  el.style.height = `${Math.max(span * 100, 1)}%`;
  el.style.background = "rgba(255,255,255,0.60)";
  el.style.pointerEvents = "none";
  bar.appendChild(el);
}

function addBoundary(bar, at) {
  const y = clamp01(at) * 100;
  const makeSolid = (color) => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-3px";
    el.style.right = "-3px";
    el.style.top = `${y}%`;
    el.style.height = "2px";
    el.style.transform = "translateY(-1px)";
    el.style.pointerEvents = "none";
    el.style.background = color;
    return el;
  };
  const makeDashed = () => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-3px";
    el.style.right = "-3px";
    el.style.top = `${y}%`;
    el.style.height = "2px";
    el.style.transform = "translateY(-1px)";
    el.style.pointerEvents = "none";
    // Approximate canvas dash [6,4] using repeating-linear-gradient.
    el.style.backgroundImage =
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.80) 0 6px, rgba(0,0,0,0) 6px 10px)";
    return el;
  };
  // Solid white underlay + dashed black overlay (matches wheel/square styling).
  bar.appendChild(makeSolid("rgba(255,255,255,0.95)"));
  bar.appendChild(makeDashed());
}

function complementSegments(segments) {
  if (!segments?.length) return [[0, 1]];
  const sorted = segments
    .map(([a, b]) => [clamp01(a), clamp01(b)])
    .filter(([a, b]) => b > a + 1e-6)
    .sort((x, y) => x[0] - y[0]);
  if (!sorted.length) return [[0, 1]];
  const merged = [];
  sorted.forEach(([a, b]) => {
    const last = merged[merged.length - 1];
    if (!last || a > last[1] + 1e-6) merged.push([a, b]);
    else last[1] = Math.max(last[1], b);
  });
  const out = [];
  let cur = 0;
  merged.forEach(([a, b]) => {
    if (a > cur + 1e-6) out.push([cur, a]);
    cur = Math.max(cur, b);
  });
  if (cur < 1 - 1e-6) out.push([cur, 1]);
  return out;
}

function normalizeHueSegments(intervalsRad, hueBarOffsetNorm) {
  const segments = [];
  const TAU = Math.PI * 2;
  (intervalsRad || []).forEach(([aRad, bRad]) => {
    const span = bRad - aRad;
    if (span >= TAU - 1e-6) {
      segments.push([0, 1]);
      return;
    }
    const startNorm = ((aRad / TAU) % 1 + 1) % 1;
    const endNorm = ((bRad / TAU) % 1 + 1) % 1;
    const low = (startNorm - hueBarOffsetNorm + 1) % 1;
    const high = (endNorm - hueBarOffsetNorm + 1) % 1;
    if (low <= high) {
      segments.push([low, high]);
    } else {
      segments.push([0, high], [low, 1]);
    }
  });
  return mergeSegments(segments);
}

function mergeSegments(segments) {
  if (!segments?.length) return [];
  const sorted = segments
    .map(([a, b]) => [clamp01(a), clamp01(b)])
    .filter(([a, b]) => b > a + 1e-6)
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  sorted.forEach(([a, b]) => {
    const last = merged[merged.length - 1];
    if (!last || a > last[1] + 1e-6) merged.push([a, b]);
    else last[1] = Math.max(last[1], b);
  });
  return merged;
}

function isFullSegments(segments) {
  return segments.length === 1 && segments[0][0] <= 1e-6 && segments[0][1] >= 1 - 1e-6;
}

export function refreshSwatches(ui, state, plotOrder = plotOrderDefault, vizSpace, optSpace, gamutMode = "auto", vizOpts = {}) {
  const colors = parsePalette(ui.paletteInput.value);
  state.currentColors = colors;
  const colorSpace = optSpace || ui.colorSpace.value;
  state.rawSpace = colorSpace;
  const widths = getWidths(ui);
  if (state.rawInputOverride?.space === colorSpace && state.rawInputOverride.values?.length) {
    state.rawCurrentColors = state.rawInputOverride.values.map((v) => ({ ...v }));
    state.bounds = computeBoundsFromRawValues(state.rawInputOverride.values, colorSpace, { constrain: true, widths });
  } else {
    state.rawCurrentColors = colors.map((hex) => decodeColor(hex, colorSpace));
    state.bounds = computeBoundsFromCurrent(colors, colorSpace, { constrain: true, widths });
  }
  const resolvedVizSpace = vizSpace || ui.colorwheelSpace.value;
  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs) return;
    refs.panel.style.display = "flex";
    const cvdModel = ui?.cvdModel?.value || "legacy";
    renderSwatchColumn(refs.currList, colors, type, "circle", cvdModel);
    renderSwatchColumn(refs.newList, state.newColors, type, "square", cvdModel);
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
