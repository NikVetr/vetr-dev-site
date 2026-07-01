import { plotOrder as plotOrderDefault } from "../config.js";
import {
  channelOrder,
  csRanges,
  convertColorValues,
  decodeColor,
  effectiveRangeFromValues,
  encodeColor,
  rangeFromPreset,
  projectToGamut,
  normalizeWithRange,
} from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { contrastColor } from "../core/metrics.js";
import { normalize } from "../core/stats.js";
import { metricJnd } from "../core/resolvability.js";
import { activeConstraintSets } from "../core/activeConstraints.js";
import { computeBoundsFromCurrent, computeBoundsFromRawValues } from "../optimizer/bounds.js";
import { parsePalette, readConstraintConfig } from "./configRead.js";
import { channelGradientForSpace, drawWheel } from "./wheel.js";
import { createResolvabilityPanel } from "./resolvability.js";

const resolvabilitySettings = {
  sync: true,
  mode: "heatmap",
  thresholdFactor: 2,
  untweakTweaks: false,
  perPanelMode: new Map(),
};

export function buildResolvabilityColorEntries(inputColors = [], outputColors = [], roles = [], activeTweakIndices = null, options = {}) {
  const roleRows = Array.isArray(roles) && roles.length === outputColors.length ? roles : [];
  const activeTweaks = activeTweakIndices == null ? null : new Set(activeTweakIndices || []);
  const untweak = Boolean(options.untweakTweaks);
  const replacedInputIndices = new Set();
  roleRows.forEach((role) => {
    if (
      role?.kind === "tweak" &&
      Number.isFinite(role.inputIndex) &&
      (!activeTweaks || activeTweaks.has(role.inputIndex))
    ) {
      replacedInputIndices.add(Math.floor(role.inputIndex));
    }
  });

  const entries = [];
  inputColors.forEach((hex, inputIndex) => {
    if (replacedInputIndices.has(inputIndex)) return;
    entries.push({ hex, kind: "input", inputIndex });
  });
  const inputCount = entries.length;

  outputColors.forEach((hex, outputIndex) => {
    const role = roleRows[outputIndex] || null;
    const isActiveTweak =
      role?.kind === "tweak" &&
      Number.isFinite(role.inputIndex) &&
      (!activeTweaks || activeTweaks.has(role.inputIndex));
    if (untweak && isActiveTweak) {
      const sourceInputIndex = Math.floor(role.inputIndex);
      entries.push({
        hex: inputColors[sourceInputIndex] || hex,
        kind: "untweak",
        inputIndex: sourceInputIndex,
        outputIndex,
        sourceInputIndex,
      });
      return;
    }
    entries.push({
      hex,
      kind: isActiveTweak ? "tweak" : "output",
      outputIndex,
      sourceInputIndex: isActiveTweak
        ? Math.floor(role.inputIndex)
        : null,
    });
  });

  return {
    entries,
    colors: entries.map((entry) => entry.hex),
    inputCount,
  };
}

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
      refs.resolvabilityRefresh?.();
      const mode = resolvabilityModeFor(type);
      refs.resolvability.setMode(mode);
      refs.resolvability.setSync(resolvabilitySettings.sync);
      refs.resolvability.setThreshold(threshold, metric);
      refs.resolvability.update({
        colors: refs.resolvabilityColors || [],
        inputCount: refs.resolvabilityInputCount || 0,
        sortColors: refs.resolvabilitySortColors || null,
        showUntweak: Boolean(refs.resolvabilityHasTweakOutputs),
        untweak: resolvabilitySettings.untweakTweaks,
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

  const handleUntweakChange = (untweak) => {
    resolvabilitySettings.untweakTweaks = Boolean(untweak);
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
      onUntweakChange: handleUntweakChange,
    });
    panel.appendChild(resolvability.root);

    ui.panels.appendChild(panel);
    ui.panelMap[type] = {
      type,
      panel,
      labelRow,
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

export function renderSwatchColumn(container, colors, type, shape, cvdModel = "legacy", onDelete = null, options = {}) {
  container.innerHTML = "";
  if (!colors || !colors.length) {
    const empty = document.createElement("div");
    empty.style.color = "#94a3b8";
    empty.style.fontSize = "12px";
    empty.textContent = "—";
    container.appendChild(empty);
    return;
  }
  const tweaked = new Set(options.tweakedInputIndices || []);
  colors.forEach((entry, idx) => {
    const item = typeof entry === "string" ? { hex: entry } : (entry || {});
    const c = item.hex;
    if (!c && item.placeholder) {
      const placeholder = document.createElement("div");
      placeholder.className = "swatch swatch-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      container.appendChild(placeholder);
      return;
    }
    const sw = document.createElement("div");
    sw.className = `swatch${item.tweaked ? " is-tweaked" : ""}${item.tweakOutput ? " is-tweak-output" : ""}`;
    if (Number.isFinite(item.inputIndex)) sw.dataset.inputIndex = String(item.inputIndex);
    if (Number.isFinite(item.sourceInputIndex)) sw.dataset.sourceInputIndex = String(item.sourceInputIndex);
    if (Number.isFinite(item.outputIndex)) sw.dataset.outputIndex = String(item.outputIndex);
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
    const controlLeftPos = type === "none" ? "2px" : `calc(${splitPct * 100}% + 2px)`;
    const tweakLabelLeftPos = type === "none" ? "4px" : `calc(${splitPct * 100}% + 1px)`;
    const controlTextColor = contrastColor(sim);
    const hoverTweakIndex = Number.isFinite(item.inputIndex)
      ? item.inputIndex
      : Number.isFinite(item.sourceInputIndex)
        ? item.sourceInputIndex
        : null;
    if (Number.isFinite(hoverTweakIndex) && (item.tweaked || item.tweakOutput) && options.onTweakHover) {
      const enterTweakHover = () => options.onTweakHover(hoverTweakIndex);
      const leaveTweakHover = (evt) => {
        if (evt?.relatedTarget && sw.contains(evt.relatedTarget)) return;
        options.onTweakHover(null);
      };
      sw.addEventListener("mouseenter", enterTweakHover);
      sw.addEventListener("mouseover", enterTweakHover);
      sw.addEventListener("pointerenter", enterTweakHover);
      sw.addEventListener("mouseleave", leaveTweakHover);
      sw.addEventListener("mouseout", leaveTweakHover);
      sw.addEventListener("pointerleave", leaveTweakHover);
      sw.addEventListener("focusin", () => options.onTweakHover(hoverTweakIndex));
      sw.addEventListener("focusout", () => options.onTweakHover(null));
    }

    // Add delete button (hover to show)
    if (onDelete) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "swatch-delete";
      deleteBtn.textContent = "\u00d7"; // × symbol
      // For CVD swatches, position button on the simulated color (right of separator)
      deleteBtn.style.cssText = `
        position: absolute;
        top: 2px;
        left: ${controlLeftPos};
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
        onDelete(Number.isFinite(item.outputIndex) ? item.outputIndex : idx);
      });
      sw.appendChild(deleteBtn);
      sw.addEventListener("mouseenter", () => { deleteBtn.style.opacity = "1"; });
      sw.addEventListener("mouseleave", () => { deleteBtn.style.opacity = "0"; });
    }

    if (options.onToggleTweak && shape === "circle") {
      const sourceIdx = Number.isFinite(item.inputIndex) ? item.inputIndex : idx;
      const tweakBtn = document.createElement("button");
      tweakBtn.className = "swatch-tweak";
      tweakBtn.type = "button";
      tweakBtn.textContent = "tweak";
      tweakBtn.setAttribute("aria-pressed", String(tweaked.has(sourceIdx)));
      tweakBtn.title = tweaked.has(sourceIdx) ? "Disable tweaking for this input color" : "Optimize this input color";
      tweakBtn.style.left = tweakLabelLeftPos;
      tweakBtn.style.color = controlTextColor;
      tweakBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        options.onToggleTweak(sourceIdx);
      });
      sw.appendChild(tweakBtn);
    }

    if (item.tweakOutput) {
      const tweakLabel = document.createElement("span");
      tweakLabel.className = "swatch-tweak-label";
      tweakLabel.textContent = "tweaked";
      tweakLabel.style.left = tweakLabelLeftPos;
      tweakLabel.style.color = controlTextColor;
      sw.appendChild(tweakLabel);
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
  const preview = state.customConstraintPreview;
  const hasPreview =
    preview &&
    preview.panelType === type &&
    preview.space &&
    preview.values &&
    ui.colorSpace?.value === barSpace;
  const previewVals =
    hasPreview
      ? preview.space === barSpace
        ? preview.values
        : convertColorValues(preview.values, preview.space, barSpace)
      : null;
  const previewWidths = hasPreview && preview.space === barSpace ? (preview.widths || {}) : {};
  const previewConstraintValues =
    previewVals
      ? [{
        role: "constraint",
        index: null,
        color: encodeColor(previewVals, barSpace),
        shape: "diamond",
        vals: previewVals,
      }]
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
    const rawConstraintSets = activeConstraintSets(state.bounds, {
      constraintTopology: ui.constraintTopology?.value || "contiguous",
      individualConstraintsReplaceGlobal:
        (ui.constraintTopology?.value || "contiguous") === "discontiguous" &&
        Boolean(state.perInputConstraints?.enabled) &&
        !state.perInputConstraints.autoEnabledForTweaks,
    });
    const filterTweakPointWindows = (constraintSets) => {
      const topology = constraintSets?.topology || "contiguous";
      if (topology !== "discontiguous" || !constraintSets?.channels) return constraintSets;
      const channels = {};
      Object.entries(constraintSets.channels).forEach(([ch, channel]) => {
        if (!Array.isArray(channel?.pointWindows) || !Array.isArray(channel?.pointModes)) {
          channels[ch] = channel;
          return;
        }
        const allSoft = channel.pointModes.length > 0 && channel.pointModes.every((mode) => mode === "soft");
        const allHard = channel.pointModes.length > 0 && channel.pointModes.every((mode) => mode === "hard");
        channels[ch] = {
          ...channel,
          mode: allSoft ? "soft" : allHard ? "hard" : channel.mode,
        };
      });
      return { ...constraintSets, channels };
    };
    const constraintSets = filterTweakPointWindows(rawConstraintSets);
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
      if (isDiscontiguous && !constraint.pointWindows?.length) return;

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

  if (previewVals) {
    const baseRange = state.bounds?.ranges || csRanges[barSpace];
    const norm = normalizeWithRange(previewVals, baseRange, barSpace);
    const toBar = (u, cfg) => {
      const baseMin = baseRange.min?.[cfg.key] ?? cfg.min;
      const baseMax = baseRange.max?.[cfg.key] ?? cfg.max;
      const val = u * (baseMax - baseMin) + baseMin;
      return clamp01(normalize(val, cfg.min, cfg.max));
    };

    configs.forEach((cfg, idx) => {
      const bar = barObjs[idx]?.bar;
      if (!bar) return;
      const width = clamp01(previewWidths[cfg.key] ?? 0);
      if (width <= 0) return;
      if (cfg.key === "h") {
        const center = (((norm.h ?? 0) - hueBarOffsetNorm) % 1 + 1) % 1;
        const radius = Math.max((1 - width) * 0.5, 0);
        const min = center - radius;
        const max = center + radius;
        addPreviewWindow(bar, min, max, true);
        return;
      }
      const radius = Math.max((1 - width) * 0.5, 0);
      const window = linearWindowFromCenter(clamp01(norm[cfg.key] ?? 0.5), radius);
      addPreviewWindow(bar, toBar(window.min, cfg), toBar(window.max, cfg), false);
    });
  }

  const drawDots = (entry) => {
    const sim = applyCvdHex(entry.color, type, 1, cvdModel);
    const decoded = clipToGamut
      ? projectToGamut(entry.vals, barSpace, gamutPreset, barSpace)
      : entry.vals;
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
  previewConstraintValues.forEach(drawDots);
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function linearWindowFromCenter(center, radius) {
  let min = center - radius;
  let max = center + radius;
  if (min < 0) {
    max -= min;
    min = 0;
  }
  if (max > 1) {
    min -= max - 1;
    max = 1;
  }
  return { min: clamp01(min), max: clamp01(max) };
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

function addPreviewWindow(bar, start, end, wraps = false) {
  const drawSegment = (a, b) => {
    const lo = clamp01(a);
    const hi = clamp01(b);
    if (hi - lo > 1e-6) addPreviewFill(bar, lo, hi);
    addPreviewBoundary(bar, lo);
    addPreviewBoundary(bar, hi);
  };
  if (wraps) {
    let a = ((start % 1) + 1) % 1;
    let b = ((end % 1) + 1) % 1;
    const span = end - start;
    if (span >= 0.999) return;
    if (a <= b) drawSegment(a, b);
    else {
      drawSegment(0, b);
      drawSegment(a, 1);
    }
    return;
  }
  drawSegment(start, end);
}

function addPreviewFill(bar, start, end) {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-3px";
  el.style.right = "-3px";
  el.style.top = `${start * 100}%`;
  el.style.height = `${Math.max((end - start) * 100, 1)}%`;
  el.style.background = "rgba(20,184,166,0.18)";
  el.style.pointerEvents = "none";
  bar.appendChild(el);
}

function addPreviewBoundary(bar, at) {
  const y = clamp01(at) * 100;
  const under = document.createElement("div");
  under.style.position = "absolute";
  under.style.left = "-4px";
  under.style.right = "-4px";
  under.style.top = `${y}%`;
  under.style.height = "4px";
  under.style.transform = "translateY(-2px)";
  under.style.pointerEvents = "none";
  under.style.background = "rgba(255,255,255,0.95)";
  bar.appendChild(under);

  const line = document.createElement("div");
  line.style.position = "absolute";
  line.style.left = "-4px";
  line.style.right = "-4px";
  line.style.top = `${y}%`;
  line.style.height = "3px";
  line.style.transform = "translateY(-1.5px)";
  line.style.pointerEvents = "none";
  line.style.background = "rgba(20,184,166,0.78)";
  bar.appendChild(line);
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

export function buildOutputSwatchEntries(inputColors, outputColors, roles = [], activeTweakIndices = []) {
  if (!Array.isArray(outputColors) || !outputColors.length) return outputColors || [];
  const roleRows = Array.isArray(roles) && roles.length === outputColors.length ? roles : null;
  if (!roleRows) return outputColors;
  const activeTweaks = new Set(activeTweakIndices || []);
  const byInput = new Map();
  const added = [];
  roleRows.forEach((role, outputIndex) => {
    const isActiveTweak = role?.kind === "tweak" && Number.isFinite(role.inputIndex) && activeTweaks.has(role.inputIndex);
    const entry = {
      hex: outputColors[outputIndex],
      outputIndex,
      tweakOutput: isActiveTweak,
      sourceInputIndex: isActiveTweak ? role.inputIndex : null,
    };
    if (isActiveTweak) byInput.set(role.inputIndex, entry);
    else added.push(entry);
  });
  if (!byInput.size) return added;
  const maxTweakInputIndex = Math.max(...byInput.keys());
  const rows = [];
  let addedCursor = 0;
  inputColors.slice(0, maxTweakInputIndex + 1).forEach((_, inputIndex) => {
    if (byInput.has(inputIndex)) rows.push(byInput.get(inputIndex));
    else if (addedCursor < added.length) rows.push(added[addedCursor++]);
    else rows.push({ placeholder: true, sourceInputIndex: inputIndex });
  });
  return rows.concat(added.slice(addedCursor));
}

function drawSwatchConnectors(refs) {
  if (!refs?.labelRow || !refs.currList || !refs.newList) return;
  refs.labelRow.querySelector(".swatch-connector-overlay")?.remove();
  const outputs = Array.from(refs.newList.querySelectorAll(".swatch.is-tweak-output"));
  if (!outputs.length) return;

  const hostRect = refs.labelRow.getBoundingClientRect();
  if (!hostRect.width || !hostRect.height) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("swatch-connector-overlay");
  svg.setAttribute("viewBox", `0 0 ${hostRect.width} ${hostRect.height}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const makeLine = (x1, y1, x2, y2) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", "#0f172a");
    line.setAttribute("stroke-width", "1.8");
    line.setAttribute("stroke-linecap", "round");
    return line;
  };

  outputs.forEach((outEl) => {
    const sourceIdx = parseInt(outEl.dataset.sourceInputIndex || "", 10);
    if (!Number.isFinite(sourceIdx)) return;
    const inputEl = refs.currList.querySelector(`.swatch[data-input-index="${sourceIdx}"]`);
    if (!inputEl) return;
    const inRect = inputEl.getBoundingClientRect();
    const outRect = outEl.getBoundingClientRect();
    const x1 = inRect.right - hostRect.left;
    const y1 = inRect.top + inRect.height / 2 - hostRect.top;
    const x2 = outRect.left - hostRect.left;
    const y2 = outRect.top + outRect.height / 2 - hostRect.top;
    svg.appendChild(makeLine(x1, y1, x2, y2));
  });

  refs.labelRow.appendChild(svg);
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
  const tweakedInputIndices = Array.isArray(state.tweakInputIndices) ? state.tweakInputIndices : [];
  const inputEntries = colors.map((hex, idx) => ({ hex, inputIndex: idx, tweaked: tweakedInputIndices.includes(idx) }));
  const outputEntries = buildOutputSwatchEntries(colors, state.newColors || [], state.optimizedColorRoles || [], tweakedInputIndices);
  const setHoveredTweakInput = (idx) => {
    const next = Number.isFinite(idx) ? Math.floor(idx) : null;
    if ((state.hoveredTweakInputIndex ?? null) === next) return;
    state.hoveredTweakInputIndex = next;
    plotOrder.forEach((panelType) => drawWheel(panelType, ui, state, {
      ...vizOpts,
      vizSpace: resolvedVizSpace,
      gamutMode,
    }));
  };
  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs) return;
    refs.panel.style.display = "flex";
    const cvdModel = ui?.cvdModel?.value || "legacy";
    renderSwatchColumn(refs.currList, inputEntries, type, "circle", cvdModel, deleteCallbacks.onDeleteInput, {
      tweakedInputIndices,
      onToggleTweak: deleteCallbacks.onToggleTweak,
      onTweakHover: setHoveredTweakInput,
    });
    renderSwatchColumn(refs.newList, outputEntries, type, "square", cvdModel, deleteCallbacks.onDeleteOutput, {
      onTweakHover: setHoveredTweakInput,
    });
    drawSwatchConnectors(refs);
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
      refs.resolvabilityRefresh = () => {
        const inputSwatches = Array.from(refs.currList.querySelectorAll(".swatch"));
        const outputSwatches = Array.from(refs.newList.querySelectorAll(".swatch"));
        const allSwatches = inputSwatches.concat(outputSwatches);
        const roles = state.optimizedColorRoles || [];
        const hasTweakOutputs = roles.some((role, idx) =>
          role?.kind === "tweak" &&
          Number.isFinite(role.inputIndex) &&
          tweakedInputIndices.includes(Math.floor(role.inputIndex)) &&
          Boolean((state.newColors || [])[idx])
        );
        const baseResolvability = buildResolvabilityColorEntries(
          colors,
          state.newColors || [],
          roles,
          tweakedInputIndices
        );
        const resolvability = resolvabilitySettings.untweakTweaks && hasTweakOutputs
          ? buildResolvabilityColorEntries(
              colors,
              state.newColors || [],
              roles,
              tweakedInputIndices,
              { untweakTweaks: true }
            )
          : baseResolvability;
        const swatchesByResolvabilityIndex = resolvability.entries.map((entry) => {
          if (entry.kind === "input" || entry.kind === "untweak") {
            return refs.currList.querySelector(`.swatch[data-input-index="${entry.inputIndex}"]`);
          }
          if (Number.isFinite(entry.outputIndex)) {
            return refs.newList.querySelector(`.swatch[data-output-index="${entry.outputIndex}"]`);
          }
          return null;
        });
        const clearHighlight = () => {
          allSwatches.forEach((el) => el.classList.remove("is-highlight"));
        };
        const highlightIndices = (indices) => {
          clearHighlight();
          (indices || []).forEach((idx) => {
            const el = swatchesByResolvabilityIndex[idx];
            if (el) el.classList.add("is-highlight");
          });
        };
        refs.resolvabilityColors = resolvability.colors;
        refs.resolvabilitySortColors =
          resolvabilitySettings.untweakTweaks && hasTweakOutputs
            ? baseResolvability.colors
            : null;
        refs.resolvabilityInputCount = resolvability.inputCount;
        refs.resolvabilityHasTweakOutputs = hasTweakOutputs;
        refs.resolvabilityHighlightPair = (i, j) => {
          if (!Number.isFinite(i) || !Number.isFinite(j)) {
            clearHighlight();
            return;
          }
          highlightIndices([i, j]);
        };
        refs.resolvabilityHighlightColor = (i) => {
          if (!Number.isFinite(i)) {
            clearHighlight();
            return;
          }
          highlightIndices([i]);
        };
      };
      refs.resolvabilityRefresh();
      const metric = ui.distanceMetric?.value || "de2000";
      const threshold = resolvabilityThreshold(metric);
      const mode = resolvabilityModeFor(type);
      const bg = ui?.bgEnabled?.checked ? ui.bgColor?.value || "#ffffff" : "#ffffff";
      refs.resolvability.update({
        colors: refs.resolvabilityColors,
        inputCount: refs.resolvabilityInputCount,
        sortColors: refs.resolvabilitySortColors || null,
        showUntweak: Boolean(refs.resolvabilityHasTweakOutputs),
        untweak: resolvabilitySettings.untweakTweaks,
        metric,
        threshold,
        mode,
        sync: resolvabilitySettings.sync,
        cvdModel,
        background: bg,
        onHighlightPair: refs.resolvabilityHighlightPair,
        onHighlightColor: refs.resolvabilityHighlightColor,
      });
    }
  });
}
