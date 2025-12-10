import { channelOrder, csRanges, decodeColor, effectiveRangeFromValues, rangeFromPreset, clampToRange } from "../core/colorSpaces.js";
import { niceTicks } from "../core/stats.js";

export function drawStatusGraph(state, ui) {
  const canvas = ui.statusGraph;
  if (!canvas) return;
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

  const scores = state.bestScores;
  const xMax = Math.max(state.lastRuns, scores.length || 1);

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

  if (!scores.length) return;
  let min = Math.min(...scores);
  let max = Math.max(...scores);
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

export function drawStatusMini(state, ui, opts = {}) {
  const canvas = ui.statusMini;
  if (!canvas) return;
  const gamutMode = typeof opts === "string" ? opts : opts.gamutMode || "auto";
  const clipToGamut = typeof opts === "object" ? opts.clipToGamut !== false : true;
  const gamutPreset = typeof opts === "object" ? opts.gamutPreset || "srgb" : "srgb";
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
  const isRect = space === "lab" || space === "oklab";
  const radius = (size / 2) * 0.97;

  const trails = state.nmTrails || [];
  const rawCurrent = !clipToGamut && state.rawSpace === space ? state.currentRaw : null;
  const rawBest = !clipToGamut && state.newRawSpace === space ? state.bestRaw : null;
  const colorSet = [];
  const valuesForRange = [];
  state.currentColors.forEach((hex, idx) => {
    colorSet.push(hex);
    valuesForRange.push(rawCurrent?.[idx] || decodeColor(hex, space));
  });
  (state.bestColors || []).forEach((hex, idx) => {
    colorSet.push(hex);
    valuesForRange.push(rawBest?.[idx] || decodeColor(hex, space));
  });
  trails.forEach((t) => {
    (t.startHex || []).forEach((hex, idx) => {
      colorSet.push(hex);
      valuesForRange.push((t.startRaw && t.startRaw[idx]) || decodeColor(hex, space));
    });
    (t.endHex || []).forEach((hex, idx) => {
      colorSet.push(hex);
      valuesForRange.push((t.endRaw && t.endRaw[idx]) || decodeColor(hex, space));
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
  const ranges = gamutMode === "full"
    ? presetRange
    : effectiveRangeFromValues(valuesForRange, space);
  const scaleRange = clipToGamut ? presetRange : ranges;

  const toPoint = (vals) => {
    const useVals = clipToGamut ? clampToRange(vals, presetRange, space) : vals;
    const v = useVals;
    if (isRect) {
      const maxA = Math.max(Math.abs(scaleRange.min.a), Math.abs(scaleRange.max.a)) || 1;
      const maxB = Math.max(Math.abs(scaleRange.min.b), Math.abs(scaleRange.max.b)) || 1;
      const x = cx + (v.a / maxA) * radius;
      const y = cy - (v.b / maxB) * radius;
      return { x, y };
    }
    const channels = channelOrder[space];
    const sc = channels.find((c) => c === "s" || c === "c") || "c";
    const hue = (v.h ?? ((Math.atan2(v.b || 0, v.a || 0) * 180) / Math.PI + 360)) % 360;
    let chroma;
    if (sc === "s") chroma = v.s || 0;
    else if (sc === "c") chroma = v.c || 0;
    else chroma = Math.hypot(v.a || 0, v.b || 0);
    const maxSC =
      sc === "s"
        ? scaleRange.max.s
        : sc === "c"
        ? scaleRange.max.c
        : Math.min(
            Math.max(Math.abs(scaleRange.min.a || 0), Math.abs(scaleRange.max.a || 0)),
            Math.max(Math.abs(scaleRange.min.b || 0), Math.abs(scaleRange.max.b || 0))
          ) || 1;
    const rNorm = Math.max(0, Math.min(1, chroma / maxSC));
    const ang = (hue * Math.PI) / 180;
    return {
      x: cx + radius * rNorm * Math.cos(ang),
      y: cy + radius * rNorm * Math.sin(ang),
    };
  };

  // gamut overlay: solid dual stroke for visibility
  const drawOutline = (r) => {
    ctx.setLineDash([]);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    if (isRect) ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
    else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    if (isRect) ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
    else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };
  drawOutline(radius);

  const resolveVal = (hex, rawArr, idx) => (rawArr && rawArr[idx]) || decodeColor(hex, space);
  const resolveTrailVal = (hex, rawArr, idx, trailSpace) =>
    !clipToGamut && trailSpace === space && rawArr ? rawArr[idx] : decodeColor(hex, space);

  trails.forEach((trail, idx) => {
    const startPts = (trail.startHex || []).map((hex, i) =>
      toPoint(resolveTrailVal(hex, trail.startRaw, i, trail.rawSpace))
    );
    const endPts = (trail.endHex || []).map((hex, i) =>
      toPoint(resolveTrailVal(hex, trail.endRaw, i, trail.rawSpace))
    );
    const isLatest = idx === trails.length - 1;
    ctx.strokeStyle = isLatest ? "#111827" : "rgba(0,0,0,0.35)";
    ctx.lineWidth = isLatest ? 1.5 : 1;
    for (let i = 0; i < Math.min(startPts.length, endPts.length); i++) {
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
      ctx.strokeStyle = "#111827";
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
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  };

  state.currentColors.forEach((hex, idx) => drawPoint(toPoint(resolveVal(hex, rawCurrent, idx)), hex, "circle", 9));
  (state.bestColors || []).forEach((hex, idx) =>
    drawPoint(toPoint(resolveVal(hex, rawBest, idx)), "#fbbf24", "star", 12)
  );
}
