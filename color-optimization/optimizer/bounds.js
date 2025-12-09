import {
  channelOrder,
  decodeColor,
  effectiveRangeFromValues,
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
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      let b;
      if (width <= 0) {
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
  if (!colors.length) return null;
  const decoded = colors.map((hex) => decodeColor(hex, colorSpace));
  const ranges = effectiveRangeFromValues(decoded, colorSpace);
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
