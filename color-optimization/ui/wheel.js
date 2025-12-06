import { channelOrder, csRanges, decodeColor, encodeColor } from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { clamp } from "../core/util.js";

export function drawWheel(type, ui, state) {
  const refs = ui.panelMap[type];
  if (!refs) return;
  const canvas = refs.canvas;
  const ctx = canvas.getContext("2d");
  const size = refs.panel.clientWidth - 24;
  const deviceScale = window.devicePixelRatio || 1;
  const dim = Math.max(240, Math.min(420, size));
  canvas.width = dim * deviceScale;
  canvas.height = dim * deviceScale;
  canvas.style.width = `${dim}px`;
  canvas.style.height = `${dim}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(deviceScale, deviceScale);

  const cx = dim / 2;
  const cy = dim / 2;
  const radius = (dim / 2) * 0.9;
  const slicesT = 60;
  const slicesR = 20;
  const wheelSpace = ui.colorwheelSpace.value;
  if (!csRanges[wheelSpace]) return;

  const isRectWheel = wheelSpace === "lab" || wheelSpace === "oklab";
  let maxC = 1;
  if (isRectWheel) {
    const maxA = Math.max(Math.abs(csRanges[wheelSpace].min.a), Math.abs(csRanges[wheelSpace].max.a));
    const maxB = Math.max(Math.abs(csRanges[wheelSpace].min.b), Math.abs(csRanges[wheelSpace].max.b));
    maxC = Math.min(maxA, maxB) || 1;
    const steps = 70;
    const squareSize = radius * 2;
    for (let yi = 0; yi < steps; yi++) {
      for (let xi = 0; xi < steps; xi++) {
        const a = ((xi + 0.5) / steps) * 2 * maxC - maxC;
        const b = (1 - (yi + 0.5) / steps) * 2 * maxC - maxC;
        const lVal = wheelSpace === "lab" ? 75 : 0.75;
        const hex = encodeColor({ l: lVal, a, b }, wheelSpace);
        ctx.fillStyle = applyCvdHex(hex, type);
        const px = cx - radius + (xi / steps) * squareSize;
        const py = cy - radius + (yi / steps) * squareSize;
        ctx.fillRect(px, py, squareSize / steps, squareSize / steps);
      }
    }
  } else {
    for (let t = 0; t < slicesT; t++) {
      for (let r = 0; r < slicesR; r++) {
        const t0 = (t / slicesT) * 2 * Math.PI;
        const t1 = ((t + 1) / slicesT) * 2 * Math.PI;
        const r0 = r / slicesR;
        const r1 = (r + 1) / slicesR;
        const hue = ((t + 0.5) / slicesT) * 360;
        const chroma = (r + 0.5) / slicesR;
        const color = applyCvdHex(makeWheelColor(hue, chroma, wheelSpace), type);

        ctx.beginPath();
        ctx.moveTo(cx + radius * r0 * Math.cos(t0), cy + radius * r0 * Math.sin(t0));
        ctx.lineTo(cx + radius * r1 * Math.cos(t0), cy + radius * r1 * Math.sin(t0));
        ctx.lineTo(cx + radius * r1 * Math.cos(t1), cy + radius * r1 * Math.sin(t1));
        ctx.lineTo(cx + radius * r0 * Math.cos(t1), cy + radius * r0 * Math.sin(t1));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }

  const allColors = state.currentColors.map((c) => ({ color: c, shape: "circle" }))
    .concat(state.newColors.map((c) => ({ color: c, shape: "square" })));
  const coords = allColors.map((entry) => {
    const vals = decodeColor(entry.color, wheelSpace);
    const lx = csRanges[wheelSpace];
    const lNorm = clamp((vals.l - lx.min.l) / (lx.max.l - lx.min.l), 0, 1);

    if (isRectWheel) {
      const maxA = Math.max(Math.abs(csRanges[wheelSpace].min.a), Math.abs(csRanges[wheelSpace].max.a));
      const maxB = Math.max(Math.abs(csRanges[wheelSpace].min.b), Math.abs(csRanges[wheelSpace].max.b));
      const maxRectC = Math.min(maxA, maxB) || 1;
      const aVal = vals.a || 0;
      const bVal = vals.b || 0;
      return {
        color: entry.color,
        shape: entry.shape,
        x: cx + clamp(aVal / maxRectC, -1, 1) * radius,
        y: cy - clamp(bVal / maxRectC, -1, 1) * radius,
        lNorm,
      };
    } else {
      const hasHue = Number.isFinite(vals.h);
      let hueDeg = hasHue ? ((vals.h % 360) + 360) % 360 : ((Math.atan2(vals.b || 0, vals.a || 0) * 180) / Math.PI + 360) % 360;
      const sOrC = wheelSpace === "hsl" ? "s" : ("c" in vals ? "c" : null);
      let chroma;
      if (sOrC === "s") {
        chroma = vals.s || 0;
      } else if (sOrC === "c") {
        chroma = vals.c || 0;
      } else {
        chroma = Math.sqrt(Math.pow(vals.a || 0, 2) + Math.pow(vals.b || 0, 2));
      }
      const maxSC =
        sOrC === "s"
          ? csRanges[wheelSpace].max.s
          : sOrC === "c"
          ? csRanges[wheelSpace].max.c
          : Math.min(
              Math.max(Math.abs(csRanges[wheelSpace].min.a || 0), Math.abs(csRanges[wheelSpace].max.a || 0)),
              Math.max(Math.abs(csRanges[wheelSpace].min.b || 0), Math.abs(csRanges[wheelSpace].max.b || 0))
            );
      const rNorm = maxSC ? clamp(chroma / maxSC, 0, 1) : 0;
      const theta = (hueDeg / 180) * Math.PI;
      return {
        color: entry.color,
        shape: entry.shape,
        x: cx + radius * rNorm * Math.cos(theta),
        y: cy + radius * rNorm * Math.sin(theta),
        lNorm,
      };
    }
  });

  coords.forEach((pt) => {
    const fill = applyCvdHex(pt.color, type);
    ctx.beginPath();
    const sizePt = 6 + 12 * pt.lNorm;
    if (pt.shape === "square") {
      ctx.rect(pt.x - sizePt / 2, pt.y - sizePt / 2, sizePt, sizePt);
    } else {
      ctx.arc(pt.x, pt.y, sizePt / 2, 0, 2 * Math.PI);
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  });

  // axis labels
  ctx.fillStyle = "#0f172a";
  ctx.font = "11px 'Space Grotesk', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isRectWheel) {
    const maxA = Math.max(Math.abs(csRanges[wheelSpace].min.a), Math.abs(csRanges[wheelSpace].max.a));
    const maxB = Math.max(Math.abs(csRanges[wheelSpace].min.b), Math.abs(csRanges[wheelSpace].max.b));
    const pad = 14;
    ctx.fillText(`A -${maxA.toFixed(2)}`, cx - radius + pad, cy + radius + 22);
    ctx.fillText(`A +${maxA.toFixed(2)}`, cx + radius - pad, cy + radius + 22);
    ctx.textAlign = "right";
    ctx.fillText(`B +${maxB.toFixed(2)}`, cx - radius - 10, cy - radius + pad);
    ctx.fillText(`B -${maxB.toFixed(2)}`, cx - radius - 10, cy + radius - pad);
    ctx.textAlign = "center";
  } else {
    ctx.fillText("Hue 0°", cx + radius - 10, cy + radius + 22);
    ctx.fillText("Hue 180°", cx - radius + 10, cy + radius + 22);
    ctx.fillText("Sat/Chroma max", cx, cy - radius + 14);
    ctx.fillText("bounding circle", cx, cy - radius - 4);
  }

  if (state.bounds && ui.colorSpace.value === ui.colorwheelSpace.value) {
    const wheelSpaceCurrent = ui.colorwheelSpace.value;
    const channels = channelOrder[wheelSpaceCurrent];
    const hasHue = channels.includes("h");
    const scKey = channels.find((c) => c === "s" || c === "c");

    const strokeOverlay = () => {
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const hueSpanNorm = state.bounds.boundsH
      ? (state.bounds.boundsH[1] - state.bounds.boundsH[0] + 1) % 1
      : null;

    if (
      hasHue &&
      scKey &&
      state.bounds.boundsH &&
      state.bounds.boundsSc &&
      hueSpanNorm !== null &&
      hueSpanNorm > 0 &&
      hueSpanNorm < 0.999
    ) {
      let a0 = state.bounds.boundsH[0] * 2 * Math.PI;
      let a1 = state.bounds.boundsH[1] * 2 * Math.PI;
      while (a1 <= a0) a1 += 2 * Math.PI;
      const r0 = state.bounds.boundsSc[0] * radius;
      const r1 = state.bounds.boundsSc[1] * radius;
      ctx.beginPath();
      ctx.moveTo(cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0));
      ctx.arc(cx, cy, r1, a0, a1);
      if (r0 > 1e-3) {
        ctx.lineTo(cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1));
        ctx.arc(cx, cy, r0, a1, a0, true);
      } else {
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      strokeOverlay();
    } else {
      if (scKey && state.bounds.boundsSc) {
        const rMin = state.bounds.boundsSc[0] * radius;
        const rMax = state.bounds.boundsSc[1] * radius;
        ctx.beginPath();
        ctx.arc(cx, cy, rMin, 0, 2 * Math.PI);
        strokeOverlay();
        ctx.beginPath();
        ctx.arc(cx, cy, rMax, 0, 2 * Math.PI);
        strokeOverlay();
      }
      if (hasHue && state.bounds.boundsH && hueSpanNorm !== null && hueSpanNorm > 0 && hueSpanNorm < 0.999) {
        const start = state.bounds.boundsH[0] * 2 * Math.PI;
        const span = hueSpanNorm * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, start + span);
        ctx.closePath();
        strokeOverlay();
      }
    }

    if ((wheelSpaceCurrent === "lab" || wheelSpaceCurrent === "oklab") && state.bounds.boundsByName) {
      const aBounds = state.bounds.boundsByName.a;
      const bBounds = state.bounds.boundsByName.b;
      if (aBounds && bBounds) {
        const aRange = csRanges[wheelSpaceCurrent];
        const maxA = Math.max(Math.abs(aRange.min.a), Math.abs(aRange.max.a));
        const maxB = Math.max(Math.abs(aRange.min.b), Math.abs(aRange.max.b));
        const maxRectC = Math.min(maxA, maxB) || 1;
        const toVal = (bnd, min, max) => min + bnd * (max - min);
        const aMin = toVal(aBounds[0], aRange.min.a, aRange.max.a);
        const aMax = toVal(aBounds[1], aRange.min.a, aRange.max.a);
        const bMin = toVal(bBounds[0], aRange.min.b, aRange.max.b);
        const bMax = toVal(bBounds[1], aRange.min.b, aRange.max.b);
        const x0 = cx + clamp(aMin / maxRectC, -1, 1) * radius;
        const x1 = cx + clamp(aMax / maxRectC, -1, 1) * radius;
        const y0 = cy - clamp(bMax / maxRectC, -1, 1) * radius;
        const y1 = cy - clamp(bMin / maxRectC, -1, 1) * radius;

        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.setLineDash([]);
      }
    }
  }
}

export function makeWheelColor(hueDeg, chromaNorm, wheelSpace) {
  const fixedL = wheelSpace === "hsl" ? 0.5 : 0.75;
  if (wheelSpace === "hsl") {
    return encodeColor({ h: hueDeg, s: chromaNorm * csRanges.hsl.max.s, l: fixedL * csRanges.hsl.max.l }, "hsl");
  }
  if (wheelSpace === "lch") {
    return encodeColor({ l: fixedL * csRanges.lch.max.l, c: chromaNorm * csRanges.lch.max.c, h: hueDeg }, "lch");
  }
  if (wheelSpace === "oklch") {
    return encodeColor({ l: fixedL, c: chromaNorm * csRanges.oklch.max.c, h: hueDeg }, "oklch");
  }
  if (wheelSpace === "lab") {
    const maxA = Math.max(Math.abs(csRanges.lab.min.a), Math.abs(csRanges.lab.max.a));
    const maxB = Math.max(Math.abs(csRanges.lab.min.b), Math.abs(csRanges.lab.max.b));
    const maxC = Math.min(maxA, maxB);
    const c = chromaNorm * maxC;
    const a = c * Math.cos((hueDeg * Math.PI) / 180);
    const b = c * Math.sin((hueDeg * Math.PI) / 180);
    return encodeColor({ l: fixedL * csRanges.lab.max.l, a, b }, "lab");
  }
  if (wheelSpace === "oklab") {
    const maxA = Math.max(Math.abs(csRanges.oklab.min.a), Math.abs(csRanges.oklab.max.a));
    const maxB = Math.max(Math.abs(csRanges.oklab.min.b), Math.abs(csRanges.oklab.max.b));
    const maxC = Math.min(maxA, maxB);
    const c = chromaNorm * maxC;
    const a = c * Math.cos((hueDeg * Math.PI) / 180);
    const b = c * Math.sin((hueDeg * Math.PI) / 180);
    return encodeColor({ l: fixedL, a, b }, "oklab");
  }
  return encodeColor({ h: hueDeg, s: chromaNorm * 100, l: fixedL * 100 }, "hsl");
}

export function channelGradientForSpace(key, space, type) {
  const stops = 24;
  const colors = [];
  const hueStart = 285;
  const hueSpan = 360;
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    let hex;
    if (key === "h") {
      const h = hueStart + hueSpan * t;
      hex = encodeColor({ h, s: 100, l: 50 }, "hsl");
    } else if (key === "l") {
      const lVal = csRanges[space].min.l + t * (csRanges[space].max.l - csRanges[space].min.l);
      hex = encodeColor({ ...zeroChannels(space), l: lVal }, space);
    } else if (key === "s" || key === "c") {
      const scVal =
        csRanges[space].min[key] + t * (csRanges[space].max[key] - csRanges[space].min[key]);
      hex = encodeColor({ ...zeroChannels(space), [key]: scVal, l: midL(space) }, space);
    } else if (key === "a" || key === "b") {
      const val = csRanges[space].min[key] + t * (csRanges[space].max[key] - csRanges[space].min[key]);
      const obj = { ...zeroChannels(space), l: midL(space), [key]: val };
      hex = encodeColor(obj, space);
    } else {
      hex = encodeColor({ ...zeroChannels(space), l: midL(space) }, space);
    }
    colors.push(applyCvdHex(hex, type));
  }
  const gradient = colors.map((c, idx) => `${c} ${(idx / stops) * 100}%`).join(", ");
  return `linear-gradient(180deg, ${gradient})`;
}

function zeroChannels(space) {
  const ch = channelOrder[space];
  const obj = {};
  ch.forEach((key) => {
    if (key === "h") obj[key] = 0;
    else if (key === "l") obj[key] = midL(space);
    else obj[key] = 0;
  });
  return obj;
}

function midL(space) {
  return (csRanges[space].min.l + csRanges[space].max.l) / 2;
}
