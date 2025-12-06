import { clamp } from "./util.js";

export function quantiles(arr, probs) {
  if (!arr.length) return probs.map(() => 0);
  const sorted = [...arr].sort((a, b) => a - b);
  return probs.map((p) => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  });
}

export function widthBounds(qs, width, circular = false) {
  if (width <= 0) return [0, 1];
  const span = qs[1] - qs[0];
  const desiredSpan = span + (1 - span) * (1 - width);
  if (desiredSpan >= 1 - 1e-6) return [0, 1];
  const mean = (qs[0] + qs[1]) / 2;
  let low = mean - desiredSpan / 2;
  let high = mean + desiredSpan / 2;
  if (circular) {
    if (desiredSpan >= 1) return [0, 1];
    low = ((low % 1) + 1) % 1;
    high = ((high % 1) + 1) % 1;
    if (high < low) high += 1;
    return [low, high].map((x) => x % 1);
  }
  return [Math.max(0, low), Math.min(1, high)];
}

export function normalize(v, min, max) {
  const span = max - min;
  if (span === 0 || !isFinite(span)) return 0;
  return clamp((v - min) / span);
}

export function niceTicks(min, max, count) {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (count < 2) return [min, max];
  const span = max - min || 1;
  const rawStep = span / (count - 1);
  const step = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const err = rawStep / step;
  const niceStep =
    err < 1.5 ? step :
    err < 3   ? 2 * step :
    err < 7   ? 5 * step :
                10 * step;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += niceStep) ticks.push(v);
  return ticks;
}
