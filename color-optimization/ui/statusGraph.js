import {
  channelOrder,
  csRanges,
  decodeColor,
  effectiveRangeFromValues,
  rangeFromPreset,
  gamutPresets,
  convertColorValues,
  isInGamut,
  projectToGamut,
  normalizeWithRange,
} from "../core/colorSpaces.js";
import { contrastColor } from "../core/metrics.js";
import { niceTicks } from "../core/stats.js";
import {
  applyConstrainedChannelsToRange,
  buildGamutProjectionBoundary,
  hardContiguousHiddenConstraintRange,
  hardContiguousVisibleConstraintGuides,
  smoothBoundary,
  strokeBoundary,
  computeGamutExtent,
  drawOutOfConstraintOverlay,
  drawOutOfGamutOverlay,
} from "./gamutHull.js";
import { hardConstraintRegionIndex } from "../core/hardConstraints.js";

export function drawStatusGraph(state, ui) {
  const canvas = ui.statusGraph;
  if (!canvas) return;
  const selectedRun =
    state.runRanking && state.selectedResultIdx
      ? state.runRanking[Math.max(0, Math.min(state.selectedResultIdx - 1, state.runRanking.length - 1))]?.run
      : null;
  const bestRun =
    state.runRanking && state.runRanking.length ? state.runRanking[0].run : null;
  const ctx = canvas.getContext("2d");
  const deviceScale = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
  const height = canvas.clientHeight || 100;
  canvas.width = width * deviceScale;
  canvas.height = height * deviceScale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(deviceScale, deviceScale);
  ctx.clearRect(0, 0, width, height);

  const padding = { left: 60, right: 14, top: 12, bottom: 28 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d0d7e2";
  ctx.lineWidth = 1;
  ctx.strokeRect(padding.left, padding.top, plotW, plotH);

  const scores = state.bestScores || [];
  const runResults = state.runResults || [];
  const scoreByRun = new Map(runResults.map((r) => [r.run, r.score]));
  const xMax = Math.max(state.lastRuns || 0, scores.length || 0, runResults.length || 0, 1);

  ctx.fillStyle = "#475467";
  ctx.font = "11px 'Space Grotesk', Arial, sans-serif";
  ctx.save();
  ctx.translate(16, padding.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("score", 0, 0);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillText("restarts", padding.left + plotW / 2, height - 6);

  const selectedScore = selectedRun != null ? scoreByRun.get(selectedRun) : null;
  const bestScore = bestRun != null ? scoreByRun.get(bestRun) : null;

  if (!scores.length && !Number.isFinite(selectedScore) && !Number.isFinite(bestScore)) return;
  // Scale to best-so-far trajectory plus the currently selected run (so we don't zoom out to the worst runs).
  const allForRange = [
    ...scores,
    ...(Number.isFinite(selectedScore) ? [selectedScore] : []),
    ...(Number.isFinite(bestScore) ? [bestScore] : []),
  ].filter((v) => Number.isFinite(v));
  let min = Math.min(...allForRange);
  let max = Math.max(...allForRange);
  const pad = (max - min) * 0.05 || 0.01;
  min -= pad;
  max += pad;
  const span = Math.max(max - min, 1e-6);

  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const yTicks = niceTicks(min, max, 3);
  yTicks.forEach((v) => {
    const y = padding.top + (1 - (v - min) / span) * plotH;
    if (y < padding.top - 2 || y > padding.top + plotH + 2) return;
    const fmt =
      span < 2 ? v.toFixed(2) :
      span < 20 ? v.toFixed(1) :
      v.toFixed(0);
    ctx.fillText(fmt, padding.left - 6, y);
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = niceTicks(0, xMax - 1, 3);
  xTicks.forEach((t) => {
    const x = padding.left + (t / Math.max(xMax - 1, 1)) * plotW;
    if (x < padding.left - 2 || x > padding.left + plotW + 2) return;
    ctx.fillText(String(t), x, height - padding.bottom + 2);
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotH);
    ctx.stroke();
  });

  if (scores.length) {
    ctx.strokeStyle = "#1a46ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    scores.forEach((s, i) => {
      const x = padding.left + (i / Math.max(xMax - 1, 1)) * plotW;
      const y = padding.top + (1 - (s - min) / span) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  if (selectedRun != null) {
    const idx = Math.max(0, Math.min(selectedRun - 1, xMax - 1));
    const x = padding.left + (idx / Math.max(xMax - 1, 1)) * plotW;
    const yVal =
      Number.isFinite(selectedScore)
        ? selectedScore
        : scores.length
          ? scores[Math.max(0, Math.min(selectedRun - 1, scores.length - 1))]
          : null;
    const y = yVal == null ? padding.top + plotH / 2 : padding.top + (1 - (yVal - min) / span) * plotH;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotH);
    ctx.stroke();
    ctx.fillStyle = "#f97316";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  if (bestRun != null) {
    const idx = Math.max(0, Math.min(bestRun - 1, xMax - 1));
    const x = padding.left + (idx / Math.max(xMax - 1, 1)) * plotW;
    const yVal =
      Number.isFinite(bestScore)
        ? bestScore
        : scores.length
          ? scores[Math.max(0, Math.min(bestRun - 1, scores.length - 1))]
          : null;
    const y = yVal == null ? padding.top + plotH / 2 : padding.top + (1 - (yVal - min) / span) * plotH;
    ctx.fillStyle = "rgba(16,185,129,0.7)";
    ctx.strokeStyle = "#065f46";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawStatusMini(state, ui, opts = {}) {
  const canvas = ui.statusMini;
  if (!canvas) return;
  const clipToGamut = typeof opts === "object" ? (opts.clipToGamut === true || opts.clipToGamut === false ? opts.clipToGamut : false) : false;
  const gamutPreset = typeof opts === "object" ? opts.gamutPreset || "srgb" : "srgb";
  const gamutMode = typeof opts === "object" ? opts.gamutMode || "auto" : "auto";
  const presetLabel = gamutPresets[gamutPreset]?.label || gamutPreset;
  const space = (typeof opts === "object" && opts.vizSpace) || ui.colorwheelSpace?.value || "hsl";
  const ctx = canvas.getContext("2d");
  const deviceScale = window.devicePixelRatio || 1;
  const width = (canvas.parentElement?.clientWidth || canvas.clientWidth || 240);
  const height = canvas.clientHeight || parseInt(canvas.getAttribute("height"), 10) || 140;
  canvas.width = width * deviceScale;
  canvas.height = height * deviceScale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(deviceScale, deviceScale);
  ctx.clearRect(0, 0, width, height);

  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const channelsForSpace = channelOrder[space] || [];
  const isRect = !channelsForSpace.includes("h");
  const rectKeys = isRect
    ? { x: channelsForSpace[1] || "a", y: channelsForSpace[2] || "b" }
    : null;
  const visibleConstraintChannels = isRect
    ? [rectKeys?.x, rectKeys?.y]
    : ["h", channelsForSpace.find((c) => c === "s" || c === "c")].filter(Boolean);
  const radius = (size / 2) * 0.97;

  const trails = state.nmTrails || [];
  const displayTraceSamples = Math.max(1, parseInt(ui.pathSteps?.value, 10) || 48);
  const rawOverride = state.rawInputOverride?.space === space ? state.rawInputOverride.values : null;
  const rawCurrent = rawOverride?.length ? rawOverride : (state.rawCurrentColors?.length ? state.rawCurrentColors : null);
  const rawCurrentSpace = rawOverride?.length ? state.rawInputOverride.space : state.rawSpace;
  const rawBest = state.rawBestColors?.length ? state.rawBestColors : null;
  const resolveRawVals = (hex, rawArr, idx, sourceSpace) => {
    const raw = rawArr && rawArr[idx];
    return raw
      ? sourceSpace && sourceSpace !== space
        ? convertColorValues(raw, sourceSpace, space)
        : raw
      : decodeColor(hex, space);
  };
  const resolveVisualVals = (hex, rawArr, idx, sourceSpace) => {
    const vals = resolveRawVals(hex, rawArr, idx, sourceSpace);
    return displayValsForGamut(vals);
  };
  const resolveTrailRawVals = (hex, rawArr, idx, trailSpace) => {
    const raw = rawArr && rawArr[idx];
    return raw
      ? trailSpace && trailSpace !== space
        ? convertColorValues(raw, trailSpace, space)
        : raw
      : decodeColor(hex, space);
  };
  const resolveTrailVisualVals = (hex, rawArr, idx, trailSpace) => {
    const vals = resolveTrailRawVals(hex, rawArr, idx, trailSpace);
    return displayValsForGamut(vals);
  };
  const displayValsForGamut = (vals) => {
    if (!clipToGamut || !vals) return vals;
    return isInGamut(vals, space, gamutPreset)
      ? vals
      : projectToGamut(vals, space, gamutPreset, space);
  };
  const colorSet = [];
  const valuesForRange = [];
  state.currentColors.forEach((hex, idx) => {
    colorSet.push(hex);
    valuesForRange.push(resolveVisualVals(hex, rawCurrent, idx, rawCurrentSpace));
  });
  (state.bestColors || []).forEach((hex, idx) => {
    colorSet.push(hex);
    valuesForRange.push(resolveVisualVals(hex, rawBest, idx, state.newRawSpace));
  });
  trails.forEach((t) => {
    (t.startHex || []).forEach((hex, idx) => {
      colorSet.push(hex);
      valuesForRange.push(resolveTrailVisualVals(hex, t.startRaw, idx, t.rawSpace));
    });
    (t.endHex || []).forEach((hex, idx) => {
      colorSet.push(hex);
      valuesForRange.push(resolveTrailVisualVals(hex, t.endRaw, idx, t.rawSpace));
    });
  });

  if (!colorSet.length) {
    ctx.strokeStyle = "#d0d7e2";
    ctx.setLineDash([6, 4]);
    if (isRect) {
      ctx.strokeRect(cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  const presetRange = rangeFromPreset(space, gamutPreset) || csRanges[space];
  const channels = channelOrder[space];
  const visibleValues = valuesForRange;
  const hasVisibleValues = visibleValues.some((vals) => vals);

  const unionRanges = (a, b) => {
    const min = {};
    const max = {};
    channels.forEach((ch) => {
      min[ch] = Math.min(a?.min?.[ch] ?? Infinity, b?.min?.[ch] ?? Infinity);
      max[ch] = Math.max(a?.max?.[ch] ?? -Infinity, b?.max?.[ch] ?? -Infinity);
    });
    return { min, max };
  };

  const padRange = (range, frac = 0.1) => {
    const min = {};
    const max = {};
    channels.forEach((ch) => {
      if (ch === "h") {
        min[ch] = range.min[ch];
        max[ch] = range.max[ch];
        return;
      }
      const span = range.max[ch] - range.min[ch];
      const pad = span === 0 ? Math.max(Math.abs(range.max[ch]) || 1, 1) * frac : span * frac;
      min[ch] = range.min[ch] - pad;
      max[ch] = range.max[ch] + pad;
    });
    return { min, max };
  };

  const baseRange = space === "jzazbz" ? presetRange : csRanges[space];
  const constraintDomain =
    state.bounds && ui.colorSpace?.value === space
      ? hardContiguousHiddenConstraintRange(state.bounds, space, visibleConstraintChannels)
      : null;
  const visibleConstraintGuides =
    state.bounds && ui.colorSpace?.value === space
      ? hardContiguousVisibleConstraintGuides(state.bounds, space, visibleConstraintChannels)
      : [];
  const pointConstraintGuides =
    state.bounds && ui.colorSpace?.value === space
      ? pointWindowConstraintGuides(state.bounds, space, visibleConstraintChannels)
      : null;
  const hiddenConstraintChannels =
    constraintDomain?.channels?.filter((ch) => !visibleConstraintChannels.includes(ch)) || [];
  const domainRange = constraintDomain?.range || null;
  const dataRange = effectiveRangeFromValues(visibleValues, space);
  // When clipping to gamut, compute the actual gamut extent for tighter zoom (1.1x margin)
  const fullGamutExtent = clipToGamut
    ? computeGamutExtent(space, gamutPreset, 1.1) || presetRange
    : presetRange;
  const constrainedGamutExtent = clipToGamut && domainRange
    ? computeGamutExtent(space, gamutPreset, 1.1, domainRange) || fullGamutExtent
    : fullGamutExtent;
  const gamutExtent = domainRange
    ? unionRanges(fullGamutExtent, constrainedGamutExtent)
    : fullGamutExtent;
  const unclippedBase = domainRange
    ? unionRanges(baseRange, domainRange)
    : baseRange;
  const unclippedRange = gamutMode === "full" || !hasVisibleValues
    ? unclippedBase
    : unionRanges(dataRange, unclippedBase);
  const clippedRange = gamutMode === "full" || !hasVisibleValues
    ? gamutExtent
    : unionRanges(dataRange, gamutExtent);
  const scaleRange = padRange(clipToGamut ? clippedRange : unclippedRange, 0);

  const toPoint = (vals, rangeOverride) => {
    const useRange = rangeOverride || scaleRange;
    const v = vals;
    if (isRect) {
      const xKey = rectKeys.x;
      const yKey = rectKeys.y;
      const maxX = Math.max(Math.abs(useRange.min[xKey] || 0), Math.abs(useRange.max[xKey] || 0)) || 1;
      const maxY = Math.max(Math.abs(useRange.min[yKey] || 0), Math.abs(useRange.max[yKey] || 0)) || 1;
      const x = cx + ((v?.[xKey] || 0) / maxX) * radius;
      const y = cy - ((v?.[yKey] || 0) / maxY) * radius;
      return { x, y };
    }
    const channels = channelOrder[space];
    const sc = channels.find((c) => c === "s" || c === "c") || "c";
    const hue = (v.h ?? 0) % 360;
    let chroma;
    if (sc === "s") chroma = v.s || 0;
    else if (sc === "c") chroma = v.c || 0;
    else chroma = 0;
    const maxSC =
      sc === "s"
        ? useRange.max.s
        : sc === "c"
        ? useRange.max.c
        : Math.min(
            Math.max(Math.abs(useRange.min.a || 0), Math.abs(useRange.max.a || 0)),
            Math.max(Math.abs(useRange.min.b || 0), Math.abs(useRange.max.b || 0))
          ) || 1;
    const rNorm = Math.max(0, Math.min(1, chroma / maxSC));
    const ang = (hue * Math.PI) / 180;
    return {
      x: cx + radius * rNorm * Math.cos(ang),
      y: cy + radius * rNorm * Math.sin(ang),
    };
  };

  function drawClippedToBoundary(boundary, drawFn) {
    const boundaries = Array.isArray(boundary?.[0]) ? boundary : (boundary?.length ? [boundary] : []);
    const valid = boundaries.filter((poly) => poly?.length >= 3);
    if (!clipToGamut || !valid.length) {
      drawFn();
      return;
    }
    ctx.save();
    ctx.beginPath();
    valid.forEach((poly) => {
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x, poly[i].y);
      }
      ctx.closePath();
    });
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  let pathClipBoundary = null;
  if (clipToGamut) {
    const boundaryForRange = (boundaryRange) => {
      const boundaryVals = buildGamutProjectionBoundary(
        space,
        gamutPreset,
        boundaryRange,
        isRect,
        rectKeys
      );
      const boundaryPts = (boundaryVals || [])
        .map((vals) => toPoint(vals, scaleRange))
        .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
      return boundaryPts.length ? smoothBoundary(boundaryPts, 1) : null;
    };
    const fullBoundary = boundaryForRange(scaleRange);
    const constrainedBoundary = hiddenConstraintChannels.length
      ? boundaryForRange(applyConstrainedChannelsToRange(scaleRange, domainRange, hiddenConstraintChannels))
      : null;
    const customHiddenBoundaries = () => {
      const sets = state.bounds?.constraintSets;
      if (!sets?.channels || (sets.topology !== "custom" && sets.topology !== "discontiguous")) return [];
      const base = state.bounds?.ranges || csRanges[space];
      const hidden = channelsForSpace.filter((ch) => {
        if (visibleConstraintChannels.includes(ch)) return false;
        const c = sets.channels[ch];
        return c?.mode === "hard" && c.type === "linear" && Array.isArray(c.pointWindows) && c.pointWindows.length;
      });
      if (!hidden.length) return [];
      const count = hidden.reduce((acc, ch) => Math.max(acc, sets.channels[ch].pointWindows.length), 0);
      const out = [];
      for (let i = 0; i < count; i++) {
        const min = { ...scaleRange.min };
        const max = { ...scaleRange.max };
        hidden.forEach((ch) => {
          const windows = sets.channels[ch].pointWindows;
          const w = windows[i % windows.length];
          if (!w) return;
          const lo = Math.max(0, Math.min(1, Number.isFinite(w.min) ? w.min : w.center - w.radius));
          const hi = Math.max(0, Math.min(1, Number.isFinite(w.max) ? w.max : w.center + w.radius));
          const cMin = base.min?.[ch] ?? scaleRange.min?.[ch] ?? 0;
          const cMax = base.max?.[ch] ?? scaleRange.max?.[ch] ?? 1;
          min[ch] = cMin + Math.min(lo, hi) * (cMax - cMin);
          max[ch] = cMin + Math.max(lo, hi) * (cMax - cMin);
        });
        const boundary = boundaryForRange({ min, max });
        if (boundary?.length) out.push(boundary);
      }
      return out;
    };
    const drawOutOfMultipleConstraintOverlay = (full, boundaries) => {
      if (!full?.length || !boundaries?.length) return;
      const offscreen = document.createElement("canvas");
      offscreen.width = ctx.canvas.width;
      offscreen.height = ctx.canvas.height;
      const offCtx = offscreen.getContext("2d");
      offCtx.setTransform(ctx.getTransform());

      offCtx.beginPath();
      offCtx.moveTo(full[0].x, full[0].y);
      for (let i = 1; i < full.length; i++) offCtx.lineTo(full[i].x, full[i].y);
      offCtx.closePath();
      offCtx.fillStyle = "rgba(255,255,255,0.52)";
      offCtx.fill();

      offCtx.globalCompositeOperation = "destination-out";
      boundaries.forEach((boundary) => {
        if (!boundary?.length) return;
        offCtx.beginPath();
        offCtx.moveTo(boundary[0].x, boundary[0].y);
        for (let i = 1; i < boundary.length; i++) offCtx.lineTo(boundary[i].x, boundary[i].y);
        offCtx.closePath();
        offCtx.fillStyle = "rgba(0,0,0,1)";
        offCtx.fill();
      });

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();
    };
    const customBoundaries = customHiddenBoundaries();
    const visibleBoundary = constrainedBoundary || (customBoundaries.length ? customBoundaries : fullBoundary);
    if (fullBoundary?.length) {
      drawOutOfGamutOverlay(ctx, cx, cy, radius, isRect, fullBoundary);
      if (constrainedBoundary?.length) {
        drawOutOfConstraintOverlay(ctx, fullBoundary, constrainedBoundary);
      } else if (customBoundaries.length) {
        drawOutOfMultipleConstraintOverlay(fullBoundary, customBoundaries);
      }
      strokeBoundary(ctx, fullBoundary);
      if (constrainedBoundary?.length) {
        strokeBoundary(ctx, constrainedBoundary, { dashed: true });
      } else if (customBoundaries.length) {
        customBoundaries.forEach((boundary) => strokeBoundary(ctx, boundary, { dashed: true }));
      }
      drawClippedToBoundary(visibleBoundary, () => drawVisibleConstraintGuides(visibleConstraintGuides));
    }
    if (visibleBoundary?.length) pathClipBoundary = visibleBoundary;
  }
  drawClippedToBoundary(pathClipBoundary, () => drawPointWindowConstraintGuides(pointConstraintGuides));

  const resolveVal = (hex, rawArr, idx, sourceSpace) =>
    resolveRawVals(hex, rawArr, idx, sourceSpace);
  const resolveTrailVal = (hex, rawArr, idx, trailSpace) =>
    resolveTrailRawVals(hex, rawArr, idx, trailSpace);

  const selectedRun =
    state.runRanking && state.selectedResultIdx
      ? state.runRanking[Math.max(0, Math.min(state.selectedResultIdx - 1, state.runRanking.length - 1))]?.run
      : null;

  const drawTrails = () => trails.forEach((trail) => {
    const isSelected = selectedRun != null && trail.run === selectedRun;
    const alpha = isSelected ? 0.85 : 0.28;
    const width = isSelected ? 2.4 : 1.1;
    const trajectorySource = Array.isArray(trail.trajectory) && trail.trajectory.length >= 2
      ? trail.trajectory
      : [
          { hex: trail.startHex || [], raw: trail.startRaw || [] },
          { hex: trail.endHex || [], raw: trail.endRaw || [] },
        ];
    const trajectory = downsampleTrajectory(trajectorySource, displayTraceSamples);
    const nColors = Math.max(
      ...trajectory.map((step) => Math.max(step?.hex?.length || 0, step?.raw?.length || 0)),
      0
    );
    for (let i = 0; i < nColors; i++) {
      let prev = null;
      for (let j = 0; j < trajectory.length; j++) {
        const step = trajectory[j];
        const hex = step?.hex?.[i] || trail.endHex?.[i] || trail.startHex?.[i];
        const vals = resolveTrailVisualVals(hex, step?.raw || null, i, trail.rawSpace);
        const pt = toPoint(vals);
        const region = visibleHardConstraintRegion(vals);
        const current = pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && region != null
          ? { pt, region }
          : null;
        if (!current) {
          prev = null;
          continue;
        }
        if (!prev || prev.region !== current.region) {
          prev = current;
          continue;
        }
        const t = trajectory.length <= 2 ? 1 : j / (trajectory.length - 1);
        ctx.strokeStyle = trajectoryStroke(t, alpha);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(prev.pt.x, prev.pt.y);
        ctx.lineTo(current.pt.x, current.pt.y);
        ctx.stroke();
        prev = current;
      }
    }
  });

  function trajectoryStroke(t, alpha) {
    const clamped = Math.max(0, Math.min(1, t));
    const start = [37, 99, 235];
    const end = [239, 68, 68];
    const rgb = start.map((v, i) => Math.round(v + (end[i] - v) * clamped));
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  function downsampleTrajectory(trajectory, maxTraceSamples) {
    if (!Array.isArray(trajectory) || trajectory.length <= maxTraceSamples + 2) return trajectory || [];
    const start = trajectory[0];
    const end = trajectory[trajectory.length - 1];
    const interior = trajectory.slice(1, -1);
    const sampled = [];
    const last = interior.length - 1;
    for (let i = 0; i < maxTraceSamples; i++) {
      const idx = Math.round((i / Math.max(maxTraceSamples - 1, 1)) * last);
      if (interior[idx] && sampled[sampled.length - 1] !== interior[idx]) sampled.push(interior[idx]);
    }
    return [start, ...sampled, end];
  }

  function drawClippedToVisibleHardConstraints(drawFn) {
    if (!isRect || !rectKeys || !state.bounds || ui.colorSpace?.value !== space) {
      drawFn();
      return;
    }
    const constraintSets = state.bounds.constraintSets;
    if (!constraintSets?.channels) {
      drawFn();
      return;
    }
    const base = state.bounds.ranges || csRanges[space];
    const xKey = rectKeys.x;
    const yKey = rectKeys.y;
    const maxX = Math.max(Math.abs(scaleRange.min[xKey] || 0), Math.abs(scaleRange.max[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(scaleRange.min[yKey] || 0), Math.abs(scaleRange.max[yKey] || 0)) || 1;
    const clampUnit = (v) => Math.max(0, Math.min(1, v));
    const clampSigned = (v) => Math.max(-1, Math.min(1, v));
    const toRaw = (ch, u) => {
      const min = base.min?.[ch] ?? scaleRange.min?.[ch] ?? 0;
      const max = base.max?.[ch] ?? scaleRange.max?.[ch] ?? 1;
      return min + clampUnit(u) * (max - min);
    };
    const xToCoord = (u) => cx + clampSigned(toRaw(xKey, u) / maxX) * radius;
    const yToCoord = (u) => cy - clampSigned(toRaw(yKey, u) / maxY) * radius;
    const addRect = (x0, x1, y0, y1) => {
      const xA = xToCoord(x0);
      const xB = xToCoord(x1);
      const yA = yToCoord(y0);
      const yB = yToCoord(y1);
      const left = Math.min(xA, xB);
      const top = Math.min(yA, yB);
      const width = Math.abs(xB - xA);
      const height = Math.abs(yB - yA);
      if (width <= 1e-6 || height <= 1e-6) return false;
      ctx.rect(left, top, width, height);
      return true;
    };
    const xC = constraintSets.channels[xKey];
    const yC = constraintSets.channels[yKey];
    const xHard = xC?.mode === "hard";
    const yHard = yC?.mode === "hard";
    const topology = constraintSets.topology || "contiguous";
    const isWindowed = topology === "custom" || topology === "discontiguous";
    let hasClip = false;

    ctx.save();
    ctx.beginPath();
    if (isWindowed) {
      const xWindows = xHard ? (xC?.pointWindows || []) : [];
      const yWindows = yHard ? (yC?.pointWindows || []) : [];
      const count = Math.max(xWindows.length, yWindows.length);
      for (let i = 0; i < count; i++) {
        const xW = xWindows[i % Math.max(xWindows.length, 1)] || null;
        const yW = yWindows[i % Math.max(yWindows.length, 1)] || null;
        const x0 = xW ? xW.min : 0;
        const x1 = xW ? xW.max : 1;
        const y0 = yW ? yW.min : 0;
        const y1 = yW ? yW.max : 1;
        hasClip = addRect(x0, x1, y0, y1) || hasClip;
      }
    } else {
      const fullX = !xHard || xC?.full;
      const fullY = !yHard || yC?.full;
      const xIntervals = fullX ? [[0, 1]] : (xC?.intervals || [[0, 1]]);
      const yIntervals = fullY ? [[0, 1]] : (yC?.intervals || [[0, 1]]);
      if (!fullX || !fullY) {
        xIntervals.forEach(([x0, x1]) => {
          yIntervals.forEach(([y0, y1]) => {
            hasClip = addRect(x0, x1, y0, y1) || hasClip;
          });
        });
      }
    }

    if (!hasClip) {
      ctx.restore();
      drawFn();
      return;
    }
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  const drawClippedToPathBoundary = (drawFn) =>
    drawClippedToBoundary(pathClipBoundary, () => drawClippedToVisibleHardConstraints(drawFn));

  drawClippedToPathBoundary(drawTrails);

  const drawPoint = (pt, color, shape = "circle", size = 8) => {
    ctx.beginPath();
    if (shape === "star") {
      const spikes = 5;
      const outer = size / 2;
      const inner = outer / 2.3;
      let rot = Math.PI / 2 * 3;
      let x = pt.x;
      let y = pt.y;
      ctx.moveTo(pt.x, pt.y - outer);
      for (let i = 0; i < spikes; i++) {
        x = pt.x + Math.cos(rot) * outer;
        y = pt.y + Math.sin(rot) * outer;
        ctx.lineTo(x, y);
        rot += Math.PI / spikes;

        x = pt.x + Math.cos(rot) * inner;
        y = pt.y + Math.sin(rot) * inner;
        ctx.lineTo(x, y);
        rot += Math.PI / spikes;
      }
      ctx.lineTo(pt.x, pt.y - outer);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = contrastColor(color);
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      return;
    }
    if (shape === "square") {
      ctx.rect(pt.x - size / 2, pt.y - size / 2, size, size);
    } else {
      ctx.arc(pt.x, pt.y, size / 2, 0, 2 * Math.PI);
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = contrastColor(color);
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  };

  function visibleHardConstraintRegion(vals) {
    if (!vals || !isRect || !rectKeys || !state.bounds || ui.colorSpace?.value !== space) return 0;
    const constraintSets = state.bounds.constraintSets;
    if (!constraintSets?.channels) return 0;
    const base = state.bounds.ranges || csRanges[space];
    const xKey = rectKeys.x;
    const yKey = rectKeys.y;
    const norm = normalizeWithRange(vals, base, space);
    const xC = constraintSets.channels[xKey];
    const yC = constraintSets.channels[yKey];
    const xHard = xC?.mode === "hard";
    const yHard = yC?.mode === "hard";
    const topology = constraintSets.topology || "contiguous";
    if (!xHard && !yHard) return 0;
    const visibleSets = { topology, channels: {} };
    if (xHard && xC) visibleSets.channels[xKey] = xC;
    if (yHard && yC) visibleSets.channels[yKey] = yC;
    return hardConstraintRegionIndex(norm, visibleSets, topology);
  }

  drawClippedToPathBoundary(() => {
    state.currentColors.forEach((hex, idx) =>
      drawPoint(toPoint(resolveVisualVals(hex, rawCurrent, idx, rawCurrentSpace)), hex, "circle", 9)
    );
  });

  ctx.fillStyle = "#0f172a";
  ctx.font = "11px 'Space Grotesk', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${presetLabel}${clipToGamut ? " (clipped)" : " (raw)"}`, 6, 4);

  // Final overlay pass: keep best-result stars above paths, masks, guides,
  // labels, and point glyphs. The point itself must still be in a visible
  // hard-constraint region, but the star glyph is not clipped by masks.
  (state.bestColors || []).forEach((hex, idx) => {
    const vals = resolveVisualVals(hex, rawBest, idx, state.newRawSpace);
    if (visibleHardConstraintRegion(vals) == null) return;
    drawPoint(
      toPoint(vals),
      "#fbbf24",
      "star",
      15
    );
  });

  function pointWindowConstraintGuides(bounds, guideSpace, visibleChannels) {
    const sets = bounds?.constraintSets;
    if (!sets?.channels || (sets.topology !== "custom" && sets.topology !== "discontiguous")) return null;
    const channels = channelOrder[guideSpace] || [];
    const visible = new Set((visibleChannels || []).filter(Boolean));
    const hardVisible = channels.filter((ch) => visible.has(ch) && sets.channels[ch]?.mode === "hard");
    if (!hardVisible.length) return null;
    return { sets, hardVisible };
  }

  function drawPointWindowConstraintGuides(guides) {
    if (!guides?.sets?.channels) return;
    const sets = guides.sets;
    const hard = new Set(guides.hardVisible || []);
    const range = state.bounds?.ranges || csRanges[space];
    const rawFromNorm = (ch, u) => {
      const min = range?.min?.[ch] ?? scaleRange.min?.[ch] ?? 0;
      const max = range?.max?.[ch] ?? scaleRange.max?.[ch] ?? 1;
      return min + Math.max(0, Math.min(1, u)) * (max - min);
    };
    const strokeGuide = () => {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(15,23,42,0.72)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    };

    ctx.save();
    if (isRect && rectKeys) {
      const xKey = rectKeys.x;
      const yKey = rectKeys.y;
      const xWindows = hard.has(xKey) ? (sets.channels[xKey]?.pointWindows || []) : [];
      const yWindows = hard.has(yKey) ? (sets.channels[yKey]?.pointWindows || []) : [];
      const count = Math.max(xWindows.length, yWindows.length);
      for (let i = 0; i < count; i++) {
        const xW = xWindows[i] || null;
        const yW = yWindows[i] || null;
        if (!xW && !yW) continue;
        const x0 = xW ? rawFromNorm(xKey, xW.min) : scaleRange.min[xKey];
        const x1 = xW ? rawFromNorm(xKey, xW.max) : scaleRange.max[xKey];
        const y0 = yW ? rawFromNorm(yKey, yW.min) : scaleRange.min[yKey];
        const y1 = yW ? rawFromNorm(yKey, yW.max) : scaleRange.max[yKey];
        const p00 = toPoint({ [xKey]: x0, [yKey]: y0 });
        const p10 = toPoint({ [xKey]: x1, [yKey]: y0 });
        const p11 = toPoint({ [xKey]: x1, [yKey]: y1 });
        const p01 = toPoint({ [xKey]: x0, [yKey]: y1 });
        ctx.beginPath();
        if (xW && yW) {
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.closePath();
        } else if (xW) {
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.moveTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
        } else {
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.moveTo(p01.x, p01.y);
          ctx.lineTo(p11.x, p11.y);
        }
        strokeGuide();
      }
      ctx.restore();
      return;
    }

    const channels = channelOrder[space] || [];
    const scKey = channels.find((c) => c === "s" || c === "c");
    if (!scKey) {
      ctx.restore();
      return;
    }
    const hueWindows = hard.has("h") ? (sets.channels.h?.pointWindows || []) : [];
    const scWindows = hard.has(scKey) ? (sets.channels[scKey]?.pointWindows || []) : [];
    const count = Math.max(hueWindows.length, scWindows.length);
    const wrapRad = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const hueRaw = (a) => rawFromNorm("h", wrapRad(a) / (Math.PI * 2));
    const pointAt = (angle, scNorm) => toPoint({ h: hueRaw(angle), [scKey]: rawFromNorm(scKey, scNorm) });
    const drawArc = (rNorm, a0, a1) => {
      const span = Math.max(0, a1 - a0);
      const steps = Math.max(12, Math.ceil(span / (Math.PI / 36)));
      ctx.moveTo(pointAt(a0, rNorm).x, pointAt(a0, rNorm).y);
      for (let s = 1; s <= steps; s++) {
        const a = a0 + span * (s / steps);
        const p = pointAt(a, rNorm);
        ctx.lineTo(p.x, p.y);
      }
    };
    for (let i = 0; i < count; i++) {
      const hW = hueWindows[i] || null;
      const scW = scWindows[i] || null;
      if (!hW && !scW) continue;
      const a0 = hW ? hW.center - hW.radius : 0;
      const a1 = hW ? hW.center + hW.radius : Math.PI * 2;
      const r0 = scW ? scW.min : 0;
      const r1 = scW ? scW.max : 1;
      ctx.beginPath();
      if (hW) {
        const p0 = pointAt(a0, r0);
        const p1 = pointAt(a0, r1);
        const p2 = pointAt(a1, r0);
        const p3 = pointAt(a1, r1);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
      }
      if (scW) {
        drawArc(r0, a0, a1);
        drawArc(r1, a0, a1);
      }
      strokeGuide();
    }
    ctx.restore();
  }

  function drawVisibleConstraintGuides(guides) {
    if (!guides?.length) return;
    const clampUnit = (v) => Math.max(-1, Math.min(1, v));
    const strokeGuide = () => {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = "rgba(8,145,178,0.95)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    };

    ctx.save();
    if (isRect && rectKeys) {
      const xKey = rectKeys.x;
      const yKey = rectKeys.y;
      const maxX = Math.max(Math.abs(scaleRange.min[xKey] || 0), Math.abs(scaleRange.max[xKey] || 0)) || 1;
      const maxY = Math.max(Math.abs(scaleRange.min[yKey] || 0), Math.abs(scaleRange.max[yKey] || 0)) || 1;
      guides.forEach((guide) => {
        if (guide.type !== "linear") return;
        guide.raw.forEach((raw) => {
          if (guide.channel === xKey) {
            const x = cx + clampUnit(raw / maxX) * radius;
            ctx.beginPath();
            ctx.moveTo(x, cy - radius);
            ctx.lineTo(x, cy + radius);
            strokeGuide();
          } else if (guide.channel === yKey) {
            const y = cy - clampUnit(raw / maxY) * radius;
            ctx.beginPath();
            ctx.moveTo(cx - radius, y);
            ctx.lineTo(cx + radius, y);
            strokeGuide();
          }
        });
      });
      ctx.restore();
      return;
    }

    const scKey = channelsForSpace.find((c) => c === "s" || c === "c");
    const maxSC = scKey === "s" ? scaleRange.max.s : scaleRange.max.c;
    guides.forEach((guide) => {
      if (guide.type === "hue") {
        guide.intervalsRad.forEach(([start, end]) => {
          [start, end].forEach((ang) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(ang), cy + radius * Math.sin(ang));
            strokeGuide();
          });
        });
      } else if (guide.type === "linear" && guide.channel === scKey) {
        guide.raw.forEach((raw) => {
          const r = Math.max(0, Math.min(1, raw / Math.max(maxSC, 1e-6))) * radius;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          strokeGuide();
        });
      }
    });
    ctx.restore();
  }
}
