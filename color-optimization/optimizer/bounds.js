import {
  channelOrder,
  decodeColor,
  csRanges,
  normalizeWithRange,
} from "../core/colorSpaces.js";
import { quantiles, widthBounds } from "../core/stats.js";

export function computeBounds(normalized, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const values = (channel) => normalized.map((r) => r[channel]);
  const widths = config.widths || [];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1];
  const widthForChannel = (ch, idx) => {
    if (!widths.length) return 0;
    if (ch === channels[0]) return widths[0] ?? widths[idx] ?? widths[widths.length - 1] ?? 0;
    if (ch === scChannel) return widths[1] ?? widths[idx] ?? widths[widths.length - 1] ?? 0;
    if (ch === channels[2]) return widths[2] ?? widths[idx] ?? widths[widths.length - 1] ?? 0;
    return widths[idx] ?? widths[widths.length - 1] ?? 0;
  };
  const boundsByName = {};
  let boundsSc = [0, 1];
  let boundsL = [0, 1];
  let boundsH = null;
  if (config.constrain) {
    channels.forEach((ch, idx) => {
      const width = widthForChannel(ch, idx);
      const vals = values(ch);
      const hasVals = vals.length > 0;
      const minVal = hasVals ? Math.min(...vals) : null;
      const maxVal = hasVals ? Math.max(...vals) : null;
      let b;
      // If the user sets constraint width to 0%, treat it as "no constraint" for this channel.
      // (Using safeInitBounds here makes the dashed outline appear inset even at 0%.)
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
  return { boundsSc, boundsL, boundsH, boundsByName };
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
  const normalized = decoded.map((v) => normalizeWithRange(v, ranges, colorSpace));
  const bounds = computeBounds(normalized, colorSpace, configLike);
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
