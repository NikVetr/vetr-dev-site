import { plotOrder as plotOrderDefault } from "../config.js";
import {
  channelOrder,
  csRanges,
  convertColorValues,
  decodeColor,
  effectiveRangeFromValues,
  encodeColor,
  rangeFromPreset,
  clampToRange,
} from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { contrastColor } from "../core/metrics.js";
import { normalize } from "../core/stats.js";
import { metricJnd } from "../core/resolvability.js";
import { computeBoundsFromCurrent, computeBoundsFromRawValues } from "../optimizer/bounds.js";
import { parsePalette, readConstraintConfig } from "./configRead.js";
import { channelGradientForSpace, drawWheel } from "./wheel.js";
import { createResolvabilityPanel } from "./resolvability.js";

const resolvabilitySettings = {
  sync: true,
  mode: "heatmap",
  thresholdFactor: 2,
  perPanelMode: new Map(),
};

function resolvabilityModeFor(type) {
  if (resolvabilitySettings.sync) return resolvabilitySettings.mode;
  return resolvabilitySettings.perPanelMode.get(type) || resolvabilitySettings.mode;
}

function resolvabilityThreshold(metric) {
  return metricJnd(metric) * resolvabilitySettings.thresholdFactor;
}

export function createPanels(ui, plotOrder = plotOrderDefault) {
  ui.panelMap = {};
  ui.panels.innerHTML = "";

  const refreshResolvability = () => {
    const metric = ui.distanceMetric?.value || "de2000";
    const threshold = resolvabilityThreshold(metric);
    const cvdModel = ui?.cvdModel?.value || "legacy";
    const bg = ui?.bgEnabled?.checked ? ui.bgColor?.value || "#ffffff" : "#ffffff";
    plotOrder.forEach((type) => {
      const refs = ui.panelMap[type];
      if (!refs?.resolvability) return;
      const mode = resolvabilityModeFor(type);
      refs.resolvability.setMode(mode);
      refs.resolvability.setSync(resolvabilitySettings.sync);
      refs.resolvability.setThreshold(threshold, metric);
      refs.resolvability.update({
        colors: refs.resolvabilityColors || [],
        metric,
        threshold,
        mode,
        sync: resolvabilitySettings.sync,
        cvdModel,
        background: bg,
        onHighlightPair: refs.resolvabilityHighlightPair,
        onHighlightColor: refs.resolvabilityHighlightColor,
      });
    });
  };

  const handleModeChange = (mode, sourceType) => {
    if (resolvabilitySettings.sync) {
      resolvabilitySettings.mode = mode;
    } else {
      resolvabilitySettings.perPanelMode.set(sourceType, mode);
    }
    refreshResolvability();
  };

  const handleSyncChange = (sync, sourceType) => {
    const prevSync = resolvabilitySettings.sync;
    const prevMode = resolvabilitySettings.mode;
    const sourceMode = prevSync ? prevMode : (resolvabilitySettings.perPanelMode.get(sourceType) || prevMode);
    resolvabilitySettings.sync = sync;
    if (sync) {
      resolvabilitySettings.mode = sourceMode;
    } else {
      plotOrder.forEach((type) => {
        const mode = prevSync ? prevMode : (resolvabilitySettings.perPanelMode.get(type) || prevMode);
        resolvabilitySettings.perPanelMode.set(type, mode);
      });
    }
    refreshResolvability();
  };

  const handleThresholdChange = (value) => {
    const metric = ui.distanceMetric?.value || "de2000";
    const jnd = metricJnd(metric);
    resolvabilitySettings.thresholdFactor = jnd > 0 ? value / jnd : 0;
    refreshResolvability();
  };

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

    const resolvability = createResolvabilityPanel(type, {
      onModeChange: handleModeChange,
      onSyncChange: handleSyncChange,
      onThresholdChange: handleThresholdChange,
    });
    panel.appendChild(resolvability.root);

    ui.panels.appendChild(panel);
    ui.panelMap[type] = {
      type,
      panel,
      currList,
      newList,
      channelBars,
      headingSpans,
      canvas,
      resolvability,
      resolvabilityColors: [],
      resolvabilityHighlightPair: null,
      resolvabilityHighlightColor: null,
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

export function renderSwatchColumn(container, colors, type, shape, cvdModel = "legacy", onDelete = null) {
  container.innerHTML = "";
  if (!colors || !colors.length) {
    const empty = document.createElement("div");
    empty.style.color = "#94a3b8";
    empty.style.fontSize = "12px";
    empty.textContent = "—";
    container.appendChild(empty);
    return;
  }
  colors.forEach((c, idx) => {
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.position = "relative";
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

    // Add delete button (hover to show)
    if (onDelete) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "swatch-delete";
      deleteBtn.textContent = "\u00d7"; // × symbol
      // For CVD swatches, position button on the simulated color (right of separator)
      const leftPos = type === "none" ? "2px" : `calc(${splitPct * 100}% + 2px)`;
      deleteBtn.style.cssText = `
        position: absolute;
        top: 2px;
        left: ${leftPos};
        width: 14px;
        height: 14px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: rgba(220, 38, 38, 0.85);
        color: white;
        font-size: 12px;
        line-height: 12px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;
      `;
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onDelete(idx);
      });
      sw.appendChild(deleteBtn);
      sw.addEventListener("mouseenter", () => { deleteBtn.style.opacity = "1"; });
      sw.addEventListener("mouseleave", () => { deleteBtn.style.opacity = "0"; });
    }

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
  const constraintValues =
    ui.constraintTopology?.value === "custom" &&
    state.customConstraints?.values?.length &&
    state.customConstraints.space
      ? state.customConstraints.values.map((vals, idx) => {
        const resolved = state.customConstraints.space === barSpace
          ? vals
          : convertColorValues(vals, state.customConstraints.space, barSpace);
        return {
          role: "constraint",
          index: idx,
          color: encodeColor(resolved, barSpace),
          shape: "diamond",
          vals: resolved,
        };
      })
      : [];
  const valueSet = combinedValues.map((v) => v.vals);
  const presetRange = rangeFromPreset(barSpace, gamutPreset) || csRanges[barSpace];
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
    const topology = constraintSets?.topology || "contiguous";
    const useHardBoundaries = topology === "custom";
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
      const isDiscontiguous = topology === "discontiguous" || topology === "custom";

      if (cfg.key === "h") {
        const segments = normalizeHueSegments(constraint.intervalsRad || [], hueBarOffsetNorm);
        if (!segments.length || isFullSegments(segments)) return;

        if (isDiscontiguous && constraint.pointWindows?.length) {
          // Discontiguous mode: draw per-point windows
          if (mode === "hard") {
            const excluded = complementSegments(segments);
            excluded.forEach(([a, b]) => addFadeSegment(bar, a, b));
            constraint.pointWindows.forEach((w) => {
              if (!w) return;
              const centerNorm = ((w.center / (Math.PI * 2)) - hueBarOffsetNorm + 1) % 1;
              const radiusNorm = w.radius / (Math.PI * 2);
              const minBar = clamp01(centerNorm - radiusNorm);
              const maxBar = clamp01(centerNorm + radiusNorm);
              if (useHardBoundaries) {
                addBoundary(bar, minBar);
                addBoundary(bar, maxBar);
              } else {
                addPointWindowBoundary(bar, minBar);
                addPointWindowBoundary(bar, maxBar);
              }
            });
          } else {
            // Soft discontiguous: gradient fade around each point
            // Use quadratic scaling of width for smooth 0%->1% transition
            const widthFactor = Math.pow(clamp01(constraint.width ?? 0), 2);
            constraint.pointWindows.forEach((w) => {
              if (!w) return;
              const centerNorm = ((w.center / (Math.PI * 2)) - hueBarOffsetNorm + 1) % 1;
              const radiusNorm = w.radius / (Math.PI * 2);
              const baseStrength = clamp01(1 - 2 * radiusNorm);
              const strength = baseStrength * widthFactor;
              addSoftPointGradient(bar, centerNorm, radiusNorm, strength);
            });
            finalizeSoftDiscontiguousGradient(bar);
          }
        } else if (mode === "hard") {
          // Contiguous hard mode
          const excluded = complementSegments(segments);
          excluded.forEach(([a, b]) => addFadeSegment(bar, a, b));
          segments.forEach(([a, b]) => {
            addBoundary(bar, a);
            addBoundary(bar, b);
          });
        } else {
          // Contiguous soft mode: gradient fade from center
          // Use quadratic scaling of width for smooth 0%->1% transition
          const widthFactor = Math.pow(clamp01(constraint.width ?? 0), 2);
          (constraint.intervalsRad || []).forEach(([aRad, bRad]) => {
            const centerRad = (aRad + bRad) / 2;
            const sigmaRad = Math.max((bRad - aRad) / (2 * 1.96), 1e-3);
            const centerNorm = ((centerRad / (Math.PI * 2)) - hueBarOffsetNorm + 1) % 1;
            const sigmaNorm = sigmaRad / (Math.PI * 2);
            addSoftGradientFade(bar, centerNorm, sigmaNorm, widthFactor);
          });
        }
        return;
      }

      // Non-hue channels
      const intervals = constraint.intervals || [];
      if (!intervals.length || (intervals.length === 1 && intervals[0][0] <= 1e-6 && intervals[0][1] >= 1 - 1e-6)) {
        return;
      }

      if (isDiscontiguous && constraint.pointWindows?.length) {
        // Discontiguous mode: draw per-point windows
        if (mode === "hard") {
          const mapped = intervals.map(([a, b]) => [toBar(a, cfg), toBar(b, cfg)]).filter(([a, b]) => b > a + 1e-6);
          const excluded = complementSegments(mapped);
          excluded.forEach(([a, b]) => addFadeSegment(bar, a, b));
          constraint.pointWindows.forEach((w) => {
            if (!w) return;
            const minBar = toBar(w.min, cfg);
            const maxBar = toBar(w.max, cfg);
            if (useHardBoundaries) {
              addBoundary(bar, minBar);
              addBoundary(bar, maxBar);
            } else {
              addPointWindowBoundary(bar, minBar);
              addPointWindowBoundary(bar, maxBar);
            }
          });
        } else {
          // Soft discontiguous: gradient fade around each point
          // Use quadratic scaling of width for smooth 0%->1% transition
          const widthFactor = Math.pow(clamp01(constraint.width ?? 0), 2);
          constraint.pointWindows.forEach((w) => {
            if (!w) return;
            const centerBar = toBar(w.center, cfg);
            const radiusBar = Math.abs(toBar(w.max, cfg) - toBar(w.min, cfg)) / 2;
            const baseStrength = clamp01(1 - 2 * radiusBar);
            const strength = baseStrength * widthFactor;
            addSoftPointGradient(bar, centerBar, radiusBar, strength);
          });
          finalizeSoftDiscontiguousGradient(bar);
        }
      } else if (mode === "hard") {
        // Contiguous hard mode
        const mapped = intervals.map(([a, b]) => [toBar(a, cfg), toBar(b, cfg)]).filter(([a, b]) => b > a + 1e-6);
        const excluded = complementSegments(mapped);
        excluded.forEach(([a, b]) => addFadeSegment(bar, a, b));
        mapped.forEach(([a, b]) => {
          addBoundary(bar, a);
          addBoundary(bar, b);
        });
      } else {
        // Contiguous soft mode: gradient fade from center
        // Use quadratic scaling of width for smooth 0%->1% transition
        const widthFactor = Math.pow(clamp01(constraint.width ?? 0), 2);
        intervals.forEach(([a, b]) => {
          const centerNorm = (a + b) / 2;
          const sigmaNorm = Math.max((b - a) / (2 * 1.96), 1e-3);
          const centerBar = toBar(centerNorm, cfg);
          // Estimate sigma in bar coordinates
          const sigmaBar = Math.abs(toBar(centerNorm + sigmaNorm, cfg) - toBar(centerNorm, cfg));
          addSoftGradientFade(bar, centerBar, sigmaBar, widthFactor);
        });
      }
    });
  }

  const drawDots = (entry) => {
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
      dot.className = `channel-dot ${entry.shape === "square" ? "square" : ""} ${entry.role === "constraint" ? "constraint-dot" : ""}`;
      dot.style.top = `${val * 100}%`;
      const size = entry.role === "constraint" ? 10 : 12;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.background = sim;
      dot.style.border = `2px solid ${contrastColor(sim)}`;
      if (entry.role) dot.dataset.role = entry.role;
      if (Number.isFinite(entry.index)) dot.dataset.index = String(entry.index);
      dot.dataset.channel = cfg.key;
      obj.bar.appendChild(dot);
    });
  };

  combined.forEach(drawDots);
  constraintValues.forEach(drawDots);
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

// Soft constraint gradient - fades from transparent at center to white at edges
// Uses Gaussian-like falloff: more white = more penalty
function addSoftGradientFade(bar, centerNorm, sigmaNorm, strength = 1) {
  const maxOpacity = clamp01(strength);
  if (maxOpacity <= 1e-4) return;
  // Create gradient from center outward in both directions
  // Gaussian: opacity increases as distance from center increases

  // Upper fade (from center going up toward 0)
  if (centerNorm > 0.001) {
    const upperEl = document.createElement("div");
    upperEl.style.position = "absolute";
    upperEl.style.left = "-3px";
    upperEl.style.right = "-3px";
    upperEl.style.top = "0";
    upperEl.style.height = `${centerNorm * 100}%`;
    upperEl.style.pointerEvents = "none";
    // Gradient: white at top (0), fading to transparent at center
    // Gaussian falloff: opacity = maxOpacity * (1 - exp(-d²/2σ²))
    const stops = [];
    const nStops = 10;
    for (let i = 0; i <= nStops; i++) {
      const t = i / nStops; // 0 = top of region, 1 = center
      const distFromCenter = (1 - t) * centerNorm; // distance in normalized units
      const zScore = distFromCenter / Math.max(sigmaNorm, 1e-6);
      const gaussianFalloff = 1 - Math.exp(-0.5 * zScore * zScore);
      const opacity = maxOpacity * gaussianFalloff;
      stops.push(`rgba(255,255,255,${opacity.toFixed(3)}) ${(t * 100).toFixed(1)}%`);
    }
    upperEl.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
    bar.appendChild(upperEl);
  }

  // Lower fade (from center going down toward 1)
  if (centerNorm < 0.999) {
    const lowerEl = document.createElement("div");
    lowerEl.style.position = "absolute";
    lowerEl.style.left = "-3px";
    lowerEl.style.right = "-3px";
    lowerEl.style.top = `${centerNorm * 100}%`;
    lowerEl.style.height = `${(1 - centerNorm) * 100}%`;
    lowerEl.style.pointerEvents = "none";
    // Gradient: transparent at center (top), white at bottom (1)
    const stops = [];
    const nStops = 10;
    for (let i = 0; i <= nStops; i++) {
      const t = i / nStops; // 0 = center, 1 = bottom of region
      const distFromCenter = t * (1 - centerNorm);
      const zScore = distFromCenter / Math.max(sigmaNorm, 1e-6);
      const gaussianFalloff = 1 - Math.exp(-0.5 * zScore * zScore);
      const opacity = maxOpacity * gaussianFalloff;
      stops.push(`rgba(255,255,255,${opacity.toFixed(3)}) ${(t * 100).toFixed(1)}%`);
    }
    lowerEl.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
    bar.appendChild(lowerEl);
  }
}

// Soft constraint gradient for discontiguous mode - single gradient overlay
// This is a placeholder that will be called once per point, but the actual
// rendering happens in addSoftDiscontiguousGradient which considers ALL points
function addSoftPointGradient(bar, centerNorm, radiusNorm, strength = 1) {
  // Store point info on bar for later combined rendering
  if (!bar._softPoints) bar._softPoints = [];
  bar._softPoints.push({ center: centerNorm, radius: radiusNorm, strength: clamp01(strength) });
}

// Call this AFTER all addSoftPointGradient calls for a bar to render the combined overlay
function finalizeSoftDiscontiguousGradient(bar) {
  const points = bar._softPoints;
  if (!points || !points.length) return;
  delete bar._softPoints;

  const maxOpacity = clamp01(Math.max(...points.map((pt) => pt.strength ?? 1)));
  if (maxOpacity <= 1e-4) return;
  const nStops = 20;

  // Create a single gradient that considers distance to ALL point centers
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-3px";
  el.style.right = "-3px";
  el.style.top = "0";
  el.style.height = "100%";
  el.style.pointerEvents = "none";

  const stops = [];
  for (let i = 0; i <= nStops; i++) {
    const pos = i / nStops;

    // Find minimum z² to any point center
    let minZSq = Infinity;
    for (const pt of points) {
      const sigmaNorm = Math.max(pt.radius / 1.96, 1e-3);
      const dist = Math.abs(pos - pt.center);
      const z = dist / sigmaNorm;
      const zSq = z * z;
      if (zSq < minZSq) minZSq = zSq;
    }

    // Gaussian falloff based on minimum distance
    const gaussianFalloff = minZSq < 1e-6 ? 0 : 1 - Math.exp(-0.5 * minZSq);
    const opacity = maxOpacity * gaussianFalloff;
    stops.push(`rgba(255,255,255,${opacity.toFixed(3)}) ${(pos * 100).toFixed(1)}%`);
  }

  el.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
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

// Per-point window boundary for discontiguous mode
function addPointWindowBoundary(bar, at) {
  const y = clamp01(at) * 100;
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-3px";
  el.style.right = "-3px";
  el.style.top = `${y}%`;
  el.style.height = "1.5px";
  el.style.transform = "translateY(-0.75px)";
  el.style.pointerEvents = "none";
  el.style.backgroundImage =
    "repeating-linear-gradient(90deg, rgba(80,80,160,0.6) 0 2px, rgba(0,0,0,0) 2px 4px)";
  bar.appendChild(el);
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
  const constraintConfig = readConstraintConfig(ui, colorSpace, state);
  const topology = constraintConfig.constraintTopology || "contiguous";
  if (topology === "custom" && constraintConfig.customConstraintPoints?.length) {
    state.rawCurrentColors = colors.map((hex) => decodeColor(hex, colorSpace));
    state.bounds = computeBoundsFromRawValues(constraintConfig.customConstraintPoints, colorSpace, constraintConfig);
  } else if (state.rawInputOverride?.space === colorSpace && state.rawInputOverride.values?.length) {
    state.rawCurrentColors = state.rawInputOverride.values.map((v) => ({ ...v }));
    state.bounds = computeBoundsFromRawValues(state.rawInputOverride.values, colorSpace, constraintConfig);
  } else {
    state.rawCurrentColors = colors.map((hex) => decodeColor(hex, colorSpace));
    state.bounds = computeBoundsFromCurrent(colors, colorSpace, constraintConfig);
  }
  const resolvedVizSpace = vizSpace || ui.colorwheelSpace.value;
  // Get delete callbacks from state (set up in attachVisualizationInteractions)
  const deleteCallbacks = state.deleteCallbacks || {};
  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs) return;
    refs.panel.style.display = "flex";
    const cvdModel = ui?.cvdModel?.value || "legacy";
    renderSwatchColumn(refs.currList, colors, type, "circle", cvdModel, deleteCallbacks.onDeleteInput);
    renderSwatchColumn(refs.newList, state.newColors, type, "square", cvdModel, deleteCallbacks.onDeleteOutput);
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

    if (refs.resolvability) {
      const inputSwatches = Array.from(refs.currList.querySelectorAll(".swatch"));
      const outputSwatches = Array.from(refs.newList.querySelectorAll(".swatch"));
      const allSwatches = inputSwatches.concat(outputSwatches);
      const clearHighlight = () => {
        allSwatches.forEach((el) => el.classList.remove("is-highlight"));
      };
      const highlightIndices = (indices) => {
        clearHighlight();
        (indices || []).forEach((idx) => {
          const el = allSwatches[idx];
          if (el) el.classList.add("is-highlight");
        });
      };
      const onHighlightPair = (i, j) => {
        if (!Number.isFinite(i) || !Number.isFinite(j)) {
          clearHighlight();
          return;
        }
        highlightIndices([i, j]);
      };
      const onHighlightColor = (i) => {
        if (!Number.isFinite(i)) {
          clearHighlight();
          return;
        }
        highlightIndices([i]);
      };
      const combined = colors.concat(state.newColors || []);
      const inputCount = colors.length;
      const metric = ui.distanceMetric?.value || "de2000";
      const threshold = resolvabilityThreshold(metric);
      const mode = resolvabilityModeFor(type);
      const bg = ui?.bgEnabled?.checked ? ui.bgColor?.value || "#ffffff" : "#ffffff";
      refs.resolvabilityColors = combined;
      refs.resolvabilityHighlightPair = onHighlightPair;
      refs.resolvabilityHighlightColor = onHighlightColor;
      refs.resolvability.update({
        colors: combined,
        inputCount,
        metric,
        threshold,
        mode,
        sync: resolvabilitySettings.sync,
        cvdModel,
        background: bg,
        onHighlightPair,
        onHighlightColor,
      });
    }
  });
}
