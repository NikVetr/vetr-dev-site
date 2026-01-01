import {
  channelOrder,
  csRanges,
  decodeColor,
  effectiveRangeFromValues,
  rangeFromPreset,
  gamutPresets,
  convertColorValues,
  projectToGamut,
} from "../core/colorSpaces.js";
import { contrastColor } from "../core/metrics.js";
import { niceTicks } from "../core/stats.js";
import { buildGamutProjectionBoundary, smoothBoundary, strokeBoundary } from "./gamutHull.js";

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
  const radius = (size / 2) * 0.97;

  const trails = state.nmTrails || [];
  const rawOverride = state.rawInputOverride?.space === space ? state.rawInputOverride.values : null;
  const rawCurrent = rawOverride?.length ? rawOverride : (state.rawCurrentColors?.length ? state.rawCurrentColors : null);
  const rawCurrentSpace = rawOverride?.length ? state.rawInputOverride.space : state.rawSpace;
  const rawBest = state.rawBestColors?.length ? state.rawBestColors : null;
  const resolveMaybeProjected = (hex, rawArr, idx, sourceSpace) => {
    const raw = rawArr && rawArr[idx];
    const base = raw
      ? sourceSpace && sourceSpace !== space
        ? convertColorValues(raw, sourceSpace, space)
        : raw
      : decodeColor(hex, space);
    return clipToGamut ? projectToGamut(base, space, gamutPreset, space) : base;
  };
  const resolveTrailMaybeProjected = (hex, rawArr, idx, trailSpace) => {
    const raw = rawArr && rawArr[idx];
    const base = raw
      ? trailSpace && trailSpace !== space
        ? convertColorValues(raw, trailSpace, space)
        : raw
      : decodeColor(hex, space);
    return clipToGamut ? projectToGamut(base, space, gamutPreset, space) : base;
  };
  const colorSet = [];
  const valuesForRange = [];
  state.currentColors.forEach((hex, idx) => {
    colorSet.push(hex);
    valuesForRange.push(resolveMaybeProjected(hex, rawCurrent, idx, rawCurrentSpace));
  });
  (state.bestColors || []).forEach((hex, idx) => {
    colorSet.push(hex);
    valuesForRange.push(resolveMaybeProjected(hex, rawBest, idx, state.newRawSpace));
  });
  trails.forEach((t) => {
    (t.startHex || []).forEach((hex, idx) => {
      colorSet.push(hex);
      valuesForRange.push(resolveTrailMaybeProjected(hex, t.startRaw, idx, t.rawSpace));
    });
    (t.endHex || []).forEach((hex, idx) => {
      colorSet.push(hex);
      valuesForRange.push(resolveTrailMaybeProjected(hex, t.endRaw, idx, t.rawSpace));
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
    return;
  }

  const presetRange = rangeFromPreset(space, gamutPreset) || csRanges[space];
  const channels = channelOrder[space];
  const visibleValues = valuesForRange;

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
  const dataRange = effectiveRangeFromValues(visibleValues, space);
  const unclippedRange = gamutMode === "full" ? baseRange : unionRanges(dataRange, baseRange);
  const clippedRange = gamutMode === "full" ? presetRange : unionRanges(dataRange, presetRange);
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

  if (clipToGamut) {
    const boundaryVals = buildGamutProjectionBoundary(
      space,
      gamutPreset,
      scaleRange,
      isRect,
      rectKeys
    );
    const boundaryPts = (boundaryVals || [])
      .map((vals) => toPoint(vals, scaleRange))
      .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
    if (boundaryPts.length) {
      strokeBoundary(ctx, smoothBoundary(boundaryPts, 1));
    }
  }

  const resolveVal = (hex, rawArr, idx, sourceSpace) =>
    resolveMaybeProjected(hex, rawArr, idx, sourceSpace);
  const resolveTrailVal = (hex, rawArr, idx, trailSpace) =>
    resolveTrailMaybeProjected(hex, rawArr, idx, trailSpace);

  const selectedRun =
    state.runRanking && state.selectedResultIdx
      ? state.runRanking[Math.max(0, Math.min(state.selectedResultIdx - 1, state.runRanking.length - 1))]?.run
      : null;

  trails.forEach((trail, idx) => {
    const startPts = (trail.startHex || []).map((hex, i) =>
      toPoint(resolveTrailVal(hex, trail.startRaw, i, trail.rawSpace))
    );
    const endPts = (trail.endHex || []).map((hex, i) =>
      toPoint(resolveTrailVal(hex, trail.endRaw, i, trail.rawSpace))
    );
    const isSelected = selectedRun != null && trail.run === selectedRun;
    const alpha = isSelected ? 0.85 : 0.28;
    const width = isSelected ? 2.4 : 1.1;
    for (let i = 0; i < Math.min(startPts.length, endPts.length); i++) {
      const g = ctx.createLinearGradient(startPts[i].x, startPts[i].y, endPts[i].x, endPts[i].y);
      g.addColorStop(0, `rgba(37,99,235,${alpha})`);
      g.addColorStop(1, `rgba(239,68,68,${alpha})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(startPts[i].x, startPts[i].y);
      ctx.lineTo(endPts[i].x, endPts[i].y);
      ctx.stroke();
    }
  });

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

  state.currentColors.forEach((hex, idx) =>
    drawPoint(toPoint(resolveVal(hex, rawCurrent, idx, rawCurrentSpace)), hex, "circle", 9)
  );
  (state.bestColors || []).forEach((hex, idx) =>
    drawPoint(
      toPoint(resolveVal(hex, rawBest, idx, state.newRawSpace)),
      "#fbbf24",
      "star",
      15
    )
  );

  ctx.fillStyle = "#0f172a";
  ctx.font = "11px 'Space Grotesk', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${presetLabel}${clipToGamut ? " (clipped)" : " (raw)"}`, 6, 4);
}
