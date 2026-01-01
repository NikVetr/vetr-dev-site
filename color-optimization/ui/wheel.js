import {
  channelOrder,
  csRanges,
  decodeColor,
  encodeColor,
  effectiveRangeFromValues,
  normalizeWithRange,
  rangeFromPreset,
  gamutPresets,
  convertColorValues,
  projectToGamut,
  isInGamut,
  rgbToHex,
} from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { contrastColor } from "../core/metrics.js";
import { clamp } from "../core/util.js";
import { buildGamutProjectionBoundary, smoothBoundary, strokeBoundary } from "./gamutHull.js";

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
  const presetRange = rangeFromPreset(wheelSpace, gamutPreset) || csRanges[wheelSpace];
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
        const colorVals = { [lKey]: lVal, [xKey]: xVal, [yKey]: yVal };
        const px = cx - radius + (xi / steps) * squareSize;
        const py = cy - radius + (yi / steps) * squareSize;
        // When clipping to gamut, project out-of-gamut colors to gamut boundary
        // (rather than showing white, show the nearest in-gamut color)
        let displayVals = colorVals;
        if (clipToGamut && !isInGamut(colorVals, wheelSpace, gamutPreset)) {
          displayVals = projectToGamut(colorVals, wheelSpace, gamutPreset, wheelSpace);
        }
        const hex = encodeColor(displayVals, wheelSpace);
        ctx.fillStyle = applyCvdHex(hex, type, 1, cvdModel);
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
        // When clipping to gamut, project out-of-gamut colors to gamut boundary
        const wheelColorVals = makeWheelColorVals(hue, chroma, wheelSpace);
        let displayVals = wheelColorVals;
        if (clipToGamut && !isInGamut(wheelColorVals, wheelSpace, gamutPreset)) {
          displayVals = projectToGamut(wheelColorVals, wheelSpace, gamutPreset, wheelSpace);
        }
        const color = applyCvdHex(encodeColor(displayVals, wheelSpace), type, 1, cvdModel);

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
  const constraintPoints = [];
  if (ui.constraintTopology?.value === "custom" && state.customConstraints?.values?.length) {
    const sourceSpace = state.customConstraints.space || ui.colorSpace.value;
    state.customConstraints.values.forEach((vals, idx) => {
      let resolved = vals;
      try {
        if (sourceSpace && sourceSpace !== wheelSpace) {
          resolved = convertColorValues(vals, sourceSpace, wheelSpace);
        }
      } catch (e) {
        resolved = vals;
      }
      if (!resolved) return;
      const displayHex = rgbToHex(convertColorValues(resolved, wheelSpace, "rgb"));
      const pt = toPoint(resolved);
      constraintPoints.push({
        role: "constraint",
        index: idx,
        color: displayHex,
        displayColor: displayHex,
        shape: "diamond",
        x: pt.x,
        y: pt.y,
        lNorm: pt.lNorm,
      });
    });
  }
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
  refs.constraintPoints = constraintPoints;

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
    const topology = constraintSets?.topology || "contiguous";

    const toVal = (u, min, max) => min + u * (max - min);
    const mapRadius = (u) => {
      const minVal = toVal(u, baseRange.min[scKey], baseRange.max[scKey]);
      const maxSC = scKey === "s" ? ranges.max.s : ranges.max.c;
      return clamp(minVal / Math.max(maxSC, 1e-6), 0, 1) * radius;
    };

    // Extract input colors for colored constraint boundaries
    const inputColors = allColors.filter((c) => c.role === "input").map((c) => c.color);

    // Draw constraint visualizations based on mode (wrapped in try-catch to prevent rendering failures)
    // Note: We don't clip constraints to gamut here because the base viz already shows white
    // outside the gamut, so constraint overlays naturally blend with it.
    try {
      if (!isRectWheel && constraintSets?.channels) {
        drawPolarConstraints(ctx, cx, cy, radius, constraintSets, scKey, topology, mapRadius, inputColors);
      }

      if (isRectWheel && constraintSets?.channels && rectKeys) {
        drawRectConstraints(ctx, cx, cy, radius, constraintSets, rectKeys, baseRange, ranges, topology, inputColors);
      }
    } catch (e) {
      console.warn("Constraint visualization error:", e);
    }
  }

  // Helper function for polar wheel constraints
  function drawPolarConstraints(ctx, cx, cy, radius, constraintSets, scKey, topology, mapRadius, inputColors = []) {
    const hueC = constraintSets.channels.h;
    const scC = scKey ? constraintSets.channels[scKey] : null;
    const hueMode = hueC?.mode || "hard";
    const scMode = scC?.mode || "hard";
    const isCustom = topology === "custom";
    const isDiscontiguous = topology === "discontiguous" || isCustom;

    // Check if constraints are active
    const hueSegments = normalizeHueSegments(hueC?.intervalsRad || []);
    const scIntervals = scC?.intervals || [[0, 1]];
    const hueWindows = hueC?.pointWindows || [];
    const scWindows = scC?.pointWindows || [];

    // For discontiguous mode, check point windows; for contiguous, check merged intervals
    const hueActiveContiguous = hueSegments.length && !isFullArc(hueSegments);
    const scActiveContiguous = scIntervals.length && !(scIntervals.length === 1 && scIntervals[0][0] <= 1e-6 && scIntervals[0][1] >= 1 - 1e-6);
    const hueActiveDiscontiguous = hueWindows.some((w) => w);
    const scActiveDiscontiguous = scWindows.some((w) => w);
    const hueActive = isDiscontiguous ? hueActiveDiscontiguous : hueActiveContiguous;
    const scActive = isDiscontiguous ? scActiveDiscontiguous : scActiveContiguous;

    if (!hueActive && !scActive) return;

    // For discontiguous mode, draw per-point windows
    if (isDiscontiguous) {
      if (hueMode === "soft" || scMode === "soft") {
        // Soft discontiguous: draw gradient circles around each point
        drawSoftDiscontiguousPolar(ctx, cx, cy, radius, hueWindows, scWindows, hueMode, scMode, mapRadius, hueC?.width ?? 0, scC?.width ?? 0);
      } else {
        // Hard discontiguous: draw per-point regions with shading
        drawHardDiscontiguousPolar(ctx, cx, cy, radius, hueWindows, scWindows, hueActive, scActive, mapRadius, inputColors, isCustom);
      }
    } else {
      // Contiguous mode
      if (hueMode === "soft" || scMode === "soft") {
        // Soft contiguous: draw contour lines
        drawSoftContiguousPolar(ctx, cx, cy, radius, hueC, scC, hueMode, scMode, hueActive, scActive, mapRadius, hueC?.width ?? 0, scC?.width ?? 0);
      } else {
        // Hard contiguous: draw excluded shading + boundary lines
        drawHardContiguousPolar(ctx, cx, cy, radius, hueSegments, scIntervals, hueActive, scActive, mapRadius);
      }
    }

    // For custom mode, only draw per-point windows (no bounding union overlay).
  }

  function drawHardContiguousPolar(ctx, cx, cy, radius, hueSegments, scIntervals, hueActive, scActive, mapRadius) {
    const shadeHue = hueActive ? hueSegments : [[0, TAU]];
    const shadeSc = scActive ? scIntervals : [[0, 1]];

    // Shade excluded regions
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.beginPath();
    ctx.moveTo(cx + radius, cy);
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
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
    ctx.fill("evenodd");
    ctx.restore();

    // Draw boundary lines
    if (hueActive) {
      hueSegments.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, a, b);
        ctx.closePath();
        strokeConstraintBoundary(ctx);
      });
    }
    if (scActive) {
      scIntervals.forEach(([u0, u1]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, mapRadius(u0), 0, 2 * Math.PI);
        strokeConstraintBoundary(ctx);
        ctx.beginPath();
        ctx.arc(cx, cy, mapRadius(u1), 0, 2 * Math.PI);
        strokeConstraintBoundary(ctx);
      });
    }
  }

  function drawSoftContiguousPolar(ctx, cx, cy, radius, hueC, scC, hueMode, scMode, hueActive, scActive, mapRadius, hueWidth, scWidth) {
    const hueStrength = clamp01(hueWidth);
    const scStrength = clamp01(scWidth);
    const strength = Math.max(hueMode === "soft" ? hueStrength : 0, scMode === "soft" ? scStrength : 0);
    const maxOpacity = clamp01(strength);
    const nAngular = 48; // Angular resolution
    const nRadial = 24;  // Radial resolution
    if (maxOpacity <= 1e-4) return;

    // Get the allowed region bounds
    const hueIntervals = hueC?.intervalsRad || [[0, TAU]];
    const scIntervals = scC?.intervals || [[0, 1]];
    const hueStart = hueIntervals[0]?.[0] ?? 0;
    const hueEnd = hueIntervals[0]?.[1] ?? TAU;
    const scMin = scIntervals[0]?.[0] ?? 0;
    const scMax = scIntervals[0]?.[1] ?? 1;

    const hueIsHard = hueActive && hueMode === "hard";
    const scIsHard = scActive && scMode === "hard";
    const hueIsSoft = hueActive && hueMode === "soft";
    const scIsSoft = scActive && scMode === "soft";

    // Calculate sigma for soft dimensions
    const sigmaHue = hueIsSoft ? Math.max((hueEnd - hueStart) / (2 * 1.96), 1e-3) : Infinity;
    const sigmaSc = scIsSoft ? Math.max((scMax - scMin) / (2 * 1.96), 1e-3) : Infinity;

    // For mixed hard/soft: draw hard overlay for hard dimension(s)
    if (hueIsHard && !scIsHard) {
      // Hue is hard, saturation is soft: draw hard overlay outside hue bounds
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.60)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      // Cut out the allowed hue wedge (full radius)
      ctx.moveTo(cx + radius * Math.cos(hueStart), cy + radius * Math.sin(hueStart));
      ctx.arc(cx, cy, radius, hueStart, hueEnd);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill("evenodd");
      ctx.restore();
    }

    if (scIsHard && !hueIsHard) {
      // Saturation is hard, hue is soft: draw hard overlay outside saturation bounds
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.60)";
      // Inner region (r < scMin)
      if (scMin > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, mapRadius(scMin), 0, TAU);
        ctx.fill();
      }
      // Outer region (r > scMax)
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.arc(cx, cy, mapRadius(scMax), TAU, 0, true);
      ctx.fill();
      ctx.restore();
    }

    // Draw soft gradient for soft dimension(s)
    if (sigmaHue < Infinity || sigmaSc < Infinity) {
      for (let ai = 0; ai < nAngular; ai++) {
        for (let ri = 0; ri < nRadial; ri++) {
          const angle = (ai + 0.5) / nAngular * TAU;
          const rNorm = (ri + 0.5) / nRadial;

          // For hard dimensions, skip cells outside hard bounds
          if (hueIsHard && !isAngleInInterval(angle, hueStart, hueEnd)) continue;
          if (scIsHard && (rNorm < scMin || rNorm > scMax)) continue;

          // Compute angular distance for soft hue
          let dHue = 0;
          if (hueIsSoft) {
            const inInterval = isAngleInInterval(angle, hueStart, hueEnd);
            if (!inInterval) {
              const dToStart = angularDistance(angle, hueStart);
              const dToEnd = angularDistance(angle, hueEnd);
              dHue = Math.min(dToStart, dToEnd);
            }
          }

          // Compute radial distance for soft saturation
          let dSc = 0;
          if (scIsSoft) {
            if (rNorm < scMin) dSc = scMin - rNorm;
            else if (rNorm > scMax) dSc = rNorm - scMax;
          }

          // Compute z-scores
          const zHue = sigmaHue < Infinity ? dHue / sigmaHue : 0;
          const zSc = sigmaSc < Infinity ? dSc / sigmaSc : 0;

          // Combined falloff
          const zSq = zHue * zHue + zSc * zSc;
          if (zSq < 1e-6) continue;

          const falloff = 1 - Math.exp(-0.5 * zSq);
          const opacity = maxOpacity * falloff;

          if (opacity > 0.01) {
            const angle0 = ai / nAngular * TAU;
            const angle1 = (ai + 1) / nAngular * TAU;
            const r0 = mapRadius(ri / nRadial);
            const r1 = mapRadius((ri + 1) / nRadial);

            ctx.beginPath();
            ctx.arc(cx, cy, r1, angle0, angle1);
            if (r0 > 1) {
              ctx.arc(cx, cy, r0, angle1, angle0, true);
            } else {
              ctx.lineTo(cx, cy);
            }
            ctx.closePath();
            ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
            ctx.fill();
          }
        }
      }
    }

    // Draw hard boundaries for hard dimensions
    if (hueIsHard) {
      // Draw hue boundary lines (radial lines)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(hueStart), cy + radius * Math.sin(hueStart));
      strokeConstraintBoundary(ctx);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(hueEnd), cy + radius * Math.sin(hueEnd));
      strokeConstraintBoundary(ctx);
    }

    if (scIsHard) {
      // Draw saturation boundary circles
      ctx.beginPath();
      ctx.arc(cx, cy, mapRadius(scMin), 0, TAU);
      strokeConstraintBoundary(ctx);
      ctx.beginPath();
      ctx.arc(cx, cy, mapRadius(scMax), 0, TAU);
      strokeConstraintBoundary(ctx);
    }
  }

  // Helper: check if angle is within interval (handles wraparound)
  function isAngleInInterval(angle, start, end) {
    angle = ((angle % TAU) + TAU) % TAU;
    start = ((start % TAU) + TAU) % TAU;
    end = ((end % TAU) + TAU) % TAU;
    if (start <= end) {
      return angle >= start && angle <= end;
    } else {
      // Interval wraps around 0
      return angle >= start || angle <= end;
    }
  }

  // Helper: compute minimum angular distance between two angles
  function angularDistance(a, b) {
    const diff = Math.abs(((a - b) % TAU + TAU) % TAU);
    return Math.min(diff, TAU - diff);
  }

  function drawHardDiscontiguousPolar(ctx, cx, cy, radius, hueWindows, scWindows, hueActive, scActive, mapRadius, inputColors = [], useConstraintBoundaryStyle = false) {
    // For discontiguous mode, draw PER-POINT regions (not Cartesian product)
    // Each input point has its own (hue, saturation) window
    const numPoints = Math.max(hueWindows.length, scWindows.length);

    // Use offscreen canvas to properly handle overlapping regions
    // (evenodd would incorrectly toggle overlapping areas)
    const offscreen = document.createElement("canvas");
    offscreen.width = ctx.canvas.width;
    offscreen.height = ctx.canvas.height;
    const offCtx = offscreen.getContext("2d");

    // Apply same transform as main canvas (for device pixel ratio)
    const scale = ctx.canvas.width / (radius * 2 / 0.86 + 6); // Approximate scale factor
    offCtx.setTransform(ctx.getTransform());

    // Fill entire circle with white overlay on offscreen canvas
    offCtx.fillStyle = "rgba(255,255,255,0.60)";
    offCtx.beginPath();
    offCtx.arc(cx, cy, radius, 0, 2 * Math.PI);
    offCtx.fill();

    // Clear out allowed regions using destination-out
    offCtx.globalCompositeOperation = "destination-out";
    offCtx.fillStyle = "rgba(255,255,255,1)";

    for (let i = 0; i < numPoints; i++) {
      const hW = hueWindows.length ? hueWindows[i % hueWindows.length] : null;
      const scW = scWindows.length ? scWindows[i % scWindows.length] : null;

      // Use point window if active, otherwise full range
      const hueStart = hW && hueActive ? hW.center - hW.radius : 0;
      const hueEnd = hW && hueActive ? hW.center + hW.radius : TAU;
      const scMin = scW && scActive ? scW.min : 0;
      const scMax = scW && scActive ? scW.max : 1;

      const r0 = mapRadius(scMin);
      const r1 = mapRadius(scMax);

      offCtx.beginPath();
      offCtx.moveTo(cx + r1 * Math.cos(hueStart), cy + r1 * Math.sin(hueStart));
      offCtx.arc(cx, cy, r1, hueStart, hueEnd);
      if (r0 > 1e-3) {
        offCtx.lineTo(cx + r0 * Math.cos(hueEnd), cy + r0 * Math.sin(hueEnd));
        offCtx.arc(cx, cy, r0, hueEnd, hueStart, true);
      } else {
        offCtx.lineTo(cx, cy);
      }
      offCtx.closePath();
      offCtx.fill();
    }

    // Composite the mask onto the main canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for drawImage
    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();

    // Draw per-point window boundaries with colored lines
    for (let i = 0; i < numPoints; i++) {
      const hW = hueWindows.length ? hueWindows[i % hueWindows.length] : null;
      const scW = scWindows.length ? scWindows[i % scWindows.length] : null;
      const hasHue = hW && hueActive;
      const hasSc = scW && scActive;
      const pointColor = inputColors[i % inputColors.length] || null;

      if (hasHue && hasSc) {
        // Draw the combined wedge-annulus boundary for this point
        const hueStart = hW.center - hW.radius;
        const hueEnd = hW.center + hW.radius;
        const r0 = mapRadius(scW.min);
        const r1 = mapRadius(scW.max);

        ctx.beginPath();
        ctx.arc(cx, cy, r1, hueStart, hueEnd);
        if (r0 > 1e-3) {
          ctx.lineTo(cx + r0 * Math.cos(hueEnd), cy + r0 * Math.sin(hueEnd));
          ctx.arc(cx, cy, r0, hueEnd, hueStart, true);
        } else {
          ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        if (useConstraintBoundaryStyle) strokeConstraintBoundary(ctx);
        else strokePointWindowColored(ctx, pointColor);
      } else if (hasHue) {
        // Only hue constraint
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, hW.center - hW.radius, hW.center + hW.radius);
        ctx.closePath();
        if (useConstraintBoundaryStyle) strokeConstraintBoundary(ctx);
        else strokePointWindowColored(ctx, pointColor);
      } else if (hasSc) {
        // Only saturation constraint
        ctx.beginPath();
        ctx.arc(cx, cy, mapRadius(scW.min), 0, 2 * Math.PI);
        if (useConstraintBoundaryStyle) strokeConstraintBoundary(ctx);
        else strokePointWindowColored(ctx, pointColor);
        ctx.beginPath();
        ctx.arc(cx, cy, mapRadius(scW.max), 0, 2 * Math.PI);
        if (useConstraintBoundaryStyle) strokeConstraintBoundary(ctx);
        else strokePointWindowColored(ctx, pointColor);
      }
    }
  }

  function drawSoftDiscontiguousPolar(ctx, cx, cy, radius, hueWindows, scWindows, hueMode, scMode, mapRadius, hueWidth, scWidth) {
    const widthFromHueRadius = (r) => clamp01(1 - (2 * r) / TAU);
    const widthFromLinearRadius = (r) => clamp01(1 - 2 * r);
    const fallbackStrength = Math.max(clamp01(hueWidth), clamp01(scWidth));
    const nAngular = 48; // Angular resolution
    const nRadial = 24;  // Radial resolution

    // For discontiguous mode, each point has its own center
    // Compute distance to each point's CENTER (not window boundary) for circular falloff
    const numPoints = Math.max(hueWindows.length, scWindows.length);
    if (numPoints === 0) return;

    const pointCenters = [];
    let maxStrength = fallbackStrength;
    for (let i = 0; i < numPoints; i++) {
      const hW = hueWindows.length ? hueWindows[i % hueWindows.length] : null;
      const scW = scWindows.length ? scWindows[i % scWindows.length] : null;

      // Calculate sigma for each dimension based on window radius
      const sigmaHue = (hueMode === "soft" && hW) ? hW.radius / 1.96 : Infinity;
      const sigmaSc = (scMode === "soft" && scW) ? scW.radius / 1.96 : Infinity;

      const strength = Math.max(
        hueMode === "soft" && hW ? widthFromHueRadius(hW.radius) : 0,
        scMode === "soft" && scW ? widthFromLinearRadius(scW.radius) : 0
      );
      maxStrength = Math.max(maxStrength, strength);
      pointCenters.push({
        hueCenter: hW ? hW.center : 0,
        scCenter: scW ? scW.center : 0.5,
        sigmaHue,
        sigmaSc
      });
    }
    const maxOpacity = clamp01(maxStrength);
    if (maxOpacity <= 1e-4) return;

    // For each cell in the polar grid, compute minimum z² to any point center
    for (let ai = 0; ai < nAngular; ai++) {
      for (let ri = 0; ri < nRadial; ri++) {
        const angle = (ai + 0.5) / nAngular * TAU;
        const rNorm = (ri + 0.5) / nRadial;

        // Find minimum z² across all point centers
        let minZSq = Infinity;
        for (const pt of pointCenters) {
          // Compute angular distance to center (gives circular falloff for hue)
          let dHue = 0;
          if (pt.sigmaHue < Infinity) {
            dHue = angularDistance(angle, pt.hueCenter);
          }

          // Compute radial distance to center (gives circular falloff for saturation)
          let dSc = 0;
          if (pt.sigmaSc < Infinity) {
            dSc = rNorm - pt.scCenter;
          }

          // Compute z-scores and combined z²
          const zHue = pt.sigmaHue < Infinity ? dHue / pt.sigmaHue : 0;
          const zSc = pt.sigmaSc < Infinity ? dSc / pt.sigmaSc : 0;
          const zSq = zHue * zHue + zSc * zSc;
          if (zSq < minZSq) minZSq = zSq;
        }

        if (minZSq < 1e-6) continue; // Very close to at least one center

        const falloff = 1 - Math.exp(-0.5 * minZSq);
        const opacity = maxOpacity * falloff;

        if (opacity > 0.01) {
          const angle0 = ai / nAngular * TAU;
          const angle1 = (ai + 1) / nAngular * TAU;
          const r0 = mapRadius(ri / nRadial);
          const r1 = mapRadius((ri + 1) / nRadial);

          ctx.beginPath();
          ctx.arc(cx, cy, r1, angle0, angle1);
          if (r0 > 1) {
            ctx.arc(cx, cy, r0, angle1, angle0, true);
          } else {
            ctx.lineTo(cx, cy);
          }
          ctx.closePath();
          ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
          ctx.fill();
        }
      }
    }
  }

  // Helper function for rectangular constraints (Lab/OKLab spaces)
  function drawRectConstraints(ctx, cx, cy, radius, constraintSets, rectKeys, baseRange, ranges, topology, inputColors = []) {
    const xKey = rectKeys.x;
    const yKey = rectKeys.y;
    const xC = constraintSets.channels[xKey];
    const yC = constraintSets.channels[yKey];
    const xMode = xC?.mode || "hard";
    const yMode = yC?.mode || "hard";
    const isCustom = topology === "custom";
    const isDiscontiguous = topology === "discontiguous" || isCustom;

    const xIntervals = xC?.intervals || [[0, 1]];
    const yIntervals = yC?.intervals || [[0, 1]];
    const xWindows = xC?.pointWindows || [];
    const yWindows = yC?.pointWindows || [];

    // For discontiguous mode, check if there are point windows; for contiguous, check merged intervals
    const xActiveContiguous = xIntervals.length && !(xIntervals.length === 1 && xIntervals[0][0] <= 1e-6 && xIntervals[0][1] >= 1 - 1e-6);
    const yActiveContiguous = yIntervals.length && !(yIntervals.length === 1 && yIntervals[0][0] <= 1e-6 && yIntervals[0][1] >= 1 - 1e-6);
    const xActiveDiscontiguous = xWindows.some((w) => w);
    const yActiveDiscontiguous = yWindows.some((w) => w);
    const xActive = isDiscontiguous ? xActiveDiscontiguous : xActiveContiguous;
    const yActive = isDiscontiguous ? yActiveDiscontiguous : yActiveContiguous;

    if (!xActive && !yActive) return;

    const maxX = Math.max(Math.abs(ranges.min[xKey] || 0), Math.abs(ranges.max[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(ranges.min[yKey] || 0), Math.abs(ranges.max[yKey] || 0)) || 1;
    const toVal = (u, min, max) => min + u * (max - min);
    const xToCoord = (u) => {
      const val = toVal(u, baseRange.min[xKey], baseRange.max[xKey]);
      return cx + clamp(val / maxX, -1, 1) * radius;
    };
    const yToCoord = (u) => {
      const val = toVal(u, baseRange.min[yKey], baseRange.max[yKey]);
      return cy - clamp(val / maxY, -1, 1) * radius;
    };

    if (isDiscontiguous) {
      if (xMode === "soft" || yMode === "soft") {
        drawSoftDiscontiguousRect(ctx, xWindows, yWindows, xToCoord, yToCoord, cx, cy, radius, xC?.width ?? 0, yC?.width ?? 0);
      } else {
        drawHardDiscontiguousRect(ctx, cx, cy, radius, xWindows, yWindows, xActive, yActive, xToCoord, yToCoord, inputColors, isCustom);
      }
    } else {
      if (xMode === "soft" || yMode === "soft") {
        drawSoftContiguousRect(ctx, xIntervals, yIntervals, xMode, yMode, xActive, yActive, xToCoord, yToCoord, xC?.width ?? 0, yC?.width ?? 0);
      } else {
        drawHardContiguousRect(ctx, cx, cy, radius, xIntervals, yIntervals, xActive, yActive, xToCoord, yToCoord);
      }
    }

    // For custom mode, only draw per-point windows (no bounding union overlay).
  }

  function drawHardContiguousRect(ctx, cx, cy, radius, xIntervals, yIntervals, xActive, yActive, xToCoord, yToCoord) {
    const shadeX = xActive ? xIntervals : [[0, 1]];
    const shadeY = yActive ? yIntervals : [[0, 1]];

    // Shade excluded regions
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.beginPath();
    ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
    shadeX.forEach(([x0, x1]) => {
      shadeY.forEach(([y0, y1]) => {
        const xA = xToCoord(x0);
        const xB = xToCoord(x1);
        const yA = yToCoord(y0);
        const yB = yToCoord(y1);
        ctx.rect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
      });
    });
    ctx.fill("evenodd");
    ctx.restore();

    // Draw boundary rectangles
    xIntervals.forEach(([x0, x1]) => {
      yIntervals.forEach(([y0, y1]) => {
        const xA = xToCoord(x0);
        const xB = xToCoord(x1);
        const yA = yToCoord(y0);
        const yB = yToCoord(y1);
        ctx.beginPath();
        ctx.rect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
        strokeConstraintBoundary(ctx);
      });
    });
  }

  function drawSoftContiguousRect(ctx, xIntervals, yIntervals, xMode, yMode, xActive, yActive, xToCoord, yToCoord, xWidth, yWidth) {
    const xStrength = clamp01(xWidth);
    const yStrength = clamp01(yWidth);
    const strength = Math.max(xMode === "soft" ? xStrength : 0, yMode === "soft" ? yStrength : 0);
    const maxOpacity = clamp01(strength);
    const nSteps = 32; // Grid resolution for 2D sampling
    if (maxOpacity <= 1e-4) return;

    // Get the allowed region bounds
    const x0 = xActive && xIntervals.length ? xIntervals[0][0] : 0;
    const x1 = xActive && xIntervals.length ? xIntervals[0][1] : 1;
    const y0 = yActive && yIntervals.length ? yIntervals[0][0] : 0;
    const y1 = yActive && yIntervals.length ? yIntervals[0][1] : 1;

    const xIsHard = xActive && xMode === "hard";
    const yIsHard = yActive && yMode === "hard";
    const xIsSoft = xActive && xMode === "soft";
    const yIsSoft = yActive && yMode === "soft";

    // Calculate sigma for soft axes
    const sigmaX = xIsSoft ? Math.max((x1 - x0) / (2 * 1.96), 1e-3) : Infinity;
    const sigmaY = yIsSoft ? Math.max((y1 - y0) / (2 * 1.96), 1e-3) : Infinity;

    // For mixed hard/soft: first draw hard overlay for hard dimension(s)
    if (xIsHard && !yIsHard) {
      // X is hard, Y is soft: draw hard overlay outside X bounds
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.60)";
      // Left region (x < x0)
      const xA = xToCoord(0);
      const xB = xToCoord(x0);
      const yTop = yToCoord(0);
      const yBot = yToCoord(1);
      ctx.fillRect(Math.min(xA, xB), Math.min(yTop, yBot), Math.abs(xB - xA), Math.abs(yBot - yTop));
      // Right region (x > x1)
      const xC = xToCoord(x1);
      const xD = xToCoord(1);
      ctx.fillRect(Math.min(xC, xD), Math.min(yTop, yBot), Math.abs(xD - xC), Math.abs(yBot - yTop));
      ctx.restore();
    }

    if (yIsHard && !xIsHard) {
      // Y is hard, X is soft: draw hard overlay outside Y bounds
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.60)";
      const xLeft = xToCoord(0);
      const xRight = xToCoord(1);
      // Top region (y < y0 in normalized, but y axis is inverted in screen coords)
      const yA = yToCoord(0);
      const yB = yToCoord(y0);
      ctx.fillRect(Math.min(xLeft, xRight), Math.min(yA, yB), Math.abs(xRight - xLeft), Math.abs(yB - yA));
      // Bottom region (y > y1)
      const yC = yToCoord(y1);
      const yD = yToCoord(1);
      ctx.fillRect(Math.min(xLeft, xRight), Math.min(yC, yD), Math.abs(xRight - xLeft), Math.abs(yD - yC));
      ctx.restore();
    }

    // Draw soft gradient for soft dimension(s)
    // Only draw gradient for the soft parts, respecting hard bounds
    if (sigmaX < Infinity || sigmaY < Infinity) {
      for (let yi = 0; yi < nSteps; yi++) {
        for (let xi = 0; xi < nSteps; xi++) {
          const uX = (xi + 0.5) / nSteps;
          const uY = (yi + 0.5) / nSteps;

          // For hard dimensions, skip cells outside the hard bounds (already covered by overlay)
          if (xIsHard && (uX < x0 || uX > x1)) continue;
          if (yIsHard && (uY < y0 || uY > y1)) continue;

          // Compute signed distance to the allowed region for soft axes
          let dX = 0, dY = 0;
          if (xIsSoft) {
            if (uX < x0) dX = x0 - uX;
            else if (uX > x1) dX = uX - x1;
          }
          if (yIsSoft) {
            if (uY < y0) dY = y0 - uY;
            else if (uY > y1) dY = uY - y1;
          }

          // Compute z-scores for soft axes
          const zX = sigmaX < Infinity ? dX / sigmaX : 0;
          const zY = sigmaY < Infinity ? dY / sigmaY : 0;

          // Combined falloff
          const zSq = zX * zX + zY * zY;
          if (zSq < 1e-6) continue;

          const falloff = 1 - Math.exp(-0.5 * zSq);
          const opacity = maxOpacity * falloff;

          if (opacity > 0.01) {
            const cellX0 = xToCoord(xi / nSteps);
            const cellX1 = xToCoord((xi + 1) / nSteps);
            const cellY0 = yToCoord(yi / nSteps);
            const cellY1 = yToCoord((yi + 1) / nSteps);
            ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
            ctx.fillRect(
              Math.min(cellX0, cellX1),
              Math.min(cellY0, cellY1),
              Math.abs(cellX1 - cellX0),
              Math.abs(cellY1 - cellY0)
            );
          }
        }
      }
    }

    // Draw hard boundaries for hard dimensions
    if (xIsHard) {
      const yTop = yToCoord(0);
      const yBot = yToCoord(1);
      // Left boundary
      ctx.beginPath();
      ctx.moveTo(xToCoord(x0), yTop);
      ctx.lineTo(xToCoord(x0), yBot);
      strokeConstraintBoundary(ctx);
      // Right boundary
      ctx.beginPath();
      ctx.moveTo(xToCoord(x1), yTop);
      ctx.lineTo(xToCoord(x1), yBot);
      strokeConstraintBoundary(ctx);
    }

    if (yIsHard) {
      const xLeft = xToCoord(0);
      const xRight = xToCoord(1);
      // Top boundary
      ctx.beginPath();
      ctx.moveTo(xLeft, yToCoord(y0));
      ctx.lineTo(xRight, yToCoord(y0));
      strokeConstraintBoundary(ctx);
      // Bottom boundary
      ctx.beginPath();
      ctx.moveTo(xLeft, yToCoord(y1));
      ctx.lineTo(xRight, yToCoord(y1));
      strokeConstraintBoundary(ctx);
    }
  }

  function drawHardDiscontiguousRect(ctx, cx, cy, radius, xWindows, yWindows, xActive, yActive, xToCoord, yToCoord, inputColors = [], useConstraintBoundaryStyle = false) {
    // For discontiguous mode, draw PER-POINT regions (not Cartesian product)
    // Each input point has its own (x, y) window
    const numPoints = Math.max(xWindows.length, yWindows.length);

    // Use offscreen canvas to properly handle overlapping regions
    // (evenodd would incorrectly toggle overlapping areas)
    const offscreen = document.createElement("canvas");
    offscreen.width = ctx.canvas.width;
    offscreen.height = ctx.canvas.height;
    const offCtx = offscreen.getContext("2d");

    // Apply same transform as main canvas (for device pixel ratio)
    offCtx.setTransform(ctx.getTransform());

    // Fill entire square with white overlay on offscreen canvas
    offCtx.fillStyle = "rgba(255,255,255,0.60)";
    offCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Clear out allowed regions using destination-out
    offCtx.globalCompositeOperation = "destination-out";
    offCtx.fillStyle = "rgba(255,255,255,1)";

    for (let i = 0; i < numPoints; i++) {
      const xW = xWindows.length ? xWindows[i % xWindows.length] : null;
      const yW = yWindows.length ? yWindows[i % yWindows.length] : null;

      const x0 = xW && xActive ? xW.min : 0;
      const x1 = xW && xActive ? xW.max : 1;
      const y0 = yW && yActive ? yW.min : 0;
      const y1 = yW && yActive ? yW.max : 1;

      const xA = xToCoord(x0);
      const xB = xToCoord(x1);
      const yA = yToCoord(y0);
      const yB = yToCoord(y1);
      offCtx.fillRect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
    }

    // Composite the mask onto the main canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for drawImage
    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();

    // Draw per-point window boundaries with colored lines
    for (let i = 0; i < numPoints; i++) {
      const xW = xWindows.length ? xWindows[i % xWindows.length] : null;
      const yW = yWindows.length ? yWindows[i % yWindows.length] : null;
      const pointColor = inputColors[i % inputColors.length] || null;

      if ((xW && xActive) || (yW && yActive)) {
        const x0 = xW && xActive ? xW.min : 0;
        const x1 = xW && xActive ? xW.max : 1;
        const y0 = yW && yActive ? yW.min : 0;
        const y1 = yW && yActive ? yW.max : 1;

        const xA = xToCoord(x0);
        const xB = xToCoord(x1);
        const yA = yToCoord(y0);
        const yB = yToCoord(y1);
        ctx.beginPath();
        ctx.rect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
        if (useConstraintBoundaryStyle) strokeConstraintBoundary(ctx);
        else strokePointWindowColored(ctx, pointColor);
      }
    }
  }

  function drawSoftDiscontiguousRect(ctx, xWindows, yWindows, xToCoord, yToCoord, cx, cy, radius, xWidth, yWidth) {
    const widthFromRadius = (r) => clamp01(1 - 2 * r);
    const fallbackStrength = Math.max(clamp01(xWidth), clamp01(yWidth));
    const nSteps = 32; // Grid resolution

    // For discontiguous mode, each point has its own center
    // Compute distance to each point's CENTER (not rectangle boundary) for circular falloff

    // Build list of point centers (one per input point)
    const pointCenters = [];
    let maxStrength = fallbackStrength;
    const numPoints = Math.max(xWindows.length, yWindows.length);
    for (let i = 0; i < numPoints; i++) {
      const xW = xWindows.length ? xWindows[i % xWindows.length] : null;
      const yW = yWindows.length ? yWindows[i % yWindows.length] : null;
      // Sigma derived from window radius (radius covers ~2 sigma for 95% CI)
      const sigmaX = xW ? xW.radius / 1.96 : Infinity;
      const sigmaY = yW ? yW.radius / 1.96 : Infinity;
      const strength = Math.max(
        xW ? widthFromRadius(xW.radius) : 0,
        yW ? widthFromRadius(yW.radius) : 0
      );
      maxStrength = Math.max(maxStrength, strength);
      pointCenters.push({
        centerX: xW ? xW.center : 0.5,
        centerY: yW ? yW.center : 0.5,
        sigmaX,
        sigmaY
      });
    }
    const maxOpacity = clamp01(maxStrength);
    if (maxOpacity <= 1e-4) return;

    // For each grid cell, compute the minimum z² to any point center
    for (let yi = 0; yi < nSteps; yi++) {
      for (let xi = 0; xi < nSteps; xi++) {
        const uX = (xi + 0.5) / nSteps;
        const uY = (yi + 0.5) / nSteps;

        // Find minimum z² across all point centers
        let minZSq = Infinity;
        for (const pt of pointCenters) {
          // Compute distance to center (gives circular falloff)
          const dX = uX - pt.centerX;
          const dY = uY - pt.centerY;

          // Compute z-scores
          const zX = pt.sigmaX < Infinity ? dX / pt.sigmaX : 0;
          const zY = pt.sigmaY < Infinity ? dY / pt.sigmaY : 0;
          const zSq = zX * zX + zY * zY;
          if (zSq < minZSq) minZSq = zSq;
        }

        if (minZSq < 1e-6) continue; // Very close to at least one center

        const falloff = 1 - Math.exp(-0.5 * minZSq);
        const opacity = maxOpacity * falloff;

        if (opacity > 0.01) {
          const cellX0 = xToCoord(xi / nSteps);
          const cellX1 = xToCoord((xi + 1) / nSteps);
          const cellY0 = yToCoord(yi / nSteps);
          const cellY1 = yToCoord((yi + 1) / nSteps);
          ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
          ctx.fillRect(
            Math.min(cellX0, cellX1),
            Math.min(cellY0, cellY1),
            Math.abs(cellX1 - cellX0),
            Math.abs(cellY1 - cellY0)
          );
        }
      }
    }
  }

  // Stroke helper for hard constraint boundaries
  function strokeConstraintBoundary(ctx) {
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Stroke helper for per-point windows in discontiguous mode (fallback)
  function strokePointWindow(ctx) {
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "rgba(80,80,160,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Colored stroke helper for per-point windows - uses the point's color
  // Dark colors: use color for dashed line (replaces black)
  // Light colors: use color for solid underlay (replaces white)
  function strokePointWindowColored(ctx, hex) {
    if (!hex) {
      // Fallback to default styling
      strokePointWindow(ctx);
      return;
    }
    // Determine if color is light or dark using contrastColor logic
    const contrast = contrastColor(hex);
    const isLight = contrast === "#111827"; // contrastColor returns dark text for light colors

    ctx.lineWidth = 1.5;
    if (isLight) {
      // Light color: use color as solid underlay, black dashed overlay
      ctx.setLineDash([]);
      ctx.strokeStyle = hex;
      ctx.stroke();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.stroke();
    } else {
      // Dark color: use white solid underlay, color as dashed overlay
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = hex;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  const preview = state.customConstraintPreview;
  if (preview && preview.panelType === type && preview.space && ui.colorSpace.value === wheelSpace) {
    const previewSpace = preview.space;
    const baseRange = state.bounds?.ranges || csRanges[wheelSpace];
    const previewVals =
      previewSpace === wheelSpace
        ? preview.values
        : convertColorValues(preview.values, previewSpace, wheelSpace);
    const widths = preview.widths || {};
    const clamp01 = (v) => clamp(v, 0, 1);
    const linearWindowFromCenter = (center, radius) => {
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
    };

    ctx.save();
    ctx.globalAlpha = 0.75;
    if (isRectWheel && rectKeys) {
      const xKey = rectKeys.x;
      const yKey = rectKeys.y;
      const maxX = Math.max(Math.abs(ranges.min[xKey] || 0), Math.abs(ranges.max[xKey] || 0)) || 1;
      const maxY = Math.max(Math.abs(ranges.min[yKey] || 0), Math.abs(ranges.max[yKey] || 0)) || 1;
      const toVal = (u, min, max) => min + u * (max - min);
      const xToCoord = (u) => {
        const val = toVal(u, baseRange.min[xKey], baseRange.max[xKey]);
        return cx + clamp(val / maxX, -1, 1) * radius;
      };
      const yToCoord = (u) => {
        const val = toVal(u, baseRange.min[yKey], baseRange.max[yKey]);
        return cy - clamp(val / maxY, -1, 1) * radius;
      };
      const norm = normalizeWithRange(previewVals, baseRange, wheelSpace);
      const xWidth = clamp01(widths[xKey] ?? 0);
      const yWidth = clamp01(widths[yKey] ?? 0);
      const xRadius = Math.max((1 - xWidth) * 0.5, 0);
      const yRadius = Math.max((1 - yWidth) * 0.5, 0);
      const xWindow = linearWindowFromCenter(clamp01(norm[xKey] ?? 0.5), xRadius);
      const yWindow = linearWindowFromCenter(clamp01(norm[yKey] ?? 0.5), yRadius);
      const xA = xToCoord(xWindow.min);
      const xB = xToCoord(xWindow.max);
      const yA = yToCoord(yWindow.min);
      const yB = yToCoord(yWindow.max);
      ctx.beginPath();
      ctx.rect(Math.min(xA, xB), Math.min(yA, yB), Math.abs(xB - xA), Math.abs(yB - yA));
      strokeConstraintBoundary(ctx);
    } else {
      const scKey = channels.find((c) => c === "s" || c === "c");
      if (scKey && previewVals) {
        const maxSC = scKey === "s" ? ranges.max.s : ranges.max.c;
        const toVal = (u, min, max) => min + u * (max - min);
        const mapRadius = (u) => {
          const minVal = toVal(u, baseRange.min[scKey], baseRange.max[scKey]);
          return clamp(minVal / Math.max(maxSC, 1e-6), 0, 1) * radius;
        };
        const norm = normalizeWithRange(previewVals, baseRange, wheelSpace);
        const hWidth = clamp01(widths.h ?? 0);
        const scWidth = clamp01(widths[scKey] ?? 0);
        const hRadius = Math.max((1 - hWidth) * 0.5, 0) * TAU;
        const scRadius = Math.max((1 - scWidth) * 0.5, 0);
        const hCenter = clamp01(norm.h ?? 0) * TAU;
        const scCenter = clamp01(norm[scKey] ?? 0);
        const scWindow = linearWindowFromCenter(scCenter, scRadius);
        const r0 = mapRadius(scWindow.min);
        const r1 = mapRadius(scWindow.max);
        const a0 = hCenter - hRadius;
        const a1 = hCenter + hRadius;
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1);
        if (r0 > 1e-3) {
          ctx.lineTo(cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1));
          ctx.arc(cx, cy, r0, a1, a0, true);
        } else {
          ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        strokeConstraintBoundary(ctx);
      }
    }
    ctx.restore();
  }

  // Draw white grid overlay on out-of-gamut areas using the hull boundary path
  if (clipToGamut) {
    const boundaryVals = buildGamutProjectionBoundary(
      wheelSpace,
      gamutPreset,
      scaleRange,
      isRectWheel,
      rectKeys
    );
    const boundaryPts = (boundaryVals || [])
      .map((vals) => toPoint(vals, scaleRange))
      .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
    const clipBoundary = smoothBoundary(boundaryPts, 1);
    if (clipBoundary && clipBoundary.length) {
      drawOutOfGamutOverlay(ctx, cx, cy, radius, isRectWheel, clipBoundary);
      strokeBoundary(ctx, clipBoundary);
    }
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

  constraintPoints.forEach((pt) => {
    const fill = applyCvdHex(pt.displayColor || pt.color, type, 1, cvdModel);
    const sizePt = 8;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-sizePt / 2, -sizePt / 2, sizePt, sizePt);
    ctx.fillStyle = fill;
    ctx.strokeStyle = contrastColor(fill);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });

  ctx.fillStyle = "#0f172a";
  ctx.font = "12px 'Space Grotesk', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${presetLabel}${clipToGamut ? " (clipped)" : " (raw)"}`, 8, 6);
}

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

// Returns color values object (for gamut checking) instead of encoded hex
export function makeWheelColorVals(hueDeg, chromaNorm, wheelSpace) {
  const fixedL = wheelSpace === "hsl" ? 0.5 : 0.75;
  if (wheelSpace === "hsl") {
    return { h: hueDeg, s: chromaNorm * csRanges.hsl.max.s, l: fixedL * csRanges.hsl.max.l };
  }
  if (wheelSpace === "lch") {
    return { l: fixedL * csRanges.lch.max.l, c: chromaNorm * csRanges.lch.max.c, h: hueDeg };
  }
  if (wheelSpace === "oklch") {
    return { l: fixedL, c: chromaNorm * csRanges.oklch.max.c, h: hueDeg };
  }
  if (wheelSpace === "lab") {
    const maxA = Math.max(Math.abs(csRanges.lab.min.a), Math.abs(csRanges.lab.max.a));
    const maxB = Math.max(Math.abs(csRanges.lab.min.b), Math.abs(csRanges.lab.max.b));
    const maxC = Math.min(maxA, maxB);
    const c = chromaNorm * maxC;
    const a = c * Math.cos((hueDeg * Math.PI) / 180);
    const b = c * Math.sin((hueDeg * Math.PI) / 180);
    return { l: fixedL * csRanges.lab.max.l, a, b };
  }
  if (wheelSpace === "oklab") {
    const maxA = Math.max(Math.abs(csRanges.oklab.min.a), Math.abs(csRanges.oklab.max.a));
    const maxB = Math.max(Math.abs(csRanges.oklab.min.b), Math.abs(csRanges.oklab.max.b));
    const maxC = Math.min(maxA, maxB);
    const c = chromaNorm * maxC;
    const a = c * Math.cos((hueDeg * Math.PI) / 180);
    const b = c * Math.sin((hueDeg * Math.PI) / 180);
    return { l: fixedL, a, b };
  }
  return { h: hueDeg, s: chromaNorm * 100, l: fixedL * 100 };
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
  const baseRange = csRanges[space];
  const range = rangeOverride || baseRange;
  // Helper to get valid range value, falling back to base range if NaN/undefined
  const getMin = (k) => {
    const val = range?.min?.[k];
    return Number.isFinite(val) ? val : (baseRange?.min?.[k] ?? 0);
  };
  const getMax = (k) => {
    const val = range?.max?.[k];
    return Number.isFinite(val) ? val : (baseRange?.max?.[k] ?? 1);
  };
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
      const lMin = getMin(lightKey);
      const lMax = getMax(lightKey);
      const lVal = lMin + t * (lMax - lMin);
      hex = encodeColor({ ...zeroChannels(space, range), [lightKey]: lVal }, space);
    } else if (key === "s" || key === "c") {
      const scMin = getMin(key);
      const scMax = getMax(key);
      const scVal = scMin + t * (scMax - scMin);
      hex = encodeColor({ ...zeroChannels(space, range), [key]: scVal, [lightKey]: midL(space, range) }, space);
    } else if (key !== "h") {
      const kMin = getMin(key);
      const kMax = getMax(key);
      const val = kMin + t * (kMax - kMin);
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
  const ch = channelOrder[space] || [];
  const lightKey = lightnessKey(space);
  const obj = {};
  const range = rangeOverride || csRanges[space];
  ch.forEach((key) => {
    if (key === "h") obj[key] = 0;
    else if (key === lightKey) {
      const mid = midL(space, range);
      obj[key] = Number.isFinite(mid) ? mid : 0.5;
    }
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
  const baseRange = csRanges[space];
  const r = rangeOverride || baseRange;
  const minVal = Number.isFinite(r?.min?.[lk]) ? r.min[lk] : (baseRange?.min?.[lk] ?? 0);
  const maxVal = Number.isFinite(r?.max?.[lk]) ? r.max[lk] : (baseRange?.max?.[lk] ?? 1);
  return (minVal + maxVal) / 2;
}

// Create a white fill with subtle grid pattern for out-of-gamut overlay
function createOutOfGamutPattern(ctx, spacing = 8) {
  const size = spacing;
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = size;
  patternCanvas.height = size;
  const pCtx = patternCanvas.getContext("2d");

  // Fill with white
  pCtx.fillStyle = "white";
  pCtx.fillRect(0, 0, size, size);

  // Draw subtle grid lines at the edges
  pCtx.strokeStyle = "rgba(180, 185, 195, 0.4)";
  pCtx.lineWidth = 0.5;
  pCtx.beginPath();
  pCtx.moveTo(size - 0.25, 0);
  pCtx.lineTo(size - 0.25, size);
  pCtx.moveTo(0, size - 0.25);
  pCtx.lineTo(size, size - 0.25);
  pCtx.stroke();

  return ctx.createPattern(patternCanvas, "repeat");
}

// Draw white grid pattern overlay on out-of-gamut areas
// Uses the outer boundary polygon to exactly match the hull stroke lines
function drawOutOfGamutOverlay(ctx, cx, cy, radius, isRectWheel, outerBoundary) {
  if (!outerBoundary || outerBoundary.length < 3) return;

  const outOfGamutPattern = createOutOfGamutPattern(ctx);

  ctx.save();
  ctx.beginPath();

  if (isRectWheel) {
    // For rectangular wheel, cover the square area
    const size = radius * 2;
    const left = cx - radius;
    const top = cy - radius;
    // Outer rectangle (clockwise)
    ctx.moveTo(left, top);
    ctx.lineTo(left + size, top);
    ctx.lineTo(left + size, top + size);
    ctx.lineTo(left, top + size);
    ctx.closePath();
  } else {
    // For polar wheel, cover the circular area
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
  }

  // Inner boundary polygon (counter-clockwise to cut a hole with evenodd)
  // Start from the last point and go backwards
  ctx.moveTo(outerBoundary[outerBoundary.length - 1].x, outerBoundary[outerBoundary.length - 1].y);
  for (let i = outerBoundary.length - 2; i >= 0; i--) {
    ctx.lineTo(outerBoundary[i].x, outerBoundary[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = outOfGamutPattern;
  ctx.fill("evenodd");
  ctx.restore();
}
