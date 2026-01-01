import { channelOrder, decodeColor, csRanges } from "../core/colorSpaces.js";

const TAU = Math.PI * 2;

export function computeBounds(valuesRaw, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const widths = config.widths || [];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1];
  const widthForChannel = (ch, idx) => {
    if (!widths.length) return 0;
    if (ch === channels[0]) return widths[0] ?? widths[idx] ?? widths[widths.length - 1] ?? 0;
    if (ch === scChannel) return widths[1] ?? widths[idx] ?? widths[widths.length - 1] ?? 0;
    if (ch === channels[2]) return widths[2] ?? widths[idx] ?? widths[widths.length - 1] ?? 0;
    return widths[idx] ?? widths[widths.length - 1] ?? 0;
  };

  const topology = config.constraintTopology || "contiguous";
  const aestheticMode = config.aestheticMode || "none";
  const constraintMode = config.constraintMode || {};
  const perInputWidths = config.perInputWidths || null;
  const ranges = csRanges[colorSpace];
  const aestheticValues = applyAestheticCenters(valuesRaw || [], colorSpace, aestheticMode);
  const aestheticNorm = aestheticValues.map((row) => normalizeForConstraint(row, ranges, colorSpace));
  const values = (arr, channel) => arr.map((r) => r[channel]).filter((v) => Number.isFinite(v));

  const boundsByName = {};
  let boundsSc = [0, 1];
  let boundsL = [0, 1];
  let boundsH = null;

  if (config.constrain) {
    channels.forEach((ch, idx) => {
      const width = widthForChannel(ch, idx);
      const vals = values(aestheticNorm, ch);
      const hasVals = vals.length > 0;
      const minVal = hasVals ? Math.min(...vals) : null;
      const maxVal = hasVals ? Math.max(...vals) : null;
      let b;
      if (!hasVals) {
        b = safeInitBounds(colorSpace, ch);
      } else if (width <= 0) {
        b = [0, 1];
      } else if (ch === "h") {
        b = computeHueBounds(vals, width);
      } else {
        const low = (1 - width) * 0 + width * minVal;
        const high = (1 - width) * 1 + width * maxVal;
        b = [Math.max(0, low), Math.min(1, high)];
      }
      boundsByName[ch] = b;
      if (ch === "h") boundsH = b;
      else if (ch === "l") boundsL = b;
      else boundsSc = b;
    });
  }

  const constraintSets = buildConstraintSets(
    topology,
    aestheticMode,
    constraintMode,
    channels,
    scChannel,
    widthForChannel,
    boundsByName,
    boundsH,
    aestheticNorm,
    perInputWidths
  );

  return { boundsSc, boundsL, boundsH, boundsByName, constraintSets };
}

export function computeBoundsFromCurrent(colors, colorSpace, configLike = {}) {
  const ranges = csRanges[colorSpace];
  if (!ranges) return null;
  let decoded;
  if (!colors.length) {
    const mid = {};
    (channelOrder[colorSpace] || []).forEach((ch) => {
      if (ch === "h") {
        mid[ch] = 0;
        return;
      }
      if (ch === "c") {
        // chroma behaves like an unbounded-above channel in common formulations
        mid[ch] = 0;
        return;
      }
      const min = ranges.min?.[ch];
      const max = ranges.max?.[ch];
      if (Number.isFinite(min) && Number.isFinite(max)) {
        mid[ch] = (min + max) / 2;
      } else {
        mid[ch] = 0;
      }
    });
    decoded = [mid];
  } else {
    decoded = colors.map((hex) => decodeColor(hex, colorSpace));
  }
  const bounds = computeBounds(decoded, colorSpace, configLike);
  return { ...bounds, ranges };
}

export function computeBoundsFromRawValues(values, colorSpace, configLike = {}) {
  const ranges = csRanges[colorSpace];
  if (!ranges) return null;
  const bounds = computeBounds(values || [], colorSpace, configLike);
  return { ...bounds, ranges };
}

function computeHueBounds(vals, width) {
  if (!vals.length) return [0, 1];
  const sorted = [...vals].sort((a, b) => a - b);
  const extended = sorted.concat([sorted[0] + 1]);
  let maxGap = -1;
  let gapStart = sorted[0];
  for (let i = 0; i < sorted.length; i++) {
    const gap = extended[i + 1] - extended[i];
    if (gap > maxGap) {
      maxGap = gap;
      gapStart = extended[i];
    }
  }
  const arcSpan = 1 - maxGap;
  const arcStart = (gapStart + maxGap) % 1;
  const center = (arcStart + arcSpan / 2) % 1;
  const span = 1 - width * (1 - arcSpan);
  let start = center - span / 2;
  let end = center + span / 2;
  while (start < 0) {
    start += 1;
    end += 1;
  }
  return [start, end];
}

function normalizeForConstraint(vals, range, space) {
  const min = range.min;
  const max = range.max;
  const out = {};
  (channelOrder[space] || []).forEach((ch) => {
    const denom = max[ch] - min[ch] || 1;
    if (ch === "h") {
      const raw = Number.isFinite(vals[ch]) ? vals[ch] : 0;
      const norm = (raw - min[ch]) / denom;
      out[ch] = wrap01(norm);
      return;
    }
    const raw = Number.isFinite(vals[ch]) ? vals[ch] : 0;
    out[ch] = clamp01((raw - min[ch]) / denom);
  });
  return out;
}

function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function buildConstraintSets(
  topology,
  aestheticMode,
  constraintMode,
  channels,
  scChannel,
  widthForChannel,
  boundsByName,
  boundsH,
  aestheticNorm,
  perInputWidths
) {
  const sets = { topology, aestheticMode, channels: {} };
  const isDiscontiguous = topology === "discontiguous" || topology === "custom";
  channels.forEach((ch, idx) => {
    const mode = constraintMode[ch] || "hard";
    const width = widthForChannel(ch, idx);
    const perWidths = Array.isArray(perInputWidths?.[ch]) ? perInputWidths[ch] : null;
    if (ch === "h") {
      if (isDiscontiguous) {
        const hueVals = valuesForChannel(aestheticNorm, "h");
        const arcs = buildHueUnionIntervals(hueVals, perWidths || width);
        const full = arcs.length === 1 && arcs[0][0] <= 1e-6 && arcs[0][1] >= TAU - 1e-6;
        // Store per-point windows for visualization (before merge)
        const pointWindows = buildHuePointWindows(hueVals, perWidths || width);
        sets.channels.h = { type: "hue", mode, width, intervalsRad: arcs, pointWindows, full };
      } else {
        const arc = hueArcFromBounds(boundsH);
        const arcs = arc ? [[arc.startRad, arc.startRad + arc.spanRad]] : [[0, TAU]];
        sets.channels.h = { type: "hue", mode, width, arc, intervalsRad: arcs, full: !arc || arc.full };
      }
      return;
    }
    if (isDiscontiguous) {
      const chVals = valuesForChannel(aestheticNorm, ch);
      const intervals = buildLinearUnionIntervals(chVals, perWidths || width);
      const full = intervals.length === 1 && intervals[0][0] <= 1e-6 && intervals[0][1] >= 1 - 1e-6;
      // Store per-point windows for visualization (before merge)
      const pointWindows = buildLinearPointWindows(chVals, perWidths || width);
      sets.channels[ch] = { type: "linear", mode, width, intervals, pointWindows, full };
    } else {
      const b = boundsByName?.[ch] || [0, 1];
      sets.channels[ch] = { type: "linear", mode, width, intervals: [b], full: isFull01(b) };
    }
  });
  return sets;
}

function valuesForChannel(values, ch) {
  return (values || [])
    .map((v) => v[ch])
    .filter((v) => Number.isFinite(v));
}

function widthForPoint(widths, idx, fallback) {
  if (!Array.isArray(widths) || !widths.length) return fallback;
  const v = widths[idx];
  return Number.isFinite(v) ? v : fallback;
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

function buildLinearUnionIntervals(points, widthOrWidths) {
  if (!points.length) return [[0, 1]];
  if (Array.isArray(widthOrWidths)) {
    const intervals = points
      .map((u, idx) => {
        const width = widthForPoint(widthOrWidths, idx, 0);
        if (width <= 0) return null;
        const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6);
        const center = clamp01(u);
        const window = linearWindowFromCenter(center, r);
        return [window.min, window.max];
      })
      .filter((v) => v && v[1] > v[0] + 1e-6);
    return mergeIntervals(intervals, 0, 1);
  }
  const width = widthOrWidths;
  if (width <= 0) return [[0, 1]];
  const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6);
  const intervals = points
    .map((u) => {
      const center = clamp01(u);
      const window = linearWindowFromCenter(center, r);
      return [window.min, window.max];
    })
    .filter(([a, b]) => b > a + 1e-6);
  return mergeIntervals(intervals, 0, 1);
}

function buildHueUnionIntervals(points, widthOrWidths) {
  if (!points.length) return [[0, TAU]];
  const intervals = [];
  if (Array.isArray(widthOrWidths)) {
    points.forEach((u, idx) => {
      const width = widthForPoint(widthOrWidths, idx, 0);
      if (width <= 0) return;
      const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6) * TAU;
      const phi = wrap01(u) * TAU;
      let a = phi - r;
      let b = phi + r;
      a = ((a % TAU) + TAU) % TAU;
      b = ((b % TAU) + TAU) % TAU;
      if (a <= b) {
        intervals.push([a, b]);
      } else {
        intervals.push([0, b], [a, TAU]);
      }
    });
    return mergeIntervals(intervals, 0, TAU);
  }
  const width = widthOrWidths;
  if (width <= 0) return [[0, TAU]];
  const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6) * TAU;
  points.forEach((u) => {
    const phi = wrap01(u) * TAU;
    let a = phi - r;
    let b = phi + r;
    a = ((a % TAU) + TAU) % TAU;
    b = ((b % TAU) + TAU) % TAU;
    if (a <= b) {
      intervals.push([a, b]);
    } else {
      intervals.push([0, b], [a, TAU]);
    }
  });
  return mergeIntervals(intervals, 0, TAU);
}

// Returns per-point windows (un-merged) for visualization of discontiguous constraints
function buildHuePointWindows(points, widthOrWidths) {
  if (!points.length) return [];
  if (Array.isArray(widthOrWidths)) {
    return points.map((u, idx) => {
      const width = widthForPoint(widthOrWidths, idx, 0);
      if (width <= 0) return null;
      const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6) * TAU;
      const phi = wrap01(u) * TAU;
      return { center: phi, radius: r };
    });
  }
  const width = widthOrWidths;
  if (width <= 0) return [];
  const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6) * TAU;
  return points.map((u) => {
    const phi = wrap01(u) * TAU;
    return { center: phi, radius: r };
  });
}

// Returns per-point windows (un-merged) for visualization of discontiguous constraints
function buildLinearPointWindows(points, widthOrWidths) {
  if (!points.length) return [];
  if (Array.isArray(widthOrWidths)) {
    return points.map((u, idx) => {
      const width = widthForPoint(widthOrWidths, idx, 0);
      if (width <= 0) return null;
      const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6);
      const center = clamp01(u);
      const window = linearWindowFromCenter(center, r);
      return { center, radius: r, min: window.min, max: window.max };
    });
  }
  const width = widthOrWidths;
  if (width <= 0) return [];
  const r = Math.max((1 - clamp01(width)) * 0.5, 1e-6);
  return points.map((u) => {
    const center = clamp01(u);
    const window = linearWindowFromCenter(center, r);
    return { center, radius: r, min: window.min, max: window.max };
  });
}

function mergeIntervals(intervals, min = 0, max = 1) {
  if (!intervals.length) return [[min, max]];
  const sorted = intervals
    .map(([a, b]) => [Math.max(min, a), Math.min(max, b)])
    .filter(([a, b]) => b > a + 1e-6)
    .sort((x, y) => x[0] - y[0]);
  if (!sorted.length) return [[min, max]];
  const merged = [];
  sorted.forEach(([a, b]) => {
    const last = merged[merged.length - 1];
    if (!last || a > last[1] + 1e-6) merged.push([a, b]);
    else last[1] = Math.max(last[1], b);
  });
  return merged;
}

function hueArcFromBounds(boundsH) {
  if (!Array.isArray(boundsH) || boundsH.length < 2) return null;
  const diff = boundsH[1] - boundsH[0];
  const rawSpan = (diff + 1) % 1;
  const span = rawSpan === 0 ? (diff >= 0.999 ? 1 : 1e-6) : rawSpan;
  return {
    startRad: boundsH[0] * TAU,
    spanRad: span * TAU,
    full: span >= 0.999,
  };
}

function applyAestheticCenters(values, space, mode) {
  if (!values?.length || !mode || mode === "none") return values || [];
  const channels = channelOrder[space] || [];
  const hasHue = channels.includes("h");
  const offsets = mode === "complementary"
    ? [Math.PI]
    : mode === "triadic"
    ? [2 * Math.PI / 3, -2 * Math.PI / 3]
    : mode === "tetradic"
    ? [Math.PI / 2, -Math.PI / 2]
    : [];
  if (!offsets.length) return values || [];
  if (hasHue) {
    return values.flatMap((row) => {
      const h = Number.isFinite(row.h) ? row.h : 0;
      return offsets.map((off) => ({ ...row, h: wrapHueDeg(h + (off * 180) / Math.PI) }));
    });
  }
  const opponent = opponentPairForSpace(space);
  if (!opponent) return values || [];
  const [aKey, bKey] = opponent;
  return values.flatMap((row) => {
    const a = Number.isFinite(row[aKey]) ? row[aKey] : 0;
    const b = Number.isFinite(row[bKey]) ? row[bKey] : 0;
    const r = Math.hypot(a, b);
    const ang = Math.atan2(b, a);
    return offsets.map((off) => ({
      ...row,
      [aKey]: r * Math.cos(ang + off),
      [bKey]: r * Math.sin(ang + off),
    }));
  });
}

function opponentPairForSpace(space) {
  if (space === "lab" || space === "oklab") return ["a", "b"];
  if (space === "luv") return ["u", "v"];
  if (space === "jzazbz") return ["az", "bz"];
  return null;
}

function wrapHueDeg(h) {
  return ((h % 360) + 360) % 360;
}

function isFull01(b) {
  return Array.isArray(b) && b.length === 2 && b[0] <= 1e-6 && b[1] >= 1 - 1e-6;
}

function safeInitBounds(space, ch) {
  // prefer a central "safe" sub-box to start search inside gamut-ish region
  if (ch === "h") return [0, 1];
  const defaults = {
    l: [0.05, 0.95],
    a: [0.05, 0.95],
    b: [0.05, 0.95],
    c: [0.05, 0.95],
    s: [0.05, 0.95],
  };
  if (space === "oklab" || space === "oklch") {
    if (ch === "l") return [0.05, 0.95];
    if (ch === "a" || ch === "b") return [0.05, 0.95];
    if (ch === "c") return [0.05, 0.95];
  }
  if (space === "lab" || space === "lch") {
    if (ch === "l") return [0.05, 0.95];
    if (ch === "a" || ch === "b") return [0.05, 0.95];
    if (ch === "c") return [0.05, 0.95];
  }
  if (space === "hsl") {
    if (ch === "l") return [0.05, 0.95];
    if (ch === "s") return [0.05, 0.95];
  }
  return defaults[ch] || [0.05, 0.95];
}
