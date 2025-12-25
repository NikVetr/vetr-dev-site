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
  const cvdModel = opts.cvdModel || ui?.cvdModel?.value || "legacy";
  const presetLabel = gamutPresets[gamutPreset]?.label || gamutPreset;
  const wheelSpace = opts.vizSpace || ui.colorwheelSpace.value;
  const canvas = refs.canvas;
  const ctx = canvas.getContext("2d");
  const size = refs.panel.clientWidth - 24;
  const deviceScale = window.devicePixelRatio || 1;
  const dim = Math.max(220, Math.min(380, size - 6));
  const TAU = Math.PI * 2;
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
  const hasHue = channels.includes("h");
  const rectKeys = !hasHue
    ? { l: channels[0] || "l", x: channels[1] || "a", y: channels[2] || "b" }
    : null;

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
  const rawOverride = state.rawInputOverride?.space === wheelSpace ? state.rawInputOverride.values : null;
  const rawCurrent = rawOverride?.length ? rawOverride : (state.rawCurrentColors?.length ? state.rawCurrentColors : null);
  const rawNew = state.rawNewColors?.length ? state.rawNewColors : null;
  const allColors = state.currentColors.map((c, idx) => {
    const vals = resolveVals(c, rawCurrent, idx, state.rawSpace);
    const displayHex = vals ? rgbToHex(convertColorValues(vals, wheelSpace, "rgb")) : c;
    return {
      role: "input",
      index: idx,
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
        role: "output",
        index: idx,
        color: c,
        displayColor: displayHex,
        shape: "square",
        vals,
      };
    }));
  const valueSet = allColors.map((c) => c.vals);
  const dataRange = effectiveRangeFromValues(valueSet, wheelSpace);
  const presetRange =
    computeGamutRange(wheelSpace, gamutPreset) ||
    rangeFromPreset(wheelSpace, gamutPreset) ||
    csRanges[wheelSpace];
  const baseRange = wheelSpace === "jzazbz" ? presetRange : csRanges[wheelSpace];
  const gamutRange = presetRange;
  // Keep the visualization axes stable: never shrink below the base range,
  // and only expand (no extra padding) when values fall outside.
  const unclippedRange =
    gamutMode === "full" ? baseRange : unionRanges(dataRange, baseRange, wheelSpace);
  const clippedRange =
    gamutMode === "full" ? gamutRange : unionRanges(dataRange, gamutRange, wheelSpace);
  const ranges = clipToGamut ? clippedRange : unclippedRange;

  const isRectWheel = !hasHue;
  let radius = baseRadius;
  if (isRectWheel) {
    const leftPad = 25;
    cx = dim / 2 + leftPad / 2;
    radius = Math.min(baseRadius, dim / 2 - leftPad);
  }
  if (isRectWheel) {
    const xKey = rectKeys.x;
    const yKey = rectKeys.y;
    const lKey = rectKeys.l;
    const maxX = Math.max(Math.abs(ranges.min[xKey] || 0), Math.abs(ranges.max[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(ranges.min[yKey] || 0), Math.abs(ranges.max[yKey] || 0)) || 1;
    const lMin = ranges.min[lKey] ?? 0;
    const lMax = ranges.max[lKey] ?? 1;
    const lVal = lMin + 0.75 * (lMax - lMin);
    const steps = 48;
    const squareSize = radius * 2;
    for (let yi = 0; yi < steps; yi++) {
      for (let xi = 0; xi < steps; xi++) {
        const xVal = ((xi + 0.5) / steps) * 2 * maxX - maxX;
        const yVal = (1 - (yi + 0.5) / steps) * 2 * maxY - maxY;
        const hex = encodeColor({ [lKey]: lVal, [xKey]: xVal, [yKey]: yVal }, wheelSpace);
        ctx.fillStyle = applyCvdHex(hex, type, 1, cvdModel);
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
        const color = applyCvdHex(makeWheelColor(hue, chroma, wheelSpace), type, 1, cvdModel);

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
    const lKey = isRectWheel ? rectKeys.l : "l";
    const lMin = useRange.min[lKey] ?? 0;
    const lMax = useRange.max[lKey] ?? 1;
    const lVal = v[lKey] ?? lMin;
    const lNorm = clamp((lVal - lMin) / Math.max(lMax - lMin, 1e-6), 0, 1);

    if (isRectWheel) {
      const xKey = rectKeys.x;
      const yKey = rectKeys.y;
      const maxX = Math.max(Math.abs(useRange.min[xKey] || 0), Math.abs(useRange.max[xKey] || 0)) || 1;
      const maxY = Math.max(Math.abs(useRange.min[yKey] || 0), Math.abs(useRange.max[yKey] || 0)) || 1;
      const x = cx + ((v[xKey] || 0) / maxX) * radius;
      const y = cy - ((v[yKey] || 0) / maxY) * radius;
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
      role: entry.role,
      index: entry.index,
      color: entry.color,
      shape: entry.shape,
      x: pt.x,
      y: pt.y,
      lNorm: pt.lNorm,
    };
  });
  refs.wheelMeta = {
    wheelSpace,
    ranges,
    cx,
    cy,
    radius,
    isRectWheel,
    rectKeys,
    scKey: channels.find((c) => c === "s" || c === "c") || null,
    clipToGamut,
    gamutPreset,
  };
  refs.wheelPoints = coords;

  // axis labels
  ctx.fillStyle = "#0f172a";
  ctx.font = "11px 'Space Grotesk', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isRectWheel) {
    const xKey = rectKeys.x;
    const yKey = rectKeys.y;
    const maxX = Math.max(Math.abs(ranges.min[xKey] || 0), Math.abs(ranges.max[xKey] || 0));
    const maxY = Math.max(Math.abs(ranges.min[yKey] || 0), Math.abs(ranges.max[yKey] || 0));
    const ticks = 5;
    const fmt = (v) => {
      const av = Math.abs(v);
      if (av < 0.005) return v.toFixed(3);
      if (av < 0.05) return v.toFixed(3);
      if (av < 0.5) return v.toFixed(2);
      if (av < 5) return v.toFixed(1);
      return v.toFixed(0);
    };
    for (let i = 0; i < ticks; i++) {
      const t = i / (ticks - 1);
      const xVal = (t * 2 - 1) * maxX;
      const yVal = (1 - t * 2) * maxY;
      const x = cx - radius + t * (2 * radius);
      const y = cy - radius + t * (2 * radius);
      ctx.fillText(fmt(xVal), x, cy + radius + 10);
      ctx.textAlign = "right";
      ctx.fillText(fmt(yVal), cx - radius - 6, y);
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
    const constraintSets = state.bounds.constraintSets;
    const factors = [0.6745, 1.2816, 1.96];

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
    const shadeExcludedEvenOdd = (shadeStyle, drawFullPath, drawAllowedPath) => {
      ctx.save();
      ctx.fillStyle = shadeStyle;
      ctx.beginPath();
      drawFullPath();
      drawAllowedPath();
      ctx.fill("evenodd");
      ctx.restore();
    };
    const toVal = (u, min, max) => min + u * (max - min);
    const mapRadius = (u) => {
      const minVal = toVal(u, baseRange.min[scKey], baseRange.max[scKey]);
      const maxSC = scKey === "s" ? ranges.max.s : ranges.max.c;
      return clamp(minVal / Math.max(maxSC, 1e-6), 0, 1) * radius;
    };

    if (!isRectWheel && constraintSets?.channels) {
      const hueC = constraintSets.channels.h;
      const scC = scKey ? constraintSets.channels[scKey] : null;
      const hueMode = hueC?.mode || "hard";
      const scMode = scC?.mode || "hard";
      const hueSegments = normalizeHueSegments(hueC?.intervalsRad || []);
      const scIntervals = scC?.intervals || [[0, 1]];
      const hueActive = hueSegments.length && !isFullArc(hueSegments);
      const scActive = scIntervals.length && !(scIntervals.length === 1 && scIntervals[0][0] <= 1e-6 && scIntervals[0][1] >= 1 - 1e-6);

      if ((hueActive && hueMode === "hard") || (scActive && scMode === "hard")) {
        const shadeHue = hueActive && hueMode === "hard" ? hueSegments : [[0, TAU]];
        const shadeSc = scActive && scMode === "hard" ? scIntervals : [[0, 1]];
        shadeExcludedEvenOdd(
          "rgba(255,255,255,0.60)",
          () => {
            ctx.moveTo(cx + radius, cy);
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
          },
          () => {
            shadeHue.forEach(([a, b]) => {
              shadeSc.forEach(([u0, u1]) => {
                const r0 = mapRadius(u0);
                const r1 = mapRadius(u1);
                ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
                ctx.arc(cx, cy, r1, a, b);
                if (r0 > 1e-3) {
                  ctx.lineTo(cx + r0 * Math.cos(b), cy + r0 * Math.sin(b));
                  ctx.arc(cx, cy, r0, b, a, true);
                } else {
                  ctx.lineTo(cx, cy);
                }
                ctx.closePath();
              });
            });
          }
        );
      }

      if (hueActive) {
        if (hueMode === "hard") {
          hueSegments.forEach(([a, b]) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, a, b);
            ctx.closePath();
            strokeOverlay();
          });
        } else {
          (hueC?.intervalsRad || []).forEach(([aRad, bRad]) => {
            const center = (aRad + bRad) / 2;
            const sigma = Math.max((bRad - aRad) / (2 * 1.96), 1e-3);
            factors.forEach((k) => {
              const start = center - k * sigma;
              const end = center + k * sigma;
              normalizeHueSegments([[start, end]]).forEach(([a, b]) => {
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, radius, a, b);
                ctx.closePath();
                strokeOverlay();
              });
            });
          });
        }
      }

      if (scActive && scKey) {
        if (scMode === "hard") {
          scIntervals.forEach(([u0, u1]) => {
            const rMin = mapRadius(u0);
            const rMax = mapRadius(u1);
            ctx.beginPath();
            ctx.arc(cx, cy, rMin, 0, 2 * Math.PI);
            strokeOverlay();
            ctx.beginPath();
            ctx.arc(cx, cy, rMax, 0, 2 * Math.PI);
            strokeOverlay();
          });
        } else {
          scIntervals.forEach(([u0, u1]) => {
            const center = (u0 + u1) / 2;
            const sigma = Math.max((u1 - u0) / (2 * 1.96), 1e-3);
            factors.forEach((k) => {
              const rA = mapRadius(clamp01(center - k * sigma));
              const rB = mapRadius(clamp01(center + k * sigma));
              ctx.beginPath();
              ctx.arc(cx, cy, rA, 0, 2 * Math.PI);
              strokeOverlay();
              ctx.beginPath();
              ctx.arc(cx, cy, rB, 0, 2 * Math.PI);
              strokeOverlay();
            });
          });
        }
      }
    }

    if (isRectWheel && constraintSets?.channels && rectKeys) {
      const xKey = rectKeys.x;
      const yKey = rectKeys.y;
      const xC = constraintSets.channels[xKey];
      const yC = constraintSets.channels[yKey];
      const xMode = xC?.mode || "hard";
      const yMode = yC?.mode || "hard";
      const xIntervals = xC?.intervals || [[0, 1]];
      const yIntervals = yC?.intervals || [[0, 1]];
      const xActive = xIntervals.length && !(xIntervals.length === 1 && xIntervals[0][0] <= 1e-6 && xIntervals[0][1] >= 1 - 1e-6);
      const yActive = yIntervals.length && !(yIntervals.length === 1 && yIntervals[0][0] <= 1e-6 && yIntervals[0][1] >= 1 - 1e-6);

      const maxX = Math.max(Math.abs(ranges.min[xKey] || 0), Math.abs(ranges.max[xKey] || 0)) || 1;
      const maxY = Math.max(Math.abs(ranges.min[yKey] || 0), Math.abs(ranges.max[yKey] || 0)) || 1;
      const xToCoord = (u) => {
        const val = toVal(u, baseRange.min[xKey], baseRange.max[xKey]);
        return cx + clamp(val / maxX, -1, 1) * radius;
      };
      const yToCoord = (u) => {
        const val = toVal(u, baseRange.min[yKey], baseRange.max[yKey]);
        return cy - clamp(val / maxY, -1, 1) * radius;
      };

      if ((xActive && xMode === "hard") || (yActive && yMode === "hard")) {
        const shadeX = xActive && xMode === "hard" ? xIntervals : [[0, 1]];
        const shadeY = yActive && yMode === "hard" ? yIntervals : [[0, 1]];
        shadeExcludedEvenOdd(
          "rgba(255,255,255,0.60)",
          () => {
            ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
          },
          () => {
            shadeX.forEach(([x0, x1]) => {
              shadeY.forEach(([y0, y1]) => {
                const xA = xToCoord(x0);
                const xB = xToCoord(x1);
                const yA = yToCoord(y0);
                const yB = yToCoord(y1);
                ctx.rect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
              });
            });
          }
        );
      }

      if (xActive || yActive) {
        if (xMode === "hard" && yMode === "hard") {
          xIntervals.forEach(([x0, x1]) => {
            yIntervals.forEach(([y0, y1]) => {
              const xA = xToCoord(x0);
              const xB = xToCoord(x1);
              const yA = yToCoord(y0);
              const yB = yToCoord(y1);
              ctx.beginPath();
              ctx.rect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
              strokeOverlay();
            });
          });
        } else {
          const xContours = xMode === "soft" ? contourIntervals(xIntervals, factors) : xIntervals;
          const yContours = yMode === "soft" ? contourIntervals(yIntervals, factors) : yIntervals;
          xContours.forEach(([x0, x1]) => {
            yContours.forEach(([y0, y1]) => {
              const xA = xToCoord(x0);
              const xB = xToCoord(x1);
              const yA = yToCoord(y0);
              const yB = yToCoord(y1);
              ctx.beginPath();
              ctx.rect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
              strokeOverlay();
            });
          });
        }
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
    const fill = applyCvdHex(pt.displayColor || pt.color, type, 1, cvdModel);
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

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeHueSegments(intervalsRad) {
  const segments = [];
  const TAU = Math.PI * 2;
  (intervalsRad || []).forEach(([aRad, bRad]) => {
    const span = bRad - aRad;
    if (span >= TAU - 1e-6) {
      segments.push([0, TAU]);
      return;
    }
    const start = ((aRad % TAU) + TAU) % TAU;
    const end = ((bRad % TAU) + TAU) % TAU;
    if (start <= end) {
      segments.push([start, end]);
    } else {
      segments.push([0, end], [start, TAU]);
    }
  });
  return mergeAngleSegments(segments);
}

function mergeAngleSegments(segments) {
  if (!segments?.length) return [];
  const TAU = Math.PI * 2;
  const sorted = segments
    .map(([a, b]) => [Math.max(0, a), Math.min(TAU, b)])
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

function isFullArc(segments) {
  const TAU = Math.PI * 2;
  return segments.length === 1 && segments[0][0] <= 1e-6 && segments[0][1] >= TAU - 1e-6;
}

function contourIntervals(intervals, factors) {
  const out = [];
  intervals.forEach(([a, b]) => {
    const center = (a + b) / 2;
    const sigma = Math.max((b - a) / (2 * 1.96), 1e-3);
    factors.forEach((k) => {
      const start = clamp01(center - k * sigma);
      const end = clamp01(center + k * sigma);
      if (end > start + 1e-6) out.push([start, end]);
    });
  });
  return out;
}

export function computeGamutRange(space, gamutPreset) {
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

export function channelGradientForSpace(key, space, type, cvdModel = "legacy", rangeOverride = null) {
  const range = rangeOverride || csRanges[space];
  const stops = 24;
  const colors = [];
  const hueStart = 285;
  const hueSpan = 360;
  const lightKey = lightnessKey(space);
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    let hex;
    if (key === "h") {
      const h = hueStart + hueSpan * t;
      hex = encodeColor({ h, s: 100, l: 50 }, "hsl");
    } else if (key === lightKey) {
      const lVal = range.min[lightKey] + t * (range.max[lightKey] - range.min[lightKey]);
      hex = encodeColor({ ...zeroChannels(space, range), [lightKey]: lVal }, space);
    } else if (key === "s" || key === "c") {
      const scVal =
        range.min[key] + t * (range.max[key] - range.min[key]);
      hex = encodeColor({ ...zeroChannels(space, range), [key]: scVal, [lightKey]: midL(space, range) }, space);
    } else if (key !== "h") {
      const val = range.min[key] + t * (range.max[key] - range.min[key]);
      const obj = { ...zeroChannels(space, range), [lightKey]: midL(space, range), [key]: val };
      hex = encodeColor(obj, space);
    } else {
      hex = encodeColor({ ...zeroChannels(space, range), [lightKey]: midL(space, range) }, space);
    }
    colors.push(applyCvdHex(hex, type, 1, cvdModel));
  }
  const gradient = colors.map((c, idx) => `${c} ${(idx / stops) * 100}%`).join(", ");
  return `linear-gradient(180deg, ${gradient})`;
}

function zeroChannels(space, rangeOverride = null) {
  const ch = channelOrder[space];
  const lightKey = lightnessKey(space);
  const obj = {};
  const range = rangeOverride || csRanges[space];
  ch.forEach((key) => {
    if (key === "h") obj[key] = 0;
    else if (key === lightKey) obj[key] = midL(space, range);
    else obj[key] = 0;
  });
  return obj;
}

function lightnessKey(space) {
  const ch = channelOrder[space] || [];
  if (ch.includes("l")) return "l";
  if (ch.includes("jz")) return "jz";
  return ch[0] || "l";
}

function midL(space, rangeOverride = null) {
  const lk = lightnessKey(space);
  const r = rangeOverride || csRanges[space];
  return (r.min[lk] + r.max[lk]) / 2;
}
