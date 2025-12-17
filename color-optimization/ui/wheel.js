import {
  channelOrder,
  csRanges,
  decodeColor,
  encodeColor,
  effectiveRangeFromValues,
  rangeFromPreset,
  gamutPresets,
  convertColorValues,
  projectToGamut,
  rgbToHex,
  GAMUTS,
} from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { contrastColor } from "../core/metrics.js";
import { clamp } from "../core/util.js";
import { buildGamutHullPaths, strokeHull } from "./gamutHull.js";

export function drawWheel(type, ui, state, opts = {}) {
  const refs = ui.panelMap[type];
  if (!refs) return;
  const gamutMode = opts.gamutMode || "auto";
  const clipToGamut = opts.clipToGamut === true || opts.clipToGamut === false ? opts.clipToGamut : false;
  const gamutPreset = opts.gamutPreset || "srgb";
  const presetLabel = gamutPresets[gamutPreset]?.label || gamutPreset;
  const wheelSpace = opts.vizSpace || ui.colorwheelSpace.value;
  const canvas = refs.canvas;
  const ctx = canvas.getContext("2d");
  const size = refs.panel.clientWidth - 24;
  const deviceScale = window.devicePixelRatio || 1;
  const dim = Math.max(220, Math.min(380, size - 6));
  canvas.width = dim * deviceScale;
  canvas.height = dim * deviceScale;
  canvas.style.width = `${dim}px`;
  canvas.style.height = `${dim}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(deviceScale, deviceScale);

  let cx = dim / 2;
  const cy = dim / 2;
  const baseRadius = (dim / 2) * 0.86;
  const slicesT = 60;
  const slicesR = 20;
  if (!csRanges[wheelSpace]) return;
  const channels = channelOrder[wheelSpace] || [];

  const resolveVals = (hex, rawVals, idx, sourceSpace) => {
    const raw = rawVals && rawVals[idx];
    if (raw) {
      return clipToGamut
        ? projectToGamut(raw, sourceSpace || wheelSpace, gamutPreset, wheelSpace)
        : sourceSpace && sourceSpace !== wheelSpace
          ? convertColorValues(raw, sourceSpace, wheelSpace)
          : raw;
    }
    const decoded = decodeColor(hex, wheelSpace);
    return clipToGamut ? projectToGamut(decoded, wheelSpace, gamutPreset, wheelSpace) : decoded;
  };
  const rawCurrent = state.rawCurrentColors?.length ? state.rawCurrentColors : null;
  const rawNew = state.rawNewColors?.length ? state.rawNewColors : null;
  const allColors = state.currentColors.map((c, idx) => {
    const vals = resolveVals(c, rawCurrent, idx, state.rawSpace);
    const displayHex = vals ? rgbToHex(convertColorValues(vals, wheelSpace, "rgb")) : c;
    return {
      color: c,
      displayColor: displayHex,
      shape: "circle",
      vals,
    };
  })
    .concat(state.newColors.map((c, idx) => {
      const vals = resolveVals(c, rawNew, idx, state.newRawSpace);
      const displayHex = vals ? rgbToHex(convertColorValues(vals, wheelSpace, "rgb")) : c;
      return {
        color: c,
        displayColor: displayHex,
        shape: "square",
        vals,
      };
    }));
  const valueSet = allColors.map((c) => c.vals);
  const dataRange = effectiveRangeFromValues(valueSet, wheelSpace);
  const baseRange = csRanges[wheelSpace];
  const gamutRange =
    computeGamutRange(wheelSpace, gamutPreset) ||
    rangeFromPreset(wheelSpace, gamutPreset) ||
    baseRange;
  // Keep the visualization axes stable: never shrink below the base range,
  // and only expand (no extra padding) when values fall outside.
  const unclippedRange =
    gamutMode === "full" ? baseRange : unionRanges(dataRange, baseRange, wheelSpace);
  const clippedRange =
    gamutMode === "full" ? gamutRange : unionRanges(dataRange, gamutRange, wheelSpace);
  const ranges = clipToGamut ? clippedRange : unclippedRange;

  const isRectWheel = wheelSpace === "lab" || wheelSpace === "oklab";
  let radius = baseRadius;
  let maxC = 1;
  if (isRectWheel) {
    const leftPad = 25;
    cx = dim / 2 + leftPad / 2;
    radius = Math.min(baseRadius, dim / 2 - leftPad);
  }
  if (isRectWheel) {
    const maxA = Math.max(Math.abs(ranges.min.a), Math.abs(ranges.max.a));
    const maxB = Math.max(Math.abs(ranges.min.b), Math.abs(ranges.max.b));
    maxC = Math.min(maxA, maxB) || 1;
    const steps = 48;
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

  const scaleRange = ranges;

  const toPoint = (vals, rangeOverride) => {
    const useRange = rangeOverride || scaleRange;
    const v = vals;
    const lMin = useRange.min.l ?? 0;
    const lMax = useRange.max.l ?? 1;
    const lVal = v.l ?? ((wheelSpace === "lab" || wheelSpace === "oklab") ? 0 : lMin);
    const lNorm = clamp((lVal - lMin) / Math.max(lMax - lMin, 1e-6), 0, 1);

    if (isRectWheel) {
      const maxA = Math.max(Math.abs(useRange.min.a), Math.abs(useRange.max.a)) || 1;
      const maxB = Math.max(Math.abs(useRange.min.b), Math.abs(useRange.max.b)) || 1;
      const x = cx + (v.a / maxA) * radius;
      const y = cy - (v.b / maxB) * radius;
      return { x, y, lNorm };
    }

    const chans = channelOrder[wheelSpace];
    const scKey = chans.find((c) => c === "s" || c === "c") || ("c" in v ? "c" : null);
    const hasHue = Number.isFinite(v.h);
    const hueDeg = hasHue
      ? ((v.h % 360) + 360) % 360
      : ((Math.atan2(v.b || 0, v.a || 0) * 180) / Math.PI + 360) % 360;
    let chroma;
    if (scKey === "s") chroma = v.s || 0;
    else if (scKey === "c") chroma = v.c || 0;
    else chroma = Math.sqrt(Math.pow(v.a || 0, 2) + Math.pow(v.b || 0, 2));

    const maxSC =
      scKey === "s"
        ? useRange.max.s
        : scKey === "c"
        ? useRange.max.c
        : Math.min(
            Math.max(Math.abs(useRange.min.a || 0), Math.abs(useRange.max.a || 0)),
            Math.max(Math.abs(useRange.min.b || 0), Math.abs(useRange.max.b || 0))
          );
    const rNorm = clamp(chroma / Math.max(maxSC, 1e-6), 0, 1);
    const theta = (hueDeg / 180) * Math.PI;
    return {
      x: cx + radius * rNorm * Math.cos(theta),
      y: cy + radius * rNorm * Math.sin(theta),
      lNorm,
    };
  };

  const coords = allColors.map((entry) => {
    const pt = toPoint(entry.vals);
    return {
      color: entry.color,
      shape: entry.shape,
      x: pt.x,
      y: pt.y,
      lNorm: pt.lNorm,
    };
  });

  // axis labels
  ctx.fillStyle = "#0f172a";
  ctx.font = "11px 'Space Grotesk', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isRectWheel) {
    const maxA = Math.max(Math.abs(ranges.min.a), Math.abs(ranges.max.a));
    const maxB = Math.max(Math.abs(ranges.min.b), Math.abs(ranges.max.b));
    const ticks = 5;
    for (let i = 0; i < ticks; i++) {
      const t = i / (ticks - 1);
      const aVal = (t * 2 - 1) * maxA;
      const bVal = (1 - t * 2) * maxB;
      const x = cx - radius + t * (2 * radius);
      const y = cy - radius + t * (2 * radius);
      ctx.fillText(aVal.toFixed(1), x, cy + radius + 10);
      ctx.textAlign = "right";
      ctx.fillText(bVal.toFixed(1), cx - radius - 6, y);
      ctx.textAlign = "center";
    }
  } else {
    const tickAngles = Array.from({ length: 12 }, (_, i) => i * 30);
    const labelR = radius + 8;
    tickAngles.forEach((deg) => {
      const ang = (deg * Math.PI) / 180;
      const tx = cx + labelR * Math.cos(ang);
      const ty = cy + labelR * Math.sin(ang);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang + Math.PI / 2);
      ctx.fillText(`${deg}`, 0, 0);
      ctx.restore();
    });
  }

  if (state.bounds && ui.colorSpace.value === wheelSpace) {
    const wheelSpaceCurrent = wheelSpace;
    const hasHue = channels.includes("h");
    const scKey = channels.find((c) => c === "s" || c === "c");
    const baseRange = state.bounds.ranges || csRanges[wheelSpaceCurrent];

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
    const isFull01 = (b) => Array.isArray(b) && b.length === 2 && b[0] <= 1e-6 && b[1] >= 1 - 1e-6;

    const hueSpanNorm = state.bounds.boundsH
      ? (state.bounds.boundsH[1] - state.bounds.boundsH[0] + 1) % 1
      : null;

    if (
      hasHue &&
      scKey &&
      state.bounds.boundsH &&
      hueSpanNorm !== null &&
      hueSpanNorm > 0 &&
      hueSpanNorm < 0.999
    ) {
      if (isFull01(state.bounds.boundsH) || isFull01(state.bounds.boundsByName?.[scKey])) {
        // unconstrained in hue and/or chroma -> skip overlay
      } else {
      let a0 = state.bounds.boundsH[0] * 2 * Math.PI;
      let a1 = state.bounds.boundsH[1] * 2 * Math.PI;
      while (a1 <= a0) a1 += 2 * Math.PI;
      const b = state.bounds.boundsByName?.[scKey];
      const toVal = (bnd, min, max) => min + bnd * (max - min);
      const minVal = toVal(b[0], baseRange.min[scKey], baseRange.max[scKey]);
      const maxVal = toVal(b[1], baseRange.min[scKey], baseRange.max[scKey]);
      const maxSC = scKey === "s" ? ranges.max.s : ranges.max.c;
      const r0 = clamp(minVal / Math.max(maxSC, 1e-6), 0, 1) * radius;
      const r1 = clamp(maxVal / Math.max(maxSC, 1e-6), 0, 1) * radius;
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
      }
    } else {
      if (scKey && state.bounds.boundsByName?.[scKey] && !isFull01(state.bounds.boundsByName[scKey])) {
        const b = state.bounds.boundsByName[scKey];
        const toVal = (bnd, min, max) => min + bnd * (max - min);
        const minVal = toVal(b[0], baseRange.min[scKey], baseRange.max[scKey]);
        const maxVal = toVal(b[1], baseRange.min[scKey], baseRange.max[scKey]);
        const maxSC = scKey === "s" ? ranges.max.s : ranges.max.c;
        const rMin = clamp(minVal / Math.max(maxSC, 1e-6), 0, 1) * radius;
        const rMax = clamp(maxVal / Math.max(maxSC, 1e-6), 0, 1) * radius;
        ctx.beginPath();
        ctx.arc(cx, cy, rMin, 0, 2 * Math.PI);
        strokeOverlay();
        ctx.beginPath();
        ctx.arc(cx, cy, rMax, 0, 2 * Math.PI);
        strokeOverlay();
      }
      if (hasHue && state.bounds.boundsH && !isFull01(state.bounds.boundsH) && hueSpanNorm !== null && hueSpanNorm > 0 && hueSpanNorm < 0.999) {
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
        if (isFull01(aBounds) && isFull01(bBounds)) return;
        const maxA = Math.max(Math.abs(ranges.min.a), Math.abs(ranges.max.a));
        const maxB = Math.max(Math.abs(ranges.min.b), Math.abs(ranges.max.b));
        const maxRectC = Math.min(maxA, maxB) || 1;
        const toVal = (bnd, min, max) => min + bnd * (max - min);
        const aMin = toVal(aBounds[0], baseRange.min.a, baseRange.max.a);
        const aMax = toVal(aBounds[1], baseRange.min.a, baseRange.max.a);
        const bMin = toVal(bBounds[0], baseRange.min.b, baseRange.max.b);
        const bMax = toVal(bBounds[1], baseRange.min.b, baseRange.max.b);
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

  // True gamut hull overlay
  if (clipToGamut) {
    const hullPaths = buildGamutHullPaths(gamutPreset, wheelSpace, (vals) => toPoint(vals, scaleRange));
    strokeHull(ctx, hullPaths);
  }

  // draw points above overlays
  coords.forEach((pt) => {
    const fill = applyCvdHex(pt.displayColor || pt.color, type);
    ctx.beginPath();
    const sizePt = 6 + 12 * pt.lNorm;
    if (pt.shape === "square") {
      ctx.rect(pt.x - sizePt / 2, pt.y - sizePt / 2, sizePt, sizePt);
    } else {
      ctx.arc(pt.x, pt.y, sizePt / 2, 0, 2 * Math.PI);
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = contrastColor(fill);
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  });

  ctx.fillStyle = "#0f172a";
  ctx.font = "12px 'Space Grotesk', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${presetLabel}${clipToGamut ? " (clipped)" : " (raw)"}`, 8, 6);
}

const gamutRangeCache = new Map();

function unionRanges(a, b, space) {
  const channels = channelOrder[space] || [];
  const min = {};
  const max = {};
  channels.forEach((ch) => {
    min[ch] = Math.min(a?.min?.[ch] ?? Infinity, b?.min?.[ch] ?? Infinity);
    max[ch] = Math.max(a?.max?.[ch] ?? -Infinity, b?.max?.[ch] ?? -Infinity);
  });
  return { min, max };
}

function padRange(range, frac = 0.06) {
  const min = { ...range.min };
  const max = { ...range.max };
  Object.keys(min).forEach((ch) => {
    if (ch === "h") return;
    const span = max[ch] - min[ch];
    const pad = span === 0 ? Math.max(Math.abs(max[ch]) || 1, 1) * frac : span * frac;
    min[ch] = min[ch] - pad;
    max[ch] = max[ch] + pad;
  });
  return { min, max };
}

function computeGamutRange(space, gamutPreset) {
  const key = `${space}::${gamutPreset}`;
  if (gamutRangeCache.has(key)) return gamutRangeCache.get(key);
  const gamut = GAMUTS[gamutPreset] || GAMUTS["srgb"];
  const channels = channelOrder[space] || [];
  if (!gamut || !channels.length) return null;

  // Sample the gamut cube edges in XYZ then convert to the visualization space.
  const edges = [
    [[0, 0, 0], [1, 0, 0]],
    [[0, 0, 0], [0, 1, 0]],
    [[0, 0, 0], [0, 0, 1]],
    [[1, 1, 1], [0, 1, 1]],
    [[1, 1, 1], [1, 0, 1]],
    [[1, 1, 1], [1, 1, 0]],
    [[1, 0, 0], [1, 1, 0]],
    [[1, 0, 0], [1, 0, 1]],
    [[0, 1, 0], [1, 1, 0]],
    [[0, 1, 0], [0, 1, 1]],
    [[0, 0, 1], [1, 0, 1]],
    [[0, 0, 1], [0, 1, 1]],
  ];
  const steps = 18;

  const min = {};
  const max = {};
  channels.forEach((ch) => {
    if (ch === "h") {
      min[ch] = csRanges[space]?.min?.[ch] ?? 0;
      max[ch] = csRanges[space]?.max?.[ch] ?? 360;
      return;
    }
    min[ch] = Infinity;
    max[ch] = -Infinity;
  });

  for (const [a, b] of edges) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = a[0] + (b[0] - a[0]) * t;
      const g = a[1] + (b[1] - a[1]) * t;
      const bl = a[2] + (b[2] - a[2]) * t;
      const xyz = gamut.toXYZ(r, g, bl);
      const vals = convertColorValues(xyz, "xyz", space);
      channels.forEach((ch) => {
        if (ch === "h") return;
        const v = vals?.[ch];
        if (!Number.isFinite(v)) return;
        if (v < min[ch]) min[ch] = v;
        if (v > max[ch]) max[ch] = v;
      });
    }
  }

  const fallback = rangeFromPreset(space, gamutPreset) || csRanges[space];
  channels.forEach((ch) => {
    if (ch === "h") return;
    if (!Number.isFinite(min[ch]) || !Number.isFinite(max[ch])) {
      min[ch] = fallback.min[ch];
      max[ch] = fallback.max[ch];
    }
  });

  const out = { min, max };
  gamutRangeCache.set(key, out);
  return out;
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
