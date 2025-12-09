import { channelOrder, decodeColor, effectiveRangeFromColors } from "../core/colorSpaces.js";
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

export function drawStatusMini(state, ui) {
  const canvas = ui.statusMini;
  if (!canvas) return;
  const space = ui.colorwheelSpace?.value || "hsl";
  const ctx = canvas.getContext("2d");
  const deviceScale = window.devicePixelRatio || 1;
  const width = (canvas.parentElement?.clientWidth || canvas.clientWidth || 240);
  const height = (canvas.clientHeight || 140);
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
  const colorSet = [
    ...state.currentColors,
    ...(state.bestColors || []),
    ...trails.flatMap((t) => [...(t.startHex || []), ...(t.endHex || [])]),
  ];
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

  const ranges = effectiveRangeFromColors(colorSet, space);

  const toPoint = (hex) => {
    const vals = decodeColor(hex, space);
    if (isRect) {
      const maxA = Math.max(Math.abs(ranges.min.a), Math.abs(ranges.max.a)) || 1;
      const maxB = Math.max(Math.abs(ranges.min.b), Math.abs(ranges.max.b)) || 1;
      const x = cx + (vals.a / maxA) * radius;
      const y = cy - (vals.b / maxB) * radius;
      return { x, y };
    }
    const channels = channelOrder[space];
    const sc = channels.find((c) => c === "s" || c === "c") || "c";
    const hue = (vals.h ?? ((Math.atan2(vals.b || 0, vals.a || 0) * 180) / Math.PI + 360)) % 360;
    let chroma;
    if (sc === "s") chroma = vals.s || 0;
    else if (sc === "c") chroma = vals.c || 0;
    else chroma = Math.hypot(vals.a || 0, vals.b || 0);
    const maxSC =
      sc === "s"
        ? ranges.max.s
        : sc === "c"
        ? ranges.max.c
        : Math.min(
            Math.max(Math.abs(ranges.min.a || 0), Math.abs(ranges.max.a || 0)),
            Math.max(Math.abs(ranges.min.b || 0), Math.abs(ranges.max.b || 0))
          ) || 1;
    const rNorm = Math.max(0, Math.min(1, chroma / maxSC));
    const ang = (hue * Math.PI) / 180;
    return {
      x: cx + radius * rNorm * Math.cos(ang),
      y: cy + radius * rNorm * Math.sin(ang),
    };
  };

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

  trails.forEach((trail, idx) => {
    const startPts = (trail.startHex || []).map(toPoint);
    const endPts = (trail.endHex || []).map(toPoint);
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

  state.currentColors.forEach((hex) => drawPoint(toPoint(hex), hex, "circle", 9));
  (state.bestColors || []).forEach((hex) => drawPoint(toPoint(hex), "#fbbf24", "star", 12));
}
